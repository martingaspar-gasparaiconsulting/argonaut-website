// ============================================================================
// ARGONAUT OS · app/api/admin/nutzung/route.ts — Punkt 6.4, die Auswertung
//
//   GET ?tage=30  ->  { module[], onboarding[], schritteGesamt }
//
// BETREIBER-ENDPUNKT mit demselben Doppelschloss wie die übrigen: Admin-Rolle
// UND gesetzte Betreiber-Kennung. Diese Zahlen sind ARGONAUTs eigene, nicht die
// eines Kunden.
//
// Alles, was zurückkommt, ist bereits aggregiert — je Betrieb, nie je Person.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

async function betreiberGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }
  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (!betreiber || user.id !== betreiber) {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const roh = parseInt(new URL(req.url).searchParams.get('tage') || '30', 10);
  const tage = Number.isFinite(roh) && roh > 0 && roh <= 365 ? roh : 30;
  const seit = new Date(Date.now() - tage * 86_400_000).toISOString().slice(0, 10);

  const db = adminDb();

  const [modulR, onbR] = await Promise.all([
    db.rpc('modul_nutzung_je_modul', { seit }).then((r) => r, () => ({ data: null, error: true as unknown })),
    db.rpc('onboarding_stand').then((r) => r, () => ({ data: null, error: true as unknown })),
  ]);

  const module = modulR.error ? [] : ((modulR.data as unknown as Array<Record<string, unknown>>) ?? []).map((z) => ({
    modul_key: String(z.modul_key ?? ''),
    betriebe: Number(z.betriebe) || 0,
    aufrufe: Number(z.aufrufe) || 0,
  }));

  const onboarding = onbR.error ? [] : ((onbR.data as unknown as Array<Record<string, unknown>>) ?? []).map((z) => ({
    owner_user_id: String(z.owner_user_id ?? ''),
    erledigte: Number(z.erledigte) || 0,
    letzte_aktivitaet: z.letzte_aktivitaet ? String(z.letzte_aktivitaet) : null,
  }));

  return NextResponse.json({
    ok: true,
    tage,
    module,
    onboarding,
    // Wo eine Abfrage nicht durchkam, sagen wir das — statt „null Aufrufe“ zu
    // zeigen und den Betreiber falsche Schlüsse ziehen zu lassen.
    modulLesbar: !modulR.error,
    onboardingLesbar: !onbR.error,
  });
}
