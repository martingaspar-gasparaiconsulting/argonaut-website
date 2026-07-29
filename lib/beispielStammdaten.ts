// ============================================================================
// ARGONAUT OS · lib/beispielStammdaten.ts — Beispiel-Artikel & -Lieferanten
//
// Schicht Stammdaten der Übungswelt (Punkt 23). Liefert branchentypische
// Beispiel-Artikel (ERP/Lager) und -Lieferanten. Wird von lib/uebungswelt.ts
// als Seeder eingebunden — nur fuer Branchen mit Lager/ERP (Modul-Gate 'erp').
//
// Entfernen laeuft ausschliesslich ueber das Register `beispiel_datensatz`
// (diese Tabellen haben keine quelle-Spalte) — die neue Zeilen-ID wird beim
// Anlegen dort vermerkt. Zur Erkennung tragen alle Beispiele einen Hinweis in
// beschreibung/notizen.
//
// Keine Hooks, kein Supabase — reine Logik, node-testbar.
// ============================================================================

const BEISPIEL_HINWEIS = 'Beispiel-Datensatz der Uebungswelt — jederzeit ueber den Schalter im Onboarding entfernbar.';

export type BeispielArtikel = {
  bezeichnung: string;
  artikelnummer?: string;
  kategorie: string;
  einheit: string;
  einkaufspreis?: number;
  verkaufspreis?: number;
  mindestbestand: number;
  aktuellerBestand: number;
  lagerort?: string;
};

export type BeispielLieferant = {
  name: string;
  ansprechpartner?: string;
  telefon?: string;
  adresse?: string;
  kundennummer?: string;
};

export const GENERISCHE_ARTIKEL: BeispielArtikel[] = [
  { bezeichnung: 'Beispiel-Artikel Standard', artikelnummer: 'BSP-001', kategorie: 'Allgemein', einheit: 'Stk', einkaufspreis: 5.0, verkaufspreis: 12.0, mindestbestand: 10, aktuellerBestand: 40, lagerort: 'Lager A' },
  { bezeichnung: 'Beispiel-Artikel Premium', artikelnummer: 'BSP-002', kategorie: 'Allgemein', einheit: 'Stk', einkaufspreis: 8.0, verkaufspreis: 19.0, mindestbestand: 5, aktuellerBestand: 25, lagerort: 'Lager A' },
  { bezeichnung: 'Verbrauchsmaterial', artikelnummer: 'BSP-003', kategorie: 'Verbrauch', einheit: 'Pkg', einkaufspreis: 2.0, verkaufspreis: 6.0, mindestbestand: 20, aktuellerBestand: 80, lagerort: 'Lager B' },
];

export const GENERISCHE_LIEFERANTEN: BeispielLieferant[] = [
  { name: 'Beispiel Lieferant GmbH', ansprechpartner: 'Herr Schneider', telefon: '0711 1000010', adresse: 'Stuttgart', kundennummer: 'K-1001' },
  { name: 'Muster Grosshandel KG', ansprechpartner: 'Frau Weber', telefon: '089 2000020', adresse: 'Muenchen', kundennummer: 'K-1002' },
];

