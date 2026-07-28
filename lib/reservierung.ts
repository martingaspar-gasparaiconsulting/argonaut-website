// lib/reservierung.ts
// B-II · Reservierung & Platzverwaltung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// EIN Modul deckt drei Betriebsarten ab, gesteuert ueber `art`:
//   · tischreservierung — Gastro: Tisch/Platz zu einem Zeitfenster, mit No-Show.
//   · einlagerung       — Reifenhotel/KFZ: Verwahrung (§688 BGB), Saison rein/raus,
//                         Verwertung erst nach Laufzeit + 14-Tage-Frist.
//   · vorbestellung     — Theke/Lebensmittel: Artikel-Vorbestellung zum Abholtermin.
//
// Alle Betraege sind netto. Zeit-Intervalle sind halb-offen [von, bis): das Ende
// eines Tisch-Zeitfensters kollidiert NICHT mit dem Beginn des naechsten.
// Node-getestet (reservierung.test.mjs).

export type ResArt = 'tischreservierung' | 'einlagerung' | 'vorbestellung';
export type PlatzArt = 'tisch' | 'lagerplatz' | 'theke';

export interface ResArtInfo {
  key: ResArt;
  label: string;
  icon: string;
  platzArt: PlatzArt;
  platzLabel: string;      // wie der zugehoerige Platz heisst
  zeitLabel: string;       // wofuer das `von`-Datum steht
  hatZeitfenster: boolean; // nutzt von+bis als Zeitfenster (Tisch)
  hatBetrag: boolean;      // Gebuehr/Anzahlung sinnvoll
}

export const RES_ARTEN: ResArtInfo[] = [
  { key: 'tischreservierung', label: 'Tischreservierung', icon: '🍽', platzArt: 'tisch',      platzLabel: 'Tisch',      zeitLabel: 'Zeitfenster',    hatZeitfenster: true,  hatBetrag: false },
  { key: 'einlagerung',       label: 'Einlagerung',       icon: '🛞', platzArt: 'lagerplatz', platzLabel: 'Lagerplatz', zeitLabel: 'Eingelagert am', hatZeitfenster: false, hatBetrag: true  },
  { key: 'vorbestellung',     label: 'Vorbestellung',     icon: '🥐', platzArt: 'theke',      platzLabel: 'Theke/Station', zeitLabel: 'Abholtermin',  hatZeitfenster: false, hatBetrag: true  },
];

export function resArtInfo(art: ResArt): ResArtInfo {
  return RES_ARTEN.find((a) => a.key === art) ?? RES_ARTEN[0];
}

export const PLATZ_ARTEN: { key: PlatzArt; label: string }[] = [
  { key: 'tisch',      label: 'Tisch / Sitzplatz' },
  { key: 'lagerplatz', label: 'Lagerplatz / Regalfach' },
  { key: 'theke',      label: 'Theke / Ausgabestation' },
];

// ---------------------------------------------------------------------------
// Status je Betriebsart. `farbe` ist ein Palette-Schluessel (siehe Seite).
// ---------------------------------------------------------------------------
export type Farbe = 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' | 'warn';
export interface StatusInfo { label: string; farbe: Farbe; }

export const STATUS_JE_ART: Record<ResArt, Record<string, StatusInfo>> = {
  tischreservierung: {
    reserviert: { label: '📅 reserviert', farbe: 'cyan' },
    bestaetigt: { label: '✓ bestätigt',   farbe: 'gold' },
    erschienen: { label: '🍽 erschienen',  farbe: 'green' },
    no_show:    { label: '⚠ No-Show',     farbe: 'warn' },
    storniert:  { label: '✕ storniert',   farbe: 'textDim' },
  },
  einlagerung: {
    eingelagert:  { label: '🛞 eingelagert',   farbe: 'green' },
    zur_abholung: { label: '🔔 zur Abholung',  farbe: 'gold' },
    ausgelagert:  { label: '📤 ausgelagert',   farbe: 'textDim' },
    entsorgt:     { label: '🗑 entsorgt',       farbe: 'danger' },
  },
  vorbestellung: {
    offen:     { label: '📝 offen',     farbe: 'cyan' },
    bereit:    { label: '🔔 bereit',    farbe: 'gold' },
    abgeholt:  { label: '✓ abgeholt',   farbe: 'green' },
    storniert: { label: '✕ storniert',  farbe: 'textDim' },
  },
};

