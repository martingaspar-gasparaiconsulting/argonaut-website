// ============================================================================
// ARGONAUT OS · lib/feiertage.ts
// Zentraler, dependency-freier Feiertags-Rechner für alle 16 Bundesländer.
// Single source of truth — ersetzt langfristig die verstreuten Inline-Logiken.
//
// Kern: gesetzliche Feiertage in Deutschland, bundesweit + länderspezifisch.
// Ostern wird über die Gauß'sche Osterformel (Meeus/Butcher) berechnet, alle
// beweglichen Feiertage leiten sich davon ab. Keine externen Pakete.
//
// Zeit-Konvention: Feiertage sind reine KALENDERTAGE (kein Uhrzeit-Bezug).
// Datum wird durchgängig als String 'YYYY-MM-DD' geführt (zeitzonensicher).
// ============================================================================

export type BundeslandCode =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

export interface Feiertag {
  datum: string;   // 'YYYY-MM-DD'
  name: string;
}

// --- Bundesland-Normalisierung ----------------------------------------------
// Akzeptiert Codes ('BW') und volle Namen ('Baden-Württemberg'), robust gegen
// Umlaute, Bindestriche und Groß/Kleinschreibung. Unbekannt -> null.

const BL_MAP: Record<string, BundeslandCode> = {
  bw: 'BW', badenwuerttemberg: 'BW',
  by: 'BY', bayern: 'BY',
  be: 'BE', berlin: 'BE',
  bb: 'BB', brandenburg: 'BB',
  hb: 'HB', bremen: 'HB',
  hh: 'HH', hamburg: 'HH',
  he: 'HE', hessen: 'HE',
  mv: 'MV', mecklenburgvorpommern: 'MV',
  ni: 'NI', niedersachsen: 'NI',
  nw: 'NW', nordrheinwestfalen: 'NW',
  rp: 'RP', rheinlandpfalz: 'RP',
  sl: 'SL', saarland: 'SL',
  sn: 'SN', sachsen: 'SN',
  st: 'ST', sachsenanhalt: 'ST',
  sh: 'SH', schleswigholstein: 'SH',
  th: 'TH', thueringen: 'TH',
};

export function normalizeBundesland(input: string | null | undefined): BundeslandCode | null {
  if (!input) return null;
  const k = input
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[\s\-_.]/g, '');
  return BL_MAP[k] ?? null;
}

// --- Datums-Helfer (zeitzonensicher über UTC) -------------------------------

function pad(n: number): string { return n < 10 ? '0' + n : String(n); }

