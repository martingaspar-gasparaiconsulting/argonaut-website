import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { ANKAUF_MODUL, kennungGueltig, onlineEinstellung, onlineEingabePruefen, naechsteAnkaufNr } from '@/lib/kfzAnkauf';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/kfz-ankauf — Paket 264 · K4 Teil 2
// ÖFFENTLICH. Online-Ankaufformular eines Kfz-Betriebs („Wir kaufen Ihr Auto").
//  GET  ?k=<kennung>  -> { aktiv, firma } — nur der Firmenname, sonst nichts
//  POST { k, …Felder } -> legt einen Ankauf (Quelle „online", Status „In Bewertung")
//                         im Betrieb an; Mail an den Betrieb, Bestätigung an den Verkäufer
// Der Betrieb wird NUR über die geheime Kennung aus modul_einstellung bestimmt
// (Chef schaltet das Formular in „Ankauf und Bewertung" ein) — nie vom Client.
// Ausgeschaltet oder unbekannt -> 404. Mengen-Deckel lib/drossel.ts.
// Service-Role umgeht RLS; geschrieben wird nur in kfz_ankauf dieses Betriebs.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

type Db = ReturnType<typeof admin>;

/** Betrieb zur Kennung — nur, wenn das Formular eingeschaltet ist. */
async function betriebZu(db: Db, k: string): Promise<string | null> {
  const { data } = await db.from('modul_einstellung').select('owner_user_id, einstellung')
    .eq('modul', ANKAUF_MODUL).eq('einstellung->online->>kennung', k).limit(2);
  const rows = ((data as unknown) as { owner_user_id: string; einstellung: unknown }[]) ?? [];
  if (rows.length !== 1) return null;   // nie raten, falls eine Kennung doppelt wäre
  const o = onlineEinstellung(rows[0].einstellung);
  return o.aktiv && o.kennung === k ? rows[0].owner_user_id : null;
}

async function firmaVon(db: Db, betrieb: string): Promise<{ firma: string; email: string }> {
  const { data } = await db.from('web_ci').select('firma, email').eq('owner_user_id', betrieb).maybeSingle();
  const ci = data as { firma?: string | null; email?: string | null } | null;
  return { firma: String(ci?.firma ?? '').trim(), email: String(ci?.email ?? '').trim() };
}

