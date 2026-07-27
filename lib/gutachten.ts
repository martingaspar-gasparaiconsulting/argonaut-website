// lib/gutachten.ts
// A11 · Gutachten / Sachverständige — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (gutachten.test.mjs, 10/10).
//
// JVEG-Honorargruppen nach §9 JVEG (KostBRÄG, Stand ab 01.06.2025):
// Gruppen 1–13 = 71…136 €/h, medizinisch M1/M2/M3 = 87/98/131 €/h.

export const JVEG_HONORAR: Record<string, number> = {
  '1': 71, '2': 74, '3': 78, '4': 82, '5': 87, '6': 93, '7': 98, '8': 104,
  '9': 109, '10': 115, '11': 120, '12': 128, '13': 136, M1: 87, M2: 98, M3: 131,
};

export const HONORARGRUPPEN = Object.keys(JVEG_HONORAR);

export const KATEGORIEN = ['befund', 'bewertung', 'mangel', 'empfehlung'] as const;
export type Kategorie = typeof KATEGORIEN[number];

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

/** Stundensatz einer JVEG-Honorargruppe (€/h) oder null, wenn unbekannt. */
export function honorarsatz(gruppe: string): number | null {
  return JVEG_HONORAR[gruppe] ?? null;
}

/** Honorar = Stundensatz der Gruppe × Stunden. Unbekannte Gruppe → 0. */
export function honorar(gruppe: string, stunden: number): number {
  const s = JVEG_HONORAR[gruppe] || 0;
  return r2(s * (Number(stunden) || 0));
}

/** Summe der Positions-Beträge (Wert/Schaden/Kosten). */
export function summePositionen(positionen: { betrag?: number | null }[]): number {
  return r2(positionen.reduce((a, p) => a + (Number(p.betrag) || 0), 0));
}

export interface GutachtenKennzahlen {
  gesamt: number;
  entwurf: number;
  fertig: number;
}

export function zaehleGutachten(gutachten: { status?: string }[]): GutachtenKennzahlen {
  return {
    gesamt: gutachten.length,
    entwurf: gutachten.filter((g) => g.status === 'entwurf').length,
    fertig: gutachten.filter((g) => g.status === 'fertig').length,
  };
}
