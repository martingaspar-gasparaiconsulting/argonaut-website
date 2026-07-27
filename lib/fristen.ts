// lib/fristen.ts
// A7 · Kanzlei — Akten & Fristen — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (fristen.test.mjs, 11/11).
//
// Anwaltliche Fristenkontrolle: jede Frist hat eine Vorfrist (Vorwarnfenster).
// Regelverjährung §195 BGB: 3 Jahre, Beginn Schluss des Jahres der Entstehung (§199).

export const VORFRIST_TAGE_STD = 7;

export const FRIST_ARTEN = ['notfrist', 'verjaehrung', 'wiedervorlage', 'termin', 'sonstige'] as const;
export type FristArt = typeof FRIST_ARTEN[number];

const MS_TAG = 86400000;

function tagUTC(v: string | Date): number {
  const s = String(v);
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  return (y && m && d) ? Date.UTC(y, m - 1, d) : NaN;
}

/** Ganze Tage zwischen zwei Datumsangaben (Datums-Anteil, DST-sicher). */
export function tageDiff(von: string | Date, bis: string | Date): number {
  return Math.round((tagUTC(bis) - tagUTC(von)) / MS_TAG);
}

/** Verbleibende Tage bis zur Frist (positiv = Zukunft, negativ = überfällig). */
export function restTage(fristDatum: string | Date, heute: string | Date = new Date()): number {
  return tageDiff(heute, fristDatum);
}

export type FristStatus = 'erledigt' | 'ueberfaellig' | 'heute' | 'vorfrist' | 'offen';

/** Ampel-Status einer Frist unter Berücksichtigung der Vorfrist. */
export function fristStatus(
  fristDatum: string | Date, vorfristTage: number = VORFRIST_TAGE_STD,
  erledigt = false, heute: string | Date = new Date(),
): FristStatus {
  if (erledigt) return 'erledigt';
  const r = restTage(fristDatum, heute);
  if (r < 0) return 'ueberfaellig';
  if (r === 0) return 'heute';
  if (r <= vorfristTage) return 'vorfrist';
  return 'offen';
}

/** Regelverjährungs-Ende (§195/§199 BGB): 31.12. des Jahres Entstehung + jahre (Default 3). */
export function verjaehrungEnde(entstehungDatum: string | Date, jahre = 3): string {
  const y = Number(String(entstehungDatum).slice(0, 4));
  return `${y + jahre}-12-31`;
}

export interface FristKennzahlen {
  offen: number;
  ueberfaellig: number;
  vorfrist: number;
  erledigt: number;
}

/** KPI-Zähler über eine Liste Fristen (vorfrist inkl. heute fällig). */
export function zaehleFristen(
  fristen: { frist_datum: string; vorfrist_tage?: number | null; erledigt?: boolean }[],
  heute: string | Date = new Date(),
): FristKennzahlen {
  const offenL = fristen.filter((f) => !f.erledigt);
  let ueberfaellig = 0, vorfrist = 0;
  for (const f of offenL) {
    const r = restTage(f.frist_datum, heute);
    const vf = f.vorfrist_tage ?? VORFRIST_TAGE_STD;
    if (r < 0) ueberfaellig++;
    else if (r <= vf) vorfrist++;
  }
  return { offen: offenL.length, ueberfaellig, vorfrist, erledigt: fristen.length - offenL.length };
}
