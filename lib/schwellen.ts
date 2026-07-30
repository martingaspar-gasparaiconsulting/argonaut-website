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
    kostenAlarmTagUsd: 5,     // Tages-KI-Kosten je Kunde über diesem Wert -> Alarm im Command Center
    demoKiProTag: 40,         // (Punkt 28) harte Obergrenze KI-Aufrufe je DEMO-Konto pro Tag (rollende 24 h) — Kosten-Schutz
  },
} as const;
