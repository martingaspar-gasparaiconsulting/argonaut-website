import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { fasseAnalytics } from '@/lib/marketingAnalytics';
import { leadsJeBundesland } from '@/lib/plzBundesland';

// ============================================================================
// ARGONAUT OS · app/api/marketing/analytics-board/route.ts
// (Marketing-Ausbau · Punkt 4 — visueller Analytics-Board)
//
// Liest die Lead-/Ads-Rohdaten RLS-scoped (Betrieb sieht nur eigenes bzw. das
// des Chefs — wirkt fuer Kunde UND Betreiber), aggregiert sie mechanisch
// (lib/marketingAnalytics) und ergaenzt die Regions-Verteilung (PLZ->Bundesland,
// geschaetzt). Es wird NICHTS erfunden und NICHTS geschrieben.
// GET -> { ok, kpis, funnel, zeitReihe, quellen, ads, regionen }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type Row = Record<string, unknown>;

/** Defensive Abfrage: bei Fehler leere Liste (fehlt Tabelle in einem Konto → 0). */
async function hole(sb: Sb, tabelle: string, spalten: string): Promise<Row[]> {
  try {
    const { data, error } = await sb.from(tabelle).select(spalten).limit(5000);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const [leadsRoh, adsErgebnisse] = await Promise.all([
    hole(supabase, 'leads', 'status, quelle, created_at, kampagne_id, plz'),
    hole(supabase, 'ads_ergebnis', 'ausgaben, umsatz, klicks, conversions'),
  ]);

  const jetztIso = new Date().toISOString();
  const board = fasseAnalytics({ leads: leadsRoh, adsErgebnisse, jetztIso, wochen: 8 });

  // Regions-Verteilung (geschätzt aus PLZ) — nur Leads mit gültiger PLZ.
  const regionenRoh = leadsJeBundesland(leadsRoh as Array<{ plz?: unknown }>);
  const regionMax = regionenRoh.reduce((m, r) => Math.max(m, r.anzahl), 0);
  const regionen = regionenRoh.map((r) => ({
    ...r,
    anteil: regionMax > 0 ? Math.round((r.anzahl / regionMax) * 100) : 0,
  }));

  return NextResponse.json({
    ok: true,
    kpis: board.kpis,
    funnel: board.funnel,
    zeitReihe: board.zeitReihe,
    quellen: board.quellen,
    ads: board.ads,
    regionen,
    regionMitPlz: regionenRoh.reduce((s, r) => s + r.anzahl, 0),
  });
}
