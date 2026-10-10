// ============================================================================
// ARGONAUT OS · lib/demoFachdatenKfzPremium.ts — Paket 298: Premium-Autohaus,
// ein Jahr im Betrieb
//
// Zweiter Kfz-Vorführ-Betrieb neben dem Autohaus Renz (P297): „Valtier
// Automobile" zeigt, wie ARGONAUT aussieht, wenn ein großer Premium-Händler es
// seit über einem Jahr täglich benutzt —
//
//   · 50 Mitarbeiter in Abteilungen: 2 Geschäftsführer, Vertrieb (15), Media
//     (Leitung, 2 Videocutter, Fotograf, Social Media), Werkstatt/Service (14),
//     Aufbereitung, Teile, Zulassung/Disposition, Buchhaltung, Empfang
//   · ca. 120 Fahrzeuge im Bestand (Porsche, Mercedes-AMG, BMW M, Audi RS,
//     Bentley, Range Rover, Lamborghini, Ferrari, Aston Martin, Maserati …)
//     vom Zulauf über Aufbereitung bis reserviert, mit Langstehern
//   · rund 500 Verkäufe über 21 Monate mit wachsender Kurve — der Chef-Blick
//     zeigt jeden Monat gegen das Vorjahr, Verkäufer-Rangliste, Marken
//   · Anfragen, Probefahrten, Ankäufe, Kaufverträge, Zulassungen, Tresor,
//     Werkstatt mit Kundenfahrzeugen aus dem eigenen Verkauf, Ersatz- und
//     Erlebnis-Mietwagen, Termine, Urlaubsplan
//   · Media-Abteilung: Kampagnen, Inhalte-Bibliothek (Walkaround-Videos,
//     Reels, Fahrzeugvorstellungen), Redaktionskalender, Social-Entwürfe,
//     Schnitt- und Dreh-Aufgaben der Videocutter
//
// Bewusst NICHT: echte Foto- und Videodateien (die kann man nicht erfinden —
// Fotos am Fahrzeug lädt man vor dem Termin selbst hoch), Rechnungen (Kern-
// Geld, erzeugt man live per Knopf), Partner-Netzwerk (unlöschbar), Börse.
//
// Alles ist erfunden; E-Mail-Adressen liegen auf example.com. Gleiche Zahlen
// bei jedem Lauf: ein fester Zufallsgenerator (Startwert), Zeit nur über
// `heute`. Reine Logik, node-getestet (tests/demoFachdatenKfzPremiumP298).
// ============================================================================

import { tagPlus, berlinZeit, type XxlKontext } from './musterbetriebXxl';
import { PRUEF_KEYS } from './kfzAnkauf';
import type { SeedZeile } from './uebungswelt';
import type { FachSeeder } from './demoFachdatenKfz';

/** Markierung in Notizfeldern. */
export const PREMIUM_NOTIZ = 'Beispiel-Datensatz · Premium-Autohaus';
const QUELLE = 'Beispiel';

// ---------------------------------------------------------------------------
// Fester Zufall: gleiche Daten bei jedem Lauf und in jedem Test
// ---------------------------------------------------------------------------
export function zufall(startwert: number): () => number {
  let a = startwert >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ganz = (r: () => number, von: number, bis: number) => von + Math.floor(r() * (bis - von + 1));
const eins = <T,>(r: () => number, l: readonly T[]): T => l[Math.floor(r() * l.length)];

/** Wochentag 0 = Sonntag … 6 = Samstag (UTC-Mittag, zeitzonenfest). */
export function wochentag(tag: string): number {
  return new Date(`${tag}T12:00:00Z`).getUTCDay();
}
/** Erster des Monats `tage` vor dem Bezugstag. */
const monatsErster = (bezug: string, tage: number) => tagPlus(bezug, -tage).slice(0, 8) + '01';

// ---------------------------------------------------------------------------
// Team: 50 Personen in Abteilungen
// ---------------------------------------------------------------------------
type Person = { vorname: string; nachname: string; position: string; abteilung: string; eintritt: number; std?: number };
const P = (abteilung: string, position: string, vorname: string, nachname: string, eintritt: number, std = 40): Person =>
  ({ vorname, nachname, position, abteilung, eintritt, std });

export const TEAM: Person[] = [
  P('Geschäftsführung', 'Geschäftsführerin', 'Katharina', 'Valtier', -5400),
  P('Geschäftsführung', 'Geschäftsführer', 'Florian', 'Mertens', -3900),
  // Vertrieb (15)
  P('Vertrieb', 'Verkaufsleiter', 'Alexander', 'Reinhold', -3300),
  P('Vertrieb', 'Verkaufsleiterin Gebrauchtwagen', 'Nadine', 'Kurz', -2600),
  P('Vertrieb', 'Verkaufsberater Porsche', 'Sebastian', 'Lorenz', -2100),
  P('Vertrieb', 'Verkaufsberaterin Mercedes-AMG', 'Melanie', 'Fuchs', -1900),
  P('Vertrieb', 'Verkaufsberater BMW M', 'Tobias', 'Engel', -1500),
  P('Vertrieb', 'Verkaufsberater Audi Sport', 'Kevin', 'Albrecht', -1200),
  P('Vertrieb', 'Verkaufsberater Exklusiv', 'Marco', 'De Luca', -2800),
  P('Vertrieb', 'Verkaufsberaterin', 'Lisa', 'Brenner', -900),
  P('Vertrieb', 'Verkaufsberater', 'Daniel', 'Vogt', -700),
  P('Vertrieb', 'Verkaufsberater', 'Emre', 'Aydin', -420),
  P('Vertrieb', 'Key-Account Gewerbekunden', 'Christian', 'Haas', -2400),
  P('Vertrieb', 'Key-Account Gewerbekunden', 'Stefanie', 'Wolf', -1100),
  P('Vertrieb', 'Online-Vertrieb und Anfragen', 'Jana', 'Seidel', -600),
  P('Vertrieb', 'Verkaufsassistenz', 'Nicole', 'Hartmann', -1700, 30),
  P('Vertrieb', 'Verkaufsassistenz', 'Patrick', 'Graf', -350),
  // Media (5)
  P('Media', 'Leitung Media und Marketing', 'Vanessa', 'Roth', -1400),
  P('Media', 'Videocutter', 'Leon', 'Kaiser', -800),
  P('Media', 'Videocutterin', 'Mia', 'Schuster', -500),
  P('Media', 'Fahrzeugfotograf', 'Jonas', 'Pohl', -1000),
  P('Media', 'Social-Media-Redakteurin', 'Sophie', 'Krämer', -450, 30),
  // Werkstatt und Service (14)
  P('Werkstatt', 'Serviceleiter', 'Ralf', 'Stein', -4100),
  P('Werkstatt', 'Werkstattmeister', 'Uwe', 'Frank', -4600),
  P('Werkstatt', 'Serviceberaterin', 'Katrin', 'Busch', -1600),
  P('Werkstatt', 'Serviceberater', 'Philipp', 'Lang', -1300),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Dominik', 'Weiß', -2500),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Sven', 'Ludwig', -2000),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Mehmet', 'Kaya', -1800),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Florian', 'Arnold', -1350),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Niklas', 'Jäger', -950),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Marcel', 'Günther', -700),
  P('Werkstatt', 'Kfz-Mechatroniker', 'Andreas', 'Ernst', -3000),
  P('Werkstatt', 'Hochvolt-Techniker', 'Tim', 'Böhm', -880),
  P('Werkstatt', 'Auszubildender Kfz-Mechatronik', 'Luis', 'Sommer', -400),
  P('Werkstatt', 'Auszubildende Kfz-Mechatronik', 'Emily', 'Franke', -40),
  // Aufbereitung (4)
  P('Aufbereitung', 'Leitung Aufbereitung', 'Goran', 'Petrović', -2900),
  P('Aufbereitung', 'Fahrzeugaufbereiter', 'Ali', 'Demir', -1500),
  P('Aufbereitung', 'Fahrzeugaufbereiter', 'Kai', 'Möller', -1000),
  P('Aufbereitung', 'Fahrzeugaufbereiterin', 'Jessica', 'Simon', -520),
  // Teile und Lager (3)
  P('Teile und Lager', 'Teiledienstleiter', 'Bernd', 'Krause', -3600),
  P('Teile und Lager', 'Lagerist', 'Viktor', 'Neumann', -1250),
  P('Teile und Lager', 'Lageristin', 'Sarah', 'Werner', -610, 30),
  // Zulassung und Disposition (3)
  P('Zulassung und Disposition', 'Leitung Disposition', 'Claudia', 'Schmitt', -2700),
  P('Zulassung und Disposition', 'Zulassungsdienst', 'Oliver', 'Beck', -1650),
  P('Zulassung und Disposition', 'Fahrzeugdisposition und Überführung', 'Yusuf', 'Öztürk', -740),
  // Buchhaltung und Verwaltung (3)
  P('Buchhaltung und Verwaltung', 'Leitung Finanzen', 'Petra', 'Zimmermann', -4300),
  P('Buchhaltung und Verwaltung', 'Buchhalterin', 'Monika', 'Huber', -2200, 30),
  P('Buchhaltung und Verwaltung', 'Personal und Verwaltung', 'Sandra', 'Kühn', -1450),
  // Empfang (1)
  P('Empfang', 'Empfang und Telefonzentrale', 'Laura', 'Meier', -800, 30),
];

/** Index-Gruppen im TEAM (stabil, damit Verweise passen). */
const idx = (abt: string, posTeil?: string) =>
  TEAM.map((m, i) => ({ m, i })).filter(({ m }) => m.abteilung === abt && (!posTeil || m.position.includes(posTeil))).map(({ i }) => i);
export const VERKAEUFER_IDX = idx('Vertrieb').filter((i) => !TEAM[i].position.startsWith('Verkaufsassistenz') && !TEAM[i].position.startsWith('Online'));
const MEDIA_IDX = idx('Media');
const MECHANIKER_IDX = idx('Werkstatt', 'Mechatroniker').concat(idx('Werkstatt', 'Hochvolt'));
const SERVICE_IDX = idx('Werkstatt', 'Serviceberater');
const name = (i: number) => `${TEAM[i].vorname} ${TEAM[i].nachname}`;
const kurz = (i: number) => `${TEAM[i].vorname[0]}. ${TEAM[i].nachname}`;
const ascii = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/ć/g, 'c').replace(/[^a-z0-9.]+/g, '');
const mail = (v: string, n: string) => `${ascii(v)}.${ascii(n)}@example.com`;

function team(ctx: XxlKontext): SeedZeile[] {
  return TEAM.map((m) => ({
    owner_user_id: ctx.uid, standort_id: null, vorname: m.vorname, nachname: m.nachname,
    email: mail(m.vorname, m.nachname), telefon: null, position: m.position, abteilung: m.abteilung, status: 'aktiv',
    eintrittsdatum: tagPlus(ctx.heute, m.eintritt), arbeitszeit_modell: (m.std ?? 40) < 40 ? 'teilzeit' : 'vollzeit',
    wochenstunden: m.std ?? 40, urlaubsanspruch_tage: 30,
  }));
}

