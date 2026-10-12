// ============================================================================
// ARGONAUT OS · lib/reife.ts — Paket 339 (12.10.2026) · BV3a Manufaktur Teil 1
//
// Reife-Uhr für Manufakturen: Dry-Aged, Rohschinken, Rohwurst, Käse, Wein,
// Confiserie. Je Reife-Charge: Start, Ziel-Reifezeit (frühestens/spätestens),
// Startmenge, Soll-Klima. Messungen (Gewicht, Temperatur, Luftfeuchte) zeigen
// Reifeverlust und Abweichungen vom Soll-Klima.
//
// Regeln:
//   - Vorgaben je Art sind STARTWERTE zum Überschreiben — keine Rezeptur,
//     keine Lebensmittelsicherheits-Aussage (das bleibt beim Betrieb/HACCP).
//   - Tage zählen nach Kalendertagen (Datum ohne Uhrzeit, „heute" als
//     Parameter, keine Systemuhr).
//   - Verlust nur aus Zahlen, die der Betrieb selbst gewogen hat.
//
// Reine Logik, keine React-/Supabase-Imports.
// ============================================================================

import { rundeStellen } from './zahlen';

export const REIFE_ARTEN = ['dry_aged', 'rohschinken', 'rohwurst', 'kaese', 'wein', 'confiserie', 'sonstig'] as const;
export type ReifeArt = typeof REIFE_ARTEN[number];

export const REIFE_STATUS = ['reift', 'bereit', 'abgeschlossen', 'verworfen'] as const;
export type ReifeStatus = typeof REIFE_STATUS[number];

export const REIFE_EINHEITEN = ['kg', 'g', 'l', 'Stk'] as const;

export type ReifeVorlage = {
  label: string;
  symbol: string;
  zielTage: number | null;
  minTage: number | null;
  maxTage: number | null;
  temp: [number, number] | null;
  feuchte: [number, number] | null;
  einheit: (typeof REIFE_EINHEITEN)[number];
  /** Wird der Verlust gewogen? (Wein: nein, Füllstand statt Gewicht) */
  verlust: boolean;
};

/** Startwerte je Art — vom Betrieb zu überschreiben. */
export const REIFE_VORLAGEN: Record<ReifeArt, ReifeVorlage> = {
  dry_aged:    { label: 'Dry-Aged (Fleisch)', symbol: '🥩', zielTage: 28,  minTage: 21,  maxTage: 60,  temp: [1, 3],   feuchte: [75, 85], einheit: 'kg', verlust: true },
  rohschinken: { label: 'Rohschinken',        symbol: '🍖', zielTage: 270, minTage: 180, maxTage: 540, temp: [12, 16], feuchte: [70, 80], einheit: 'kg', verlust: true },
  rohwurst:    { label: 'Rohwurst / Salami',  symbol: '🌭', zielTage: 30,  minTage: 21,  maxTage: 90,  temp: [12, 18], feuchte: [75, 85], einheit: 'kg', verlust: true },
  kaese:       { label: 'Käse',               symbol: '🧀', zielTage: 120, minTage: 60,  maxTage: 365, temp: [10, 14], feuchte: [85, 95], einheit: 'kg', verlust: true },
  wein:        { label: 'Wein (Fass/Flasche)',symbol: '🍷', zielTage: 365, minTage: 180, maxTage: 1095,temp: [10, 15], feuchte: [60, 80], einheit: 'l',  verlust: false },
  confiserie:  { label: 'Confiserie',         symbol: '🍫', zielTage: 2,   minTage: 1,   maxTage: 21,  temp: [15, 18], feuchte: [40, 60], einheit: 'Stk', verlust: false },
  sonstig:     { label: 'Sonstiges',          symbol: '⏳', zielTage: null, minTage: null, maxTage: null, temp: null,  feuchte: null,     einheit: 'kg', verlust: true },
};

export function istReifeArt(x: unknown): x is ReifeArt {
  return typeof x === 'string' && (REIFE_ARTEN as readonly string[]).includes(x);
}
export function vorlage(art: unknown): ReifeVorlage {
  return REIFE_VORLAGEN[istReifeArt(art) ? art : 'sonstig'];
}

// --- Datum ------------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → Tageszahl (UTC-Mitternacht), sonst null. Prüft echte Kalendertage. */
export function tagNr(iso: unknown): number | null {
  const m = ISO.exec(String(iso ?? '').slice(0, 10));
  if (!m) return null;
  const j = +m[1], mo = +m[2], t = +m[3];
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  return Math.round(d.getTime() / 86400000);
}
function isoVon(nr: number): string {
  return new Date(nr * 86400000).toISOString().slice(0, 10);
}
/** Datum + n Tage. */
export function plusTage(iso: string, n: number): string | null {
  const t = tagNr(iso);
  return t === null ? null : isoVon(t + Math.trunc(n));
}
/** Reifetage: Starttag = Tag 0. Vor dem Start null. */
export function reifeTage(start: unknown, heute: unknown): number | null {
  const a = tagNr(start), b = tagNr(heute);
  if (a === null || b === null || b < a) return null;
  return b - a;
}

