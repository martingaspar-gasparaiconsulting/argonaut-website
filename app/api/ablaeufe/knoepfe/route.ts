import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { knopfModul, type Ablauf } from '@/lib/ablauf';
import { laufbereit } from '@/lib/ablaufMotor';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/knoepfe?modul= — Knöpfe einer Modulseite (Paket 168)
//
// Liefert die eingeschalteten Knopf-Abläufe DES ANGEMELDETEN Chefs für ein
// Modul. Mitarbeiter bekommen eine leere Liste (Abläufe starten nur durch die
// Geschäftsleitung). Nur Name und Kennung — keine Schritte.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const modul = new URL(req.url).searchParams.get('modul') ?? '';
  if (!knopfModul(modul)) return NextResponse.json({ ok: true, knoepfe: [] });
  const { data } = await supabase.from('ablaeufe').select('*')
    .eq('owner_user_id', user.id).eq('aktiv', true).limit(200);
  const knoepfe = ((data ?? []) as (Ablauf & { id: string })[])
    .filter((a) => a.ausloeser?.art === 'knopf' && a.ausloeser.modul === modul && laufbereit(a))
    .map((a) => ({ id: a.id, name: a.name }))
    .slice(0, 12);
  return NextResponse.json({ ok: true, knoepfe }, { headers: { 'cache-control': 'no-store' } });
}