/** Erststatus beim Anlegen je Betriebsart. */
export const START_STATUS: Record<ResArt, string> = {
  tischreservierung: 'reserviert',
  einlagerung: 'eingelagert',
  vorbestellung: 'offen',
};

/** Als "erledigt/abgeschlossen" geltende Status (fuer KPI-Zaehlung). */
export const ERLEDIGT_STATUS: Record<ResArt, string[]> = {
  tischreservierung: ['erschienen', 'no_show', 'storniert'],
  einlagerung: ['ausgelagert', 'entsorgt'],
  vorbestellung: ['abgeholt', 'storniert'],
};

export function statusInfo(art: ResArt, status: string): StatusInfo {
  const m = STATUS_JE_ART[art] ?? {};
  return m[status] ?? { label: status, farbe: 'textDim' };
}

// ---------------------------------------------------------------------------
// Zeit-Helfer (DST-sicher ueber UTC-Mitternacht fuer Tages-Differenzen).
// ---------------------------------------------------------------------------
const MS_TAG = 86400000;

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function tagUTC(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 10) {
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (y && m && d) return Date.UTC(y, m - 1, d);
  }
  const dt = toDate(v);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

/** Stunden zwischen zwei Zeitpunkten (2 Nachkommastellen), sonst 0. */
export function dauerStunden(von: string | Date, bis: string | Date): number {
  const ms = toDate(bis).getTime() - toDate(von).getTime();
  if (!(ms > 0)) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}

