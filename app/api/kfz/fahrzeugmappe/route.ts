import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { MAPPE_BUCKET, istUuid, pruefungSauber, tokenGueltig } from '@/lib/fahrzeugMappe';
import { antwortPruefen, nachrichtInhalt } from '@/lib/fahrzeugMappeAntwort';
import { aktiveAnkaufKennung, firmaKurz, mappeLink } from '@/lib/fahrzeugMappeServer';
import { basisAdresse } from '@/lib/kfzBoerseLaden';
import { entschluessele } from '@/lib/crypto';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { mappeIdAusPfad } from '@/lib/fahrzeugMappeBestand';

// ============================================================================
// ARGONAUT OS · /api/kfz/fahrzeugmappe — Paket 305 · FM1 (Händler-Seite)
//
// NUR MIT LOGIN. Die Dateien der Fahrzeugmappe liegen im privaten Ordner
// „fahrzeugmappe" ohne Nutzer-Regeln. Ob jemand die Mappe zu einem Ankauf sehen
// darf, entscheidet die DATENBANK (Regeln p305: Geschäftsleitung, Mitarbeiter
// mit Recht „KFZ") — gelesen wird mit dem Login der Person. Erst danach
// signiert der Server die Ansichts-Links (1 Stunde).
//   GET    ?ankauf=<id>  -> { mappe, dateien[] } oder { mappe: null }
//   POST   { ankauf, art … } -> Antwort an den Verkäufer (Paket 306)
//   DELETE ?ankauf=<id>  -> Mappe samt Dateien löschen (nur Geschäftsleitung,
//                           Regel p305_chef_delete) — vor „Ankauf löschen"
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

