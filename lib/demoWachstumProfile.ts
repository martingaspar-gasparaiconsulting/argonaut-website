// ============================================================================
// ARGONAUT OS · lib/demoWachstumProfile.ts — Paket 300: Zeitreise je Branche
//
// Für jede Website-Kategorie eine Zeitreise in drei Stufen:
//   Stufe 1  leeres Konto („Tag 1")                    → START-Betrieb hier
//   Stufe 2  bestehender Vorführ-Betrieb (erste Monate) → lib/demoBetriebe
//   Stufe 3  großer Betrieb nach 18 Monaten            → VOLL-Betrieb hier,
//            Daten aus lib/demoWachstum nach diesem Profil
//
// Kfz hat seine eigene, tiefere Reihe (P297–P299: kfzstart · autohaus ·
// premium). Das Handwerk steht vorn und bekommt zwei Reihen (Maler und
// Sanitär/Heizung) mit voller Baustelle: Einsatzplanung, Bautagebuch, Mängel,
// Aufmaße, Leistungsverzeichnis, Nachträge, Wartungsverträge, Fuhrpark.
//
// Alle Firmen, Namen, Anschriften, Steuernummern, USt-IdNr. und IBANs sind
// erfunden; IBAN und USt-IdNr. tragen eine gültige Prüfziffer (sonst warnt
// ARGONAUT mitten in der Vorführung), gehören aber zu keinem Konto.
// Keine Gesundheitsangaben (Physio, Tierarzt): nur Termine und Rechnungen.
// Reine Daten und Rechnung, node-testbar.
// ============================================================================

import type { DemoBetrieb } from './demoBetriebe';
import type { WachstumProfil } from './demoWachstum';

const BANK = 'Baden-Württembergische Bank';
const BIC = 'SOLADEST600';

/** IBAN mit gültiger Prüfziffer aus BLZ 60050101 und einer erfundenen Kontonummer. */
export function demoIban(konto: number): string {
  const bban = `60050101${String(konto).padStart(10, '0')}`;
  // mod 97 stückweise (ohne BigInt — Ziel ist ES2017)
  let rest = 0;
  for (const c of `${bban}131400`) rest = (rest * 10 + Number(c)) % 97;
  return `DE${String(98 - rest).padStart(2, '0')}${bban}`;
}

/** USt-IdNr. mit gültiger Prüfziffer (ISO 7064 MOD 11,10 — wie lib/ustIdNr). */
export function demoUstId(acht: string): string {
  let p = 10;
  for (const c of acht) { let s = (+c + p) % 10; if (s === 0) s = 10; p = (2 * s) % 11; }
  let pz = 11 - p;
  if (pz === 10) pz = 0;
  return `DE${acht}${pz}`;
}

type Firma = { slug: string; firma: string; rechtsform: string; inhaber: string; strasse: string; plz: string; ort: string; telefon: string; website: string; branche: string };
type Reihe = { start: Firma; voll: Firma; profil: Omit<WachstumProfil, 'slug' | 'start' | 'basis'>; basis: string; kategorie: string };

const F = (slug: string, firma: string, rechtsform: string, inhaber: string, strasse: string, plz: string, ort: string, telefon: string, branche: string): Firma =>
  ({ slug, firma, rechtsform, inhaber, strasse, plz, ort, telefon, branche, website: `www.${slug}-beispiel.de` });

// Wiederkehrende Kosten
const MIETE = (betrag: number): [string, string, number, number] => ['Vermietung Schönbuch GbR', 'Miete & Nebenkosten', betrag, 0];
const SOFTWARE: [string, string, number, number] = ['Software-Abo Beispiel GmbH', 'Software & IT', 349, 19];
const VERSICHERUNG = (betrag: number): [string, string, number, number] => ['Württembergische Beispiel-Versicherung', 'Versicherungen', betrag, 0];
const ENERGIE = (betrag: number): [string, string, number, number] => ['Stadtwerke Beispielstadt', 'Nebenkosten', betrag, 19];
const TANKEN = (betrag: number): [string, string, number, number] => ['Tankstelle Beispiel', 'Fahrzeugkosten', betrag, 19];

