import { NextResponse } from 'next/server';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { kennungGueltig, naechsteAnkaufNr, onlineEingabePruefen } from '@/lib/kfzAnkauf';
import {
  EINWILLIGUNG_FASSUNG, angabenBereinigen, notizZusatz, tokenGueltig, vollstaendigkeit, wunschText, zusammenfassung,
} from '@/lib/fahrzeugMappe';
import { betriebZuKennung, dateienDerMappe, mappeDb, mappeZuToken } from '@/lib/fahrzeugMappeServer';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/fahrzeugmappe/absenden — Paket 305 · FM1
//
// ÖFFENTLICH, nur mit dem Link-Schlüssel des Verkäufers. Schickt die Mappe an
// GENAU den einen Betrieb: prüft Pflichtfächer (Fahrzeugschein, 8 Fotos,
// Kaltstart-Video) und Angaben (wie das Online-Formular aus Paket 264), legt
// den Ankauf „In Bewertung" (Woher: Online-Formular) an, verknüpft die Mappe,
// merkt Zeitpunkt und Fassung der Einwilligung. Danach: Glocke + E-Mail an den
// Betrieb, Eingangsbestätigung an den Verkäufer (keine Werbung).
// Deckel je Absender und je Verkäufer-Adresse (lib/drossel.ts).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