// --- Reife-Stand --------------------------------------------------------------

export type ReifeCharge = {
  start_datum: string;
  ziel_tage: number | null;
  min_tage?: number | null;
  max_tage?: number | null;
  status?: string | null;
  end_datum?: string | null;
};

export type ReifeStufe = 'geplant' | 'jung' | 'reift' | 'bereit' | 'ueber' | 'fertig' | 'verworfen';
export type ReifeStand = {
  tage: number | null;
  stufe: ReifeStufe;
  /** 0–100 für den Balken (Ziel = 100). */
  prozent: number;
  bereitAb: string | null;   // Datum, ab dem die Mindestreife erreicht ist
  zielAm: string | null;
  spaetestens: string | null;
  text: string;
};

/**
 * Stand einer Charge: Tag X von Ziel, Stufe für die Ampel.
 *  jung   — vor der Mindestreife
 *  reift  — Mindestreife erreicht, Ziel noch nicht
 *  bereit — Ziel erreicht, spätestens-Grenze nicht überschritten
 *  ueber  — über der spätestens-Grenze
 * Abgeschlossene Chargen zählen bis zum Enddatum.
 */
export function reifeStand(c: ReifeCharge, heute: string): ReifeStand {
  const ziel = c.ziel_tage ?? null;
  const min = c.min_tage ?? null;
  const max = c.max_tage ?? null;
  const bis = (c.status === 'abgeschlossen' || c.status === 'verworfen') && c.end_datum ? c.end_datum : heute;
  const tage = reifeTage(c.start_datum, bis);
  const zielAm = ziel !== null ? plusTage(c.start_datum, ziel) : null;
  const bereitAb = plusTage(c.start_datum, min ?? ziel ?? 0);
  const spaetestens = max !== null ? plusTage(c.start_datum, max) : null;
  const prozent = tage === null || !ziel ? 0 : Math.max(0, Math.min(100, Math.round((tage / ziel) * 100)));
  const basis = { tage, prozent, bereitAb: min !== null || ziel !== null ? bereitAb : null, zielAm, spaetestens };
  if (c.status === 'verworfen') return { ...basis, stufe: 'verworfen', text: 'verworfen' };
  if (c.status === 'abgeschlossen') return { ...basis, stufe: 'fertig', text: tage === null ? 'abgeschlossen' : `abgeschlossen nach ${tage} Tagen` };
  if (tage === null) return { ...basis, stufe: 'geplant', text: `startet am ${datumText(c.start_datum)}` };
  const tagText = ziel ? `Tag ${tage} von ${ziel}` : `Tag ${tage}`;
  if (max !== null && tage > max) return { ...basis, stufe: 'ueber', text: `${tagText} · ${tage - max} ${tage - max === 1 ? 'Tag' : 'Tage'} über der Höchstreife` };
  if (ziel !== null && tage >= ziel) return { ...basis, stufe: 'bereit', text: `${tagText} · Ziel erreicht` };
  const mindest = min ?? ziel;
  if (mindest !== null && tage >= mindest) {
    const rest = ziel !== null ? ziel - tage : null;
    return { ...basis, stufe: 'reift', text: rest !== null ? `${tagText} · Mindestreife erreicht, Ziel in ${rest} ${rest === 1 ? 'Tag' : 'Tagen'}` : `${tagText} · Mindestreife erreicht` };
  }
  if (mindest !== null) return { ...basis, stufe: 'jung', text: `${tagText} · Mindestreife in ${mindest - tage} ${mindest - tage === 1 ? 'Tag' : 'Tagen'}` };
  return { ...basis, stufe: 'reift', text: tagText };
}

/** Reihenfolge für die Liste: was Aufmerksamkeit braucht nach oben. */
export function stufenRang(s: ReifeStufe): number {
  return { ueber: 0, bereit: 1, reift: 2, jung: 3, geplant: 4, fertig: 5, verworfen: 6 }[s];
}

export function datumText(iso: unknown): string {
  const m = ISO.exec(String(iso ?? '').slice(0, 10));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
}

// --- Messungen und Verlust --------------------------------------------------

export type ReifeMessung = { datum: string; menge?: number | null; temperatur?: number | null; feuchte?: number | null; erstellt_am?: string | null };

