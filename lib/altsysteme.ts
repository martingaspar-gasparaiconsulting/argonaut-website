// ============================================================================
// ARGONAUT OS · lib/altsysteme.ts — „Aus welchem System ziehen Sie um?"
// (Umzug Schritt 2, 27.09.2026)
//
// Die Klick-Liste im Import-Center: der Betrieb hakt seine alten Programme an,
// fremde blendet er aus (je Betrieb gemerkt). Je System gibt es eine
// Schritt-fuer-Schritt-Anleitung fuer den Export und — wo belegt — die
// Spaltennamen, die dieses System in seine Datei schreibt. Der Import-Motor
// (lib/importMotor.ts) erkennt damit die Spalten zuerst am System und erst
// danach an den allgemeinen Aliasen.
//
// QUELLE: docs/ARGONAUT-ALTSYSTEME-RECHERCHE-27-09-2026.md (Hersteller-
// Hilfeseiten). Menuepfade und Spaltennamen stehen hier NUR, wo sie dort
// belegt sind. Alles andere ist ehrlich als „Export beim Hersteller erfragen"
// markiert (schritte: null) — lieber keine Anleitung als eine falsche.
//
// Reine Daten + reine Funktionen, keine Imports: von Client- und Server-Code
// nutzbar, mit node --test pruefbar.
// ============================================================================

export type AltsystemGruppe =
  | 'crm' | 'buchhaltung' | 'handwerk' | 'handel' | 'gastro'
  | 'gesundheit' | 'verein' | 'immobilien' | 'allgemein';

/** Die Ziele des Import-Motors, die ein Altsystem beliefern kann. */
export type MotorZiel = 'kontakte' | 'lieferanten' | 'artikel' | 'rechnungen';

export type Altsystem = {
  key: string;
  name: string;
  gruppe: AltsystemGruppe;
  /** Was sich exportieren laesst (ein Satz). */
  daten: string;
  formate: string[];
  /** Schritt fuer Schritt — null, wenn der Weg nicht belegt ist. */
  schritte: string[] | null;
  /** Besonderheiten, die der Kunde VOR dem Export wissen muss. */
  hinweise?: string[];
  /** Hersteller-Hilfeseite (oder Drittquelle, dann drittquelle: true). */
  quelle?: string;
  drittquelle?: boolean;
  /** Kann Stammdaten im DATEV-Format (Kopf "EXTF") ausgeben. */
  datev?: boolean;
  /** Welche Ziele im Import-Center dieses System beliefert. */
  ziele: MotorZiel[];
  /**
   * Belegte Spaltennamen je Ziel: Feld im Motor -> so heisst die Spalte in
   * der Datei dieses Systems. Nur Belegtes.
   */
  spalten?: Partial<Record<MotorZiel, Record<string, string[]>>>;
  /** Import erst nach Anwalt-Pruefung bzw. nur gemeinsam freigegeben. */
  sperre?: 'anwalt' | 'gemeinsam';
};

export const ALTSYSTEM_GRUPPEN: { key: AltsystemGruppe; label: string; icon: string }[] = [
  { key: 'crm', label: 'CRM & Vertrieb', icon: '🤝' },
  { key: 'buchhaltung', label: 'Buchhaltung & Rechnung', icon: '🧾' },
  { key: 'handwerk', label: 'Handwerk & Bau', icon: '🔧' },
  { key: 'handel', label: 'Handel, Shop & Kasse', icon: '🛒' },
  { key: 'gastro', label: 'Gastro & Hotel', icon: '🍽' },
  { key: 'gesundheit', label: 'Gesundheit & Tier', icon: '🩺' },
  { key: 'verein', label: 'Verein & Bildung', icon: '🎓' },
  { key: 'immobilien', label: 'Immobilien', icon: '🏠' },
  { key: 'allgemein', label: 'Allgemein (Excel, Google, Outlook)', icon: '📁' },
];

/** Der Satz, der ueberall steht, wo kein Weg belegt ist. */
export const HERSTELLER_FRAGEN =
  'Export beim Hersteller erfragen: Bitten Sie den Support Ihres bisherigen Programms um eine ' +
  'Excel- oder CSV-Datei Ihrer Kunden, Lieferanten und Artikel (mit Spaltenüberschriften). ' +
  'Diese Datei lesen wir hier ein.';

/**
 * DATEV-Stammdaten (Debitoren/Kreditoren): belegte Spaltennamen. Die
 * Adressfelder heissen fuer Kunden und Lieferanten gleich; nur Nummer und
 * Name landen im Ziel in anderen Feldern.
 */
const DATEV_ADRESSE: Record<string, string[]> = {
  strasse: ['Straße', 'Strasse'],
  plz: ['Postleitzahl'],
  ort: ['Ort'],
  land: ['Land'],
  telefon: ['Telefon'],
  email: ['E-Mail'],
  website: ['Internet'],
  ust_id: ['EU-UStID', 'EU-USt-IdNr.'],
};
export const DATEV_SPALTEN_KONTAKTE: Record<string, string[]> = {
  ...DATEV_ADRESSE,
  kundennummer: ['Konto'],
  firma: ['Name (Adressattyp Unternehmen)'],
  nachname: ['Name (Adressattyp natürl. Person)', 'Name (Adressattyp natuerl. Person)'],
  vorname: ['Vorname (Adressattyp natürl. Person)', 'Vorname (Adressattyp natuerl. Person)'],
  anrede: ['Anrede'],
};
export const DATEV_SPALTEN_LIEFERANTEN: Record<string, string[]> = {
  telefon: DATEV_ADRESSE.telefon,
  email: DATEV_ADRESSE.email,
  website: DATEV_ADRESSE.website,
  ust_id: DATEV_ADRESSE.ust_id,
  // Lieferanten haben EIN Adressfeld — Straße, PLZ und Ort werden zusammengesetzt.
  adresse_strasse: DATEV_ADRESSE.strasse,
  adresse_plz: DATEV_ADRESSE.plz,
  adresse_ort: DATEV_ADRESSE.ort,
  lieferantennummer: ['Konto'],
  name: ['Name (Adressattyp Unternehmen)'],
  ansprechpartner: ['Name (Adressattyp natürl. Person)', 'Name (Adressattyp natuerl. Person)'],
};