type MappeRoh = { id: string; status: string; wunsch: string | null; eingereicht_am: string | null; einwilligung_am: string | null; einwilligung_fassung: string | null; nachreichen_bis: string | null };
type DateiRoh = { id: string; fach: string; art: string; pfad: string; mime: string; bytes: number | null; dateiname: string | null; beschreibung: string | null; pruefung: unknown; erstellt_am: string };

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const ankauf = new URL(req.url).searchParams.get('ankauf');
    if (!istUuid(ankauf)) return KEIN(400, 'Ungültiger Ankauf.');
    const { data: m, error } = await supabase.from('kfz_mappe')
      .select('id, status, wunsch, eingereicht_am, einwilligung_am, einwilligung_fassung, nachreichen_bis').eq('ankauf_id', ankauf).maybeSingle();
    if (error) return NextResponse.json({ mappe: null, fehlt: true }, { headers: { 'Cache-Control': 'no-store' } });
    const mappe = m as MappeRoh | null;
    if (!mappe) return NextResponse.json({ mappe: null }, { headers: { 'Cache-Control': 'no-store' } });
    const { data: d } = await supabase.from('kfz_mappe_datei')
      .select('id, fach, art, pfad, mime, bytes, dateiname, beschreibung, pruefung, erstellt_am')
      .eq('mappe_id', mappe.id).eq('status', 'fertig').order('erstellt_am', { ascending: true }).limit(100);
    const dateien = ((d as unknown) as DateiRoh[]) ?? [];
    const links: Record<string, string> = {};
    if (dateien.length) {
      const { data: s } = await createAdminClient().storage.from(MAPPE_BUCKET).createSignedUrls(dateien.map((x) => x.pfad), 3600);
      for (const z of ((s as unknown) as { path: string | null; signedUrl: string | null }[]) ?? []) if (z.path && z.signedUrl) links[z.path] = z.signedUrl;
    }
    // Paket 306: Verlauf und Fahrzeughistorie (beides mit Login gelesen — Regeln der Datenbank)
    const [{ data: v }, { data: an }] = await Promise.all([
      supabase.from('kfz_mappe_nachricht').select('id, von, art, text, betrag, gueltig_bis, termin, erstellt_am')
        .eq('mappe_id', mappe.id).order('erstellt_am', { ascending: true }).limit(200),
      supabase.from('kfz_ankauf').select('fin, verkaeufer_email, historie_url, historie_anbieter, historie_am, historie_befund, bestand_id').eq('id', ankauf).maybeSingle(),
    ]);
    const a = an as { fin: string | null; verkaeufer_email: string | null; historie_url: string | null; historie_anbieter: string | null; historie_am: string | null; historie_befund: unknown; bestand_id: string | null } | null;
    // Paket 307: welche Mappen-Dateien liegen schon in den Medien des Bestandsfahrzeugs?
    let uebernommen: string[] = [];
    if (a?.bestand_id) {
      const { data: med } = await supabase.from('kfz_bestand_medien').select('pfad').eq('bestand_id', a.bestand_id).limit(500);
      uebernommen = (((med as unknown) as { pfad: string }[]) ?? []).map((x) => mappeIdAusPfad(x.pfad)).filter((x): x is string => !!x);
    }
    return NextResponse.json({
      mappe,
      verlauf: v ?? [],
      ankauf: a ? { fin: a.fin, hat_email: !!a.verkaeufer_email, historie_url: a.historie_url, historie_anbieter: a.historie_anbieter, historie_am: a.historie_am, historie_befund: a.historie_befund ?? {}, bestand_id: a.bestand_id } : null,
      uebernommen,
      dateien: dateien.map((x) => ({
        id: x.id, fach: x.fach, art: x.art, mime: x.mime, bytes: x.bytes, dateiname: x.dateiname, beschreibung: x.beschreibung,
        pruefung: pruefungSauber(x.pruefung), erstellt_am: x.erstellt_am, url: links[x.pfad] ?? null,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('kfz/fahrzeugmappe GET:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Fahrzeugmappe konnte nicht geladen werden.');
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const ankauf = new URL(req.url).searchParams.get('ankauf');
    if (!istUuid(ankauf)) return KEIN(400, 'Ungültiger Ankauf.');
    const { data: m, error } = await supabase.from('kfz_mappe').select('id').eq('ankauf_id', ankauf).maybeSingle();
    if (error || !m) return NextResponse.json({ ok: true, geloescht: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    const mappeId = (m as { id: string }).id;
    const { data: d } = await supabase.from('kfz_mappe_datei').select('pfad').eq('mappe_id', mappeId).limit(200);
    const pfade = (((d as unknown) as { pfad: string }[]) ?? []).map((x) => x.pfad);
    // Erst prüfen, ob die Person löschen DARF (Regel p305_chef_delete) — sonst bleiben die Dateien liegen.
    const { data: weg, error: delErr } = await supabase.from('kfz_mappe').delete().eq('id', mappeId).select('id');
    if (delErr || !weg || (weg as unknown[]).length !== 1) return KEIN(403, 'Löschen darf nur die Geschäftsleitung.');
    if (pfade.length) {
      const { error: sErr } = await createAdminClient().storage.from(MAPPE_BUCKET).remove(pfade);
      if (sErr) console.error('kfz/fahrzeugmappe Dateien löschen:', sErr.message);
    }
    return NextResponse.json({ ok: true, geloescht: pfade.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('kfz/fahrzeugmappe DELETE:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Fahrzeugmappe konnte nicht gelöscht werden.');
  }
}

// --- Paket 306 (FM2): Händler antwortet ------------------------------------------------------
// POST { ankauf, art, text?, betrag?, gueltig_bis?, tag?, uhr? }
// Eintrag mit dem Login der Person (Regeln p306: Chef oder Mitarbeiter mit Schreibrecht KFZ;
// die Datenbank zieht Ankauf-Status, Angebot und Nachreichen-Frist nach). Danach E-Mail an den
// Verkäufer im Look des Autohauses mit Knopf zu seiner Mappe (Schlüssel nur mit Server-Schlüssel lesbar).
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || !istUuid(b.ankauf)) return KEIN(400, 'Ungültiger Ankauf.');
    const jetzt = new Date();
    const p = antwortPruefen(b, berlinHeute(jetzt), jetzt.getTime());
    if (!p.ok) return KEIN(400, p.fehler);
    const { data: m } = await supabase.from('kfz_mappe').select('id, owner_user_id, status').eq('ankauf_id', b.ankauf).maybeSingle();
    const mappe = m as { id: string; owner_user_id: string; status: string } | null;
    if (!mappe) return KEIN(404, 'Zu diesem Ankauf gibt es keine Fahrzeugmappe.');
    if (mappe.status !== 'eingereicht') return KEIN(409, 'Die Mappe ist nicht (mehr) eingereicht.');
    const { error } = await supabase.from('kfz_mappe_nachricht').insert({
      owner_user_id: mappe.owner_user_id, mappe_id: mappe.id, von: 'haendler', art: p.daten.art, text: p.daten.text,
      betrag: p.daten.betrag, gueltig_bis: p.daten.gueltig_bis, termin: p.daten.termin,
    });
    if (error) {
      console.error('kfz/fahrzeugmappe antwort:', error.message);
      return KEIN(403, /row-level|permission/i.test(error.message) ? 'Antworten dürfen die Geschäftsleitung und Mitarbeiter mit Schreibrecht „KFZ“.' : 'Die Antwort konnte nicht gespeichert werden.');
    }

    // E-Mail an den Verkäufer (best effort — die Antwort steht schon im Verlauf)
    let mail = false;
    try {
      const admin = createAdminClient();
      const [{ data: an }, { data: mt }] = await Promise.all([
        supabase.from('kfz_ankauf').select('verkaeufer_name, verkaeufer_email, marke, modell, nr').eq('id', b.ankauf).maybeSingle(),
        admin.from('kfz_mappe').select('token_verschluesselt').eq('id', mappe.id).eq('owner_user_id', mappe.owner_user_id).maybeSingle(),
      ]);
      const a = an as { verkaeufer_name: string | null; verkaeufer_email: string | null; marke: string | null; modell: string | null; nr: string | null } | null;
      if (a?.verkaeufer_email) {
        const fk = await firmaKurz(admin, mappe.owner_user_id);
        const kennung = await aktiveAnkaufKennung(mappe.owner_user_id, admin);
        let link: string | null = null;
        const roh = (mt as { token_verschluesselt?: string | null } | null)?.token_verschluesselt;
        if (roh && kennung) { try { const t = entschluessele(roh); if (tokenGueltig(t)) link = mappeLink(basisAdresse(), kennung, t); } catch { link = null; } }
        const inhalt = nachrichtInhalt(p.daten, fk.firma);
        const vorname = String(a.verkaeufer_name ?? '').split(' ')[0];
        const html = kundenMailLayout(fk.firma || 'Ihr Autohaus', fk.akzent, inhalt.titel,
          `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>`
          + inhalt.zeilen.map((z) => `<p style="margin:0 0 14px;">${escapeHtml(z).replace(/\n/g, '<br>')}</p>`).join('')
          + (link ? `<p style="margin:18px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:${fk.akzent};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">${p.daten.art === 'rueckfrage' ? 'Mappe ergänzen' : p.daten.art === 'einladung' ? 'Termin bestätigen' : 'Ihre Fahrzeugmappe öffnen'}</a></p>` : '<p style="margin:0 0 14px;">Antworten Sie gern direkt auf diese E-Mail.</p>')
          + `<p style="margin:0;color:#6b7688;font-size:13px;">${escapeHtml([a.nr, [a.marke, a.modell].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</p>`);
        const r = await sendeMail({ an: a.verkaeufer_email, betreff: `${inhalt.titel}${fk.firma ? ' · ' + fk.firma : ''}`, html, betriebId: mappe.owner_user_id, ...(fk.firma ? { absenderName: fk.firma } : {}), ...(fk.email ? { antwortAn: fk.email } : {}) });
        mail = r.ok;
        if (!r.ok) console.error('kfz/fahrzeugmappe Mail:', r.fehler);
      }
    } catch (e) { console.error('kfz/fahrzeugmappe Mail Fehler:', e instanceof Error ? e.message : 'unbekannt'); }
    return NextResponse.json({ ok: true, mail }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('kfz/fahrzeugmappe POST:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Antwort konnte nicht gespeichert werden.');
  }
}

function berlinHeute(d: Date): string {
  return d.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 10);
}