/** Neueste Messung mit Menge (nach Datum, dann Erfassungszeit). */
export function letzteMenge(messungen: ReifeMessung[]): { datum: string; menge: number } | null {
  const mit = messungen.filter((m) => typeof m.menge === 'number' && Number.isFinite(m.menge) && (m.menge as number) > 0);
  if (!mit.length) return null;
  const s = [...mit].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : String(b.erstellt_am ?? '').localeCompare(String(a.erstellt_am ?? ''))));
  return { datum: s[0].datum, menge: s[0].menge as number };
}

/** Reifeverlust in Prozent (1 Nachkommastelle) — null ohne Zahlen; negativ = Zunahme (Wiegefehler?). */
export function verlustProzent(startMenge: number | null | undefined, aktuell: number | null | undefined): number | null {
  if (!startMenge || startMenge <= 0 || aktuell === null || aktuell === undefined || !(aktuell > 0)) return null;
  return rundeStellen(((startMenge - aktuell) / startMenge) * 100, 1);
}

export type Klima = { temp_min?: number | null; temp_max?: number | null; feuchte_min?: number | null; feuchte_max?: number | null };

/** Abweichungen einer Messung vom Soll-Klima (leer = alles im Rahmen oder kein Soll). */
export function klimaAbweichung(m: ReifeMessung, k: Klima): string[] {
  const aus: string[] = [];
  const t = m.temperatur, f = m.feuchte;
  const zahl = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  if (typeof t === 'number') {
    if (typeof k.temp_min === 'number' && t < k.temp_min) aus.push(`Temperatur ${zahl(t)} °C unter Soll ${zahl(k.temp_min)} °C`);
    if (typeof k.temp_max === 'number' && t > k.temp_max) aus.push(`Temperatur ${zahl(t)} °C über Soll ${zahl(k.temp_max)} °C`);
  }
  if (typeof f === 'number') {
    if (typeof k.feuchte_min === 'number' && f < k.feuchte_min) aus.push(`Luftfeuchte ${zahl(f)} % unter Soll ${zahl(k.feuchte_min)} %`);
    if (typeof k.feuchte_max === 'number' && f > k.feuchte_max) aus.push(`Luftfeuchte ${zahl(f)} % über Soll ${zahl(k.feuchte_max)} %`);
  }
  return aus;
}

/** Tage seit der letzten Messung (für „lange nicht gemessen"). */
export function tageOhneMessung(messungen: ReifeMessung[], start: string, heute: string): number | null {
  const letzte = messungen.reduce<string | null>((a, m) => (tagNr(m.datum) !== null && (a === null || m.datum > a) ? m.datum : a), null);
  return reifeTage(letzte ?? start, heute);
}

// --- Eingaben prüfen ----------------------------------------------------------

export type ChargeEingabe = {
  produkt: string; art: string; start_datum: string;
  ziel_tage: number | null; min_tage: number | null; max_tage: number | null;
  start_menge: number | null; einheit: string; lagerort: string;
  temp_min: number | null; temp_max: number | null; feuchte_min: number | null; feuchte_max: number | null;
  notiz: string;
};

const ganz = (x: number | null, lo: number, hi: number) => x === null || (Number.isInteger(x) && x >= lo && x <= hi);
const imBereich = (x: number | null, lo: number, hi: number) => x === null || (Number.isFinite(x) && x >= lo && x <= hi);