export const ALTSYSTEME: Altsystem[] = [
  // ---------------------------------------------------------------- CRM ---
  {
    key: 'hubspot', name: 'HubSpot', gruppe: 'crm',
    daten: 'Kontakte, Firmen und Deals', formate: ['CSV', 'XLSX', 'XLS'],
    schritte: [
      'Öffnen Sie im HubSpot-Menü „CRM" und dann das Objekt, z. B. „Kontakte".',
      'Wählen Sie die Ansicht mit allen Einträgen (keine gefilterte Ansicht).',
      'Klicken Sie auf „Exportieren" und wählen Sie CSV oder XLSX.',
      'HubSpot schickt Ihnen einen Download-Link per E-Mail.',
    ],
    hinweise: ['Die Spaltenüberschriften kommen in der Sprache Ihres HubSpot-Kontos — ARGONAUT erkennt Deutsch und Englisch.'],
    quelle: 'knowledge.hubspot.com/import-and-export/export-records',
    ziele: ['kontakte'],
    spalten: {
      kontakte: {
        import_schluessel: ['Record ID', 'Datensatz-ID'],
        vorname: ['First name', 'Vorname'],
        nachname: ['Last name', 'Nachname'],
        email: ['Email', 'E-Mail'],
        telefon: ['Phone number', 'Telefonnummer'],
        mobil: ['Mobile phone number', 'Mobiltelefonnummer'],
        strasse: ['Street address', 'Adresse'],
        ort: ['City', 'Stadt'],
        plz: ['Postal code', 'Postleitzahl'],
        land: ['Country/Region', 'Land/Region'],
        firma: ['Company name', 'Name des Unternehmens'],
        position: ['Job title', 'Jobbezeichnung'],
        status: ['Lifecycle stage', 'Lebenszyklusphase'],
      },
    },
  },
  {
    key: 'pipedrive', name: 'Pipedrive', gruppe: 'crm',
    daten: 'Deals, Personen, Organisationen, Aktivitäten und Produkte', formate: ['CSV', 'XLSX'],
    schritte: [
      'Klicken Sie oben rechts auf Ihr Kontomenü › „Tools and apps" › „Export data".',
      'Wählen Sie „Personen" (danach „Organisationen") und das Format CSV oder XLSX.',
      'Alternativ: in einer Liste über „…" › „Export filter results".',
      'Der Export liegt 28 Tage zum Herunterladen bereit.',
    ],
    hinweise: ['Eigene Felder kommen mit internen Kennungen als Überschrift — ARGONAUT legt sie als Eigene Felder an, Sie können sie danach umbenennen.'],
    quelle: 'support.pipedrive.com/en/article/exporting-data-from-pipedrive',
    ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'salesforce', name: 'Salesforce', gruppe: 'crm',
    daten: 'Alle Objekte als CSV im ZIP-Archiv', formate: ['CSV (ZIP)'],
    schritte: [
      'Öffnen Sie „Setup" und suchen Sie „Data Export".',
      'Klicken Sie auf „Export Now" und wählen Sie die Objekte (z. B. Account, Contact).',
      'Laden Sie das ZIP herunter und entpacken Sie es — jede CSV einzeln hier einlesen.',
    ],
    hinweise: ['Die Spalten tragen API-Namen (z. B. „Account.Name"). Formelfelder fehlen im Export.'],
    quelle: 'help.salesforce.com (sf.admin_exportdata.htm)',
    ziele: ['kontakte'],
  },
  {
    key: 'zoho', name: 'Zoho CRM', gruppe: 'crm',
    daten: 'Alle Module', formate: ['CSV (bis 200.000)', 'XLSX (bis 50.000)'],
    schritte: ['Öffnen Sie „Setup" › „Data Administration" › „Export".', 'Wählen Sie das Modul (z. B. Kontakte) und das Format.'],
    quelle: 'help.zoho.com (export-crm-data)', ziele: ['kontakte'],
  },
  {
    key: 'dynamics', name: 'Microsoft Dynamics 365', gruppe: 'crm',
    daten: 'Tabelle oder Ansicht als Excel', formate: ['XLSX'],
    schritte: ['Öffnen Sie die Ansicht (z. B. „Aktive Kontakte").', 'Klicken Sie in der Befehlsleiste auf „Export to Excel".'],
    quelle: 'learn.microsoft.com/power-apps/user/export-data-excel', ziele: ['kontakte'],
  },
  {
    key: 'centralstation', name: 'CentralStationCRM', gruppe: 'crm',
    daten: 'Personen, Firmen, Angebote und Projekte', formate: ['Excel', 'vCard', 'ZIP'],
    schritte: ['Klicken Sie auf das Zahnrad › „Account-Einstellungen".', 'Wählen Sie „Alle Daten exportieren".'],
    quelle: 'help.centralstationcrm.com/article/287', ziele: ['kontakte'],
  },
  {
    key: 'weclapp', name: 'weclapp', gruppe: 'crm',
    daten: 'Kunden, Artikel und Belege', formate: ['CSV', 'XLSX'],
    schritte: ['Öffnen Sie „Globale Einstellungen" › „Import/Export" (nur mit Admin-Rechten).', 'Starten Sie den Export-Assistenten und wählen Sie Kunden, danach Artikel.'],
    quelle: 'doc.weclapp.com (wie-kann-ich-meine-daten-exportieren)', ziele: ['kontakte', 'artikel', 'lieferanten'],
  },
  {
    key: 'close', name: 'Close', gruppe: 'crm',
    daten: 'Leads, Kontakte, Chancen und Aktivitäten', formate: ['CSV', 'JSON'],
    schritte: ['Öffnen Sie „Leads".', 'Klicken Sie auf „…" › „Export" und wählen Sie CSV.'],
    quelle: 'help.close.com/docs/exporting-data', ziele: ['kontakte'],
  },
  {
    key: 'monday', name: 'monday CRM', gruppe: 'crm',
    daten: 'Ein Board als Excel', formate: ['XLSX'],
    schritte: ['Öffnen Sie das Board (z. B. „Kontakte").', 'Klicken Sie auf die drei Punkte › „More actions" › „Export board to Excel".'],
    quelle: 'support.monday.com (26989749858578)', ziele: ['kontakte'],
  },
  {
    key: 'brevo', name: 'Brevo', gruppe: 'crm',
    daten: 'Kontakte', formate: ['CSV'],
    schritte: ['Öffnen Sie „CRM" › „Contacts".', 'Klicken Sie auf „More actions" › „Export".'],
    hinweise: ['Werbe-Einwilligungen übernimmt ARGONAUT nicht automatisch — sie gehören geprüft, bevor Sie Newsletter verschicken.'],
    quelle: 'help.brevo.com (5310065850642)', ziele: ['kontakte'],
    spalten: { kontakte: { email: ['EMAIL'], vorname: ['FIRSTNAME'], nachname: ['LASTNAME'] } },
  },

  // --------------------------------------------------------- Buchhaltung ---
  {
    key: 'datev', name: 'DATEV (Kanzlei-Rechnungswesen)', gruppe: 'buchhaltung',
    daten: 'Debitoren und Kreditoren im DATEV-Format, Offene Posten als Excel', formate: ['DATEV-Format (EXTF)', 'XLS'],
    schritte: [
      'Stammdaten: „Bestand" › „Exportieren" › „DATEV-Format" › Reiter „Stammdaten".',
      'Wichtig: den Haken „Nur geänderte Daten" entfernen, sonst fehlen Einträge.',
      'Offene Posten: „Anwendungen" › „Auswertungen Rechnungswesen" › „OPOS" › „Drucker" › „Export xls".',
      'Beide Dateien hier einlesen — ARGONAUT erkennt das DATEV-Format selbst und trennt Kunden (Debitoren) von Lieferanten (Kreditoren).',
    ],
    hinweise: ['Meist exportiert Ihr Steuerbüro diese Dateien für Sie.'],
    quelle: 'hilfe.candis.io (258513) · help.commitly.com (7032978) · manuals.dekodi.de',
    datev: true,
    ziele: ['kontakte', 'lieferanten', 'rechnungen'],
    spalten: { kontakte: DATEV_SPALTEN_KONTAKTE, lieferanten: DATEV_SPALTEN_LIEFERANTEN },
  },
  {
    key: 'lexware_office', name: 'Lexware Office (lexoffice)', gruppe: 'buchhaltung',
    daten: 'Kunden, Lieferanten, Artikel; Belege als DATEV-ZIP', formate: ['CSV', 'vCard', 'DATEV'],
    schritte: [
      'Kontakte: öffnen Sie „Kontakte", dann oben rechts „…" › Export als CSV.',
      'Artikel: öffnen Sie „Artikel", dann „…" › Export.',
      'Belege für das Steuerbüro: „Einstellungen" › „Export".',
    ],
    quelle: 'help.lexware.de (548273)', datev: true,
    ziele: ['kontakte', 'lieferanten', 'artikel'],
    spalten: {
      kontakte: { kundennummer: ['Kundennummer'], firma: ['Firmenname'], nachname: ['Ansprechpartner bei Firma'] },
      lieferanten: { lieferantennummer: ['Lieferantennummer'], name: ['Firmenname'], ansprechpartner: ['Ansprechpartner bei Firma'] },
    },
  },
  {
    key: 'lexware_faktura', name: 'Lexware faktura+auftrag / Warenwirtschaft', gruppe: 'buchhaltung',
    daten: 'Artikel, Kunden und Lieferanten', formate: ['CSV (ANSI, Semikolon)'],
    schritte: ['Öffnen Sie „Datei" › „Export".', 'Wählen Sie Kunden, danach Lieferanten und Artikel — je eine Datei.'],
    quelle: 'guide.jtl-software.com/jtl-wawi/jtl-ameise/lexware/',
    ziele: ['kontakte', 'lieferanten', 'artikel'],
    spalten: {
      kontakte: { kundennummer: ['Kundennummer'], anrede: ['Anrede'], nachname: ['Name'], vorname: ['Vorname'], firma: ['Firma'] },
      artikel: { artikelnummer: ['Artikelnummer'], bezeichnung: ['Bezeichnung'], kategorie: ['Warengruppe'] },
      lieferanten: { lieferantennummer: ['Lieferantennummer', 'Kreditorenkonto'], name: ['Matchcode'] },
    },
  },
  {
    key: 'sevdesk', name: 'sevdesk', gruppe: 'buchhaltung',
    daten: 'DATEV-kompatibler Export mit Belegen; Kontakte im DATEV-Stammdatenteil', formate: ['DATEV-CSV (ZIP)'],
    schritte: null,
    hinweise: ['Kontakte stecken im DATEV-Stammdatenteil des Exports — diese Datei hier einlesen.'],
    quelle: 'hilfe.sevdesk.de (9373838)', datev: true, ziele: ['kontakte', 'lieferanten'],
  },
  {
    key: 'debitoor', name: 'Debitoor / SumUp Rechnungen', gruppe: 'buchhaltung',
    daten: 'Rechnungen, Angebote, Kunden, Lieferanten, Produkte, Zahlungen', formate: ['CSV', 'XLSX', 'DATEV'],
    schritte: ['Öffnen Sie „Einstellungen" › „Profil" › „Datenexport".', 'Wählen Sie Kunden, Lieferanten und Produkte.'],
    quelle: 'debitoor.de/tutorial/einstellungen', datev: true, ziele: ['kontakte', 'lieferanten', 'artikel', 'rechnungen'],
  },
  {
    key: 'fastbill', name: 'FastBill', gruppe: 'buchhaltung',
    daten: 'Kunden, Produkte und Rechnungen; DATEV Debitoren/Kreditoren', formate: ['CSV', 'XLSX', 'XML', 'DATEV'],
    schritte: ['Öffnen Sie „Import Export" › „Export als Excel/XML/CSV".', 'Wählen Sie „Kundendaten".'],
    quelle: 'support.fastbill.com (360012777940, 225471187)', datev: true,
    ziele: ['kontakte', 'artikel', 'rechnungen'],
    spalten: {
      kontakte: {
        kundennummer: ['Kunden-Nr.'], firma: ['Firmenname'], anrede: ['Anrede'], vorname: ['Vorname'], nachname: ['Nachname'],
        strasse: ['Adresse'], plz: ['Postleitzahl'], ort: ['Ort'], land: ['Land'], telefon: ['Telefon'], email: ['E-Mail'],
        ust_id: ['USt-IdNr.'],
      },
    },
  },
  {
    key: 'billomat', name: 'Billomat', gruppe: 'buchhaltung',
    daten: 'Kunden, Lieferanten, Artikel, Belege; Komplett-Backup', formate: ['CSV', 'XML', 'JSON', 'ZIP'],
    schritte: ['Öffnen Sie „Berichte/Exporte" und wählen Sie die Belegart bzw. Kunden.', 'Alternativ das Komplett-Backup als ZIP.'],
    hinweise: ['Billomat löscht die Daten 6 Wochen nach der Kündigung — exportieren Sie vorher.'],
    quelle: 'support.aifinyo.de (22629706660764)', ziele: ['kontakte', 'lieferanten', 'artikel'],
  },
  {
    key: 'candis', name: 'Candis', gruppe: 'buchhaltung',
    daten: 'DATEV-nahe Exporte', formate: ['DATEV'], schritte: null,
    quelle: 'hilfe.candis.io/de/collections/623430-export', datev: true, ziele: ['lieferanten'],
  },
  {
    key: 'buchhaltungsbutler', name: 'BuchhaltungsButler', gruppe: 'buchhaltung',
    daten: 'Import & Export unter Einstellungen (Inhalt nicht belegt)', formate: [], schritte: null,
    quelle: 'wissen.buchhaltungsbutler.de (11421251511965)', ziele: ['kontakte', 'lieferanten'],
  },
  {
    key: 'papierkram', name: 'Papierkram', gruppe: 'buchhaltung',
    daten: 'Kontakte', formate: ['CSV'],
    schritte: ['Öffnen Sie „Stammdaten" › „Adressbuch".', 'Klicken Sie auf „CSV".'],
    quelle: 'hilfe.papierkram.de/adressverwaltung/', ziele: ['kontakte'],
  },
  {
    key: 'easybill', name: 'easybill', gruppe: 'buchhaltung',
    daten: 'Kunden (Spalten wählbar)', formate: ['CSV'],
    schritte: ['Öffnen Sie „Kontakte" › „Exportieren".', 'Die Datei finden Sie danach unter „Hintergrundprozesse".'],
    quelle: 'support.easybill.de (360001770099)', ziele: ['kontakte'],
  },
  {
    key: 'collmex', name: 'Collmex', gruppe: 'buchhaltung',
    daten: 'Angebote, Aufträge und Rechnungen (Collmex-Satzarten)', formate: ['CSV'],
    schritte: ['Öffnen Sie „Verkauf" und die gewünschte Liste.', 'Klicken Sie auf „Exportieren".'],
    quelle: 'collmex.de/handbuch_pro.html', ziele: ['rechnungen'],
  },
  {
    key: 'orgamax', name: 'orgaMAX', gruppe: 'buchhaltung',
    daten: 'Artikel, Interessenten, Kunden, Lieferanten, Preise, Aufträge, Rechnungen', formate: ['Excel'],
    schritte: ['Öffnen Sie „orgaMAX" › „Daten-Export".', 'Oder in jeder Liste: „Ansicht" › „Tabelle exportieren".'],
    quelle: 'info.orgamax.de/faq/datenexport', ziele: ['kontakte', 'lieferanten', 'artikel', 'rechnungen'],
  },
  {
    key: 'wiso_meinbuero', name: 'WISO MeinBüro', gruppe: 'buchhaltung',
    daten: 'Kunden, Artikel und Lieferanten (nur sichtbare Spalten)', formate: ['Excel'],
    schritte: [
      'Web-Version: in der Kundenliste auf den Pfeil oben rechts klicken.',
      'Desktop-Version: „Datei" › „Daten-Export" › „Kunden".',
      'Tipp: vorher alle Spalten einblenden — exportiert wird nur, was sichtbar ist.',
    ],
    quelle: 'handbuch.meinbuero.de', ziele: ['kontakte', 'lieferanten', 'artikel'],
    spalten: { kontakte: { kundennummer: ['KUNDENNUMMER'], firma: ['NACHNAMEFIRMA'], strasse: ['STRASSE'], plz: ['PLZ'], ort: ['ORT'], email: ['EMAIL'] } },
  },
  {
    key: 'sap_b1', name: 'SAP Business One', gruppe: 'buchhaltung',
    daten: 'Tabellen als Excel, Text oder XML', formate: ['Excel', 'TXT', 'XML'], schritte: null,
    quelle: 'sap-b1-blog.com', drittquelle: true, ziele: ['kontakte', 'lieferanten', 'artikel'],
  },

  // ------------------------------------------------------------ Handwerk ---
  {
    key: 'plancraft', name: 'Plancraft', gruppe: 'handwerk',
    daten: 'Kontakte; Rechnungen als ZIP/DATEV', formate: ['CSV', 'DATEV'],
    schritte: ['Öffnen Sie „Kontakte".', 'Klicken Sie auf das Symbol neben „Neuer Kontakt" › „Kontakte exportieren".'],
    quelle: 'help.plancraft.com (382746)', datev: true, ziele: ['kontakte'],
  },
  {
    key: 'craftnote', name: 'Craftnote', gruppe: 'handwerk',
    daten: 'Projekt-Archiv (Chat, Bilder, Dokumente)', formate: ['ZIP'],
    schritte: ['Öffnen Sie die Web-App › Projekt › „Details".', 'Klicken Sie auf „Daten exportieren".'],
    hinweise: ['Das Archiv enthält Fotos und Dokumente — die übernehmen Sie in den jeweiligen Modulen (Bautagebuch, Dokumente).'],
    quelle: 'hilfe.mycraftnote.de (360023632271)', ziele: [],
  },
  {
    key: 'hero', name: 'HERO Software', gruppe: 'handwerk',
    daten: 'Kunden, Buchhaltung und Belege', formate: ['CSV', 'Excel', 'DATEV'], schritte: null,
    quelle: 'hero-software.de/features/stammdaten/daten-export', datev: true, ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'taifun', name: 'Taifun', gruppe: 'handwerk',
    daten: 'Kunden als Excel; Artikel als Datanorm (Zusatzmodul)', formate: ['Excel', 'Datanorm'], schritte: null,
    quelle: 'taifun-software.de', ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'mosaik', name: "Moser MOS'aik", gruppe: 'handwerk',
    daten: 'Projekte als Excel („Analysieren"), Zeiten als TIM-Datei', formate: ['Excel', 'TIM'],
    schritte: ['Zeiten: „Zeiterfassung" › „Auswertungen" › „MOS\'aik-Export".', 'Projekte: in der Projektliste „Analysieren" › Excel.'],
    quelle: 'doku.mein-handwerker-app.de (103000269661)', ziele: [],
  },
  {
    key: 'openhandwerk', name: 'openHandwerk', gruppe: 'handwerk',
    daten: 'Mitarbeiter', formate: ['CSV'],
    schritte: ['Öffnen Sie „Einstellungen" › „Benutzer/Mitarbeiter".', 'Klicken Sie auf „Benutzerdaten exportieren".'],
    quelle: 'wissensdatenbank.openhandwerk.de', ziele: [],
  },
  {
    key: 'tooltime', name: 'ToolTime', gruppe: 'handwerk',
    daten: 'Angebote, Rechnungen, Positionen, Kunden, DATEV, GoBD', formate: ['CSV', 'XLSX', 'PDF'],
    schritte: ['Melden Sie sich als Inhaber an (nur diese Rolle darf exportieren).', 'Öffnen Sie „Dashboard" › „Datenexport".'],
    quelle: 'support.tooltime.de (4538822)', datev: true, ziele: ['kontakte', 'rechnungen'],
  },
  ...['Streit V.1', 'Label', 'TopKontor', 'pds', 'Sander & Doll'].map((name): Altsystem => ({
    key: schluessel(name), name, gruppe: 'handwerk', daten: 'Export-Weg nicht öffentlich beschrieben',
    formate: [], schritte: null, ziele: ['kontakte', 'artikel'],
  })),

  // -------------------------------------------------------------- Handel ---
  {
    key: 'jtl', name: 'JTL-Wawi', gruppe: 'handel',
    daten: 'Kunden und Artikel (Spalten frei wählbar)', formate: ['CSV'],
    schritte: ['Öffnen Sie die JTL-Ameise › „Export" › „Kunden" › „Kundendaten".', 'Danach genauso „Artikel".'],
    quelle: 'guide.jtl-software.com (kundendaten-exportieren)', ziele: ['kontakte', 'artikel', 'lieferanten'],
  },
  {
    key: 'xentral', name: 'Xentral', gruppe: 'handel',
    daten: 'Adressen', formate: ['CSV', 'Excel'],
    schritte: ['Öffnen Sie „Verkauf" › „Adressen" › „Übersicht" (bis 1.000 Einträge).', 'Für größere Mengen: das „Import/Export Center".'],
    quelle: 'help.xentral.com (4499048021788)', ziele: ['kontakte', 'lieferanten', 'artikel'],
  },
  {
    key: 'shopify', name: 'Shopify', gruppe: 'handel',
    daten: 'Kunden und Produkte', formate: ['CSV'],
    schritte: ['Öffnen Sie im Admin „Customers" (Kunden).', 'Klicken Sie auf „Export" — ab 50 Kunden kommt die Datei per E-Mail.'],
    hinweise: ['Die Spalte „Accepts Email Marketing" wird als Eigenes Feld übernommen — eine Werbe-Einwilligung gilt in ARGONAUT erst nach Prüfung.'],
    quelle: 'help.shopify.com (import-export-customers)', ziele: ['kontakte', 'artikel'],
    spalten: {
      kontakte: {
        vorname: ['First Name'], nachname: ['Last Name'], email: ['Email'], firma: ['Default Address Company'],
        strasse: ['Default Address Address1'], ort: ['Default Address City'], plz: ['Default Address Zip'],
        land: ['Default Address Country Code'], telefon: ['Phone'], notizen: ['Note'],
      },
    },
  },
  {
    key: 'woocommerce', name: 'WooCommerce', gruppe: 'handel',
    daten: 'Produkte; Kunden über Analytics', formate: ['CSV'],
    schritte: [
      'Produkte: „Produkte" › „Alle Produkte" › „Export".',
      'Kunden: „WooCommerce" › „Analytics" › „Customers" › „Download".',
    ],
    quelle: 'woocommerce.com (product-csv-importer-exporter, customer-analytics)', ziele: ['kontakte', 'artikel'],
    spalten: {
      artikel: {
        artikelnummer: ['SKU'], bezeichnung: ['Name'], beschreibung: ['Short description'],
        verkaufspreis: ['Regular price'], aktueller_bestand: ['Stock'], kategorie: ['Categories'],
      },
      kontakte: { nachname: ['Name'], email: ['Email'] },
    },
  },
  {
    key: 'shopware', name: 'Shopware 6', gruppe: 'handel',
    daten: 'Kunden, Produkte, Kategorien, Bestellungen', formate: ['CSV (UTF-8, Semikolon)'],
    schritte: ['Öffnen Sie „Einstellungen" › „Shop" › „Import/Export".', 'Wählen Sie das Profil (Kunden bzw. Produkte) und starten Sie den Export.'],
    quelle: 'docs.shopware.com (importexport)', ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'plentyone', name: 'PlentyONE (plentymarkets)', gruppe: 'handel',
    daten: 'Artikel, Aufträge, Kontakte, Bestand', formate: ['CSV'],
    schritte: ['Öffnen Sie „Daten" › „Daten exportieren".', 'Wählen Sie Kontakte, danach Artikel.'],
    quelle: 'knowledge.plentyone.com', ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'billbee', name: 'Billbee', gruppe: 'handel',
    daten: 'Kunden', formate: ['CSV'],
    schritte: ['Öffnen Sie „Kund:innen" › „Übersicht" › „Export".', 'Klicken Sie auf „Exportdatei erzeugen".'],
    quelle: 'hilfe.billbee.io (425)', ziele: ['kontakte'],
  },
  {
    key: 'amazon', name: 'Amazon Seller Central', gruppe: 'handel',
    daten: 'Angebotsbericht', formate: ['TXT (Tabulator)'],
    schritte: ['Öffnen Sie „Inventory" › „Inventory Reports".', 'Fordern Sie den Angebotsbericht an und laden Sie ihn herunter.'],
    quelle: 'webretailer.com', drittquelle: true, ziele: ['artikel'],
    spalten: { artikel: { bezeichnung: ['item-name'], artikelnummer: ['seller-sku'], verkaufspreis: ['price'], aktueller_bestand: ['quantity'] } },
  },
  {
    key: 'ebay', name: 'eBay', gruppe: 'handel',
    daten: 'Bestellungen und Angebote', formate: ['CSV'],
    schritte: ['Öffnen Sie „Seller Hub" › „Reports" › „Downloads".'],
    quelle: 'ebay.com/help (4096)', ziele: ['artikel'],
  },
  {
    key: 'lightspeed', name: 'Lightspeed', gruppe: 'handel',
    daten: 'Kunden und Artikel', formate: ['CSV'],
    schritte: [
      'Retail: „Customers" › „Export list".',
      'eCom: „Tools" › „Exports".',
      'Restaurant: „Users" › „Customers" › „Export".',
    ],
    quelle: 'lightspeedhq.com Support', ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'ready2order', name: 'ready2order', gruppe: 'handel',
    daten: 'Kunden, Produkte, Umsätze', formate: ['CSV', 'Excel'],
    schritte: ['Öffnen Sie „Einstellungen" › „Datenexport" › „Stammdaten".'],
    quelle: 'support.ready2order.com', ziele: ['kontakte', 'artikel'],
  },
  {
    key: 'gastrofix', name: 'Gastrofix', gruppe: 'handel',
    daten: 'Artikel', formate: ['CSV', 'XLS', 'PDF'],
    schritte: ['Öffnen Sie „Auswertung" › „Auswertung" › „Artikel" und exportieren Sie als CSV.'],
    quelle: 'support.gastrofix.com', ziele: ['artikel'],
  },
  {
    key: 'sumup_kasse', name: 'SumUp Kasse', gruppe: 'handel',
    daten: 'Artikelkatalog (Inhalt nicht belegt)', formate: [], schritte: null,
    quelle: 'help.sumup.com', ziele: ['artikel'],
  },
  {
    key: 'orderbird', name: 'orderbird', gruppe: 'handel',
    daten: 'Nur Umsatz- und Prüfer-Exporte, keine Stammdaten belegt', formate: [], schritte: null,
    quelle: 'support.orderbird.com', datev: true, ziele: [],
  },

  // ---------------------------------------------------------------- Gastro --
  {
    key: 'mews', name: 'Mews', gruppe: 'gastro',
    daten: 'Gästeprofile', formate: ['Excel'],
    schritte: ['Öffnen Sie „Menu" › „Profiles" › „Customer Profiles".', 'Wählen Sie den Modus „Created" und klicken Sie auf „Export".'],
    quelle: 'help.mews.com (4355037)', ziele: ['kontakte'],
  },
  {
    key: 'protel', name: 'protel', gruppe: 'gastro',
    daten: 'Gästekartei über den Mailing-Assistenten', formate: ['Text', 'dBASE'], schritte: null,
    quelle: 'help.protel.net', ziele: ['kontakte'],
  },
  {
    key: 'apaleo', name: 'Apaleo', gruppe: 'gastro',
    daten: 'Gäste und Buchungen', formate: ['CSV'], schritte: null,
    quelle: 'apaleo.zendesk.com (360008351139)', ziele: ['kontakte'],
    spalten: {
      kontakte: {
        vorname: ['FirstName'], nachname: ['LastName'], email: ['Email'], telefon: ['Phone'],
        strasse: ['AddressLine1'], plz: ['PostalCode'], ort: ['City'],
      },
    },
  },
  {
    key: 'quandoo', name: 'Quandoo', gruppe: 'gastro',
    daten: 'Gäste-CSV nur auf Anfrage', formate: ['CSV'], schritte: null,
    hinweise: ['Laut Drittquelle stellt Quandoo den Dienst ein (keine neuen Buchungen ab 30.09.2026, Abschaltung 31.12.2026) — fordern Sie Ihre Gästeliste rechtzeitig an.'],
    quelle: 'restaurantbookingsystem.com', drittquelle: true, ziele: ['kontakte'],
  },
  {
    key: 'opentable', name: 'OpenTable', gruppe: 'gastro',
    daten: 'Gästebuch („Export your Guestbook")', formate: ['CSV'], schritte: null,
    quelle: 'support.opentable.com', ziele: ['kontakte'],
  },
  ...['Hotelfriend', 'resmio'].map((name): Altsystem => ({
    key: schluessel(name), name, gruppe: 'gastro', daten: 'Export-Weg nicht öffentlich beschrieben',
    formate: [], schritte: null, ziele: ['kontakte'],
  })),

  // ----------------------------------------------------------- Gesundheit ---
  {
    key: 'doctolib', name: 'Doctolib', gruppe: 'gesundheit',
    daten: 'Patientenbasis und Terminhistorie (nur Gesamt-Admin)', formate: ['CSV', 'XLSX'],
    schritte: [
      'Öffnen Sie „Einstellungen" › „Weitere Einstellungen" › „Patientendaten" › „Exporte".',
      'Es entstehen zwei Dateien: export_patients-part-1.xlsx und export_rdv_[Start]-[Ende].xlsx — beide werden gebraucht.',
    ],
    quelle: 'doctolib.zendesk.com (204738165)', ziele: [], sperre: 'anwalt',
  },
  {
    key: 'easyvet', name: 'easyVET', gruppe: 'gesundheit',
    daten: 'Kunden, Tiere und Produkte', formate: ['CSV'],
    schritte: ['Öffnen Sie „Datensätze" › Filter „AlleKunden" bzw. „AllePatienten".', 'Bedingung „Nummer ≥ 0" setzen und „exportieren".'],
    quelle: 'handbuch.debevet.de', drittquelle: true, ziele: [], sperre: 'anwalt',
  },
  {
    key: 'shore', name: 'Shore', gruppe: 'gesundheit',
    daten: 'Kunden (Link per E-Mail)', formate: ['CSV'],
    schritte: ['Öffnen Sie „Kunden".', 'Klicken Sie auf den Pfeil neben „Optionen" und exportieren Sie.'],
    quelle: 'help.shore.com', ziele: ['kontakte'],
    spalten: { kontakte: { vorname: ['first_name'], nachname: ['last_name'], email: ['email'], mobil: ['mobile'] } },
  },
  {
    key: 'treatwell', name: 'Treatwell', gruppe: 'gesundheit',
    daten: 'Kunden', formate: ['CSV'], schritte: null,
    quelle: 'dothebeauty.com', drittquelle: true, ziele: ['kontakte'],
  },
  {
    key: 'vetera', name: 'Vetera', gruppe: 'gesundheit',
    daten: 'Nur über den Hersteller-Support', formate: [], schritte: null, ziele: [], sperre: 'anwalt',
  },
  ...['THEORG', 'Starke'].map((name): Altsystem => ({
    key: schluessel(name), name, gruppe: 'gesundheit', daten: 'Export-Weg nicht öffentlich beschrieben',
    formate: [], schritte: null, ziele: [], sperre: 'anwalt',
  })),

  // --------------------------------------------------------------- Verein ---
  {
    key: 'easyverein', name: 'easyVerein', gruppe: 'verein',
    daten: 'Mitglieder', formate: ['XLSX', 'CSV', 'PDF', 'vCard'],
    schritte: ['Öffnen Sie „Mitglieder" › „Export/Import".', 'Wählen Sie XLSX oder CSV.'],
    quelle: 'hilfe.easyverein.com (3382210)', ziele: [], sperre: 'gemeinsam',
  },
  {
    key: 'clubdesk', name: 'ClubDesk', gruppe: 'verein',
    daten: 'Mitglieder', formate: ['CSV'], schritte: null,
    quelle: 'forum.clubdesk.com', ziele: [], sperre: 'gemeinsam',
  },
  ...['WISO Mein Verein', 'Campai', 'Fahrschulcockpit'].map((name): Altsystem => ({
    key: schluessel(name), name, gruppe: 'verein', daten: 'Export-Weg nicht öffentlich beschrieben',
    formate: [], schritte: null, ziele: [], sperre: 'gemeinsam',
  })),

  // ----------------------------------------------------------- Immobilien ---
  {
    key: 'onoffice', name: 'onOffice enterprise', gruppe: 'immobilien',
    daten: 'Adressen, Immobilien, Aufgaben, Termine', formate: ['CSV'],
    schritte: ['Öffnen Sie „Extras" › „Datenexport".', 'Tagsüber gehen höchstens 5.000 Einträge je Export.'],
    quelle: 'de.enterprisehilfe.onoffice.com', ziele: ['kontakte'],
  },
  {
    key: 'flowfact', name: 'FLOWFACT', gruppe: 'immobilien',
    daten: 'Alter CRM Performer: Adressliste; neues FLOWFACT gesperrt', formate: ['Excel'],
    schritte: ['Nur CRM Performer: „Adressliste" › „Excel-Band".'],
    hinweise: ['Im neuen FLOWFACT ist der Export gesperrt — dort beim Hersteller erfragen.'],
    quelle: 'performer-service.flowfact.de', ziele: ['kontakte'],
  },
  {
    key: 'propstack', name: 'Propstack', gruppe: 'immobilien',
    daten: 'JSON-Datendump über die Schnittstelle (kostenpflichtig)', formate: ['JSON'], schritte: null,
    quelle: 'docs.propstack.de/reference/datendump', ziele: ['kontakte'],
  },
  {
    key: 'immoware24', name: 'Immoware24', gruppe: 'immobilien',
    daten: 'Auswertungen: Kontakte, Belegung, Mietverträge, Kautionen, Zähler, Zahlungen', formate: ['CSV'],
    schritte: ['Öffnen Sie die Auswertung (z. B. Kontakte).', 'Klicken Sie auf den Export-Knopf in der Fußzeile.'],
    quelle: 'support.immoware24.de (360018128817)', datev: true, ziele: ['kontakte'],
  },
  {
    key: 'domus', name: 'DOMUS ERP', gruppe: 'immobilien',
    daten: 'Adressen (adressen.csv)', formate: ['CSV'],
    schritte: ['Öffnen Sie „Berichte" › „Berichtsbaum" › Bericht Nr. 900.'],
    quelle: 'domus-software.de', ziele: ['kontakte'],
    spalten: { kontakte: { import_schluessel: ['ID'], nachname: ['Name'], strasse: ['Adresse'], plz: ['Postleitzahl'], ort: ['Stadt'] } },
  },
  {
    key: 'haufe_powerhaus', name: 'Haufe PowerHaus / wowinex', gruppe: 'immobilien',
    daten: 'Export-Weg nicht öffentlich beschrieben', formate: [], schritte: null, ziele: ['kontakte'],
  },

  // ------------------------------------------------------------ Allgemein ---
  {
    key: 'google_kontakte', name: 'Google Kontakte', gruppe: 'allgemein',
    daten: 'Kontakte', formate: ['CSV (Google/Outlook)', 'vCard'],
    schritte: ['Öffnen Sie contacts.google.com und markieren Sie die Kontakte.', 'Klicken Sie auf die drei Punkte › „Exportieren" › „Google CSV".'],
    quelle: 'support.google.com/contacts (7199294)', ziele: ['kontakte'],
    spalten: {
      kontakte: {
        vorname: ['First Name'], nachname: ['Last Name'], email: ['Email 1 - Value'], telefon: ['Phone 1 - Value'],
        strasse: ['Address 1 - Street'], firma: ['Organization Name'], position: ['Organization Title'],
        notizen: ['Notes'],
      },
    },
  },
  {
    key: 'outlook_kontakte', name: 'Outlook-Kontakte', gruppe: 'allgemein',
    daten: 'Kontakte', formate: ['CSV'],
    schritte: [
      'Klassisches Outlook: „Datei" › „Öffnen und Exportieren" › „Importieren/Exportieren" › „In Datei exportieren" › „CSV".',
      'Neues Outlook: „Personen" › „Kontakte exportieren".',
    ],
    hinweise: ['Die Überschriften kommen in der Sprache Ihres Outlook (z. B. „Vorname", „E-Mail-Adresse").'],
    quelle: 'support.microsoft.com', ziele: ['kontakte'],
    spalten: { kontakte: { vorname: ['Vorname'], nachname: ['Nachname'], email: ['E-Mail-Adresse'] } },
  },
  {
    key: 'google_kalender', name: 'Google Kalender', gruppe: 'allgemein',
    daten: 'Termine', formate: ['ICS', 'ZIP'],
    schritte: ['Öffnen Sie „Einstellungen" › „Importieren & Exportieren" › „Exportieren".'],
    hinweise: ['Termine (iCal) liest ARGONAUT in einem späteren Schritt ein.'],
    quelle: 'support.google.com/calendar (37111)', ziele: [],
  },
  {
    key: 'outlook_kalender', name: 'Outlook-Kalender', gruppe: 'allgemein',
    daten: 'Termine', formate: ['ICS'],
    schritte: ['Öffnen Sie den Kalender › „Datei" › „Kalender speichern".'],
    hinweise: ['Termine (iCal) liest ARGONAUT in einem späteren Schritt ein.'],
    quelle: 'support.microsoft.com', ziele: [],
  },
  {
    key: 'excel', name: 'Excel / eigene Listen', gruppe: 'allgemein',
    daten: 'Alles, was Sie in Tabellen führen', formate: ['XLSX', 'XLS', 'CSV'],
    schritte: [
      'Öffnen Sie Ihre Liste. Die erste Zeile muss die Spaltenüberschriften enthalten.',
      'Speichern Sie sie so, wie sie ist (XLSX) — oder bei sehr großen Listen über „Speichern unter" › „CSV (Trennzeichen-getrennt)".',
    ],
    ziele: ['kontakte', 'lieferanten', 'artikel', 'rechnungen'],
  },
];

