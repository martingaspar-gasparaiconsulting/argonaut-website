// ============================================================================
// ARGONAUT OS · lib/marketingRoi.ts — reine ROI-Verzahnung
// (Marketing-Ausbau · Punkt 5 — Werbe-Ausgaben ↔ Website-Leads ↔ echter Umsatz)
//
// Verzahnt die drei Glieder der Kette JE KAMPAGNE:
//   Ausgaben/Budget  →  Website-Leads (leads.kampagne_id)  →  echter Umsatz
//                                                              (rechnung_id → rechnungen)
// und leitet daraus Kosten je Lead, Umsatz je Lead und echten ROI ab.
//
// Ehrlich statt schoenrechnen: fehlt einer Kampagne der Umsatz (keine Rechnung
// verknuepft), bleibt ihr ROI null (nicht 0). Kosten je Lead wird trotzdem
// gezeigt, sobald Leads da sind — das ist die eigentliche neue Verzahnung.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEIN Cross-Import —
// pure, node-testbare Funktionen (Muster wie lib/marketingCockpit.ts).
// ============================================================================

export type KampagneRoh = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  budget?: unknown;
  rechnung_id?: unknown;
};

export type LeadRoh = {
  kampagne_id?: unknown;
};

export type RechnungRoh = {
  id?: unknown;
  brutto_summe?: unknown;
  bezahlter_betrag?: unknown;
  zahlungsstatus?: unknown;
};