// ---------------------------------------------------------------------------
// Modelle (Premium)
// ---------------------------------------------------------------------------
/** [Marke, Modell, Variante, Kraftstoff, kW, Neupreis-Basis brutto, FIN-Präfix, Sparte, Gewicht] */
export const MODELLE = [
  ['Porsche', '911 Carrera S', '992, PDK', 'Benzin', 353, 164000, 'WP0', 'Pkw', 9],
  ['Porsche', '911 Turbo S', '992, PDK', 'Benzin', 478, 239000, 'WP0', 'Pkw', 4],
  ['Porsche', '911 GT3', '992, Touring-Paket', 'Benzin', 375, 219000, 'WP0', 'Pkw', 2],
  ['Porsche', 'Taycan 4S', 'Sport Turismo', 'Elektro', 420, 129000, 'WP0', 'Pkw', 5],
  ['Porsche', 'Cayenne E-Hybrid', 'Coupé', 'Benzin, Plug-in-Hybrid', 346, 118000, 'WP1', 'Pkw', 8],
  ['Porsche', 'Macan GTS', null, 'Benzin', 324, 98000, 'WP1', 'Pkw', 7],
  ['Porsche', 'Panamera 4 E-Hybrid', 'Sport Turismo', 'Benzin, Plug-in-Hybrid', 345, 139000, 'WP0', 'Pkw', 4],
  ['Mercedes-AMG', 'C 63 S E PERFORMANCE', 'T-Modell', 'Benzin, Plug-in-Hybrid', 500, 119000, 'W1K', 'Pkw', 5],
  ['Mercedes-AMG', 'E 53 HYBRID 4MATIC+', 'Limousine', 'Benzin, Plug-in-Hybrid', 430, 104000, 'W1K', 'Pkw', 5],
  ['Mercedes-AMG', 'G 63', 'Night-Paket', 'Benzin', 430, 219000, 'W1N', 'Pkw', 5],
  ['Mercedes-AMG', 'GLE 63 S 4MATIC+', 'Coupé', 'Benzin, Mild-Hybrid', 450, 159000, 'W1N', 'Pkw', 4],
  ['Mercedes-AMG', 'GT 63 4MATIC+', 'Coupé', 'Benzin', 430, 189000, 'W1K', 'Pkw', 3],
  ['Mercedes-Benz', 'S 580 4MATIC', 'lang', 'Benzin, Mild-Hybrid', 370, 159000, 'W1K', 'Pkw', 4],
  ['Mercedes-Benz', 'EQS 580 4MATIC', 'AMG Line', 'Elektro', 385, 139000, 'W1K', 'Pkw', 3],
  ['BMW', 'M3 Competition', 'Touring xDrive', 'Benzin', 375, 104000, 'WBS', 'Pkw', 6],
  ['BMW', 'M4 Competition', 'Coupé xDrive', 'Benzin', 390, 99000, 'WBS', 'Pkw', 5],
  ['BMW', 'M5', 'Limousine', 'Benzin, Plug-in-Hybrid', 535, 149000, 'WBS', 'Pkw', 3],
  ['BMW', 'X5 M Competition', null, 'Benzin, Mild-Hybrid', 460, 159000, 'WBS', 'Pkw', 4],
  ['BMW', 'i7 xDrive60', 'M Sport', 'Elektro', 400, 139000, 'WBA', 'Pkw', 3],
  ['BMW', 'X7 M60i xDrive', null, 'Benzin, Mild-Hybrid', 390, 129000, 'WBA', 'Pkw', 3],
  ['Audi', 'RS 6 Avant', 'performance', 'Benzin', 463, 139000, 'WUA', 'Pkw', 7],
  ['Audi', 'RS 3 Sportback', null, 'Benzin', 294, 72000, 'WUA', 'Pkw', 5],
  ['Audi', 'RS Q8', 'performance', 'Benzin', 471, 159000, 'WU1', 'Pkw', 4],
  ['Audi', 'RS e-tron GT', 'performance', 'Elektro', 580, 159000, 'WAU', 'Pkw', 3],
  ['Audi', 'R8 V10', 'performance quattro', 'Benzin', 456, 189000, 'WUA', 'Pkw', 2],
  ['Bentley', 'Continental GT', 'Speed', 'Benzin, Plug-in-Hybrid', 575, 289000, 'SCB', 'Pkw', 2],
  ['Bentley', 'Bentayga', 'EWB Azure', 'Benzin', 404, 259000, 'SJA', 'Pkw', 2],
  ['Land Rover', 'Range Rover', 'P550e Autobiography', 'Benzin, Plug-in-Hybrid', 405, 189000, 'SAL', 'Pkw', 5],
  ['Land Rover', 'Range Rover Sport', 'SV', 'Benzin, Mild-Hybrid', 467, 199000, 'SAL', 'Pkw', 3],
  ['Land Rover', 'Defender 110', 'V8 Carpathian Edition', 'Benzin', 386, 159000, 'SAL', 'Pkw', 4],
  ['Lamborghini', 'Urus', 'S', 'Benzin', 490, 259000, 'ZPB', 'Pkw', 2],
  ['Ferrari', 'Roma', 'Spider', 'Benzin', 456, 259000, 'ZFF', 'Pkw', 1],
  ['Aston Martin', 'DBX707', null, 'Benzin', 520, 249000, 'SCF', 'Pkw', 1],
  ['Maserati', 'MC20', 'Cielo', 'Benzin', 463, 259000, 'ZAM', 'Pkw', 1],
  ['Maserati', 'Grecale', 'Trofeo', 'Benzin', 390, 119000, 'ZN6', 'Pkw', 2],
  ['Ducati', 'Panigale V4 S', null, 'Benzin', 158, 33000, 'ZDM', 'Motorrad', 2],
  ['BMW', 'M 1000 RR', 'M Competition', 'Benzin', 156, 38000, 'WB1', 'Motorrad', 1],
] as const;

const FARBEN = ['Tiefschwarz Metallic', 'Kreide', 'GT-Silber', 'Nardograu', 'Obsidianschwarz', 'Polarweiß', 'Carbonschwarz', 'Portimao Blau',
  'Isle of Man Grün', 'Mythosschwarz', 'Gentian Blau', 'Santoriniblau', 'Brooklyn Grau', 'Rosso Corsa', 'Verde Mantis', 'Kreide / Leder Bordeaux'];
const AUSSTATTUNG = ['Klimaautomatik 4-Zonen', 'Navigationssystem', 'Sitzbelüftung vorn', '360-Grad-Kamera', 'Matrix-LED-Scheinwerfer',
  'Adaptive Geschwindigkeitsregelung', 'Keyless Go', 'Head-up-Display', 'Panoramadach', 'Burmester- oder Bang & Olufsen-Soundsystem',
  'Carbon-Paket', 'Sportabgasanlage', 'Hinterachslenkung', 'Massagesitze', 'Nachtsicht-Assistent'];

/** Gültige Beispiel-FIN (17 Zeichen, ohne I/O/Q), je Fahrzeug eindeutig. */
export function premiumFin(praefix: string, i: number): string {
  return `${praefix}ZZZVALT${2000001 + i}`;
}

export type PremiumFz = {
  i: number; m: number; nr: string; status: 'zulauf' | 'aufbereitung' | 'bestand' | 'reserviert' | 'verkauft';
  ezTage: number; km: number; eingang: string | null; verkauft: string | null;
  ek: number; vk: number; erzielt: number | null; steuer: '25a' | 'regel';
  verkaeufer: number; hereinnehmer: number; farbe: string; kunde: number | null; vertrag: 'reserviert' | 'vertrag' | 'angebot' | null;
};

/** Verkaufspreis aus Neupreis, Alter und km — immer auf „…900" bzw. „…490" (premiumtypisch). */
function preisAus(basis: number, ezMonate: number, km: number, r: () => number): number {
  const f = Math.max(0.42, 0.95 - 0.105 * (ezMonate / 12) - km / 450000 + (r() - 0.5) * 0.05);
  const roh = basis * f;
  return roh >= 50000 ? Math.round(roh / 1000) * 1000 - 100 : Math.round(roh / 500) * 500 - 10;
}

/** Motorrad? (weniger km, kleinere Aufbereitung, keine Pkw-Kosten) */
const rad = (m: number) => MODELLE[m][7] === 'Motorrad';

function modellWahl(r: () => number): number {
  const summe = MODELLE.reduce((s, m) => s + m[8], 0);
  let x = r() * summe;
  for (let i = 0; i < MODELLE.length; i++) { x -= MODELLE[i][8]; if (x < 0) return i; }
  return 0;
}

/** Verkaufstage der letzten 21 Monate — wachsend, sonntags nie, samstags mehr. */
export const HISTORIE_TAGE = 640;

/**
 * Der komplette Fahrzeugplan (verkauft zuerst, nach Eingang sortiert; dann der
 * aktuelle Bestand). Alle Seeder lesen daraus — so passen Bestand, Kalkulation,
 * Verträge, Probefahrten und Werkstatt zusammen.
 */
export function fahrzeugPlan(heute: string): PremiumFz[] {
  const r = zufall(298);
  const verkauft: Omit<PremiumFz, 'i' | 'nr'>[] = [];
  for (let d = HISTORIE_TAGE; d >= 1; d--) {
    const tag = tagPlus(heute, -d);
    const wt = wochentag(tag);
    if (wt === 0) continue;
    const p = (0.95 - 0.45 * (d / HISTORIE_TAGE)) * (wt === 6 ? 1.25 : 1);
    const anzahl = (r() < p ? 1 : 0) + (r() < p * 0.22 ? 1 : 0);
    for (let k = 0; k < anzahl; k++) {
      const m = modellWahl(r);
      const ezMonate = ganz(r, 6, 48);
      const km = Math.max(1500, Math.round((ezMonate * (rad(m) ? ganz(r, 150, 350) : ganz(r, 700, 1500))) / 100) * 100);
      const standtage = Math.min(170, Math.round(8 + Math.pow(r(), 1.8) * 150));
      const vk = preisAus(MODELLE[m][5], ezMonate, km, r);
      const steuer: '25a' | 'regel' = r() < 0.6 ? 'regel' : '25a';
      const nachlass = Math.round((vk * (r() * 0.025)) / 100) * 100;
      verkauft.push({
        m, status: 'verkauft', ezTage: ezMonate * 30 + d, km, eingang: tagPlus(tag, -standtage), verkauft: tag,
        ek: ekAus(vk, steuer), vk, erzielt: vk - nachlass, steuer,
        verkaeufer: eins(r, VERKAEUFER_IDX), hereinnehmer: eins(r, VERKAEUFER_IDX), farbe: eins(r, FARBEN), kunde: null, vertrag: null,
      });
    }
  }
  verkauft.sort((a, b) => (a.eingang! < b.eingang! ? -1 : a.eingang! > b.eingang! ? 1 : 0));

  const aktuell: Omit<PremiumFz, 'i' | 'nr'>[] = [];
  const STATI: [PremiumFz['status'], number][] = [['zulauf', 10], ['aufbereitung', 12], ['reserviert', 13], ['bestand', 85]];
  let n = 0;
  for (const [status, wieviele] of STATI) {
    for (let k = 0; k < wieviele; k++, n++) {
      const m = modellWahl(r);
      const ezMonate = ganz(r, 4, 42);
      const km = Math.max(900, Math.round((ezMonate * (rad(m) ? ganz(r, 150, 350) : ganz(r, 650, 1400))) / 100) * 100);
      const vk = preisAus(MODELLE[m][5], ezMonate, km, r);
      const steuer: '25a' | 'regel' = r() < 0.6 ? 'regel' : '25a';
      // Standtage: ein Dutzend Langsteher (> 120 Tage), sonst frisch bis drei Monate
      const stand = status === 'zulauf' ? null : status === 'aufbereitung' ? ganz(r, 1, 14)
        : k < 12 && status === 'bestand' ? ganz(r, 125, 260) : ganz(r, 6, 100);
      aktuell.push({
        m, status, ezTage: ezMonate * 30, km, eingang: stand === null ? null : tagPlus(heute, -stand), verkauft: null,
        ek: ekAus(vk, steuer), vk, erzielt: null, steuer,
        verkaeufer: eins(r, VERKAEUFER_IDX), hereinnehmer: eins(r, VERKAEUFER_IDX), farbe: eins(r, FARBEN), kunde: null,
        vertrag: status === 'reserviert' ? (k < 3 ? 'vertrag' : 'reserviert') : status === 'bestand' && k >= 12 && k < 20 ? 'angebot' : null,
      });
    }
  }
  return [...verkauft, ...aktuell].map((f, i) => ({ ...f, i, nr: `H-${3001 + i}`, kunde: f.status === 'verkauft' ? i : null }));
}

