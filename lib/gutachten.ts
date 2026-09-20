// lib/gutachten.ts
// A11 · Gutachten / Sachverständige — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (gutachten.test.mjs, 10/10).
//
// JVEG-Honorargruppen nach §9 JVEG (KostBRÄG, Stand ab 01.06.2025):
// Gruppen 1–13 = 71…136 €/h, medizinisch M1/M2/M3 = 87/98/131 €/h.

// ▄▄▄ PUNKT 30 (20.09.2026) — an lib/zahlen.ts angeschlossen ▄▄▄
// Die eigenen Zahl-Leser (Number(x) || 0) und die eigene Cent-Rundung sind
// weg. Zwei Fehler steckten darin:
//   1. Ein Betrag als "1.234,56" wurde zu 0, "12.500" zu 12,5 — Supabase
//      liefert numeric-Spalten haeufig als Text.
//   2. Ein negativer Wert rundete anders als derselbe Betrag positiv:
//      -2,675 wurde -2,67, +2,675 aber 2,68.
// Wichtiger als beides: es wird jetzt ZUERST GELESEN und DANN GERECHNET.
// Runden allein half nicht — bei a - b macht JavaScript aus "10.000"
// schon vor dem Runden die Zahl 10.
// Die ANZEIGE aendert sich dadurch nicht — nur die Zahlen stimmen.
import { leseZahlOder, centRunden } from './zahlen';

export const JVEG_HONORAR: Record<string, number> = {
  '1': 71, '2': 74, '3': 78, '4': 82, '5': 87, '6': 93, '7': 98, '8': 104,
  '9': 109, '10': 115, '11': 120, '12': 128, '13': 136, M1: 87, M2: 98, M3: 131,
};

export const HONORARGRUPPEN = Object.keys(JVEG_HONORAR);

export const KATEGORIEN = ['befund', 'bewertung', 'mangel', 'empfehlung'] as const;
export type Kategorie = typeof KATEGORIEN[number];

/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

/** Stundensatz einer JVEG-Honorargruppe (€/h) oder null, wenn unbekannt. */
export function honorarsatz(gruppe: string): number | null {
  return JVEG_HONORAR[gruppe] ?? null;
}

/** Honorar = Stundensatz der Gruppe × Stunden. Unbekannte Gruppe → 0. */
export function honorar(gruppe: string, stunden: number): number {
  const s = JVEG_HONORAR[gruppe] || 0;
  return r2(s * z(stunden));
}

/** Summe der Positions-Beträge (Wert/Schaden/Kosten). */
export function summePositionen(positionen: { betrag?: number | null }[]): number {
  return r2(positionen.reduce((a, p) => a + z(p.betrag), 0));
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