/** Ganze Tage zwischen zwei Daten (Kalendertage-Differenz, >= 0). */
export function tageDiff(von: string | Date, bis: string | Date): number {
  const n = Math.round((tagUTC(bis) - tagUTC(von)) / MS_TAG);
  return n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Tisch-Konflikte (nur tischreservierung) — halb-offene Zeitfenster.
// ---------------------------------------------------------------------------
export interface Zeitfenster { von: string | Date; bis: string | Date; }

export function ueberschneidet(a: Zeitfenster, b: Zeitfenster): boolean {
  const aV = toDate(a.von).getTime(), aB = toDate(a.bis).getTime();
  const bV = toDate(b.von).getTime(), bB = toDate(b.bis).getTime();
  return aV < bB && bV < aB;
}

export interface VorgangLite {
  id?: string;
  art?: string;
  platz_id?: string | null;
  von?: string | Date | null;
  bis?: string | Date | null;
  status?: string;
}

/** Tisch-Reservierungen desselben Platzes, die sich mit [von,bis) ueberschneiden.
 *  Ignoriert stornierte/no_show und optional die eigene id (beim Bearbeiten). */
export function konflikteTisch(
  platzId: string, von: string | Date, bis: string | Date,
  vorgaenge: VorgangLite[], ignoreId?: string,
): VorgangLite[] {
  if (!platzId || !von || !bis) return [];
  const ziel: Zeitfenster = { von, bis };
  return vorgaenge.filter((v) =>
    v.art === 'tischreservierung' &&
    v.platz_id === platzId &&
    v.status !== 'storniert' && v.status !== 'no_show' &&
    v.id !== ignoreId &&
    v.von != null && v.bis != null &&
    ueberschneidet(ziel, { von: v.von, bis: v.bis }),
  );
}

export function tischFrei(
  platzId: string, von: string | Date, bis: string | Date,
  vorgaenge: VorgangLite[], ignoreId?: string,
): boolean {
  return konflikteTisch(platzId, von, bis, vorgaenge, ignoreId).length === 0;
}

// ---------------------------------------------------------------------------
// Einlagerung (Reifenhotel): Verwahrung §688 BGB.
// Verwertung/Entsorgung ist erst nach Ablauf der Vertragslaufzeit (Standard
// 12 Monate) PLUS einer schriftlichen 14-Tage-Frist zulaessig.
// ---------------------------------------------------------------------------
export const LAGER_LAUFZEIT_TAGE = 365;
export const LAGER_FRIST_TAGE = 14;

export interface LagerLage {
  tageEingelagert: number;
  ueberLaufzeit: boolean;     // Vertragslaufzeit ueberschritten
  verwertbar: boolean;       // Laufzeit + 14-Tage-Frist ueberschritten
  restTageBisVerwertung: number; // >0 = so lange noch nicht verwertbar
}

export function lagerLage(
  eingelagertAm: string | Date, jetzt: string | Date = new Date(),
  laufzeitTage: number = LAGER_LAUFZEIT_TAGE, fristTage: number = LAGER_FRIST_TAGE,
): LagerLage {
  const tage = tageDiff(eingelagertAm, jetzt);
  const grenzeVerwertung = laufzeitTage + fristTage;
  return {
    tageEingelagert: tage,
    ueberLaufzeit: tage >= laufzeitTage,
    verwertbar: tage >= grenzeVerwertung,
    restTageBisVerwertung: Math.max(grenzeVerwertung - tage, 0),
  };
}

// ---------------------------------------------------------------------------
// Vorbestellung: offen & Abholtermin erreicht -> Aufmerksamkeit.
// ---------------------------------------------------------------------------
export function abholUeberfaellig(v: VorgangLite, jetzt: string | Date = new Date()): boolean {
  if (v.art !== 'vorbestellung') return false;
  if (v.status !== 'offen' && v.status !== 'bereit') return false;
  if (!v.von) return false;
  return toDate(v.von).getTime() <= toDate(jetzt).getTime();
}

// ---------------------------------------------------------------------------
// Betrag (Gebuehr/Anzahlung) — netto -> mwst -> brutto.
// ---------------------------------------------------------------------------
export interface BetragErgebnis { netto: number; mwstSatz: number; mwst: number; brutto: number; }

export function betragBrutto(netto: number, mwstSatz: number = 19): BetragErgebnis {
  const n = r2(Number(netto) || 0);
  const satz = Number(mwstSatz) || 0;
  const mwst = r2(n * satz / 100);
  return { netto: n, mwstSatz: satz, mwst, brutto: r2(n + mwst) };
}

// ---------------------------------------------------------------------------
// KPI-Zaehler (fuer die Seite + augeReservierung).
// ---------------------------------------------------------------------------
export interface ResKennzahlen {
  aktivePlaetze: number;
  tischHeute: number;        // heutige, nicht stornierte/no-show Tischreservierungen
  noShowGesamt: number;      // No-Shows (alle)
  eingelagertAktiv: number;  // laufende Einlagerungen
  verwertungFaellig: number; // Einlagerungen ueber Laufzeit+Frist
  vorbestellungOffen: number;
  abholUeberfaellig: number; // Vorbestellungen mit erreichtem Abholtermin, noch offen/bereit
}

function istHeute(v: string | Date, jetzt: string | Date): boolean {
  return tagUTC(v) === tagUTC(jetzt);
}

export function zaehleReservierung(
  plaetze: { status?: string }[],
  vorgaenge: VorgangLite[],
  jetzt: string | Date = new Date(),
): ResKennzahlen {
  const aktivePlaetze = plaetze.filter((p) => (p.status ?? 'aktiv') === 'aktiv').length;
  const tischHeute = vorgaenge.filter((v) =>
    v.art === 'tischreservierung' && v.von != null &&
    v.status !== 'storniert' && v.status !== 'no_show' &&
    istHeute(v.von, jetzt),
  ).length;
  const noShowGesamt = vorgaenge.filter((v) => v.art === 'tischreservierung' && v.status === 'no_show').length;
  const eingelagertAktiv = vorgaenge.filter((v) =>
    v.art === 'einlagerung' && (v.status === 'eingelagert' || v.status === 'zur_abholung'),
  ).length;
  const verwertungFaellig = vorgaenge.filter((v) =>
    v.art === 'einlagerung' && (v.status === 'eingelagert' || v.status === 'zur_abholung') &&
    v.von != null && lagerLage(v.von, jetzt).verwertbar,
  ).length;
  const vorbestellungOffen = vorgaenge.filter((v) =>
    v.art === 'vorbestellung' && (v.status === 'offen' || v.status === 'bereit'),
  ).length;
  const abholUeber = vorgaenge.filter((v) => abholUeberfaellig(v, jetzt)).length;
  return {
    aktivePlaetze,
    tischHeute,
    noShowGesamt,
    eingelagertAktiv,
    verwertungFaellig,
    vorbestellungOffen,
    abholUeberfaellig: abholUeber,
  };
}
