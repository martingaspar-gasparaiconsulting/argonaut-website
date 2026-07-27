// ============================================================================
// ARGONAUT OS · lib/assets.ts — Objekt-/Asset-Register-Formeln (Baustein 2)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Baut das generische
// Register auf der Baumkataster-Blaupause auf: Zustand-Ampel + Kontroll-
// Fälligkeit (nächste Kontrolle = letzte + Intervall) + Objekt-Alter.
//
// Datums-Helfer werden aus lib/wiederkehr wiederverwendet (eine Quelle).
// ============================================================================

import { datumPlusMonate, datumPlusTage } from '@/lib/wiederkehr';

export type Zustand = 'gut' | 'beobachten' | 'kritisch';

export interface AssetBasis {
  zustand?: string | null;
  kontrollintervall_monate?: number | null;
  letzte_kontrolle?: string | null;   // "YYYY-MM-DD"
  naechste_kontrolle?: string | null; // "YYYY-MM-DD"
  anschaffungsdatum?: string | null;  // "YYYY-MM-DD"
  archiviert?: boolean | null;
}

export const ZUSTAND_LABEL: Record<Zustand, string> = {
  gut: '🟢 Gut',
  beobachten: '🟠 Beobachten',
  kritisch: '🔴 Kritisch',
};

/** Zustand robust normalisieren (Default 'gut'). */
export function normZustand(z?: string | null): Zustand {
  return z === 'kritisch' || z === 'beobachten' ? z : 'gut';
}

/** Ampel-Stufe des Zustands — die UI mappt sie auf ihre Palette. */
export function zustandStufe(z?: string | null): 'gruen' | 'gelb' | 'rot' {
  const n = normZustand(z);
  return n === 'kritisch' ? 'rot' : n === 'beobachten' ? 'gelb' : 'gruen';
}

/**
 * Nächste Kontrolle = letzte Kontrolle + Intervall (Monate).
 * Ohne letzte Kontrolle oder ohne Intervall gibt es kein Datum.
 */
export function naechsteKontrolleBerechnen(letzte?: string | null, intervallMonate?: number | null): string | null {
  if (!letzte) return null;
  const iv = Number(intervallMonate);
  if (!(iv > 0)) return null;
  return datumPlusMonate(letzte.slice(0, 10), iv);
}

export type KontrollBucket = 'faellig' | 'bald' | 'ok' | 'kein';

/**
 * Fälligkeit der Kontrolle relativ zu heute.
 * faellig = heute/überfällig · bald = in <= baldTage · ok = später · kein = kein Datum.
 * Standard-Vorwarnfenster 30 Tage (wie im Baumkataster).
 */
export function kontrollBucket(a: AssetBasis, heuteIso: string, baldTage = 30): KontrollBucket {
  if (!a.naechste_kontrolle) return 'kein';
  const n = a.naechste_kontrolle.slice(0, 10);
  const heute = heuteIso.slice(0, 10);
  if (n <= heute) return 'faellig';
  if (n <= datumPlusTage(heute, baldTage)) return 'bald';
  return 'ok';
}

/** Objekt-Alter in vollen Jahren seit Anschaffung (oder null). */
export function alterInJahren(anschaffungsdatum?: string | null, heuteIso?: string): number | null {
  if (!anschaffungsdatum || !heuteIso) return null;
  const a = anschaffungsdatum.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  const h = heuteIso.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  if (a.length !== 3 || h.length !== 3 || !a[0] || !h[0]) return null;
  let jahre = h[0] - a[0];
  if (h[1] < a[1] || (h[1] === a[1] && h[2] < a[2])) jahre--;
  return jahre < 0 ? 0 : jahre;
}

/** Register-Kennzahlen über eine Objektliste (archivierte zählen nicht mit). */
export function zaehleRegister(
  list: AssetBasis[],
  heuteIso: string,
  baldTage = 30,
): { gesamt: number; faellig: number; bald: number; kritisch: number; beobachten: number; gut: number } {
  const s = { gesamt: 0, faellig: 0, bald: 0, kritisch: 0, beobachten: 0, gut: 0 };
  for (const a of list) {
    if (a.archiviert) continue;
    s.gesamt++;
    const b = kontrollBucket(a, heuteIso, baldTage);
    if (b === 'faellig') s.faellig++;
    else if (b === 'bald') s.bald++;
    const z = normZustand(a.zustand);
    if (z === 'kritisch') s.kritisch++;
    else if (z === 'beobachten') s.beobachten++;
    else s.gut++;
  }
  return s;
}
