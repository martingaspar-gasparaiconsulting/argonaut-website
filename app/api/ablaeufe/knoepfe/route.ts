import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { knopfModul, type Ablauf } from '@/lib/ablauf';
import { laufbereit } from '@/lib/ablaufMotor';
import { darfKnopfStarten } from '@/lib/ablaufKnopfRecht';
import { knopfAufrufer } from '@/lib/ablaufKnopfServer';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/knoepfe?modul= — Knöpfe einer Modulseite (Paket 168, 192)
//
// Geschäftsleitung: ihre eingeschalteten Knopf-Abläufe für das Modul.
// Paket 192: Mitarbeiter sehen die Knöpfe ihres Betriebs, bei denen der Haken
// „Auch Mitarbeiter" gesetzt ist UND sie das Modul sehen und ändern dürfen
// (darfKnopfStarten — dieselbe Regel wie beim Start). Nur Name und Kennung.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const modul = new URL(req.url).searchParams.get('modul') ?? '';
  if (!knopfModul(modul)) return NextResponse.json({ ok: true, knoepfe: [] });

  const admin = createAdminClient();
  const wer = await knopfAufrufer(admin, user.id);
  const betrieb = wer.rolle === 'chef' ? user.id : wer.betrieb;
  const { data } = await admin.from('ablaeufe').select('*')
    .eq('owner_user_id', betrieb).eq('aktiv', true).limit(200);
  const heute = new Date().toISOString().slice(0, 10);
  const knoepfe = ((data ?? []) as (Ablauf & { id: string; owner_user_id: string })[])
    .filter((a) => a.ausloeser?.art === 'knopf' && a.ausloeser.modul === modul && laufbereit(a))
    .filter((a) => darfKnopfStarten(a, wer, heute).ja)
    .map((a) => ({ id: a.id, name: a.name }))
    .slice(0, 12);
  return NextResponse.json({ ok: true, knoepfe }, { headers: { 'cache-control': 'no-store' } });
}
