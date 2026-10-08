import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { ABLAGE_BUCKET, istUuid } from '@/lib/partnerNetzwerk';
import { DATEI_MIME, RECHNUNG_MAX_BYTES, dateiArt, rechnungPfad, rechnungPruefen } from '@/lib/partnerRechnung';

// ============================================================================
// ARGONAUT OS · /api/partner/rechnung — Paket 279 · K18b Partner-Rechnung
//
// NUR MIT LOGIN.
// POST (form-data: auftrag, datei, nummer, datum, netto, satz) — der PARTNER-Betrieb
//   reicht seine Rechnung ein. Ob er darf und in welchen Ordner, entscheidet die
//   Datenbank (rpc p279_rechnung_ziel: Partner-Seite, Schreibrecht, Auftrag
//   angenommen/fertig oder höchstens 30 Tage beendet). Dateiart aus den Bytes
//   (PDF/JPEG/PNG/WebP), höchstens 4 MB. Danach rpc p279_rechnung_einreichen
//   (rechnet USt und Brutto selbst, prüft Pfad und doppelte Nummer).
// GET ?r=<rechnung> — der AUFTRAGGEBER sieht die Datei (rpc p279_rechnung_pfad),
//   signierter Link 5 Minuten.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status = 404, text = 'Nicht gefunden') => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Nicht eingeloggt.');
    const form = await req.formData().catch(() => null);
    const auftrag = String(form?.get('auftrag') || '').trim();
    const datei = form?.get('datei');
    if (!istUuid(auftrag)) return KEIN(400, 'Kein gültiger Auftrag.');
    const p = rechnungPruefen({ nummer: form?.get('nummer'), datum: form?.get('datum'), netto: form?.get('netto'), satz: form?.get('satz') }, new Date().toISOString().slice(0, 10));
    if (!p.ok) return KEIN(400, p.fehler);
    if (!datei || typeof datei === 'string') return KEIN(400, 'Bitte die Rechnung als PDF oder Foto anhängen.');
    if (datei.size > RECHNUNG_MAX_BYTES) return KEIN(413, 'Die Datei ist zu groß (höchstens 4 MB).');
    const bytes = new Uint8Array(await datei.arrayBuffer());
    const art = dateiArt(bytes);
    if (!art) return KEIN(415, 'Nur PDF, JPEG, PNG oder WebP.');

    const { data: ziel, error } = await supabase.rpc('p279_rechnung_ziel', { p_auftrag: auftrag });
    if (error) return KEIN(500, 'Die Partner-Rechnung ist noch nicht eingerichtet (SQL Paket 279 fehlt).');
    const pfad = rechnungPfad(ziel, crypto.randomUUID(), art);
    if (!pfad) return KEIN(403, 'Zu diesem Auftrag können Sie (noch / nicht mehr) keine Rechnung einreichen.');

    const { error: upErr } = await createAdminClient().storage.from(ABLAGE_BUCKET).upload(pfad, bytes, { contentType: DATEI_MIME[art], upsert: false });
    if (upErr) {
      console.error('partner/rechnung Hochladen:', upErr.message);
      return KEIN(500, 'Die Rechnung konnte nicht gespeichert werden.');
    }
    const f = p.felder;
    const { data: id, error: rErr } = await supabase.rpc('p279_rechnung_einreichen', {
      p_auftrag: auftrag, p_nr: f.nummer, p_datum: f.datum, p_netto: f.netto, p_satz: f.satz, p_pfad: pfad,
    });
    if (rErr) return KEIN(400, String(rErr.message || 'Die Rechnung wurde nicht angenommen.').slice(0, 300));
    return NextResponse.json({ id, brutto: f.brutto }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('partner/rechnung Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Rechnung konnte nicht gespeichert werden.');
  }
}

export async function GET(req: Request) {
  try {
    const r = (new URL(req.url).searchParams.get('r') || '').trim();
    if (!istUuid(r)) return KEIN();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Nicht eingeloggt.');
    const { data: pfad } = await supabase.rpc('p279_rechnung_pfad', { p_rechnung: r });
    if (typeof pfad !== 'string' || !pfad) return KEIN();
    const { data: sig } = await createAdminClient().storage.from(ABLAGE_BUCKET).createSignedUrl(pfad, 300);
    if (!sig?.signedUrl) return KEIN();
    return NextResponse.redirect(sig.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('partner/rechnung Abruf:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN();
  }
}
