// ============================================================================
// ARGONAUT OS · lib/musterbetriebXxlBranchen.ts — Paket 179 Push 2
//
// Die Branchen-Module des Musterbetriebs XXL: Werkstatt/KFZ, Gastro, Hotel,
// Lebensmittel/Rezeptur, Logistik/Touren, IT, Energie, Immobilien/Exposé,
// Gutachten, Kanzlei, Bildung, Wellness, Tiere, Landwirtschaft/Forst/Holz,
// Verein/Spenden/Veranstaltungen, Fertigung/BDE/Chargen, Gutscheine,
// Prüfpflichten, Räume/Plätze/Belegung, Objekte/Objektzeiten, Zuschnitt.
//
// Spalten und erlaubte Werte stammen aus dem LIVE-Aufbau (information_schema,
// CSV von Martin am 30.09.2026) und wurden in PGlite mit allen Regeln geprüft.
// Wo die Seite keine feste Auswahlliste hat, bleibt der Status auf der
// Datenbank-Vorgabe — so sieht jede Zeile aus wie eine, die die Seite selbst
// angelegt hätte.
//
// Bewusst NICHT dabei: Shop-Bestellungen und Buchungen (Buchungen brauchen eine
// Ressource aus einer anderen Tabelle; Shop löst Bestätigungen/Lager aus).
// Keine Gesundheitsangaben bei Wellness-Kunden, keine Erinnerungs-Einwilligung
// bei Tierhaltern, keine Adressen von Mietern — aus dem Musterbetrieb geht nie
// eine Nachricht raus.
//
// Reine Logik, node-testbar.
// ============================================================================

import {
  XXL_SEEDER, XXL_LOESCH_ORDER, XXL_NOTIZ, tagPlus, berlinZeit, loeschPlan,
  type XxlSeeder, type XxlKontext,
} from './musterbetriebXxl';
import type { SeedZeile } from './uebungswelt';

const erstes = (ctx: XxlKontext, tabelle: string, i = 0): string | null => {
  const l = ctx.ids[tabelle] || [];
  return l.length ? l[i % l.length] : null;
};
const je = (ctx: XxlKontext, tabelle: string) => ctx.ids[tabelle] || [];
const O = (ctx: XxlKontext) => ({ owner_user_id: ctx.uid });

// ---------------------------------------------------------------------------
// Werkstatt & KFZ
// ---------------------------------------------------------------------------
const WERKSTATT_FZ = [
  ['WVWZZZ1KZXM000001', 'BB-MU 100', 'Volkswagen', 'Golf', 'Benzin'],
  ['WBAZZZ3KZXM000002', 'BB-MU 200', 'BMW', '320d', 'Diesel'],
  ['VF1ZZZ5KZXM000003', 'S-MU 300', 'Renault', 'Zoe', 'Elektro'],
] as const;

function werkstattFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  return WERKSTATT_FZ.map((f, i) => ({
    ...O(ctx), fin: f[0], kennzeichen: f[1], hersteller: f[2], modell: f[3], kraftstoff: f[4],
    erstzulassung: tagPlus(ctx.heute, -1500 - i * 400), kontakt_id: erstes(ctx, 'kontakte', i),
    halter_name: `Halter ${i + 1} (Beispiel)`, naechste_hu: tagPlus(ctx.heute, 30 + i * 90), notiz: XXL_NOTIZ,
  }));
}

function kfzFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  return WERKSTATT_FZ.map((f, i) => ({
    ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', i), halter: `Halter ${i + 1} (Beispiel)`,
    kennzeichen: f[1], marke: f[2], modell: f[3], vin: f[0], erstzulassung: tagPlus(ctx.heute, -1500 - i * 400),
    hu_faellig: tagPlus(ctx.heute, 30 + i * 90), au_faellig: tagPlus(ctx.heute, 30 + i * 90),
    km_stand: 48000 + i * 31000, notiz: XXL_NOTIZ,
  }));
}

// ---------------------------------------------------------------------------
// Paket 285 (K17): Kfz-Handel — Handelsbestand mit allem, was die Kfz-Seiten
// zeigen: Status vom Zulauf bis verkauft (auch Vorjahr fuer den Chef-Blick),
// Kosten, Marktvergleich, Anfragen, Suchauftrag, Probefahrt, Brief-Tresor,
// DAT-Bewertung. KEIN Kaufvertrag und KEINE Rechnung (Kern-Geld bleibt leer);
// die Boerse bleibt aus — der Musterbetrieb ist nie oeffentlich.
// Werte halten die Pruefregeln aus p259/p261/p265/p270/p271/p276/p277/p283.
// ---------------------------------------------------------------------------
/** [Marke, Modell, Variante, Sparte, Status, Kraftstoff, kW, km, EZ vor Tagen, Eingang vor Tagen (null = Zulauf), EK, VK, Besteuerung, verkauft vor Tagen, FIN-Praefix] */
const HANDEL_FZ = [
  ['Volkswagen', 'Golf', '1.5 eTSI Life', 'Pkw', 'bestand', 'Benzin', 110, 38500, 1150, 45, 17800, 23490, '25a', null, 'WVW'],
  ['BMW', '320d Touring', 'M Sport', 'Pkw', 'aufbereitung', 'Diesel', 140, 112000, 2400, 10, 19500, 25990, 'regel', null, 'WBA'],
  ['Skoda', 'Octavia Combi', '2.0 TDI Style', 'Pkw', 'zulauf', 'Diesel', 110, 15, 30, null, 26100, 31900, 'regel', null, 'TMB'],
  ['Opel', 'Astra', '1.2 Turbo Edition', 'Pkw', 'bestand', 'Benzin', 96, 67000, 1900, 130, 9800, 12990, '25a', null, 'W0V'],
  ['Mercedes-Benz', 'C 220 d', 'Avantgarde', 'Pkw', 'reserviert', 'Diesel', 147, 54000, 1400, 35, 27400, 33900, 'regel', null, 'W1K'],
  ['Audi', 'A3 Sportback', '35 TFSI', 'Pkw', 'verkauft', 'Benzin', 110, 61000, 1800, 70, 15200, 18990, '25a', 20, 'WAU'],
  ['Ford', 'Focus Turnier', '1.0 EcoBoost', 'Pkw', 'verkauft', 'Benzin', 92, 88000, 2600, 420, 8900, 11490, '25a', 380, 'WF0'],
  ['BMW', 'R 1250 GS', 'Adventure', 'Motorrad', 'bestand', 'Benzin', 100, 21000, 1300, 25, 12900, 15990, '25a', null, 'WB1'],
] as const;

/** Gueltige Beispiel-FIN (17 Zeichen, ohne I/O/Q), je Fahrzeug eindeutig. */
export function handelFin(praefix: string, i: number): string {
  return `${praefix}ZZZXXLK${1000001 + i}`;
}