/** Einkauf netto: Regelbesteuert aus dem Netto-VK, § 25a aus dem Brutto-VK — glatte Hunderter. */
function ekAus(vk: number, steuer: '25a' | 'regel'): number {
  const basis = steuer === 'regel' ? (vk / 1.19) * 0.87 : vk * 0.86;
  return Math.round(basis / 100) * 100;
}

// Plan je Kontext nur einmal rechnen
const PLAN_CACHE = new Map<string, PremiumFz[]>();
export function plan(heute: string): PremiumFz[] {
  let p = PLAN_CACHE.get(heute);
  if (!p) { p = fahrzeugPlan(heute); PLAN_CACHE.set(heute, p); }
  return p;
}
const verkaufte = (heute: string) => plan(heute).filter((f) => f.status === 'verkauft');
const imHaus = (heute: string) => plan(heute).filter((f) => f.status !== 'verkauft');
const tageHer = (heute: string, tag: string | null) => (tag ? Math.round((Date.parse(heute) - Date.parse(tag)) / 86400000) : 0);

const nimm = (ctx: XxlKontext, tabelle: string, i: number): string | null => {
  const l = ctx.ids[tabelle] || [];
  return i >= 0 && i < l.length ? l[i] : null;
};
const bestandId = (ctx: XxlKontext, f: PremiumFz) => nimm(ctx, 'kfz_bestand', f.i);
const maId = (ctx: XxlKontext, i: number) => nimm(ctx, 'mitarbeiter', i);

// ---------------------------------------------------------------------------
// Kunden: je verkauftem Fahrzeug der Käufer (Index = Fahrzeug-Index), danach Interessenten
// ---------------------------------------------------------------------------
const VORNAMEN = ['Thomas', 'Michael', 'Andreas', 'Stefan', 'Christian', 'Markus', 'Frank', 'Jürgen', 'Matthias', 'Oliver', 'Alexander', 'Martin',
  'Sabine', 'Claudia', 'Susanne', 'Petra', 'Andrea', 'Julia', 'Katrin', 'Nicole', 'Anja', 'Melanie', 'Carina', 'Isabel',
  'Maximilian', 'Felix', 'Benedikt', 'Moritz', 'Konstantin', 'Leonie', 'Charlotte', 'Valentina', 'Hakan', 'Luca', 'Nikolai', 'Elif'];
const NACHNAMEN = ['Bauer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Schröder', 'Neumann', 'Schwarz',
  'Braun', 'Hofmann', 'Hartmann', 'Lange', 'Schmitt', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Schmid', 'Schulze', 'Maier', 'Köhler',
  'Herrmann', 'König', 'Walter', 'Mayer', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Möller', 'Scholz', 'Weiß', 'Jung', 'Hahn', 'Vogel',
  'Friedrich', 'Keller', 'Günther', 'Frank', 'Berger', 'Winkler', 'Roth', 'Beck', 'Lorenz', 'Baumann', 'Franke', 'Albrecht', 'Ludwig'];
const FIRMEN = ['Kessler Bau GmbH', 'Hagenmüller Immobilien GmbH', 'Dr. Brandl Zahnärzte', 'Rieger Maschinenbau GmbH', 'Lindner Steuerberatung',
  'Weidle Logistik GmbH', 'Kanzlei Seibold und Partner', 'Ostertag Holding GmbH', 'Brecht Medizintechnik GmbH', 'Fritz Eventtechnik GmbH',
  'Ammann Architekten', 'Sailer Energie GmbH', 'Nägele Druck GmbH', 'Heim und Garten Pfleiderer KG', 'Mauch Software GmbH'];
const ORTE = ['Sindelfingen', 'Böblingen', 'Stuttgart', 'Leonberg', 'Herrenberg', 'Esslingen', 'Ludwigsburg', 'Tübingen', 'Reutlingen',
  'Calw', 'Waiblingen', 'Filderstadt', 'Leinfelden-Echterdingen', 'Holzgerlingen', 'Ehningen', 'Weil der Stadt', 'Nürtingen', 'Kirchheim unter Teck'];

export const INTERESSENTEN = 60;

export type Kunde = { vorname: string; nachname: string; firma: string | null; ort: string; status: 'kunde' | 'interessent' };
export function kundenListe(heute: string): Kunde[] {
  const r = zufall(2981);
  const aus: Kunde[] = [];
  const gesamt = verkaufte(heute).length + INTERESSENTEN;
  for (let i = 0; i < gesamt; i++) {
    const firma = r() < 0.15 ? FIRMEN[ganz(r, 0, FIRMEN.length - 1)] : null;
    aus.push({ vorname: eins(r, VORNAMEN), nachname: eins(r, NACHNAMEN), firma, ort: eins(r, ORTE), status: i < gesamt - INTERESSENTEN ? 'kunde' : 'interessent' });
  }
  return aus;
}
const kundeName = (k: Kunde) => `${k.vorname} ${k.nachname}`;
const kundeMail = (k: Kunde, i: number) => `${ascii(k.vorname)}.${ascii(k.nachname)}${i}@example.com`;

function kunden(ctx: XxlKontext): SeedZeile[] {
  const v = verkaufte(ctx.heute);
  return kundenListe(ctx.heute).map((k, i) => {
    const f = v[i];
    const modell = f ? `${MODELLE[f.m][0]} ${MODELLE[f.m][1]}` : null;
    return {
      owner_user_id: ctx.uid, vorname: k.vorname, nachname: k.nachname, firma: k.firma, ort: k.ort, telefon: null,
      email: kundeMail(k, i), status: k.status, quelle: QUELLE,
      notizen: f ? `Kauf ${modell} am ${f.verkauft} · ${PREMIUM_NOTIZ}` : `Interessent · ${PREMIUM_NOTIZ}`,
    };
  });
}
const kontaktVonVerkauf = (ctx: XxlKontext, f: PremiumFz) => nimm(ctx, 'kontakte', f.i); // verkaufte stehen vorn in derselben Reihenfolge
const interessent = (ctx: XxlKontext, j: number) => nimm(ctx, 'kontakte', verkaufte(ctx.heute).length + (j % INTERESSENTEN));
const interessentDaten = (heute: string, j: number) => {
  const l = kundenListe(heute);
  const n = verkaufte(heute).length + (j % INTERESSENTEN);
  return { k: l[n], n };
};

// ---------------------------------------------------------------------------
// Bestand, Kalkulation, Kosten, Marktvergleich
// ---------------------------------------------------------------------------
function bestand(ctx: XxlKontext): SeedZeile[] {
  return plan(ctx.heute).map((f) => {
    const M = MODELLE[f.m];
    const elektro = M[3] === 'Elektro';
    const zulauf = f.status === 'zulauf';
    const verkauft = f.status === 'verkauft';
    const r = zufall(5000 + f.i);
    const stark = M[4] > 400;
    return {
      owner_user_id: ctx.uid, interne_nr: f.nr, status: f.status, sparte: M[7], marke: M[0], modell: M[1], variante: M[2],
      fin: premiumFin(M[6], f.i), kennzeichen: null, erstzulassung: monatsErster(ctx.heute, f.ezTage), km_stand: f.km, leistung_kw: M[4],
      kraftstoff: M[3], farbe: f.farbe, eingang_am: f.eingang, verkauft_am: f.verkauft,
      ek_netto: f.ek, vk_brutto: f.vk, besteuerung: f.steuer,
      inseriert: f.status === 'bestand' || f.status === 'reserviert',
      hu_bis: zulauf ? null : tagPlus(ctx.heute, ganz(r, 200, 900)),
      vorbesitzer: zulauf ? 1 : ganz(r, 1, 2), vorschaden: 'keine_bekannt', vorschaden_text: null,
      ausstattung: M[7] === 'Motorrad' ? ['ABS Cornering', 'Traktionskontrolle', 'Quickshifter', 'Öhlins-Fahrwerk'] : AUSSTATTUNG.slice(0, ganz(r, 9, 15)),
      polster: M[7] === 'Pkw' ? eins(r, ['Leder, Schwarz', 'Leder, Cognac', 'Alcantara / Leder, Schwarz', 'Leder, Bordeaux']) : null,
      verbrauch_komb: elektro ? 20.4 : M[3].includes('Plug-in') ? 2.1 : stark ? 13.1 : 9.8,
      verbrauch_einheit: elektro ? 'kwh' : 'l',
      co2_g_km: elektro ? 0 : M[3].includes('Plug-in') ? 47 : stark ? 298 : 222,
      co2_klasse: elektro ? 'A' : M[3].includes('Plug-in') ? 'B' : 'G',
      inserat_titel: verkauft ? null : `${M[0]} ${M[1]}${M[2] ? ' ' + M[2] : ''}`.slice(0, 120),
      bewertung_anbieter: null, bewertung_ek: null, bewertung_vk: null, bewertung_am: null,
      notiz: PREMIUM_NOTIZ,
    };
  });
}

function kalk(ctx: XxlKontext): SeedZeile[] {
  return plan(ctx.heute).flatMap((f) => {
    const b = bestandId(ctx, f);
    if (!b || f.status === 'zulauf') return [];
    const alt = f.verkauft !== null && tageHer(ctx.heute, f.verkauft) > 45;
    return [{
      owner_user_id: ctx.uid, bestand_id: b, vk_erzielt: f.erzielt, verkaeufer: kurz(f.verkaeufer), hereinnehmer: kurz(f.hereinnehmer),
      prov_v_art: 'rohertrag', prov_v_wert: 8, prov_h_art: 'fest', prov_h_wert: 250,
      prov_ausgezahlt_am: alt ? tagPlus(f.verkauft as string, 30) : null,
    }];
  });
}

const KOSTEN_EXTRA = [
  ['hu', 'HU/AU neu', 189], ['reifen', 'Satz Sommerreifen', 1890], ['reifen', 'Satz Winterreifen auf Felge', 2490], ['lack', 'Smart-Repair Steinschläge Front', 480],
  ['reparatur', 'Inspektion vor Auslieferung', 690], ['transport', 'Überführung per Transporter', 420], ['werbung', 'Top-Platzierung Börse (3 Monate)', 149],
  ['fremd', 'Gutachten Fremdsachverständiger', 290], ['teile', 'Ersatzschlüssel', 540],
] as const;

