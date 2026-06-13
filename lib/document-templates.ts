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
  },
];

// Hilfsfunktion: Template per ID holen ------------------------------------------
export function getTemplate(id: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id);
}

// Kurzliste für den Chat-Tool-Use (id + name + format) -------------------------
export function templateListe(): { id: string; name: string; format: DateiFormat }[] {
  return DOCUMENT_TEMPLATES.map((t) => ({ id: t.id, name: t.name, format: t.format }));
}
