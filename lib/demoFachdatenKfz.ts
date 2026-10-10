// ============================================================================
// ARGONAUT OS · lib/demoFachdatenKfz.ts — Paket 297: Vorführ-Autohaus mit Fachdaten
//
// Der Vorführ-Betrieb „Autohaus Renz" (lib/demoBetriebe, slug autohaus) hatte
// bisher nur die Übungswelt (drei Kontakte, ein Angebot, eine Rechnung …) —
// das KFZ-Fachpaket war leer. Diese Datei füllt es wie ein laufendes Autohaus:
//
//   Team (Verkauf, Werkstatt, Büro) · Kunden · Fahrzeugbestand vom Zulauf bis
//   verkauft (Porsche 911, GLE mit AMG Line, RS 6, Bentley im Zulauf …) mit
//   Langstehern · Verkäufe dieses Jahr und Vorjahr mit erzieltem Preis und
//   Verkäufer (Chef-Blick: Monate, Marken, Vorjahresvergleich) · Kosten und
//   Kalkulation · Marktvergleich · DAT-Bewertung · Anfragen in jedem Stand ·
//   Suchaufträge · Probefahrten mit rotem Kennzeichen · Brief-Tresor und
//   Schlüssel · Zulassung · Ankauf mit Prüfung und Schäden · Verkaufsvorgänge
//   (Angebot, Reservierung mit Anzahlung, übergeben) · Werkstatt mit
//   Kundenfahrzeugen, Aufträgen und interner Aufbereitung · Ersatz- und
//   Mietwagen mit Reservierungen · Termine.
//
// Bewusst NICHT: Rechnungen aus dem Fahrzeugverkauf (Kern-Geld — die erzeugt
// man in der Vorführung per Knopf, dann sieht der Kunde § 25a live), Partner-
// Aufträge (Einträge sind unlöschbar — die Vorführung ließe sich nicht mehr
// zurücksetzen), Börse/Online-Mietanfrage (Vorführ-Betrieb ist nie öffentlich),
// Fahrtenbuch/Führerscheinkontrolle (brauchen die Rechts-Freigabe).
//
// Alle Namen, Nummern und Adressen sind erfunden; E-Mail-Adressen liegen auf
// example.com. Werte halten die Prüfregeln aus p259–p277 und p291 (in der
// Test-Datenbank eingespielt). Reine Logik, node-getestet (tests/demoFachdatenKfzP297).
// ============================================================================

import { tagPlus, berlinZeit, type XxlKontext } from './musterbetriebXxl';
import { PRUEF_KEYS } from './kfzAnkauf';
import type { SeedZeile } from './uebungswelt';
import { PREMIUM_SEEDER, PREMIUM_LOESCH_ORDER, PREMIUM_BESITZER_TABELLEN } from './demoFachdatenKfzPremium';
import { wachstumSeeder, wachstumLoeschOrder } from './demoWachstum';
import { WACHSTUM_PROFILE } from './demoWachstumProfile';

/** Markierung in Notizfeldern. */
export const FACH_NOTIZ = 'Beispiel-Datensatz · Vorführ-Autohaus';
/** Quelle der Beispiel-Kontakte (wie die Übungswelt). */
const QUELLE = 'Beispiel';

export type FachSeeder = {
  key: string;
  tabelle: string;
  /** Tabelle ohne Spalte `id` (z. B. kfz_bestand_kalk): kein Register-Eintrag — geht mit dem Eltern-Datensatz bzw. über besitzerTabellen. */
  ohneId?: boolean;
  baue: (ctx: XxlKontext) => SeedZeile[];
};

const O = (ctx: XxlKontext) => ({ owner_user_id: ctx.uid });
const nimm = (ctx: XxlKontext, tabelle: string, i = 0): string | null => {
  const l = ctx.ids[tabelle] || [];
  return l.length ? l[i % l.length] : null;
};
/** Erster des Monats `tage` vor heute (Erstzulassung). */
const ezVor = (heute: string, tage: number) => tagPlus(heute, -tage).slice(0, 8) + '01';

// ---------------------------------------------------------------------------
// Team und Kunden
// ---------------------------------------------------------------------------
export const TEAM = [
  { vorname: 'Markus', nachname: 'Brandt', position: 'Verkaufsleiter', eintritt: -3100 },
  { vorname: 'Sandra', nachname: 'Keller', position: 'Verkäuferin', eintritt: -1800 },
  { vorname: 'Jonas', nachname: 'Yilmaz', position: 'Verkäufer', eintritt: -600 },
  { vorname: 'Peter', nachname: 'Hahn', position: 'Werkstattmeister', eintritt: -4200 },
  { vorname: 'Luca', nachname: 'Berger', position: 'Kfz-Mechatroniker', eintritt: -1300 },
  { vorname: 'Anna', nachname: 'Lehmann', position: 'Disposition und Zulassung', eintritt: -900 },
] as const;
const verkaeufer = (i: number) => `${TEAM[i].vorname[0]}. ${TEAM[i].nachname}`;

function team(ctx: XxlKontext): SeedZeile[] {
  return TEAM.map((m) => ({
    ...O(ctx), standort_id: null, vorname: m.vorname, nachname: m.nachname,
    email: `${m.vorname}.${m.nachname}`.toLowerCase() + '@example.com', telefon: null,
    position: m.position, status: 'aktiv', eintrittsdatum: tagPlus(ctx.heute, m.eintritt),
    arbeitszeit_modell: 'vollzeit', wochenstunden: 40, urlaubsanspruch_tage: 30,
  }));
}

/** [Vorname, Nachname, Firma, Ort, Status, Notiz] */
export const KUNDEN = [
  ['Thomas', 'Wagner', null, 'Sindelfingen', 'kunde', 'Hat den GLE reserviert, Anzahlung überwiesen.'],
  ['Claudia', 'Becker', null, 'Böblingen', 'kunde', 'Octavia gekauft, Übergabe erfolgt. Inspektion in 12 Monaten anbieten.'],
  ['Robert', 'Schmid', 'Schmid Elektrotechnik GmbH', 'Holzgerlingen', 'kunde', 'Gewerbekunde, Flotte mit drei Transportern — Werkstattkunde.'],
  ['Elena', 'Hoffmann', null, 'Ehningen', 'interessent', 'Interessiert am Porsche 911, Probefahrt war gestern.'],
  ['Daniel', 'Krüger', null, 'Leonberg', 'interessent', 'Sucht Kombi mit Allrad bis 45.000 € (Suchauftrag).'],
  ['Sabine', 'Neumann', null, 'Herrenberg', 'kunde', 'Werkstattkundin, Golf zur Inspektion.'],
  ['Michael', 'Schulz', 'Autovermietung Schulz', 'Stuttgart', 'interessent', 'Händler-Kollege, nimmt Inzahlungnahmen ab.'],
  ['Laura', 'Fischer', null, 'Weil im Schönbuch', 'interessent', 'Anfrage zum Defender über die Webseite.'],
] as const;