function kosten(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  for (const f of plan(ctx.heute)) {
    const b = bestandId(ctx, f);
    if (!b) continue;
    const r = zufall(7000 + f.i);
    if (f.status === 'zulauf') {
      aus.push({ owner_user_id: ctx.uid, bestand_id: b, art: 'transport', bezeichnung: 'Überführung (geplant)', betrag_netto: ganz(r, 3, 7) * 100, plan: true, datum: ctx.heute });
      continue;
    }
    const eingang = f.eingang as string;
    const laeuft = f.status === 'aufbereitung';
    aus.push({
      owner_user_id: ctx.uid, bestand_id: b, art: 'aufbereitung',
      bezeichnung: rad(f.m) ? 'Aufbereitung und Kettenservice' : laeuft ? 'Premium-Aufbereitung mit Keramikversiegelung (läuft)' : 'Premium-Aufbereitung mit Keramikversiegelung',
      betrag_netto: rad(f.m) ? 290 : MODELLE[f.m][5] > 180000 ? 1490 : 890, plan: laeuft, datum: laeuft ? ctx.heute : tagPlus(eingang, 3),
    });
    const juenger = f.verkauft === null || tageHer(ctx.heute, f.verkauft) <= 365;
    if (juenger && !rad(f.m) && r() < 0.35) {
      const k = eins(r, KOSTEN_EXTRA);
      aus.push({ owner_user_id: ctx.uid, bestand_id: b, art: k[0], bezeichnung: k[1], betrag_netto: k[2], plan: false, datum: tagPlus(eingang, 5) });
    }
  }
  return aus;
}

function marktvergleich(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  imHaus(ctx.heute).filter((f) => f.status === 'bestand').slice(0, 24).forEach((f, j) => {
    const b = bestandId(ctx, f);
    if (!b) return;
    const r = zufall(8000 + f.i);
    for (let k = 0; k < 3; k++) {
      const abw = 1 + (r() - 0.45) * 0.08;
      aus.push({
        owner_user_id: ctx.uid, bestand_id: b, preis: Math.round((f.vk * abw) / 100) * 100 - 10, km: Math.max(500, f.km + ganz(r, -9000, 12000)),
        erstzulassung: monatsErster(ctx.heute, f.ezTage), quelle: eins(r, ['mobile.de', 'AutoScout24', 'Händlerseite']), link: null,
        notiz: 'Beispiel-Vergleich', erfasst_am: tagPlus(ctx.heute, -1 - j % 9 - k * 3),
      });
    }
  });
  return aus;
}

// ---------------------------------------------------------------------------
// Vertrieb: Anfragen, Suchaufträge, rote Kennzeichen, Probefahrten
// ---------------------------------------------------------------------------
const QUELLEN = ['website', 'boerse', 'boerse', 'telefon', 'mail', 'laden', 'empfehlung'] as const;
const VERLOREN = ['preis', 'anderes_fahrzeug', 'finanzierung', 'inzahlungnahme', 'kein_kontakt', 'fahrzeug_weg'] as const;

function anfragen(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2982);
  const aus: SeedZeile[] = [];
  let nr = 4001;
  const zeile = (f: PremiumFz | null, s: string, erstellt: string, kontakt: string | null, nameText: string, mailText: string | null, v: number, extra: Record<string, unknown> = {}) => {
    const zu = s === 'gewonnen' || s === 'verloren';
    aus.push({
      owner_user_id: ctx.uid, nr: `A-${nr++}`, bestand_id: f ? bestandId(ctx, f) : null, quelle: eins(r, QUELLEN), name: nameText, tel: null, email: mailText,
      nachricht: f ? `Anfrage zum ${MODELLE[f.m][0]} ${MODELLE[f.m][1]}${f.vertrag === 'angebot' ? ' — bitte Angebot mit Leasing' : ''}.` : 'Sucht ein vergleichbares Fahrzeug.',
      kontakt_id: kontakt, verantwortlich_id: maId(ctx, v), verantwortlich_name: name(v), status: s,
      faellig_am: zu ? null : tagPlus(ctx.heute, ganz(r, 0, 4)), abschluss_grund: s === 'gewonnen' ? 'gekauft' : s === 'verloren' ? eins(r, VERLOREN) : null,
      abschluss_notiz: null, abgeschlossen_am: zu ? berlinZeit(tagPlus(erstellt, ganz(r, 2, 12)), '17:00') : null,
      erstellt_am: berlinZeit(erstellt, eins(r, ['09:10', '10:25', '11:40', '14:05', '16:30', '18:45'])), notiz: PREMIUM_NOTIZ, ...extra,
    });
  };
  const kl = kundenListe(ctx.heute);
  // gewonnen: die Verkäufe der letzten 180 Tage
  for (const f of verkaufte(ctx.heute).filter((x) => tageHer(ctx.heute, x.verkauft) <= 180)) {
    const k = kl[f.i];
    zeile(f, 'gewonnen', tagPlus(f.verkauft as string, -ganz(r, 6, 20)), kontaktVonVerkauf(ctx, f), kundeName(k), kundeMail(k, f.i), f.verkaeufer);
  }
  // verloren: 50 über das letzte halbe Jahr
  for (let j = 0; j < 50; j++) {
    const { k, n } = interessentDaten(ctx.heute, j);
    const f = eins(r, plan(ctx.heute).filter((x) => x.status !== 'zulauf'));
    zeile(f, 'verloren', tagPlus(ctx.heute, -ganz(r, 15, 180)), interessent(ctx, j), kundeName(k), kundeMail(k, n), eins(r, VERKAEUFER_IDX));
  }
  // offen: am aktuellen Bestand
  const offen = imHaus(ctx.heute).filter((f) => f.status === 'bestand' || f.status === 'aufbereitung');
  const STAND = [['neu', 9], ['in_arbeit', 13], ['termin', 8], ['angebot', 8]] as const;
  let j = 50;
  for (const [s, wie] of STAND) {
    for (let k = 0; k < wie; k++, j++) {
      const { k: kd, n } = interessentDaten(ctx.heute, j);
      const f = s === 'angebot' ? offen.filter((x) => x.vertrag === 'angebot')[k % 8] ?? offen[k] : offen[(j * 7) % offen.length];
      zeile(f, s, tagPlus(ctx.heute, s === 'neu' ? -ganz(r, 0, 1) : -ganz(r, 2, 14)), interessent(ctx, j), kundeName(kd), kundeMail(kd, n), eins(r, VERKAEUFER_IDX));
    }
  }
  return aus;
}

function suchauftraege(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2983);
  const W = [
    ['Porsche', '911', 180000], ['Mercedes-AMG', 'G 63', 200000], ['Audi', 'RS 6', 120000], ['BMW', 'M3', 95000], ['Porsche', 'Taycan', 110000],
    ['Land Rover', 'Defender', 140000], ['Ferrari', null, 280000], ['Lamborghini', 'Urus', 240000], ['Porsche', 'Cayenne', 100000], ['BMW', 'M5', 140000],
    ['Mercedes-AMG', 'C 63', 95000], ['Bentley', 'Continental', 260000], ['Aston Martin', null, 230000], ['Audi', 'R8', 170000], ['Porsche', 'Macan', 85000],
    ['Mercedes-Benz', 'S-Klasse', 130000], ['BMW', 'X5 M', 140000], ['Range Rover', null, 170000], ['Maserati', 'MC20', 230000], ['Ducati', null, 35000],
  ] as const;
  return W.map((w, j) => {
    const { k, n } = interessentDaten(ctx.heute, j + 100);
    return {
      owner_user_id: ctx.uid, nr: `S-${601 + j}`, name: kundeName(k), email: kundeMail(k, n), kontakt_id: interessent(ctx, j + 100),
      kriterien: { marke: w[0], ...(w[1] ? { modell: w[1] } : {}), preis_max: w[2], km_max: ganz(r, 2, 6) * 10000 },
      aktiv: j < 17, gueltig_bis: tagPlus(ctx.heute, j < 17 ? ganz(r, 20, 150) : -ganz(r, 5, 40)),
      verantwortlich_name: name(eins(r, VERKAEUFER_IDX)), notiz: PREMIUM_NOTIZ,
    };
  });
}

const ROTE = ['BB-06401', 'BB-06402', 'BB-06403', 'BB-06404'] as const;
function roteKennzeichen(ctx: XxlKontext): SeedZeile[] {
  return ROTE.map((k) => ({ owner_user_id: ctx.uid, kennzeichen: k, art: 'rot', gueltig_bis: null, aktiv: true, notiz: PREMIUM_NOTIZ }));
}

const TANK = ['1/2', '3/4', 'voll'] as const;

function probefahrten(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2984);
  const kl = kundenListe(ctx.heute);
  const aus: SeedZeile[] = [];
  let nr = 5001;
  const fahrt = (f: PremiumFz, kontakt: string | null, k: Kunde, mailText: string, tag: string, status: string, ergebnis: string | null) => {
    const b = bestandId(ctx, f);
    if (!b) return;
    const h = ganz(r, 9, 17);
    const strecke = ganz(r, 18, 60);
    const zurueck = status === 'zurueck';
    aus.push({
      owner_user_id: ctx.uid, bestand_id: b, nr: `P-${nr++}`, art: 'probefahrt', status, fahrer_name: kundeName(k), fahrer_email: mailText, kontakt_id: kontakt,
      fs_geprueft: status !== 'geplant', fs_klasse: status !== 'geplant' ? (MODELLE[f.m][7] === 'Motorrad' ? 'A' : 'B') : null,
      fs_gueltig_bis: status !== 'geplant' ? tagPlus(ctx.heute, ganz(r, 900, 4000)) : null, begleitet: MODELLE[f.m][5] > 200000,
      kennzeichen_art: 'rot', kennzeichen: ROTE[nr % ROTE.length],
      start_am: berlinZeit(tag, `${String(h).padStart(2, '0')}:00`), ende_geplant: berlinZeit(tag, `${String(h + 1).padStart(2, '0')}:00`),
      rueck_am: zurueck ? berlinZeit(tag, `${String(h).padStart(2, '0')}:${String(ganz(r, 40, 58))}`) : null,
      km_start: status === 'geplant' ? null : Math.max(0, f.km - strecke), km_ende: zurueck ? f.km : null, km_frei: 80,
      tank_start: status === 'geplant' ? null : eins(r, TANK), tank_ende: zurueck ? eins(r, TANK) : null,
      selbstbeteiligung: MODELLE[f.m][5] > 180000 ? 5000 : 2500,
      nachfass_am: zurueck ? tagPlus(tag, 1) : null, nachfass_erledigt: zurueck && tag < tagPlus(ctx.heute, -2), ergebnis, notiz: PREMIUM_NOTIZ,
    });
  };
  // Käufe der letzten 120 Tage: Probefahrt kurz vor dem Kauf
  for (const f of verkaufte(ctx.heute).filter((x) => tageHer(ctx.heute, x.verkauft) <= 120)) {
    fahrt(f, kontaktVonVerkauf(ctx, f), kl[f.i], kundeMail(kl[f.i], f.i), tagPlus(f.verkauft as string, -ganz(r, 3, 12)), 'zurueck', 'kauf');
  }
  // aktueller Bestand: vergangene Fahrten, geplante, eine unterwegs
  const fz = imHaus(ctx.heute).filter((f) => f.status === 'bestand' || f.status === 'reserviert');
  for (let j = 0; j < 45; j++) {
    const { k, n } = interessentDaten(ctx.heute, j);
    fahrt(fz[(j * 5) % fz.length], interessent(ctx, j), k, kundeMail(k, n), tagPlus(ctx.heute, -ganz(r, 1, 60)), 'zurueck', eins(r, ['interesse', 'interesse', 'kein_interesse', 'offen']));
  }
  for (let j = 0; j < 9; j++) {
    const { k, n } = interessentDaten(ctx.heute, 45 + j);
    fahrt(fz[(j * 11 + 3) % fz.length], interessent(ctx, 45 + j), k, kundeMail(k, n), tagPlus(ctx.heute, ganz(r, 1, 7)), 'geplant', null);
  }
  const { k, n } = interessentDaten(ctx.heute, 58);
  fahrt(fz[1], interessent(ctx, 58), k, kundeMail(k, n), ctx.heute, 'unterwegs', null);
  return aus;
}