async function firmaVon(db: ReturnType<typeof mappeDb>, betrieb: string): Promise<{ firma: string; email: string }> {
  const [ci, pr] = await Promise.all([
    db.from('web_ci').select('firma, email').eq('owner_user_id', betrieb).maybeSingle(),
    db.from('profiles').select('firma_name, firma_email').eq('id', betrieb).maybeSingle(),
  ]);
  const c = ci.data as { firma?: string | null; email?: string | null } | null;
  const p = pr.data as { firma_name?: string | null; firma_email?: string | null } | null;
  return {
    firma: String(c?.firma ?? '').trim() || String(p?.firma_name ?? '').trim(),
    email: String(c?.email ?? '').trim() || String(p?.firma_email ?? '').trim(),
  };
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return KEIN(400, 'Ungültige Anfrage.');
    // Spam-Falle: verstecktes Feld gefüllt -> stumm „ok", nichts speichern.
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') return NextResponse.json({ ok: true });
    const k = typeof b.k === 'string' ? b.k.trim() : '';
    if (!kennungGueltig(k) || !tokenGueltig(b.token)) return KEIN(404, 'Diese Mappe gibt es nicht.');
    if (b.einwilligung !== true) return KEIN(400, 'Bitte bestätigen Sie die Einwilligung.');

    const angaben = angabenBereinigen(b.angaben);
    const pruef = onlineEingabePruefen({ ...angaben, datenschutz: true }, new Date().getUTCFullYear());
    if (!pruef.ok) return KEIN(400, pruef.fehler);
    const d = pruef.daten;

    const db = mappeDb();
    const ziel = (d.verkaeufer_email as string | null) ?? (d.verkaeufer_tel as string | null);
    const zuViel = await drossel(db, 'oeffentlich/fahrzeugmappe/absenden', { ip: drosselIp(req.headers), ziel: ziel ? `${k}|${ziel}` : null });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429, headers: { 'Cache-Control': 'no-store' } });

    const betrieb = await betriebZuKennung(db, k);
    if (!betrieb) return KEIN(404, 'Das Autohaus nimmt gerade keine Fahrzeugmappen an.');
    const mappe = await mappeZuToken(db, betrieb, b.token);
    if (!mappe) return KEIN(404, 'Diese Mappe gibt es nicht (mehr).');
    if (mappe.status !== 'entwurf') return KEIN(409, 'Diese Mappe ist schon beim Autohaus.');

    const dateien = (await dateienDerMappe(db, mappe.id, betrieb)).filter((x) => x.status === 'fertig');
    const voll = vollstaendigkeit(dateien);
    if (voll.fehlend.length) return KEIN(400, `Es fehlt noch: ${voll.fehlend.map((f) => f.titel).join(', ')}.`);

    const wunsch = angaben.wunsch === 'inzahlungnahme' ? 'inzahlungnahme' : 'verkauf';
    const summe = zusammenfassung(dateien);
    const notiz = [notizZusatz(wunsch, summe), d.notiz as string | null].filter(Boolean).join('\n');

    // Ankauf anlegen: Nummer A-0001 … wie im Dashboard; bei Kollision einmal neu versuchen.
    let ankaufId: string | null = null;
    let nr = '';
    for (let versuch = 0; versuch < 2 && !ankaufId; versuch++) {
      const { data: nrs } = await db.from('kfz_ankauf').select('nr').eq('owner_user_id', betrieb);
      nr = naechsteAnkaufNr((((nrs as unknown) as { nr: string | null }[]) ?? []).map((x) => x.nr));
      const { data: neu, error } = await db.from('kfz_ankauf').insert({ ...d, notiz, owner_user_id: betrieb, nr, bewertet_von: null }).select('id').single();
      if (!error && neu) ankaufId = (neu as { id: string }).id;
      else if (versuch === 1) {
        console.error('fahrzeugmappe absenden Ankauf:', error?.message);
        return KEIN(500, 'Ihre Mappe konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.');
      }
    }

    const jetzt = new Date().toISOString();
    const { error: mErr } = await db.from('kfz_mappe').update({
      status: 'eingereicht', ankauf_id: ankaufId, eingereicht_am: jetzt, einwilligung_am: jetzt,
      einwilligung_fassung: EINWILLIGUNG_FASSUNG, angaben, wunsch,
    }).eq('id', mappe.id).eq('status', 'entwurf');
    if (mErr) {
      // Ankauf wieder weg, damit nichts halb dasteht; der Verkäufer kann es erneut versuchen.
      await db.from('kfz_ankauf').delete().eq('id', ankaufId as string).eq('owner_user_id', betrieb);
      console.error('fahrzeugmappe absenden Mappe:', mErr.message);
      return KEIN(500, 'Ihre Mappe konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.');
    }

    const { firma, email: betriebMail } = await firmaVon(db, betrieb);
    const fahrzeug = [d.marke, d.modell, d.variante].filter(Boolean).join(' ');

    // Glocke im Dashboard (Zugabe — der Ankauf liegt schon sicher).
    try {
      await db.rpc('benachrichtigung_erstellen', {
        p_owner: betrieb, p_typ: 'kfz_fahrzeugmappe', p_titel: `Neue Fahrzeugmappe ${nr}`,
        p_nachricht: `${fahrzeug}${wunsch === 'inzahlungnahme' ? ' · Inzahlungnahme' : ''}`,
        p_link: `/dashboard/kfz/ankauf/${ankaufId}`, p_ref_tabelle: 'kfz_ankauf', p_ref_id: ankaufId, p_dedup_stunden: 1,
      });
    } catch { /* Glocke ist Zugabe */ }

    // E-Mail an den Betrieb (best effort).
    if (betriebMail) {
      const zeilen: [string, unknown][] = [
        ['Nummer', nr], ['Wunsch', wunschText(wunsch)], ['Fahrzeug', fahrzeug],
        ['Kilometer', typeof d.km_stand === 'number' ? `${d.km_stand.toLocaleString('de-DE')} km` : null],
        ['Mappe', `${summe.fotos} Fotos, ${summe.schaeden} Schäden, ${summe.videos} Videos, ${summe.unterlagen} Unterlagen`],
        ['Name', d.verkaeufer_name], ['E-Mail', d.verkaeufer_email], ['Telefon', d.verkaeufer_tel],
      ];
      const tab = zeilen.filter(([, v]) => v).map(([k2, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(k2)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(v))}</td></tr>`).join('');
      const html = mailLayout('Neue Fahrzeugmappe eingegangen',
        `<p style="margin:0 0 14px;">Über Ihre Fahrzeugmappe wurde ein Fahrzeug mit Fotos, Video und Unterlagen angeboten. Sie finden alles unter „Ankauf und Bewertung" in der Akte ${escapeHtml(nr)}.</p>
         <table style="border-collapse:collapse;font-size:14px;">${tab}</table>
         <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Auf diese E-Mail antworten geht direkt an den Verkäufer.</p>`);
      const r = await sendeMail({ an: betriebMail, betreff: `Fahrzeugmappe ${nr}: ${fahrzeug}`, html, betriebId: betrieb, ...(d.verkaeufer_email ? { antwortAn: d.verkaeufer_email as string } : {}) });
      if (!r.ok) console.error('fahrzeugmappe Betriebs-Mail fehlgeschlagen:', r.fehler);
    }

    // Eingangsbestätigung an den Verkäufer (best effort, keine Werbung).
    if (d.verkaeufer_email) {
      const vorname = String(d.verkaeufer_name ?? '').split(' ')[0];
      const html = mailLayout('Ihre Fahrzeugmappe ist angekommen',
        `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
         <p style="margin:0 0 14px;">vielen Dank für Ihre Fahrzeugmappe (${escapeHtml(fahrzeug)})${firma ? ' an ' + escapeHtml(firma) : ''}. Wir sehen uns Fotos, Video und Unterlagen an und melden uns bei Ihnen. Ein verbindliches Angebot erhalten Sie erst nach der Besichtigung des Fahrzeugs.</p>
         <p style="margin:0 0 14px;">Ihre Nummer: <b>${escapeHtml(nr)}</b></p>
         <p style="margin:16px 0 0;">Beste Grüße${firma ? '<br>' + escapeHtml(firma) : ''}</p>`);
      try {
        const r = await sendeMail({ an: d.verkaeufer_email as string, betreff: `Ihre Fahrzeugmappe${firma ? ' bei ' + firma : ''}`, html, betriebId: betrieb, ...(firma ? { absenderName: firma } : {}), ...(betriebMail ? { antwortAn: betriebMail } : {}) });
        if (!r.ok) console.error('fahrzeugmappe Bestätigung fehlgeschlagen:', r.fehler);
      } catch (e) { console.error('fahrzeugmappe Bestätigung Fehler:', e instanceof Error ? e.message : 'unbekannt'); }
    }

    return NextResponse.json({ ok: true, nr }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('fahrzeugmappe/absenden Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