/** Nicht-negative Zahl aus Zahl/String (Komma/Punkt), sonst 0. */
function num(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function runde2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Umsatz einer Kampagne aus ihrer Rechnung: bevorzugt tatsaechlich bezahlt. */
export function umsatzAusRechnung(r: RechnungRoh | undefined | null): number | null {
  if (!r) return null;
  const bez = num(r.bezahlter_betrag);
  if (bez > 0) return runde2(bez);
  const bru = num(r.brutto_summe);
  if (bru > 0) return runde2(bru);
  return null;
}

export type RoiAmpel = 'sehr_gut' | 'profitabel' | 'verlust' | 'offen';

/** ROI-Bewertung: >=1 (=+100%) sehr gut, 0..1 profitabel, <0 Verlust, null offen. */
export function roiAmpel(roi: number | null): RoiAmpel {
  if (roi == null) return 'offen';
  if (roi < 0) return 'verlust';
  if (roi < 1) return 'profitabel';
  return 'sehr_gut';
}

export type KampagneRoiZeile = {
  id: string;
  name: string;
  status: string;
  budget: number;
  leads: number;
  umsatz: number | null;
  kostenJeLead: number | null;
  umsatzJeLead: number | null;
  roi: number | null;
  ampel: RoiAmpel;
};

export type RoiSumme = {
  budgetGesamt: number;
  budgetMitUmsatz: number;
  umsatzBelegt: number;
  kampagnen: number;
  kampagnenMitUmsatz: number;
  leadsGesamt: number;
  leadsAttribuiert: number;
  leadsOrganisch: number;
  kostenJeLeadGesamt: number | null;
  umsatzJeLeadGesamt: number | null;
  roiGesamt: number | null;
};

export type VerzahnungInput = {
  kampagnen?: KampagneRoh[] | null;
  leads?: LeadRoh[] | null;
  rechnungen?: RechnungRoh[] | null;
};

/** Leads je Kampagne-Id zaehlen (nur Leads mit gesetzter kampagne_id). */
export function leadsProKampagne(leads: LeadRoh[] | null | undefined): Record<string, number> {
  const map: Record<string, number> = {};
  for (const l of leads || []) {
    const k = typeof l?.kampagne_id === 'string' && l.kampagne_id.trim() ? l.kampagne_id.trim() : '';
    if (!k) continue;
    map[k] = (map[k] || 0) + 1;
  }
  return map;
}

/**
 * Kernstueck: verzahnt Ausgaben ↔ Leads ↔ Umsatz je Kampagne und rechnet die
 * Gesamt-Kennzahlen. Rechnungen werden per rechnung_id zugeordnet.
 */
export function verzahneKampagnen(input: VerzahnungInput): { zeilen: KampagneRoiZeile[]; summe: RoiSumme } {
  const kampagnen = input.kampagnen || [];
  const leads = input.leads || [];
  const rechnungen = input.rechnungen || [];

  // Rechnungen indexieren.
  const rMap: Record<string, RechnungRoh> = {};
  for (const r of rechnungen) {
    const id = typeof r?.id === 'string' ? r.id : String(r?.id ?? '');
    if (id) rMap[id] = r;
  }

  const leadsJe = leadsProKampagne(leads);

  const zeilen: KampagneRoiZeile[] = kampagnen.map((k) => {
    const id = typeof k?.id === 'string' ? k.id : String(k?.id ?? '');
    const budget = num(k?.budget);
    const anzLeads = leadsJe[id] || 0;
    const rechnungId = typeof k?.rechnung_id === 'string' && k.rechnung_id.trim() ? k.rechnung_id.trim() : '';
    const umsatz = rechnungId ? umsatzAusRechnung(rMap[rechnungId]) : null;

    const kostenJeLead = anzLeads > 0 && budget > 0 ? runde2(budget / anzLeads) : null;
    const umsatzJeLead = anzLeads > 0 && umsatz != null ? runde2(umsatz / anzLeads) : null;
    const roi = umsatz != null && budget > 0 ? runde2((umsatz - budget) / budget) : null;

    return {
      id,
      name: (typeof k?.name === 'string' && k.name.trim()) ? k.name.trim() : 'Unbenannte Kampagne',
      status: (typeof k?.status === 'string' && k.status) ? k.status : 'entwurf',
      budget,
      leads: anzLeads,
      umsatz,
      kostenJeLead,
      umsatzJeLead,
      roi,
      ampel: roiAmpel(roi),
    };
  }).sort((a, b) => b.budget - a.budget || b.leads - a.leads);

  // Gesamt-Kennzahlen.
  const bekannteIds = new Set(zeilen.map((z) => z.id));
  const leadsGesamt = leads.length;
  const leadsAttribuiert = leads.filter((l) => {
    const k = typeof l?.kampagne_id === 'string' ? l.kampagne_id.trim() : '';
    return !!k && bekannteIds.has(k);
  }).length;
  const leadsOrganisch = leadsGesamt - leadsAttribuiert;

  let budgetGesamt = 0, budgetMitUmsatz = 0, umsatzBelegt = 0, kampagnenMitUmsatz = 0;
  for (const z of zeilen) {
    budgetGesamt += z.budget;
    if (z.umsatz != null) {
      umsatzBelegt += z.umsatz;
      budgetMitUmsatz += z.budget;
      kampagnenMitUmsatz += 1;
    }
  }
  budgetGesamt = runde2(budgetGesamt);
  budgetMitUmsatz = runde2(budgetMitUmsatz);
  umsatzBelegt = runde2(umsatzBelegt);

  const summe: RoiSumme = {
    budgetGesamt,
    budgetMitUmsatz,
    umsatzBelegt,
    kampagnen: zeilen.length,
    kampagnenMitUmsatz,
    leadsGesamt,
    leadsAttribuiert,
    leadsOrganisch,
    kostenJeLeadGesamt: leadsAttribuiert > 0 && budgetGesamt > 0 ? runde2(budgetGesamt / leadsAttribuiert) : null,
    umsatzJeLeadGesamt: leadsAttribuiert > 0 && umsatzBelegt > 0 ? runde2(umsatzBelegt / leadsAttribuiert) : null,
    roiGesamt: budgetMitUmsatz > 0 ? runde2((umsatzBelegt - budgetMitUmsatz) / budgetMitUmsatz) : null,
  };

  return { zeilen, summe };
}
