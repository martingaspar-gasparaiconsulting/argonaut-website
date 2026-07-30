import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { funnelJeLandingpage, funnelGesamt } from '@/lib/lpAnalytics';

// ============================================================================
// ARGONAUT OS · app/api/marketing/lp-analytics/route.ts  (Funnel-Analytics P1)
//
// GET -> Funnel je Landingpage (Aufrufe -> Anmeldungen -> Bestaetigt) + Quoten
//        + Gesamt-Uebersicht. Nur eingeloggte Betriebe, hart auf eigene Daten
//        beschraenkt (owner_user_id = user.id).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();

  const { data: lpData } = await admin
    .from('landingpages')
    .select('id, slug, titel, aktiv, created_at')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });
  const landingpages = (lpData ?? []) as { id: string; slug: string; titel: string; aktiv: boolean; created_at: string }[];

  const { data: evData } = await admin
    .from('lp_ereignisse')
    .select('landingpage_id, typ')
    .eq('owner_user_id', uid);
  const ereignisse = (evData ?? []) as { landingpage_id: string | null; typ: string | null }[];

  const funnels = funnelJeLandingpage(ereignisse, landingpages.map((l) => l.id));
  const funnelMap = new Map(funnels.map((f) => [f.landingpage_id, f]));

  const zeilen = landingpages
    .map((l) => {
      const f = funnelMap.get(l.id)!;
      return {
        landingpage_id: l.id,
        slug: l.slug,
        titel: l.titel,
        aktiv: l.aktiv,
        aufrufe: f.aufrufe,
        anmeldungen: f.anmeldungen,
        bestaetigungen: f.bestaetigungen,
        quoteAnmeldung: f.quoteAnmeldung,
        quoteBestaetigung: f.quoteBestaetigung,
      };
    })
    .sort((a, b) => (b.aufrufe - a.aufrufe) || (b.anmeldungen - a.anmeldungen));

  return NextResponse.json({ ok: true, zeilen, gesamt: funnelGesamt(funnels) });
}
