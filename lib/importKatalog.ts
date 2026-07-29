// ============================================================================
// ARGONAUT OS · lib/importKatalog.ts — Katalog aller Import-Quellen
//
// EINE Quelle der Wahrheit fuer das Import-Center (/dashboard/import).
// Buendelt die verstreuten CSV-Vorlagen (public/vorlagen/*) + die modul-eigenen
// Import-Seiten an EINER Vordertuer. Stufe 1 = Launcher: Vorlage laden + zum
// Modul-Import springen. (Stufe 2 spaeter: zentraler Upload direkt hier.)
//
// Keine Imports, keine Hooks — von Client- UND Server-Code nutzbar, node-testbar.
// ============================================================================

export type ImportGruppeKey = 'stammdaten' | 'vertraege_objekte' | 'betrieb' | 'finanzen';

export type ImportGruppe = {
  key: ImportGruppeKey;
  label: string;
  icon: string;
};

export type ImportQuelle = {
  /** Eindeutiger Schluessel. */
  key: string;
  /** Anzeigename der Datenart. */
  label: string;
  icon: string;
  /** Ein Satz: was wird importiert. */
  beschreibung: string;
  /** Oeffentlicher Pfad der CSV-Vorlage (/vorlagen/...). Fehlt, wenn das Modul
   *  einen eigenen Import ohne Vorlagen-Datei hat. */
  vorlage?: string;
  /** Wohin der eigentliche Import fuehrt (Modul-Seite). */
  zielHref: string;
  gruppe: ImportGruppeKey;
};

export const IMPORT_GRUPPEN: ImportGruppe[] = [
  { key: 'stammdaten', label: 'Stammdaten', icon: '👤' },
  { key: 'vertraege_objekte', label: 'Verträge & Objekte', icon: '📑' },
  { key: 'betrieb', label: 'Betrieb & Branche', icon: '🔧' },
  { key: 'finanzen', label: 'Finanzen & Förderung', icon: '💶' },
];

const V = '/vorlagen/';

