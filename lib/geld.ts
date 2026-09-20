// lib/geld.ts
// ============================================================================
// DIE EINE GELD-ANZEIGE (Punkt 30, 20.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Am 20.09. wurden alle 220 Logik-Dateien in lib/ und
// app/dashboard/_components/ durchsucht. Ergebnis: FUENFUNDZWANZIG eigene
// Geld-Formatierer (der Pruefbefund sprach von zwei) und FUENFUNDDREISSIG
// eigene Cent-Runder (der Pruefbefund sprach von drei).
//
// Sie antworten bei DERSELBEN Eingabe verschieden — alles GEMESSEN:
//
//   Eingabe 1234.5      -> "1.234,50 €" · "1.234,5 €" · "1.235 €"
//                          Eine Stelle rundet einen halben Euro einfach weg.
//
//   Eingabe null        -> "—" · "" · "0,00 €" · "0 €" · ABSTURZ
//                          Fuenf verschiedene Antworten auf "ich weiss es
//                          nicht". Die gefaehrlichste ist "0,00 €": aus
//                          einem unbekannten Wert wird stillschweigend eine
//                          Null, und niemand sieht den Unterschied zwischen
//                          "kostet nichts" und "wurde nie erfasst".
//                          tarif.euro stuerzt dabei sogar ab (TypeError).
//
//   Eingabe NaN         -> SECHS verschiedene Antworten, darunter "NaN €".
//                          Das steht dann auf einem Beleg beim Kunden.
//
// ▄▄▄ DIE REGELN DIESER DATEI ▄▄▄
//  1. EIN FEHLENDER WERT IST KEINE NULL. null, undefined, leerer Text und
//     alles Unlesbare ergeben den Platzhalter — sichtbar, nicht still.
//  2. Geld hat IMMER zwei Nachkommastellen. Wer ganze Euro will, nimmt
//     euroKurz() und sagt damit, dass gerundet wird.
//  3. Es gibt nie "NaN €", und es stuerzt nie ab.
//  4. Das Leerzeichen vor dem € ist geschuetzt (U+00A0), wie es die
//     deutsche Schreibweise verlangt — sonst bricht die Zeile davor um.
//  5. Wo eine Null wirklich eine Null ist (Summenzeilen, Salden), gibt es
//     euroOderNull(). Dort steht sie dann bewusst da.
//
// Gelesen wird ueber lib/zahlen.ts, also auch "1.234,56" und "5,00 EUR".
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln.
// Node-getestet: tests/geldP30.test.mjs
// ============================================================================

import { leseZahl, centRunden } from './zahlen';

/** Was dasteht, wenn ein Betrag nicht bekannt ist. Nie "0,00 €". */
export const PLATZHALTER = '—';

/**
 * Ein Geldbetrag fuer die Anzeige: "1.234,50 €".
 *
 * Ein nicht lesbarer oder fehlender Wert ergibt den Platzhalter — NICHT
 * "0,00 €". Der Unterschied zwischen "kostet nichts" und "wurde nie
 * erfasst" muss sichtbar bleiben.
 */
export function euro(wert: unknown, platzhalter: string = PLATZHALTER): string {
  const n = leseZahl(wert);
  if (n === null) return platzhalter;
  return centRunden(n).toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/**
 * Wie euro(), aber ein fehlender Wert IST eine Null.
 *
 * Nur dort verwenden, wo die Null fachlich stimmt: Summenzeilen, Salden,
 * Kennzahlen ueber einen leeren Zeitraum. Nicht bei Einzelpositionen.
 */
export function euroOderNull(wert: unknown): string {
  return euro(wert, euro(0));
}

/**
 * Ganze Euro, fuer Kacheln und Uebersichten: "1.235 €".
 *
 * Der Name sagt, dass gerundet wird — anders als bisher, wo eine Stelle
 * still mit maximumFractionDigits: 0 arbeitete und dabei einen halben Euro
 * verschwinden liess, ohne dass es jemand am Aufruf sehen konnte.
 * NIE auf einem Beleg verwenden, nur in Uebersichten.
 */
export function euroKurz(wert: unknown, platzhalter: string = PLATZHALTER): string {
  const n = leseZahl(wert);
  if (n === null) return platzhalter;
  return Math.round(n).toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

/**
 * Ein Prozentsatz: "7,5 %". Fehlender Wert ergibt den Platzhalter.
 * Das Leerzeichen vor dem Prozentzeichen ist geschuetzt.
 */
export function prozent(wert: unknown, stellen = 1, platzhalter: string = PLATZHALTER): string {
  const n = leseZahl(wert);
  if (n === null) return platzhalter;
  return n.toLocaleString('de-DE', {
    minimumFractionDigits: 0, maximumFractionDigits: stellen,
  }) + ' %';
}

/**
 * Eine Menge mit Einheit: "8,00 SRM". Fehlender Wert ergibt den Platzhalter.
 * Ohne Einheit nur die Zahl.
 */
export function menge(wert: unknown, einheit = '', stellen = 2, platzhalter: string = PLATZHALTER): string {
  const n = leseZahl(wert);
  if (n === null) return platzhalter;
  const zahlText = n.toLocaleString('de-DE', {
    minimumFractionDigits: stellen, maximumFractionDigits: stellen,
  });
  return einheit ? `${zahlText} ${einheit}` : zahlText;
}

/**
 * Ist dieser Wert ueberhaupt ein anzeigbarer Betrag?
 * Fuer Stellen, die zwischen "0,00 €" und "nicht erfasst" unterscheiden
 * muessen, bevor sie etwas anzeigen.
 */
export function istBetrag(wert: unknown): boolean {
  return leseZahl(wert) !== null;
}
