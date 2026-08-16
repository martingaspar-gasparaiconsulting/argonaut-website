// ============================================================================
// ARGONAUT OS · lib/dsgvoDaten.ts — die Landkarte der personenbezogenen Daten
//
// WARUM DIESE DATEI DAS WICHTIGSTE STUECK VON THEMA 7 IST
// Am 15.08.26 gegen die echte Datenbank geprueft (nicht geraten): An einem
// Kontakt haengen 48 Tabellen. Nur 17 davon ueber einen Fremdschluessel —
// die restlichen 31 tragen eine `kontakt_id` OHNE Verknuepfung. Wer heute im
// CRM auf "Loeschen" drueckt, entfernt die Visitenkarte; Name und Vorgaenge
// dieser Person bleiben in bis zu 31 Tabellen stehen.
//
// Diese Landkarte ist die Grundlage fuer beides:
//   · AUSKUNFT (Art. 15): alles zusammentragen, was zu einer Person da ist
//   · LOESCHUNG (Art. 17): das Richtige entfernen — und das Falsche NICHT
//
// DER PUNKT, AN DEM DSGVO UND HANDELSRECHT SICH WIDERSPRECHEN
// Rechnungen, Buchungen und SEPA-Mandate duerfen NICHT geloescht werden:
// § 147 AO verlangt 10 Jahre Aufbewahrung, und Art. 17 Abs. 3 lit. b DSGVO
// nimmt genau diesen Fall von der Loeschpflicht aus. Ein System, das auf
// Knopfdruck alles loescht, bringt den Betrieb in Schwierigkeiten — nicht die
// Aufsichtsbehoerde, sondern das Finanzamt. Deshalb hat jede Tabelle hier
// eine ausdrueckliche Einstufung.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

/**
 * Was mit den Daten einer Tabelle bei einer Loeschung geschieht.
 *
 * 'loeschen'      — Datensaetze werden entfernt (reine Personendaten)
 * 'anonymisieren' — Datensatz bleibt, der Personenbezug wird entfernt
 *                   (betriebliche Dokumentation: Was wurde gemacht, bleibt;
 *                    fuer WEN, wird geloest)
 * 'behalten'      — bleibt unangetastet (gesetzliche Aufbewahrungspflicht)
 * 'automatisch'   — die Datenbank regelt es selbst (Fremdschluessel)
 */
export type LoeschArt = 'loeschen' | 'anonymisieren' | 'behalten' | 'automatisch';

export type DatenOrt = {
  tabelle: string;
  /** Klartext fuer die Auskunft an die betroffene Person. */
  label: string;
  /** Spalte, ueber die der Bezug laeuft. */
  spalte: string;
  art: LoeschArt;
  /** Warum — erscheint im Loesch-Protokoll und in der Oberflaeche. */
  begruendung: string;
  /** Fuer die Auskunft: soll dieser Bereich mit ausgegeben werden? */
  imExport: boolean;
};

// ---------------------------------------------------------------------------
// Die Landkarte
// ---------------------------------------------------------------------------

const AUFBEWAHRUNG = 'Gesetzliche Aufbewahrungspflicht (§ 147 AO, 10 Jahre). Art. 17 Abs. 3 lit. b DSGVO nimmt diesen Fall ausdrücklich von der Löschpflicht aus.';
const DOKUMENTATION = 'Betriebliche Dokumentation — was gemacht wurde, bleibt nachvollziehbar; der Personenbezug wird entfernt.';
const REIN_PERSONENBEZOGEN = 'Reine Personendaten ohne Aufbewahrungspflicht.';
const DURCH_DATENBANK = 'Die Datenbank erledigt das über den Fremdschlüssel.';

