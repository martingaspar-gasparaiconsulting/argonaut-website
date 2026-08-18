// ============================================================================
// ARGONAUT OS · lib/mailBudget.ts  (Post-Deckel)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Resend hat ein TAGESKONTINGENT — im kostenlosen Tarif 100 Mails am Tag.
// Darauf greifen alle Versand-Crons desselben Systems zu:
//
//   05:00  Autoresponder        bis 300 Mails
//   06:00  Termin-Erinnerung
//   06:00  Report-Versand
//   06:15  Wartungs-Erinnerung
//   07:00  Ueberfaellige Rechnungen
//   09:00  Dossier-Sequenz      bis 300 Mails
//
// Der Autoresponter laeuft ZUERST und durfte bis zu 300 Mails verschicken —
// also das Dreifache des ganzen Tageskontingents. An einem starken Tag war
// das Kontingent um 05:05 aufgebraucht, und die Mahnungen um 07:00 fielen
// still aus. Niemand haette es gemerkt: die Fehlschlaege stehen zwar im
// Protokoll, aber sie loesen keinen Alarm aus.
//
// DIE REGEL, DIE HIER DURCHGESETZT WIRD
// Betriebspost hat Vorrang vor Werbepost. Eine Zahlungserinnerung ist fuer
// einen Betrieb mehr wert als die dritte Mail einer Info-Serie. Werbepost
// bekommt deshalb nur einen ANTEIL des Tagesbudgets; der Rest bleibt fuer
// Rechnungen, Termine und Auswertungen reserviert.
//
// Reine Rechenlogik — keine Netzwerk- oder Datenbankaufrufe.
// ============================================================================

/** Tageskontingent des kostenlosen Resend-Tarifs. Bewusst der sichere Wert. */
export const STANDARD_TAGESBUDGET = 100;

/**
 * Obergrenze gegen Vertipper in der Umgebungsvariable. Wer versehentlich
 * 1000000 eintraegt, bekommt trotzdem keinen Massenversand.
 */
export const HOECHSTES_TAGESBUDGET = 50_000;

/** Anteil des Tagesbudgets, den WERBEPOST hoechstens verbrauchen darf. */
export const WERBE_ANTEIL = 0.5;

/**
 * So viele Crons teilen sich den Werbe-Anteil: Autoresponder und
 * Dossier-Sequenz. Kommt einer dazu, gehoert die Zahl hier erhoeht — sonst
 * reissen beide zusammen den Anteil.
 */
export const WERBE_CRONS = 2;

/**
 * Untergrenze je Durchgang. Auch bei einem winzigen Budget soll ein Durchgang
 * etwas ausrichten, statt bei null zu stehen und nie fertig zu werden.
 */
export const MINDESTMENGE = 5;

/**
 * Das Tagesbudget aus der Umgebung lesen.
 *
 * Fehlt die Angabe oder ist sie Unsinn, gilt der SICHERE Wert (kostenloser
 * Tarif). Das ist Absicht: Ein zu niedriger Deckel verzoegert Werbepost um
 * einen Tag, ein zu hoher verbrennt das Kontingent fuer die Mahnungen.
 */
export function tagesBudget(roh?: string | number | null | undefined): number {
  const zahl = typeof roh === 'number' ? roh : Number(String(roh ?? '').trim());
  if (!Number.isFinite(zahl) || zahl <= 0) return STANDARD_TAGESBUDGET;
  return Math.min(Math.floor(zahl), HOECHSTES_TAGESBUDGET);
}

/**
 * Wie viele Mails ein WERBE-Durchgang hoechstens verschicken darf.
 *
 * Beispiel kostenloser Tarif (100/Tag): 100 × 0,5 ÷ 2 Crons = 50 je Cron —
 * die anderen 50 bleiben fuer Rechnungen, Termine und Auswertungen.
 */
export function mengeFuerWerbelauf(budget: number, crons: number = WERBE_CRONS): number {
  const b = Number.isFinite(budget) && budget > 0 ? budget : STANDARD_TAGESBUDGET;
  const c = Number.isFinite(crons) && crons >= 1 ? Math.floor(crons) : 1;
  return Math.max(MINDESTMENGE, Math.floor((b * WERBE_ANTEIL) / c));
}

/** Der Deckel fuer einen Werbe-Cron, direkt aus der Umgebungsvariable. */
export function werbeDeckel(roh?: string | number | null | undefined, crons: number = WERBE_CRONS): number {
  return mengeFuerWerbelauf(tagesBudget(roh), crons);
}

/**
 * Ein Satz fuers Cron-Protokoll — damit beim Nachsehen sofort klar ist,
 * WARUM nur so wenige Mails rausgingen.
 */
export function begruendung(budget: number, deckel: number, verarbeitet: number): string {
  if (verarbeitet < deckel) {
    return `Alles Fällige verschickt (${verarbeitet} von höchstens ${deckel}).`;
  }
  return (
    `Deckel erreicht: ${deckel} Mails in diesem Durchgang. Das Tagesbudget liegt bei ${budget}; ` +
    `die Hälfte davon bleibt für Rechnungen, Termine und Auswertungen reserviert. ` +
    `Der Rest geht im nächsten Durchgang raus.`
  );
}
