// lib/document-templates.ts
// ARGONAUT OS — Universelle Dokument-Templates für den Mittelstand
// Phase 3: Chat-Anbindung der Document-Engine
// -----------------------------------------------------------------------------
// Dieses File definiert NUR die Daten-Schemata (welche Felder ein Dokument
// braucht). Das eigentliche Rendern (buildDocx/buildXlsx) passiert in Schritt 2
// in der Route /api/chat/generate-document.
// -----------------------------------------------------------------------------

export type FeldTyp =
  | "text"        // einzeilig
  | "mehrzeilig"  // Textblock
  | "zahl"        // Ganzzahl
  | "betrag"      // Geldbetrag in EUR
  | "datum"       // ISO-Datum
  | "email"
  | "liste";      // Array von Positionen (z. B. Rechnungsposten)

export interface TemplateFeld {
  key: string;          // technischer Schlüssel (z. B. "kunde_name")
  label: string;        // Anzeige für Chat-Rückfragen
  typ: FeldTyp;
  pflicht: boolean;     // muss der Chat diesen Wert erfragen?
  beispiel?: string;    // Beispielwert für den Chat / die Doku
}

export type DateiFormat = "pdf" | "docx" | "xlsx";

export interface DocumentTemplate {
  id: string;              // eindeutige Template-ID (für Tool-Use)
  name: string;            // Klartext-Name
  beschreibung: string;    // wofür das Dokument ist
  format: DateiFormat;     // bevorzugtes Ausgabeformat
  agent: string;           // zuständiger ARGONAUT-Agent (TODO: mit Supabase abgleichen)
  felder: TemplateFeld[];
}

// Wiederkehrende Felder, damit wir uns nicht wiederholen ------------------------
const kunde: TemplateFeld[] = [
  { key: "kunde_name", label: "Name des Kunden / der Kundin", typ: "text", pflicht: true, beispiel: "Müller GmbH" },
  { key: "kunde_adresse", label: "Adresse des Kunden", typ: "mehrzeilig", pflicht: true, beispiel: "Hauptstr. 1, 71032 Böblingen" },
];

