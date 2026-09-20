// lib/spenden.ts
// A9 · Spenden / Zuwendungsnachweis — reine Formeln & Logik.
// KEINE Hooks, KEINE Supabase-Aufrufe. Node-getestet (spenden.test.mjs, 18/18).
//
// Vereinfachter Nachweis bis 300 € (verifiziert 07/2026); darüber
// Zuwendungsbestätigung nach amtlichem Muster (§50 EStDV) — dort ist der
// Betrag in Buchstaben anzugeben (euroInWorten).

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

export const KLEINBETRAG_GRENZE = 300;

export const SPENDE_ARTEN = ['geldzuwendung', 'sachzuwendung', 'aufwandsverzicht'] as const;
export type SpendeArt = typeof SPENDE_ARTEN[number];

/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

const EINER = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const ZEHNER = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];

function unter100(n: number): string {
  if (n < 20) return EINER[n];
  const t = Math.floor(n / 10), e = n % 10;
  if (e === 0) return ZEHNER[t];
  return (e === 1 ? 'ein' : EINER[e]) + 'und' + ZEHNER[t];
}
function unter1000(n: number): string {
  const h = Math.floor(n / 100), rest = n % 100;
  let s = '';
  if (h > 0) s += (h === 1 ? 'ein' : EINER[h]) + 'hundert';
  if (rest > 0) s += unter100(rest);
  return s;
}

/** Ganze Zahl (0 … 999.999.999) in deutschen Worten. */
export function zahlInWorten(n: number): string {
  n = Math.floor(z(n));
  if (n === 0) return 'null';
  if (n < 0) return 'minus ' + zahlInWorten(-n);
  const mio = Math.floor(n / 1000000), tsd = Math.floor((n % 1000000) / 1000), rest = n % 1000;
  let s = '';
  if (mio > 0) s += (mio === 1 ? 'eine Million ' : unter1000(mio) + ' Millionen ');
  if (tsd > 0) s += (tsd === 1 ? 'ein' : unter1000(tsd)) + 'tausend';
  if (rest > 0) s += unter1000(rest);
  return s.trim();
}

/** Betrag in Buchstaben für die Zuwendungsbestätigung, z. B. "Einhundertfünfzig Euro". */
export function euroInWorten(betrag: number): string {
  const euros = Math.floor(z(betrag));
  const cents = Math.round((z(betrag) - euros) * 100);
  let s = zahlInWorten(euros) + ' Euro';
  if (cents > 0) s += ' und ' + cents + ' Cent';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Bis 300 € genügt der vereinfachte Nachweis (keine formelle Bestätigung nötig). */
export function kleinbetrag(betrag: number): boolean {
  return z(betrag) <= KLEINBETRAG_GRENZE;
}

function jahrVon(d: string | Date): number { return Number(String(d).slice(0, 4)); }

export interface SpendenKennzahlen {
  anzahlJahr: number;
  summeJahr: number;
  offeneBestaetigungen: number;
}

export function zaehleSpenden(
  spenden: { datum: string; betrag?: number | null; bestaetigt?: boolean }[],
  jahr: number,
): SpendenKennzahlen {
  const jahrS = spenden.filter((s) => jahrVon(s.datum) === jahr);
  return {
    anzahlJahr: jahrS.length,
    summeJahr: r2(jahrS.reduce((a, s) => a + z(s.betrag), 0)),
    offeneBestaetigungen: spenden.filter((s) => !s.bestaetigt).length,
  };
}
