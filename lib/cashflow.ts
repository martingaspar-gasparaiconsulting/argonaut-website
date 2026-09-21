// ============================================================================
// ARGONAUT OS · lib/cashflow.ts — Liquiditäts-Vorschau (Abschnitt 4 · Cashflow)
//
// Reine, node-testbare Aggregation: aus offenen Rechnungen (Restbetrag +
// Fälligkeitsdatum), einem Startsaldo und geschätzten monatlichen Fixkosten
// entsteht eine wochenweise Liquiditäts-Timeline mit laufendem Saldo und einer
// Unterdeckungs-/Runway-Warnung. KEINE Netzwerk-/Supabase-Aufrufe, KEINE Hooks.
// jetztIso wird hereingereicht (deterministisch).
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

const TAG = 86_400_000;
const WOCHE = 7 * TAG;

/**
 * Auf Cent runden — ueber den einen Zahlen-Leser (lib/zahlen.ts).
 *
 * Punkt 30, 21.09.2026. Zwei Fehler in einer Zeile, beide GEMESSEN:
 *  1. Der alte Leser war Number(n) || 0: aus dem Text "1.234,56", wie ihn
 *     eine numeric-Spalte oft liefert, wurde still die Zahl 0. Ein Saldo
 *     von 1.234,56 Euro stand als 0,00 Euro da.
 *  2. Die alte Rundung kippte bei negativen Betraegen nach oben:
 *     -0,005 wurde -0,00 und -1.234,565 wurde -1.234,56 statt -1.234,57.
 *     Genau hier faellt das auf, denn der Liquiditaets-Saldo IST oft
 *     negativ — das ist der Zweck dieser Vorschau.
 */
function r2(n: unknown): number { return centRunden(leseZahlOder(n, 0)); }
function zeitMs(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}
function ddmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.`;
}

export type OffeneRechnung = { rest: number; faelligkeitsdatum: string | null };

export type WochePunkt = {
  start: string;   // ISO Wochenbeginn
  label: string;   // dd.mm.
  zufluss: number;
  abfluss: number;
  saldo: number;   // laufender Saldo am Wochenende
  unterdeckung: boolean;
};

export type VorschauEingabe = {
  startSaldo: number;
  offene: OffeneRechnung[];
  fixkostenProMonat: number;
  jetztIso: string;
  wochen?: number; // Standard 12, 1..26
};

export type VorschauErgebnis = {
  punkte: WochePunkt[];
  startSaldo: number;
  endSaldo: number;
  summeZufluss: number;
  summeAbfluss: number;
  fixkostenProWoche: number;
  /** Erwartete Zuflüsse aus überfälligen Rechnungen (in Woche 1 eingeplant). */
  ueberfaellig: number;
  /** Offene Rechnungen OHNE Fälligkeitsdatum — konservativ NICHT eingeplant. */
  offeneOhneTermin: number;
  /** ISO-Wochenbeginn der ersten Unterdeckung (Saldo < 0) oder null. */
  ersteUnterdeckung: string | null;
};

/** Monatliche Fixkosten auf einen Wochenwert umlegen (12 Monate / 52 Wochen). */
export function fixProWoche(fixkostenProMonat: number): number {
  return r2(leseZahlOder(fixkostenProMonat, 0) * 12 / 52);
}

/**
 * Baut die wochenweise Liquiditäts-Timeline. Woche 1 fängt „jetzt" an; alle
 * bereits überfälligen offenen Rechnungen werden in Woche 1 als Zufluss
 * erwartet (sie sollten längst da sein). Rechnungen ohne Fälligkeitsdatum
 * werden bewusst NICHT eingeplant (konservativ) und separat ausgewiesen.
 */
export function liquiditaetsVorschau(e: VorschauEingabe): VorschauErgebnis {
  const wochen = Math.max(1, Math.min(26, Math.floor(e.wochen ?? 12)));
  const jetzt = zeitMs(e.jetztIso);
  const fpw = fixProWoche(e.fixkostenProMonat);
  const offene = e.offene || [];

  let ueberfaellig = 0;
  let offeneOhneTermin = 0;
  for (const r of offene) {
    const rest = leseZahlOder(r.rest, 0);
    if (rest <= 0) continue;
    const t = zeitMs(r.faelligkeitsdatum);
    if (t <= 0) offeneOhneTermin += rest;
    else if (t < jetzt) ueberfaellig += rest;
  }

  let saldo = leseZahlOder(e.startSaldo, 0);
  let summeZufluss = 0;
  let summeAbfluss = 0;
  let ersteUnterdeckung: string | null = null;
  const punkte: WochePunkt[] = [];

  for (let i = 0; i < wochen; i++) {
    const wStart = jetzt + i * WOCHE;
    const wEnd = wStart + WOCHE;
    let zufluss = 0;
    for (const r of offene) {
      const rest = leseZahlOder(r.rest, 0);
      if (rest <= 0) continue;
      const t = zeitMs(r.faelligkeitsdatum);
      if (t <= 0) continue; // ohne Termin: nicht einplanen
      const einplanen = i === 0 ? t < wEnd : (t >= wStart && t < wEnd); // Woche 1 fängt Überfällige mit ab
      if (einplanen) zufluss += rest;
    }
    zufluss = r2(zufluss);
    const abfluss = fpw;
    saldo = r2(saldo + zufluss - abfluss);
    summeZufluss = r2(summeZufluss + zufluss);
    summeAbfluss = r2(summeAbfluss + abfluss);
    const unterdeckung = saldo < 0;
    const startIso = new Date(wStart).toISOString();
    if (unterdeckung && !ersteUnterdeckung) ersteUnterdeckung = startIso;
    punkte.push({ start: startIso, label: ddmm(wStart), zufluss, abfluss, saldo, unterdeckung });
  }

  return {
    punkte,
    startSaldo: r2(e.startSaldo),
    endSaldo: saldo,
    summeZufluss,
    summeAbfluss,
    fixkostenProWoche: fpw,
    ueberfaellig: r2(ueberfaellig),
    offeneOhneTermin: r2(offeneOhneTermin),
    ersteUnterdeckung,
  };
}
