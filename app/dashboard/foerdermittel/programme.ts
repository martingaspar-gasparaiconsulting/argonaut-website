// ============================================================
// ARGONAUT OS · Bündel 12 · Fördermittel-Katalog (kuratiert)
// Stand: Juli 2026. Nur AKTUELL AKTIVE Bundesprogramme + typische
// Landesbausteine. Bewusst NICHT enthalten (ausgelaufen): "go-digital"
// (Anfang 2025 beendet) und "Digital Jetzt" — deren Nachfolge sind die
// kostenlosen Mittelstand-Digital Zentren und die Landes-Digitalboni.
//
// WICHTIG: Förderhöhen, Quoten und Fristen ändern sich. Dieser Katalog gibt
// eine verlässliche Orientierung; die verbindlichen Konditionen stehen immer
// beim jeweiligen Träger (Link je Programm). Reine Datendatei — keine Imports.
// ============================================================

export const FOERDER_STAND = 'Juli 2026';

export type Foerderart = 'zuschuss' | 'kredit' | 'beratung';
export type FoerderKategorie =
  | 'digitalisierung' | 'beratung' | 'energie' | 'investition'
  | 'gruendung' | 'weiterbildung' | 'innovation';
export type FoerderPhase = 'gruendung' | 'bestand' | 'beide';

export type FoerderProgramm = {
  key: string;
  name: string;
  traeger: string;               // z. B. BAFA, KfW, BMWE, Agentur für Arbeit, Land
  ebene: 'bund' | 'land';
  art: Foerderart[];
  kategorien: FoerderKategorie[];
  phase: FoerderPhase;
  kurz: string;                  // Ein-Satz-Nutzen
  wer: string;                   // Zielgruppe
  hoehe: string;                 // Förderhöhe / -quote (Orientierung)
  link: string;                  // offizielle Quelle
};

export const ART_LABEL: Record<Foerderart, string> = {
  zuschuss: 'Zuschuss (nicht zurückzahlen)',
  kredit: 'Zinsgünstiger Kredit',
  beratung: 'Geförderte / kostenlose Beratung',
};

export const KATEGORIE_LABEL: Record<FoerderKategorie, string> = {
  digitalisierung: '💻 Digitalisierung & KI',
  beratung: '🧭 Beratung & Coaching',
  energie: '⚡ Energie & Effizienz',
  investition: '🏗 Investition & Finanzierung',
  gruendung: '🚀 Gründung & Nachfolge',
  weiterbildung: '🎓 Weiterbildung',
  innovation: '💡 Innovation & Forschung',
};

export const BUNDESLAENDER = [
  'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen', 'Hamburg',
  'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen', 'Nordrhein-Westfalen',
  'Rheinland-Pfalz', 'Saarland', 'Sachsen', 'Sachsen-Anhalt',
  'Schleswig-Holstein', 'Thüringen',
];

