// ============================================================================
// ARGONAUT OS · lib/zahlungErfassen.ts — G8 (26.09.2026)
//
// Banking-Abgleich und Seite „Zahlungen" setzten eine Rechnung bisher direkt
// auf „bezahlt" — mit dem VOLLEN Betrag bzw. dem Überweisungsbetrag, aber
// immer mit HEUTE als Zahldatum. Eine Teilzahlung machte die Rechnung damit
// komplett bezahlt, und das Datum stimmte nicht mit dem Konto überein.
// Jetzt wird eine Zahlung in public.zahlungen erfasst (echter Betrag, echtes
// Buchungsdatum); der vorhandene Datenbank-Trigger rechnet daraus Status
// (teilbezahlt / bezahlt) und bezahlten Betrag — wie auf der Rechnungsseite.
// ============================================================================

import { leseZahl } from './zahlen';

/** Buchungsdatum aus Kontoauszug/CSV als JJJJ-MM-TT (DD.MM.JJJJ, DD.MM.JJ, ISO). */
export function buchungsDatumIso(roh: string | null | undefined, ersatz: string): string {
  const s = String(roh ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const j = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${j}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s); // CAMT/MT940 kompakt
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return ersatz;
}

/** Offener Rest einer Rechnung, nie negativ, auf Cent gerundet. */
export function offenerRest(brutto: number | null | undefined, bezahlt: number | null | undefined): number {
  return Math.max(0, Math.round(((Number(brutto) || 0) - (Number(bezahlt) || 0)) * 100) / 100);
}

/** Eingabe „Betrag" prüfen: deutsch gelesen, > 0, höchstens das Doppelte des Rests (Tippfehler-Schutz). */
export function pruefeZahlbetrag(eingabe: string, rest: number): { betrag: number | null; fehler: string | null } {
  const n = leseZahl(eingabe);
  if (n === null || !Number.isFinite(n)) return { betrag: null, fehler: 'Betrag ist nicht lesbar.' };
  if (n <= 0) return { betrag: null, fehler: 'Der Betrag muss größer als 0 sein.' };
  if (rest > 0 && n > rest * 2) return { betrag: null, fehler: 'Der Betrag ist mehr als doppelt so hoch wie der offene Rest — bitte prüfen.' };
  return { betrag: Math.round(n * 100) / 100, fehler: null };
}
