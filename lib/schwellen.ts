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
} as const;
