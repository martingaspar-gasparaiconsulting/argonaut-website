// lib/belegung.ts
// A4 · Belegung generisch — reine Formeln & Logik (KEINE Hooks, KEINE Supabase-Aufrufe).
// Deckt Ferienwohnung, Camping/Stellplatz, Halle/Bahn/Platz und Serviced Apartments
// mit EINEM Modul ab: die Abrechnungsart (nacht|tag|stunde) schaltet die Rechenlogik um.
// Alle Beträge sind netto. Die Kaution ist KEIN Umsatz und fließt NICHT in netto/mwst/brutto.
// Zeit-Intervalle sind halb-offen [von, bis): Abreisetag = Anreisetag des Nächsten kollidiert NICHT.
// Node-getestet (belegung.test.mjs, 23/23) am 27.07.2026.

export type Abrechnungsart = 'nacht' | 'tag' | 'stunde';

export const ABRECHNUNGSARTEN: { key: Abrechnungsart; label: string; einheitLabel: string }[] = [
  { key: 'nacht', label: 'pro Nacht', einheitLabel: 'Nächte' },
  { key: 'tag', label: 'pro Tag', einheitLabel: 'Tage' },
  { key: 'stunde', label: 'pro Stunde', einheitLabel: 'Stunden' },
];

// WICHTIG: von/bis sind IMMER das Belegungs-Intervall [von, bis) mit EXKLUSIVEM Ende.
//  · nacht:  von = Anreise, bis = Abreise  → Nächte = Tagesdifferenz
//  · tag:    von = erster Tag, bis = Tag NACH dem letzten (exklusiv) → Tage = Tagesdifferenz
//  · stunde: von = Beginn, bis = Ende      → Stunden = Zeitdifferenz
// So deckt sich die berechnete Menge exakt mit dem DB-Doppelbelegungs-Schutz.

export const BELEGUNG_STATUS = ['reserviert', 'bestaetigt', 'eingecheckt', 'ausgecheckt', 'storniert'] as const;
export type BelegungStatus = typeof BELEGUNG_STATUS[number];

// Anzeige-Hilfe für Status (Label + Farb-Schlüssel für die Palette C).
export const STATUS_INFO: Record<BelegungStatus, { label: string; farbe: 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' }> = {
  reserviert:  { label: 'Reserviert',  farbe: 'gold' },
  bestaetigt:  { label: 'Bestätigt',   farbe: 'cyan' },
  eingecheckt: { label: 'Eingecheckt', farbe: 'green' },
  ausgecheckt: { label: 'Ausgecheckt', farbe: 'textDim' },
  storniert:   { label: 'Storniert',   farbe: 'danger' },
};

const MS_TAG = 86400000;

// ---------- Zeit-Helfer ----------
function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/** Datums-Anteil (YYYY-MM-DD) als UTC-Mitternacht → stabile, DST-sichere Tagesdifferenz.
 *  Erwartet lokale ISO-Werte (z.B. aus <input type="date"/"datetime-local">). */
function tagUTC(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 10) {
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (y && m && d) return Date.UTC(y, m - 1, d);
  }
  const dt = toDate(v);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function r2(n: number): number { return Math.round(n * 100) / 100; }

/** Nächte zwischen zwei Daten (Kalendertage-Differenz). Mo 14:00 → Mi 11:00 = 2. */
export function naechte(von: string | Date, bis: string | Date): number {
  const n = Math.round((tagUTC(bis) - tagUTC(von)) / MS_TAG);
  return n > 0 ? n : 0;
}

/** Tage (Tages-Abrechnung, exklusives Ende — identisch zur Nächte-Zählung).
 *  Mo→Di = 1 Tag, Mo→Do = 3 Tage. Für 1 Tag ist bis = Folgetag. */
export function tage(von: string | Date, bis: string | Date): number {
  return naechte(von, bis);
}

/** Stunden exakt (2 Nachkommastellen), auf realer Zeitdifferenz. */
export function stunden(von: string | Date, bis: string | Date): number {
  const ms = toDate(bis).getTime() - toDate(von).getTime();
  if (!(ms > 0)) return 0;
  return Math.round((ms / 3600000) * 100) / 100;
}

/** Abrechenbare Menge je Abrechnungsart. */
export function menge(art: Abrechnungsart, von: string | Date, bis: string | Date): number {
  if (art === 'stunde') return stunden(von, bis);
  if (art === 'tag') return tage(von, bis);
  return naechte(von, bis);
}

// ---------- Preis ----------
export interface PreisEingabe {
  art: Abrechnungsart;
  von: string | Date;
  bis: string | Date;
  preisProEinheit: number;      // netto je Nacht/Tag/Stunde
  grundgebuehr?: number;        // netto je Vorgang (z.B. Endreinigung)
  kaution?: number;             // kein Umsatz
  mwstSatz?: number;            // Prozent (7 Beherbergung, 19 Halle/Platz); Default 7
}

export interface PreisErgebnis {
  menge: number;
  einheitenSumme: number;       // preisProEinheit * menge
  grundgebuehr: number;
  netto: number;                // einheitenSumme + grundgebuehr
  mwstSatz: number;
  mwst: number;
  brutto: number;               // netto + mwst  (OHNE Kaution)
  kaution: number;
  zahlbetrag: number;           // brutto + kaution (Gesamt-Hinterlegung des Gasts)
}

