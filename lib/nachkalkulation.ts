// ============================================================================
// ARGONAUT OS · lib/nachkalkulation.ts — Projekt-Nachkalkulation (Plan ↔ Ist)
//
// Reine Logik (KEINE Supabase-/React-Abhängigkeit, node-testbar). Vergleicht je
// Projekt den PLAN (projekte.budget) mit der IST-Leistung (Summe der
// projektleistungen = Stunden × Stundensatz) und zeigt, was davon schon
// abgerechnet bzw. noch offen ist. So sieht der Betrieb, ob ein Projekt im
// Budget liegt und wie viel noch zu fakturieren ist.
//
// HINWEIS: „Ist" = erbrachte (abrechenbare) Leistung. Material-/Fremdkosten für
// einen vollen Deckungsbeitrag lassen sich später ergänzen (Beleg↔Projekt).
// ============================================================================

export interface LeistungRoh {
  projekt_id?: string | null;
  stunden?: number | null;
  stundensatz?: number | null;
  abgerechnet?: boolean | null;
}

export interface ProjektRoh {
  id: string;
  name?: string | null;
  budget?: number | string | null;
}

export type KalkStatus = 'kein_budget' | 'im_budget' | 'knapp' | 'ueber_budget';

export interface ProjektKalk {
  id: string;
  name: string;
  budget: number;
  erbracht: number;      // Ist-Leistung gesamt (netto)
  abgerechnet: number;
  offen: number;         // erbracht − abgerechnet
  stunden: number;
  differenz: number;     // budget − erbracht (positiv = Luft, negativ = drüber)
  auslastung: number;    // erbracht / budget × 100 (0 wenn kein Budget)
  status: KalkStatus;
}

function z(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

/** Status-Ampel aus Auslastung (nur wenn ein Budget hinterlegt ist). */
export function kalkStatus(budget: number, erbracht: number): KalkStatus {
  if (budget <= 0) return 'kein_budget';
  const a = erbracht / budget;
  if (a > 1) return 'ueber_budget';
  if (a >= 0.85) return 'knapp';
  return 'im_budget';
}

/** Baut je Projekt die Nachkalkulation; sortiert „über Budget" zuerst, dann nach offenem Betrag. */
export function baueKalkulation(projekte: ProjektRoh[], leistungen: LeistungRoh[]): ProjektKalk[] {
  const agg = new Map<string, { erbracht: number; abgerechnet: number; stunden: number }>();
  for (const l of leistungen) {
    const pid = String(l.projekt_id ?? '');
    if (!pid) continue;
    const stunden = z(l.stunden);
    const betrag = stunden * z(l.stundensatz);
    let a = agg.get(pid);
    if (!a) { a = { erbracht: 0, abgerechnet: 0, stunden: 0 }; agg.set(pid, a); }
    a.erbracht += betrag;
    a.stunden += stunden;
    if (l.abgerechnet) a.abgerechnet += betrag;
  }

  const out: ProjektKalk[] = (projekte || []).map((p) => {
    const a = agg.get(String(p.id)) || { erbracht: 0, abgerechnet: 0, stunden: 0 };
    const budget = z(p.budget);
    const erbracht = r2(a.erbracht);
    const abgerechnet = r2(a.abgerechnet);
    return {
      id: String(p.id),
      name: (p.name && String(p.name).trim()) || 'Projekt',
      budget: r2(budget),
      erbracht,
      abgerechnet,
      offen: r2(erbracht - abgerechnet),
      stunden: r2(a.stunden),
      differenz: r2(budget - erbracht),
      auslastung: budget > 0 ? r2((erbracht / budget) * 100) : 0,
      status: kalkStatus(budget, erbracht),
    };
  });

  const rang: Record<KalkStatus, number> = { ueber_budget: 0, knapp: 1, im_budget: 2, kein_budget: 3 };
  return out.sort((x, y) => (rang[x.status] - rang[y.status]) || (y.offen - x.offen));
}

/** Summen über alle Projekte (für die KPI-Leiste). */
export function summeKalk(kalk: ProjektKalk[]): {
  budget: number; erbracht: number; abgerechnet: number; offen: number; ueberBudget: number;
} {
  const s = { budget: 0, erbracht: 0, abgerechnet: 0, offen: 0, ueberBudget: 0 };
  for (const k of kalk) {
    s.budget += k.budget;
    s.erbracht += k.erbracht;
    s.abgerechnet += k.abgerechnet;
    s.offen += k.offen;
    if (k.status === 'ueber_budget') s.ueberBudget += 1;
  }
  return { budget: r2(s.budget), erbracht: r2(s.erbracht), abgerechnet: r2(s.abgerechnet), offen: r2(s.offen), ueberBudget: s.ueberBudget };
}