function kunden(ctx: XxlKontext): SeedZeile[] {
  return KUNDEN.map((k) => ({
    ...O(ctx), vorname: k[0], nachname: k[1], firma: k[2], ort: k[3], telefon: null,
    email: `${k[0]}.${k[1]}`.toLowerCase().replace(/ü/g, 'ue') + '@example.com',
    status: k[4], quelle: QUELLE, notizen: `${k[5]} · ${FACH_NOTIZ}`,
  }));
}

// ---------------------------------------------------------------------------
// Fahrzeugbestand
// ---------------------------------------------------------------------------
/**
 * [Marke, Modell, Variante, Sparte, Status, Kraftstoff, kW, km, EZ vor Tagen, Eingang vor Tagen (null = Zulauf),
 *  EK netto, VK brutto, Besteuerung, verkauft vor Tagen, FIN-Präfix, Farbe, Kennzeichen, Verkäufer (TEAM-Index), erzielt brutto]
 */
export const FAHRZEUGE = [
  ['Porsche', '911 Carrera S', '992, PDK', 'Pkw', 'bestand', 'Benzin', 331, 18400, 1300, 129, 118500, 134900, '25a', null, 'WP0', 'Tiefschwarz Metallic', 'BB-AR 911', 0, null],
  ['Mercedes-Benz', 'GLE 450 4MATIC', 'AMG Line', 'Pkw', 'reserviert', 'Benzin, Mild-Hybrid', 280, 31200, 750, 49, 58900, 66490, 'regel', null, 'W1N', 'Polarweiß', null, 1, null],
  ['BMW', 'M340i xDrive Touring', null, 'Pkw', 'bestand', 'Benzin', 275, 52800, 1600, 151, 38200, 43980, '25a', null, 'WBA', 'Portimao Blau', 'BB-AR 340', 2, null],
  ['Audi', 'RS 6 Avant', 'performance', 'Pkw', 'aufbereitung', 'Benzin', 463, 24100, 980, 10, 99800, 112900, '25a', null, 'WAU', 'Nardograu', null, 0, null],
  ['Volkswagen', 'Golf 8 GTI', 'Clubsport', 'Pkw', 'bestand', 'Benzin', 221, 27900, 1050, 37, 31400, 35990, '25a', null, 'WVW', 'Kings Red', 'BB-AR 802', 2, null],
  ['Mercedes-Benz', 'Sprinter 317 CDI', 'Kasten L2H2', 'Nutzfahrzeug', 'bestand', 'Diesel', 125, 61200, 920, 87, 36900, 42490, 'regel', null, 'W1V', 'Arktikweiß', 'BB-AR 317', 1, null],
  ['Tesla', 'Model Y Long Range', 'Dual Motor', 'Pkw', 'bestand', 'Elektro', 378, 38500, 850, 193, 33800, 36900, '25a', null, 'XP7', 'Quicksilver', 'BB-AR 207', 2, null],
  ['Hymer', 'B-Klasse MasterLine T 780', null, 'Wohnmobil', 'bestand', 'Diesel', 130, 44100, 1980, 65, 71500, 79900, '25a', null, 'ZFA', 'Weiß / Silber', null, 1, null],
  ['Bentley', 'Continental GT V8', 'Mulliner', 'Pkw', 'zulauf', 'Benzin', 404, 12900, 1180, null, 172000, 189000, '25a', null, 'SCB', 'Verdant', null, 0, null],
  ['Land Rover', 'Defender 110 D300', 'X-Dynamic SE', 'Pkw', 'bestand', 'Diesel, Mild-Hybrid', 221, 29600, 1010, 100, 68400, 76900, '25a', null, 'SAL', 'Pangea Grün', 'BB-AR 110', 0, null],
  ['Ford', 'Transit Custom 320', 'Trend', 'Nutzfahrzeug', 'aufbereitung', 'Diesel', 96, 47300, 1100, 21, 24200, 28490, 'regel', null, 'WF0', 'Moondust Silber', null, 1, null],
  ['BMW', 'R 1250 GS Adventure', null, 'Motorrad', 'bestand', 'Benzin', 100, 21000, 1300, 25, 12900, 15990, '25a', null, 'WB1', 'Weiß / Blau', null, 2, null],
  // verkauft — dieses Jahr
  ['Skoda', 'Octavia Combi RS', '2.0 TDI', 'Pkw', 'verkauft', 'Diesel', 147, 88400, 2250, 112, 19900, 23490, '25a', 15, 'TMB', 'Race Blau', null, 1, 23200],
  ['Mercedes-Benz', 'C 220 d T-Modell', 'Avantgarde', 'Pkw', 'verkauft', 'Diesel', 147, 54000, 1400, 95, 27400, 33900, 'regel', 40, 'W1K', 'Obsidianschwarz', null, 0, 33500],
  ['Porsche', 'Macan S', null, 'Pkw', 'verkauft', 'Benzin', 280, 46500, 1500, 140, 52000, 59900, '25a', 75, 'WP1', 'Kreide', null, 0, 59000],
  ['Audi', 'A4 Avant 40 TDI', 'S line', 'Pkw', 'verkauft', 'Diesel', 150, 71200, 1700, 160, 24500, 29490, '25a', 120, 'WAU', 'Gletscherweiß', null, 2, 28900],
  ['Volkswagen', 'Tiguan 2.0 TSI', 'R-Line', 'Pkw', 'verkauft', 'Benzin', 140, 39800, 1200, 245, 26800, 31990, '25a', 200, 'WVG', 'Deep Black', null, 1, 31990],
  ['BMW', 'X5 xDrive30d', 'M Sport', 'Pkw', 'verkauft', 'Diesel', 210, 64300, 1600, 290, 44500, 51900, 'regel', 260, 'WBA', 'Carbonschwarz', null, 0, 50900],
  // verkauft — Vorjahr (für den Vorjahresvergleich im Chef-Blick)
  ['Mercedes-Benz', 'E 300 de T-Modell', 'Avantgarde', 'Pkw', 'verkauft', 'Diesel, Plug-in-Hybrid', 225, 41000, 1450, 430, 33900, 39990, 'regel', 380, 'W1K', 'Selenitgrau', null, 0, 39500],
  ['Volkswagen', 'Golf 7 GTI', 'Performance', 'Pkw', 'verkauft', 'Benzin', 180, 58300, 2400, 455, 17200, 20990, '25a', 400, 'WVW', 'Tornadorot', null, 2, 20500],
  ['Audi', 'Q5 45 TFSI', 'quattro', 'Pkw', 'verkauft', 'Benzin', 195, 52700, 1800, 500, 31900, 37490, '25a', 430, 'WAU', 'Navarrablau', null, 1, 37000],
] as const;