function kfzBestand(ctx: XxlKontext): SeedZeile[] {
  return HANDEL_FZ.map((f, i) => ({
    ...O(ctx), interne_nr: `F-${String(i + 1).padStart(4, '0')}`, status: f[4], sparte: f[3],
    marke: f[0], modell: f[1], variante: f[2], fin: handelFin(f[14], i),
    kennzeichen: i === 0 ? 'BB-XL 101' : i === 4 ? 'BB-XL 105' : null,
    erstzulassung: tagPlus(ctx.heute, -f[8]).slice(0, 8) + '01', km_stand: f[7], leistung_kw: f[6], kraftstoff: f[5],
    farbe: ['Mondsteingrau', 'Schwarz', 'Weiß', 'Silber', 'Obsidianschwarz', 'Blau', 'Grau', 'Weiß/Blau'][i],
    eingang_am: f[9] === null ? null : tagPlus(ctx.heute, -f[9]),
    verkauft_am: f[13] === null ? null : tagPlus(ctx.heute, -f[13]),
    ek_netto: f[10], vk_brutto: f[11], besteuerung: f[12],
    inseriert: f[4] === 'bestand' || f[4] === 'reserviert',
    hu_bis: f[4] === 'zulauf' ? null : tagPlus(ctx.heute, 200 + i * 60),
    vorbesitzer: f[4] === 'zulauf' ? 0 : 1 + (i % 2), vorschaden: i === 3 ? 'ja' : 'keine_bekannt',
    vorschaden_text: i === 3 ? 'Parkrempler hinten links, fachgerecht repariert (Beispiel)' : null,
    ausstattung: i === 7 ? ['ABS', 'Navigationssystem', 'Sitzheizung'] : ['Klimaautomatik', 'Navigationssystem', 'Sitzheizung', 'Einparkhilfe hinten', 'LED-Scheinwerfer'],
    bewertung_anbieter: i === 0 ? 'dat' : null, bewertung_ek: i === 0 ? 18200 : null, bewertung_vk: i === 0 ? 22900 : null,
    bewertung_am: i === 0 ? tagPlus(ctx.heute, -10) : null,
    notiz: XXL_NOTIZ,
  }));
}

function kfzKosten(ctx: XxlKontext): SeedZeile[] {
  const b = (i: number) => erstes(ctx, 'kfz_bestand', i);
  if (!b(0)) return [];
  return [
    { ...O(ctx), bestand_id: b(0), art: 'aufbereitung', bezeichnung: 'Innen- und Außenaufbereitung', betrag_netto: 380, plan: false, datum: tagPlus(ctx.heute, -40) },
    { ...O(ctx), bestand_id: b(0), art: 'hu', bezeichnung: 'HU/AU neu', betrag_netto: 129, plan: false, datum: tagPlus(ctx.heute, -38) },
    { ...O(ctx), bestand_id: b(1), art: 'aufbereitung', bezeichnung: 'Aufbereitung geplant', betrag_netto: 420, plan: true, datum: ctx.heute },
    { ...O(ctx), bestand_id: b(1), art: 'reifen', bezeichnung: 'Satz Sommerreifen', betrag_netto: 560, plan: true, datum: ctx.heute },
    { ...O(ctx), bestand_id: b(3), art: 'lack', bezeichnung: 'Smart-Repair Stoßfänger', betrag_netto: 650, plan: false, datum: tagPlus(ctx.heute, -120) },
    { ...O(ctx), bestand_id: b(5), art: 'aufbereitung', bezeichnung: 'Aufbereitung', betrag_netto: 350, plan: false, datum: tagPlus(ctx.heute, -60) },
  ];
}

function kfzMarktvergleich(ctx: XxlKontext): SeedZeile[] {
  const b = erstes(ctx, 'kfz_bestand', 0);
  if (!b) return [];
  const ez = tagPlus(ctx.heute, -1150).slice(0, 8) + '01';
  return [[22990, 41000, 'mobile.de'], [23900, 35000, 'AutoScout24'], [24490, 29500, 'mobile.de'], [22500, 52000, 'Händlerseite']].map(([preis, km, quelle], i) => ({
    ...O(ctx), bestand_id: b, preis, km, erstzulassung: ez, quelle, link: null, notiz: 'Beispiel-Vergleich', erfasst_am: tagPlus(ctx.heute, -2 - i * 3),
  }));
}

function kfzAnfragen(ctx: XxlKontext): SeedZeile[] {
  const b = (i: number) => erstes(ctx, 'kfz_bestand', i);
  return [
    { ...O(ctx), nr: 'A-0001', bestand_id: b(0), quelle: 'website', name: 'Lena Beispiel', email: 'lena.beispiel@example.com', nachricht: 'Ist der Golf noch da? Probefahrt am Samstag möglich?', status: 'neu', faellig_am: ctx.heute, notiz: XXL_NOTIZ },
    { ...O(ctx), nr: 'A-0002', bestand_id: b(4), quelle: 'telefon', name: 'Jonas Muster', tel: '0151 0000000', kontakt_id: erstes(ctx, 'kontakte', 1), status: 'termin', faellig_am: tagPlus(ctx.heute, 2), notiz: XXL_NOTIZ },
    { ...O(ctx), nr: 'A-0003', bestand_id: b(3), quelle: 'boerse', name: 'Erika Probe', status: 'verloren', abschluss_grund: 'preis', abschluss_notiz: 'Wollte 11.000 €', abgeschlossen_am: berlinZeit(tagPlus(ctx.heute, -5), '16:30'), notiz: XXL_NOTIZ },
  ];
}

function kfzSuchauftraege(ctx: XxlKontext): SeedZeile[] {
  return [{ ...O(ctx), nr: 'S-0001', name: 'Paul Vorlage', email: 'paul.vorlage@example.com', kriterien: { marke: 'Skoda', modell: 'Octavia', preis_max: 33000, km_max: 30000 }, aktiv: true, gueltig_bis: tagPlus(ctx.heute, 90), notiz: XXL_NOTIZ }];
}

function kfzProbefahrten(ctx: XxlKontext): SeedZeile[] {
  const b = erstes(ctx, 'kfz_bestand', 0);
  if (!b) return [];
  const tag = tagPlus(ctx.heute, -1);
  return [{
    ...O(ctx), bestand_id: b, nr: 'P-0001', art: 'probefahrt', status: 'zurueck', fahrer_name: 'Lena Beispiel', fahrer_email: 'lena.beispiel@example.com',
    fs_geprueft: true, fs_klasse: 'B', fs_gueltig_bis: tagPlus(ctx.heute, 3000), kennzeichen_art: 'eigen', kennzeichen: 'BB-XL 101',
    start_am: berlinZeit(tag, '10:00'), ende_geplant: berlinZeit(tag, '11:00'), rueck_am: berlinZeit(tag, '10:50'),
    km_start: 38480, km_ende: 38500, km_frei: 50, tank_start: '3/4', tank_ende: '3/4', selbstbeteiligung: 1000,
    nachfass_am: tagPlus(ctx.heute, 1), ergebnis: 'interesse', notiz: XXL_NOTIZ,
  }];
}

