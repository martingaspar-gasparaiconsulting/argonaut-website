// ============================================================================
// ARGONAUT OS · lib/bankarbeitstag.ts — ist das ein Tag, an dem Banken buchen?
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT (Punkt 64, 22.09.2026) ▄▄▄
// Eine SEPA-Datei traegt ein Faelligkeitsdatum. Faellt es auf ein Wochenende
// oder einen Feiertag, bucht keine Bank an diesem Tag — der Einzug rutscht auf
// den naechsten Banktag, ohne dass jemand im Betrieb davon erfaehrt. Wer den
// Beitrag zum Monatsletzten erwartet, wundert sich dann ueber die Verspaetung.
//
// ▄▄▄ WAS DIESE DATEI AUSDRUECKLICH NICHT TUT ▄▄▄
// Sie SPERRT NICHTS. Sie liefert einen Hinweis. Ein Betrieb darf jedes Datum
// eintragen, das er fuer richtig haelt — Banken verschieben selbst, und ein
// falscher Alarm duerfte niemanden vom Einziehen abhalten.
//
// ▄▄▄ WELCHE TAGE ▄▄▄
// Massgeblich fuer den Euro-Zahlungsverkehr ist der TARGET2-Kalender; er gilt
// bundesweit einheitlich, anders als die Laender-Feiertage. Geschlossen sind:
// Samstag, Sonntag, Neujahr, Karfreitag, Ostermontag, 1. Mai, 25. und 26.
// Dezember. Dazu kommen Heiligabend und Silvester: TARGET2 laeuft zwar, die
// deutschen Kreditinstitute haben nach ihren AGB aber keinen Geschaeftstag.
// Ostern kommt aus lib/feiertage.ts (Gauss/Meeus), damit es EINE Osterformel
// im Haus gibt.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

import { osterSonntag } from './feiertage';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }
function isoUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function zuUTC(datum: string): Date | null {
  const m = ISO.exec((datum ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Fuer den 31.02. legt Date.UTC still den 03.03. an — das faellt hier auf.
  return isoUTC(d) === m[0] ? d : null;
}
function plusTage(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400000); }

/**
 * Die geschlossenen Tage eines Jahres als Datumsmenge ('YYYY-MM-DD').
 * Wochenenden sind NICHT enthalten — die werden ueber den Wochentag erkannt.
 */
export function bankfeiertage(jahr: number): Set<string> {
  const ostern = osterSonntag(jahr);
  return new Set([
    `${jahr}-01-01`,
    isoUTC(plusTage(ostern, -2)),   // Karfreitag
    isoUTC(plusTage(ostern, 1)),    // Ostermontag
    `${jahr}-05-01`,
    `${jahr}-12-24`,                // Heiligabend: Banken geschlossen
    `${jahr}-12-25`,
    `${jahr}-12-26`,
    `${jahr}-12-31`,                // Silvester: Banken geschlossen
  ]);
}

/** Bucht an diesem Tag eine Bank? Unlesbares Datum gilt als "kein Urteil" (true). */
export function istBankarbeitstag(datum: string): boolean {
  const d = zuUTC(datum);
  if (!d) return true;
  const wt = d.getUTCDay();
  if (wt === 0 || wt === 6) return false;
  return !bankfeiertage(d.getUTCFullYear()).has(isoUTC(d));
}

/** Der naechste Tag, an dem gebucht wird — der Tag selbst, wenn er schon einer ist. */
export function naechsterBankarbeitstag(datum: string): string {
  let d = zuUTC(datum);
  if (!d) return datum;
  let schutz = 0;
  while (!istBankarbeitstag(isoUTC(d)) && schutz < 30) { d = plusTage(d, 1); schutz++; }
  return isoUTC(d);
}

/** Wochentag ausgeschrieben, fuer den Hinweistext. */
const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function deutsch(datum: string): string {
  const m = ISO.exec(datum);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : datum;
}

/**
 * Der Hinweis fuer den Betrieb — null, wenn alles in Ordnung ist.
 * WARNUNG, KEINE SPERRE: der Aufrufer zeigt den Text an und laesst den
 * Betrieb trotzdem weitermachen.
 */
export function bankarbeitstagHinweis(datum: string): string | null {
  const d = zuUTC(datum);
  if (!d) return null;
  if (istBankarbeitstag(datum)) return null;
  const wt = d.getUTCDay();
  const grund = (wt === 0 || wt === 6)
    ? `ein ${WOCHENTAG[wt]}`
    : 'ein Tag, an dem die Banken geschlossen haben';
  const naechster = naechsterBankarbeitstag(datum);
  // Kundentext: mit „Sie“ und mit echten Umlauten — er steht so im Bildschirm.
  return `Hinweis: Der ${deutsch(datum)} ist ${grund}. Banken buchen an diesem Tag nicht — `
    + `der Einzug erfolgt voraussichtlich erst am ${deutsch(naechster)}. `
    + `Sie können das Datum so lassen; die Bank verschiebt selbst.`;
}