export function berechneVorgang(e: PreisEingabe): PreisErgebnis {
  const m = menge(e.art, e.von, e.bis);
  const preis = e.preisProEinheit || 0;
  const grund = e.grundgebuehr || 0;
  const kaution = e.kaution || 0;
  const satz = e.mwstSatz ?? 7;
  const einheitenSumme = r2(preis * m);
  const netto = r2(einheitenSumme + grund);
  const mwst = r2(netto * satz / 100);
  const brutto = r2(netto + mwst);
  return {
    menge: m,
    einheitenSumme,
    grundgebuehr: r2(grund),
    netto,
    mwstSatz: satz,
    mwst,
    brutto,
    kaution: r2(kaution),
    zahlbetrag: r2(brutto + kaution),
  };
}

// ---------- Verfügbarkeit / Überschneidung ----------
export interface Belegzeit {
  von: string | Date;
  bis: string | Date;
  status?: string;
  einheit_id?: string;
  id?: string;
}

/** Halb-offen [von,bis): Abreise=Anreise kollidiert NICHT. */
export function ueberschneidet(a: Belegzeit, b: Belegzeit): boolean {
  const aV = toDate(a.von).getTime(), aB = toDate(a.bis).getTime();
  const bV = toDate(b.von).getTime(), bB = toDate(b.bis).getTime();
  return aV < bB && bV < aB;
}

/** Kollidierende Vorgänge einer Einheit im Zeitraum (stornierte ignoriert,
 *  optional eigene id ausklammern — z.B. beim Bearbeiten). */
export function konflikte(
  einheitId: string, von: string | Date, bis: string | Date,
  vorgaenge: Belegzeit[], ignoreId?: string,
): Belegzeit[] {
  const ziel: Belegzeit = { von, bis };
  return vorgaenge.filter(v =>
    v.einheit_id === einheitId &&
    v.status !== 'storniert' &&
    v.id !== ignoreId &&
    ueberschneidet(ziel, v),
  );
}

export function istFrei(
  einheitId: string, von: string | Date, bis: string | Date,
  vorgaenge: Belegzeit[], ignoreId?: string,
): boolean {
  return konflikte(einheitId, von, bis, vorgaenge, ignoreId).length === 0;
}

// ---------- Status zum Zeitpunkt ----------
export function istAktuellBelegt(v: Belegzeit, jetzt: string | Date = new Date()): boolean {
  if (v.status === 'storniert' || v.status === 'ausgecheckt') return false;
  const t = toDate(jetzt).getTime();
  return toDate(v.von).getTime() <= t && t < toDate(v.bis).getTime();
}

export function istAnreise(v: Belegzeit, tag: string | Date = new Date()): boolean {
  return v.status !== 'storniert' && tagUTC(v.von) === tagUTC(tag);
}

export function istAbreise(v: Belegzeit, tag: string | Date = new Date()): boolean {
  return v.status !== 'storniert' && tagUTC(v.bis) === tagUTC(tag);
}

// ---------- Auslastung (sinnvoll für nacht/tag) ----------
/** Belegte Nächte im Zeitraum [zVon,zBis) / (aktive Einheiten * Nächte im Zeitraum). 0..1 */
export function auslastung(
  anzahlEinheiten: number, vorgaenge: Belegzeit[],
  zVon: string | Date, zBis: string | Date,
): number {
  const kapazitaetNaechte = anzahlEinheiten * naechte(zVon, zBis);
  if (kapazitaetNaechte <= 0) return 0;
  const zv = tagUTC(zVon), zb = tagUTC(zBis);
  let belegt = 0;
  for (const v of vorgaenge) {
    if (v.status === 'storniert') continue;
    const von = Math.max(tagUTC(v.von), zv);
    const bis = Math.min(tagUTC(v.bis), zb);
    const n = Math.round((bis - von) / MS_TAG);
    if (n > 0) belegt += n;
  }
  return Math.round(Math.min(belegt / kapazitaetNaechte, 1) * 1000) / 1000;
}

// ---------- KPI-Zähler (für die Seite + augeBelegung) ----------
export interface BelegungKennzahlen {
  aktiveEinheiten: number;
  belegtJetzt: number;
  freiJetzt: number;
  anreisenHeute: number;
  abreisenHeute: number;
  reservierungenOffen: number;
}

export function zaehleBelegung(
  einheiten: { status?: string }[], vorgaenge: Belegzeit[],
  jetzt: string | Date = new Date(),
): BelegungKennzahlen {
  const aktiveEinheiten = einheiten.filter(e => (e.status ?? 'aktiv') === 'aktiv').length;
  const belegtJetzt = vorgaenge.filter(v => istAktuellBelegt(v, jetzt)).length;
  return {
    aktiveEinheiten,
    belegtJetzt,
    freiJetzt: Math.max(aktiveEinheiten - belegtJetzt, 0),
    anreisenHeute: vorgaenge.filter(v => istAnreise(v, jetzt) && v.status !== 'ausgecheckt').length,
    abreisenHeute: vorgaenge.filter(v => istAbreise(v, jetzt) && v.status !== 'ausgecheckt').length,
    reservierungenOffen: vorgaenge.filter(v => v.status === 'reserviert').length,
  };
}