function kfzTresor(ctx: XxlKontext): SeedZeile[] {
  const z: SeedZeile[] = [];
  HANDEL_FZ.forEach((f, i) => {
    const b = erstes(ctx, 'kfz_bestand', i);
    if (!b || f[4] === 'zulauf') return;
    const verkauft = f[4] === 'verkauft';
    z.push({ ...O(ctx), bestand_id: b, art: 'zb2', ort: verkauft ? null : 'Tresor Fach ' + (i + 1), status: verkauft ? 'beim_kaeufer' : 'im_haus', notiz: XXL_NOTIZ });
    if (!verkauft) z.push({ ...O(ctx), bestand_id: b, art: 'schluessel', anzahl: 2, ort: 'Schlüsselkasten ' + (i + 1), status: 'im_haus', notiz: XXL_NOTIZ });
  });
  return z;
}

const WERKSTATT_AUFTRAEGE = [
  { t: 'Inspektion mit Ölwechsel', a: 'Service fällig laut Anzeige', km: 48210, pos: [['Inspektion nach Herstellervorgabe', 'leistung', 1.5, 95], ['Motoröl 5W-30', 'material', 5, 14.9]] },
  { t: 'Bremsen vorne erneuern', a: 'Quietscht beim Bremsen', km: 79340, pos: [['Bremsscheiben und Beläge wechseln', 'leistung', 1.2, 95], ['Bremsscheiben-Satz', 'material', 1, 142]] },
  { t: 'Klimaanlage prüfen', a: 'Kühlt nicht mehr richtig', km: 110050, pos: [['Klimaservice', 'leistung', 0.8, 95]] },
] as const;

function werkstattAuftraege(ctx: XxlKontext): SeedZeile[] {
  const ma = je(ctx, 'mitarbeiter');
  return WERKSTATT_AUFTRAEGE.map((w, i) => ({
    ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', i), fahrzeug_id: erstes(ctx, 'werkstatt_fahrzeuge', i),
    zustaendig_mitarbeiter_id: ma.length ? ma[(i + 1) % ma.length] : null,
    nummer: `WA-XXL-${String(i + 1).padStart(3, '0')}`, titel: w.t, beschreibung: XXL_NOTIZ,
    kunde_name: `Halter ${i + 1} (Beispiel)`, kennzeichen: WERKSTATT_FZ[i][1], kilometerstand: w.km,
    kundenanliegen: w.a, zugesagt_am: tagPlus(ctx.heute, 1 + i),
    freigabe_status: i === 1 ? 'kva_offen' : 'kein_kva',
  }));
}

function werkstattPositionen(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  je(ctx, 'werkstatt_auftraege').forEach((aId, i) => {
    const w = WERKSTATT_AUFTRAEGE[i];
    if (!w) return;
    for (const p of w.pos) {
      aus.push({
        ...O(ctx), auftrag_id: aId, art: p[1], bezeichnung: p[0],
        erfassungsart: p[1] === 'leistung' ? 'stunden' : 'stueck', menge: p[2],
        einzelpreis_netto: p[3], einheit: p[1] === 'leistung' ? 'Std' : 'Stk',
      });
    }
  });
  return aus;
}

// ---------------------------------------------------------------------------
// Gastro, Hotel, Lebensmittel, Rezeptur
// ---------------------------------------------------------------------------
function menuGerichte(ctx: XxlKontext): SeedZeile[] {
  const G = [
    ['Maultaschen mit Kartoffelsalat', 'Hauptgericht', 13.9, 'a, c, g'],
    ['Käsespätzle mit Röstzwiebeln', 'Hauptgericht', 12.5, 'a, c, g'],
    ['Gemischter Salat', 'Vorspeise', 6.9, ''],
    ['Apfelstrudel mit Vanillesoße', 'Dessert', 5.9, 'a, c, g'],
  ] as const;
  return G.map((g, i) => ({
    ...O(ctx), name: g[0], kategorie: g[1], preis: g[2], beschreibung: XXL_NOTIZ,
    allergene: g[3] || null, verfuegbar: true, hervorgehoben: i === 0, reihenfolge: i,
  }));
}

function gastroReservierungen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), datum: ctx.heute, uhrzeit: '18:30', personen: 4, gast_name: 'Familie Beispiel', telefon: null, tisch: '5', notiz: XXL_NOTIZ },
    { ...O(ctx), datum: tagPlus(ctx.heute, 1), uhrzeit: '12:00', personen: 2, gast_name: 'Herr Muster', telefon: null, tisch: '2', notiz: XXL_NOTIZ },
    { ...O(ctx), datum: tagPlus(ctx.heute, 3), uhrzeit: '19:00', personen: 8, gast_name: 'Firmenfeier Probe', telefon: null, tisch: '10', notiz: XXL_NOTIZ },
  ];
}

function hotelZimmer(ctx: XxlKontext): SeedZeile[] {
  return [['101', 'Einzelzimmer', 1, 79], ['102', 'Doppelzimmer', 2, 109], ['201', 'Suite', 4, 189]].map((z) => ({
    ...O(ctx), nummer: z[0], typ: z[1], max_personen: z[2], preis_nacht: z[3], aktiv: true,
  }));
}

function hotelBelegungen(ctx: XxlKontext): SeedZeile[] {
  const z = je(ctx, 'hotel_zimmer');
  if (!z.length) return [];
  return [
    { ...O(ctx), zimmer_id: z[0], gast_name: 'Gast Beispiel', personen: 1, anreise: tagPlus(ctx.heute, -1), abreise: tagPlus(ctx.heute, 2), notiz: XXL_NOTIZ },
    { ...O(ctx), zimmer_id: z[1 % z.length], gast_name: 'Paar Muster', personen: 2, anreise: tagPlus(ctx.heute, 5), abreise: tagPlus(ctx.heute, 8), notiz: XXL_NOTIZ },
  ];
}

function lmChargen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), bezeichnung: 'Weizenmehl Type 550', charge_nr: 'CH-XXL-001', mhd: tagPlus(ctx.heute, 180), menge: 250, einheit: 'kg', lieferant: 'Mühle Beispiel', herkunft: 'Deutschland', status: 'aktiv', notiz: XXL_NOTIZ },
    { ...O(ctx), bezeichnung: 'Butter', charge_nr: 'CH-XXL-002', mhd: tagPlus(ctx.heute, 12), menge: 20, einheit: 'kg', lieferant: 'Molkerei Muster', herkunft: 'Allgäu', status: 'aktiv', notiz: XXL_NOTIZ },
    { ...O(ctx), bezeichnung: 'Eier Freiland', charge_nr: 'CH-XXL-003', mhd: tagPlus(ctx.heute, -2), menge: 0, einheit: 'Stk', lieferant: 'Hof Probe', herkunft: 'Region', status: 'verbraucht', notiz: XXL_NOTIZ },
  ];
}