// ------------------------------------------------------------------------------
export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "angebot",
    name: "Angebot",
    beschreibung: "Verbindliches Angebot mit Positionen und Gesamtbetrag.",
    format: "pdf",
    agent: "Der Verkäufer",
    felder: [
      ...kunde,
      { key: "angebot_nummer", label: "Angebotsnummer", typ: "text", pflicht: false, beispiel: "ANG-2026-001" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
      { key: "positionen", label: "Positionen (Bezeichnung, Menge, Einzelpreis)", typ: "liste", pflicht: true },
      { key: "gesamtbetrag", label: "Gesamtbetrag (netto)", typ: "betrag", pflicht: true, beispiel: "2500.00" },
      { key: "gueltig_bis", label: "Gültig bis", typ: "datum", pflicht: false },
      { key: "anmerkung", label: "Anmerkung / Konditionen", typ: "mehrzeilig", pflicht: false },
    ],
  },
  {
    id: "rechnung",
    name: "Rechnung",
    beschreibung: "Rechnung mit Netto, MwSt und Brutto sowie Zahlungsziel.",
    format: "pdf",
    agent: "Der Buchhalter",
    felder: [
      ...kunde,
      { key: "rechnung_nummer", label: "Rechnungsnummer", typ: "text", pflicht: true, beispiel: "RE-2026-001" },
      { key: "datum", label: "Rechnungsdatum", typ: "datum", pflicht: true },
      { key: "leistungsdatum", label: "Leistungsdatum", typ: "datum", pflicht: false },
      { key: "positionen", label: "Positionen (Bezeichnung, Menge, Einzelpreis)", typ: "liste", pflicht: true },
      { key: "mwst_satz", label: "MwSt-Satz in Prozent", typ: "zahl", pflicht: true, beispiel: "19" },
      { key: "zahlungsziel_tage", label: "Zahlungsziel in Tagen", typ: "zahl", pflicht: false, beispiel: "14" },
    ],
  },
  {
    id: "mahnung",
    name: "Mahnung",
    beschreibung: "Zahlungserinnerung / Mahnung mit Bezug auf eine offene Rechnung.",
    format: "pdf",
    agent: "Der Buchhalter",
    felder: [
      ...kunde,
      { key: "rechnung_nummer", label: "Betroffene Rechnungsnummer", typ: "text", pflicht: true, beispiel: "RE-2026-001" },
      { key: "offener_betrag", label: "Offener Betrag", typ: "betrag", pflicht: true, beispiel: "2975.00" },
      { key: "mahnstufe", label: "Mahnstufe (1, 2 oder 3)", typ: "zahl", pflicht: true, beispiel: "1" },
      { key: "neue_frist", label: "Neue Zahlungsfrist", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "auftragsbestaetigung",
    name: "Auftragsbestätigung",
    beschreibung: "Bestätigung eines angenommenen Auftrags.",
    format: "pdf",
    agent: "Der Verkäufer",
    felder: [
      ...kunde,
      { key: "auftrag_nummer", label: "Auftragsnummer", typ: "text", pflicht: false, beispiel: "AB-2026-001" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
      { key: "positionen", label: "Positionen", typ: "liste", pflicht: true },
      { key: "liefertermin", label: "Voraussichtlicher Liefertermin", typ: "datum", pflicht: false },
    ],
  },
  {
    id: "lieferschein",
    name: "Lieferschein",
    beschreibung: "Begleitdokument zur Warenlieferung (ohne Preise).",
    format: "pdf",
    agent: "Der Logistiker",
    felder: [
      ...kunde,
      { key: "lieferschein_nummer", label: "Lieferscheinnummer", typ: "text", pflicht: false, beispiel: "LS-2026-001" },
      { key: "datum", label: "Lieferdatum", typ: "datum", pflicht: true },
      { key: "positionen", label: "Positionen (Bezeichnung, Menge)", typ: "liste", pflicht: true },
    ],
  },
  {
    id: "geschaeftsbrief",
    name: "Geschäftsbrief",
    beschreibung: "Allgemeiner Geschäftsbrief nach DIN-5008-Logik.",
    format: "docx",
    agent: "Der Assistent",
    felder: [
      ...kunde,
      { key: "betreff", label: "Betreff", typ: "text", pflicht: true, beispiel: "Ihre Anfrage vom 10.06.2026" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
      { key: "text", label: "Brieftext", typ: "mehrzeilig", pflicht: true },
      { key: "gruss", label: "Grußformel", typ: "text", pflicht: false, beispiel: "Mit freundlichen Grüßen" },
    ],
  },
  {
    id: "arbeitsvertrag",
    name: "Arbeitsvertrag",
    beschreibung: "Standard-Arbeitsvertrag (unbefristet). Hinweis: befristete Verträge brauchen QES.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "arbeitnehmer_name", label: "Name des Arbeitnehmers", typ: "text", pflicht: true, beispiel: "Max Mustermann" },
      { key: "arbeitnehmer_adresse", label: "Adresse des Arbeitnehmers", typ: "mehrzeilig", pflicht: true },
      { key: "position", label: "Position / Tätigkeit", typ: "text", pflicht: true, beispiel: "Vertriebsmitarbeiter" },
      { key: "eintrittsdatum", label: "Eintrittsdatum", typ: "datum", pflicht: true },
      { key: "gehalt", label: "Bruttomonatsgehalt", typ: "betrag", pflicht: true, beispiel: "3800.00" },
      { key: "wochenstunden", label: "Wochenarbeitszeit in Stunden", typ: "zahl", pflicht: true, beispiel: "40" },
      { key: "urlaubstage", label: "Urlaubstage pro Jahr", typ: "zahl", pflicht: false, beispiel: "30" },
    ],
  },
  {
    id: "arbeitszeugnis",
    name: "Arbeitszeugnis",
    beschreibung: "Qualifiziertes Arbeitszeugnis.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "arbeitnehmer_name", label: "Name des Arbeitnehmers", typ: "text", pflicht: true },
      { key: "position", label: "Position", typ: "text", pflicht: true },
      { key: "von_datum", label: "Beschäftigt von", typ: "datum", pflicht: true },
      { key: "bis_datum", label: "Beschäftigt bis", typ: "datum", pflicht: true },
      { key: "bewertung", label: "Note (sehr gut / gut / befriedigend)", typ: "text", pflicht: true, beispiel: "sehr gut" },
      { key: "aufgaben", label: "Wichtigste Aufgaben", typ: "mehrzeilig", pflicht: false },
    ],
  },
  {
    id: "nda",
    name: "Geheimhaltungsvereinbarung (NDA)",
    beschreibung: "Vertraulichkeitsvereinbarung zwischen zwei Parteien.",
    format: "docx",
    agent: "Der Jurist",
    felder: [
      { key: "partner_name", label: "Name der anderen Partei", typ: "text", pflicht: true },
      { key: "partner_adresse", label: "Adresse der anderen Partei", typ: "mehrzeilig", pflicht: true },
      { key: "zweck", label: "Zweck der Zusammenarbeit", typ: "mehrzeilig", pflicht: true },
      { key: "laufzeit_jahre", label: "Laufzeit in Jahren", typ: "zahl", pflicht: false, beispiel: "3" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "kuendigung",
    name: "Kündigungsschreiben",
    beschreibung: "Kündigung eines Vertrags. Hinweis: Arbeitsvertrags-Kündigungen brauchen QES / Schriftform.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "empfaenger_name", label: "Name des Empfängers", typ: "text", pflicht: true },
      { key: "empfaenger_adresse", label: "Adresse des Empfängers", typ: "mehrzeilig", pflicht: true },
      { key: "vertrag_bezeichnung", label: "Bezeichnung des Vertrags", typ: "text", pflicht: true, beispiel: "Arbeitsvertrag vom 01.01.2024" },
      { key: "kuendigung_zum", label: "Kündigung zum", typ: "datum", pflicht: true },
      { key: "datum", label: "Datum des Schreibens", typ: "datum", pflicht: true },
    ],
  },{
    id: "bestellung",
    name: "Bestellung",
    beschreibung: "Bestellung von Waren oder Leistungen bei einem Lieferanten.",
    format: "pdf",
    agent: "Der Einkäufer",
    felder: [
      { key: "lieferant_name", label: "Name des Lieferanten", typ: "text", pflicht: true, beispiel: "Mustermaterial GmbH" },
      { key: "lieferant_adresse", label: "Adresse des Lieferanten", typ: "mehrzeilig", pflicht: true },
      { key: "bestellnummer", label: "Bestellnummer", typ: "text", pflicht: false, beispiel: "BES-2026-001" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
      { key: "positionen", label: "Positionen (Bezeichnung, Menge, Einzelpreis)", typ: "liste", pflicht: true },
      { key: "lieferadresse", label: "Lieferadresse (falls abweichend)", typ: "mehrzeilig", pflicht: false },
      { key: "liefertermin", label: "Gewünschter Liefertermin", typ: "datum", pflicht: false },
    ],
  },
  {
    id: "gutschrift",
    name: "Gutschrift",
    beschreibung: "Korrektur einer bereits gestellten Rechnung (Rechnungskorrektur).",
    format: "pdf",
    agent: "Der Buchhalter",
    felder: [
      ...kunde,
      { key: "gutschrift_nummer", label: "Gutschriftnummer", typ: "text", pflicht: true, beispiel: "GS-2026-001" },
      { key: "rechnung_nummer", label: "Bezug: Rechnungsnummer", typ: "text", pflicht: true, beispiel: "RE-2026-001" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
      { key: "positionen", label: "Korrigierte Positionen (Bezeichnung, Menge, Einzelpreis)", typ: "liste", pflicht: true },
      { key: "betrag", label: "Gutschriftbetrag", typ: "betrag", pflicht: true, beispiel: "-250.00" },
      { key: "begruendung", label: "Begründung der Korrektur", typ: "mehrzeilig", pflicht: false },
    ],
  },
  {
    id: "stornorechnung",
    name: "Stornorechnung",
    beschreibung: "Vollständige Aufhebung (Storno) einer fehlerhaften Rechnung.",
    format: "pdf",
    agent: "Der Buchhalter",
    felder: [
      ...kunde,
      { key: "storno_nummer", label: "Stornorechnungsnummer", typ: "text", pflicht: true, beispiel: "ST-2026-001" },
      { key: "rechnung_nummer", label: "Bezug: stornierte Rechnungsnummer", typ: "text", pflicht: true, beispiel: "RE-2026-001" },
      { key: "rechnung_datum", label: "Datum der Originalrechnung", typ: "datum", pflicht: false },
      { key: "datum", label: "Datum der Stornierung", typ: "datum", pflicht: true },
      { key: "betrag", label: "Stornierter Gesamtbetrag", typ: "betrag", pflicht: true, beispiel: "2975.00" },
      { key: "begruendung", label: "Grund der Stornierung", typ: "mehrzeilig", pflicht: false },
    ],
  },
  {
    id: "zahlungserinnerung",
    name: "Zahlungserinnerung",
    beschreibung: "Freundliche Erinnerung vor der ersten Mahnstufe (Mahnstufe 0).",
    format: "pdf",
    agent: "Der Buchhalter",
    felder: [
      ...kunde,
      { key: "rechnung_nummer", label: "Betroffene Rechnungsnummer", typ: "text", pflicht: true, beispiel: "RE-2026-001" },
      { key: "rechnung_datum", label: "Rechnungsdatum", typ: "datum", pflicht: false },
      { key: "offener_betrag", label: "Offener Betrag", typ: "betrag", pflicht: true, beispiel: "2975.00" },
      { key: "neue_frist", label: "Neue, freundliche Zahlungsfrist", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "quittung",
    name: "Quittung",
    beschreibung: "Bestätigung über den Erhalt einer Zahlung.",
    format: "pdf",
    agent: "Der Buchhalter",
    felder: [
      ...kunde,
      { key: "quittung_nummer", label: "Quittungsnummer", typ: "text", pflicht: false, beispiel: "QU-2026-001" },
      { key: "betrag", label: "Erhaltener Betrag", typ: "betrag", pflicht: true, beispiel: "500.00" },
      { key: "zahlungsart", label: "Zahlungsart", typ: "text", pflicht: false, beispiel: "Überweisung" },
      { key: "grund", label: "Grund / Zweck der Zahlung", typ: "text", pflicht: true, beispiel: "Anzahlung Auftrag Nr. 4711" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "reklamation",
    name: "Reklamation / Mängelrüge",
    beschreibung: "Beanstandung einer Lieferung oder Leistung gegenüber einem Lieferanten.",
    format: "docx",
    agent: "Der Einkäufer",
    felder: [
      { key: "lieferant_name", label: "Name des Lieferanten", typ: "text", pflicht: true },
      { key: "lieferant_adresse", label: "Adresse des Lieferanten", typ: "mehrzeilig", pflicht: true },
      { key: "bezug", label: "Bezug (Bestellnummer / Lieferscheinnummer)", typ: "text", pflicht: true, beispiel: "BES-2026-001" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
      { key: "maengel", label: "Beschreibung der Mängel", typ: "mehrzeilig", pflicht: true },
      { key: "forderung", label: "Geforderte Abhilfe (Ersatz, Nachbesserung, Gutschrift)", typ: "text", pflicht: false, beispiel: "Ersatzlieferung" },
      { key: "frist", label: "Frist zur Stellungnahme", typ: "datum", pflicht: false },
    ],
  },
  {
    id: "abmahnung",
    name: "Abmahnung",
    beschreibung: "Formale Abmahnung eines Arbeitnehmers wegen eines Fehlverhaltens.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "arbeitnehmer_name", label: "Name des Arbeitnehmers", typ: "text", pflicht: true },
      { key: "arbeitnehmer_adresse", label: "Adresse des Arbeitnehmers", typ: "mehrzeilig", pflicht: true },
      { key: "vorfall_datum", label: "Datum des Vorfalls", typ: "datum", pflicht: true },
      { key: "sachverhalt", label: "Beschreibung des Sachverhalts", typ: "mehrzeilig", pflicht: true },
      { key: "erwartung", label: "Erwartetes zukünftiges Verhalten", typ: "mehrzeilig", pflicht: false },
      { key: "datum", label: "Datum des Schreibens", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "urlaubsantrag",
    name: "Urlaubsantrag / Urlaubsbestätigung",
    beschreibung: "Antrag auf Urlaub und dessen Bestätigung durch den Arbeitgeber.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "arbeitnehmer_name", label: "Name des Arbeitnehmers", typ: "text", pflicht: true },
      { key: "von_datum", label: "Urlaub von", typ: "datum", pflicht: true },
      { key: "bis_datum", label: "Urlaub bis", typ: "datum", pflicht: true },
      { key: "anzahl_tage", label: "Anzahl Urlaubstage", typ: "zahl", pflicht: false, beispiel: "5" },
      { key: "vertretung", label: "Vertretung während der Abwesenheit", typ: "text", pflicht: false },
      { key: "status", label: "Status (beantragt / genehmigt)", typ: "text", pflicht: false, beispiel: "genehmigt" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "freelancer_vertrag",
    name: "Freelancer- / Dienstleistungsvertrag",
    beschreibung: "Vertrag mit einem freien Mitarbeiter / Dienstleister (kein Arbeitsverhältnis).",
    format: "docx",
    agent: "Der Jurist",
    felder: [
      { key: "auftragnehmer_name", label: "Name des Auftragnehmers", typ: "text", pflicht: true },
      { key: "auftragnehmer_adresse", label: "Adresse des Auftragnehmers", typ: "mehrzeilig", pflicht: true },
      { key: "leistungsbeschreibung", label: "Leistungsbeschreibung", typ: "mehrzeilig", pflicht: true },
      { key: "vergütung", label: "Vergütung", typ: "betrag", pflicht: true, beispiel: "850.00" },
      { key: "abrechnung", label: "Abrechnungsart (z. B. pro Stunde, pro Projekt)", typ: "text", pflicht: false, beispiel: "pro Tag" },
      { key: "beginn", label: "Vertragsbeginn", typ: "datum", pflicht: true },
      { key: "ende", label: "Vertragsende (falls befristet)", typ: "datum", pflicht: false },
      { key: "kuendigungsfrist", label: "Kündigungsfrist", typ: "text", pflicht: false, beispiel: "2 Wochen" },
    ],
  },
  {
    id: "vollmacht",
    name: "Vollmacht",
    beschreibung: "Allgemeine Vollmacht zur Vertretung in bestimmten Angelegenheiten.",
    format: "docx",
    agent: "Der Jurist",
    felder: [
      { key: "vollmachtgeber_name", label: "Name des Vollmachtgebers", typ: "text", pflicht: true },
      { key: "vollmachtgeber_adresse", label: "Adresse des Vollmachtgebers", typ: "mehrzeilig", pflicht: true },
      { key: "bevollmaechtigter_name", label: "Name des Bevollmächtigten", typ: "text", pflicht: true },
      { key: "bevollmaechtigter_adresse", label: "Adresse des Bevollmächtigten", typ: "mehrzeilig", pflicht: true },
      { key: "umfang", label: "Umfang der Vollmacht", typ: "mehrzeilig", pflicht: true, beispiel: "Vertretung gegenüber Behörden in Steuerangelegenheiten" },
      { key: "gueltig_bis", label: "Gültig bis (falls befristet)", typ: "datum", pflicht: false },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },
{
    id: "praktikumsvertrag",
    name: "Praktikumsvertrag",
    beschreibung: "Vertrag fuer ein Praktikum (mit oder ohne Verguetung).",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "praktikant_name", label: "Name des Praktikanten / der Praktikantin", typ: "text", pflicht: true },
      { key: "praktikant_adresse", label: "Adresse des Praktikanten", typ: "mehrzeilig", pflicht: true },
      { key: "abteilung", label: "Abteilung / Taetigkeitsbereich", typ: "text", pflicht: false, beispiel: "Marketing" },
      { key: "von_datum", label: "Praktikum von", typ: "datum", pflicht: true },
      { key: "bis_datum", label: "Praktikum bis", typ: "datum", pflicht: true },
      { key: "verguetung", label: "Verguetung (falls vorhanden)", typ: "betrag", pflicht: false, beispiel: "450.00" },
      { key: "wochenstunden", label: "Wochenarbeitszeit in Stunden", typ: "zahl", pflicht: false, beispiel: "35" },
      { key: "betreuer", label: "Betreuende Person", typ: "text", pflicht: false },
    ],
  },
  {
    id: "aufhebungsvertrag",
    name: "Aufhebungsvertrag",
    beschreibung: "Einvernehmliche Beendigung eines Arbeitsverhaeltnisses.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "arbeitnehmer_name", label: "Name des Arbeitnehmers", typ: "text", pflicht: true },
      { key: "arbeitnehmer_adresse", label: "Adresse des Arbeitnehmers", typ: "mehrzeilig", pflicht: true },
      { key: "vertrag_bezeichnung", label: "Bezeichnung des Arbeitsvertrags", typ: "text", pflicht: false, beispiel: "Arbeitsvertrag vom 01.01.2024" },
      { key: "beendigung_zum", label: "Beendigung des Arbeitsverhaeltnisses zum", typ: "datum", pflicht: true },
      { key: "abfindung", label: "Abfindung (falls vereinbart)", typ: "betrag", pflicht: false, beispiel: "5000.00" },
      { key: "freistellung", label: "Freistellung bis Beendigung (ja/nein, ggf. Details)", typ: "text", pflicht: false, beispiel: "ja, ab sofort" },
      { key: "zeugnis", label: "Vereinbarung zum Arbeitszeugnis", typ: "text", pflicht: false, beispiel: "wohlwollendes Zeugnis" },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "einladung_vorstellungsgespraech",
    name: "Einladung zum Vorstellungsgespraech",
    beschreibung: "Einladung eines Bewerbers / einer Bewerberin zum Vorstellungsgespraech.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "bewerber_name", label: "Name des Bewerbers / der Bewerberin", typ: "text", pflicht: true },
      { key: "bewerber_adresse", label: "Adresse des Bewerbers", typ: "mehrzeilig", pflicht: false },
      { key: "position", label: "Beworbene Position", typ: "text", pflicht: true, beispiel: "Vertriebsmitarbeiter" },
      { key: "termin", label: "Termin (Datum und Uhrzeit)", typ: "text", pflicht: true, beispiel: "20.06.2026, 10:00 Uhr" },
      { key: "ort", label: "Ort / Format (vor Ort, Video)", typ: "text", pflicht: false, beispiel: "Vor Ort, Boeblingen" },
      { key: "ansprechpartner", label: "Ansprechpartner fuer Rueckfragen", typ: "text", pflicht: false },
      { key: "unterlagen", label: "Mitzubringende Unterlagen", typ: "mehrzeilig", pflicht: false },
    ],
  },
  {
    id: "bewerbungsabsage",
    name: "Bewerbungsabsage",
    beschreibung: "Absage an einen Bewerber / eine Bewerberin nach Bewerbungsprozess.",
    format: "docx",
    agent: "Der Personaler",
    felder: [
      { key: "bewerber_name", label: "Name des Bewerbers / der Bewerberin", typ: "text", pflicht: true },
      { key: "bewerber_adresse", label: "Adresse des Bewerbers", typ: "mehrzeilig", pflicht: false },
      { key: "position", label: "Beworbene Position", typ: "text", pflicht: true, beispiel: "Vertriebsmitarbeiter" },
      { key: "begruendung", label: "Begruendung (optional, allgemein gehalten)", typ: "mehrzeilig", pflicht: false },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "mietvertrag_gewerbe",
    name: "Mietvertrag Gewerbe (einfach)",
    beschreibung: "Einfacher Mietvertrag fuer Gewerberaeume.",
    format: "docx",
    agent: "Der Jurist",
    felder: [
      { key: "vermieter_name", label: "Name des Vermieters", typ: "text", pflicht: true },
      { key: "vermieter_adresse", label: "Adresse des Vermieters", typ: "mehrzeilig", pflicht: true },
      { key: "mieter_name", label: "Name des Mieters", typ: "text", pflicht: true },
      { key: "mieter_adresse", label: "Adresse des Mieters", typ: "mehrzeilig", pflicht: true },
      { key: "mietobjekt", label: "Beschreibung des Mietobjekts", typ: "mehrzeilig", pflicht: true, beispiel: "Bueroraeume, 120 qm, 2. OG" },
      { key: "miete", label: "Monatliche Miete (netto)", typ: "betrag", pflicht: true, beispiel: "1200.00" },
      { key: "nebenkosten", label: "Nebenkostenvorauszahlung", typ: "betrag", pflicht: false, beispiel: "200.00" },
      { key: "beginn", label: "Mietbeginn", typ: "datum", pflicht: true },
      { key: "laufzeit", label: "Laufzeit / Kuendigungsfrist", typ: "text", pflicht: false, beispiel: "unbefristet, 6 Monate Kuendigungsfrist" },
      { key: "kaution", label: "Kaution", typ: "betrag", pflicht: false, beispiel: "3600.00" },
    ],
  },
  {
    id: "dsgvo_auskunft",
    name: "DSGVO-Auskunft (Art. 15)",
    beschreibung: "Antwortschreiben auf ein Auskunftsersuchen nach Art. 15 DSGVO.",
    format: "docx",
    agent: "Der Jurist",
    felder: [
      { key: "betroffene_person_name", label: "Name der betroffenen Person", typ: "text", pflicht: true },
      { key: "betroffene_person_adresse", label: "Adresse der betroffenen Person", typ: "mehrzeilig", pflicht: true },
      { key: "anfrage_datum", label: "Datum der Anfrage", typ: "datum", pflicht: false },
      { key: "gespeicherte_daten", label: "Uebersicht der gespeicherten Daten", typ: "mehrzeilig", pflicht: true, beispiel: "Name, Adresse, E-Mail, Bestellhistorie" },
      { key: "verarbeitungszweck", label: "Zweck der Verarbeitung", typ: "mehrzeilig", pflicht: false, beispiel: "Vertragsabwicklung und Kundenkommunikation" },
      { key: "speicherdauer", label: "Speicherdauer / Loeschfristen", typ: "text", pflicht: false, beispiel: "10 Jahre (gesetzliche Aufbewahrungspflicht)" },
      { key: "empfaenger", label: "Empfaenger / Kategorien von Empfaengern", typ: "text", pflicht: false, beispiel: "Steuerberater, Versanddienstleister" },
      { key: "datum", label: "Datum des Schreibens", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "terminbestaetigung",
    name: "Terminbestaetigung",
    beschreibung: "Bestaetigung eines vereinbarten Termins gegenueber einem Kunden oder Partner.",
    format: "docx",
    agent: "Der Assistent",
    felder: [
      { key: "empfaenger_name", label: "Name des Empfaengers", typ: "text", pflicht: true },
      { key: "empfaenger_adresse", label: "Adresse des Empfaengers", typ: "mehrzeilig", pflicht: false },
      { key: "termin", label: "Termin (Datum und Uhrzeit)", typ: "text", pflicht: true, beispiel: "20.06.2026, 14:00 Uhr" },
      { key: "ort", label: "Ort / Format", typ: "text", pflicht: false, beispiel: "Vor Ort, Boeblingen" },
      { key: "thema", label: "Thema / Anlass", typ: "text", pflicht: false, beispiel: "Projektbesprechung" },
      { key: "ansprechpartner", label: "Ansprechpartner", typ: "text", pflicht: false },
      { key: "datum", label: "Datum des Schreibens", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "einladung_meeting",
    name: "Einladung zu Meeting / Veranstaltung",
    beschreibung: "Einladung zu einem internen oder externen Meeting bzw. einer Veranstaltung.",
    format: "docx",
    agent: "Der Assistent",
    felder: [
      { key: "empfaenger_name", label: "Name des Empfaengers / der Gruppe", typ: "text", pflicht: true },
      { key: "titel", label: "Titel der Veranstaltung / des Meetings", typ: "text", pflicht: true, beispiel: "Quartalsmeeting Q2 2026" },
      { key: "termin", label: "Termin (Datum und Uhrzeit)", typ: "text", pflicht: true, beispiel: "25.06.2026, 09:00 Uhr" },
      { key: "ort", label: "Ort / Format", typ: "text", pflicht: false, beispiel: "Konferenzraum 1 / Videocall" },
      { key: "agenda", label: "Agenda / Themen", typ: "mehrzeilig", pflicht: false },
      { key: "datum", label: "Datum des Schreibens", typ: "datum", pflicht: true },
    ],
  },
  {
    id: "dankschreiben",
    name: "Dankschreiben / Follow-up",
    beschreibung: "Dankschreiben oder Follow-up nach einem Termin, Gespraech oder Auftrag.",
    format: "docx",
    agent: "Der Assistent",
    felder: [
      { key: "empfaenger_name", label: "Name des Empfaengers", typ: "text", pflicht: true },
      { key: "empfaenger_adresse", label: "Adresse des Empfaengers", typ: "mehrzeilig", pflicht: false },
      { key: "anlass", label: "Anlass (Termin, Gespraech, Auftrag)", typ: "text", pflicht: true, beispiel: "Unser Gespraech am 12.06.2026" },
      { key: "text", label: "Individueller Text", typ: "mehrzeilig", pflicht: false },
      { key: "naechste_schritte", label: "Naechste Schritte", typ: "mehrzeilig", pflicht: false },
      { key: "datum", label: "Datum", typ: "datum", pflicht: true },
    ],
  },];

// Hilfsfunktion: Template per ID holen ------------------------------------------
export function getTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id);
}

// Kurzliste fuer den Chat-Tool-Use (id + name + format) -------------------------
export function templateListe(): { id: string; name: string; format: DateiFormat }[] {
  return DOCUMENT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, format: t.format }));
}