/** Gültige Beispiel-FIN (17 Zeichen, ohne I/O/Q), je Fahrzeug eindeutig. */
export function demoFin(praefix: string, i: number): string {
  return `${praefix}ZZZRENZ${1000001 + i}`;
}
const AUSSTATTUNG = ['Klimaautomatik', 'Navigationssystem', 'Sitzheizung vorn', 'Rückfahrkamera', 'LED-Scheinwerfer', 'Adaptive Geschwindigkeitsregelung', 'Keyless Go', 'Head-up-Display', 'Panoramadach', 'Anhängerkupplung'];

function bestand(ctx: XxlKontext): SeedZeile[] {
  return FAHRZEUGE.map((f, i) => {
    const elektro = f[5] === 'Elektro';
    const zulauf = f[4] === 'zulauf';
    const verkauft = f[4] === 'verkauft';
    return {
      ...O(ctx), interne_nr: `H-${1041 + i}`, status: f[4], sparte: f[3], marke: f[0], modell: f[1], variante: f[2],
      fin: demoFin(f[14], i), kennzeichen: f[16], erstzulassung: ezVor(ctx.heute, f[8]), km_stand: f[7], leistung_kw: f[6],
      kraftstoff: f[5], farbe: f[15], eingang_am: f[9] === null ? null : tagPlus(ctx.heute, -f[9]),
      verkauft_am: f[13] === null ? null : tagPlus(ctx.heute, -f[13]),
      ek_netto: f[10], vk_brutto: f[11], besteuerung: f[12],
      inseriert: f[4] === 'bestand' || f[4] === 'reserviert',
      hu_bis: zulauf ? null : tagPlus(ctx.heute, 240 + (i % 6) * 70),
      vorbesitzer: zulauf ? 1 : 1 + (i % 3), vorschaden: i === 2 ? 'ja' : 'keine_bekannt',
      vorschaden_text: i === 2 ? 'Parkschaden Stoßfänger hinten, fachgerecht repariert (Beispiel)' : null,
      ausstattung: f[3] === 'Motorrad' ? ['ABS', 'Navigationssystem', 'Griffheizung', 'Tempomat'] : AUSSTATTUNG.slice(0, 6 + (i % 5)),
      polster: f[3] === 'Pkw' ? 'Leder, Schwarz' : null,
      verbrauch_komb: elektro ? 16.9 : f[6] > 300 ? 11.2 : f[5].startsWith('Diesel') ? 7.1 : 8.4,
      verbrauch_einheit: elektro ? 'kwh' : 'l',
      co2_g_km: elektro ? 0 : f[6] > 300 ? 254 : f[5].startsWith('Diesel') ? 186 : 192,
      co2_klasse: elektro ? 'A' : f[6] > 300 ? 'G' : 'F',
      inserat_titel: verkauft ? null : `${f[0]} ${f[1]}${f[2] ? ' ' + f[2] : ''}`.slice(0, 120),
      bewertung_anbieter: i === 0 ? 'dat' : i === 6 ? 'schwacke' : null,
      bewertung_ek: i === 0 ? 116000 : i === 6 ? 31500 : null,
      bewertung_vk: i === 0 ? 133500 : i === 6 ? 35900 : null,
      bewertung_am: i === 0 || i === 6 ? tagPlus(ctx.heute, -12) : null,
      notiz: FACH_NOTIZ,
    };
  });
}

const bestandId = (ctx: XxlKontext, i: number) => nimm(ctx, 'kfz_bestand', i);

/** Kalkulation: Verkäufer, Hereinnehmer, Provision, erzielter Preis (verkauft). Eine Zeile je Fahrzeug, ohne eigene id. */
function kalk(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  FAHRZEUGE.forEach((f, i) => {
    const b = bestandId(ctx, i);
    if (!b || f[4] === 'zulauf') return;
    aus.push({
      ...O(ctx), bestand_id: b, vk_erzielt: f[18], verkaeufer: verkaeufer(f[17]), hereinnehmer: verkaeufer((f[17] + 1) % 3),
      prov_v_art: 'rohertrag', prov_v_wert: 10, prov_h_art: 'fest', prov_h_wert: 150,
      prov_ausgezahlt_am: f[13] !== null && f[13] > 60 ? tagPlus(ctx.heute, -f[13] + 30) : null,
    });
  });
  return aus;
}

/** [Fahrzeug-Index, Art, Bezeichnung, Betrag netto, Plan, vor Tagen] */
const KOSTEN = [
  [0, 'aufbereitung', 'Aufbereitung innen und außen, Keramikversiegelung', 890, false, 120],
  [0, 'hu', 'HU/AU neu', 129, false, 118],
  [1, 'aufbereitung', 'Aufbereitung', 420, false, 45],
  [1, 'zulassung', 'Zulassung und Kennzeichen (geplant)', 95, true, 0],
  [2, 'lack', 'Smart-Repair Stoßfänger hinten', 380, false, 140],
  [2, 'reifen', 'Satz Winterreifen', 760, false, 140],
  [3, 'aufbereitung', 'Komplettaufbereitung (läuft)', 890, true, 0],
  [3, 'reparatur', 'Bremsen hinten', 640, true, 0],
  [4, 'aufbereitung', 'Aufbereitung', 420, false, 33],
  [5, 'reparatur', 'Inspektion und Bremsflüssigkeit', 310, false, 80],
  [6, 'aufbereitung', 'Aufbereitung', 420, false, 185],
  [6, 'werbung', 'Top-Platzierung Börse (3 Monate)', 89, false, 60],
  [7, 'aufbereitung', 'Wohnraum-Reinigung und Gasprüfung', 640, false, 60],
  [9, 'aufbereitung', 'Aufbereitung', 650, false, 95],
  [10, 'aufbereitung', 'Aufbereitung (geplant)', 380, true, 0],
  [12, 'aufbereitung', 'Aufbereitung', 380, false, 105],
  [12, 'reparatur', 'Zahnriemen', 690, false, 100],
  [13, 'aufbereitung', 'Aufbereitung', 420, false, 90],
  [14, 'aufbereitung', 'Aufbereitung', 650, false, 135],
  [15, 'aufbereitung', 'Aufbereitung', 380, false, 155],
  [16, 'aufbereitung', 'Aufbereitung', 420, false, 240],
  [17, 'aufbereitung', 'Aufbereitung', 650, false, 285],
  [18, 'aufbereitung', 'Aufbereitung', 420, false, 425],
  [19, 'aufbereitung', 'Aufbereitung', 380, false, 450],
  [20, 'aufbereitung', 'Aufbereitung', 420, false, 495],
] as const;

function kosten(ctx: XxlKontext): SeedZeile[] {
  return KOSTEN.flatMap((k) => {
    const b = bestandId(ctx, k[0]);
    return b ? [{ ...O(ctx), bestand_id: b, art: k[1], bezeichnung: k[2], betrag_netto: k[3], plan: k[4], datum: tagPlus(ctx.heute, -k[5]) }] : [];
  });
}