function lmHaccp(ctx: XxlKontext): SeedZeile[] {
  return [0, 1, 2, 3].map((i) => ({
    ...O(ctx), datum: tagPlus(ctx.heute, -i), kontrollpunkt: i % 2 ? 'Kühlhaus Temperatur' : 'Tiefkühler Temperatur',
    messwert: i % 2 ? '4 °C' : '-19 °C', in_ordnung: i !== 3, massnahme: i === 3 ? 'Tür-Dichtung geprüft, nachgemessen' : null,
    pruefer: 'Lena Beispiel',
  }));
}

function rezepturen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), name: 'Bauernbrot', typ: 'allgemein', basis_menge: 10, basis_einheit: 'kg', portionen: 10, backverlust_prozent: 12, notiz: XXL_NOTIZ },
    { ...O(ctx), name: 'Hefezopf', typ: 'allgemein', basis_menge: 5, basis_einheit: 'kg', portionen: 8, backverlust_prozent: 10, notiz: XXL_NOTIZ },
  ];
}

function rezepturZutaten(ctx: XxlKontext): SeedZeile[] {
  const r = je(ctx, 'rezepturen');
  if (!r.length) return [];
  const Z = [
    [0, 'Roggenmehl', 4, 'kg', 0.9], [0, 'Weizenmehl', 2, 'kg', 0.7], [0, 'Wasser', 4, 'kg', 0], [0, 'Salz', 0.2, 'kg', 0.5],
    [1, 'Weizenmehl', 3, 'kg', 0.7], [1, 'Milch', 1.2, 'kg', 1.1], [1, 'Butter', 0.5, 'kg', 7.8],
  ] as const;
  return Z.map((z, i) => ({
    ...O(ctx), rezeptur_id: r[z[0] % r.length], position: i + 1, bezeichnung: z[1], menge: z[2], einheit: z[3], preis_pro_einheit: z[4],
  }));
}

// ---------------------------------------------------------------------------
// Logistik & Touren
// ---------------------------------------------------------------------------
function logistikTouren(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), datum: ctx.heute, fahrer: 'Karl Schablone', fahrzeug: 'BB-XX 101', notiz: XXL_NOTIZ },
    { ...O(ctx), datum: tagPlus(ctx.heute, 1), fahrer: 'Tom Muster', fahrzeug: 'BB-XX 102', notiz: XXL_NOTIZ },
  ];
}

function logistikSendungen(ctx: XxlKontext): SeedZeile[] {
  const t = je(ctx, 'logistik_touren');
  if (!t.length) return [];
  return [0, 1, 2, 3].map((i) => ({
    ...O(ctx), tour_id: t[i < 2 ? 0 : 1 % t.length], sendungsnr: `LS-XXL-${i + 1}`,
    empfaenger: `Empfänger ${i + 1} (Beispiel)`, adresse: `Beispielstraße ${i + 1}, 71032 Böblingen`, reihenfolge: (i % 2) + 1, notiz: XXL_NOTIZ,
  }));
}

function touren(ctx: XxlKontext): SeedZeile[] {
  return [{ ...O(ctx), bezeichnung: 'Auslieferung Böblingen Nord', datum: ctx.heute, fahrer: 'Karl Schablone', fahrzeug: 'BB-XX 101', notiz: XXL_NOTIZ }];
}

function tourStopps(ctx: XxlKontext): SeedZeile[] {
  const t = erstes(ctx, 'tour');
  if (!t) return [];
  return [0, 1, 2].map((i) => ({
    ...O(ctx), tour_id: t, reihenfolge: i + 1, empfaenger: `Kunde ${i + 1} (Beispiel)`,
    adresse: `Musterweg ${i + 3}, 71034 Böblingen`, kontakt_id: erstes(ctx, 'kontakte', i), kolli: i + 1, notiz: XXL_NOTIZ,
  }));
}

// ---------------------------------------------------------------------------
// IT, Energie
// ---------------------------------------------------------------------------
function itAssets(ctx: XxlKontext): SeedZeile[] {
  return [
    ['Server Büro', 'Server', 'Beispiel Systems', 365], ['Firewall', 'Netzwerk', 'Muster Networks', 90], ['Arbeitsplatz-PC 1', 'PC', 'Probe Computer', 700],
  ].map((a, i) => ({
    ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', i), kunde_name: `Kunde ${i + 1} (Beispiel)`, bezeichnung: a[0], typ: a[1],
    hersteller: a[2], seriennummer: `SN-XXL-${i + 1}`, standort: 'Serverraum', garantie_bis: tagPlus(ctx.heute, Number(a[3])), notiz: XXL_NOTIZ,
  }));
}

function itVertraege(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 0), kunde_name: 'Kunde 1 (Beispiel)', bezeichnung: 'Managed-Service Basis', monatspauschale: 290, intervall_tage: 30, naechste_wartung: tagPlus(ctx.heute, 6), notiz: XXL_NOTIZ },
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 1), kunde_name: 'Kunde 2 (Beispiel)', bezeichnung: 'Backup und Monitoring', monatspauschale: 149, intervall_tage: 90, naechste_wartung: tagPlus(ctx.heute, 40), notiz: XXL_NOTIZ },
  ];
}

function energieAnlagen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 0), bezeichnung: 'PV-Anlage Dach Süd', typ: 'Photovoltaik', standort: 'Böblingen', leistung_kw: 9.8, inbetriebnahme: tagPlus(ctx.heute, -900), wartung_faellig: tagPlus(ctx.heute, 45), notiz: XXL_NOTIZ },
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 1), bezeichnung: 'Wärmepumpe Luft/Wasser', typ: 'Wärmepumpe', standort: 'Sindelfingen', leistung_kw: 12, inbetriebnahme: tagPlus(ctx.heute, -400), wartung_faellig: tagPlus(ctx.heute, 120), notiz: XXL_NOTIZ },
  ];
}

function energieAblesungen(ctx: XxlKontext): SeedZeile[] {
  const a = erstes(ctx, 'energie_anlagen');
  if (!a) return [];
  return [3, 2, 1, 0].map((m, i) => ({
    ...O(ctx), anlage_id: a, datum: tagPlus(ctx.heute, -30 * m), zaehlerstand: 21000 + i * 820, ertrag_kwh: i ? 820 : null, notiz: XXL_NOTIZ,
  }));
}

