// lib/hilfsmittel.ts
// A12 · Hilfsmittel-Versorgung — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (hilfsmittel.test.mjs, 10/10).
//
// Hilfsmittelverzeichnis nach §139 SGB V (GKV-Spitzenverband): 10-stellige
// Hilfsmittelnummer. Ablauf Verordnung → Kostenvoranschlag → Genehmigung → Versorgung.

export const VERSORGUNG_STATUS = ['verordnet', 'kv_gesendet', 'genehmigt', 'abgelehnt', 'versorgt', 'abgerechnet'] as const;
export type VersorgungStatus = typeof VERSORGUNG_STATUS[number];

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }

export interface HmPos { menge?: number | null; einzelpreis?: number | null; mehrkosten?: number | null }

/** Kassenanteil-Summe (Menge × Einzelpreis). */
export function kvSumme(pos: HmPos[]): number {
  return r2(pos.reduce((a, p) => a + (Number(p.menge) || 0) * (Number(p.einzelpreis) || 0), 0));
}

/** Summe der Mehrkosten / wirtschaftlichen Aufzahlung (Menge × Mehrkosten). */
export function mehrkostenSumme(pos: HmPos[]): number {
  return r2(pos.reduce((a, p) => a + (Number(p.menge) || 0) * (Number(p.mehrkosten) || 0), 0));
}

/** Gesamtsumme = Kassenanteil + Mehrkosten. */
export function gesamtSumme(pos: HmPos[]): number {
  return r2(kvSumme(pos) + mehrkostenSumme(pos));
}

/** Prüft, ob eine Hilfsmittelnummer 10 Ziffern hat (Punkte/Trennzeichen erlaubt). */
export function hmvGueltig(nummer: string): boolean {
  return String(nummer || '').replace(/\D/g, '').length === 10;
}

export interface HmKennzahlen {
  gesamt: number;
  offen: number;
  wartetGenehmigung: number;
  abgerechnet: number;
}

export function zaehleVersorgung(versorgungen: { status?: string }[]): HmKennzahlen {
  return {
    gesamt: versorgungen.length,
    offen: versorgungen.filter((x) => ['verordnet', 'kv_gesendet', 'genehmigt'].includes(x.status ?? '')).length,
    wartetGenehmigung: versorgungen.filter((x) => x.status === 'kv_gesendet').length,
    abgerechnet: versorgungen.filter((x) => x.status === 'abgerechnet').length,
  };
}
