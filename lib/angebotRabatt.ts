// lib/angebotRabatt.ts
// CPQ-Kern: Rabatte (Position + Gesamt), Mengenstaffeln und Genehmigungs-Schwelle
// für Angebote. Reine Formeln, Cent-genau, KEINE Supabase-/React-Abhängigkeit.
// Node-getestet (angebotRabatt.test.ts).
//
// Modell: Der pro Position gespeicherte „effektive Rabatt %" faltet Positions-,
// Staffel- und Gesamtrabatt zu EINEM Wert. So rechnen Angebot, PDF und
// Rechnung garantiert dieselbe Summe (die Rechnung-Route nutzt genau diesen
// effektiven Prozentsatz je Position).

/** Ab welchem Gesamtrabatt (%) ein Angebot eine Freigabe braucht. */
export const RABATT_FREIGABE_AB = 20;

export interface Staffel { abMenge: number; rabatt: number; }
export interface RabattPos {
  menge?: number | string | null;
  einzelpreis?: number | string | null;
  mwst_satz?: number | string | null;
  rabatt?: number | string | null; // manueller Positionsrabatt %
}

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(/\./g, '').replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function clampP(p: number): number { return Math.min(Math.max(p, 0), 100); }
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

/** Höchster Staffelrabatt (%), dessen Mengenschwelle erreicht ist. */
export function staffelRabatt(menge: number, staffeln: Staffel[] | null | undefined): number {
  let best = 0;
  for (const s of staffeln || []) {
    if (menge >= z(s.abMenge) && z(s.rabatt) > best) best = z(s.rabatt);
  }
  return clampP(best);
}

/** Positions-Rabatt = größerer aus manuellem und Staffel-Rabatt (nicht gestapelt). */
export function positionsRabatt(manuell: number, staffelWert: number): number {
  return clampP(Math.max(manuell, staffelWert));
}

/** Effektiver Rabatt einer Position: Positionsrabatt UND Gesamtrabatt multiplikativ gefaltet. */
export function effektiverRabatt(positionsProzent: number, gesamtProzent: number): number {
  const p = clampP(positionsProzent) / 100;
  const g = clampP(gesamtProzent) / 100;
  return r2(clampP((1 - (1 - p) * (1 - g)) * 100));
}

export interface AngebotSumme {
  netto: number;
  mwst: number;
  brutto: number;
  zwischenNetto: number;      // Summe vor jedem Rabatt
  rabattBetrag: number;       // gesparter Netto-Betrag
  rabattProzentGesamt: number; // effektiver Gesamtrabatt in %
  positionen: { effektivProzent: number; netto: number }[]; // je Position
}

/**
 * Rechnet ein Angebot mit Positions-, Staffel- und Gesamtrabatt.
 * Cent-genau; MwSt je Steuersatz auf die (rabattierte) Gruppensumme.
 */
export function rechneAngebot(
  positionen: RabattPos[],
  gesamtProzent: number | string | null | undefined,
  staffeln?: Staffel[] | null,
): AngebotSumme {
  const g = clampP(z(gesamtProzent));
  const perSatz: Record<number, number> = {};
  let nettoC = 0, zwischenC = 0;
  const posOut: { effektivProzent: number; netto: number }[] = [];

  for (const p of positionen || []) {
    const menge = z(p.menge);
    const einzel = z(p.einzelpreis);
    const satz = z(p.mwst_satz);
    const posR = positionsRabatt(z(p.rabatt), staffelRabatt(menge, staffeln));
    const eff = effektiverRabatt(posR, g);

    const origC = Math.round(menge * einzel * 100);
    const netC = Math.round(menge * einzel * (1 - eff / 100) * 100);
    zwischenC += origC;
    nettoC += netC;
    perSatz[satz] = (perSatz[satz] || 0) + netC;
    posOut.push({ effektivProzent: eff, netto: netC / 100 });
  }

  let mwstC = 0;
  for (const s of Object.keys(perSatz)) mwstC += Math.round(perSatz[Number(s)] * Number(s) / 100);

  return {
    netto: nettoC / 100,
    mwst: mwstC / 100,
    brutto: (nettoC + mwstC) / 100,
    zwischenNetto: zwischenC / 100,
    rabattBetrag: (zwischenC - nettoC) / 100,
    rabattProzentGesamt: zwischenC > 0 ? r2((zwischenC - nettoC) / zwischenC * 100) : 0,
    positionen: posOut,
  };
}

/** Effektiver Rabatt einer EINZELNEN Position (für die Rechnung-Route). */
export function effektiverRabattPosition(pos: RabattPos, gesamtProzent: number, staffeln?: Staffel[] | null): number {
  const posR = positionsRabatt(z(pos.rabatt), staffelRabatt(z(pos.menge), staffeln));
  return effektiverRabatt(posR, clampP(z(gesamtProzent)));
}

/** Netto einer Position nach (bereits effektivem) Rabatt — identische Rundung wie rechneAngebot. */
export function positionsNetto(menge: number | string, einzelpreis: number | string, effektivProzent: number): number {
  return Math.round(z(menge) * z(einzelpreis) * (1 - clampP(effektivProzent) / 100) * 100) / 100;
}

/** Braucht dieses Angebot eine Freigabe? */
export function freigabeNoetig(rabattProzentGesamt: number, schwelle: number = RABATT_FREIGABE_AB): boolean {
  return rabattProzentGesamt > 0 && rabattProzentGesamt >= schwelle;
}

export function formatEuro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