// ---------------------------------------------------------------------------
// Immobilien, Exposé, Gutachten, Kanzlei
// ---------------------------------------------------------------------------
function immoEinheiten(ctx: XxlKontext): SeedZeile[] {
  return [
    ['Wohnung EG links', 68, 3, 820, 190, 'vermietet'], ['Wohnung 1. OG', 74, 3, 890, 210, 'vermietet'], ['Gewerbe EG rechts', 110, 4, 1450, 320, 'frei'],
  ].map((e) => ({
    ...O(ctx), objekt: 'Beispielhaus Musterstraße 5', bezeichnung: e[0], flaeche_qm: e[1], zimmer: e[2],
    kaltmiete: e[3], nebenkosten: e[4], status: e[5], notiz: XXL_NOTIZ,
  }));
}

function immoMietvertraege(ctx: XxlKontext): SeedZeile[] {
  const e = je(ctx, 'immo_einheiten');
  if (e.length < 2) return [];
  return [
    { ...O(ctx), einheit_id: e[0], mieter_name: 'Mieterin Beispiel', mieter_email: null, beginn: tagPlus(ctx.heute, -800), kaltmiete: 820, nebenkosten: 190, kaution: 2460, notiz: XXL_NOTIZ },
    { ...O(ctx), einheit_id: e[1], mieter_name: 'Mieter Muster', mieter_email: null, beginn: tagPlus(ctx.heute, -300), kaltmiete: 890, nebenkosten: 210, kaution: 2670, notiz: XXL_NOTIZ },
  ];
}

function exposes(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), bezeichnung: 'Helle 3-Zimmer-Wohnung mit Balkon', objekt_art: 'wohnung', vermarktung_art: 'kauf', ort: 'Böblingen', adresse: 'Musterstraße 5', wohnflaeche: 74, zimmer: 3, baujahr: 1998, etage: '1. OG', preis: 329000, provision_prozent: 3.57, energieausweis_vorhanden: true, energie_typ: 'verbrauch', energiekennwert: 112, energietraeger: 'Gas', objekt_text: XXL_NOTIZ, status: 'aktiv' },
    { ...O(ctx), bezeichnung: 'Ladenfläche in Innenstadtlage', objekt_art: 'gewerbe', vermarktung_art: 'miete', ort: 'Sindelfingen', wohnflaeche: 110, preis: 1450, nebenkosten: 320, energieausweis_vorhanden: true, energie_typ: 'bedarf', energiekennwert: 98, energietraeger: 'Fernwärme', objekt_text: XXL_NOTIZ, status: 'entwurf' },
  ];
}

function gutachten(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), titel: 'Wertgutachten Einfamilienhaus', auftraggeber: 'Kunde 1 (Beispiel)', objekt: 'Probeweg 12', art: 'Verkehrswert', aktenzeichen: 'GA-XXL-01', datum: tagPlus(ctx.heute, -10), gutachter: 'Max Muster', stunden: 14, kontakt_id: erstes(ctx, 'kontakte'), notiz: XXL_NOTIZ },
    { ...O(ctx), titel: 'Schadensgutachten Wasserschaden', auftraggeber: 'Kunde 2 (Beispiel)', objekt: 'Testallee 3', art: 'Schaden', aktenzeichen: 'GA-XXL-02', datum: tagPlus(ctx.heute, -2), gutachter: 'Max Muster', stunden: 6, kontakt_id: erstes(ctx, 'kontakte', 1), notiz: XXL_NOTIZ },
  ];
}

function kanzleiMandate(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 0), mandant: 'Kunde 1 (Beispiel)', art: 'Jahresabschluss', aktenzeichen: 'M-XXL-001', notiz: XXL_NOTIZ },
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 1), mandant: 'Kunde 2 (Beispiel)', art: 'Vertragsprüfung', aktenzeichen: 'M-XXL-002', notiz: XXL_NOTIZ },
  ];
}

function kanzleiFristen(ctx: XxlKontext): SeedZeile[] {
  const m = je(ctx, 'kanzlei_mandate');
  if (!m.length) return [];
  return [
    { ...O(ctx), mandat_id: m[0], bezeichnung: 'Abgabe Jahresabschluss', frist: tagPlus(ctx.heute, 21), notiz: XXL_NOTIZ },
    { ...O(ctx), mandat_id: m[1 % m.length], bezeichnung: 'Stellungnahme an Gegenseite', frist: tagPlus(ctx.heute, 4), notiz: XXL_NOTIZ },
    { ...O(ctx), mandat_id: m[0], bezeichnung: 'Unterlagen anfordern', frist: tagPlus(ctx.heute, -5), erledigt: true, erledigt_am: tagPlus(ctx.heute, -6), notiz: XXL_NOTIZ },
  ];
}

// ---------------------------------------------------------------------------
// Bildung, Wellness, Tiere
// ---------------------------------------------------------------------------
function bildungKurse(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), titel: 'Grundkurs Fliesenlegen', start_am: tagPlus(ctx.heute, 7), ende_am: tagPlus(ctx.heute, 21), ort: 'Werkstatt', plaetze: 8, preis: 290, art: 'einzeltermin', dozent: 'Lena Beispiel', notiz: XXL_NOTIZ },
    { ...O(ctx), titel: 'Erste Hilfe im Betrieb', start_am: tagPlus(ctx.heute, 14), ende_am: tagPlus(ctx.heute, 14), ort: 'Schulungsraum', plaetze: 12, preis: 65, art: 'einzeltermin', dozent: 'Extern (Beispiel)', notiz: XXL_NOTIZ },
  ];
}

function bildungTermine(ctx: XxlKontext): SeedZeile[] {
  const k = je(ctx, 'bildung_kurse');
  if (!k.length) return [];
  return [
    { ...O(ctx), kurs_id: k[0], datum: tagPlus(ctx.heute, 7), von_uhr: '09:00', bis_uhr: '12:00', thema: 'Untergrund und Werkzeug' },
    { ...O(ctx), kurs_id: k[0], datum: tagPlus(ctx.heute, 14), von_uhr: '09:00', bis_uhr: '12:00', thema: 'Wandfliesen' },
    { ...O(ctx), kurs_id: k[0], datum: tagPlus(ctx.heute, 21), von_uhr: '09:00', bis_uhr: '12:00', thema: 'Fugen und Silikon' },
  ];
}

function bildungAnmeldungen(ctx: XxlKontext): SeedZeile[] {
  const k = je(ctx, 'bildung_kurse');
  if (!k.length) return [];
  return ['Anna Teilnehmer', 'Ben Kursbesuch', 'Carla Lernend'].map((n, i) => ({
    ...O(ctx), kurs_id: k[i === 2 ? 1 % k.length : 0], name: n,
    email: `${n.toLowerCase().replace(' ', '.')}@example.com`,
  }));
}

function wellnessKunden(ctx: XxlKontext): SeedZeile[] {
  // Bewusst ohne Hinweise/Geburtsdatum: dort landen im echten Betrieb Gesundheitsangaben.
  return ['Sophie Entspannt', 'Lars Massage', 'Nina Kosmetik'].map((n) => ({
    ...O(ctx), name: n, telefon: null, email: `${n.toLowerCase().replace(' ', '.')}@example.com`,
  }));
}

