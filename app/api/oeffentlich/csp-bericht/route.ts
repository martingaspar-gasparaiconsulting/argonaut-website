import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { drossel, drosselIp } from '@/lib/drossel';
import { cspMeldungenLesen } from '@/lib/sicherheitsKopfzeilen';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/csp-bericht  (Paket 187b)
//
// Nimmt die Meldungen der Content-Security-Policy im Beobachtungsmodus an
// (lib/sicherheitsKopfzeilen.cspBeobachtungRegel). Schreibt nichts in die
// Datenbank — nur eine kurze Zeile ins Server-Protokoll: Regel, Ursprung des
// blockierten Inhalts, Seitenpfad (ohne ?…, also nie ein Anmelde-Token).
// Offene Tür (Browser melden ohne Login), mit Mengen-Deckel je IP.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const zuViel = await drossel(admin(), 'oeffentlich/csp-bericht', { ip: drosselIp(req.headers) });
  if (zuViel) return NextResponse.json({ ok: false }, { status: 429 });
  let text = '';
  try { text = await req.text(); } catch { text = ''; }
  for (const m of cspMeldungenLesen(text)) {
    console.warn(`[csp] ${m.regel} blockiert=${m.blockiert || '-'} seite=${m.seite || '-'}`);
  }
  return new NextResponse(null, { status: 204 });
}
