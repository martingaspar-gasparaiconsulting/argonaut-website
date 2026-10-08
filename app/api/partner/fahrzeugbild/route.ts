import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { MEDIEN_BUCKET } from '@/lib/kfzMedien';
import { istUuid } from '@/lib/partnerNetzwerk';

// ============================================================================
// ARGONAUT OS · /api/partner/fahrzeugbild — Paket 278 · K18 Partner-Netzwerk
//
// NUR MIT LOGIN. Der Partner sieht ein Fahrzeugfoto des Auftraggebers nur,
// wenn der Auftraggeber „Fotos freigeben" angehakt hat, der Auftrag läuft und
// die Verbindung besteht. Das prüft die Datenbank mit dem Login der Person
// (rpc p278_fahrzeugfoto_pfad) — erst dann signiert der Server (5 Minuten).
// GET ?a=<auftrag>&m=<foto-id>
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status = 404) => new NextResponse(status === 401 ? 'Nicht eingeloggt' : 'Nicht gefunden', { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const a = (u.searchParams.get('a') || '').trim();
    const m = (u.searchParams.get('m') || '').trim();
    if (!istUuid(a) || !istUuid(m)) return KEIN();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401);
    const { data: pfad } = await supabase.rpc('p278_fahrzeugfoto_pfad', { p_auftrag: a, p_medium: m });
    if (typeof pfad !== 'string' || !pfad) return KEIN();
    const { data: sig } = await createAdminClient().storage.from(MEDIEN_BUCKET).createSignedUrl(pfad, 300);
    if (!sig?.signedUrl) return KEIN();
    return NextResponse.redirect(sig.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('partner/fahrzeugbild:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN();
  }
}