function wellnessBehandlungen(ctx: XxlKontext): SeedZeile[] {
  const k = je(ctx, 'wellness_kunden');
  if (!k.length) return [];
  return ([
    [0, -14, 'Rückenmassage', 45, 55], [0, -2, 'Rückenmassage', 45, 55], [1, -7, 'Hot-Stone', 60, 79], [2, -1, 'Gesichtsbehandlung', 50, 69],
  ] as const).map((b) => ({ ...O(ctx), kunde_id: k[b[0] % k.length], datum: tagPlus(ctx.heute, b[1]), behandlung: b[2], dauer_min: b[3], preis: b[4], notiz: XXL_NOTIZ }));
}

function tiere(ctx: XxlKontext): SeedZeile[] {
  return [
    ['Bello', 'Hund', 'Labrador', -1800], ['Minka', 'Katze', 'Europäisch Kurzhaar', -1100], ['Hoppel', 'Kaninchen', 'Zwergkaninchen', -500],
  ].map((t, i) => ({
    ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', i), halter: `Halter ${i + 1} (Beispiel)`, name: t[0], art: t[1], rasse: t[2],
    geburtsdatum: tagPlus(ctx.heute, Number(t[3])), chip_nr: null, notiz: XXL_NOTIZ,
    halter_email: null, halter_telefon: null, erinnerung_ok: false,
  }));
}

function tierBehandlungen(ctx: XxlKontext): SeedZeile[] {
  const t = je(ctx, 'tier_tiere');
  if (!t.length) return [];
  return [
    { ...O(ctx), tier_id: t[0], datum: tagPlus(ctx.heute, -30), art: 'behandlung', bezeichnung: 'Impfung (Beispiel)', naechste_faellig: tagPlus(ctx.heute, 335), preis: 58, notiz: XXL_NOTIZ },
    { ...O(ctx), tier_id: t[1 % t.length], datum: tagPlus(ctx.heute, -3), art: 'behandlung', bezeichnung: 'Krallen schneiden', preis: 15, notiz: XXL_NOTIZ },
  ];
}

// ---------------------------------------------------------------------------
// Landwirtschaft, Forst, Holz
// ---------------------------------------------------------------------------
function schlaege(ctx: XxlKontext): SeedZeile[] {
  const jahr = Number(ctx.heute.slice(0, 4));
  return [
    ['Acker Am Bach', '1234/5', 4.2, 'Winterweizen'], ['Hangwiese', '1240/2', 1.8, 'Grünland'], ['Feld Nord', '1301', 6.5, 'Raps'],
  ].map((s) => ({ ...O(ctx), bezeichnung: s[0], flurstueck: s[1], flaeche_ha: s[2], kultur: s[3], kultur_jahr: jahr, standort: 'Gemarkung Beispiel', notiz: XXL_NOTIZ }));
}

function forstObjekte(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), bezeichnung: 'Privatwald Beispiel', adresse: 'Waldweg 1, 71032 Böblingen', gps_lat: 48.68, gps_lng: 9.01, notiz: XXL_NOTIZ },
    { ...O(ctx), bezeichnung: 'Baumreihe Parkplatz', adresse: 'Industriestraße 4, 71063 Sindelfingen', gps_lat: 48.71, gps_lng: 9.0, notiz: XXL_NOTIZ },
  ];
}

function holzSortiment(ctx: XxlKontext): SeedZeile[] {
  return [
    ['Buche', 33, 'kammergetrocknet', 15], ['Eiche', 25, 'lufttrocken', 20], ['Fichte', 50, 'frisch', null],
  ].map((h) => ({ ...O(ctx), holzart: h[0], scheitlaenge_cm: h[1], trocknungsgrad: h[2], restfeuchte_prozent: h[3], bezeichnung: `${h[0]} ${h[1]} cm (Beispiel)`, notiz: XXL_NOTIZ }));
}

// ---------------------------------------------------------------------------
// Verein, Spenden, Veranstaltungen
// ---------------------------------------------------------------------------
function vereinMitglieder(ctx: XxlKontext): SeedZeile[] {
  return [['Erika Vorstand', 'Vorsitz', 60], ['Fritz Kasse', 'Kassenwart', 60], ['Greta Mitglied', null, 36], ['Hans Jugend', null, 18]].map((m, i) => ({
    ...O(ctx), name: m[0], email: `${String(m[0]).toLowerCase().replace(' ', '.')}@example.com`, telefon: null,
    eintritt: tagPlus(ctx.heute, -2000 + i * 400), beitrag: m[2], intervall: 'jahr', rolle: m[1], notiz: XXL_NOTIZ,
  }));
}

function vereinVeranstaltungen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), titel: 'Mitgliederversammlung', datum: tagPlus(ctx.heute, 30), ort: 'Vereinsheim', teilnehmer: 0, ehrenamt_stunden: 0, notiz: XXL_NOTIZ },
    { ...O(ctx), titel: 'Sommerfest', datum: tagPlus(ctx.heute, -60), ort: 'Festplatz', teilnehmer: 140, ehrenamt_stunden: 64, notiz: XXL_NOTIZ },
  ];
}

function spenden(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), datum: tagPlus(ctx.heute, -20), spender_name: 'Spender Beispiel', spender_anschrift: 'Beispielweg 2, 71032 Böblingen', betrag: 150, art: 'geldzuwendung', zweck: 'Jugendarbeit', notiz: XXL_NOTIZ },
    { ...O(ctx), datum: tagPlus(ctx.heute, -5), spender_name: 'Firma Muster GmbH', spender_anschrift: 'Musterstraße 9, 71063 Sindelfingen', betrag: 500, art: 'geldzuwendung', zweck: 'Vereinsheim', notiz: XXL_NOTIZ },
  ];
}

function eventVeranstaltungen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), titel: 'Tag der offenen Werkstatt', ort: 'Werkstatt', beginn: berlinZeit(tagPlus(ctx.heute, 25), '10:00'), ende: berlinZeit(tagPlus(ctx.heute, 25), '16:00'), kapazitaet: 150, preis: 0, beschreibung: XXL_NOTIZ },
    { ...O(ctx), titel: 'Kundenabend Badplanung', ort: 'Ausstellung', beginn: berlinZeit(tagPlus(ctx.heute, 12), '18:00'), ende: berlinZeit(tagPlus(ctx.heute, 12), '20:00'), kapazitaet: 30, preis: 0, beschreibung: XXL_NOTIZ },
  ];
}

// ---------------------------------------------------------------------------
// Fertigung, BDE, Chargen, Gutscheine, Prüfpflichten
// ---------------------------------------------------------------------------
function fertigungAuftraege(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), auftragsnr: 'FA-XXL-001', produkt: 'Geländer Edelstahl 3 m', menge: 4, start_am: tagPlus(ctx.heute, 2), notiz: XXL_NOTIZ },
    { ...O(ctx), auftragsnr: 'FA-XXL-002', produkt: 'Treppenwange', menge: 2, start_am: tagPlus(ctx.heute, 9), notiz: XXL_NOTIZ },
  ];
}