// ---------------------------------------------------------------------------
// Tresor, Zulassung, Ankauf, Verkauf
// ---------------------------------------------------------------------------
function tresor(ctx: XxlKontext): SeedZeile[] {
  const aus: SeedZeile[] = [];
  let fach = 1;
  for (const f of plan(ctx.heute)) {
    const b = bestandId(ctx, f);
    if (!b || f.status === 'zulauf') continue;
    if (f.status === 'verkauft') {
      if (tageHer(ctx.heute, f.verkauft) < 100) aus.push({ owner_user_id: ctx.uid, bestand_id: b, art: 'zb2', ort: null, status: 'beim_kaeufer', notiz: PREMIUM_NOTIZ });
      continue;
    }
    const zulassung = f.vertrag === 'vertrag';
    aus.push({ owner_user_id: ctx.uid, bestand_id: b, art: 'zb2', ort: zulassung ? null : `Tresor Fach ${fach}`, status: zulassung ? 'bei_zulassung' : 'im_haus', notiz: PREMIUM_NOTIZ });
    aus.push({ owner_user_id: ctx.uid, bestand_id: b, art: 'schluessel', anzahl: MODELLE[f.m][7] === 'Motorrad' ? 1 : 2, ort: `Schlüsselschrank ${fach}`, status: 'im_haus', notiz: PREMIUM_NOTIZ });
    fach++;
  }
  return aus;
}

const evb = (i: number) => {
  const z = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
  const r = zufall(9100 + i);
  return Array.from({ length: 7 }, () => z[Math.floor(r() * z.length)]).join('');
};

function zulassungen(ctx: XxlKontext): SeedZeile[] {
  const kl = kundenListe(ctx.heute);
  const aus: SeedZeile[] = [];
  for (const f of verkaufte(ctx.heute).filter((x) => tageHer(ctx.heute, x.verkauft) <= 30)) {
    const b = bestandId(ctx, f);
    if (!b) continue;
    const k = kl[f.i];
    const tag = tagPlus(f.verkauft as string, -1);
    aus.push({
      owner_user_id: ctx.uid, bestand_id: b, art: 'zulassung', status: 'erledigt', halter: k.firma ?? kundeName(k), evb: evb(f.i),
      kennzeichen_neu: `BB-${ascii(k.nachname).slice(0, 2).toUpperCase()} ${100 + (f.i % 899)}`, termin: tag,
      unterlagen: { zb2: true, evb: true, ausweis: true, sepa: true }, kosten_netto: 95, erledigt_am: tag, notiz: PREMIUM_NOTIZ,
    });
  }
  imHaus(ctx.heute).filter((f) => f.status === 'reserviert').forEach((f, j) => {
    const b = bestandId(ctx, f);
    if (!b) return;
    const { k } = interessentDaten(ctx.heute, 200 + j);
    aus.push({
      owner_user_id: ctx.uid, bestand_id: b, art: 'zulassung', status: f.vertrag === 'vertrag' ? 'beim_amt' : 'offen', halter: kundeName(k), evb: f.vertrag === 'vertrag' ? evb(f.i) : null,
      termin: tagPlus(ctx.heute, 2 + (j % 6)), unterlagen: { zb2: f.vertrag === 'vertrag', evb: f.vertrag === 'vertrag', ausweis: true, sepa: false }, kosten_netto: 95, notiz: PREMIUM_NOTIZ,
    });
  });
  return aus;
}

function ankaeufe(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2985);
  const alleOk = Object.fromEntries(PRUEF_KEYS.map((k) => [k, 'ok']));
  const aus: SeedZeile[] = [];
  let nr = 7001;
  const basis = (f: PremiumFz, status: string, quelle: string) => {
    const M = MODELLE[f.m];
    const { k, n } = interessentDaten(ctx.heute, nr);
    return {
      owner_user_id: ctx.uid, nr: `AK-${nr++}`, status, quelle, verkaeufer_art: r() < 0.25 ? 'gewerblich' : 'privat', verkaeufer_name: k.firma ?? kundeName(k),
      verkaeufer_email: kundeMail(k, n), ausweis_geprueft: status !== 'offen', marke: M[0], modell: M[1], variante: M[2],
      erstzulassung: monatsErster(ctx.heute, f.ezTage), km_stand: f.km, leistung_kw: M[4], kraftstoff: M[3], farbe: f.farbe,
      vorbesitzer: 1, serviceheft: 'lueckenlos', unfall_angabe: 'keine_bekannt', schaeden: [], notiz: PREMIUM_NOTIZ,
    };
  };
  // angekauft: 30 Fahrzeuge des aktuellen Bestands kamen über den Ankauf (gleiche FIN)
  imHaus(ctx.heute).filter((f) => f.status !== 'zulauf').slice(0, 30).forEach((f) => {
    aus.push({
      ...basis(f, 'angekauft', eins(r, ['hof', 'inzahlungnahme', 'online'])), fin: premiumFin(MODELLE[f.m][6], f.i),
      hu_bis: tagPlus(ctx.heute, ganz(r, 300, 700)), schluessel: 2, pruefung: alleOk,
      ziel_vk: f.vk, aufbereitung: 890, sonstige_kosten: 0, standtage_plan: 45, marge: Math.round((f.vk * 0.07) / 100) * 100,
      angebot: f.ek, ankaufpreis: f.ek, angekauft_am: f.eingang, bestand_id: bestandId(ctx, f),
    });
  });
  // offen, angeboten, abgelehnt: neue Bewertungen (eigene FIN, nicht im Bestand)
  const STAND = [['offen', 9], ['angeboten', 12], ['abgelehnt', 10]] as const;
  let j = 0;
  for (const [s, wie] of STAND) {
    for (let k = 0; k < wie; k++, j++) {
      const m = modellWahl(r);
      const ez = ganz(r, 12, 60);
      const km = Math.round((ez * ganz(r, 800, 1600)) / 100) * 100;
      const vk = preisAus(MODELLE[m][5], ez, km, r);
      const fiktiv: PremiumFz = { i: 9000 + j, m, nr: '', status: 'bestand', ezTage: ez * 30, km, eingang: null, verkauft: null, ek: 0, vk, erzielt: null, steuer: 'regel', verkaeufer: 0, hereinnehmer: 0, farbe: eins(r, FARBEN), kunde: null, vertrag: null };
      const angebot = Math.round((vk * 0.8) / 500) * 500;
      aus.push({
        ...basis(fiktiv, s, eins(r, ['hof', 'inzahlungnahme', 'telefon', 'online'])), fin: premiumFin(MODELLE[m][6], 9000 + j),
        pruefung: s === 'offen' ? {} : alleOk, ...(s === 'offen' ? {} : { ziel_vk: vk, aufbereitung: 890, sonstige_kosten: 150, standtage_plan: 60, marge: Math.round((vk * 0.07) / 100) * 100, angebot }),
        notiz: s === 'abgelehnt' ? `Preisvorstellung Verkäufer deutlich über Angebot · ${PREMIUM_NOTIZ}` : PREMIUM_NOTIZ,
      });
    }
  }
  return aus;
}

const PAPIERE = ['Zulassungsbescheinigung Teil I', 'Zulassungsbescheinigung Teil II', 'Serviceheft / Wartungsnachweise', 'Bericht der letzten Hauptuntersuchung'];

function verkaeufe(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2986);
  const kl = kundenListe(ctx.heute);
  const roh: { tag: string; z: SeedZeile }[] = [];
  const kaeufer = (k: Kunde, n: number, steuer: '25a' | 'regel') => {
    const firma = !!k.firma;
    return {
      kaeufer_art: firma ? 'unternehmer' : 'verbraucher', kaeufer_name: kundeName(k), kaeufer_firma: k.firma,
      kaeufer_anschrift: `Beispielstraße ${1 + (n % 80)}\n${k.ort}`, kaeufer_email: kundeMail(k, n),
      gewaehr: firma ? 'ausgeschlossen' : steuer === '25a' ? 'ein_jahr' : 'gesetzlich', gewaehr_gesondert: !firma && steuer === '25a',
    };
  };
  // übergeben: alle Verkäufe der letzten 120 Tage
  for (const f of verkaufte(ctx.heute).filter((x) => tageHer(ctx.heute, x.verkauft) <= 120)) {
    const b = bestandId(ctx, f);
    if (!b) continue;
    const k = kl[f.i];
    const vertragAm = tagPlus(f.verkauft as string, -ganz(r, 2, 9));
    roh.push({ tag: vertragAm, z: {
      owner_user_id: ctx.uid, bestand_id: b, status: 'uebergeben', ...kaeufer(k, f.i, f.steuer), kontakt_id: kontaktVonVerkauf(ctx, f), ausweis_geprueft: true,
      preis_brutto: f.erzielt, zusatz: [{ text: 'Zulassung und Kennzeichen', betrag: 190 }], rest_art: eins(r, ['ueberweisung', 'ueberweisung', 'finanzierung']),
      vertrag_am: vertragAm, liefertermin: f.verkauft, uebergabe_am: f.verkauft, km_uebergabe: f.km + ganz(r, 5, 40), schluessel: 2, papiere: PAPIERE, lieferung: 'inland',
    } });
  }
  // reserviert, Vertrag, Angebot: am aktuellen Bestand
  imHaus(ctx.heute).filter((f) => f.vertrag !== null).forEach((f, j) => {
    const b = bestandId(ctx, f);
    if (!b) return;
    const { k, n } = interessentDaten(ctx.heute, 200 + j);
    const s = f.vertrag as string;
    const vertragAm = s === 'angebot' ? null : tagPlus(ctx.heute, -ganz(r, 2, 20));
    roh.push({ tag: vertragAm ?? ctx.heute, z: {
      owner_user_id: ctx.uid, bestand_id: b, status: s, ...kaeufer(k, n, f.steuer), kontakt_id: interessent(ctx, 200 + j), ausweis_geprueft: s !== 'angebot',
      preis_brutto: f.vk, zusatz: [{ text: 'Zulassung und Kennzeichen', betrag: 190 }],
      ...(s === 'angebot' ? { angebot_gueltig_bis: tagPlus(ctx.heute, ganz(r, 5, 14)) } : {
        anzahlung: Math.round((f.vk * 0.1) / 1000) * 1000, anzahlung_am: vertragAm, anzahlung_art: 'ueberweisung', rest_art: eins(r, ['ueberweisung', 'finanzierung']),
        reserviert_bis: tagPlus(ctx.heute, ganz(r, 4, 14)), liefertermin: tagPlus(ctx.heute, ganz(r, 3, 12)),
      }),
      vertrag_am: s === 'vertrag' ? vertragAm : null, lieferung: 'inland',
    } });
  });
  roh.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  return roh.map((x, i) => ({ ...x.z, nr: `V-${8001 + i}` }));
}

