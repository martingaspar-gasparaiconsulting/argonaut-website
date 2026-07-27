// ============================================================================
// ARGONAUT OS · lib/rezeptur.ts — Rezeptur-/Ausbeute-Rechner (Baustein 4)
//
// Reine Fachlogik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Die Branchen-
// Schärfe für Lebensmittel-Handwerk + Gastro. Formeln web-verifiziert (27.07.2026).
//
//  · Teigausbeute (TA) = (Mehl + Wasser) / Mehl × 100  →  Schüttwasser
//  · Backverlust       = (Teig − Gebäck) / Teig × 100
//  · Ausbeute          = Ertrag / Einsatzmenge × 100   (Zerlegen, Sud …)
//  · Skalierung        = Zielmenge / Basismenge        (Zutaten × Faktor)
//  · Wareneinsatz/Food-Cost + Verkaufspreis-Vorschlag
// ============================================================================

const r2 = (n: number) => Math.round(n * 100) / 100;

// --- Bäcker: Teigausbeute & Schüttwasser -----------------------------------

/** Teigausbeute TA = (Mehl + Wasser) / Mehl × 100. TA 160 = 100 Mehl + 60 Wasser. */
export function teigausbeute(mehl: number, wasser: number): number | null {
  const m = Number(mehl) || 0;
  if (m <= 0) return null;
  return r2(((m + (Number(wasser) || 0)) / m) * 100);
}

/** Schüttwasser aus Mehl + gewünschter TA: Wasser = Mehl × (TA − 100) / 100. */
export function schuettwasser(mehl: number, ta: number): number | null {
  const m = Number(mehl) || 0;
  const t = Number(ta) || 0;
  if (m <= 0 || t < 100) return null;
  return r2((m * (t - 100)) / 100);
}

/** Hydration (Bäckerprozent Wasser) = Wasser / Mehl × 100 (= TA − 100). */
export function hydration(mehl: number, wasser: number): number | null {
  const m = Number(mehl) || 0;
  if (m <= 0) return null;
  return r2(((Number(wasser) || 0) / m) * 100);
}

// --- Backverlust ------------------------------------------------------------

/** Backverlust % = (Teiggewicht − Gebäckgewicht) / Teiggewicht × 100. */
export function backverlust(teiggewicht: number, gebaeckgewicht: number): number | null {
  const t = Number(teiggewicht) || 0;
  if (t <= 0) return null;
  return r2(((t - (Number(gebaeckgewicht) || 0)) / t) * 100);
}

/** Erwartetes Gebäckgewicht aus Teig + Backverlust%. */
export function gebaeckAusTeig(teiggewicht: number, backverlustProzent: number): number | null {
  const t = Number(teiggewicht) || 0;
  if (t <= 0) return null;
  const bv = Number(backverlustProzent) || 0;
  return r2(t * (1 - bv / 100));
}

/** Benötigter Teig für ein gewünschtes Gebäckgewicht (Rückrechnung Backverlust). */
export function teigFuerGebaeck(zielGebaeck: number, backverlustProzent: number): number | null {
  const z = Number(zielGebaeck) || 0;
  const bv = Number(backverlustProzent) || 0;
  if (z <= 0 || bv >= 100) return null;
  return r2(z / (1 - bv / 100));
}

// --- Generische Ausbeute (Metzger-Zerlegen, Brau-Sud …) --------------------

/** Ausbeute % = Ertrag / Einsatzmenge × 100. */
export function ausbeuteProzent(einsatz: number, ertrag: number): number | null {
  const e = Number(einsatz) || 0;
  if (e <= 0) return null;
  return r2(((Number(ertrag) || 0) / e) * 100);
}

// --- Skalierung -------------------------------------------------------------

/** Skalierungsfaktor = Zielmenge / Basismenge. */
export function skalierungsFaktor(zielMenge: number, basisMenge: number): number | null {
  const b = Number(basisMenge) || 0;
  if (b <= 0) return null;
  return r2((Number(zielMenge) || 0) / b);
}

// --- Zutaten / Wareneinsatz / Food-Cost ------------------------------------

export interface Zutat {
  bezeichnung?: string | null;
  menge?: number | null;
  einheit?: string | null;
  preis_pro_einheit?: number | null; // € je Einheit (z. B. €/kg)
}

/** Kosten einer Zutat = Menge × Preis je Einheit. */
export function zutatKosten(z: Zutat): number {
  return r2((Number(z.menge) || 0) * (Number(z.preis_pro_einheit) || 0));
}

/** Wareneinsatz = Summe der Zutatenkosten. */
export function wareneinsatz(zutaten: Zutat[]): number {
  return r2(zutaten.reduce((s, z) => s + zutatKosten(z), 0));
}

/** Kosten je Ausbeute-Einheit = Wareneinsatz / Ausbeutemenge. */
export function kostenProEinheit(wareneinsatzGesamt: number, ausbeuteMenge: number): number | null {
  const a = Number(ausbeuteMenge) || 0;
  if (a <= 0) return null;
  return r2((Number(wareneinsatzGesamt) || 0) / a);
}

/** Kosten je Portion = Wareneinsatz / Portionen. */
export function kostenProPortion(wareneinsatzGesamt: number, portionen: number): number | null {
  const p = Number(portionen) || 0;
  if (p <= 0) return null;
  return r2((Number(wareneinsatzGesamt) || 0) / p);
}

/**
 * Verkaufspreis-Vorschlag (netto) aus Kosten + Ziel-Food-Cost-Quote.
 * Bei 30 % Food-Cost: Preis = Kosten / 0,30. Ergebnis netto (MwSt separat).
 */
export function verkaufspreisAusFoodcost(kosten: number, foodcostProzent: number): number | null {
  const fc = Number(foodcostProzent) || 0;
  if (fc <= 0 || fc > 100) return null;
  return r2((Number(kosten) || 0) / (fc / 100));
}

/** Tatsächliche Food-Cost-Quote % = Kosten / Verkaufspreis × 100. */
export function foodcostProzent(kosten: number, verkaufspreis: number): number | null {
  const v = Number(verkaufspreis) || 0;
  if (v <= 0) return null;
  return r2(((Number(kosten) || 0) / v) * 100);
}