export function chargePruefen(e: ChargeEingabe, heute: string): { ok: true; felder: Record<string, unknown> } | { ok: false; fehler: string } {
  const produkt = e.produkt.trim();
  if (produkt.length < 1 || produkt.length > 120) return { ok: false, fehler: 'Bitte das Produkt benennen (höchstens 120 Zeichen).' };
  if (!istReifeArt(e.art)) return { ok: false, fehler: 'Bitte die Art wählen.' };
  const start = tagNr(e.start_datum);
  if (start === null) return { ok: false, fehler: 'Bitte ein gültiges Startdatum eintragen.' };
  const h = tagNr(heute);
  if (h !== null && start > h + 366) return { ok: false, fehler: 'Das Startdatum liegt mehr als ein Jahr in der Zukunft.' };
  if (!ganz(e.ziel_tage, 1, 3650) || !ganz(e.min_tage, 0, 3650) || !ganz(e.max_tage, 1, 3650)) return { ok: false, fehler: 'Reifezeiten bitte als ganze Tage (1 bis 3.650).' };
  if (e.ziel_tage === null) return { ok: false, fehler: 'Bitte die Ziel-Reifezeit in Tagen eintragen.' };
  if (e.min_tage !== null && e.min_tage > e.ziel_tage) return { ok: false, fehler: 'Die Mindestreife darf nicht länger sein als das Ziel.' };
  if (e.max_tage !== null && e.max_tage < e.ziel_tage) return { ok: false, fehler: 'Die Höchstreife darf nicht kürzer sein als das Ziel.' };
  if (e.start_menge !== null && !(e.start_menge > 0 && e.start_menge <= 1_000_000)) return { ok: false, fehler: 'Die Startmenge bitte als positive Zahl eintragen.' };
  if (!(REIFE_EINHEITEN as readonly string[]).includes(e.einheit)) return { ok: false, fehler: 'Bitte eine Einheit wählen.' };
  if (!imBereich(e.temp_min, -40, 60) || !imBereich(e.temp_max, -40, 60)) return { ok: false, fehler: 'Temperatur bitte zwischen -40 und 60 °C.' };
  if (!imBereich(e.feuchte_min, 0, 100) || !imBereich(e.feuchte_max, 0, 100)) return { ok: false, fehler: 'Luftfeuchte bitte zwischen 0 und 100 %.' };
  if (e.temp_min !== null && e.temp_max !== null && e.temp_min > e.temp_max) return { ok: false, fehler: 'Temperatur: „von" ist größer als „bis".' };
  if (e.feuchte_min !== null && e.feuchte_max !== null && e.feuchte_min > e.feuchte_max) return { ok: false, fehler: 'Luftfeuchte: „von" ist größer als „bis".' };
  if (e.lagerort.trim().length > 80) return { ok: false, fehler: 'Lagerort höchstens 80 Zeichen.' };
  if (e.notiz.trim().length > 500) return { ok: false, fehler: 'Notiz höchstens 500 Zeichen.' };
  return {
    ok: true,
    felder: {
      produkt, art: e.art, start_datum: isoVon(start),
      ziel_tage: e.ziel_tage, min_tage: e.min_tage, max_tage: e.max_tage,
      start_menge: e.start_menge, einheit: e.einheit, lagerort: e.lagerort.trim() || null,
      temp_min: e.temp_min, temp_max: e.temp_max, feuchte_min: e.feuchte_min, feuchte_max: e.feuchte_max,
      notiz: e.notiz.trim() || null,
    },
  };
}

export type MessungEingabe = { datum: string; menge: number | null; temperatur: number | null; feuchte: number | null; notiz: string };

export function messungPruefen(e: MessungEingabe, start: string, heute: string): { ok: true; felder: Record<string, unknown> } | { ok: false; fehler: string } {
  const d = tagNr(e.datum), s = tagNr(start), h = tagNr(heute);
  if (d === null) return { ok: false, fehler: 'Bitte ein gültiges Datum eintragen.' };
  if (s !== null && d < s) return { ok: false, fehler: 'Die Messung liegt vor dem Start der Reifung.' };
  if (h !== null && d > h) return { ok: false, fehler: 'Messungen in der Zukunft gehen nicht.' };
  if (e.menge === null && e.temperatur === null && e.feuchte === null) return { ok: false, fehler: 'Bitte mindestens Gewicht, Temperatur oder Luftfeuchte eintragen.' };
  if (e.menge !== null && !(e.menge > 0 && e.menge <= 1_000_000)) return { ok: false, fehler: 'Die Menge bitte als positive Zahl eintragen.' };
  if (!imBereich(e.temperatur, -40, 60)) return { ok: false, fehler: 'Temperatur bitte zwischen -40 und 60 °C.' };
  if (!imBereich(e.feuchte, 0, 100)) return { ok: false, fehler: 'Luftfeuchte bitte zwischen 0 und 100 %.' };
  if (e.notiz.trim().length > 200) return { ok: false, fehler: 'Notiz höchstens 200 Zeichen.' };
  return { ok: true, felder: { datum: isoVon(d), menge: e.menge, temperatur: e.temperatur, feuchte: e.feuchte, notiz: e.notiz.trim() || null } };
}

/** Nächste Chargennummer RF-JJJJ-NNN (fortlaufend je Jahr, Lücken werden nicht gefüllt). */
export function naechsteNummer(vorhanden: (string | null | undefined)[], jahr: number): string {
  const re = new RegExp(`^RF-${jahr}-(\\d{3,})$`);
  let max = 0;
  for (const n of vorhanden) {
    const m = re.exec(String(n ?? ''));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `RF-${jahr}-${String(max + 1).padStart(3, '0')}`;
}

/** Übersicht für die Kacheln oben. */
export function reifeUebersicht(staende: ReifeStand[]): { laufend: number; bereit: number; ueber: number; jung: number } {
  let laufend = 0, bereit = 0, ueber = 0, jung = 0;
  for (const s of staende) {
    if (s.stufe === 'fertig' || s.stufe === 'verworfen') continue;
    laufend++;
    if (s.stufe === 'bereit') bereit++;
    if (s.stufe === 'ueber') ueber++;
    if (s.stufe === 'jung' || s.stufe === 'geplant') jung++;
  }
  return { laufend, bereit, ueber, jung };
}
