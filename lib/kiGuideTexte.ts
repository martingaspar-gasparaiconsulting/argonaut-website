// ============================================================================
// ARGONAUT OS · lib/kiGuideTexte.ts  (Avatar · was der Guide sagt)
//
// EINE Stelle fuer alles, was der KI-Guide von sich gibt. Getrennt von der
// Darstellung, damit sich der Ton aendern laesst, ohne eine Oberflaeche
// anzufassen — und damit es sich ohne Browser pruefen laesst.
//
// SPAETER: Hier kommen die Texte je Modul hinein, wenn der Guide von Seite zu
// Seite mitwandert. Die 113 Modul-Kapitel aus der Inhalts-Werkstatt passen
// genau hierher — dann spricht er, was ohnehin schon geschrieben wurde.
//
// „Sie" durchgehend. Keine Werbefloskeln. Reine Rechenlogik.
// ============================================================================

export type Stimmung = 'gut' | 'neutral' | 'achtung';

export type GuideInhalt = {
  begruessung: string;
  nachricht: string;
  schritte: string[];
  aktionText?: string;
  aktionHref?: string;
  stimmung: Stimmung;
  /** 0–100 fuer den Ring um den Guide. */
  fortschritt: number;
};

/** Ab diesem Anteil des KI-Kontingents weist der Guide darauf hin. */
export const KI_HINWEIS_AB_PROZENT = 80;

/**
 * Der Guide auf der Einrichtungsseite.
 *
 * Die drei Zustaende sind bewusst getrennt: „noch nichts", „eingerichtet, aber
 * ohne Zugaenge" und „fertig". Der mittlere ist der haeufigste und der, bei dem
 * ein Betrieb sonst denkt, es sei alles erledigt — dabei laeuft jedes Modul
 * noch im Demo-Modus, weil kein einziger echter Zugang hinterlegt ist.
 */
export function startGuide(o: {
  onboardingFertig: boolean;
  hatZugaenge: boolean;
  kiAnteilProzent?: number;
}): GuideInhalt {
  const fertig = o?.onboardingFertig === true;
  const zugaenge = o?.hatZugaenge === true;
  const anteil = begrenze(o?.kiAnteilProzent);
  const kiKnapp = anteil >= KI_HINWEIS_AB_PROZENT;
  const kiSatz = kiKnapp
    ? ` Ihr KI-Kontingent ist zu ${anteil} Prozent aufgebraucht — behalten Sie das diesen Monat im Blick.`
    : '';

  if (!fertig) {
    return {
      begruessung: 'Willkommen bei ARGONAUT',
      nachricht:
        'Ihr System steht, aber es kennt Ihren Betrieb noch nicht. Die Einrichtung dauert ' +
        'ungefähr zwanzig Minuten und Sie können sie jederzeit unterbrechen.' + kiSatz,
      schritte: [
        'Firmendaten und Logo hinterlegen',
        'Ihre Branche wählen — danach richten sich die Bausteine',
        'Zugänge zu Ihren vorhandenen Werkzeugen eintragen',
      ],
      aktionText: 'Einrichtung starten',
      aktionHref: '/dashboard/onboarding',
      stimmung: kiKnapp ? 'achtung' : 'neutral',
      fortschritt: 20,
    };
  }

  if (!zugaenge) {
    return {
      begruessung: 'Fast fertig',
      nachricht:
        'Die Einrichtung ist durch. Es fehlt noch ein Punkt, den viele übersehen: Solange kein ' +
        'echter Zugang hinterlegt ist, arbeitet jeder Baustein im Demo-Modus — er rechnet richtig, ' +
        'schickt aber nichts nach draußen.' + kiSatz,
      schritte: [
        'Zugänge in der Schnittstellen-Zentrale eintragen',
        'Je Bereich auf „aktiv" stellen',
        'Einen Vorgang zur Probe durchlaufen lassen',
      ],
      aktionText: 'Zugänge eintragen',
      aktionHref: '/dashboard/schnittstellen',
      stimmung: kiKnapp ? 'achtung' : 'neutral',
      fortschritt: 60,
    };
  }

  return {
    begruessung: 'Alles eingerichtet',
    nachricht:
      'Ihr System ist vollständig eingerichtet und die Zugänge sind hinterlegt. Von hier aus ' +
      'geht es in den Alltag.' + kiSatz,
    schritte: [
      'Mitarbeiter einladen und Rechte vergeben',
      'Die Academy für die Einarbeitung nutzen',
      'Wiederkehrende Abläufe im Automations-Bauer hinterlegen',
    ],
    aktionText: 'Zur Übersicht',
    aktionHref: '/dashboard',
    stimmung: kiKnapp ? 'achtung' : 'gut',
    fortschritt: 100,
  };
}

/** Prozentwerte einfangen: nie unter 0, nie über 100, nie NaN. */
export function begrenze(wert: number | null | undefined): number {
  const n = Number(wert);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Aus Verbrauch und Kontingent den Anteil in Prozent. */
export function kiAnteil(verbraucht: number | null | undefined, kontingent: number | null | undefined): number {
  const v = Number(verbraucht);
  const k = Number(kontingent);
  if (!Number.isFinite(v) || !Number.isFinite(k) || k <= 0) return 0;
  return begrenze((v / k) * 100);
}