const REIHEN: Reihe[] = [
  // ======================================================================= HANDWERK
  {
    kategorie: 'Handwerk & Bau', basis: 'maler',
    start: F('malerstart', 'Malerbetrieb Sauter', 'e. K.', 'Jonas Sauter', 'Hindenburgstraße 41', '71083', 'Herrenberg', '07032 940210', 'Maler- und Lackiererbetrieb'),
    voll: F('malerplus', 'Farbwerk Steinhauser', 'GmbH', 'Ralf Steinhauser, Nina Steinhauser', 'Röntgenstraße 9', '71229', 'Leonberg', '07152 908300', 'Maler-, Lackier- und Fassadenbetrieb mit Bodenbelägen'),
    profil: {
      branche: 'Maler und Lackierer', icon: '🎨', prefix: 'FST',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer, Malermeister', 1], ['Geschäftsführerin', 1]] },
        { name: 'Bauleitung', rollen: [['Bauleiter, Malermeister', 2], ['Projektleiterin Fassade', 1]] },
        { name: 'Baustelle', aussen: true, rollen: [['Vorarbeiter', 3], ['Malergeselle', 12], ['Lackierer', 3], ['Bodenleger', 3], ['Auszubildender Maler', 4]] },
        { name: 'Büro', rollen: [['Büroleitung und Disposition', 1], ['Kalkulation und Angebote', 1], ['Buchhaltung', 1, 30]] },
      ],
      kunden: 380, firmenAnteil: 0.35,
      leistungen: [
        ['Innenanstrich Wände und Decken', 'm²', 60, 420, 11.8], ['Fassadenanstrich inkl. Untergrundvorbereitung', 'm²', 120, 650, 24.5],
        ['Tapezierarbeiten Vlies', 'm²', 30, 180, 16.9], ['Lackierung Türen und Zargen', 'Stk', 2, 14, 145], ['Bodenbelag Vinyl verlegen', 'm²', 20, 140, 34],
        ['Gerüststellung', 'Psch', 1, 1, 1650], ['Schimmelsanierung Innen', 'm²', 5, 40, 48], ['Malerstunde', 'Std', 4, 40, 64],
      ],
      umsatzJahr: 2600000, rechnungenStart: 22, rechnungenEnde: 46,
      kosten: [MIETE(3900), SOFTWARE, VERSICHERUNG(980), ENERGIE(640), TANKEN(1850)],
      einkaufQuote: 22, einkaufLieferant: 'Farben-Großhandel Beispiel KG',
      handwerk: { baustellen: ['Wohnanlage Lindenhof — Fassade', 'Praxis Dr. Ammann — Innenausbau', 'Schule am Park — Klassenzimmer', 'Bürogebäude Rapp — Treppenhaus', 'Mehrfamilienhaus Eberle — Komplettrenovierung', 'Hotel Sonnhalde — Zimmer 1. OG', 'Kindergarten Wiesenweg — Bodenbeläge'], wartung: 0, aufmasse: true },
      module: ['inventar', 'schulungen', 'bewerber', 'kontakt_aktivitaeten', 'erinnerung', 'leistungskatalog', 'bau_lv', 'bau_lv_positionen', 'bau_nachtrag'],
      kampagnen: ['Fassaden-Frühjahr', 'Wohnung renovieren vor dem Umzug', 'Azubi-Kampagne Malerhandwerk', 'Herbst-Aktion Innenräume'],
      zeigt: '32 Mitarbeiter, 7 Baustellen parallel, volle Einsatzplanung mit Monteuren, Bautagebuch, Mängel, Aufmaße, LV und Nachträge — und 18 Monate Umsatz im Chef-Blick.',
    },
  },
  {
    kategorie: 'Handwerk & Bau', basis: 'heizung',
    start: F('heizungstart', 'Haustechnik Ruoff', 'e. K.', 'Simon Ruoff', 'Bahnhofstraße 17', '71131', 'Jettingen', '07452 811340', 'Sanitär- und Heizungsbetrieb'),
    voll: F('heizungplus', 'Kälber Gebäudetechnik', 'GmbH', 'Andreas Kälber, Tanja Kälber', 'Max-Eyth-Straße 22', '71088', 'Holzgerlingen', '07031 744900', 'Sanitär, Heizung, Klima, Wärmepumpen und Kundendienst'),
    profil: {
      branche: 'Sanitär, Heizung, Klima', icon: '🔧', prefix: 'KGT',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer, Installateur- und Heizungsbaumeister', 1], ['Geschäftsführerin', 1]] },
        { name: 'Projektleitung', rollen: [['Projektleiter Heizung', 2], ['Projektleiterin Bad', 1], ['Energieberater', 1]] },
        { name: 'Montage', aussen: true, rollen: [['Obermonteur', 3], ['Anlagenmechaniker SHK', 14], ['Elektroniker für Wärmepumpen', 2], ['Auszubildender Anlagenmechaniker', 5]] },
        { name: 'Kundendienst', aussen: true, rollen: [['Kundendienstmonteur', 6]] },
        { name: 'Büro', rollen: [['Disposition Kundendienst', 2], ['Angebote und Förderanträge', 1], ['Buchhaltung', 1, 30], ['Empfang', 1, 25]] },
        { name: 'Lager', rollen: [['Lagerist', 2]] },
      ],
      kunden: 420, firmenAnteil: 0.3,
      leistungen: [
        ['Wärmepumpe Luft/Wasser inkl. Montage', 'Psch', 1, 1, 18900], ['Badsanierung komplett', 'Psch', 1, 1, 14800], ['Heizungswartung Gas/Öl', 'Psch', 1, 1, 189],
        ['Wartung Wärmepumpe', 'Psch', 1, 1, 249], ['Monteurstunde', 'Std', 2, 24, 72], ['Hydraulischer Abgleich', 'Psch', 1, 1, 890],
        ['Heizkörpertausch', 'Stk', 1, 8, 640], ['Notdienst-Einsatz', 'Psch', 1, 1, 145],
      ],
      umsatzJahr: 5500000, rechnungenStart: 26, rechnungenEnde: 48,
      kosten: [MIETE(5200), SOFTWARE, VERSICHERUNG(1450), ENERGIE(780), TANKEN(3100)],
      einkaufQuote: 38, einkaufLieferant: 'SHK-Großhandel Beispiel GmbH',
      handwerk: { baustellen: ['Neubau Reihenhäuser Schaal — Wärmepumpen', 'Badsanierung Familie Kurz', 'Pflegeheim Am Hang — Heizzentrale', 'Gewerbehalle Dürr — Lüftung', 'Altbau Bühler — Heizungstausch', 'Praxis Haug — Sanitär'], wartung: 260, aufmasse: true },
      module: ['inventar', 'schulungen', 'bewerber', 'kontakt_aktivitaeten', 'erinnerung', 'leistungskatalog', 'bau_lv', 'bau_lv_positionen', 'bau_nachtrag', 'pruefpflichten'],
      kampagnen: ['Wärmepumpe mit Förderung', 'Heizungs-Check vor dem Winter', 'Traumbad in 10 Tagen', 'Azubi-Kampagne SHK'],
      zeigt: '45 Mitarbeiter, Montage und Kundendienst, 260 Wartungsverträge, Wärmepumpen-Baustellen mit Bautagebuch, volle Einsatzplanung — 18 Monate Umsatz im Chef-Blick.',
    },
  },
  // ======================================================================= ÜBRIGE BRANCHEN
  {
    kategorie: 'Industrie & Produktion', basis: 'metall',
    start: F('metallstart', 'Drehteile Wörz', 'e. K.', 'Karl Wörz', 'Gewerbestraße 4', '74638', 'Waldenburg', '07942 300150', 'CNC-Lohnfertigung'),
    voll: F('metallplus', 'Hagmann Präzisionsteile', 'GmbH', 'Dr. Petra Hagmann', 'Industriestraße 30', '74532', 'Ilshofen', '07904 970200', 'CNC-Zerspanung, Baugruppen und Serienfertigung'),
    profil: {
      branche: 'Industrie und Fertigung', icon: '🏭', prefix: 'HAG',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführerin', 1], ['Technischer Leiter', 1]] },
        { name: 'Arbeitsvorbereitung', rollen: [['Arbeitsvorbereiter', 2], ['CAM-Programmierer', 2]] },
        { name: 'Fertigung', rollen: [['Schichtleiter', 3], ['Zerspanungsmechaniker', 14], ['Maschinenbediener', 6], ['Auszubildender Zerspanung', 3]] },
        { name: 'Qualität', rollen: [['Qualitätsmanagerin', 1], ['Messtechniker', 2]] },
        { name: 'Vertrieb und Büro', rollen: [['Vertrieb Innendienst', 2], ['Einkauf', 1], ['Buchhaltung', 1]] },
      ],
      kunden: 140, firmenAnteil: 1,
      leistungen: [['Drehteil Serie', 'Stk', 200, 2500, 4.8], ['Frästeil Aluminium', 'Stk', 50, 800, 18.5], ['Baugruppe montiert', 'Stk', 10, 120, 145], ['Rüstpauschale', 'Psch', 1, 1, 280], ['Prototyp', 'Stk', 1, 5, 890], ['Messprotokoll Erstmuster', 'Psch', 1, 1, 160]],
      umsatzJahr: 4800000, rechnungenStart: 26, rechnungenEnde: 44,
      kosten: [MIETE(8900), SOFTWARE, VERSICHERUNG(2100), ENERGIE(6800)],
      einkaufQuote: 35, einkaufLieferant: 'Stahl- und Alu-Handel Beispiel GmbH',
      module: ['fertigung_auftraege', 'bde_maschine', 'charge_los', 'zuschnitt_projekt', 'pruefpflichten', 'schulungen', 'inventar'],
      kampagnen: ['Messe-Nachfassaktion', 'Prototypen in 5 Tagen', 'Fachkräfte gesucht', 'Rahmenverträge Herbst'],
      zeigt: '42 Mitarbeiter im Schichtbetrieb, Fertigungsaufträge, Maschinen, Chargen, 140 Firmenkunden und 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Handel & E-Commerce', basis: 'baustoff',
    start: F('handelstart', 'Fliesen Eckert', 'e. K.', 'Sabrina Eckert', 'Lindenstraße 6', '71634', 'Ludwigsburg', '07141 870120', 'Fliesenfachhandel'),
    voll: F('handelplus', 'Baucenter Lutz', 'GmbH & Co. KG', 'Thomas Lutz', 'Hafenstraße 18', '71636', 'Ludwigsburg', '07141 990800', 'Baustoff- und Fliesenhandel mit Lieferdienst und Onlineshop'),
    profil: {
      branche: 'Handel', icon: '🛒', prefix: 'BCL',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer', 1], ['Prokuristin', 1]] },
        { name: 'Verkauf', rollen: [['Verkaufsleiter', 1], ['Fachberater Fliesen', 4], ['Fachberater Baustoffe', 4], ['Onlineshop und Kundenservice', 2]] },
        { name: 'Lager und Logistik', aussen: true, rollen: [['Lagerleiter', 1], ['Lagerist', 6], ['Berufskraftfahrer', 4]] },
        { name: 'Büro', rollen: [['Einkauf', 2], ['Buchhaltung', 2]] },
      ],
      kunden: 520, firmenAnteil: 0.55,
      leistungen: [['Feinsteinzeug 60×60', 'm²', 10, 180, 39.9], ['Fliesenkleber flex', 'Stk', 5, 80, 18.9], ['Trockenbauplatten', 'Stk', 10, 200, 7.4], ['Zement 25 kg', 'Stk', 10, 120, 6.9], ['Lieferung mit Kran', 'Psch', 1, 1, 89], ['Dämmplatten', 'm²', 20, 300, 14.5]],
      umsatzJahr: 6500000, rechnungenStart: 26, rechnungenEnde: 50,
      kosten: [MIETE(7400), SOFTWARE, VERSICHERUNG(1600), ENERGIE(1200), TANKEN(2600)],
      einkaufQuote: 68, einkaufLieferant: 'Baustoff-Union Beispiel eG',
      module: ['gutschein', 'schulungen', 'inventar'],
      kampagnen: ['Fliesen-Ausstellung Frühjahr', 'Profi-Kundenabend', 'Onlineshop-Start', 'Winter-Lagerverkauf'],
      zeigt: '28 Mitarbeiter, über 500 Kunden, Profi- und Privatkunden, Lieferdienst — 18 Monate Umsatz mit Wareneinsatz und Rohertrag.',
    },
  },
  {
    kategorie: 'Gastronomie, Hotellerie & Tourismus', basis: 'hotel',
    start: F('hotelstart', 'Gasthof zur Linde', 'e. K.', 'Monika Pfisterer', 'Dorfstraße 2', '72250', 'Freudenstadt', '07441 860330', 'Gasthof mit Fremdenzimmern'),
    voll: F('hotelplus', 'Parkhotel Sonnhalde', 'GmbH', 'Michael und Carolin Sonnhalde', 'Kurparkweg 1', '72250', 'Freudenstadt', '07441 950000', 'Hotel mit 64 Zimmern, Restaurant, Spa und Tagungen'),
    profil: {
      branche: 'Hotel und Gastronomie', icon: '🏨', prefix: 'PHS',
      team: [
        { name: 'Direktion', rollen: [['Hoteldirektor', 1], ['Stellvertretende Direktorin', 1]] },
        { name: 'Rezeption', rollen: [['Empfangschefin', 1], ['Rezeptionist', 4], ['Auszubildende Hotelfach', 2]] },
        { name: 'Küche', rollen: [['Küchenchef', 1], ['Sous-Chef', 1], ['Koch', 5], ['Küchenhilfe', 3, 25]] },
        { name: 'Service', rollen: [['Restaurantleiter', 1], ['Servicekraft', 7, 30]] },
        { name: 'Housekeeping', rollen: [['Hausdame', 1], ['Zimmermädchen', 6, 30]] },
        { name: 'Spa und Tagung', rollen: [['Spa-Leitung', 1], ['Tagungs- und Eventmanagerin', 1]] },
        { name: 'Verwaltung', rollen: [['Buchhaltung', 1], ['Haustechniker', 1]] },
      ],
      kunden: 600, firmenAnteil: 0.25,
      leistungen: [['Übernachtung Doppelzimmer', 'Nacht', 1, 6, 168], ['Tagungspauschale', 'Person', 10, 60, 69], ['Bankett und Feier', 'Person', 20, 120, 54], ['Spa-Arrangement', 'Stk', 1, 4, 129], ['Halbpension', 'Person', 2, 10, 39]],
      umsatzJahr: 3600000, rechnungenStart: 26, rechnungenEnde: 48,
      kosten: [MIETE(14800), SOFTWARE, VERSICHERUNG(2400), ENERGIE(5600)],
      einkaufQuote: 18, einkaufLieferant: 'Gastro-Großhandel Beispiel GmbH',
      module: ['hotel_zimmer', 'hotel_belegungen', 'menu_gericht', 'gastro_reservierungen', 'gutschein', 'raum_ressource', 'schulungen'],
      kampagnen: ['Wellness-Winter', 'Firmen-Tagungen 2027', 'Hochzeits-Messe', 'Gutschein zu Weihnachten'],
      zeigt: '41 Mitarbeiter, Zimmer und Belegung, Restaurant, Tagungen, Gutscheine — 18 Monate Umsatz mit Saisonkurve.',
    },
  },
  {
    kategorie: 'Lebensmittel & Nahversorgung', basis: 'baeckerei',
    start: F('baeckerstart', 'Backstube Hämmerle', 'e. K.', 'Lukas Hämmerle', 'Marktstraße 3', '71101', 'Schönaich', '07031 650120', 'Handwerksbäckerei'),
    voll: F('baeckerplus', 'Bäckerei Mühlbauer', 'GmbH', 'Stefan Mühlbauer', 'Gottlieb-Daimler-Straße 12', '71065', 'Sindelfingen', '07031 870500', 'Bäckerei und Konditorei mit 9 Filialen und Catering'),
    profil: {
      branche: 'Bäckerei und Lebensmittel', icon: '🥨', prefix: 'BMB',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer, Bäckermeister', 1], ['Filialleitung gesamt', 1]] },
        { name: 'Backstube', rollen: [['Backstubenleiter', 1], ['Bäcker', 7], ['Konditorin', 3], ['Auszubildender Bäcker', 3]] },
        { name: 'Filialen', rollen: [['Filialleiterin', 9], ['Fachverkäuferin', 12, 25]] },
        { name: 'Logistik', aussen: true, rollen: [['Auslieferungsfahrer', 3]] },
        { name: 'Büro', rollen: [['Buchhaltung', 1], ['Bestellungen und Catering', 1]] },
      ],
      kunden: 260, firmenAnteil: 0.6,
      leistungen: [['Catering Frühstück', 'Person', 15, 120, 9.8], ['Belieferung Kantine', 'Monat', 1, 1, 1850], ['Torte nach Wunsch', 'Stk', 1, 3, 89], ['Brezeln Gastronomie', 'Stk', 100, 800, 0.55], ['Kuchenblech Event', 'Stk', 2, 12, 36]],
      umsatzJahr: 900000, rechnungenStart: 26, rechnungenEnde: 44,
      kosten: [MIETE(11200), SOFTWARE, VERSICHERUNG(1300), ENERGIE(6200), TANKEN(1400)],
      einkaufQuote: 30, einkaufLieferant: 'Mühle und Backzutaten Beispiel GmbH',
      module: ['rezepturen', 'rezeptur_zutaten', 'lm_chargen', 'lm_haccp', 'gutschein', 'schulungen'],
      kampagnen: ['Brot des Monats', 'Catering für Firmen', 'Treuekarte digital', 'Weihnachtsgebäck vorbestellen'],
      zeigt: '42 Mitarbeiter in Backstube und 9 Filialen, Rezepturen, Chargen, HACCP, Catering für Firmen — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Logistik & Transport', basis: 'spedition',
    start: F('logistikstart', 'Kurierdienst Albrecht', 'e. K.', 'Daniel Albrecht', 'Ludwigstraße 50', '70806', 'Kornwestheim', '07154 801200', 'Kurier- und Expressdienst'),
    voll: F('logistikplus', 'Neckar-Cargo Logistik', 'GmbH', 'Holger Reinhardt', 'Am Containerterminal 7', '70806', 'Kornwestheim', '07154 990400', 'Spedition, Lager und Kontraktlogistik'),
    profil: {
      branche: 'Logistik', icon: '🚚', prefix: 'NCL',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer', 1], ['Prokuristin', 1]] },
        { name: 'Disposition', rollen: [['Leiter Disposition', 1], ['Disponent', 5]] },
        { name: 'Fahrdienst', aussen: true, rollen: [['Berufskraftfahrer', 18], ['Kurierfahrer', 4]] },
        { name: 'Lager', rollen: [['Lagerleiter', 1], ['Lagerist', 6], ['Staplerfahrer', 3]] },
        { name: 'Verwaltung', rollen: [['Kundenservice', 2], ['Buchhaltung', 2]] },
      ],
      kunden: 180, firmenAnteil: 0.95,
      leistungen: [['Stückgut Palette', 'Stk', 2, 40, 64], ['Teilladung', 'Psch', 1, 1, 680], ['Komplettladung', 'Psch', 1, 1, 1450], ['Lagerung je Palettenplatz', 'Monat', 20, 300, 9.5], ['Expressfahrt', 'Psch', 1, 1, 220]],
      umsatzJahr: 4500000, rechnungenStart: 26, rechnungenEnde: 46,
      kosten: [MIETE(12500), SOFTWARE, VERSICHERUNG(3900), TANKEN(21000)],
      einkaufQuote: 12, einkaufLieferant: 'Subunternehmer Transporte Beispiel',
      module: ['logistik_touren', 'logistik_sendungen', 'tour', 'tour_stopp', 'schulungen', 'inventar'],
      kampagnen: ['Lagerflächen frei', 'Fahrer gesucht', 'Express in der Region', 'Jahresverträge 2027'],
      zeigt: '44 Mitarbeiter, Touren und Sendungen, Lager, 180 Firmenkunden — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'IT & Technologie', basis: 'itsystem',
    start: F('itstart', 'IT-Service Brenner', 'e. K.', 'Philipp Brenner', 'Goethestraße 12', '71032', 'Böblingen', '07031 410320', 'IT-Service für kleine Betriebe'),
    voll: F('itplus', 'Netzwerk Schöllkopf IT', 'GmbH', 'Martina Schöllkopf', 'Otto-Lilienthal-Straße 5', '71034', 'Böblingen', '07031 499100', 'Systemhaus mit Managed Services und Cloud'),
    profil: {
      branche: 'IT und Systemhaus', icon: '💻', prefix: 'NSI',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführerin', 1], ['Technischer Leiter', 1]] },
        { name: 'Service Desk', rollen: [['Teamleiter Service Desk', 1], ['IT-Supporter', 5]] },
        { name: 'Technik', aussen: true, rollen: [['Systemadministrator', 6], ['Netzwerktechniker', 3], ['Fachinformatiker Azubi', 3]] },
        { name: 'Vertrieb', rollen: [['Account Manager', 2], ['Projektleiterin', 1]] },
        { name: 'Verwaltung', rollen: [['Buchhaltung', 1], ['Assistenz', 1, 30]] },
      ],
      kunden: 160, firmenAnteil: 0.95,
      leistungen: [['Managed Service je Arbeitsplatz', 'Monat', 8, 60, 39], ['Technikerstunde', 'Std', 1, 16, 98], ['Server-Migration', 'Psch', 1, 1, 4800], ['Microsoft-365-Einrichtung', 'Psch', 1, 1, 1200], ['Firewall-Wartung', 'Monat', 1, 1, 89]],
      umsatzJahr: 3000000, rechnungenStart: 26, rechnungenEnde: 46,
      kosten: [MIETE(4600), SOFTWARE, VERSICHERUNG(900), ENERGIE(700)],
      einkaufQuote: 20, einkaufLieferant: 'IT-Distribution Beispiel GmbH',
      module: ['it_assets', 'it_vertraege', 'schulungen', 'inventar'],
      kampagnen: ['IT-Sicherheits-Check', 'Windows-Umstieg', 'Cloud-Telefonie', 'Azubi gesucht'],
      zeigt: '25 Mitarbeiter, Geräte und Verträge je Kunde, Managed Services mit wiederkehrendem Umsatz — 18 Monate.',
    },
  },
  {
    kategorie: 'Energie & Umwelt', basis: 'solar',
    start: F('energiestart', 'Solartechnik Gauß', 'e. K.', 'Benjamin Gauß', 'Sonnenstraße 8', '71336', 'Waiblingen', '07151 330410', 'Solarteur'),
    voll: F('energieplus', 'SonnenWerk Remstal', 'GmbH', 'Kerstin Walz', 'Energiepark 2', '73614', 'Schorndorf', '07181 930600', 'Photovoltaik, Speicher, Wallboxen und Wartung'),
    profil: {
      branche: 'Energie und Solar', icon: '☀️', prefix: 'SWR',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführerin', 1], ['Technischer Geschäftsführer', 1]] },
        { name: 'Planung', rollen: [['PV-Planer', 3], ['Energieberaterin', 1]] },
        { name: 'Montage', aussen: true, rollen: [['Montageleiter', 2], ['Solarteur', 10], ['Elektroniker', 5], ['Auszubildender Elektronik', 2]] },
        { name: 'Vertrieb und Büro', rollen: [['Vertrieb', 3], ['Netzanmeldung und Förderung', 2], ['Buchhaltung', 1]] },
      ],
      kunden: 340, firmenAnteil: 0.2,
      leistungen: [['PV-Anlage 10 kWp schlüsselfertig', 'Psch', 1, 1, 15900], ['Batteriespeicher 10 kWh', 'Psch', 1, 1, 6900], ['Wallbox inkl. Installation', 'Psch', 1, 1, 1490], ['Wartung PV-Anlage', 'Psch', 1, 1, 249], ['Elektrikerstunde', 'Std', 2, 16, 74]],
      umsatzJahr: 4000000, rechnungenStart: 18, rechnungenEnde: 36,
      kosten: [MIETE(3800), SOFTWARE, VERSICHERUNG(1100), TANKEN(2400)],
      einkaufQuote: 52, einkaufLieferant: 'Solar-Großhandel Beispiel GmbH',
      module: ['energie_anlagen', 'energie_ablesungen', 'pruefpflichten', 'schulungen', 'inventar'],
      kampagnen: ['Solar plus Speicher', 'Wallbox-Aktion', 'Wartung für Bestandsanlagen', 'Monteure gesucht'],
      zeigt: '31 Mitarbeiter, Anlagen mit Ablesungen, Montage und Wartung — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Immobilien & Verwaltung', basis: 'immobilien',
    start: F('immostart', 'Immobilien Fritz', 'e. K.', 'Sandra Fritz', 'Königstraße 60', '70173', 'Stuttgart', '0711 2260310', 'Immobilienmakler'),
    voll: F('immoplus', 'Seeger Immobilienverwaltung', 'GmbH', 'Frank Seeger', 'Rotebühlstraße 120', '70178', 'Stuttgart', '0711 6609200', 'Haus- und WEG-Verwaltung, Vermietung und Verkauf'),
    profil: {
      branche: 'Immobilien', icon: '🏠', prefix: 'SIV',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer', 1], ['Prokuristin', 1]] },
        { name: 'WEG-Verwaltung', rollen: [['Verwalter WEG', 5], ['Assistenz WEG', 2]] },
        { name: 'Mietverwaltung', rollen: [['Mietverwalterin', 4], ['Buchhaltung Mieten', 2]] },
        { name: 'Technik', aussen: true, rollen: [['Hausmeister', 4], ['Technischer Objektbetreuer', 2]] },
        { name: 'Makler', rollen: [['Immobilienmakler', 2]] },
      ],
      kunden: 210, firmenAnteil: 0.6,
      leistungen: [['Verwaltergebühr WEG je Einheit', 'Monat', 6, 80, 28], ['Mietverwaltung je Einheit', 'Monat', 4, 40, 32], ['Maklerprovision', 'Psch', 1, 1, 9800], ['Hausmeisterdienst', 'Monat', 1, 1, 420], ['Sonderverwaltung', 'Std', 2, 12, 85]],
      umsatzJahr: 1600000, rechnungenStart: 26, rechnungenEnde: 44,
      kosten: [MIETE(6100), SOFTWARE, VERSICHERUNG(1300), ENERGIE(500)],
      einkaufQuote: 0, einkaufLieferant: '',
      module: ['immo_einheiten', 'immo_mietvertraege', 'expose', 'objekte', 'objekt_zeiten', 'belegung_einheit', 'schulungen'],
      kampagnen: ['Verwaltung wechseln leicht gemacht', 'Eigentümerversammlungen digital', 'Wohnungen gesucht', 'Bewertung kostenlos'],
      zeigt: '25 Mitarbeiter, Einheiten, Mietverträge, Exposés, Objekte mit Hausmeisterzeiten — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Marketing, Medien & Kreativ', basis: 'agentur',
    start: F('agenturstart', 'Studio Kranich', 'e. K.', 'Lina Kranich', 'Calwer Straße 30', '70173', 'Stuttgart', '0711 2340110', 'Grafik- und Webdesign'),
    voll: F('agenturplus', 'Kranzberg Media', 'GmbH', 'Jan Kranzberg', 'Hackstraße 77', '70190', 'Stuttgart', '0711 9293400', 'Agentur für Marke, Web, Video und Social Media'),
    profil: {
      branche: 'Agentur und Medien', icon: '🎬', prefix: 'KBM',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer', 1], ['Creative Director', 1]] },
        { name: 'Beratung', rollen: [['Kundenberaterin', 3], ['Projektmanager', 2]] },
        { name: 'Kreation', rollen: [['Grafikdesigner', 4], ['Texterin', 2], ['Videocutter', 2], ['Fotograf', 1]] },
        { name: 'Digital', rollen: [['Webentwickler', 3], ['Social-Media-Managerin', 2], ['SEO und Ads', 1]] },
        { name: 'Verwaltung', rollen: [['Office und Buchhaltung', 1, 30]] },
      ],
      kunden: 120, firmenAnteil: 0.95,
      leistungen: [['Social-Media-Betreuung', 'Monat', 1, 1, 1490], ['Website-Relaunch', 'Psch', 1, 1, 12800], ['Imagefilm', 'Psch', 1, 1, 6900], ['Designstunde', 'Std', 4, 40, 95], ['Google-Ads-Betreuung', 'Monat', 1, 1, 690]],
      umsatzJahr: 2400000, rechnungenStart: 22, rechnungenEnde: 40,
      kosten: [MIETE(5400), SOFTWARE, VERSICHERUNG(700), ['Software-Abos Kreativ', 'Software & IT', 1200, 19]],
      einkaufQuote: 8, einkaufLieferant: 'Druckerei Beispiel GmbH',
      module: ['schulungen', 'inventar'],
      kampagnen: ['Case Study Imagefilm', 'Website-Check', 'Agentur-Award', 'Talente gesucht'],
      zeigt: '24 Mitarbeiter, Retainer-Kunden mit monatlichen Rechnungen, Projekte und Aufgaben — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Recht, Steuern & Finanzen', basis: 'kanzlei',
    start: F('kanzleistart', 'Kanzlei Dr. Lenz', 'e. K.', 'Dr. Miriam Lenz', 'Schillerstraße 4', '72764', 'Reutlingen', '07121 330900', 'Rechtsanwaltskanzlei'),
    voll: F('kanzleiplus', 'Hohl Bertsch & Partner', 'Steuerberater mbB', 'Dr. Andreas Hohl, Claudia Bertsch', 'Lederstraße 40', '72764', 'Reutlingen', '07121 949000', 'Steuerberatung, Lohn und Wirtschaftsprüfung'),
    profil: {
      branche: 'Kanzlei und Steuerberatung', icon: '⚖️', prefix: 'HBP',
      team: [
        { name: 'Partner', rollen: [['Partner, Steuerberater', 2], ['Wirtschaftsprüferin', 1]] },
        { name: 'Steuerberatung', rollen: [['Steuerberater', 3], ['Steuerfachangestellte', 9], ['Auszubildende Steuerfach', 3]] },
        { name: 'Lohn', rollen: [['Lohnbuchhalterin', 4]] },
        { name: 'Sekretariat', rollen: [['Kanzleimanagerin', 1], ['Sekretariat', 2, 30]] },
      ],
      kunden: 380, firmenAnteil: 0.55,
      leistungen: [['Finanzbuchhaltung', 'Monat', 1, 1, 340], ['Jahresabschluss', 'Psch', 1, 1, 3200], ['Lohnabrechnung je Mitarbeiter', 'Monat', 3, 40, 24], ['Einkommensteuererklärung', 'Psch', 1, 1, 890], ['Beratungsstunde', 'Std', 1, 8, 160]],
      umsatzJahr: 2200000, rechnungenStart: 26, rechnungenEnde: 48,
      kosten: [MIETE(7800), SOFTWARE, VERSICHERUNG(2400), ['DATEV Beispiel-Abo', 'Software & IT', 1900, 19]],
      einkaufQuote: 0, einkaufLieferant: '',
      module: ['kanzlei_mandate', 'kanzlei_fristen', 'gutachten', 'schulungen'],
      kampagnen: ['Digitale Belegübergabe', 'Lohn auslagern', 'Gründerberatung', 'Azubi Steuerfach'],
      zeigt: '25 Mitarbeiter, Mandate und Fristen, monatliche Buchhaltungs- und Lohnrechnungen — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Bildung & Wissenschaft', basis: 'akademie',
    start: F('bildungstart', 'Lernwerk Krauß', 'e. K.', 'Tanja Krauß', 'Uhlandstraße 9', '72072', 'Tübingen', '07071 550210', 'Nachhilfe und Kurse'),
    voll: F('bildungplus', 'Bildungszentrum Neckartal', 'gGmbH', 'Prof. Dr. Ulrich Mayr', 'Europaplatz 3', '72072', 'Tübingen', '07071 940700', 'Weiterbildung, Sprachkurse und Firmenschulungen'),
    profil: {
      branche: 'Bildung und Weiterbildung', icon: '🎓', prefix: 'BZN',
      team: [
        { name: 'Leitung', rollen: [['Geschäftsführer', 1], ['Pädagogische Leitung', 1]] },
        { name: 'Dozenten', rollen: [['Dozentin Sprachen', 6, 30], ['Dozent IT', 4, 30], ['Dozentin Wirtschaft', 3, 30]] },
        { name: 'Kursorganisation', rollen: [['Kursplanerin', 2], ['Teilnehmerservice', 3]] },
        { name: 'Verwaltung', rollen: [['Förderanträge', 1], ['Buchhaltung', 1], ['Haustechnik', 1]] },
      ],
      kunden: 520, firmenAnteil: 0.25,
      leistungen: [['Sprachkurs 10 Wochen', 'Person', 1, 3, 390], ['Firmenschulung Tag', 'Psch', 1, 1, 1650], ['Excel-Kompaktkurs', 'Person', 1, 8, 290], ['Zertifikatsprüfung', 'Person', 1, 4, 140], ['Raummiete Seminar', 'Psch', 1, 1, 280]],
      umsatzJahr: 1600000, rechnungenStart: 26, rechnungenEnde: 46,
      kosten: [MIETE(9800), SOFTWARE, VERSICHERUNG(800), ENERGIE(1400)],
      einkaufQuote: 4, einkaufLieferant: 'Lehrmittel Beispiel GmbH',
      module: ['bildung_kurse', 'bildung_termine', 'bildung_anmeldungen', 'raum_ressource', 'schulungen'],
      kampagnen: ['Sprachkurse Herbst', 'Weiterbildung mit Förderung', 'Firmenschulungen 2027', 'Dozenten gesucht'],
      zeigt: '23 Mitarbeiter, Kurse mit Terminen und Anmeldungen, Räume, Firmenschulungen — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Gesundheit & Wellness', basis: 'physio',
    start: F('physiostart', 'Physiotherapie Ott', 'e. K.', 'Jana Ott', 'Poststraße 15', '71032', 'Böblingen', '07031 220870', 'Physiotherapie-Praxis'),
    voll: F('physioplus', 'Therapiezentrum Schönbuch', 'GmbH', 'Markus und Eva Leibold', 'Tübinger Straße 90', '71088', 'Holzgerlingen', '07031 760600', 'Physiotherapie, Ergotherapie, Prävention und Rehasport'),
    profil: {
      branche: 'Gesundheit und Therapie', icon: '💆', prefix: 'TZS',
      team: [
        { name: 'Praxisleitung', rollen: [['Praxisinhaber, Physiotherapeut', 1], ['Praxisinhaberin, Ergotherapeutin', 1]] },
        { name: 'Physiotherapie', rollen: [['Physiotherapeut', 9], ['Physiotherapeutin Teilzeit', 4, 25]] },
        { name: 'Ergotherapie', rollen: [['Ergotherapeutin', 3]] },
        { name: 'Prävention', rollen: [['Sporttherapeut', 2]] },
        { name: 'Empfang', rollen: [['Rezeption und Abrechnung', 3]] },
      ],
      kunden: 640, firmenAnteil: 0.05,
      leistungen: [['Krankengymnastik Selbstzahler', 'Stk', 6, 10, 32], ['Manuelle Therapie Selbstzahler', 'Stk', 6, 10, 38], ['Präventionskurs', 'Person', 1, 1, 149], ['Massage 30 Minuten', 'Stk', 1, 10, 36], ['Betriebliche Gesundheit Tag', 'Psch', 1, 1, 1200]],
      umsatzJahr: 600000, rechnungenStart: 24, rechnungenEnde: 48,
      kosten: [MIETE(6900), SOFTWARE, VERSICHERUNG(700), ENERGIE(600)],
      einkaufQuote: 3, einkaufLieferant: 'Therapiebedarf Beispiel GmbH',
      module: ['gutschein', 'raum_ressource', 'schulungen'],
      kampagnen: ['Rücken fit im Büro', 'Präventionskurse Herbst', 'Gutschein verschenken', 'Therapeuten gesucht'],
      zeigt: '23 Mitarbeiter, Termine, Räume, Präventionskurse und Selbstzahler-Rechnungen — 18 Monate Umsatz, ohne Gesundheitsangaben.',
    },
  },
  {
    kategorie: 'Sport, Beauty & Lifestyle', basis: 'fitness',
    start: F('fitnessstart', 'Fitstudio Brunner', 'e. K.', 'Kevin Brunner', 'Sportplatzweg 2', '71034', 'Böblingen', '07031 330440', 'Fitnessstudio'),
    voll: F('fitnessplus', 'Kraftwerk Fitness & Spa', 'GmbH', 'Melanie Rapp', 'Hulbstraße 50', '71034', 'Böblingen', '07031 980300', 'Fitness, Kurse, Spa und Personal Training'),
    profil: {
      branche: 'Fitness und Beauty', icon: '🏋️', prefix: 'KFS',
      team: [
        { name: 'Leitung', rollen: [['Geschäftsführerin', 1], ['Studioleiter', 1]] },
        { name: 'Training', rollen: [['Trainer', 8, 30], ['Personal Trainerin', 3], ['Kursleiterin', 4, 20]] },
        { name: 'Spa', rollen: [['Kosmetikerin', 2], ['Masseur', 2]] },
        { name: 'Empfang', rollen: [['Empfang und Verkauf', 4, 30]] },
        { name: 'Verwaltung', rollen: [['Buchhaltung', 1, 25]] },
      ],
      kunden: 700, firmenAnteil: 0.05,
      leistungen: [['Mitgliedschaft Premium', 'Monat', 1, 1, 69], ['Personal Training 10er', 'Psch', 1, 1, 690], ['Kosmetikbehandlung', 'Stk', 1, 3, 79], ['Firmenfitness', 'Monat', 1, 1, 890], ['Massage 60 Minuten', 'Stk', 1, 4, 65]],
      umsatzJahr: 600000, rechnungenStart: 24, rechnungenEnde: 48,
      kosten: [MIETE(13500), SOFTWARE, VERSICHERUNG(600), ENERGIE(3200)],
      einkaufQuote: 5, einkaufLieferant: 'Fitness- und Kosmetikbedarf Beispiel',
      module: ['wellness_kunden', 'wellness_behandlungen', 'gutschein', 'reservierung_platz', 'raum_ressource', 'schulungen'],
      kampagnen: ['Neujahrs-Start', 'Sommerfigur', 'Firmenfitness', 'Spa-Gutschein'],
      zeigt: '26 Mitarbeiter, Mitglieder, Kurse, Spa-Behandlungen, Platzreservierung — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Tiere', basis: 'tierarzt',
    start: F('tierstart', 'Tierarztpraxis Dr. Haug', 'e. K.', 'Dr. Lena Haug', 'Mühlweg 3', '71155', 'Altdorf', '07031 870330', 'Kleintierpraxis'),
    voll: F('tierplus', 'Tierklinik Am Schönbuch', 'GmbH', 'Dr. Stefan Kübler, Dr. Anna Weidle', 'Klinikstraße 1', '71093', 'Weil im Schönbuch', '07157 950800', 'Tierklinik für Klein- und Heimtiere mit Notdienst'),
    profil: {
      branche: 'Tiere', icon: '🐾', prefix: 'TKS',
      team: [
        { name: 'Klinikleitung', rollen: [['Tierarzt, Klinikleiter', 1], ['Tierärztin, Klinikleiterin', 1]] },
        { name: 'Tierärzte', rollen: [['Tierarzt', 5], ['Tierärztin in Teilzeit', 2, 25]] },
        { name: 'Praxisteam', rollen: [['Tiermedizinische Fachangestellte', 10], ['Auszubildende TFA', 3]] },
        { name: 'Empfang', rollen: [['Empfang und Abrechnung', 3]] },
      ],
      kunden: 900, firmenAnteil: 0.03,
      leistungen: [['Allgemeine Untersuchung', 'Stk', 1, 2, 38], ['Impfung', 'Stk', 1, 3, 42], ['Zahnsanierung', 'Psch', 1, 1, 480], ['Kastration', 'Psch', 1, 1, 320], ['Notdienstpauschale', 'Psch', 1, 1, 65]],
      umsatzJahr: 1400000, rechnungenStart: 26, rechnungenEnde: 48,
      kosten: [MIETE(8200), SOFTWARE, VERSICHERUNG(1100), ENERGIE(1500)],
      einkaufQuote: 18, einkaufLieferant: 'Tierarzt-Großhandel Beispiel GmbH',
      module: ['tier_tiere', 'tier_behandlungen', 'schulungen'],
      kampagnen: ['Impferinnerung Frühjahr', 'Zahnmonat', 'Welpen-Sprechstunde', 'TFA gesucht'],
      zeigt: '25 Mitarbeiter, Tiere und Behandlungen, Notdienst — 18 Monate Umsatz mit vielen kleinen Rechnungen.',
    },
  },
  {
    kategorie: 'Landwirtschaft, Garten & Forst', basis: 'galabau',
    start: F('gartenstart', 'Gartenbau Kübler', 'e. K.', 'Felix Kübler', 'Feldweg 10', '71116', 'Gärtringen', '07034 270150', 'Gartenpflege'),
    voll: F('gartenplus', 'Grünwerk Garten- und Landschaftsbau', 'GmbH', 'Christoph Eisele', 'Gewerbering 15', '71126', 'Gäufelden', '07032 899400', 'Garten- und Landschaftsbau, Pflege und Baumarbeiten'),
    profil: {
      branche: 'Garten und Landschaft', icon: '🌳', prefix: 'GWL',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer, Landschaftsgärtnermeister', 1], ['Geschäftsführerin', 1]] },
        { name: 'Bauleitung', rollen: [['Bauleiter GaLaBau', 2]] },
        { name: 'Kolonnen', aussen: true, rollen: [['Vorarbeiter', 3], ['Landschaftsgärtner', 12], ['Baumpfleger', 2], ['Auszubildender Landschaftsgärtner', 3]] },
        { name: 'Büro', rollen: [['Kalkulation', 1], ['Büro und Buchhaltung', 1]] },
      ],
      kunden: 360, firmenAnteil: 0.35,
      leistungen: [['Pflasterarbeiten', 'm²', 20, 160, 78], ['Gartenpflege', 'Std', 4, 30, 54], ['Baumfällung', 'Psch', 1, 1, 680], ['Rollrasen verlegen', 'm²', 40, 300, 16], ['Bepflanzung', 'Psch', 1, 1, 1450], ['Winterdienst Saison', 'Psch', 1, 1, 980]],
      umsatzJahr: 2200000, rechnungenStart: 18, rechnungenEnde: 38,
      kosten: [MIETE(3200), SOFTWARE, VERSICHERUNG(1200), TANKEN(2900)],
      einkaufQuote: 28, einkaufLieferant: 'Baumschule und Natursteine Beispiel',
      handwerk: { baustellen: ['Wohnpark Am Bach — Außenanlagen', 'Privatgarten Familie Dreher', 'Firmengelände Gaiser — Pflege', 'Friedhof Gäufelden — Wege', 'Spielplatz Talaue'], wartung: 90, aufmasse: true },
      module: ['schlag', 'forst_objekte', 'holz_sortiment', 'inventar', 'schulungen', 'bewerber'],
      kampagnen: ['Gartenplanung Frühling', 'Pflegevertrag', 'Winterdienst sichern', 'Azubi GaLaBau'],
      zeigt: '25 Mitarbeiter, Kolonnen mit Einsatzplanung, Baustellen mit Bautagebuch, 90 Pflegeverträge — 18 Monate Umsatz mit Saisonkurve.',
    },
  },
  {
    kategorie: 'Dienstleistungen', basis: 'reinigung',
    start: F('dienststart', 'Glanz Gebäudereinigung', 'e. K.', 'Ayşe Yıldız', 'Talstraße 21', '71063', 'Sindelfingen', '07031 610440', 'Gebäudereinigung'),
    voll: F('dienstplus', 'Clean Service Pfister', 'GmbH', 'Robert Pfister', 'Wilhelm-Haspel-Straße 8', '71065', 'Sindelfingen', '07031 799900', 'Gebäudereinigung, Glasreinigung und Hausmeisterdienste'),
    profil: {
      branche: 'Dienstleistungen', icon: '🧽', prefix: 'CSP',
      team: [
        { name: 'Geschäftsführung', rollen: [['Geschäftsführer', 1], ['Betriebsleiterin', 1]] },
        { name: 'Objektleitung', rollen: [['Objektleiter', 3]] },
        { name: 'Reinigung', aussen: true, rollen: [['Vorarbeiterin', 4], ['Reinigungskraft', 24, 25], ['Glasreiniger', 4]] },
        { name: 'Büro', rollen: [['Personaldisposition', 1], ['Buchhaltung', 1]] },
      ],
      kunden: 170, firmenAnteil: 0.9,
      leistungen: [['Unterhaltsreinigung', 'Monat', 1, 1, 1280], ['Glasreinigung', 'm²', 100, 900, 2.4], ['Grundreinigung', 'Psch', 1, 1, 890], ['Hausmeisterdienst', 'Monat', 1, 1, 540], ['Sonderreinigung', 'Std', 4, 20, 34]],
      umsatzJahr: 1600000, rechnungenStart: 26, rechnungenEnde: 48,
      kosten: [MIETE(2600), SOFTWARE, VERSICHERUNG(900), TANKEN(1800), ['Reinigungsmittel Beispiel', 'Material', 2200, 19]],
      einkaufQuote: 0, einkaufLieferant: '',
      handwerk: { baustellen: ['Bürokomplex Westpark', 'Arztpraxen Zentrum', 'Autohaus-Showroom Kessler', 'Schule am Goldberg', 'Wohnanlage Rosenhof'], wartung: 0, aufmasse: false },
      module: ['objekte', 'objekt_zeiten', 'schulungen', 'inventar'],
      kampagnen: ['Büroreinigung neu vergeben', 'Glasreinigung Frühjahr', 'Mitarbeitende gesucht', 'Grundreinigung Herbst'],
      zeigt: '39 Mitarbeiter, Objekte mit Reinigungszeiten, Einsatzplanung, monatliche Rechnungen an 170 Objekte — 18 Monate Umsatz.',
    },
  },
  {
    kategorie: 'Kultur, Soziales & Öffentliches', basis: 'verein',
    start: F('vereinstart', 'Förderverein Kulturhaus Weil', 'e. V.', 'Hanna Weber (Vorsitzende)', 'Marktplatz 1', '71263', 'Weil der Stadt', '07033 520110', 'Kulturverein'),
    voll: F('vereinplus', 'Kulturforum Region Schönbuch', 'e. V.', 'Dr. Martin Fischer (Vorstand)', 'Kulturplatz 5', '71032', 'Böblingen', '07031 660200', 'Kulturverein mit Veranstaltungen, Kursen und Förderern'),
    profil: {
      branche: 'Verein und Kultur', icon: '🎭', prefix: 'KFR',
      team: [
        { name: 'Vorstand', rollen: [['Vorstand', 1], ['Geschäftsführerin', 1]] },
        { name: 'Programm', rollen: [['Programmleitung', 1], ['Veranstaltungstechnik', 2], ['Kursleitung', 4, 15]] },
        { name: 'Verwaltung', rollen: [['Mitgliederverwaltung', 1, 25], ['Buchhaltung', 1, 20]] },
      ],
      kunden: 220, firmenAnteil: 0.3,
      leistungen: [['Eintritt Gruppen', 'Person', 10, 60, 14], ['Saalmiete', 'Psch', 1, 1, 450], ['Kursgebühr', 'Person', 1, 1, 89], ['Sponsoring-Paket', 'Psch', 1, 1, 1500]],
      umsatzJahr: 300000, rechnungenStart: 10, rechnungenEnde: 20,
      kosten: [MIETE(2200), SOFTWARE, VERSICHERUNG(400), ENERGIE(500)],
      einkaufQuote: 0, einkaufLieferant: '',
      module: ['verein_mitglieder', 'verein_veranstaltungen', 'spende', 'event_veranstaltung', 'raum_ressource'],
      kampagnen: ['Spendenaktion Bühnentechnik', 'Saisonprogramm', 'Neue Mitglieder', 'Kursprogramm Herbst'],
      zeigt: 'Vorstand und Team, Mitglieder, Veranstaltungen, Spenden, Saalvermietung — 18 Monate Vereinsleben.',
    },
  },
];

// ---------------------------------------------------------------------------
// Ausgabe: Vorführ-Betriebe und Profile
// ---------------------------------------------------------------------------
const zuBetrieb = (f: Firma, kategorie: string, n: number, leer: boolean): DemoBetrieb => ({
  slug: f.slug, kategorie, branche: f.branche, firma: f.firma, rechtsform: f.rechtsform, inhaber: f.inhaber,
  strasse: f.strasse, plz: f.plz, ort: f.ort, telefon: f.telefon, website: f.website,
  ustId: demoUstId(String(82710000 + n * 37)), steuernummer: `560${String(60 + (n % 30)).padStart(2, '0')}/${String(41000 + n * 211).slice(-5)}`,
  iban: demoIban(4714151 + n * 137), bank: BANK, bic: BIC, ziel: leer ? 0 : 100, webSlug: null, zeitreise: true, ...(leer ? { leer: true } : {}),
});

/** Stufe-1- und Stufe-3-Betriebe aller Branchen (Kfz steht in lib/demoBetriebe). */
export const ZEITREISE_BETRIEBE: DemoBetrieb[] = REIHEN.flatMap((r, i) => [zuBetrieb(r.start, r.kategorie, i * 2, true), zuBetrieb(r.voll, r.kategorie, i * 2 + 1, false)]);

/** Wachstums-Profile der Stufe-3-Betriebe. */
export const WACHSTUM_PROFILE: WachstumProfil[] = REIHEN.map((r) => ({ ...r.profil, slug: r.voll.slug, start: r.start.slug, basis: r.basis }));

/** Kategorie je Profil (für die Zeitreise-Reihe). */
export const PROFIL_KATEGORIE: Record<string, string> = Object.fromEntries(REIHEN.map((r) => [r.voll.slug, r.kategorie]));