// ---------------------------------------------------------------------------
// Werkstatt: Kundenfahrzeuge aus dem eigenen Verkauf
// ---------------------------------------------------------------------------
/** Jedes zweite Fahrzeug, das in den letzten zwölf Monaten verkauft wurde, kommt zum Service zurück. */
export function werkstattKunden(heute: string): PremiumFz[] {
  return verkaufte(heute).filter((f) => tageHer(heute, f.verkauft) <= 365 && f.i % 2 === 0);
}
const kennzeichenVon = (k: Kunde, f: PremiumFz) => `BB-${ascii(k.nachname).slice(0, 2).toUpperCase()} ${100 + (f.i % 899)}`;

function werkstattFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  const kl = kundenListe(ctx.heute);
  return werkstattKunden(ctx.heute).map((f) => {
    const M = MODELLE[f.m];
    const k = kl[f.i];
    return {
      owner_user_id: ctx.uid, fin: premiumFin(M[6], f.i), kennzeichen: kennzeichenVon(k, f), hersteller: M[0], modell: M[1], kraftstoff: M[3],
      erstzulassung: monatsErster(ctx.heute, f.ezTage), kontakt_id: kontaktVonVerkauf(ctx, f), halter_name: k.firma ?? kundeName(k),
      naechste_hu: tagPlus(ctx.heute, 40 + (f.i % 600)), notiz: PREMIUM_NOTIZ,
    };
  });
}

function fahrzeugakte(ctx: XxlKontext): SeedZeile[] {
  const kl = kundenListe(ctx.heute);
  return werkstattKunden(ctx.heute).map((f) => {
    const M = MODELLE[f.m];
    const k = kl[f.i];
    return {
      owner_user_id: ctx.uid, kontakt_id: kontaktVonVerkauf(ctx, f), halter: k.firma ?? kundeName(k), kennzeichen: kennzeichenVon(k, f),
      marke: M[0], modell: M[1], vin: premiumFin(M[6], f.i), erstzulassung: monatsErster(ctx.heute, f.ezTage),
      hu_faellig: tagPlus(ctx.heute, 40 + (f.i % 600)), au_faellig: tagPlus(ctx.heute, 40 + (f.i % 600)), km_stand: f.km + 6000, notiz: PREMIUM_NOTIZ,
    };
  });
}

const ARBEITEN = [
  { t: 'Jahresinspektion', a: 'Service fällig laut Anzeige', pos: [['Inspektion nach Herstellervorgabe', 'leistung', 2.2, 189], ['Motoröl Herstellerfreigabe', 'material', 9, 24.9], ['Ölfilter und Dichtring', 'material', 1, 38.5], ['Innenraumfilter', 'material', 1, 64]] },
  { t: 'Bremsen vorn erneuern', a: 'Verschleißanzeige Bremsbeläge vorn', pos: [['Bremsscheiben und Beläge vorn erneuern', 'leistung', 1.8, 189], ['Bremsscheiben-Satz vorn', 'material', 1, 890], ['Bremsbeläge vorn', 'material', 1, 340]] },
  { t: 'Räderwechsel mit Einlagerung', a: 'Saisonwechsel', pos: [['Räderwechsel inkl. Wuchten', 'leistung', 0.8, 189], ['Reifeneinlagerung Saison', 'leistung', 1, 89]] },
  { t: 'Software-Update und Diagnose', a: 'Kontrollleuchte Fahrwerk', pos: [['Fehlerspeicher auslesen und Diagnose', 'leistung', 1, 189], ['Steuergeräte-Update', 'leistung', 0.7, 189]] },
  { t: 'Hochvolt-Prüfung und Service', a: 'Turnusmäßiger HV-Check', pos: [['Hochvolt-Sichtprüfung und Isolationsmessung', 'leistung', 1.5, 199], ['Klimaservice Wärmepumpe', 'leistung', 1, 189]] },
  { t: 'Keramikversiegelung auffrischen', a: 'Pflegepaket gebucht', pos: [['Lackreinigung und Versiegelung', 'leistung', 4, 79], ['Keramik-Booster', 'material', 1, 120]] },
  { t: 'HU/AU mit Vorabprüfung', a: 'HU fällig', pos: [['HU/AU über Prüforganisation', 'leistung', 1, 169], ['Vorabprüfung', 'leistung', 0.6, 189]] },
] as const;

/** Passende Arbeit: Hochvolt nur bei Elektro/Plug-in, Motorräder nur Inspektion, Bremsen, HU. */
function arbeitFuer(f: PremiumFz, r: () => number): number {
  if (rad(f.m)) return eins(r, [0, 1, 6]);
  const hv = MODELLE[f.m][3] === 'Elektro' || MODELLE[f.m][3].includes('Plug-in');
  return eins(r, hv ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 5, 6]);
}

type WaPlan = { f: PremiumFz | null; art: number; status: string; angenommen: string; fertig: string | null; archiv: boolean; mechaniker: number; intern: boolean };
export function werkstattPlan(heute: string): WaPlan[] {
  const r = zufall(2987);
  const aus: WaPlan[] = [];
  werkstattKunden(heute).forEach((f, j) => {
    const besuche = j % 3 === 0 ? 2 : 1;
    for (let b = 0; b < besuche; b++) {
      const vor = ganz(r, 1, Math.max(2, tageHer(heute, f.verkauft) - 10));
      aus.push({ f, art: arbeitFuer(f, r), status: 'abgeholt', angenommen: tagPlus(heute, -vor), fertig: tagPlus(heute, -vor + ganz(r, 0, 2)), archiv: vor > 45, mechaniker: eins(r, MECHANIKER_IDX), intern: false });
    }
  });
  aus.sort((a, b) => (a.angenommen < b.angenommen ? -1 : 1));
  // die jüngsten 26 sind noch auf dem Board
  const STAND = ['angenommen', 'angenommen', 'in_arbeit', 'in_arbeit', 'in_arbeit', 'wartet', 'fertig'];
  aus.slice(-26).forEach((w, j) => {
    w.status = STAND[j % STAND.length];
    w.angenommen = tagPlus(heute, -(j % 4));
    w.fertig = w.status === 'fertig' ? heute : null;
    w.archiv = false;
  });
  // interne Aufbereitung für alles in der Aufbereitung
  imHaus(heute).filter((f) => f.status === 'aufbereitung').forEach((f, j) => {
    aus.push({ f, art: 5, status: j % 3 === 0 ? 'angenommen' : 'in_arbeit', angenommen: f.eingang as string, fertig: null, archiv: false, mechaniker: eins(r, MECHANIKER_IDX), intern: true });
  });
  return aus;
}

function werkstattAuftraege(ctx: XxlKontext): SeedZeile[] {
  const kl = kundenListe(ctx.heute);
  const wk = werkstattKunden(ctx.heute);
  return werkstattPlan(ctx.heute).map((w, i) => {
    const f = w.f as PremiumFz;
    const k = w.intern ? null : kl[f.i];
    const wkIdx = w.intern ? -1 : wk.indexOf(f);
    const A = ARBEITEN[w.art];
    return {
      owner_user_id: ctx.uid, kontakt_id: w.intern ? null : kontaktVonVerkauf(ctx, f), fahrzeug_id: w.intern ? null : nimm(ctx, 'werkstatt_fahrzeuge', wkIdx),
      zustaendig_mitarbeiter_id: maId(ctx, w.mechaniker), nummer: `WA-${w.angenommen.slice(0, 4)}-${String(1001 + i).padStart(4, '0')}`,
      titel: w.intern ? `Aufbereitung ${MODELLE[f.m][0]} ${MODELLE[f.m][1]} für den Verkauf` : A.t, beschreibung: PREMIUM_NOTIZ,
      kunde_name: w.intern ? 'Autohaus intern' : k!.firma ?? kundeName(k!), kennzeichen: w.intern ? null : kennzeichenVon(k!, f),
      kilometerstand: f.km + (w.intern ? 0 : 4000), kundenanliegen: w.intern ? `Interne Aufbereitung Handelsfahrzeug ${f.nr}` : A.a,
      status: w.status, prioritaet: w.status === 'wartet' ? 'hoch' : 'normal', angenommen_am: berlinZeit(w.angenommen, '07:45'),
      fertig_am: w.fertig ? berlinZeit(w.fertig, '16:30') : null, archiviert: w.archiv,
      zugesagt_am: w.status === 'abgeholt' ? w.fertig : tagPlus(ctx.heute, 1 + (i % 3)), freigabe_status: 'kein_kva',
      kfz_bestand_id: w.intern ? bestandId(ctx, f) : null,
    };
  });
}

function werkstattPositionen(ctx: XxlKontext): SeedZeile[] {
  const p = werkstattPlan(ctx.heute);
  const aus: SeedZeile[] = [];
  (ctx.ids.werkstatt_auftraege || []).forEach((aId, i) => {
    const w = p[i];
    if (!w) return;
    for (const x of ARBEITEN[w.art].pos) {
      aus.push({ owner_user_id: ctx.uid, auftrag_id: aId, art: x[1], bezeichnung: x[0], erfassungsart: x[1] === 'leistung' ? 'stunden' : 'stueck', menge: x[2], einzelpreis_netto: x[3], einheit: x[1] === 'leistung' ? 'Std' : 'Stk' });
    }
  });
  return aus;
}

// ---------------------------------------------------------------------------
// Ersatz- und Erlebnis-Mietwagen
// ---------------------------------------------------------------------------
function mietEinstellung(ctx: XxlKontext): SeedZeile[] {
  return [{ owner_user_id: ctx.uid, kulanz_minuten: 30, mietbedingungen: 'Beispiel: Hier stehen die eigenen Mietbedingungen des Betriebs. ARGONAUT liefert bewusst keinen Mustertext — bitte den eigenen, anwaltlich geprüften Text eintragen.' }];
}

export const MIETFLOTTE = [
  { bezeichnung: 'Mercedes-Benz A 200 (Ersatzwagen)', kennzeichen: 'BB-VA 501', art: 'pkw', tag: 5900, woche: 32900, frei: 200, mehr: 30, kaution: 50000, alter: 21, jahre: 1, zf: 900, tank: 1400, km: 18400 },
  { bezeichnung: 'BMW 320i Touring (Ersatzwagen)', kennzeichen: 'BB-VA 502', art: 'pkw', tag: 6900, woche: 38900, frei: 200, mehr: 30, kaution: 50000, alter: 21, jahre: 1, zf: 900, tank: 1600, km: 22900 },
  { bezeichnung: 'Porsche Macan (Premium-Ersatzwagen)', kennzeichen: 'BB-VA 503', art: 'luxus', tag: 14900, woche: 84900, frei: 200, mehr: 60, kaution: 150000, alter: 23, jahre: 2, zf: 1500, tank: 2200, km: 26100 },
  { bezeichnung: 'Mercedes-Benz V 300 d (8 Sitze)', kennzeichen: 'BB-VA 504', art: 'transporter', tag: 12900, woche: 69900, frei: 250, mehr: 40, kaution: 100000, alter: 23, jahre: 2, zf: 1200, tank: 2400, km: 41800 },
  { bezeichnung: 'Porsche 911 Carrera (Erlebnis-Miete)', kennzeichen: 'BB-VA 911', art: 'luxus', tag: 44900, woche: 249000, frei: 150, mehr: 120, kaution: 500000, alter: 25, jahre: 3, zf: 3000, tank: 0, km: 9800 },
  { bezeichnung: 'Mercedes-AMG GT 63 (Erlebnis-Miete)', kennzeichen: 'BB-VA 63', art: 'luxus', tag: 49900, woche: 279000, frei: 150, mehr: 140, kaution: 500000, alter: 25, jahre: 3, zf: 3000, tank: 0, km: 12400 },
] as const;