export const IMPORT_QUELLEN: ImportQuelle[] = [
  // --- Stammdaten -----------------------------------------------------------
  { key: 'kontakte', label: 'Kontakte / CRM', icon: '🤝', beschreibung: 'Kunden und Firmen ins CRM übernehmen.', zielHref: '/dashboard/crm/import', gruppe: 'stammdaten' },
  { key: 'artikel', label: 'Artikel & Preise (Lager)', icon: '📦', beschreibung: 'Sortiment und Preisliste ins ERP/Lager laden.', zielHref: '/dashboard/erp/preisliste', gruppe: 'stammdaten' },
  { key: 'lieferanten', label: 'Lieferanten', icon: '🏭', beschreibung: 'Lieferanten-Stammdaten für Einkauf und ERP.', vorlage: V + 'lieferanten-import-vorlage.csv', zielHref: '/dashboard/erp/lieferanten', gruppe: 'stammdaten' },
  { key: 'varianten', label: 'Artikel-Varianten & Matrix', icon: '🧩', beschreibung: 'Varianten-Gruppen (Größe/Farbe) für den Handel.', vorlage: V + 'varianten-import-vorlage.csv', zielHref: '/dashboard/varianten', gruppe: 'stammdaten' },

  // --- Verträge & Objekte ---------------------------------------------------
  { key: 'wartungsvertraege', label: 'Wartungsverträge', icon: '🔧', beschreibung: 'Bestehende Wartungs-/Abo-Verträge übernehmen.', vorlage: V + 'wartungsvertraege-import-vorlage.csv', zielHref: '/dashboard/wartung', gruppe: 'vertraege_objekte' },
  { key: 'objekte', label: 'Objekt-/Asset-Register', icon: '🏛', beschreibung: 'Anlagen, Geräte, Objekte mit Prüffristen.', vorlage: V + 'objekte-import-vorlage.csv', zielHref: '/dashboard/objekte', gruppe: 'vertraege_objekte' },
  { key: 'betriebskosten', label: 'Betriebskosten-Einheiten', icon: '🧾', beschreibung: 'Mieteinheiten für die Betriebskostenabrechnung.', vorlage: V + 'betriebskosten-einheiten-import-vorlage.csv', zielHref: '/dashboard/betriebskosten', gruppe: 'vertraege_objekte' },
  { key: 'expose', label: 'Exposé-Objekte', icon: '🏠', beschreibung: 'Immobilien-Objekte für Exposé & Vermarktung.', vorlage: V + 'expose-import-vorlage.csv', zielHref: '/dashboard/expose', gruppe: 'vertraege_objekte' },
  { key: 'lizenzen', label: 'IT-Lizenzen', icon: '🖥️', beschreibung: 'Software-Lizenzen für Assets & Lizenzen (IT).', vorlage: V + 'lizenzen-import-vorlage.csv', zielHref: '/dashboard/itassets', gruppe: 'vertraege_objekte' },

  // --- Betrieb & Branche ----------------------------------------------------
  { key: 'aufwand', label: 'Aufwand / Leistungen', icon: '⏱', beschreibung: 'Erfasste Leistungen und Zeiten zum Abrechnen.', vorlage: V + 'aufwand-import-vorlage.csv', zielHref: '/dashboard/aufwand', gruppe: 'betrieb' },
  { key: 'bde', label: 'Maschinen (BDE/MDE)', icon: '📟', beschreibung: 'Maschinenstammdaten für die Betriebsdatenerfassung.', vorlage: V + 'bde-maschinen-import-vorlage.csv', zielHref: '/dashboard/bde', gruppe: 'betrieb' },
  { key: 'chargen', label: 'Chargen & Serien', icon: '🔬', beschreibung: 'Chargen-/Serien-Lose mit Rückverfolgbarkeit.', vorlage: V + 'chargen-import-vorlage.csv', zielHref: '/dashboard/chargen', gruppe: 'betrieb' },
  { key: 'etiketten', label: 'Etiketten & LMIV', icon: '🏷️', beschreibung: 'Produkte mit Zutaten, Allergenen, Nährwerten.', vorlage: V + 'etiketten-import-vorlage.csv', zielHref: '/dashboard/etiketten', gruppe: 'betrieb' },
  { key: 'speisekarte', label: 'Speisekarte / Menü', icon: '🍽', beschreibung: 'Gerichte mit Preis, Allergenen, Zusatzstoffen.', vorlage: V + 'speisekarte-import-vorlage.csv', zielHref: '/dashboard/housekeeping', gruppe: 'betrieb' },
  { key: 'rezeptur', label: 'Rezepturen', icon: '🧮', beschreibung: 'Rezepturen und Zutaten für den Ausbeute-Rechner.', vorlage: V + 'rezeptur-import-vorlage.csv', zielHref: '/dashboard/rezeptur', gruppe: 'betrieb' },
  { key: 'pruefprotokolle', label: 'Prüfprotokolle', icon: '📋', beschreibung: 'Prüf-/Messprotokolle nach Norm-Katalog.', vorlage: V + 'pruefprotokolle-import-vorlage.csv', zielHref: '/dashboard/pruefprotokolle', gruppe: 'betrieb' },
  { key: 'raeume', label: 'Räume & Ressourcen', icon: '🏫', beschreibung: 'Räume, Labore, Ausstattung für die Belegung.', vorlage: V + 'raeume-import-vorlage.csv', zielHref: '/dashboard/raeume', gruppe: 'betrieb' },
  { key: 'kurse', label: 'Kurse & Teilnehmer', icon: '🎓', beschreibung: 'Kursangebote für Bildung & Kurse.', vorlage: V + 'kurse-import-vorlage.csv', zielHref: '/dashboard/bildung', gruppe: 'betrieb' },
  { key: 'veranstaltungen', label: 'Veranstaltungen', icon: '🎫', beschreibung: 'Events mit Kapazität, Preis und Status.', vorlage: V + 'veranstaltungen-import-vorlage.csv', zielHref: '/dashboard/veranstaltungen', gruppe: 'betrieb' },
  { key: 'reservierung_plaetze', label: 'Reservierbare Plätze', icon: '🪑', beschreibung: 'Tische, Plätze, Stellplätze zum Reservieren.', vorlage: V + 'reservierung-plaetze-import-vorlage.csv', zielHref: '/dashboard/reservierung', gruppe: 'betrieb' },
  { key: 'reservierung_vorgaenge', label: 'Reservierungs-Vorgänge', icon: '🪑', beschreibung: 'Bestehende Reservierungen/Einlagerungen übernehmen.', vorlage: V + 'reservierung-vorgaenge-import-vorlage.csv', zielHref: '/dashboard/reservierung', gruppe: 'betrieb' },
  { key: 'belegung', label: 'Belegung', icon: '🗓', beschreibung: 'Einheiten und Belegungen (generisch).', vorlage: V + 'belegung-import-vorlage.csv', zielHref: '/dashboard/belegung', gruppe: 'betrieb' },
  { key: 'gutscheine', label: 'Gutscheine & Pakete', icon: '🎁', beschreibung: 'Ausgegebene Gutscheine und Wertpakete.', vorlage: V + 'gutscheine-import-vorlage.csv', zielHref: '/dashboard/gutscheine', gruppe: 'betrieb' },
  { key: 'erinnerungen', label: 'Erinnerungen', icon: '🔔', beschreibung: 'Wiedervorlagen und Erinnerungstermine.', vorlage: V + 'erinnerungen-import-vorlage.csv', zielHref: '/dashboard/erinnerungen', gruppe: 'betrieb' },
  { key: 'tour_stopps', label: 'Tour-Stopps', icon: '🚚', beschreibung: 'Stopps und Adressen für Tour & ePOD.', vorlage: V + 'tour-stopps-import-vorlage.csv', zielHref: '/dashboard/tour', gruppe: 'betrieb' },
  { key: 'gutachten', label: 'Gutachten', icon: '📑', beschreibung: 'Gutachten und Sachverständigen-Vorgänge.', vorlage: V + 'gutachten-import-vorlage.csv', zielHref: '/dashboard/gutachten', gruppe: 'betrieb' },
  { key: 'hilfsmittel', label: 'Hilfsmittel-Versorgung', icon: '🦽', beschreibung: 'Hilfsmittel und Versorgungs-Vorgänge.', vorlage: V + 'hilfsmittel-import-vorlage.csv', zielHref: '/dashboard/hilfsmittel', gruppe: 'betrieb' },
  { key: 'akten', label: 'Akten & Fristen', icon: '⚖️', beschreibung: 'Akten mit Fristen für Kanzlei/Steuer.', vorlage: V + 'akten-import-vorlage.csv', zielHref: '/dashboard/fristen', gruppe: 'betrieb' },
  { key: 'schlaege', label: 'Schläge (Landwirtschaft)', icon: '🌾', beschreibung: 'Feldstücke/Schläge für die Schlagkartei.', vorlage: V + 'schlaege-import-vorlage.csv', zielHref: '/dashboard/schlagkartei', gruppe: 'betrieb' },
  { key: 'produkte', label: 'Markt-Produkte (Direktvermarktung)', icon: '🧺', beschreibung: 'Produktkatalog für Ernte & Direktvermarktung.', vorlage: V + 'produkte-import-vorlage.csv', zielHref: '/dashboard/ernte', gruppe: 'betrieb' },
  { key: 'tiergruppen', label: 'Tierbestand', icon: '🐄', beschreibung: 'Tiergruppen und Bestände.', vorlage: V + 'tiergruppen-import-vorlage.csv', zielHref: '/dashboard/tierbestand', gruppe: 'betrieb' },
  { key: 'ertraege', label: 'Anlagen (Erträge/Energie)', icon: '☀️', beschreibung: 'PV-/BHKW-Anlagen für Erträge & Monitoring.', vorlage: V + 'ertraege-anlagen-import-vorlage.csv', zielHref: '/dashboard/ertraege', gruppe: 'betrieb' },
  { key: 'freigaben', label: 'Freigaben & Assets', icon: '✅', beschreibung: 'Kreativ-Assets für Freigaben & Proofing.', vorlage: V + 'freigaben-assets-import-vorlage.csv', zielHref: '/dashboard/freigaben', gruppe: 'betrieb' },

  // --- Finanzen & Förderung -------------------------------------------------
  { key: 'foerdervorhaben', label: 'Fördervorhaben', icon: '💰', beschreibung: 'Fördervorhaben mit Nachweis-Fristen.', vorlage: V + 'foerdervorhaben-import-vorlage.csv', zielHref: '/dashboard/foerdermittel', gruppe: 'finanzen' },
  { key: 'spenden', label: 'Spenden', icon: '❤️', beschreibung: 'Spenden und Zuwendungen (Verein/Sozial).', vorlage: V + 'spenden-import-vorlage.csv', zielHref: '/dashboard/spenden', gruppe: 'finanzen' },
];