function schluessel(name: string): string {
  return name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// Funktionen
// ---------------------------------------------------------------------------

export function altsystem(key: string): Altsystem | undefined {
  return ALTSYSTEME.find((s) => s.key === key);
}

/** Ist der Export-Weg belegt? Sonst: „Export beim Hersteller erfragen". */
export function istBelegt(s: Altsystem): boolean {
  return Array.isArray(s.schritte) && s.schritte.length > 0;
}

/** Die Anleitung zum Anzeigen: belegte Schritte oder der Hersteller-Satz. */
export function anleitung(s: Altsystem): { belegt: boolean; schritte: string[] } {
  if (istBelegt(s)) return { belegt: true, schritte: [...(s.schritte as string[])] };
  const schritte = [HERSTELLER_FRAGEN];
  if (s.datev) schritte.push('Dieses Programm kann Stammdaten im DATEV-Format ausgeben — auch diese Datei liest ARGONAUT.');
  return { belegt: false, schritte };
}

/** Warum ein System (noch) nicht importiert wird — oder null. */
export function sperrText(s: Altsystem): string | null {
  if (s.sperre === 'anwalt') {
    return 'Patienten- und Tierakten sind besonders geschützte Daten. Der Import wird erst freigeschaltet, wenn die rechtliche Prüfung abgeschlossen ist.';
  }
  if (s.sperre === 'gemeinsam') {
    return 'Mitgliederlisten enthalten meist Bankverbindungen und SEPA-Mandate. Diesen Import richten wir gemeinsam mit Ihnen ein.';
  }
  return null;
}

/** Freitext-Suche ueber Name, Daten und Formate. */
export function sucheAltsysteme(liste: readonly Altsystem[], text: string): Altsystem[] {
  const q = normal(text);
  if (!q) return [...liste];
  return liste.filter((s) => normal(`${s.name} ${s.daten} ${s.formate.join(' ')}`).includes(q));
}

/** In Gruppen-Reihenfolge; leere Gruppen fallen raus. */
export function gruppiereAltsysteme(liste: readonly Altsystem[]) {
  return ALTSYSTEM_GRUPPEN
    .map((g) => ({ ...g, systeme: liste.filter((s) => s.gruppe === g.key) }))
    .filter((g) => g.systeme.length > 0);
}

/**
 * Die gemerkte Wahl eines Betriebs anwenden: nur die angehakten zeigen, wenn
 * „nur meine" an ist; ausgeblendete fallen immer raus.
 */
export function sichtbareAltsysteme(
  liste: readonly Altsystem[],
  wahl: { systeme?: readonly string[] | null; ausgeblendet?: readonly string[] | null },
  nurMeine: boolean,
): Altsystem[] {
  const meine = new Set((wahl.systeme ?? []).filter(Boolean));
  const weg = new Set((wahl.ausgeblendet ?? []).filter(Boolean));
  return liste.filter((s) => {
    if (meine.has(s.key)) return true;
    if (nurMeine) return false;
    return !weg.has(s.key);
  });
}

/** Unbekannte Schluessel aus einer gespeicherten Wahl entfernen, doppelte auch. */
export function bereinigeWahl(keys: readonly unknown[] | null | undefined): string[] {
  const gueltig = new Set(ALTSYSTEME.map((s) => s.key));
  const raus: string[] = [];
  for (const k of keys ?? []) {
    if (typeof k === 'string' && gueltig.has(k) && !raus.includes(k)) raus.push(k);
  }
  return raus;
}

/**
 * Die belegten Spaltennamen der gewaehlten Systeme fuer EIN Ziel, als
 * Feld -> Aliase. Reihenfolge der Systeme = Prioritaet.
 */
export function systemAliase(systemKeys: readonly string[], ziel: string): Record<string, string[]> {
  const raus: Record<string, string[]> = {};
  for (const key of systemKeys) {
    const s = altsystem(key);
    const sp = s?.spalten?.[ziel as MotorZiel];
    if (!sp) continue;
    for (const [feld, namen] of Object.entries(sp)) {
      const liste = (raus[feld] ??= []);
      for (const n of namen) if (!liste.includes(n)) liste.push(n);
    }
  }
  return raus;
}

/**
 * Allgemeine Spaltennamen, die in JEDER deutschen oder englischen Liste
 * vorkommen. Sie sagen nichts darueber, aus welchem Programm eine Datei
 * stammt — „Kundennummer; Firma; PLZ" ist keine WISO-Datei, nur weil WISO
 * diese Woerter auch benutzt. Fuer die Erkennung zaehlen sie nicht.
 */
const ALLGEMEIN = new Set([
  'kundennummer', 'kunden nr', 'lieferantennummer', 'firma', 'firmenname', 'vorname', 'nachname', 'name', 'anrede',
  'strasse', 'plz', 'postleitzahl', 'ort', 'stadt', 'land', 'telefon', 'e mail', 'email', 'internet', 'adresse',
  'id', 'konto', 'bezeichnung', 'artikelnummer', 'warengruppe', 'matchcode', 'kreditorenkonto', 'position',
  'notizen', 'status', 'phone', 'city', 'mobile', 'price', 'quantity', 'sku', 'stock', 'note', 'notes',
]);

/**
 * Aus welchem System stammt diese Datei? Zaehlt die Spalten, die exakt einem
 * belegten, NICHT allgemeinen Spaltennamen eines Systems entsprechen. Erst ab
 * 3 solchen Treffern (bei kleinen Listen: alle, mindestens 2) gilt es als
 * erkannt. Lieber „unbekannt" als ein falsches Programm.
 */
export function erkenneAltsystem(
  kopf: readonly string[],
  kandidaten: readonly Altsystem[] = ALTSYSTEME,
): { key: string; name: string; treffer: number } | null {
  const spalten = new Set(kopf.map(normal).filter(Boolean));
  let bester: { key: string; name: string; treffer: number } | null = null;
  for (const s of kandidaten) {
    if (!s.spalten) continue;
    const namen = new Set<string>();
    for (const sp of Object.values(s.spalten)) {
      for (const liste of Object.values(sp ?? {})) for (const n of liste) {
        const x = normal(n);
        if (x && !ALLGEMEIN.has(x)) namen.add(x);
      }
    }
    let treffer = 0;
    for (const n of namen) if (spalten.has(n)) treffer++;
    const noetig = Math.max(2, Math.min(3, namen.size));
    if (treffer >= noetig && (!bester || treffer > bester.treffer)) bester = { key: s.key, name: s.name, treffer };
  }
  return bester;
}

export function zaehleAltsysteme(liste: readonly Altsystem[] = ALTSYSTEME) {
  return {
    gesamt: liste.length,
    belegt: liste.filter(istBelegt).length,
    mitSpalten: liste.filter((s) => !!s.spalten).length,
    datev: liste.filter((s) => s.datev).length,
  };
}

function normal(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
