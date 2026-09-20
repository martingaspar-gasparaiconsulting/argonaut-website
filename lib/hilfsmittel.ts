// lib/hilfsmittel.ts
// A12 · Hilfsmittel-Versorgung — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (hilfsmittel.test.mjs, 10/10).
//
// Hilfsmittelverzeichnis nach §139 SGB V (GKV-Spitzenverband): 10-stellige
// Hilfsmittelnummer. Ablauf Verordnung → Kostenvoranschlag → Genehmigung → Versorgung.

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

export const VERSORGUNG_STATUS = ['verordnet', 'kv_gesendet', 'genehmigt', 'abgelehnt', 'versorgt', 'abgerechnet'] as const;
export type VersorgungStatus = typeof VERSORGUNG_STATUS[number];

/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

export interface HmPos { menge?: number | null; einzelpreis?: number | null; mehrkosten?: number | null }

/** Kassenanteil-Summe (Menge × Einzelpreis). */
export function kvSumme(pos: HmPos[]): number {
  return r2(pos.reduce((a, p) => a + z(p.menge) * z(p.einzelpreis), 0));
}

/** Summe der Mehrkosten / wirtschaftlichen Aufzahlung (Menge × Mehrkosten). */
export function mehrkostenSumme(pos: HmPos[]): number {
  return r2(pos.reduce((a, p) => a + z(p.menge) * z(p.mehrkosten), 0));
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