export const DATEN_ORTE: DatenOrt[] = [
  // --- Der Kontakt selbst ---------------------------------------------------
  { tabelle: 'kontakte', label: 'Stammdaten', spalte: 'id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },

  // --- Muss bleiben: Steuer- und Handelsrecht -------------------------------
  { tabelle: 'rechnungen', label: 'Rechnungen', spalte: 'kontakt_id', art: 'behalten', begruendung: AUFBEWAHRUNG, imExport: true },
  { tabelle: 'abo_rechnungen', label: 'Wiederkehrende Rechnungen', spalte: 'kontakt_id', art: 'behalten', begruendung: AUFBEWAHRUNG, imExport: true },
  { tabelle: 'buchungen', label: 'Buchungen', spalte: 'kontakt_id', art: 'behalten', begruendung: AUFBEWAHRUNG, imExport: true },
  { tabelle: 'kunden_mandate', label: 'SEPA-Mandate', spalte: 'kontakt_id', art: 'behalten', begruendung: 'Nachweispflicht für erteilte Lastschriftmandate — ohne Mandat wären eingezogene Beträge nicht belegbar.', imExport: true },
  { tabelle: 'gutschein', label: 'Gutscheine', spalte: 'kontakt_id', art: 'behalten', begruendung: 'Ausgegebene Gutscheine sind eine offene Verbindlichkeit des Betriebs.', imExport: true },
  { tabelle: 'spende', label: 'Spenden', spalte: 'kontakt_id', art: 'behalten', begruendung: 'Zuwendungsbestätigungen unterliegen der Aufbewahrungspflicht.', imExport: true },
  { tabelle: 'signatur_anfragen', label: 'Unterschriften', spalte: 'kontakt_id', art: 'behalten', begruendung: 'Nachweis erteilter Unterschriften — Beweismittel bei Streit über Vertragsschluss.', imExport: true },

  // --- Wird anonymisiert: Vorgang bleibt, Person geht ------------------------
  { tabelle: 'auftraege', label: 'Aufträge', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'einsaetze', label: 'Einsätze', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'werkstatt_auftraege', label: 'Werkstatt-Aufträge', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'werkstatt_fahrzeuge', label: 'Fahrzeuge', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'werkstatt_fahrzeug_halter_log', label: 'Halterwechsel', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: false },
  { tabelle: 'objekte', label: 'Objekte', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'wartungsvertraege', label: 'Wartungsverträge', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: 'Die Anlage bleibt wartungspflichtig, auch wenn der Ansprechpartner wechselt.', imExport: true },
  { tabelle: 'assets', label: 'Anlagen und Geräte', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'gutachten', label: 'Gutachten', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'aufmasse', label: 'Aufmaße', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'zuschnitt_projekt', label: 'Zuschnitt-Projekte', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: false },
  { tabelle: 'kalkulationen', label: 'Kalkulationen', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: 'Die Erfahrungswerte des Betriebs bleiben erhalten.', imExport: false },
  { tabelle: 'hilfsmittel_versorgung', label: 'Hilfsmittel-Versorgung', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: DOKUMENTATION, imExport: true },
  { tabelle: 'kanzlei_akte', label: 'Akten', spalte: 'kontakt_id', art: 'anonymisieren', begruendung: 'Berufsrechtliche Aufbewahrungsfristen können hier greifen — bitte im Einzelfall prüfen.', imExport: true },

  // --- Wird geloescht: reine Personendaten ----------------------------------
  { tabelle: 'leads', label: 'Interessenten-Einträge', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'korrespondenz', label: 'Schriftverkehr', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'tickets', label: 'Anfragen und Tickets', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'termine', label: 'Termine', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'erinnerung', label: 'Erinnerungen', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'whatsapp_versand', label: 'WhatsApp-Nachrichten', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'autoresponder_lauf', label: 'Automatische Nachrichten', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'tour_stopp', label: 'Tour-Stopps', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'verleih_vorgang', label: 'Verleih-Vorgänge', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'belegung_vorgang', label: 'Belegungen', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },
  { tabelle: 'reservierung_vorgang', label: 'Reservierungen', spalte: 'kontakt_id', art: 'loeschen', begruendung: REIN_PERSONENBEZOGEN, imExport: true },

  // --- Die Datenbank regelt es selbst ---------------------------------------
  { tabelle: 'kontakt_aktivitaeten', label: 'Gesprächsverlauf', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'kontakt_tag_zuordnung', label: 'Schlagworte', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: false },
  { tabelle: 'portal_zugaenge', label: 'Kundenportal-Zugang', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'angebote', label: 'Angebote', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'verkaufschancen', label: 'Verkaufschancen', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'crm_deal', label: 'Deals', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'shop_bestellungen', label: 'Shop-Bestellungen', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'versand_sendung', label: 'Sendungen', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'kfz_fahrzeuge', label: 'KFZ-Fahrzeuge', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'bau_lv', label: 'Leistungsverzeichnisse', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'energie_anlagen', label: 'Energie-Anlagen', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'it_assets', label: 'IT-Geräte', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'it_vertraege', label: 'IT-Verträge', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'agentur_retainer', label: 'Retainer', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'kanzlei_mandate', label: 'Mandate', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'foerder_angebote', label: 'Förder-Angebote', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'tier_tiere', label: 'Tiere', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
  { tabelle: 'holz_auftraege', label: 'Brennholz-Aufträge', spalte: 'kontakt_id', art: 'automatisch', begruendung: DURCH_DATENBANK, imExport: true },
];

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export function orteFuerExport(): DatenOrt[] {
  return DATEN_ORTE.filter((o) => o.imExport);
}

/** Alles, was beim Löschen aktiv angefasst werden muss (die Datenbank macht den Rest). */
export function orteFuerLoeschung(): DatenOrt[] {
  return DATEN_ORTE.filter((o) => o.art === 'loeschen' || o.art === 'anonymisieren');
}

export function orteMitArt(art: LoeschArt): DatenOrt[] {
  return DATEN_ORTE.filter((o) => o.art === art);
}

export function ortFuer(tabelle: string): DatenOrt | undefined {
  return DATEN_ORTE.find((o) => o.tabelle === tabelle);
}

export type LoeschVorschau = {
  geloescht: string[];
  anonymisiert: string[];
  behalten: string[];
  automatisch: string[];
};

/** Was passiert — als Liste von Klartext-Bezeichnungen, für die Rückfrage vor dem Löschen. */
export function loeschVorschau(): LoeschVorschau {
  return {
    geloescht: orteMitArt('loeschen').map((o) => o.label),
    anonymisiert: orteMitArt('anonymisieren').map((o) => o.label),
    behalten: orteMitArt('behalten').map((o) => o.label),
    automatisch: orteMitArt('automatisch').map((o) => o.label),
  };
}

/** Die Felder, die beim Anonymisieren geleert werden — je Tabelle unterschiedlich benannt. */
export const ANONYM_FELDER = ['kontakt_id', 'kunde_name', 'kunde_email', 'kunde_telefon', 'name', 'email', 'telefon'];

/** Ein Satz, der einer betroffenen Person erklärt, warum etwas bleibt. */
export function warumBleibt(tabelle: string): string {
  const o = ortFuer(tabelle);
  if (!o) return '';
  return o.begruendung;
}

// ---------------------------------------------------------------------------
// Prüfung der Landkarte selbst
// ---------------------------------------------------------------------------

/** Fällt auf, wenn jemand die Landkarte kaputt macht — läuft im Test mit. */
export function pruefeLandkarte(): string[] {
  const fehler: string[] = [];
  const gesehen = new Set<string>();

  for (const o of DATEN_ORTE) {
    if (gesehen.has(o.tabelle)) fehler.push(`Tabelle doppelt eingetragen: ${o.tabelle}`);
    gesehen.add(o.tabelle);
    if (!o.label.trim()) fehler.push(`${o.tabelle}: keine Bezeichnung.`);
    if (!o.begruendung.trim()) fehler.push(`${o.tabelle}: keine Begründung.`);
    if (o.art === 'behalten' && !o.imExport) {
      fehler.push(`${o.tabelle}: wird behalten, taucht aber nicht in der Auskunft auf — genau das wäre der Vorwurf.`);
    }
  }
  return fehler;
}
