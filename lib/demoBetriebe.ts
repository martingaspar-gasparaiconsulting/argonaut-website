// ============================================================================
// ARGONAUT OS · lib/demoBetriebe.ts — die 21 Vorführ-Betriebe
//
// Je Website-Kategorie ein vollständig eingerichteter Demo-Betrieb, plus je
// einen zweiten für Handwerk & Bau und für Lebensmittel — macht 21. Gedacht für
// die Präsentation am großen Touchscreen: Ein Besucher tippt sich in SEINE
// Branche ein, schaut sich um, minimiert das Fenster — der Nächste ist dran.
// Deshalb hat jeder Betrieb eigene Zugangsdaten, und die sind bewusst kurz und
// komplett kleingeschrieben, damit man sie auf einer Bildschirmtastatur ohne
// Umschalten tippen kann.
//
// Alle Adressen, Namen, Steuernummern und IBANs sind erfunden. Die IBANs sind
// rechnerisch gültig (Prüfziffer stimmt), gehören aber zu keinem echten Konto —
// so laufen IBAN-Prüfungen und GiroCode sauber durch, ohne dass Geld fließen
// kann. Die E-Mail-Adressen liegen auf der Unterdomain demo.argonaut-os.com,
// auf der kein Postfach existiert: Es kann also nie versehentlich eine echte
// Nachricht an einen Demo-Betrieb rausgehen.
//
// `ziel` = wie viel der Startstrecke abgehakt wird. 20 Betriebe stehen auf 100
// (Rang Kapitän, Zertifikat abrufbar) — ein Besucher soll seine Branche als
// laufenden Betrieb sehen, nicht als Baustelle. Der Malerbetrieb bleibt bewusst
// unfertig: Daran wird vorgeführt, wie die Startstrecke läuft, wie das Auge beim
// Aufstieg aufleuchtet und was danach kommt.
//
// Hinweis zur Anzeige: Der Balken zeigt beim Maler etwas MEHR als diesen Wert,
// weil die Seite Schritte wie Firmendaten, IBAN, erster Kontakt und erste
// Rechnung selbst erkennt, sobald die Übungswelt geladen ist. Der Betrieb landet
// dadurch etwa beim Rang Steuermann — genau der Punkt, an dem man den Weg nach
// oben am besten zeigen kann.
//
// Keine Imports, keine Hooks — node-testbar, von Client UND Server nutzbar.
// ============================================================================

export type DemoBetrieb = {
  /** Kurzschlüssel — zugleich Postfach-Teil und Passwort-Stamm. */
  slug: string;
  /** Exakt eine der 19 Kategorien aus branchenkatalog.ts. */
  kategorie: string;
  /** Was der Betrieb konkret macht (erscheint als profiles.branche). */
  branche: string;
  firma: string;
  rechtsform: string;
  inhaber: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  website: string;
  ustId: string;
  steuernummer: string;
  iban: string;
  bank: string;
  bic: string;
  /** Angestrebter Onboarding-Fortschritt in Prozent. */
  ziel: number;
};

const BANK = 'Baden-Württembergische Bank';
const BIC = 'SOLADEST600';

export const DEMO_MAILDOMAIN = 'demo.argonaut-os.com';