function mietFahrzeuge(ctx: XxlKontext): SeedZeile[] {
  return MIETFLOTTE.map((m) => ({
    owner_user_id: ctx.uid, bezeichnung: m.bezeichnung, kennzeichen: m.kennzeichen, art: m.art, fs_klasse: 'B', tagessatz_cent: m.tag, wochensatz_cent: m.woche,
    frei_km_tag: m.frei, mehr_km_cent: m.mehr, kaution_cent: m.kaution, mindestalter: m.alter, fs_jahre_min: m.jahre,
    zusatzfahrer_tag_cent: m.zf, tank_achtel_cent: m.tank, km_stand: m.km, aktiv: true, notiz: PREMIUM_NOTIZ,
  }));
}

function mietBuchungen(ctx: XxlKontext): SeedZeile[] {
  const B = [[0, 1, 2], [1, 1, 3], [2, 2, 4], [3, 5, 9], [4, 3, 4], [5, 6, 8], [0, 4, 5], [1, 7, 8], [4, 10, 12], [2, 9, 10]] as const;
  return B.flatMap(([fz, von, bis], j) => {
    const f = nimm(ctx, 'miet_fahrzeug', fz);
    if (!f) return [];
    const { k } = interessentDaten(ctx.heute, 300 + j);
    const erlebnis = fz >= 4;
    return [{
      owner_user_id: ctx.uid, fahrzeug_id: f, kontakt_id: interessent(ctx, 300 + j), mieter_name: kundeName(k),
      abholung: berlinZeit(tagPlus(ctx.heute, von), '09:00'), rueckgabe_plan: berlinZeit(tagPlus(ctx.heute, bis), '18:00'),
      status: 'reserviert', kaution_art: erlebnis ? 'zahlungsanbieter' : 'keine',
      notiz: `${erlebnis ? 'Erlebnis-Wochenende' : 'Ersatzwagen während des Werkstattaufenthalts'} · ${PREMIUM_NOTIZ}`,
    }];
  });
}

// ---------------------------------------------------------------------------
// Termine, Projekte und Aufgaben, Urlaub
// ---------------------------------------------------------------------------
function termine(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2988);
  const fz = imHaus(ctx.heute);
  const aus: SeedZeile[] = [];
  const add = (t: number, beginn: string, dauerMin: number, titel: string, ort: string, kontakt: string | null) => {
    const d = tagPlus(ctx.heute, t);
    if (wochentag(d) === 0) return;
    const [h, m] = beginn.split(':').map(Number);
    const ende = `${String(h + Math.floor((m + dauerMin) / 60)).padStart(2, '0')}:${String((m + dauerMin) % 60).padStart(2, '0')}`;
    aus.push({ owner_user_id: ctx.uid, standort_id: null, titel, beginn_am: berlinZeit(d, beginn), ende_am: berlinZeit(d, ende), ort, status: 'geplant', kunde_email: null, erinnerung_min: null, kontakt_id: kontakt, notiz: PREMIUM_NOTIZ, ressource: null });
  };
  const mod = (f: PremiumFz) => `${MODELLE[f.m][0]} ${MODELLE[f.m][1]}`;
  fz.filter((f) => f.status === 'reserviert').forEach((f, j) => add(ganz(r, 1, 12), eins(r, ['10:00', '14:00', '16:00']), 60, `Fahrzeugübergabe ${mod(f)}`, 'Übergabe-Lounge', interessent(ctx, 200 + j)));
  for (let j = 0; j < 12; j++) { const f = fz[(j * 9) % fz.length]; add(ganz(r, 1, 10), eins(r, ['09:30', '11:00', '15:00', '17:00']), 60, `Probefahrt ${mod(f)}`, 'Showroom', interessent(ctx, 45 + j)); }
  for (let j = 0; j < 10; j++) { const f = fz[(j * 13 + 2) % fz.length]; add(ganz(r, 1, 9), eins(r, ['08:00', '10:30', '13:00']), 120, `Media: Foto- und Videodreh ${mod(f)}`, 'Fotostudio', null); }
  for (let j = 0; j < 8; j++) add(ganz(r, 1, 10), eins(r, ['07:30', '08:00', '08:30']), 30, 'Werkstatt-Annahme Kundenfahrzeug', 'Direktannahme', null);
  add(3, '09:00', 60, 'Wochenrunde Geschäftsführung und Abteilungsleitungen', 'Besprechungsraum', null);
  add(5, '18:00', 180, 'Kunden-Event: Exklusiv-Abend mit Fahrzeugpräsentation', 'Showroom', null);
  add(8, '10:00', 90, 'Zulassungsstelle Böblingen — Sammeltermin', 'Zulassungsstelle', null);
  return aus;
}

export const PROJEKTE = [
  { name: 'Media-Produktion Q4', farbe: '#C9A84C', verantwortlich: 'Vanessa Roth' },
  { name: 'Jahresendgeschäft Vertrieb', farbe: '#00e5ff', verantwortlich: 'Alexander Reinhold' },
  { name: 'Winter-Check Werkstatt', farbe: '#4CAF7D', verantwortlich: 'Ralf Stein' },
] as const;

function projekte(ctx: XxlKontext): SeedZeile[] {
  return PROJEKTE.map((p) => ({
    owner_user_id: ctx.uid, name: p.name, beschreibung: PREMIUM_NOTIZ, status: 'aktiv', prioritaet: 'hoch',
    start_datum: tagPlus(ctx.heute, -20), end_datum: tagPlus(ctx.heute, 80), budget: 25000, verantwortlich: p.verantwortlich, farbe: p.farbe,
  }));
}

function aufgaben(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2989);
  const [media, vertrieb, werkstatt] = [0, 1, 2].map((i) => nimm(ctx, 'projekte', i));
  const aus: SeedZeile[] = [];
  let sort = 0;
  const add = (projekt: string | null, titel: string, ma: number, s: string, f: number, p = 'normal') => {
    if (!projekt) return;
    aus.push({ owner_user_id: ctx.uid, projekt_id: projekt, titel, beschreibung: PREMIUM_NOTIZ, status: s, prioritaet: p, faellig_am: tagPlus(ctx.heute, f), mitarbeiter_id: maId(ctx, ma), erledigt: s === 'fertig', sortierung: sort++ });
  };
  const fz = imHaus(ctx.heute).filter((f) => f.status !== 'zulauf');
  const STAND = ['fertig', 'fertig', 'review', 'in_arbeit', 'in_arbeit', 'todo', 'todo'];
  for (let j = 0; j < 24; j++) {
    const f = fz[(j * 5 + 1) % fz.length];
    const m = `${MODELLE[f.m][0]} ${MODELLE[f.m][1]}`;
    const s = STAND[j % STAND.length];
    const was = j % 4;
    const titel = was === 0 ? `Walkaround-Video schneiden: ${m}` : was === 1 ? `Reel (30 Sek.) für Instagram: ${m}` : was === 2 ? `Fotoshooting 14 Ansichten: ${m}` : `Fahrzeugvorstellung mit Verkaufsberater drehen: ${m}`;
    const wer = was === 2 ? MEDIA_IDX[3] : was === 1 ? MEDIA_IDX[eins(r, [1, 2])] : MEDIA_IDX[1 + (j % 2)];
    add(media, titel, wer, s, s === 'fertig' ? -ganz(r, 1, 10) : ganz(r, 1, 12), j % 6 === 0 ? 'hoch' : 'normal');
  }
  add(media, 'Redaktionsplan November freigeben', MEDIA_IDX[0], 'review', 4, 'hoch');
  add(media, 'Social-Media-Statistik Oktober auswerten', MEDIA_IDX[4], 'todo', 9);
  add(media, 'Musik-Lizenzen für Reels prüfen', MEDIA_IDX[0], 'todo', 6);
  const vk = VERKAEUFER_IDX;
  ['Bestandskunden mit Leasingende anrufen', 'Gewerbekunden-Angebote Jahresende', 'Langsteher über 120 Tage neu bepreisen', 'Exklusiv-Abend: Gästeliste finalisieren',
    'Inzahlungnahmen der Woche bewerten', 'Finanzierungsanfragen nachfassen', 'Neue Fahrzeuge im Zulauf vorab anbieten', 'Kundenstimmen für die Webseite einholen']
    .forEach((t, j) => add(vertrieb, t, vk[j % vk.length], j < 2 ? 'fertig' : j < 4 ? 'in_arbeit' : 'todo', j < 2 ? -3 : ganz(r, 1, 14), j === 2 ? 'dringend' : 'normal'));
  ['Winter-Check-Aktion im Kalender freischalten', 'Reifenlager umräumen', 'Hochvolt-Arbeitsplatz Prüfung', 'Werkzeugkalibrierung', 'Teilebestellung Bremsen vorrätig halten']
    .forEach((t, j) => add(werkstatt, t, j === 2 ? MECHANIKER_IDX[MECHANIKER_IDX.length - 1] : SERVICE_IDX[j % SERVICE_IDX.length], j < 1 ? 'fertig' : j < 3 ? 'in_arbeit' : 'todo', j < 1 ? -2 : ganz(r, 2, 20)));
  return aus;
}

function abwesenheiten(ctx: XxlKontext): SeedZeile[] {
  const U = [[4, 3, 5, 'genehmigt'], [9, 10, 5, 'genehmigt'], [18, 20, 3, 'genehmigt'], [23, 1, 5, 'genehmigt'], [27, 14, 10, 'beantragt'], [31, 6, 5, 'genehmigt'],
    [37, 24, 4, 'beantragt'], [41, -12, 5, 'genehmigt'], [44, -30, 10, 'genehmigt'], [13, 30, 5, 'beantragt'], [21, 2, 2, 'genehmigt'], [47, 17, 5, 'genehmigt']] as const;
  return U.flatMap(([ma, ab, tage, s]) => {
    const m = maId(ctx, ma);
    return m ? [{ owner_user_id: ctx.uid, mitarbeiter_id: m, typ: 'urlaub', von: tagPlus(ctx.heute, ab), bis: tagPlus(ctx.heute, ab + tage + Math.floor(tage / 5) * 2 - 1), tage, status: s, au_vorhanden: false, notiz: PREMIUM_NOTIZ }] : [];
  });
}