function bdeMaschinen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), bezeichnung: 'CNC-Fräse', maschinen_nr: 'M-XXL-01', standort: 'Halle 1', ideal_takt_sek: 90, notiz: XXL_NOTIZ },
    { ...O(ctx), bezeichnung: 'Bandsäge', maschinen_nr: 'M-XXL-02', standort: 'Halle 1', ideal_takt_sek: 40, notiz: XXL_NOTIZ },
  ];
}

function chargenLose(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), artikel_id: erstes(ctx, 'artikel'), charge_nr: 'LOS-XXL-001', typ: 'charge', bezeichnung: 'Edelstahlrohr 42 mm', menge: 60, einheit: 'm', herstell_datum: tagPlus(ctx.heute, -40), herkunft: 'Lieferant Beispiel', bemerkung: XXL_NOTIZ },
    { ...O(ctx), artikel_id: null, charge_nr: 'LOS-XXL-002', typ: 'charge', bezeichnung: 'Schweißdraht', menge: 15, einheit: 'kg', herstell_datum: tagPlus(ctx.heute, -12), herkunft: 'Lieferant Muster', bemerkung: XXL_NOTIZ },
  ];
}

function gutscheine(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), code: 'XXL-WERT-50', art: 'wert', mwst_typ: 'mehrzweck', wert: 50, empfaenger_name: 'Beschenkte Beispiel', anlass: 'Geburtstag', gueltig_bis: tagPlus(ctx.heute, 1095), notiz: XXL_NOTIZ },
    { ...O(ctx), code: 'XXL-KARTE-10', art: 'mehrfachkarte', mwst_typ: 'einzweck', wert: 0, nutzungen_gesamt: 10, leistung_text: '10er-Karte Beispiel', gueltig_bis: tagPlus(ctx.heute, 365), notiz: XXL_NOTIZ },
  ];
}

function pruefpflichten(ctx: XxlKontext): SeedZeile[] {
  return [
    ['DGUV V3 ortsveränderliche Geräte', 12, -300], ['Leitern und Tritte', 12, -350], ['Feuerlöscher', 24, -100], ['Hebebühne UVV', 12, -380],
  ].map((p) => ({
    ...O(ctx), bezeichnung: p[0], verantwortlich: 'Lena Beispiel', letzte_pruefung: tagPlus(ctx.heute, Number(p[2])),
    intervall_monate: p[1], naechste_pruefung: tagPlus(ctx.heute, Number(p[2]) + Number(p[1]) * 30), notiz: XXL_NOTIZ,
  }));
}

// ---------------------------------------------------------------------------
// Räume, Plätze, Belegung, Objekte, Zuschnitt
// ---------------------------------------------------------------------------
function raeume(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), bezeichnung: 'Besprechungsraum', typ: 'raum', kapazitaet: 8, standort: 'Büro', ausstattung: 'Bildschirm, Whiteboard', notiz: XXL_NOTIZ },
    { ...O(ctx), bezeichnung: 'Schulungsraum', typ: 'raum', kapazitaet: 16, standort: 'Werkstatt', ausstattung: 'Beamer', notiz: XXL_NOTIZ },
  ];
}

function plaetze(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), art: 'tisch', bezeichnung: 'Tisch 1', standort: 'Gastraum', kapazitaet: 4, notiz: XXL_NOTIZ },
    { ...O(ctx), art: 'tisch', bezeichnung: 'Tisch 2', standort: 'Terrasse', kapazitaet: 6, notiz: XXL_NOTIZ },
    { ...O(ctx), art: 'lagerplatz', bezeichnung: 'Lagerplatz A1', standort: 'Halle', kapazitaet: 1, notiz: XXL_NOTIZ },
  ];
}

function belegungEinheiten(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), bezeichnung: 'Ferienwohnung Sonnenblick', kategorie: 'Ferienwohnung', einheit_nr: 'FW-1', abrechnungsart: 'nacht', preis_pro_einheit: 89, grundgebuehr: 40, kaution: 200, max_belegung: 4, notiz: XXL_NOTIZ },
    { ...O(ctx), bezeichnung: 'Stellplatz Wohnmobil', kategorie: 'Stellplatz', einheit_nr: 'SP-3', abrechnungsart: 'nacht', preis_pro_einheit: 18, max_belegung: 4, notiz: XXL_NOTIZ },
  ];
}

function objekte(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 0), projekt_id: erstes(ctx, 'projekte'), bezeichnung: 'Bürogebäude Beispiel', kennung: 'OBJ-XXL-1', adresse: 'Musterstraße 5, 71032 Böblingen', typ: 'Gebäude', stundensatz_netto: 42, notiz: XXL_NOTIZ },
    { ...O(ctx), kontakt_id: erstes(ctx, 'kontakte', 1), bezeichnung: 'Praxis Probe', kennung: 'OBJ-XXL-2', adresse: 'Probeweg 12, 71063 Sindelfingen', typ: 'Praxis', stundensatz_netto: 38, notiz: XXL_NOTIZ },
  ];
}

function objektZeiten(ctx: XxlKontext): SeedZeile[] {
  const o = je(ctx, 'objekte');
  const ma = je(ctx, 'mitarbeiter');
  if (!o.length) return [];
  return [0, 1, 2, 3].map((i) => ({
    ...O(ctx), objekt_id: o[i % o.length], mitarbeiter_id: ma.length ? ma[(i + 2) % ma.length] : null,
    datum: tagPlus(ctx.heute, -1 - i), dauer_minuten: 90 + i * 15, taetigkeit: i % 2 ? 'Glasreinigung' : 'Unterhaltsreinigung',
    stundensatz_netto: 42, abrechenbar: true, mwst_satz: 19, notiz: XXL_NOTIZ,
  }));
}

function zuschnittProjekte(ctx: XxlKontext): SeedZeile[] {
  return [{ ...O(ctx), bezeichnung: 'Geländer Stäbe (Beispiel)', material: 'Edelstahl Rundrohr 12 mm', stangenlaenge: 6000, saegeblatt_mm: 3, kontakt_id: erstes(ctx, 'kontakte'), notiz: XXL_NOTIZ }];
}

// ---------------------------------------------------------------------------
// Reihenfolge (Eltern vor Kindern) + Lösch-Reihenfolge (Kinder vor Eltern)
// ---------------------------------------------------------------------------
const B = (key: string, tabelle: string, baue: (ctx: XxlKontext) => SeedZeile[]): XxlSeeder => ({ key, tabelle, gruppe: 'branchen', baue });

