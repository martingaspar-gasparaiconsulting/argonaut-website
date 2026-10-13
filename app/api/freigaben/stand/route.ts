import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { ladeFreigabeStand } from '@/lib/freigabeServer';
import { codeStand } from '@/lib/freigabeStand';

// ============================================================================
// ARGONAUT OS · /api/freigaben/stand — Paket 346 (A0 Teil 2)
// Wirksamer Stand der Start-Schalter und Import-Sperren für die Seiten im
// Dashboard (nur ja/nein je Bereich, keine Vermerke). Ohne Anmeldung gibt es
// nur den Stand des Codes. Jeder Fehler = Stand des Codes = gesperrt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const kopf = { 'cache-control': 'no-store' };
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json(codeStand(), { headers: kopf });
    return NextResponse.json(await ladeFreigabeStand(), { headers: kopf });
  } catch {
    return NextResponse.json(codeStand(), { headers: kopf });
  }
}
