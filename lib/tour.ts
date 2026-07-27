// lib/tour.ts
// A10 · Tour / Dispo-ePOD — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (tour.test.mjs, 6/6).

export const TOUR_STATUS = ['geplant', 'unterwegs', 'abgeschlossen'] as const;
export type TourStatus = typeof TOUR_STATUS[number];

export const STOPP_STATUS = ['offen', 'zugestellt', 'nicht_angetroffen', 'verweigert'] as const;
export type StoppStatus = typeof STOPP_STATUS[number];

/** Bearbeitete (nicht mehr offene) Stopp-Status. */
const ERLEDIGT: readonly string[] = ['zugestellt', 'nicht_angetroffen', 'verweigert'];

export interface StoppZahl {
  gesamt: number;
  zugestellt: number;
  offen: number;
  nichtAngetroffen: number;
  verweigert: number;
  kolli: number;
}

export function zaehleStopps(stopps: { status?: string; kolli?: number | null }[]): StoppZahl {
  let zugestellt = 0, offen = 0, nichtAngetroffen = 0, verweigert = 0, kolli = 0;
  for (const s of stopps) {
    kolli += Number(s.kolli) || 0;
    if (s.status === 'zugestellt') zugestellt++;
    else if (s.status === 'nicht_angetroffen') nichtAngetroffen++;
    else if (s.status === 'verweigert') verweigert++;
    else offen++;
  }
  return { gesamt: stopps.length, zugestellt, offen, nichtAngetroffen, verweigert, kolli };
}

/** Fortschritt einer Tour in % (bearbeitete Stopps / alle Stopps). */
export function fortschrittProzent(stopps: { status?: string }[]): number {
  if (!stopps.length) return 0;
  const erledigt = stopps.filter((s) => ERLEDIGT.includes(s.status ?? 'offen')).length;
  return Math.round((erledigt / stopps.length) * 100);
}

/** Zustellquote in % (erfolgreich zugestellte / alle Stopps). */
export function zustellquote(stopps: { status?: string }[]): number {
  if (!stopps.length) return 0;
  return Math.round((stopps.filter((s) => s.status === 'zugestellt').length / stopps.length) * 100);
}

export interface TourKennzahlen {
  touren: number;
  offeneTouren: number;
  offeneStopps: number;
  zugestelltGesamt: number;
}

export function zaehleTour(
  touren: { status?: string }[],
  stopps: { status?: string }[],
): TourKennzahlen {
  return {
    touren: touren.length,
    offeneTouren: touren.filter((t) => (t.status ?? 'geplant') !== 'abgeschlossen').length,
    offeneStopps: stopps.filter((s) => (s.status ?? 'offen') === 'offen').length,
    zugestelltGesamt: stopps.filter((s) => s.status === 'zugestellt').length,
  };
}
