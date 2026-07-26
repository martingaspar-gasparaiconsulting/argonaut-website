// ============================================================================
// ARGONAUT OS · lib/controlling.ts — Regel-Ebene: Controlling-Kennzahlen
//
// KEINE KI. Nur betriebswirtschaftliche Standardformeln — sofort, kostenlos,
// nachvollziehbar. Jede Funktion nimmt Klartext-Zahlen und liefert die
// abgeleiteten Kennzahlen zurueck. Bewertung (Ampel) macht die Seite.
//
// Reine Funktionen, keine Hooks/Supabase — ueberall importierbar.
// ============================================================================

export function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

/** Sicheres Prozent teil/ganz*100 (0 bei Nenner 0). */
export function pct(teil: number, ganz: number): number {
  const g = Number(ganz) || 0;
  if (g === 0) return 0;
  return r2((Number(teil) || 0) / g * 100);
}

// ---- Ergebnis & Marge ----
export type ErgebnisIn = { umsatz: number; wareneinsatz: number; personalkosten: number; sonstigeKosten: number };
export type ErgebnisOut = {
  rohertrag: number; rohertragsquote: number;
  gesamtkosten: number; betriebsergebnis: number; umsatzrendite: number;
  personalkostenquote: number;
};
export function ergebnis(i: ErgebnisIn): ErgebnisOut {
  const rohertrag = r2(i.umsatz - i.wareneinsatz);
  const gesamtkosten = r2(i.wareneinsatz + i.personalkosten + i.sonstigeKosten);
  const betriebsergebnis = r2(i.umsatz - gesamtkosten);
  return {
    rohertrag, rohertragsquote: pct(rohertrag, i.umsatz),
    gesamtkosten, betriebsergebnis, umsatzrendite: pct(betriebsergebnis, i.umsatz),
    personalkostenquote: pct(i.personalkosten, i.umsatz),
  };
}

// ---- Break-even ----
export type BreakEvenOut = { breakEvenUmsatz: number | null; sicherheitsabstand: number | null };
export function breakEven(fixkosten: number, dbMargeProzent: number, istUmsatz?: number): BreakEvenOut {
  const m = (Number(dbMargeProzent) || 0) / 100;
  if (m <= 0) return { breakEvenUmsatz: null, sicherheitsabstand: null };
  const be = r2((Number(fixkosten) || 0) / m);
  const sicher = istUmsatz && istUmsatz > 0 ? pct(istUmsatz - be, istUmsatz) : null;
  return { breakEvenUmsatz: be, sicherheitsabstand: sicher };
}

// ---- Liquidität (in %) ----
export type LiquiditaetIn = { liquide: number; forderungen: number; vorraete: number; kurzVerb: number };
export type LiquiditaetOut = { grad1: number; grad2: number; grad3: number };
export function liquiditaet(i: LiquiditaetIn): LiquiditaetOut {
  return {
    grad1: pct(i.liquide, i.kurzVerb),
    grad2: pct(i.liquide + i.forderungen, i.kurzVerb),
    grad3: pct(i.liquide + i.forderungen + i.vorraete, i.kurzVerb),
  };
}

// ---- Kalkulatorischer Stundensatz ----
export type StundensatzOut = { kostenSatz: number | null; mitGewinn: number | null };
export function stundensatz(jahreskosten: number, produktiveStunden: number, gewinnProzent: number): StundensatzOut {
  const std = Number(produktiveStunden) || 0;
  if (std <= 0) return { kostenSatz: null, mitGewinn: null };
  const kostenSatz = r2((Number(jahreskosten) || 0) / std);
  const mitGewinn = r2(kostenSatz * (1 + (Number(gewinnProzent) || 0) / 100));
  return { kostenSatz, mitGewinn };
}

// ---- Eigenkapitalquote (in %) ----
export function ekQuote(eigenkapital: number, bilanzsumme: number): number {
  return pct(eigenkapital, bilanzsumme);
}