function marktvergleich(ctx: XxlKontext): SeedZeile[] {
  const z: SeedZeile[] = [];
  const v = (i: number, werte: [number, number, string][]) => {
    const b = bestandId(ctx, i);
    if (!b) return;
    werte.forEach(([preis, km, quelle], j) => z.push({
      ...O(ctx), bestand_id: b, preis, km, erstzulassung: ezVor(ctx.heute, FAHRZEUGE[i][8]), quelle, link: null, notiz: 'Beispiel-Vergleich', erfasst_am: tagPlus(ctx.heute, -3 - j * 4),
    }));
  };
  v(0, [[136900, 21000, 'mobile.de'], [131500, 26500, 'AutoScout24'], [139900, 12000, 'mobile.de'], [129900, 34000, 'Händlerseite']]);
  v(6, [[35900, 41000, 'mobile.de'], [34490, 52000, 'AutoScout24'], [37900, 29000, 'mobile.de']]);
  return z;
}

function anfragen(ctx: XxlKontext): SeedZeile[] {
  const k = (i: number) => nimm(ctx, 'kontakte', i);
  const ma = (i: number) => nimm(ctx, 'mitarbeiter', i);
  const A = [
    { nr: 'A-0101', b: 9, q: 'website', name: 'Laura Fischer', mail: 'laura.fischer@example.com', kt: 7, msg: 'Ist der Defender noch da? Wäre Inzahlungnahme meines Evoque möglich?', s: 'neu', f: 0, v: 0, tage: 0 },
    { nr: 'A-0102', b: 0, q: 'boerse', name: 'Elena Hoffmann', mail: 'elena.hoffmann@example.com', kt: 3, msg: 'Probefahrt am Freitag möglich?', s: 'termin', f: 2, v: 0, tage: 3 },
    { nr: 'A-0103', b: 1, q: 'laden', name: 'Thomas Wagner', kt: 0, s: 'gewonnen', grund: 'gekauft', tage: 52, v: 1 },
    { nr: 'A-0104', b: 6, q: 'telefon', name: 'Kevin Roth', tel: '0151 00000000', s: 'in_arbeit', f: 1, v: 2, tage: 6, msg: 'Fragt nach Ladeleistung und Akku-Zertifikat.' },
    { nr: 'A-0105', b: 2, q: 'mail', name: 'Julia Weber', mail: 'julia.weber@example.com', s: 'angebot', f: 4, v: 2, tage: 9, msg: 'Möchte ein Angebot mit Finanzierung.' },
    { nr: 'A-0106', b: 6, q: 'boerse', name: 'Erik Schneider', s: 'verloren', grund: 'preis', notiz: 'Wollte 33.000 €', tage: 30, v: 2 },
    { nr: 'A-0107', b: 12, q: 'empfehlung', name: 'Claudia Becker', kt: 1, s: 'gewonnen', grund: 'gekauft', tage: 40, v: 1 },
    { nr: 'A-0108', b: null, q: 'website', name: 'Daniel Krüger', mail: 'daniel.krueger@example.com', kt: 4, msg: 'Suche Kombi mit Allrad bis 45.000 €.', s: 'in_arbeit', f: 5, v: 1, tage: 12 },
  ];
  return A.map((a) => {
    const zu = a.s === 'gewonnen' || a.s === 'verloren';
    return {
      ...O(ctx), nr: a.nr, bestand_id: a.b === null ? null : bestandId(ctx, a.b), quelle: a.q, name: a.name, tel: a.tel ?? null, email: a.mail ?? null,
      nachricht: a.msg ?? null, kontakt_id: a.kt === undefined ? null : k(a.kt), verantwortlich_id: ma(a.v), verantwortlich_name: `${TEAM[a.v].vorname} ${TEAM[a.v].nachname}`,
      status: a.s, faellig_am: zu ? null : tagPlus(ctx.heute, a.f ?? 0), abschluss_grund: zu ? a.grund : null, abschluss_notiz: a.notiz ?? null,
      abgeschlossen_am: zu ? berlinZeit(tagPlus(ctx.heute, -a.tage + 2), '17:00') : null,
      erstellt_am: berlinZeit(tagPlus(ctx.heute, -a.tage), '10:15'), notiz: FACH_NOTIZ,
    };
  });
}

function suchauftraege(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), nr: 'S-0011', name: 'Daniel Krüger', email: 'daniel.krueger@example.com', kontakt_id: nimm(ctx, 'kontakte', 4), kriterien: { sparte: 'Pkw', preis_max: 45000, km_max: 60000, kraftstoff: 'Diesel', suchtext: 'Kombi Allrad' }, aktiv: true, gueltig_bis: tagPlus(ctx.heute, 80), verantwortlich_name: 'Sandra Keller', notiz: FACH_NOTIZ },
    { ...O(ctx), nr: 'S-0012', name: 'Familie Roth', kriterien: { marke: 'Volkswagen', modell: 'Multivan', preis_max: 55000 }, aktiv: true, gueltig_bis: tagPlus(ctx.heute, 45), verantwortlich_name: 'Jonas Yilmaz', notiz: FACH_NOTIZ },
  ];
}

function roteKennzeichen(ctx: XxlKontext): SeedZeile[] {
  return [
    { ...O(ctx), kennzeichen: 'BB-06123', art: 'rot', gueltig_bis: null, aktiv: true, notiz: FACH_NOTIZ },
    { ...O(ctx), kennzeichen: 'BB-06124', art: 'rot', gueltig_bis: null, aktiv: true, notiz: FACH_NOTIZ },
  ];
}