/** Alle Quellen (Kopie, damit Aufrufer nicht die Konstante mutieren). */
export function importQuellen(): ImportQuelle[] {
  return [...IMPORT_QUELLEN];
}

/** Freitext-Filter über Label + Beschreibung (case-insensitive). Leerer Text = alle. */
export function sucheImporte(quellen: ImportQuelle[], text: string): ImportQuelle[] {
  const q = (text || '').trim().toLowerCase();
  if (!q) return quellen;
  return quellen.filter((s) => (s.label + ' ' + s.beschreibung).toLowerCase().includes(q));
}

/** Quellen ihren Gruppen zuordnen, in GRUPPEN-Reihenfolge. Leere Gruppen fallen raus. */
export function gruppiereImporte(
  quellen: ImportQuelle[],
): { key: ImportGruppeKey; label: string; icon: string; quellen: ImportQuelle[] }[] {
  return IMPORT_GRUPPEN
    .map((g) => ({ key: g.key, label: g.label, icon: g.icon, quellen: quellen.filter((s) => s.gruppe === g.key) }))
    .filter((g) => g.quellen.length > 0);
}

/** KPI-Zahlen fürs Cockpit. */
export function zaehleImporte(quellen: ImportQuelle[]): { gesamt: number; mitVorlage: number; gruppen: number } {
  const gesamt = quellen.length;
  const mitVorlage = quellen.filter((s) => !!s.vorlage).length;
  const gruppen = gruppiereImporte(quellen).length;
  return { gesamt, mitVorlage, gruppen };
}
