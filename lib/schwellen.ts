// ============================================================================
// ARGONAUT OS · lib/schwellen.ts — zentrale Grenzwerte der Regel-Ebene
//
// EINE Stelle für alle Schwellenwerte ("Geschäftslogik"). Nie in Modulen
// verstreut — hier anpassen, überall wirksam. (Leitplanke 2 aus dem Grundsatz-
// dokument „Die Regel-Ebene & das KI-Auge".)
// ============================================================================

export const SCHWELLEN = {
  rechnung: {
    dringendProzent: 10,   // offen/gesamt > 10 % -> dringend eintreiben
    beobachtenProzent: 5,  // > 5 % -> im Auge behalten
    dsoWarnTage: 30,       // Ø Zahlungsdauer über 30 Tagen -> Hinweis
  },
  crm: {
    tageOhneKontakt: 90,   // > 90 Tage kein Kontakt + hoher Wert -> anrufen
  },
  fristen: {
    dieseWocheTage: 7,     // fällig in <= 7 Tagen = "diese Woche"
    baldTage: 3,           // <= 3 Tage = besonders dringend
  },
  ki: {
    rateLimitProMinute: 20,   // max. KI-Aufrufe je Nutzer/Minute (Bot-/Endlosschleifen-Schutz)
    kostenAlarmTagUsd: 5,     // Tages-KI-Kosten je KUNDE über diesem Wert -> Warnmail an den Betreiber
    demoKiProTag: 40,         // harte Obergrenze KI-Aufrufe je DEMO-Konto pro Tag (rollende 24 h)

    /**
     * Harte Tages-Obergrenze je NUTZER, gestaffelt nach dem bezahlten Sitz-Typ
     * (rollende 24 h). Die Werte liegen bewusst zwei- bis fuenffach ueber dem,
     * was ein begeisterter Nutzer am Tag schafft — echte Arbeit stoesst nie an,
     * ein Skript oder eine Endlosschleife schon.
     *
     * Kalkulation (Durchschnittskosten ~1 US-Cent je Aufruf):
     *   voll  150/Tag -> max. ~28 EUR/Monat bei 190-420 EUR Sitzpreis  (85-93 % Marge)
     *   std    60/Tag -> max. ~11 EUR/Monat bei 125-190 EUR Sitzpreis  (87-93 % Marge)
     *   self   15/Tag -> max. ~2,80 EUR/Monat bei 14-19 EUR Sitzpreis  (80-85 % Marge)
     * AGB § 9.3 deckt die Begrenzung ausdruecklich ab.
     */
    tagProSitz: { voll: 150, standard: 60, self_service: 15 } as Record<string, number>,

    /** Ab diesem Anteil des Firmen-Topfs geht eine Warnmail an den Betreiber. */
    warnAbProzent: 70,

    /**
     * STILLER PUFFER. Der Firmen-Topf (Summe der Sitz-Kontingente) ist die
     * Groesse, die wir dem Kunden gegenueber vertreten. Die HARTE Sperre liegt
     * beim Doppelten: dazwischen laeuft alles normal weiter, der Kunde merkt
     * nichts — nur der Betreiber bekommt den Bericht.
     *
     * Warum ein Topf statt einer Grenze je Nutzer: Die Nutzung ist in jedem
     * Betrieb ungleich verteilt. Zwei, drei Poweruser machen den Grossteil,
     * viele Kollegen fassen die KI kaum an. Eine Einzelgrenze wuerde genau die
     * produktivsten Leute ausbremsen, waehrend daneben Kontingente verfallen.
     */
    pufferFaktor: 2,
  },
} as const;
