// ============================================================================
// ARGONAUT OS · lib/anwaltFreigabe.ts — Schalter fuer Importe, die erst nach
// der rechtlichen Pruefung scharf werden (Paket 153, 28.09.2026)
//
// Martins Vorgabe: Patienten-, Tier-, Hilfsmittel- und Mandantendaten werden
// VORGEBAUT, aber erst freigeschaltet, wenn der Anwalt zugestimmt hat
// (Anwalt-Checkliste R07, R08, R09, R30, R31).
//
// So wird scharf geschaltet: den Bereich unten auf `true` setzen, pushen.
// Mehr nicht. Solange hier `false` steht, lehnt das Import-Center jeden
// Import in diese Ziele ab — auch fuer die Geschaeftsleitung, auch per Link
// (?ziel=…) und auch im Umzug-Stapel.
//
// Unabhaengig vom Schalter: Diese Daten gehen NIE an den KI-Aufraeumer.
//
// Keine Imports — node-testbar, von Client und Server nutzbar.
// ============================================================================

export type AnwaltBereich = 'gesundheit' | 'tier' | 'hilfsmittel' | 'kanzlei';

/** Der Schalter. false = gesperrt bis zur Freigabe durch den Anwalt. */
export const ANWALT_FREIGABE: Readonly<Record<AnwaltBereich, boolean>> = Object.freeze({
  gesundheit: false,
  tier: false,
  hilfsmittel: false,
  kanzlei: false,
});

const GRUND: Record<AnwaltBereich, string> = {
  gesundheit: 'Patienten- und Gesundheitsdaten sind besonders geschützte Daten (Art. 9 DSGVO). '
    + 'Dieser Import ist vorbereitet und wird freigeschaltet, sobald die rechtliche Prüfung abgeschlossen ist.',
  tier: 'Tierakten mit Halterdaten und Behandlungen: Dieser Import ist vorbereitet und wird freigeschaltet, '
    + 'sobald die rechtliche Prüfung abgeschlossen ist.',
  hilfsmittel: 'Hilfsmittel-Versorgungen enthalten Diagnosen und Krankenkassen-Angaben (Gesundheitsdaten). '
    + 'Dieser Import ist vorbereitet und wird freigeschaltet, sobald die rechtliche Prüfung abgeschlossen ist.',
  kanzlei: 'Akten unterliegen der Verschwiegenheitspflicht (§ 203 StGB). '
    + 'Dieser Import ist vorbereitet und wird freigeschaltet, sobald die rechtliche Prüfung abgeschlossen ist.',
};

/**
 * Grund, warum ein Ziel (noch) gesperrt ist — oder null, wenn frei.
 * `freigabe` nur fuer Tests; im Betrieb gilt ANWALT_FREIGABE.
 */
export function anwaltSperrGrund(
  bereich: AnwaltBereich | null | undefined,
  freigabe: Readonly<Record<AnwaltBereich, boolean>> = ANWALT_FREIGABE,
): string | null {
  if (!bereich) return null;
  // Unbekannter Bereich (Tippfehler) -> gesperrt, nie versehentlich frei.
  if (!(bereich in GRUND)) return 'Dieser Import wartet auf die rechtliche Prüfung.';
  return freigabe[bereich] === true ? null : GRUND[bereich];
}

/** Satz fuer den KI-Aufraeumer: gilt IMMER, auch nach der Freigabe. */
export const KI_NIE_GRUND =
  'Gesundheits-, Tier- und Mandantendaten gehen nie an den KI-Dienst. Bitte laden Sie eine Datei (Excel/CSV) aus Ihrem bisherigen Programm hoch.';