export async function GET(req: Request) {
  try {
    const k = (new URL(req.url).searchParams.get('k') || '').trim();
    if (!kennungGueltig(k)) return NextResponse.json({ aktiv: false }, { status: 404 });
    const db = admin();
    const betrieb = await betriebZu(db, k);
    if (!betrieb) return NextResponse.json({ aktiv: false }, { status: 404 });
    const { firma } = await firmaVon(db, betrieb);
    return NextResponse.json({ aktiv: true, firma: firma || null });
  } catch (e) {
    console.error('kfz-ankauf GET Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ aktiv: false }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    const b = body as Record<string, unknown>;
    // Spam-Falle: verstecktes Feld gefüllt -> stumm „ok", nichts speichern.
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') return NextResponse.json({ ok: true });

    const k = typeof b.k === 'string' ? b.k.trim() : '';
    if (!kennungGueltig(k)) return NextResponse.json({ error: 'Formular nicht gefunden.' }, { status: 404 });

    const pruef = onlineEingabePruefen(b, new Date().getUTCFullYear());
    if (!pruef.ok) return NextResponse.json({ error: pruef.fehler }, { status: 400 });
    const d = pruef.daten;

    const db = admin();
    const ziel = (d.verkaeufer_email as string | null) ?? (d.verkaeufer_tel as string | null);
    const zuViel = await drossel(db, 'oeffentlich/kfz-ankauf', { ip: drosselIp(req.headers), ziel: ziel ? `${k}|${ziel}` : null });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429 });

    const betrieb = await betriebZu(db, k);
    if (!betrieb) return NextResponse.json({ error: 'Dieses Formular nimmt gerade keine Anfragen an.' }, { status: 404 });

    // Nummer A-0001 … wie im Dashboard; bei Kollision einmal neu versuchen.
    let gespeichert = false;
    let nr = '';
    for (let versuch = 0; versuch < 2 && !gespeichert; versuch++) {
      const { data: nrs } = await db.from('kfz_ankauf').select('nr').eq('owner_user_id', betrieb);
      nr = naechsteAnkaufNr((((nrs as unknown) as { nr: string | null }[]) ?? []).map((x) => x.nr));
      const { error } = await db.from('kfz_ankauf').insert({ ...d, owner_user_id: betrieb, nr, bewertet_von: null });
      if (!error) gespeichert = true;
      else if (versuch === 1) {
        console.error('kfz-ankauf Speichern fehlgeschlagen:', error.message);
        return NextResponse.json({ error: 'Ihre Anfrage konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.' }, { status: 500 });
      }
    }

    const { firma, email: betriebMail } = await firmaVon(db, betrieb);
    const fahrzeug = [d.marke, d.modell, d.variante].filter(Boolean).join(' ');

    // 1) Benachrichtigung an den Betrieb (best effort — der Ankauf liegt schon sicher).
    if (betriebMail) {
      const zeilen: [string, unknown][] = [
        ['Nummer', nr], ['Fahrzeug', fahrzeug], ['Kilometer', typeof d.km_stand === 'number' ? `${d.km_stand.toLocaleString('de-DE')} km` : null],
        ['Name', d.verkaeufer_name], ['E-Mail', d.verkaeufer_email], ['Telefon', d.verkaeufer_tel], ['Notiz', d.notiz],
      ];
      const tab = zeilen.filter(([, v]) => v).map(([k2, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7688;vertical-align:top;white-space:nowrap;">${escapeHtml(k2)}</td><td style="padding:4px 0;color:#1a2332;font-weight:600;">${escapeHtml(String(v)).replace(/\n/g, '<br>')}</td></tr>`).join('');
      const html = mailLayout('Neues Fahrzeug zum Ankauf angeboten',
        `<p style="margin:0 0 14px;">Über Ihr Online-Ankaufformular wurde ein Fahrzeug angeboten. Es liegt unter „Ankauf und Bewertung" mit dem Status „In Bewertung".</p>
         <table style="border-collapse:collapse;font-size:14px;">${tab}</table>
         <p style="margin:16px 0 0;color:#6b7688;font-size:13px;">Auf diese E-Mail antworten geht direkt an den Verkäufer.</p>`);
      const r = await sendeMail({ an: betriebMail, betreff: `Ankauf-Anfrage ${nr}: ${fahrzeug}`, html, betriebId: betrieb, ...(d.verkaeufer_email ? { antwortAn: d.verkaeufer_email as string } : {}) });
      if (!r.ok) console.error('kfz-ankauf Betriebs-Mail fehlgeschlagen:', r.fehler);
    }

    // 2) Bestätigung an den Verkäufer (best effort, nur Eingangsbestätigung, keine Werbung).
    if (d.verkaeufer_email) {
      const vorname = String(d.verkaeufer_name ?? '').split(' ')[0];
      const html = mailLayout('Ihr Fahrzeug-Angebot ist eingegangen',
        `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
         <p style="margin:0 0 14px;">vielen Dank für Ihr Angebot (${escapeHtml(fahrzeug)})${firma ? ' an ' + escapeHtml(firma) : ''}. Wir prüfen Ihre Angaben und melden uns bei Ihnen. Ein verbindliches Angebot erhalten Sie erst nach der Besichtigung des Fahrzeugs.</p>
         <p style="margin:16px 0 0;">Beste Grüße${firma ? '<br>' + escapeHtml(firma) : ''}</p>`);
      try {
        const r = await sendeMail({ an: d.verkaeufer_email as string, betreff: `Ihr Fahrzeug-Angebot${firma ? ' bei ' + firma : ''}`, html, betriebId: betrieb, ...(firma ? { absenderName: firma } : {}), ...(betriebMail ? { antwortAn: betriebMail } : {}) });
        if (!r.ok) console.error('kfz-ankauf Bestätigung fehlgeschlagen:', r.fehler);
      } catch (e) { console.error('kfz-ankauf Bestätigung Fehler:', e instanceof Error ? e.message : 'unbekannt'); }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('kfz-ankauf Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