export const BEISPIEL_ARTIKEL: Record<string, BeispielArtikel[]> = {
  'Handwerk & Bau': [
    { bezeichnung: 'Saegekette 3/8 Zoll', artikelnummer: 'HW-100', kategorie: 'Verschleissteile', einheit: 'Stk', einkaufspreis: 12.5, verkaufspreis: 24.9, mindestbestand: 5, aktuellerBestand: 20, lagerort: 'Regal A2' },
    { bezeichnung: 'Schrauben-Sortiment Edelstahl', artikelnummer: 'HW-110', kategorie: 'Befestigung', einheit: 'Pkg', einkaufspreis: 8.0, verkaufspreis: 16.9, mindestbestand: 10, aktuellerBestand: 40, lagerort: 'Regal B1' },
    { bezeichnung: 'Silikon transparent 310 ml', artikelnummer: 'HW-120', kategorie: 'Dichtstoffe', einheit: 'Kartusche', einkaufspreis: 3.2, verkaufspreis: 7.5, mindestbestand: 12, aktuellerBestand: 60, lagerort: 'Regal C3' },
    { bezeichnung: 'Arbeitshandschuhe Gr. 10', artikelnummer: 'HW-130', kategorie: 'PSA', einheit: 'Paar', einkaufspreis: 2.1, verkaufspreis: 5.9, mindestbestand: 20, aktuellerBestand: 80, lagerort: 'Eingang' },
  ],
  'Industrie & Produktion': [
    { bezeichnung: 'Rundstahl S235 Durchmesser 20 mm', artikelnummer: 'IND-200', kategorie: 'Rohmaterial', einheit: 'm', einkaufspreis: 4.8, mindestbestand: 50, aktuellerBestand: 200, lagerort: 'Hochregal 1' },
    { bezeichnung: 'Kuehlschmierstoff 20 l', artikelnummer: 'IND-210', kategorie: 'Betriebsstoffe', einheit: 'Kanister', einkaufspreis: 45.0, mindestbestand: 4, aktuellerBestand: 12, lagerort: 'Gefahrstoff' },
    { bezeichnung: 'Wendeschneidplatte CNMG', artikelnummer: 'IND-220', kategorie: 'Werkzeug', einheit: 'Stk', einkaufspreis: 6.5, mindestbestand: 20, aktuellerBestand: 100, lagerort: 'Werkzeugausgabe' },
    { bezeichnung: 'Europalette', artikelnummer: 'IND-230', kategorie: 'Verpackung', einheit: 'Stk', einkaufspreis: 8.0, mindestbestand: 30, aktuellerBestand: 120, lagerort: 'Versand' },
  ],
  'Handel & E-Commerce': [
    { bezeichnung: 'T-Shirt Basic weiss', artikelnummer: 'HA-300', kategorie: 'Bekleidung', einheit: 'Stk', einkaufspreis: 4.5, verkaufspreis: 14.9, mindestbestand: 20, aktuellerBestand: 120, lagerort: 'Regal 1' },
    { bezeichnung: 'Kaffeebecher Keramik', artikelnummer: 'HA-310', kategorie: 'Haushalt', einheit: 'Stk', einkaufspreis: 2.8, verkaufspreis: 9.9, mindestbestand: 15, aktuellerBestand: 60, lagerort: 'Regal 2' },
    { bezeichnung: 'Notizbuch A5', artikelnummer: 'HA-320', kategorie: 'Buerobedarf', einheit: 'Stk', einkaufspreis: 1.9, verkaufspreis: 6.9, mindestbestand: 25, aktuellerBestand: 90, lagerort: 'Regal 3' },
    { bezeichnung: 'Versandkarton M', artikelnummer: 'HA-330', kategorie: 'Verpackung', einheit: 'Stk', einkaufspreis: 0.6, mindestbestand: 50, aktuellerBestand: 300, lagerort: 'Versand' },
  ],
  'Fahrzeuge & Mobilität': [
    { bezeichnung: 'Motoroel 5W-30 5 l', artikelnummer: 'FZ-400', kategorie: 'Betriebsstoffe', einheit: 'Kanister', einkaufspreis: 18.0, verkaufspreis: 39.9, mindestbestand: 8, aktuellerBestand: 30, lagerort: 'Oellager' },
    { bezeichnung: 'Oelfilter universal', artikelnummer: 'FZ-410', kategorie: 'Ersatzteile', einheit: 'Stk', einkaufspreis: 4.5, verkaufspreis: 12.9, mindestbestand: 15, aktuellerBestand: 50, lagerort: 'Regal E1' },
    { bezeichnung: 'Bremsscheiben-Satz', artikelnummer: 'FZ-420', kategorie: 'Ersatzteile', einheit: 'Satz', einkaufspreis: 42.0, verkaufspreis: 89.0, mindestbestand: 4, aktuellerBestand: 12, lagerort: 'Regal E2' },
    { bezeichnung: 'Scheibenwischer 24 Zoll', artikelnummer: 'FZ-430', kategorie: 'Zubehoer', einheit: 'Stk', einkaufspreis: 5.5, verkaufspreis: 14.9, mindestbestand: 10, aktuellerBestand: 40, lagerort: 'Regal Z1' },
  ],
  'Gastronomie, Hotellerie & Tourismus': [
    { bezeichnung: 'Kaffeebohnen Espresso 1 kg', artikelnummer: 'GA-500', kategorie: 'Getraenke', einheit: 'kg', einkaufspreis: 12.0, mindestbestand: 6, aktuellerBestand: 24, lagerort: 'Lager Kueche' },
    { bezeichnung: 'Pommes frites 2,5 kg TK', artikelnummer: 'GA-510', kategorie: 'Lebensmittel', einheit: 'Beutel', einkaufspreis: 4.2, mindestbestand: 10, aktuellerBestand: 40, lagerort: 'Tiefkuehl' },
    { bezeichnung: 'Serviette 2-lagig', artikelnummer: 'GA-520', kategorie: 'Verbrauch', einheit: 'Pkg', einkaufspreis: 1.8, mindestbestand: 20, aktuellerBestand: 80, lagerort: 'Lager Service' },
    { bezeichnung: 'Reinigungsmittel Kueche 5 l', artikelnummer: 'GA-530', kategorie: 'Reinigung', einheit: 'Kanister', einkaufspreis: 9.5, mindestbestand: 4, aktuellerBestand: 12, lagerort: 'Putzraum' },
  ],
  'Lebensmittel & Nahversorgung': [
    { bezeichnung: 'Weizenmehl Type 550 25 kg', artikelnummer: 'LM-600', kategorie: 'Rohware', einheit: 'Sack', einkaufspreis: 11.0, mindestbestand: 8, aktuellerBestand: 30, lagerort: 'Trockenlager' },
    { bezeichnung: 'Butter 250 g', artikelnummer: 'LM-610', kategorie: 'Rohware', einheit: 'Stk', einkaufspreis: 1.6, verkaufspreis: 2.49, mindestbestand: 30, aktuellerBestand: 120, lagerort: 'Kuehlung' },
    { bezeichnung: 'Verpackungsfolie LMIV', artikelnummer: 'LM-620', kategorie: 'Verpackung', einheit: 'Rolle', einkaufspreis: 14.0, mindestbestand: 5, aktuellerBestand: 15, lagerort: 'Lager' },
    { bezeichnung: 'Eier Freiland 10er', artikelnummer: 'LM-630', kategorie: 'Rohware', einheit: 'Pkg', einkaufspreis: 2.1, verkaufspreis: 3.49, mindestbestand: 20, aktuellerBestand: 60, lagerort: 'Kuehlung' },
  ],
  'Logistik & Transport': [
    { bezeichnung: 'Palettenfolie Stretch', artikelnummer: 'LO-700', kategorie: 'Verpackung', einheit: 'Rolle', einkaufspreis: 6.5, mindestbestand: 20, aktuellerBestand: 60, lagerort: 'Packbereich' },
    { bezeichnung: 'Umzugskarton', artikelnummer: 'LO-710', kategorie: 'Verpackung', einheit: 'Stk', einkaufspreis: 1.2, verkaufspreis: 3.9, mindestbestand: 50, aktuellerBestand: 200, lagerort: 'Lager' },
    { bezeichnung: 'Spanngurt 5 m', artikelnummer: 'LO-720', kategorie: 'Ladungssicherung', einheit: 'Stk', einkaufspreis: 3.8, verkaufspreis: 9.9, mindestbestand: 30, aktuellerBestand: 100, lagerort: 'Fuhrpark' },
    { bezeichnung: 'Diesel-Additiv 1 l', artikelnummer: 'LO-730', kategorie: 'Betriebsstoffe', einheit: 'Stk', einkaufspreis: 5.0, mindestbestand: 10, aktuellerBestand: 30, lagerort: 'Tankstelle' },
  ],
  'Landwirtschaft, Garten & Forst': [
    { bezeichnung: 'Saatgut Weizen 25 kg', artikelnummer: 'LW-800', kategorie: 'Betriebsmittel', einheit: 'Sack', einkaufspreis: 22.0, mindestbestand: 10, aktuellerBestand: 40, lagerort: 'Scheune' },
    { bezeichnung: 'Duenger NPK 50 kg', artikelnummer: 'LW-810', kategorie: 'Betriebsmittel', einheit: 'Sack', einkaufspreis: 28.0, mindestbestand: 8, aktuellerBestand: 30, lagerort: 'Lagerhalle' },
    { bezeichnung: 'Motorsaegenoel 5 l', artikelnummer: 'LW-820', kategorie: 'Betriebsstoffe', einheit: 'Kanister', einkaufspreis: 14.0, mindestbestand: 6, aktuellerBestand: 18, lagerort: 'Werkstatt' },
    { bezeichnung: 'Kartoffeln Speise 12,5 kg', artikelnummer: 'LW-830', kategorie: 'Direktvermarktung', einheit: 'Sack', einkaufspreis: 6.0, verkaufspreis: 12.5, mindestbestand: 15, aktuellerBestand: 50, lagerort: 'Hofladen' },
  ],
};

