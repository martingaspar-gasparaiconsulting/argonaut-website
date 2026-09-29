import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/ereignis — Nachweis „eingerichtet"/„entfernt" (Paket 164)
//
// Die Seite meldet, was sie beim Anmelde-Dienst getan hat. Geschrieben wird nur,
// was zum echten Stand passt (Faktor da + aal2 = eingerichtet; kein Faktor =
// entfernt) — nie für fremde Kennungen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { art?: string };
  const stand = await zweiFaktorStand(supabase, user, false);
  const faktor = stand.hatFaktor;
  const passt = (body.art === 'eingerichtet' && faktor && stand.aal === 'aal2')
    || (body.art === 'entfernt' && !faktor);
  if (!passt) return NextResponse.json({ ok: false, error: 'Stand passt nicht.' }, { status: 400 });
  await createAdminClient().from('zwei_faktor_ereignisse').insert({ user_id: user.id, art: body.art });
  return NextResponse.json({ ok: true });
}