function probefahrten(ctx: XxlKontext): SeedZeile[] {
  const gestern = tagPlus(ctx.heute, -1);
  const zuvor = tagPlus(ctx.heute, -54);
  const morgen = tagPlus(ctx.heute, 2);
  const b0 = bestandId(ctx, 0), b1 = bestandId(ctx, 1), b9 = bestandId(ctx, 9);
  const z: SeedZeile[] = [];
  if (b0) z.push({
    ...O(ctx), bestand_id: b0, nr: 'P-0031', art: 'probefahrt', status: 'zurueck', fahrer_name: 'Elena Hoffmann', fahrer_email: 'elena.hoffmann@example.com', kontakt_id: nimm(ctx, 'kontakte', 3),
    fs_geprueft: true, fs_klasse: 'B', fs_gueltig_bis: tagPlus(ctx.heute, 3200), begleitet: true, kennzeichen_art: 'eigen', kennzeichen: 'BB-AR 911',
    start_am: berlinZeit(gestern, '16:00'), ende_geplant: berlinZeit(gestern, '17:00'), rueck_am: berlinZeit(gestern, '16:55'),
    km_start: 18372, km_ende: 18400, km_frei: 50, tank_start: '3/4', tank_ende: '3/4', selbstbeteiligung: 2500,
    nachfass_am: tagPlus(ctx.heute, 1), ergebnis: 'interesse', notiz: FACH_NOTIZ,
  });
  if (b1) z.push({
    ...O(ctx), bestand_id: b1, nr: 'P-0029', art: 'probefahrt', status: 'zurueck', fahrer_name: 'Thomas Wagner', kontakt_id: nimm(ctx, 'kontakte', 0),
    fs_geprueft: true, fs_klasse: 'B', fs_gueltig_bis: tagPlus(ctx.heute, 2500), kennzeichen_art: 'rot', kennzeichen: 'BB-06123',
    start_am: berlinZeit(zuvor, '11:00'), ende_geplant: berlinZeit(zuvor, '12:00'), rueck_am: berlinZeit(zuvor, '11:50'),
    km_start: 31168, km_ende: 31200, km_frei: 50, tank_start: '1/2', tank_ende: '1/2', selbstbeteiligung: 1000,
    nachfass_am: tagPlus(zuvor, 1), nachfass_erledigt: true, ergebnis: 'kauf', notiz: FACH_NOTIZ,
  });
  if (b9) z.push({
    ...O(ctx), bestand_id: b9, nr: 'P-0032', art: 'probefahrt', status: 'geplant', fahrer_name: 'Laura Fischer', kontakt_id: nimm(ctx, 'kontakte', 7),
    fs_geprueft: false, kennzeichen_art: 'eigen', kennzeichen: 'BB-AR 110',
    start_am: berlinZeit(morgen, '10:00'), ende_geplant: berlinZeit(morgen, '11:00'), km_frei: 50, selbstbeteiligung: 1500, notiz: FACH_NOTIZ,
  });
  return z;
}

function tresor(ctx: XxlKontext): SeedZeile[] {
  const z: SeedZeile[] = [];
  FAHRZEUGE.forEach((f, i) => {
    const b = bestandId(ctx, i);
    if (!b || f[4] === 'zulauf') return;
    if (f[4] === 'verkauft') {
      if (f[13] !== null && f[13] < 100) z.push({ ...O(ctx), bestand_id: b, art: 'zb2', ort: null, status: 'beim_kaeufer', notiz: FACH_NOTIZ });
      return;
    }
    z.push({ ...O(ctx), bestand_id: b, art: 'zb2', ort: `Tresor Fach ${i + 1}`, status: i === 1 ? 'bei_zulassung' : 'im_haus', notiz: FACH_NOTIZ });
    z.push({ ...O(ctx), bestand_id: b, art: 'schluessel', anzahl: f[3] === 'Motorrad' ? 1 : 2, ort: `Schlüsselkasten ${i + 1}`,
      status: i === 9 ? 'ausgegeben' : 'im_haus', ausgegeben_an: i === 9 ? 'Peter Hahn (Werkstatt)' : null,
      ausgegeben_am: i === 9 ? berlinZeit(ctx.heute, '08:30') : null, zurueck_bis: i === 9 ? ctx.heute : null, notiz: FACH_NOTIZ });
    if (i === 0) z.push({ ...O(ctx), bestand_id: b, art: 'serviceheft', bezeichnung: 'Scheckheft digital (Ausdruck)', ort: 'Tresor Fach 1', status: 'im_haus', notiz: FACH_NOTIZ });
  });
  return z;
}

function zulassungen(ctx: XxlKontext): SeedZeile[] {
  const b1 = bestandId(ctx, 1), b12 = bestandId(ctx, 12);
  const z: SeedZeile[] = [];
  if (b1) z.push({ ...O(ctx), bestand_id: b1, art: 'zulassung', status: 'beim_amt', halter: 'Thomas Wagner', evb: 'A7K3M9P', wunschkennzeichen: 'BB-TW 450', termin: tagPlus(ctx.heute, 3),
    unterlagen: { zb2: true, evb: true, ausweis: true, sepa: true }, kosten_netto: 95, notiz: FACH_NOTIZ });
  if (b12) z.push({ ...O(ctx), bestand_id: b12, art: 'zulassung', status: 'erledigt', halter: 'Claudia Becker', evb: 'B4N8R2T', kennzeichen_neu: 'BB-CB 616', termin: tagPlus(ctx.heute, -17),
    unterlagen: { zb2: true, evb: true, ausweis: true, sepa: true }, kosten_netto: 95, erledigt_am: tagPlus(ctx.heute, -17), notiz: FACH_NOTIZ });
  return z;
}

function ankaeufe(ctx: XxlKontext): SeedZeile[] {
  const alleOk = Object.fromEntries(PRUEF_KEYS.map((k) => [k, 'ok']));
  const teils = Object.fromEntries(PRUEF_KEYS.slice(0, Math.ceil(PRUEF_KEYS.length / 2)).map((k, i) => [k, i === 1 ? 'mangel' : 'ok']));
  return [
    { ...O(ctx), nr: 'A-0041', status: 'offen', quelle: 'online', verkaeufer_art: 'privat', verkaeufer_name: 'Stefan Lang', verkaeufer_email: 'stefan.lang@example.com',
      marke: 'Mini', modell: 'Cooper S', variante: 'Countryman ALL4', fin: demoFin('WMW', 40), erstzulassung: ezVor(ctx.heute, 1900), km_stand: 61000, leistung_kw: 141, kraftstoff: 'Benzin', farbe: 'British Racing Green',
      vorbesitzer: 1, serviceheft: 'lueckenlos', unfall_angabe: 'keine_bekannt', pruefung: {}, schaeden: [], notiz: `Online-Ankaufformular, Bewertung offen · ${FACH_NOTIZ}` },
    { ...O(ctx), nr: 'A-0040', status: 'angeboten', quelle: 'inzahlungnahme', verkaeufer_art: 'privat', verkaeufer_name: 'Laura Fischer', ausweis_geprueft: true,
      marke: 'Land Rover', modell: 'Range Rover Evoque', variante: 'P200', fin: demoFin('SAL', 41), erstzulassung: ezVor(ctx.heute, 2300), km_stand: 78500, leistung_kw: 147, kraftstoff: 'Benzin', farbe: 'Fuji White',
      vorbesitzer: 2, hu_bis: tagPlus(ctx.heute, 300), schluessel: 2, serviceheft: 'teilweise', unfall_angabe: 'keine_bekannt', pruefung: teils,
      schaeden: [{ id: 's1', bereich: 'Felge vorn rechts', art: 'felge', stufe: 'leicht', kosten: null, notiz: 'Bordsteinkratzer', fotos: [] }, { id: 's2', bereich: 'Tür hinten links', art: 'delle', stufe: 'mittel', kosten: 250, notiz: '', fotos: [] }],
      ziel_vk: 27900, aufbereitung: 420, sonstige_kosten: 150, standtage_plan: 60, marge: 2500, angebot: 19800, notiz: `Inzahlungnahme zum Defender angefragt · ${FACH_NOTIZ}` },
    { ...O(ctx), nr: 'A-0038', status: 'angekauft', quelle: 'hof', verkaeufer_art: 'privat', verkaeufer_name: 'Martin Vogel', ausweis_geprueft: true,
      marke: 'Volkswagen', modell: 'Golf 8 GTI', variante: 'Clubsport', fin: demoFin('WVW', 4), erstzulassung: ezVor(ctx.heute, 1050), km_stand: 27850, leistung_kw: 221, kraftstoff: 'Benzin', farbe: 'Kings Red',
      vorbesitzer: 1, hu_bis: tagPlus(ctx.heute, 520), schluessel: 2, serviceheft: 'lueckenlos', unfall_angabe: 'keine_bekannt', pruefung: alleOk, schaeden: [],
      ziel_vk: 35990, aufbereitung: 420, sonstige_kosten: 0, standtage_plan: 45, marge: 3000, angebot: 31400, ankaufpreis: 31400, angekauft_am: tagPlus(ctx.heute, -38),
      bestand_id: bestandId(ctx, 4), notiz: FACH_NOTIZ },
  ];
}