export const BEISPIEL_LIEFERANTEN: Record<string, BeispielLieferant[]> = {
  'Handwerk & Bau': [
    { name: 'Baucentrum Sued GmbH', ansprechpartner: 'Herr Fischer', telefon: '07031 500100', adresse: 'Boeblingen', kundennummer: 'L-2001' },
    { name: 'Werkzeug Profi Handel', ansprechpartner: 'Frau Klein', telefon: '0711 500200', adresse: 'Stuttgart', kundennummer: 'L-2002' },
  ],
  'Industrie & Produktion': [
    { name: 'Metall Grosshandel Nord', ansprechpartner: 'Herr Weber', telefon: '07131 500300', adresse: 'Heilbronn', kundennummer: 'L-2101' },
    { name: 'Zerspanung Werkzeug KG', ansprechpartner: 'Herr Bauer', telefon: '0711 500400', adresse: 'Esslingen', kundennummer: 'L-2102' },
  ],
  'Handel & E-Commerce': [
    { name: 'Import Distribution GmbH', ansprechpartner: 'Frau Roth', telefon: '069 500500', adresse: 'Frankfurt', kundennummer: 'L-2201' },
    { name: 'Verpackung24 Versand', ansprechpartner: 'Herr Sommer', telefon: '0711 500600', adresse: 'Ludwigsburg', kundennummer: 'L-2202' },
  ],
  'Fahrzeuge & Mobilität': [
    { name: 'KFZ-Teile Zentrallager', ansprechpartner: 'Herr Yilmaz', telefon: '0711 500700', adresse: 'Stuttgart', kundennummer: 'L-2301' },
    { name: 'Schmierstoffe Sued', ansprechpartner: 'Frau Lang', telefon: '07141 500800', adresse: 'Kornwestheim', kundennummer: 'L-2302' },
  ],
  'Gastronomie, Hotellerie & Tourismus': [
    { name: 'Gastro Grosshandel Frische', ansprechpartner: 'Herr Keller', telefon: '07531 500900', adresse: 'Konstanz', kundennummer: 'L-2401' },
    { name: 'Getraenke Lieferservice', ansprechpartner: 'Frau Huber', telefon: '07071 501000', adresse: 'Tuebingen', kundennummer: 'L-2402' },
  ],
  'Lebensmittel & Nahversorgung': [
    { name: 'Muehle Backzutaten', ansprechpartner: 'Herr Gruenberg', telefon: '07032 501100', adresse: 'Herrenberg', kundennummer: 'L-2501' },
    { name: 'Molkerei Regional', ansprechpartner: 'Frau Braun', telefon: '0711 501200', adresse: 'Stuttgart', kundennummer: 'L-2502' },
  ],
  'Logistik & Transport': [
    { name: 'Verpackung & Ladungssicherung', ansprechpartner: 'Herr Berg', telefon: '0721 501300', adresse: 'Karlsruhe', kundennummer: 'L-2601' },
    { name: 'Betriebsstoffe Fuhrpark', ansprechpartner: 'Frau Neumann', telefon: '07131 501400', adresse: 'Heilbronn', kundennummer: 'L-2602' },
  ],
  'Landwirtschaft, Garten & Forst': [
    { name: 'Raiffeisen Betriebsmittel', ansprechpartner: 'Herr Schmid', telefon: '07452 501500', adresse: 'Nagold', kundennummer: 'L-2701' },
    { name: 'Agrar Saatgut Handel', ansprechpartner: 'Frau Wild', telefon: '07051 501600', adresse: 'Calw', kundennummer: 'L-2702' },
  ],
};

