// ============================================================================
// ARGONAUT OS · lib/kiModelle.ts — welches KI-Modell für welche Aufgabe (Paket 193)
//
// Martin 30.09.2026: „Wir sind ein Premium-Dienstleister" — genau so gebaut:
//   schnell        (Haiku 4.5)   kurz, intern, viel Menge: Chats, Belege lesen,
//                                Zusammenfassen, Wochenfokus, Foto-Einschätzung
//   professionell  (Sonnet 5.5)  alles, was ein Kunde liest oder nach Qualität
//                                aussehen muss: Kundentexte, Webseite, Marketing,
//                                Auswertungen, Übersetzungen, Hilfe (Auge)
//   premium        (Opus 5.5)    selten, aber heikel/gewichtig: Strategie,
//                                Arbeitszeugnis/Stellen, Personal-Auswertung,
//                                Presse, E-Book
//
// EINE Stelle: Jede KI-Funktion fragt modellFuer('<aufgabe>'). Umstellen =
// eine Zeile in KI_AUFGABEN (Stufe) oder in KI_STUFEN (Modell der Stufe).
// Neue Funktionen (Bauliste B1–B11) tragen sich hier mit ihrer Aufgabe ein —
// ein Test (tests/kiModelleP193) verhindert Modellnamen irgendwo anders.
//
// Preise (Anthropic, abgerufen 30.09.2026, USD je 1 Mio. Token rein/raus):
//   Haiku 4.5 1/5 · Sonnet 5.5 2/10 · Opus 5.5 4/20 — siehe lib/kiPreise.ts.
// Rein, ohne Importe.
// ============================================================================

export type KiStufe = 'schnell' | 'professionell' | 'premium';

/** Modell je Stufe. Ein Modellwechsel für alle Aufgaben einer Stufe = eine Zeile. */
export const KI_STUFEN: Record<KiStufe, string> = {
  schnell: 'claude-haiku-4-5',
  professionell: 'claude-sonnet-5-5',
  premium: 'claude-opus-5-5',
};

/** Aufgabe -> Stufe. Reihenfolge nach Bereichen; `geplant` = Funktion kommt noch (Bauliste). */
export const KI_AUFGABEN = {
  // ── schnell: intern, kurz, viel Menge ──────────────────────────────────
  'chat.cockpit': 'schnell',
  'chat.dashboard': 'schnell',
  'chat.mitarbeiter': 'schnell',
  'chat.team': 'schnell',
  'chat.allgemein': 'schnell',
  'sachbearbeiter.postfach': 'schnell',
  'beleg.lesen': 'schnell',
  'visitenkarte.lesen': 'schnell',
  'kfz.schein.lesen': 'schnell',   // Paket 307: Fahrzeugschein in der Fahrzeugmappe (nur Vorschlag, Verkäufer bestätigt)
  'gespraech.protokoll': 'schnell',
  'crm.sprachnotiz': 'schnell',
  'crm.wochenfokus': 'schnell',
  'ki.klartext': 'schnell',
  'bau.foto': 'schnell',
  'erp.bestellvorschlag': 'schnell',
  // KI-Berater auf KUNDEN-Webseiten (Zusatzmodul 49 € / 1.000 bzw. 99 € / 3.000 Gespräche,
  // lib/chatDeckel). Mit „professionell" kostet ein Gespräch rund 3,8 statt 1,9 Cent —
  // 3.000 Gespräche wären ~114 € bei 99 € Einnahme. Deshalb bewusst schnell, bis die
  // Stufenpreise angepasst sind (Entscheidung Martin, Claude-Befund 30.09.).
  'chat.webseite': 'schnell',

  // ── professionell: Kunden lesen es / muss nach Qualität aussehen ──────
  'beleg.nachpruefen': 'professionell',
  'ki.auge': 'professionell',
  'kunde.followup': 'professionell',
  'kunde.ticketantwort': 'professionell',
  'kunde.mahnung': 'professionell',
  'kunde.kuendigung': 'professionell',
  'kunde.brief': 'professionell',
  'angebot.text': 'professionell',
  'angebot.sprache': 'professionell',
  'auftrag.positionen': 'professionell',
  'webseite.komplett': 'professionell',
  'webseite.text': 'professionell',
  'shop.produkttext': 'professionell',
  'chat.branche': 'professionell',
  'marketing.content': 'professionell',
  'marketing.contentfliessband': 'professionell',
  'marketing.videoskript': 'professionell',
  'marketing.seo': 'professionell',
  'marketing.lagebericht': 'professionell',
  'marketing.roi': 'professionell',
  'analyse.website': 'professionell',
  'crm.briefing': 'professionell',
  'projekt.statusbericht': 'professionell',
  'projekt.setup': 'professionell',
  'uebersetzung': 'professionell',
  'ablauf.baustein': 'professionell',
  'academy.aufbereiten': 'professionell',
  'ausschreibung.radar': 'professionell',
  'import.preise': 'professionell',
  'import.lieferanten': 'professionell',
  'import.aufraeumen': 'professionell',
  'textmotor.gliederung': 'professionell',
  'textmotor.ratgeber': 'professionell',
  'argonaut.inhalte': 'professionell',

  // ── premium: selten, aber heikel oder gewichtig ────────────────────────
  'marketing.stratege': 'premium',
  'personal.texte': 'premium',
  'hr.auswertung': 'premium',
  'textmotor.ebook': 'premium',
  'textmotor.presse': 'premium',
  'textmotor.strategie': 'premium',

  // ── geplant (Bauliste) — schon eingetragen, damit der Bau nur andockt ──
  'geplant.webseite.firmenwissen': 'professionell', // B3 Website-Texte aus Firmenwissen
  'geplant.verzeichnis.eintrag': 'professionell',   // B5 Branchenverzeichnis-Eintrag
  'geplant.telefon.assistent': 'professionell',     // B2 KI-Telefonassistent (Zusammenfassung/Antwort)
  'geplant.dossier.branche': 'premium',             // B11 Branchen-Dossiers
} as const satisfies Record<string, KiStufe>;

export type KiAufgabe = keyof typeof KI_AUFGABEN;

/** Das Modell für eine Aufgabe. Unbekannte Aufgabe (nur ohne Typprüfung möglich) -> professionell. */
export function modellFuer(aufgabe: KiAufgabe): string {
  const stufe = (KI_AUFGABEN as Record<string, KiStufe>)[aufgabe] ?? 'professionell';
  return KI_STUFEN[stufe];
}

/** Stufe einer Aufgabe (für Anzeige, z. B. Command Center). */
export function stufeFuer(aufgabe: KiAufgabe): KiStufe {
  return (KI_AUFGABEN as Record<string, KiStufe>)[aufgabe] ?? 'professionell';
}