// ---------------------------------------------------------------------------
// Media-Abteilung: Kampagnen, Inhalte, Redaktionskalender, Social-Entwürfe
// ---------------------------------------------------------------------------
export const KAMPAGNEN = [
  { name: 'Porsche-Wochen Herbst', ziel: 'Probefahrten Porsche', status: 'aktiv', kanaele: ['instagram', 'facebook', 'website'], budget: 6500, von: -21, bis: 14 },
  { name: 'AMG Performance Days', ziel: 'Anfragen Mercedes-AMG', status: 'aktiv', kanaele: ['instagram', 'email'], budget: 4800, von: -10, bis: 25 },
  { name: 'Walkaround-Serie „In 60 Sekunden"', ziel: 'Reichweite Social Media', status: 'aktiv', kanaele: ['instagram', 'facebook'], budget: 2500, von: -120, bis: 60 },
  { name: 'Exklusiv-Abend Showroom', ziel: 'Bestandskunden binden', status: 'aktiv', kanaele: ['email', 'print'], budget: 9000, von: -14, bis: 5 },
  { name: 'Winter-Check Werkstatt', ziel: 'Werkstattauslastung November', status: 'entwurf', kanaele: ['email', 'website', 'google'], budget: 1800, von: 10, bis: 60 },
  { name: 'Leasingrückläufer Gewerbe', ziel: 'Gewerbekunden', status: 'entwurf', kanaele: ['linkedin', 'email'], budget: 2200, von: 20, bis: 80 },
  { name: 'Sommer-Cabrio-Aktion', ziel: 'Abverkauf Cabrios', status: 'abgeschlossen', kanaele: ['instagram', 'website'], budget: 5200, von: -170, bis: -100 },
  { name: 'Jahresauftakt Elektro-Sportwagen', ziel: 'Taycan, e-tron GT, i7', status: 'abgeschlossen', kanaele: ['instagram', 'linkedin', 'website'], budget: 4100, von: -280, bis: -220 },
] as const;

function kampagnen(ctx: XxlKontext): SeedZeile[] {
  return KAMPAGNEN.map((k) => ({
    owner_user_id: ctx.uid, name: k.name, ziel: k.ziel, beschreibung: PREMIUM_NOTIZ, status: k.status, kanaele: [...k.kanaele], budget: k.budget,
    start_datum: tagPlus(ctx.heute, k.von), end_datum: tagPlus(ctx.heute, k.bis),
  }));
}

/** Inhalte-Bibliothek der Media-Abteilung: [Titel, Typ, Kanal, Kampagne, Text] — Typ/Kanal wie die Bibliothek sie anbietet. */
function inhalteListe(heute: string): [string, string, string, number | null, string, string][] {
  const fz = imHaus(heute).filter((f) => f.status !== 'zulauf');
  const aus: [string, string, string, number | null, string, string][] = [];
  const STATUS = ['veroeffentlicht', 'veroeffentlicht', 'veroeffentlicht', 'freigegeben', 'entwurf'];
  for (let j = 0; j < 40; j++) {
    const f = fz[(j * 3) % fz.length];
    const m = `${MODELLE[f.m][0]} ${MODELLE[f.m][1]}`;
    const art = j % 4;
    if (art === 0) aus.push([`Walkaround-Video: ${m}`, 'post', 'instagram', 2, `60 Sekunden rund um den ${m}: Ausstattung, Sound, Details. Jetzt Probefahrt vereinbaren.`, STATUS[j % 5]]);
    else if (art === 1) aus.push([`Reel: ${m} — Startsound`, 'post', 'instagram', MODELLE[f.m][0] === 'Porsche' ? 0 : MODELLE[f.m][0] === 'Mercedes-AMG' ? 1 : 2, `Kaltstart, Klappenauspuff, Gänsehaut. ${m} — ab sofort bei uns.`, STATUS[(j + 1) % 5]]);
    else if (art === 2) aus.push([`Fahrzeugvorstellung: ${m}`, 'blog', 'website', null, `Unser Verkaufsberater stellt den ${m} vor — mit allen Extras, Historie und Finanzierungsbeispiel.`, STATUS[(j + 2) % 5]]);
    else aus.push([`Fotostrecke Facebook: ${m}`, 'post', 'facebook', null, `14 Ansichten, ein Fahrzeug: der ${m} in ${f.farbe}.`, STATUS[(j + 3) % 5]]);
  }
  const fest: [string, string, string, number | null, string, string][] = [
    ['Newsletter Oktober: Neue Fahrzeuge im Zulauf', 'newsletter', 'email', 0, 'Exklusiv für Bestandskunden: Diese Fahrzeuge sehen Sie bei uns zuerst.', 'veroeffentlicht'],
    ['Einladung Exklusiv-Abend', 'newsletter', 'email', 3, 'Wir laden Sie herzlich zu unserem Exklusiv-Abend im Showroom ein.', 'veroeffentlicht'],
    ['Anzeige: Porsche-Wochen', 'anzeige', 'google', 0, 'Porsche-Wochen bei Valtier Automobile — jetzt Probefahrt sichern.', 'veroeffentlicht'],
    ['Anzeige: AMG Performance Days', 'anzeige', 'instagram', 1, 'AMG Performance Days: erleben Sie die Kraft.', 'freigegeben'],
    ['Print-Flyer Exklusiv-Abend', 'anzeige', 'print', 3, 'Flyer A5 für Showroom und Werkstatt-Annahme.', 'veroeffentlicht'],
    ['LinkedIn: Leasingrückläufer für Gewerbekunden', 'post', 'linkedin', 5, 'Junge Premium-Fahrzeuge für Ihren Fuhrpark — mit Gewerbe-Konditionen.', 'entwurf'],
    ['Blog: Winterreifen-Pflicht und Hochvolt-Check', 'blog', 'website', 4, 'Was Sie vor dem Winter an Ihrem Elektro- oder Hybridfahrzeug prüfen lassen sollten.', 'entwurf'],
    ['Newsletter: Winter-Check Werkstatt', 'newsletter', 'email', 4, 'Jetzt Termin für den Winter-Check sichern.', 'entwurf'],
    ['Rückblick Sommer-Cabrio-Aktion', 'blog', 'website', 6, 'Zwölf Cabrios in sechs Wochen — danke an alle Kundinnen und Kunden.', 'veroeffentlicht'],
    ['Kundenstimme: Übergabe Bentley Continental GT', 'post', 'facebook', null, 'Eine Übergabe, die man nicht vergisst. Danke für Ihr Vertrauen!', 'veroeffentlicht'],
  ];
  return [...aus, ...fest];
}

function inhalte(ctx: XxlKontext): SeedZeile[] {
  return inhalteListe(ctx.heute).map((x) => ({
    owner_user_id: ctx.uid, kampagne_id: x[3] === null ? null : nimm(ctx, 'marketing_kampagnen', x[3]), titel: x[0], typ: x[1], kanal: x[2],
    inhalt: `${x[4]}\n\n(${PREMIUM_NOTIZ})`, status: x[5], ki_generiert: false,
  }));
}

function redaktionskalender(ctx: XxlKontext): SeedZeile[] {
  const r = zufall(2990);
  const fz = imHaus(ctx.heute).filter((f) => f.status !== 'zulauf');
  const aus: SeedZeile[] = [];
  for (let j = 0; j < 48; j++) {
    const t = -40 + Math.floor(j * 1.8);
    const f = fz[(j * 7) % fz.length];
    const m = `${MODELLE[f.m][0]} ${MODELLE[f.m][1]}`;
    const art = j % 4;
    const titel = art === 0 ? `Walkaround-Video ${m}` : art === 1 ? `Reel Startsound ${m}` : art === 2 ? `Fotostrecke ${m}` : `Fahrzeugvorstellung ${m}`;
    const kanal = art === 2 ? 'facebook' : art === 3 ? 'website' : 'instagram';
    aus.push({
      owner_user_id: ctx.uid, titel, kampagne_id: nimm(ctx, 'marketing_kampagnen', art === 1 ? (MODELLE[f.m][0] === 'Porsche' ? 0 : 1) : 2), kanal,
      status: t < 0 ? 'veroeffentlicht' : t < 6 ? 'geplant' : r() < 0.5 ? 'geplant' : 'entwurf',
      geplant_am: berlinZeit(tagPlus(ctx.heute, t), eins(r, ['11:00', '17:30', '19:00'])), notiz: PREMIUM_NOTIZ,
    });
  }
  return aus;
}

function socialEntwuerfe(ctx: XxlKontext): SeedZeile[] {
  const fz = imHaus(ctx.heute).filter((f) => f.status === 'bestand');
  const aus: SeedZeile[] = [];
  for (let j = 0; j < 16; j++) {
    const f = fz[(j * 4 + 2) % fz.length];
    const m = `${MODELLE[f.m][0]} ${MODELLE[f.m][1]}`;
    const gesendet = j < 10;
    aus.push({
      owner_user_id: ctx.uid, status: gesendet ? 'gesendet' : 'entwurf', geplant_am: gesendet ? berlinZeit(tagPlus(ctx.heute, -3 - j * 3), '18:00') : null,
      kanaele: j % 3 === 0 ? ['facebook', 'linkedin'] : j % 3 === 1 ? ['facebook', 'google_business'] : ['facebook'], medien_urls: [],
      text: `Neu bei uns: ${m} in ${f.farbe}, ${f.km.toLocaleString('de-DE')} km. Vereinbaren Sie jetzt Ihre Probefahrt — wir freuen uns auf Sie!`,
      ki_entwurf: false,
    });
  }
  return aus;
}

// ---------------------------------------------------------------------------
// Einstellungen, Reihenfolge, Löschen
// ---------------------------------------------------------------------------
function einstellungen(ctx: XxlKontext): SeedZeile[] {
  return [
    { owner_user_id: ctx.uid, modul: 'kfz-kalk', einstellung: { gemeinkostenProzent: 5 } },
    { owner_user_id: ctx.uid, modul: 'kfz-chef', einstellung: { rangliste: true } },
  ];
}

const S = (key: string, tabelle: string, baue: (ctx: XxlKontext) => SeedZeile[], ohneId = false): FachSeeder => ({ key, tabelle, baue, ohneId });

/** Eltern vor Kindern. */
export const PREMIUM_SEEDER: FachSeeder[] = [
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
  S('projekte', 'projekte', projekte),
  S('aufgaben', 'aufgaben', aufgaben),
  S('hr_abwesenheiten', 'hr_abwesenheiten', abwesenheiten),
  S('marketing_kampagnen', 'marketing_kampagnen', kampagnen),
  S('marketing_inhalte', 'marketing_inhalte', inhalte),
  S('marketing_kalender', 'marketing_kalender', redaktionskalender),
  S('social_beitrag', 'social_beitrag', socialEntwuerfe),
  S('modul_einstellung', 'modul_einstellung', einstellungen),
];

/** Kinder vor Eltern (vor der Übungswelt-Reihenfolge, die mit den Kontakten endet). */
export const PREMIUM_LOESCH_ORDER: string[] = [
  'miet_buchung', 'miet_fahrzeug', 'werkstatt_positionen', 'werkstatt_auftraege', 'werkstatt_fahrzeuge', 'kfz_fahrzeuge',
  'kfz_verkauf', 'kfz_ankauf', 'kfz_zulassung', 'kfz_tresor', 'kfz_probefahrt', 'kfz_rote_kennzeichen', 'kfz_suchauftrag',
  'kfz_anfrage', 'kfz_marktvergleich', 'kfz_bestand_kosten', 'kfz_bestand', 'termine',
  'social_beitrag', 'marketing_kalender', 'marketing_inhalte', 'marketing_kampagnen', 'aufgaben', 'projekte',
  'hr_abwesenheiten', 'modul_einstellung', 'mitarbeiter',
];

/** Tabellen ohne `id`, die beim Zurücksetzen über den Besitzer geleert werden (nur das Vorführ-Konto). */
export const PREMIUM_BESITZER_TABELLEN: string[] = ['miet_einstellung'];