function verkaeufe(ctx: XxlKontext): SeedZeile[] {
  const z: SeedZeile[] = [];
  const b1 = bestandId(ctx, 1), b12 = bestandId(ctx, 12), b9 = bestandId(ctx, 9);
  if (b1) z.push({
    ...O(ctx), bestand_id: b1, nr: 'V-0027', status: 'reserviert', kaeufer_art: 'verbraucher', kaeufer_name: 'Thomas Wagner', kaeufer_anschrift: 'Beispielstraße 12\n71063 Sindelfingen',
    kaeufer_email: 'thomas.wagner@example.com', kontakt_id: nimm(ctx, 'kontakte', 0), ausweis_geprueft: true, preis_brutto: 66490,
    zusatz: [{ text: 'Zulassung und Kennzeichen', betrag: 190 }, { text: 'Fußmatten-Set AMG', betrag: 129 }],
    anzahlung: 2000, anzahlung_am: tagPlus(ctx.heute, -47), anzahlung_art: 'ueberweisung', rest_art: 'finanzierung',
    gewaehr: 'gesetzlich', reserviert_bis: tagPlus(ctx.heute, 5), liefertermin: tagPlus(ctx.heute, 4), lieferung: 'inland',
    vereinbarungen: 'Übergabe mit neuer HU und vollem Tank (Beispiel).',
  });
  if (b12) z.push({
    ...O(ctx), bestand_id: b12, nr: 'V-0026', status: 'uebergeben', kaeufer_art: 'verbraucher', kaeufer_name: 'Claudia Becker', kaeufer_anschrift: 'Musterweg 5\n71032 Böblingen',
    kaeufer_email: 'claudia.becker@example.com', kontakt_id: nimm(ctx, 'kontakte', 1), ausweis_geprueft: true, preis_brutto: 23200,
    zusatz: [{ text: 'Zulassung und Kennzeichen', betrag: 190 }], rest_art: 'ueberweisung',
    gewaehr: 'ein_jahr', gewaehr_gesondert: true, vertrag_am: tagPlus(ctx.heute, -19), liefertermin: tagPlus(ctx.heute, -15),
    uebergabe_am: tagPlus(ctx.heute, -15), km_uebergabe: 88412, schluessel: 2,
    papiere: ['Zulassungsbescheinigung Teil I', 'Zulassungsbescheinigung Teil II', 'Serviceheft / Wartungsnachweise', 'Bericht der letzten Hauptuntersuchung'], lieferung: 'inland',
  });
  if (b9) z.push({
    ...O(ctx), bestand_id: b9, nr: 'V-0028', status: 'angebot', kaeufer_art: 'verbraucher', kaeufer_name: 'Laura Fischer', kaeufer_email: 'laura.fischer@example.com',
    kontakt_id: nimm(ctx, 'kontakte', 7), preis_brutto: 75900, zusatz: [{ text: 'Überführung', betrag: 0 }].filter((x) => x.betrag > 0),
    gewaehr: 'gesetzlich', angebot_gueltig_bis: tagPlus(ctx.heute, 10), lieferung: 'inland',
    vereinbarungen: 'Inzahlungnahme Range Rover Evoque mit 19.800 € angeboten (Ankauf A-0040).',
  });
  return z;
}

// ---------------------------------------------------------------------------
// Werkstatt
// ---------------------------------------------------------------------------
/** [FIN-Präfix, FIN-Nummer, Kennzeichen, Hersteller, Modell, Kraftstoff, Kunde (KUNDEN-Index), km] — der Octavia ist derselbe Wagen wie H-1053 (gleiche FIN: „aus der Werkstatt bekannt"). */
const WERKSTATT_FZ = [
  ['WVW', 60, 'BB-SN 77', 'Volkswagen', 'Golf 7 Variant', 'Diesel', 5, 112400],
  ['W1V', 61, 'BB-SE 301', 'Mercedes-Benz', 'Vito 116 CDI', 'Diesel', 2, 184200],
  ['W1V', 62, 'BB-SE 302', 'Mercedes-Benz', 'Sprinter 314 CDI', 'Diesel', 2, 96800],
  ['TMB', 12, 'BB-CB 616', 'Skoda', 'Octavia Combi RS', 'Diesel', 1, 88412],
] as const;

const halter = (k: number) => KUNDEN[k][2] ?? `${KUNDEN[k][0]} ${KUNDEN[k][1]}`;

function werkstattFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  return WERKSTATT_FZ.map((f, i) => ({
    ...O(ctx), fin: demoFin(f[0], f[1]), kennzeichen: f[2], hersteller: f[3], modell: f[4], kraftstoff: f[5],
    erstzulassung: ezVor(ctx.heute, 1400 + i * 300), kontakt_id: nimm(ctx, 'kontakte', f[6]),
    halter_name: halter(f[6]), naechste_hu: tagPlus(ctx.heute, 20 + i * 70), notiz: FACH_NOTIZ,
  }));
}

function fahrzeugakte(ctx: XxlKontext): SeedZeile[] {
  return WERKSTATT_FZ.map((f, i) => ({
    ...O(ctx), kontakt_id: nimm(ctx, 'kontakte', f[6]), halter: halter(f[6]),
    kennzeichen: f[2], marke: f[3], modell: f[4], vin: demoFin(f[0], f[1]), erstzulassung: ezVor(ctx.heute, 1400 + i * 300),
    hu_faellig: tagPlus(ctx.heute, 20 + i * 70), au_faellig: tagPlus(ctx.heute, 20 + i * 70), km_stand: f[7], notiz: FACH_NOTIZ,
  }));
}

