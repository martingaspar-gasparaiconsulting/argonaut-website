// ============================================================================
// ARGONAUT OS · lib/belegCheck.ts — Prüfungen für die Beleg-Erfassung
//
// Reine, node-testbare Logik: (1) Konsistenz Netto + USt ≈ Brutto, (2) Dubletten-
// Erkennung (gleiche Belegnummer + Lieferant). KEINE Netzwerk-/React-Abhängigkeit.
// Die Seite zeigt daraus dezente, NICHT blockierende Warnungen + Ein-Klick-Fix.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';

/**
 * Auf Cent runden — ueber den einen Zahlen-Leser (lib/zahlen.ts).
 *
 * Punkt 30, 21.09.2026. Zwei Fehler, beide GEMESSEN:
 *  1. Number(n) || 0 machte aus "1.234,56" (so liefert eine numeric-Spalte
 *     oft, und so kommt es aus der Belegerkennung) still die Zahl 0. Die
 *     Konsistenzpruefung verglich dann 0 mit dem Brutto und warnte, obwohl
 *     der Beleg stimmte.
 *  2. Die alte Rundung kippte bei negativen Werten nach oben. Die
 *     Differenz Brutto minus (Netto + USt) ist per Definition beidseitig.
 */
function r2(n: unknown): number { return centRunden(leseZahlOder(n, 0)); }

export type Konsistenz = {
  geprueft: boolean;   // false, wenn Netto oder Brutto fehlt
  stimmt: boolean;     // Netto + USt ≈ Brutto (mit Toleranz)
  bruttoSoll: number;  // Netto + USt
  differenz: number;   // Brutto − (Netto + USt)
};

/**
 * Prüft, ob Netto + USt zum Brutto passt. Toleranz: max(2 Cent, 0,5 % vom
 * Brutto) — deckt OCR-/Rundungsunschärfen ab. Fehlt Netto oder Brutto, wird
 * nicht geprüft (geprueft=false, stimmt=true → keine Warnung).
 */
export function pruefeKonsistenz(netto: unknown, ust: unknown, brutto: unknown): Konsistenz {
  if (netto == null || brutto == null) return { geprueft: false, stimmt: true, bruttoSoll: 0, differenz: 0 };
  const nettoZ = leseZahlOder(netto, 0);
  const ustZ = leseZahlOder(ust, 0);
  const bruttoZ = leseZahlOder(brutto, 0);
  const soll = centRunden(nettoZ + ustZ);
  const diff = centRunden(bruttoZ - soll);
  const tol = Math.max(0.02, Math.abs(bruttoZ) * 0.005);
  return { geprueft: true, stimmt: Math.abs(diff) <= tol, bruttoSoll: soll, differenz: diff };
}

/** Text normalisieren (klein, Leerraum zusammen) für Vergleiche. */
export function normStr(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}
/** Belegnummer normalisieren: klein, ohne Leerzeichen/Punkt/Slash/Bindestrich/Unterstrich. */
export function normNummer(s: unknown): string {
  return String(s ?? '').trim().toLowerCase().replace(/[\s._/\\-]/g, '');
}

export type BelegRef = { id?: string; belegnummer?: string | null; lieferant?: string | null };

/**
 * Ist der Kandidat eine Dublette in der Liste? Kriterium: gleiche (normalisierte)
 * Belegnummer UND gleicher (normalisierter) Lieferant. Ohne Belegnummer keine
 * Warnung (zu unsicher). `aktuelleId` schließt den gerade bearbeiteten Beleg aus.
 */
export function istDublette(kandidat: BelegRef, liste: BelegRef[], aktuelleId?: string | null): boolean {
  const nummer = normNummer(kandidat.belegnummer);
  if (!nummer) return false;
  const lief = normStr(kandidat.lieferant);
  return (liste || []).some((b) =>
    (aktuelleId ? b.id !== aktuelleId : true) &&
    normNummer(b.belegnummer) === nummer &&
    normStr(b.lieferant) === lief,
  );
}