export const XXL_BRANCHEN_SEEDER: XxlSeeder[] = [
  B('werkstatt_fahrzeuge', 'werkstatt_fahrzeuge', werkstattFahrzeuge),
  B('kfz_fahrzeuge', 'kfz_fahrzeuge', kfzFahrzeuge),
  B('werkstatt_auftraege', 'werkstatt_auftraege', werkstattAuftraege),
  B('werkstatt_positionen', 'werkstatt_positionen', werkstattPositionen),
  // Paket 285: Kfz-Handel
  B('kfz_bestand', 'kfz_bestand', kfzBestand),
  B('kfz_bestand_kosten', 'kfz_bestand_kosten', kfzKosten),
  B('kfz_marktvergleich', 'kfz_marktvergleich', kfzMarktvergleich),
  B('kfz_anfrage', 'kfz_anfrage', kfzAnfragen),
  B('kfz_suchauftrag', 'kfz_suchauftrag', kfzSuchauftraege),
  B('kfz_probefahrt', 'kfz_probefahrt', kfzProbefahrten),
  B('kfz_tresor', 'kfz_tresor', kfzTresor),
  B('menu_gericht', 'menu_gericht', menuGerichte),
  B('gastro_reservierungen', 'gastro_reservierungen', gastroReservierungen),
  B('hotel_zimmer', 'hotel_zimmer', hotelZimmer),
  B('hotel_belegungen', 'hotel_belegungen', hotelBelegungen),
  B('lm_chargen', 'lm_chargen', lmChargen),
  B('lm_haccp', 'lm_haccp', lmHaccp),
  B('rezepturen', 'rezepturen', rezepturen),
  B('rezeptur_zutaten', 'rezeptur_zutaten', rezepturZutaten),
  B('logistik_touren', 'logistik_touren', logistikTouren),
  B('logistik_sendungen', 'logistik_sendungen', logistikSendungen),
  B('tour', 'tour', touren),
  B('tour_stopp', 'tour_stopp', tourStopps),
  B('it_assets', 'it_assets', itAssets),
  B('it_vertraege', 'it_vertraege', itVertraege),
  B('energie_anlagen', 'energie_anlagen', energieAnlagen),
  B('energie_ablesungen', 'energie_ablesungen', energieAblesungen),
  B('immo_einheiten', 'immo_einheiten', immoEinheiten),
  B('immo_mietvertraege', 'immo_mietvertraege', immoMietvertraege),
  B('expose', 'expose', exposes),
  B('gutachten', 'gutachten', gutachten),
  B('kanzlei_mandate', 'kanzlei_mandate', kanzleiMandate),
  B('kanzlei_fristen', 'kanzlei_fristen', kanzleiFristen),
  B('bildung_kurse', 'bildung_kurse', bildungKurse),
  B('bildung_termine', 'bildung_termine', bildungTermine),
  B('bildung_anmeldungen', 'bildung_anmeldungen', bildungAnmeldungen),
  B('wellness_kunden', 'wellness_kunden', wellnessKunden),
  B('wellness_behandlungen', 'wellness_behandlungen', wellnessBehandlungen),
  B('tier_tiere', 'tier_tiere', tiere),
  B('tier_behandlungen', 'tier_behandlungen', tierBehandlungen),
  B('schlag', 'schlag', schlaege),
  B('forst_objekte', 'forst_objekte', forstObjekte),
  B('holz_sortiment', 'holz_sortiment', holzSortiment),
  B('verein_mitglieder', 'verein_mitglieder', vereinMitglieder),
  B('verein_veranstaltungen', 'verein_veranstaltungen', vereinVeranstaltungen),
  B('spende', 'spende', spenden),
  B('event_veranstaltung', 'event_veranstaltung', eventVeranstaltungen),
  B('fertigung_auftraege', 'fertigung_auftraege', fertigungAuftraege),
  B('bde_maschine', 'bde_maschine', bdeMaschinen),
  B('charge_los', 'charge_los', chargenLose),
  B('gutschein', 'gutschein', gutscheine),
  B('pruefpflichten', 'pruefpflichten', pruefpflichten),
  B('raum_ressource', 'raum_ressource', raeume),
  B('reservierung_platz', 'reservierung_platz', plaetze),
  B('belegung_einheit', 'belegung_einheit', belegungEinheiten),
  B('objekte', 'objekte', objekte),
  B('objekt_zeiten', 'objekt_zeiten', objektZeiten),
  B('zuschnitt_projekt', 'zuschnitt_projekt', zuschnittProjekte),
];

/** Kinder vor Eltern; Branchen-Tabellen VOR den Kern-Tabellen (sie verweisen auf Kontakte, Mitarbeiter, Projekte, Artikel). */
export const XXL_BRANCHEN_LOESCH_ORDER: string[] = [
  'werkstatt_positionen', 'werkstatt_auftraege', 'werkstatt_fahrzeuge', 'kfz_fahrzeuge',
  'kfz_tresor', 'kfz_probefahrt', 'kfz_suchauftrag', 'kfz_anfrage', 'kfz_marktvergleich', 'kfz_bestand_kosten', 'kfz_bestand',
  'gastro_reservierungen', 'menu_gericht', 'hotel_belegungen', 'hotel_zimmer',
  'lm_haccp', 'lm_chargen', 'rezeptur_zutaten', 'rezepturen',
  'logistik_sendungen', 'logistik_touren', 'tour_stopp', 'tour',
  'it_vertraege', 'it_assets', 'energie_ablesungen', 'energie_anlagen',
  'immo_mietvertraege', 'immo_einheiten', 'expose', 'gutachten', 'kanzlei_fristen', 'kanzlei_mandate',
  'bildung_anmeldungen', 'bildung_termine', 'bildung_kurse', 'wellness_behandlungen', 'wellness_kunden',
  'tier_behandlungen', 'tier_tiere', 'schlag', 'forst_objekte', 'holz_sortiment',
  'verein_veranstaltungen', 'verein_mitglieder', 'spende', 'event_veranstaltung',
  'fertigung_auftraege', 'bde_maschine', 'charge_los', 'gutschein', 'pruefpflichten',
  'raum_ressource', 'reservierung_platz', 'belegung_einheit', 'objekt_zeiten', 'objekte', 'zuschnitt_projekt',
];

/** Alle Seeder des Musterbetriebs: Kern (Push 1) + Branchen (Push 2). */
export const XXL_ALLE_SEEDER: XxlSeeder[] = [...XXL_SEEDER, ...XXL_BRANCHEN_SEEDER];

/** Gesamte Lösch-Reihenfolge: Branchen zuerst, dann Kern + Übungswelt. */
export const XXL_ALLE_LOESCH_ORDER: string[] = [...XXL_BRANCHEN_LOESCH_ORDER, ...XXL_LOESCH_ORDER];

/** Lösch-Plan über alle Tabellen des Musterbetriebs. */
export function loeschPlanAlle(register: Array<{ tabelle: string; datensatz_id: string }>) {
  return loeschPlan(register, XXL_ALLE_LOESCH_ORDER);
}