const AUFTRAEGE = [
  { fz: 0, t: 'Inspektion mit Ölwechsel', a: 'Service fällig laut Anzeige', ma: 4, kva: 'kein_kva', pos: [['Inspektion nach Herstellervorgabe', 'leistung', 1.5, 118], ['Motoröl 5W-30', 'material', 5, 16.9], ['Ölfilter', 'material', 1, 14.5]] },
  { fz: 1, t: 'Bremsen vorne und hinten', a: 'Quietscht beim Bremsen, HU nächsten Monat', ma: 4, kva: 'kva_offen', pos: [['Bremsscheiben und Beläge wechseln, vorn und hinten', 'leistung', 2.4, 118], ['Bremsscheiben-Satz vorn', 'material', 1, 189], ['Bremsscheiben-Satz hinten', 'material', 1, 164]] },
  { fz: 2, t: 'HU/AU mit Vorabprüfung', a: 'Flottenfahrzeug, HU fällig', ma: 3, kva: 'kein_kva', pos: [['HU/AU über Prüforganisation', 'leistung', 1, 149], ['Vorabprüfung', 'leistung', 0.5, 118]] },
  { fz: null, t: 'Aufbereitung RS 6 für den Verkauf', a: 'Interne Aufbereitung Handelsfahrzeug H-1044', ma: 4, kva: 'kein_kva', bestand: 3, pos: [['Komplettaufbereitung innen und außen', 'leistung', 6, 65], ['Bremsen hinten', 'leistung', 1.5, 118]] },
] as const;

function werkstattAuftraege(ctx: XxlKontext): SeedZeile[] {
  return AUFTRAEGE.map((w, i) => {
    const fz = w.fz === null ? null : WERKSTATT_FZ[w.fz];
    return {
      ...O(ctx), kontakt_id: fz ? nimm(ctx, 'kontakte', fz[6]) : null, fahrzeug_id: w.fz === null ? null : nimm(ctx, 'werkstatt_fahrzeuge', w.fz),
      zustaendig_mitarbeiter_id: nimm(ctx, 'mitarbeiter', w.ma), nummer: `WA-2026-${String(311 + i).padStart(4, '0')}`, titel: w.t, beschreibung: FACH_NOTIZ,
      kunde_name: fz ? halter(fz[6]) : 'Autohaus intern', kennzeichen: fz ? fz[2] : null, kilometerstand: fz ? fz[7] : FAHRZEUGE[3][7],
      kundenanliegen: w.a, zugesagt_am: tagPlus(ctx.heute, 1 + i), freigabe_status: w.kva,
      kfz_bestand_id: 'bestand' in w ? bestandId(ctx, w.bestand) : null,
    };
  });
}

function werkstattPositionen(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  (ctx.ids.werkstatt_auftraege || []).forEach((aId, i) => {
    const w = AUFTRAEGE[i];
    if (!w) return;
    for (const p of w.pos) {
      aus.push({ ...O(ctx), auftrag_id: aId, art: p[1], bezeichnung: p[0], erfassungsart: p[1] === 'leistung' ? 'stunden' : 'stueck', menge: p[2], einzelpreis_netto: p[3], einheit: p[1] === 'leistung' ? 'Std' : 'Stk' });
    }
  });
  return aus;
}

// ---------------------------------------------------------------------------
// Ersatz- und Mietwagen
// ---------------------------------------------------------------------------
function mietEinstellung(ctx: XxlKontext): SeedZeile[] {
  return [{ ...O(ctx), kulanz_minuten: 30, mietbedingungen: 'Beispiel: Hier stehen die eigenen Mietbedingungen des Betriebs. ARGONAUT liefert bewusst keinen Mustertext — bitte den eigenen, anwaltlich geprüften Text eintragen.' }];
}

export const MIETFLOTTE = [
  { bezeichnung: 'VW Polo 1.0 TSI (Ersatzwagen)', kennzeichen: 'BB-AR 501', art: 'pkw', tag: 3900, woche: 21900, frei: 200, mehr: 25, kaution: 30000, alter: 21, jahre: 1, zf: 900, tank: 1200, km: 21400 },
  { bezeichnung: 'Mercedes-Benz Vito Tourer (9 Sitze)', kennzeichen: 'BB-AR 502', art: 'transporter', tag: 8900, woche: 49900, frei: 250, mehr: 30, kaution: 80000, alter: 23, jahre: 2, zf: 1200, tank: 1800, km: 48700 },
  { bezeichnung: 'Porsche Taycan 4S', kennzeichen: 'BB-AR 504', art: 'luxus', tag: 29900, woche: 169000, frei: 150, mehr: 90, kaution: 250000, alter: 25, jahre: 3, zf: 2500, tank: 0, km: 15900 },
] as const;

function mietFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  return MIETFLOTTE.map((m) => ({
    ...O(ctx), bezeichnung: m.bezeichnung, kennzeichen: m.kennzeichen, art: m.art, fs_klasse: 'B', tagessatz_cent: m.tag, wochensatz_cent: m.woche,
    frei_km_tag: m.frei, mehr_km_cent: m.mehr, kaution_cent: m.kaution, mindestalter: m.alter, fs_jahre_min: m.jahre,
    zusatzfahrer_tag_cent: m.zf, tank_achtel_cent: m.tank, km_stand: m.km, aktiv: true, notiz: FACH_NOTIZ,
  }));
}

function mietBuchungen(ctx: XxlKontext): SeedZeile[] {
  const f = (i: number) => nimm(ctx, 'miet_fahrzeug', i);
  const B = [
    { fz: 0, name: 'Sabine Neumann', kt: 5, von: 1, h1: '08:00', bis: 2, h2: '18:00', notiz: 'Ersatzwagen während der Inspektion (WA-2026-0311).' },
    { fz: 1, name: 'Familie Roth', von: 6, h1: '09:00', bis: 13, h2: '18:00', notiz: 'Urlaubsfahrt, 9 Sitze.' },
    { fz: 2, name: 'Robert Schmid', kt: 2, von: 9, h1: '10:00', bis: 11, h2: '10:00', notiz: 'Wochenende, Kaution über Zahlungsanbieter.' },
  ];
  return B.flatMap((b) => {
    const fz = f(b.fz);
    return fz ? [{
      ...O(ctx), fahrzeug_id: fz, kontakt_id: b.kt === undefined ? null : nimm(ctx, 'kontakte', b.kt), mieter_name: b.name,
      abholung: berlinZeit(tagPlus(ctx.heute, b.von), b.h1), rueckgabe_plan: berlinZeit(tagPlus(ctx.heute, b.bis), b.h2),
      status: 'reserviert', kaution_art: b.fz === 2 ? 'zahlungsanbieter' : 'keine', notiz: `${b.notiz} · ${FACH_NOTIZ}`,
    }] : [];
  });
}