/** UTC-Mitternacht für ein festes Datum. */
function fest(jahr: number, monat: number, tag: number): Date {
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

/** N Tage addieren (in UTC, damit keine Sommerzeit-Sprünge stören). */
function addTage(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

/** Formatiert ein (UTC-)Date als 'YYYY-MM-DD'. */
function isoUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Formatiert ein Date nach LOKALEM Kalendertag als 'YYYY-MM-DD'. */
function isoLokal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Wandelt Date | 'YYYY-MM-DD' | ISO sicher in ein Date (lokal für Nur-Datum). */
function zuDate(w: Date | string | null | undefined): Date | null {
  if (!w) return null;
  if (w instanceof Date) return isNaN(w.getTime()) ? null : w;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(w.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(w);
  return isNaN(d.getTime()) ? null : d;
}

// --- Ostersonntag (Gauß / Meeus-Butcher) ------------------------------------

/** Ostersonntag des Jahres als UTC-Mitternacht. */
export function osterSonntag(jahr: number): Date {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31); // 3=März, 4=April
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return fest(jahr, monat, tag);
}

/** Buß- und Bettag: der Mittwoch vor dem 23. November (nur SN). */
function bussUndBettag(jahr: number): Date {
  let d = fest(jahr, 11, 22);
  while (d.getUTCDay() !== 3) d = addTage(d, -1); // 3 = Mittwoch
  return d;
}

// --- Feiertags-Berechnung ----------------------------------------------------

/** Alle gesetzlichen Feiertage eines Jahres für ein Bundesland (Code oder Name). */
export function feiertageImJahr(jahr: number, bundesland?: string | null): Feiertag[] {
  const bl = normalizeBundesland(bundesland);
  const ostern = osterSonntag(jahr);
  const list: Feiertag[] = [];
  const add = (d: Date, name: string) => list.push({ datum: isoUTC(d), name });

  // Bundesweit (fix)
  add(fest(jahr, 1, 1), 'Neujahr');
  add(fest(jahr, 5, 1), 'Tag der Arbeit');
  add(fest(jahr, 10, 3), 'Tag der Deutschen Einheit');
  add(fest(jahr, 12, 25), '1. Weihnachtsfeiertag');
  add(fest(jahr, 12, 26), '2. Weihnachtsfeiertag');
  // Bundesweit (Ostern-basiert)
  add(addTage(ostern, -2), 'Karfreitag');
  add(addTage(ostern, 1), 'Ostermontag');
  add(addTage(ostern, 39), 'Christi Himmelfahrt');
  add(addTage(ostern, 50), 'Pfingstmontag');

  if (bl) {
    const has = (...codes: BundeslandCode[]) => codes.includes(bl);

    if (has('BW', 'BY', 'ST')) add(fest(jahr, 1, 6), 'Heilige Drei Könige');
    if (has('BE') && jahr >= 2019) add(fest(jahr, 3, 8), 'Internationaler Frauentag');
    if (has('MV') && jahr >= 2023) add(fest(jahr, 3, 8), 'Internationaler Frauentag');
    if (has('BW', 'BY', 'HE', 'NW', 'RP', 'SL')) add(addTage(ostern, 60), 'Fronleichnam');
    if (has('SL')) add(fest(jahr, 8, 15), 'Mariä Himmelfahrt'); // BY nur gemeindeabhängig
    if (has('TH') && jahr >= 2019) add(fest(jahr, 9, 20), 'Weltkindertag');
    // Reformationstag: 5 östliche Länder schon lange; HB/HH/NI/SH dauerhaft ab 2018
    if (has('BB', 'MV', 'SN', 'ST', 'TH') || (jahr >= 2018 && has('HB', 'HH', 'NI', 'SH'))) {
      add(fest(jahr, 10, 31), 'Reformationstag');
    }
    if (has('BW', 'BY', 'NW', 'RP', 'SL')) add(fest(jahr, 11, 1), 'Allerheiligen');
    if (has('SN')) add(bussUndBettag(jahr), 'Buß- und Bettag');
  }

  return list.sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : 0));
}

/** Ist der Tag ein Feiertag? Gibt den Feiertag zurück oder null. */
export function istFeiertag(datum: Date | string, bundesland?: string | null): Feiertag | null {
  const d = zuDate(datum);
  if (!d) return null;
  const iso = isoLokal(d);
  const treffer = feiertageImJahr(d.getFullYear(), bundesland).find((f) => f.datum === iso);
  return treffer ?? null;
}

/** Alle Feiertage in einem Datumsbereich [von, bis] (inklusive), jahresübergreifend. */
export function feiertageImZeitraum(
  von: Date | string,
  bis: Date | string,
  bundesland?: string | null,
): Feiertag[] {
  const dv = zuDate(von);
  const db = zuDate(bis);
  if (!dv || !db) return [];
  const vIso = isoLokal(dv);
  const bIso = isoLokal(db);
  const res: Feiertag[] = [];
  for (let j = dv.getFullYear(); j <= db.getFullYear(); j++) {
    for (const f of feiertageImJahr(j, bundesland)) {
      if (f.datum >= vIso && f.datum <= bIso) res.push(f);
    }
  }
  return res;
}

/** Menge der Feiertags-Datumsstrings im Zeitraum — schneller Lookup für Slot-Logik. */
export function feiertagsSet(
  von: Date | string,
  bis: Date | string,
  bundesland?: string | null,
): Set<string> {
  return new Set(feiertageImZeitraum(von, bis, bundesland).map((f) => f.datum));
}