export const FOERDER_PROGRAMME: FoerderProgramm[] = [
  {
    key: 'bafa-beratung',
    name: 'Förderung von Unternehmensberatungen für KMU',
    traeger: 'BAFA', ebene: 'bund',
    art: ['zuschuss', 'beratung'], kategorien: ['beratung'], phase: 'beide',
    kurz: 'Zuschuss zu den Kosten einer qualifizierten Unternehmensberatung.',
    wer: 'Kleine und mittlere Unternehmen (KMU) sowie Freie Berufe.',
    hoehe: 'Bis zu 80 % der Beratungskosten; förderfähig i. d. R. bis 3.500 € Beratungshonorar (regional gestaffelt).',
    link: 'https://www.bafa.de/DE/Wirtschaft/Beratung_Finanzierung/Unternehmensberatung/unternehmensberatung_node.html',
  },
  {
    key: 'bafa-ebm',
    name: 'Energieberatung im Mittelstand (EBM)',
    traeger: 'BAFA', ebene: 'bund',
    art: ['zuschuss', 'beratung'], kategorien: ['energie', 'beratung'], phase: 'bestand',
    kurz: 'Zuschuss für eine qualifizierte Energieberatung im Betrieb.',
    wer: 'KMU mit Sitz/Niederlassung in Deutschland.',
    hoehe: 'Bis zu 80 % der Beratungskosten; Deckel 1.200 € (Energiekosten ≤ 10.000 €/Jahr) bzw. 6.000 € (darüber).',
    link: 'https://www.bafa.de/SharedDocs/Standardartikel/Aufgaben/E/energieberatung_mittelstand.html',
  },
  {
    key: 'eew',
    name: 'Bundesförderung Energieeffizienz in der Wirtschaft (EEW)',
    traeger: 'BAFA / KfW', ebene: 'bund',
    art: ['zuschuss', 'kredit'], kategorien: ['energie', 'investition'], phase: 'bestand',
    kurz: 'Zuschüsse/Kredite für energieeffiziente Anlagen, Prozesswärme und Abwärmenutzung.',
    wer: 'Unternehmen aller Größen (private Wirtschaft).',
    hoehe: 'Förderquote je Modul, häufig 30–40 % der Investition; Kreditvariante über KfW.',
    link: 'https://www.bafa.de/DE/Energie/Energieeffizienz/Energieeffizienz_Wirtschaft/energieeffizienz_wirtschaft_node.html',
  },
  {
    key: 'kfw-unternehmerkredit',
    name: 'KfW-Unternehmerkredit / ERP-Förderkredit KMU',
    traeger: 'KfW', ebene: 'bund',
    art: ['kredit'], kategorien: ['investition'], phase: 'bestand',
    kurz: 'Zinsgünstiger Kredit für Investitionen und Betriebsmittel.',
    wer: 'Bestehende Unternehmen und Freiberufler.',
    hoehe: 'Bis 25 Mio. € je Vorhaben, lange Laufzeiten, tilgungsfreie Anlaufjahre.',
    link: 'https://www.kfw.de/inlandsfoerderung/Unternehmen/',
  },
  {
    key: 'erp-gruenderkredit',
    name: 'ERP-Gründerkredit – StartGeld',
    traeger: 'KfW', ebene: 'bund',
    art: ['kredit'], kategorien: ['gruendung'], phase: 'gruendung',
    kurz: 'Kredit für Gründung und junge Unternehmen – auch im Nebenerwerb.',
    wer: 'Gründer/innen und Unternehmen bis 5 Jahre nach Gründung.',
    hoehe: 'Bis 125.000 € (davon bis 50.000 € Betriebsmittel); 80 % Haftungsfreistellung für die Hausbank.',
    link: 'https://www.kfw.de/inlandsfoerderung/Unternehmen/Gr%C3%BCnden-Erweitern/',
  },
  {
    key: 'invest',
    name: 'INVEST – Zuschuss für Wagniskapital',
    traeger: 'BAFA', ebene: 'bund',
    art: ['zuschuss'], kategorien: ['gruendung', 'innovation'], phase: 'gruendung',
    kurz: 'Belohnt private Investoren (Business Angels), die in junge innovative Firmen investieren.',
    wer: 'Junge innovative Unternehmen, die Beteiligungskapital einwerben.',
    hoehe: '20 % Erwerbszuschuss auf das investierte Kapital für den Investor (weitere Bausteine möglich).',
    link: 'https://www.bafa.de/DE/Wirtschaft/Beratung_Finanzierung/Invest/invest_node.html',
  },
  {
    key: 'mittelstand-digital',
    name: 'Mittelstand-Digital Zentren',
    traeger: 'BMWE (Bund)', ebene: 'bund',
    art: ['beratung'], kategorien: ['digitalisierung', 'beratung', 'innovation'], phase: 'beide',
    kurz: 'Kostenlose, anbieterneutrale Beratung und Praxisprojekte zu Digitalisierung und KI.',
    wer: 'KMU und Handwerksbetriebe.',
    hoehe: 'Komplett kostenlos (öffentlich finanziert) – Nachfolge von „go-digital".',
    link: 'https://www.mittelstand-digital.de/',
  },
  {
    key: 'digitalbonus-land',
    name: 'Landes-Digitalbonus / Digitalisierungsprämie',
    traeger: 'Bundesland', ebene: 'land',
    art: ['zuschuss'], kategorien: ['digitalisierung', 'investition'], phase: 'beide',
    kurz: 'Zuschuss für Digitalisierungsprojekte (Software, Hardware, IT-Sicherheit) – je Bundesland verschieden.',
    wer: 'KMU im jeweiligen Bundesland. Achtung: einige Landesprogramme sind zeitweise pausiert.',
    hoehe: 'Sehr unterschiedlich je Land (oft mehrere Tausend bis ~50.000 € Zuschuss).',
    link: 'https://www.foerderdatenbank.de/',
  },
  {
    key: 'beg',
    name: 'Bundesförderung für effiziente Gebäude (BEG)',
    traeger: 'BAFA / KfW', ebene: 'bund',
    art: ['zuschuss', 'kredit'], kategorien: ['energie', 'investition'], phase: 'bestand',
    kurz: 'Förderung energetischer Sanierung und effizienter Gebäude – auch Betriebs-/Nichtwohngebäude.',
    wer: 'Eigentümer und Unternehmen mit betrieblichen Gebäuden.',
    hoehe: 'Zuschuss oder Kredit je Maßnahme (Anlagentechnik, Hülle, Heizung).',
    link: 'https://www.bafa.de/DE/Energie/Effiziente_Gebaeude/effiziente_gebaeude_node.html',
  },
  {
    key: 'weiterbildung',
    name: 'Förderung beruflicher Weiterbildung Beschäftigter',
    traeger: 'Agentur für Arbeit', ebene: 'bund',
    art: ['zuschuss'], kategorien: ['weiterbildung'], phase: 'beide',
    kurz: 'Zuschüsse zu Weiterbildungskosten und Arbeitsentgelt während der Qualifizierung.',
    wer: 'Unternehmen aller Größen (Qualifizierungschancengesetz).',
    hoehe: 'Förderquote nach Betriebsgröße gestaffelt – für kleine Betriebe am höchsten.',
    link: 'https://www.arbeitsagentur.de/unternehmen/finanziell/weiterbildung-beschaeftigter-qualifizierungschancengesetz',
  },
  {
    key: 'buergschaft',
    name: 'Bürgschaftsbank (Bürgschaft ohne Bank)',
    traeger: 'Bürgschaftsbank des Landes', ebene: 'land',
    art: ['kredit'], kategorien: ['investition', 'gruendung'], phase: 'beide',
    kurz: 'Ausfallbürgschaft, wenn für einen Kredit die banküblichen Sicherheiten fehlen.',
    wer: 'KMU und Gründer/innen mit tragfähigem Vorhaben.',
    hoehe: 'Bürgschaft bis 80 % des Kredits, i. d. R. bis 2,5 Mio. €.',
    link: 'https://www.vdb-info.de/mitglieder',
  },
];