export const DEMO_BETRIEBE: DemoBetrieb[] = [
  {
    slug: 'maler', kategorie: 'Handwerk & Bau', branche: 'Maler- und Lackiererbetrieb',
    firma: 'Malerwerkstätten Brandeis', rechtsform: 'GmbH', inhaber: 'Tobias Brandeis',
    strasse: 'Tilsiter Straße 14', plz: '71065', ort: 'Sindelfingen', telefon: '07031 480912',
    website: 'www.malerwerkstaetten-brandeis.de', ustId: 'DE811472093', steuernummer: '56012/48291',
    iban: 'DE30600501010004711000', bank: BANK, bic: BIC, ziel: 45,
  },
  {
    slug: 'metall', kategorie: 'Industrie & Produktion', branche: 'CNC-Zerspanung und Metallverarbeitung',
    firma: 'Präzisionstechnik Hohenlohe', rechtsform: 'GmbH', inhaber: 'Andreas Rühle',
    strasse: 'Industriering 7', plz: '74613', ort: 'Öhringen', telefon: '07941 602340',
    website: 'www.praezision-hohenlohe.de', ustId: 'DE812093447', steuernummer: '81015/29347',
    iban: 'DE17600501010004711137', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'baustoff', kategorie: 'Handel & E-Commerce', branche: 'Baustoff- und Fliesengroßhandel',
    firma: 'Baustoff & Fliesen Kirchner', rechtsform: 'GmbH', inhaber: 'Sabine Kirchner',
    strasse: 'Am Güterbahnhof 22', plz: '71638', ort: 'Ludwigsburg', telefon: '07141 298760',
    website: 'www.kirchner-baustoffe.de', ustId: 'DE813844021', steuernummer: '71019/40128',
    iban: 'DE04600501010004711274', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'autohaus', kategorie: 'Fahrzeuge & Mobilität', branche: 'Autohaus mit Meisterwerkstatt',
    firma: 'Autohaus Renz', rechtsform: 'GmbH & Co. KG', inhaber: 'Michael Renz',
    strasse: 'Hanns-Klemm-Straße 3', plz: '71034', ort: 'Böblingen', telefon: '07031 271450',
    website: 'www.autohaus-renz.de', ustId: 'DE814290877', steuernummer: '56014/31905',
    iban: 'DE88600501010004711411', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'hotel', kategorie: 'Gastronomie, Hotellerie & Tourismus', branche: 'Hotel mit Restaurant und Tagungsräumen',
    firma: 'Hotel Waldblick Betriebs', rechtsform: 'GmbH', inhaber: 'Carolin Steinweg',
    strasse: 'Höhenweg 8', plz: '72270', ort: 'Baiersbronn', telefon: '07442 831200',
    website: 'www.hotel-waldblick-schwarzwald.de', ustId: 'DE815003162', steuernummer: '84018/22470',
    iban: 'DE75600501010004711548', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'metzger', kategorie: 'Lebensmittel & Nahversorgung', branche: 'Metzgerei mit Partyservice und drei Filialen',
    firma: 'Metzgerei Hauber', rechtsform: 'GmbH', inhaber: 'Jürgen Hauber',
    strasse: 'Marktplatz 6', plz: '71083', ort: 'Herrenberg', telefon: '07032 914455',
    website: 'www.metzgerei-hauber.de', ustId: 'DE815771408', steuernummer: '56017/19023',
    iban: 'DE62600501010004711685', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'spedition', kategorie: 'Logistik & Transport', branche: 'Spedition für Stückgut und Teilladungen',
    firma: 'Spedition Wörner Logistik', rechtsform: 'GmbH', inhaber: 'Frank Wörner',
    strasse: 'Fritz-Müller-Straße 41', plz: '70806', ort: 'Kornwestheim', telefon: '07154 800230',
    website: 'www.woerner-logistik.de', ustId: 'DE816224590', steuernummer: '71022/50881',
    iban: 'DE49600501010004711822', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'itsystem', kategorie: 'IT & Technologie', branche: 'IT-Systemhaus und Managed Services',
    firma: 'Nordwind IT-Systemhaus', rechtsform: 'GmbH', inhaber: 'Daniel Ostermann',
    strasse: 'Rotebühlplatz 19', plz: '70178', ort: 'Stuttgart', telefon: '0711 6209140',
    website: 'www.nordwind-it.de', ustId: 'DE816940335', steuernummer: '99024/61203',
    iban: 'DE36600501010004711959', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'solar', kategorie: 'Energie & Umwelt', branche: 'Photovoltaik-Fachbetrieb mit Speicherlösungen',
    firma: 'Sonnenkraft Neckartal', rechtsform: 'GmbH', inhaber: 'Melanie Fuchs',
    strasse: 'Weilstraße 30', plz: '73728', ort: 'Esslingen', telefon: '0711 3407790',
    website: 'www.sonnenkraft-neckartal.de', ustId: 'DE817380114', steuernummer: '99026/33470',
    iban: 'DE23600501010004712096', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'immobilien', kategorie: 'Immobilien & Verwaltung', branche: 'WEG- und Mietverwaltung',
    firma: 'Hausverwaltung Kremer & Partner', rechtsform: 'GmbH', inhaber: 'Petra Kremer',
    strasse: 'Kaiserallee 51', plz: '76185', ort: 'Karlsruhe', telefon: '0721 5590280',
    website: 'www.kremer-hausverwaltung.de', ustId: 'DE818114772', steuernummer: '35029/47712',
    iban: 'DE10600501010004712233', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'agentur', kategorie: 'Marketing, Medien & Kreativ', branche: 'Werbeagentur für Marke und Kampagne',
    firma: 'Nordlicht Werbeagentur', rechtsform: 'GmbH', inhaber: 'Jonas Feddersen',
    strasse: 'Tübinger Straße 12', plz: '70178', ort: 'Stuttgart', telefon: '0711 2489330',
    website: 'www.nordlicht-agentur.de', ustId: 'DE818903641', steuernummer: '99031/20465',
    iban: 'DE94600501010004712370', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'kanzlei', kategorie: 'Recht, Steuern & Finanzen', branche: 'Steuerberatungskanzlei',
    firma: 'Steuerkanzlei Baumgartner & Kollegen', rechtsform: 'PartG mbB', inhaber: 'Dr. Ulrike Baumgartner',
    strasse: 'Wilhelmstraße 24', plz: '72074', ort: 'Tübingen', telefon: '07071 940850',
    website: 'www.kanzlei-baumgartner.de', ustId: 'DE819447208', steuernummer: '86033/11294',
    iban: 'DE81600501010004712507', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'akademie', kategorie: 'Bildung & Wissenschaft', branche: 'Akademie für Technik und Weiterbildung',
    firma: 'Akademie für Technik und Weiterbildung', rechtsform: 'gGmbH', inhaber: 'Stefan Lindner',
    strasse: 'Gartenstraße 45', plz: '72764', ort: 'Reutlingen', telefon: '07121 337720',
    website: 'www.akademie-technik-reutlingen.de', ustId: 'DE820118554', steuernummer: '86035/60037',
    iban: 'DE68600501010004712644', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'physio', kategorie: 'Gesundheit & Wellness', branche: 'Physiotherapie mit Rehasport',
    firma: 'Physiotherapie am Schlossgarten', rechtsform: 'GbR', inhaber: 'Katrin Adler',
    strasse: 'Schorndorfer Straße 9', plz: '71638', ort: 'Ludwigsburg', telefon: '07141 640920',
    website: 'www.physio-schlossgarten.de', ustId: 'DE820774390', steuernummer: '71037/28840',
    iban: 'DE55600501010004712781', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'fitness', kategorie: 'Sport, Beauty & Lifestyle', branche: 'Fitness- und Gesundheitsstudio',
    firma: 'Puls 7 Fitness & Gesundheit', rechtsform: 'GmbH', inhaber: 'Marco Deuschle',
    strasse: 'Mercedesstraße 18', plz: '71063', ort: 'Sindelfingen', telefon: '07031 730410',
    website: 'www.puls7-fitness.de', ustId: 'DE821330976', steuernummer: '56039/71128',
    iban: 'DE42600501010004712918', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'tierarzt', kategorie: 'Tiere', branche: 'Kleintierpraxis mit Operationsraum',
    firma: 'Tierarztpraxis Dr. Schwaiger', rechtsform: 'Einzelunternehmen', inhaber: 'Dr. Anne Schwaiger',
    strasse: 'Echterdinger Weg 4', plz: '71111', ort: 'Waldenbuch', telefon: '07157 528830',
    website: 'www.tierarzt-schwaiger.de', ustId: 'DE821998214', steuernummer: '56041/33206',
    iban: 'DE29600501010004713055', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'galabau', kategorie: 'Landwirtschaft, Garten & Forst', branche: 'Garten- und Landschaftsbau',
    firma: 'Garten- und Landschaftsbau Zeller', rechtsform: 'GmbH', inhaber: 'Thomas Zeller',
    strasse: 'Merklinger Straße 60', plz: '71263', ort: 'Weil der Stadt', telefon: '07033 469180',
    website: 'www.galabau-zeller.de', ustId: 'DE822540883', steuernummer: '56043/90514',
    iban: 'DE16600501010004713192', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'reinigung', kategorie: 'Dienstleistungen', branche: 'Gebäudereinigung und Objektbetreuung',
    firma: 'Marek Gebäudeservice', rechtsform: 'GmbH', inhaber: 'Ewa Marek',
    strasse: 'Heilbronner Straße 150', plz: '70191', ort: 'Stuttgart', telefon: '0711 8807260',
    website: 'www.marek-gebaeudeservice.de', ustId: 'DE823117045', steuernummer: '99045/12780',
    iban: 'DE03600501010004713329', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'verein', kategorie: 'Kultur, Soziales & Öffentliches', branche: 'Sozialer Träger mit Werkstatt und Tagesstätte',
    firma: 'Sozialwerk Neckar-Alb', rechtsform: 'e. V.', inhaber: 'Bernd Hofmeister',
    strasse: 'Karlstraße 33', plz: '72764', ort: 'Reutlingen', telefon: '07121 480330',
    website: 'www.sozialwerk-neckar-alb.de', ustId: 'DE823880619', steuernummer: '86047/55003',
    iban: 'DE87600501010004713466', bank: BANK, bic: BIC, ziel: 100,
  },

  // --- Zwei Zusatzbetriebe -------------------------------------------------
  // Handwerk & Bau und Lebensmittel bekommen je einen zweiten Betrieb: Es sind
  // die beiden Kategorien mit den meisten Anfragen, und zwei unterschiedliche
  // Betriebe derselben Kategorie zeigen sehr schön, dass ARGONAUT nicht nur
  // „irgendwas für Handwerker" ist, sondern je Gewerk anders aussieht.
  {
    slug: 'heizung', kategorie: 'Handwerk & Bau', branche: 'Sanitär-, Heizungs- und Klimatechnik',
    firma: 'Sanitär- und Heizungsbau Vollmer', rechtsform: 'GmbH', inhaber: 'Kai Vollmer',
    strasse: 'Robert-Bosch-Straße 26', plz: '71229', ort: 'Leonberg', telefon: '07152 337480',
    website: 'www.vollmer-haustechnik.de', ustId: 'DE824116730', steuernummer: '56049/28107',
    iban: 'DE74600501010004713603', bank: BANK, bic: BIC, ziel: 100,
  },
  {
    slug: 'baeckerei', kategorie: 'Lebensmittel & Nahversorgung', branche: 'Bäckerei und Konditorei mit fünf Filialen',
    firma: 'Bäckerei Sonnenschein', rechtsform: 'GmbH', inhaber: 'Markus Sonnenschein',
    strasse: 'Poststraße 11', plz: '71032', ort: 'Böblingen', telefon: '07031 220980',
    website: 'www.baeckerei-sonnenschein.de', ustId: 'DE824773158', steuernummer: '56050/44219',
    iban: 'DE61600501010004713740', bank: BANK, bic: BIC, ziel: 100,
  },
];

/** E-Mail-Adresse eines Demo-Betriebs. */
export function demoEmail(slug: string): string {
  return `${slug}@${DEMO_MAILDOMAIN}`;
}

/** Passwort eines Demo-Betriebs — bewusst klein und ohne Sonderzeichen. */
export function demoPasswort(slug: string): string {
  return `${slug}2026`;
}

/** Ist das eine Demo-Adresse? Wird gebraucht, um Mailversand daran zu unterbinden. */
export function istDemoAdresse(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase().endsWith(`@${DEMO_MAILDOMAIN}`);
}

/** Betrieb zu einem Slug. */
export function demoBetrieb(slug: string): DemoBetrieb | undefined {
  return DEMO_BETRIEBE.find((b) => b.slug === slug);
}

/** Zugangsblatt-Zeilen für die Vorbereitung der Präsentation. */
export function zugangsblatt(): Array<{ branche: string; firma: string; email: string; passwort: string; ziel: number }> {
  return DEMO_BETRIEBE.map((b) => ({
    branche: b.kategorie,
    firma: `${b.firma} ${b.rechtsform}`.trim(),
    email: demoEmail(b.slug),
    passwort: demoPasswort(b.slug),
    ziel: b.ziel,
  }));
}
