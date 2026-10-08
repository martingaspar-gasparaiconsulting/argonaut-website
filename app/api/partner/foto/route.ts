import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { ABLAGE_BUCKET, FOTO_MAX_BYTES, MIME, ablagePfad, bildArt, istUuid } from '@/lib/partnerNetzwerk';

// ============================================================================
// ARGONAUT OS · /api/partner/foto — Paket 278 · K18 Partner-Netzwerk
//
// NUR MIT LOGIN. Fotos zu Einträgen im Partner-Auftrag liegen im privaten
// Ordner „partner-ablage", der KEINE Regeln für Nutzer hat — niemand kann dort
// selbst lesen, schreiben oder löschen. Dieser Server ist die einzige Tür:
//
// POST (form-data: auftrag, datei) — hochladen. Ob die Person schreiben darf und
//   in welchen Ordner, entscheidet die Datenbank (rpc p278_ablage_ziel, mit dem
//   Login der Person). Bildart aus den ersten Bytes (JPEG/PNG/WebP), höchstens 4 MB.
//   Antwort: { pfad } — danach rpc p278_eintrag mit diesem Pfad.
// GET ?e=<eintrag>&i=<nr> — ansehen. Die Datenbank (rpc p278_foto_pfad) prüft:
//   Auftraggeber immer, Partner nur solange der Auftrag läuft. Dann signierter
//   Link (5 Minuten) per Weiterleitung.
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
    if (!datei || typeof datei === 'string') return KEIN(400, 'Keine Datei übergeben.');
    if (datei.size > FOTO_MAX_BYTES) return KEIN(413, 'Das Foto ist zu groß (höchstens 4 MB).');
    const bytes = new Uint8Array(await datei.arrayBuffer());
    const art = bildArt(bytes);
    if (!art) return KEIN(415, 'Nur Fotos (JPEG, PNG oder WebP).');

    const { data: ziel, error } = await supabase.rpc('p278_ablage_ziel', { p_auftrag: auftrag });
    if (error) return KEIN(500, 'Das Partner-Netzwerk ist noch nicht eingerichtet (SQL Paket 278 fehlt).');
    const pfad = ablagePfad(ziel, crypto.randomUUID(), art);
    if (!pfad) return KEIN(403, 'Zu diesem Auftrag können Sie (nicht mehr) Fotos hochladen.');

    const admin = createAdminClient();
    const { error: upErr } = await admin.storage.from(ABLAGE_BUCKET).upload(pfad, bytes, { contentType: MIME[art], upsert: false });
    if (upErr) {
      console.error('partner/foto Hochladen:', upErr.message);
      return KEIN(500, 'Das Foto konnte nicht gespeichert werden.');
    }
    return NextResponse.json({ pfad }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('partner/foto Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Das Foto konnte nicht gespeichert werden.');
  }
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const e = (u.searchParams.get('e') || '').trim();
    const i = Number(u.searchParams.get('i') || '');
    if (!istUuid(e) || !Number.isInteger(i) || i < 1 || i > 10) return KEIN();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Nicht eingeloggt.');
    const { data: pfad } = await supabase.rpc('p278_foto_pfad', { p_eintrag: e, p_nr: i });
    if (typeof pfad !== 'string' || !pfad) return KEIN();
    const { data: sig } = await createAdminClient().storage.from(ABLAGE_BUCKET).createSignedUrl(pfad, 300);
    if (!sig?.signedUrl) return KEIN();
    return NextResponse.redirect(sig.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('partner/foto Abruf:', err instanceof Error ? err.message : 'unbekannt');
    return KEIN();
  }
}
