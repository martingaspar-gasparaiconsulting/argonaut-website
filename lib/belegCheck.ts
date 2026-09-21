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
  // --- ab Punkt 65, additiv ---
  /** Die angewandte Toleranz in Euro — damit nachvollziehbar ist, warum etwas durchging. */
  toleranz: number;
  /** Rechnerischer Steuersatz aus USt / Netto, auf eine Stelle gerundet. */
  satzGerechnet: number | null;
  /** Der Satz passt zu keinem deutschen Steuersatz. */
  satzUnueblich: boolean;
  hinweis: string | null;
};

/**
 * PUNKT 65 / R12 (21.09.2026) — DIE MITWACHSENDE TOLERANZ.
 *
 * ▄▄▄ DER BEFUND ▄▄▄
 * Die Toleranz war `max(2 Cent, 0,5 % vom Brutto)` — sie wuchs also mit dem
 * Betrag. Bei einer Rechnung über 10.000 EUR waren das 50,00 EUR: ein echter
 * Übertragungsfehler von 30 EUR rutschte glatt durch, und zwar genau bei den
 * Belegen, bei denen es weh tut.
 *
 * Das ist derselbe Befund wie beim E-Rechnungs-Validator in Punkt 53, nur
 * andersherum: dort war die Toleranz fest und zu grob, hier wächst sie und
 * wird dadurch zu grob.
 *
 * ▄▄▄ WARUM EINE OBERGRENZE UND NICHT EINFACH 2 CENT ▄▄▄
 * Die Toleranz hat einen guten Grund: Ein Beleg aus der Texterkennung ist
 * nicht auf den Cent genau, und die Summe aus gerundeten Positionen weicht
 * von der Kopfsumme ab. Beides wächst ein wenig mit der Zahl der Positionen
 * — aber NICHT mit dem Betrag. Zehn Positionen weichen um Cent ab, egal ob
 * die Rechnung 100 oder 100.000 EUR groß ist.
 *
 * Deshalb: die 0,5 % bleiben für kleine Beträge, werden aber bei 1,00 EUR
 * gedeckelt. Über 200 EUR Rechnungsbetrag ändert sich damit nichts mehr,
 * und ein Fehler von 30 EUR wird gemeldet.
 *
 * ▄▄▄ ZWEITER BEFUND, beim Lesen dazugekommen ▄▄▄
 * Geprüft wurde nur, ob Netto + USt das Brutto ergibt. Ob der SATZ
 * plausibel ist, nicht: netto 100, USt 50, brutto 150 ist in sich stimmig
 * und ging durch — 50 % Umsatzsteuer gibt es aber nicht. Jetzt wird der
 * rechnerische Satz gemeldet, wenn er zu keinem deutschen passt.
 */
export const TOLERANZ_MIN = 0.02;
export const TOLERANZ_PROZENT = 0.5;
/** Obergrenze. Darüber ist eine Abweichung kein Rundungsproblem mehr. */
export const TOLERANZ_MAX = 1.00;

/** Deutsche Umsatzsteuersätze, die auf einem Beleg vorkommen. */
export const UEBLICHE_SAETZE: readonly number[] = [0, 5, 7, 16, 19];

export function toleranzFuer(brutto: number): number {
  const gewachsen = Math.abs(brutto) * (TOLERANZ_PROZENT / 100);
  return centRunden(Math.min(TOLERANZ_MAX, Math.max(TOLERANZ_MIN, gewachsen)));
}

/**
 * Prüft, ob Netto + USt zum Brutto passt. Fehlt Netto oder Brutto, wird
 * nicht geprüft (geprueft=false, stimmt=true → keine Warnung).
 */
export function pruefeKonsistenz(netto: unknown, ust: unknown, brutto: unknown): Konsistenz {
  if (netto == null || brutto == null) {
    return { geprueft: false, stimmt: true, bruttoSoll: 0, differenz: 0, toleranz: 0, satzGerechnet: null, satzUnueblich: false, hinweis: null };
  }
  const nettoZ = leseZahlOder(netto, 0);
  const ustZ = leseZahlOder(ust, 0);
  const bruttoZ = leseZahlOder(brutto, 0);
  const soll = centRunden(nettoZ + ustZ);
  const diff = centRunden(bruttoZ - soll);
  const tol = toleranzFuer(bruttoZ);
  const stimmt = Math.abs(diff) <= tol;

  // Zweiter Befund: der rechnerische Steuersatz.
  const satzGerechnet = nettoZ !== 0 ? Math.round((ustZ / nettoZ) * 1000) / 10 : null;
  const satzUnueblich =
    satzGerechnet !== null &&
    ustZ !== 0 &&
    !UEBLICHE_SAETZE.some((s) => Math.abs(satzGerechnet - s) <= 0.2);

  const teile: string[] = [];
  if (!stimmt) {
    teile.push(
      `Netto und USt ergeben ${soll.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR, ` +
      `auf dem Beleg stehen ${centRunden(bruttoZ).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR ` +
      `— ${Math.abs(diff).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR Abweichung.`,
    );
  }
  if (satzUnueblich) {
    teile.push(
      `Der rechnerische Steuersatz ist ${satzGerechnet?.toLocaleString('de-DE')} % und passt zu keinem deutschen ` +
      `Satz (${UEBLICHE_SAETZE.join(', ')} %). Bitte Netto und USt prüfen.`,
    );
  }

  return {
    geprueft: true,
    stimmt,
    bruttoSoll: soll,
    differenz: diff,
    toleranz: tol,
    satzGerechnet,
    satzUnueblich,
    hinweis: teile.length > 0 ? teile.join(' ') : null,
  };
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