/** Beispiel-Artikel zu einer Kategorie (Fallback: generische Artikel). */
export function beispielArtikel(kategorie: string | null | undefined): BeispielArtikel[] {
  if (kategorie && kategorie in BEISPIEL_ARTIKEL) return BEISPIEL_ARTIKEL[kategorie];
  return GENERISCHE_ARTIKEL;
}

/** Beispiel-Lieferanten zu einer Kategorie (Fallback: generische Lieferanten). */
export function beispielLieferanten(kategorie: string | null | undefined): BeispielLieferant[] {
  if (kategorie && kategorie in BEISPIEL_LIEFERANTEN) return BEISPIEL_LIEFERANTEN[kategorie];
  return GENERISCHE_LIEFERANTEN;
}

/** Fertige DB-Zeilen fuer die artikel-Tabelle (aktiv per DB-Default). */
export function beispielArtikelZeilen(kategorie: string | null | undefined, ownerId: string): Record<string, unknown>[] {
  return beispielArtikel(kategorie).map((a) => ({
    owner_user_id: ownerId,
    artikelnummer: a.artikelnummer ?? null,
    bezeichnung: a.bezeichnung,
    beschreibung: BEISPIEL_HINWEIS,
    kategorie: a.kategorie ?? null,
    einheit: a.einheit || 'Stk',
    einkaufspreis: a.einkaufspreis ?? null,
    verkaufspreis: a.verkaufspreis ?? null,
    mindestbestand: a.mindestbestand ?? 0,
    aktueller_bestand: a.aktuellerBestand ?? 0,
    lagerort: a.lagerort ?? null,
  }));
}

/** Fertige DB-Zeilen fuer die lieferanten-Tabelle. */
export function beispielLieferantenZeilen(kategorie: string | null | undefined, ownerId: string): Record<string, unknown>[] {
  return beispielLieferanten(kategorie).map((l) => ({
    owner_user_id: ownerId,
    name: l.name,
    ansprechpartner: l.ansprechpartner ?? null,
    telefon: l.telefon ?? null,
    adresse: l.adresse ?? null,
    kundennummer: l.kundennummer ?? null,
    notizen: BEISPIEL_HINWEIS,
    aktiv: true,
  }));
}