// ---------------------------------------------------------------------------
// Termine und Einstellungen
// ---------------------------------------------------------------------------
function termine(ctx: XxlKontext): SeedZeile[] {
  const T = [
    { t: 2, b: '10:00', e: '11:00', titel: 'Probefahrt Defender – Laura Fischer', kt: 7, ort: 'Autohaus' },
    { t: 4, b: '15:00', e: '16:00', titel: 'Fahrzeugübergabe GLE 450 – Thomas Wagner', kt: 0, ort: 'Übergaberaum' },
    { t: 1, b: '08:00', e: '08:15', titel: 'Werkstatt-Annahme Golf Variant – Sabine Neumann', kt: 5, ort: 'Werkstatt' },
    { t: 3, b: '09:00', e: '09:30', titel: 'Zulassungsstelle Böblingen (GLE)', kt: null, ort: 'Zulassungsstelle' },
    { t: 7, b: '14:00', e: '15:00', titel: 'Bewertung Inzahlungnahme Evoque', kt: 7, ort: 'Hof' },
    { t: -1, b: '16:00', e: '17:00', titel: 'Probefahrt Porsche 911 – Elena Hoffmann', kt: 3, ort: 'Autohaus' },
  ];
  return T.map((x) => {
    const datum = tagPlus(ctx.heute, x.t);
    return {
      ...O(ctx), standort_id: null, titel: x.titel, beginn_am: berlinZeit(datum, x.b), ende_am: berlinZeit(datum, x.e), ort: x.ort,
      status: 'geplant', kunde_email: null, erinnerung_min: null,
      kontakt_id: x.kt === null ? null : nimm(ctx, 'kontakte', x.kt), notiz: FACH_NOTIZ, ressource: null,
    };
  });
}

function einstellungen(ctx: XxlKontext): SeedZeile[] {
  return [{ ...O(ctx), modul: 'kfz-kalk', einstellung: { gemeinkostenProzent: 6 } }];
}

// ---------------------------------------------------------------------------
// Reihenfolge, Löschen
// ---------------------------------------------------------------------------
const S = (key: string, tabelle: string, baue: (ctx: XxlKontext) => SeedZeile[], ohneId = false): FachSeeder => ({ key, tabelle, baue, ohneId });

/** Eltern vor Kindern. */
export const KFZ_FACH_SEEDER: FachSeeder[] = [
  S('team', 'mitarbeiter', team),
  S('kunden', 'kontakte', kunden),
  S('kfz_bestand', 'kfz_bestand', bestand),
  S('kfz_bestand_kalk', 'kfz_bestand_kalk', kalk, true),
  S('kfz_bestand_kosten', 'kfz_bestand_kosten', kosten),
  S('kfz_marktvergleich', 'kfz_marktvergleich', marktvergleich),
  S('kfz_anfrage', 'kfz_anfrage', anfragen),
  S('kfz_suchauftrag', 'kfz_suchauftrag', suchauftraege),
  S('kfz_rote_kennzeichen', 'kfz_rote_kennzeichen', roteKennzeichen),
  S('kfz_probefahrt', 'kfz_probefahrt', probefahrten),
  S('kfz_tresor', 'kfz_tresor', tresor),
  S('kfz_zulassung', 'kfz_zulassung', zulassungen),
  S('kfz_ankauf', 'kfz_ankauf', ankaeufe),
  S('kfz_verkauf', 'kfz_verkauf', verkaeufe),
  S('werkstatt_fahrzeuge', 'werkstatt_fahrzeuge', werkstattFahrzeuge),
  S('kfz_fahrzeuge', 'kfz_fahrzeuge', fahrzeugakte),
  S('werkstatt_auftraege', 'werkstatt_auftraege', werkstattAuftraege),
  S('werkstatt_positionen', 'werkstatt_positionen', werkstattPositionen),
  S('miet_einstellung', 'miet_einstellung', mietEinstellung, true),
  S('miet_fahrzeug', 'miet_fahrzeug', mietFahrzeuge),
  S('miet_buchung', 'miet_buchung', mietBuchungen),
  S('termine', 'termine', termine),
  S('modul_einstellung', 'modul_einstellung', einstellungen),
];

/** Kinder vor Eltern (vor der Übungswelt-Reihenfolge, die mit den Kontakten endet). */
export const KFZ_FACH_LOESCH_ORDER: string[] = [
  'miet_buchung', 'miet_fahrzeug', 'werkstatt_positionen', 'werkstatt_auftraege', 'werkstatt_fahrzeuge', 'kfz_fahrzeuge',
  'kfz_verkauf', 'kfz_ankauf', 'kfz_zulassung', 'kfz_tresor', 'kfz_probefahrt', 'kfz_rote_kennzeichen', 'kfz_suchauftrag',
  'kfz_anfrage', 'kfz_marktvergleich', 'kfz_bestand_kosten', 'kfz_bestand', 'termine', 'modul_einstellung', 'mitarbeiter',
];

/** Tabellen ohne `id`, die beim Zurücksetzen über den Besitzer geleert werden (nur das Vorführ-Konto). */
export const KFZ_FACH_BESITZER_TABELLEN: string[] = ['miet_einstellung'];

/** Fachdaten je Vorführ-Betrieb (slug aus lib/demoBetriebe). */
export const FACHDATEN: Record<string, { seeder: FachSeeder[]; loeschOrder: string[]; besitzerTabellen: string[] }> = {
  autohaus: { seeder: KFZ_FACH_SEEDER, loeschOrder: KFZ_FACH_LOESCH_ORDER, besitzerTabellen: KFZ_FACH_BESITZER_TABELLEN },
  // Paket 298: Premium-Autohaus, ein Jahr im Betrieb (50 Mitarbeiter, Media-Abteilung)
  premium: { seeder: PREMIUM_SEEDER, loeschOrder: PREMIUM_LOESCH_ORDER, besitzerTabellen: PREMIUM_BESITZER_TABELLEN },
  // Paket 300: Stufe 3 der Zeitreise je Branche (lib/demoWachstum nach lib/demoWachstumProfile)
  ...Object.fromEntries(WACHSTUM_PROFILE.map((p) => [p.slug, { seeder: wachstumSeeder(p), loeschOrder: wachstumLoeschOrder(), besitzerTabellen: [] as string[] }])),
};

/** Sind die Fachdaten schon geladen? (Register enthält eine Zeile aus der Leit-Tabelle) */
export const FACH_LEITTABELLE: Record<string, string> = {
  autohaus: 'kfz_bestand', premium: 'kfz_bestand',
  // Paket 300: Mitarbeiter legt die Übungswelt nie an — eindeutiges Zeichen „Fachdaten geladen“
  ...Object.fromEntries(WACHSTUM_PROFILE.map((p) => [p.slug, 'mitarbeiter'])),
};
