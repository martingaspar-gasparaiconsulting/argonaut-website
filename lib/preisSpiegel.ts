// ============================================================================
// ARGONAUT OS · lib/preisSpiegel.ts — Paket 331 (12.10.2026) · PS-1 Preis-Spiegel
//
// Für Dienstleister (Friseur, Gastronomie, Handwerk, Kosmetik …): Wo liegen meine
// Preise im Umfeld? Der Betrieb legt „Posten" an (eine eigene Leistung aus dem
// Leistungskatalog ODER ein freier Posten mit eigenem Preis, z. B. ein Gericht)
// und erfasst dazu Preise von Mitbewerbern SELBST — vom Aushang, der Webseite,
// der Speisekarte. Daraus: Marktmitte, Spanne, Position des eigenen Preises.
//
// GRUNDSÄTZE (wie Kfz-Marktvergleich P276, Anwalt R45)
// - Kein Auslesen fremder Seiten, keine KI-Schätzung, keine gekauften Marktdaten.
// - Keine Personendaten: der Mitbewerber heißt „Mitbewerber A" oder „Salon
//   Innenstadt" — kein Personenname, keine Telefonnummer, keine E-Mail.
//   Ziffernfolgen (Telefon) und @ (E-Mail) werden abgelehnt.
// - Verglichen wird immer BRUTTO (das zahlt der Endkunde, so steht es am Aushang).
//   Netto erfasste Preise werden mit dem Steuersatz des Postens umgerechnet.
// - Preise veralten: nur Einträge der letzten 180 Tage zählen; ältere bleiben
//   sichtbar, gehen aber nicht in die Rechnung ein.
// - Je Mitbewerber zählt nur der NEUESTE Eintrag (sonst zählt ein Salon, den man
//   dreimal notiert hat, dreifach). Unter 3 Mitbewerbern keine Aussage.
//
// Nur Imports reiner Logik, KEINE Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden, rundeStellen } from './zahlen';
import { alterTage, quantil, balkenPos } from './kfzMarkt';

export { balkenPos };

export const MAX_TAGE = 180;
export const MIN_VERGLEICHE = 3;

export const QUELLEN = ['Aushang / Preisliste vor Ort', 'Webseite', 'Speisekarte', 'Online-Buchung', 'Angebot auf Anfrage', 'Sonstige'] as const;

// ---------------------------------------------------------------------------
// Eigener Preis
// ---------------------------------------------------------------------------

/** Die Felder des Leistungskatalogs, die für den eigenen Preis gebraucht werden. */
export type KatalogLite = {
  id: string;
  bezeichnung?: string | null;
  erfassungsart?: string | null;      // minuten | stunden | aw | stueck
  standard_wert?: number | null;
  aw_minuten?: number | null;
  stundensatz_netto?: number | null;
  festpreis_netto?: number | null;
  einheit?: string | null;
  einheitspreis_netto?: number | null;
  mwst_satz?: number | null;
};

export type EigenerPreis = { netto: number; brutto: number; mwst: number; je: string };

function zahl(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Steuersatz 0–30 %, sonst 19. */
export function mwstSatz(x: unknown): number {
  const n = zahl(x);
  return n !== null && n >= 0 && n <= 30 ? n : 19;
}

function minutenText(min: number): string {
  if (min % 60 === 0) return `${min / 60} Std`;
  if (min > 60) return `${Math.floor(min / 60)} Std ${min % 60} Min`;
  return `${min} Min`;
}

/**
 * Preis einer Katalog-Leistung, so wie der Kunde sie bezahlt:
 * - Pauschale gewinnt immer („je Leistung").
 * - Menge / Einheit: Preis je Einheit („je m²").
 * - Zeit-Leistung: Standardmenge × Stundensatz („je Leistung (30 Min)").
 * Ohne Preis im Katalog: null (dann gibt es keine Aussage — nichts erfinden).
 */
export function katalogPreis(k: KatalogLite | null | undefined): EigenerPreis | null {
  if (!k) return null;
  const mwst = mwstSatz(k.mwst_satz);
  const mk = (netto: number, je: string): EigenerPreis | null =>
    netto > 0 ? { netto: centRunden(netto), brutto: centRunden(netto * (1 + mwst / 100)), mwst, je } : null;
  const fest = zahl(k.festpreis_netto);
  if (fest !== null && fest > 0) return mk(fest, 'je Leistung');
  if (k.erfassungsart === 'stueck') {
    const ep = zahl(k.einheitspreis_netto);
    return ep !== null ? mk(ep, `je ${String(k.einheit ?? '').trim() || 'Einheit'}`) : null;
  }
  const satz = zahl(k.stundensatz_netto);
  if (satz === null || satz <= 0) return null;
  const wert = zahl(k.standard_wert);
  const w = wert !== null && wert > 0 ? wert : 1;
  const awMin = zahl(k.aw_minuten);
  const minuten = k.erfassungsart === 'minuten' ? w : k.erfassungsart === 'aw' ? w * (awMin !== null && awMin > 0 ? awMin : 6) : w * 60;
  if (minuten === 60 && k.erfassungsart !== 'aw') return mk(satz, 'je Stunde');
  return mk((minuten / 60) * satz, `je Leistung (${minutenText(Math.round(minuten))})`);
}

export type Posten = {
  id: string;
  bezeichnung: string;
  leistung_id: string | null;
  eigener_preis: number | null;   // brutto, nur bei freien Posten
  mwst_satz: number | null;
  aktiv?: boolean | null;
};

/** Eigener Bruttopreis des Postens: aus dem Katalog (live) oder von Hand eingetragen. */
export function postenPreis(p: Posten, katalog: KatalogLite | null | undefined): EigenerPreis | null {
  if (p.leistung_id) return katalogPreis(katalog);
  const b = zahl(p.eigener_preis);
  if (b === null || b <= 0) return null;
  const mwst = mwstSatz(p.mwst_satz);
  return { brutto: centRunden(b), netto: centRunden(b / (1 + mwst / 100)), mwst, je: 'je Posten' };
}

export type PostenEingabe = { bezeichnung: string; leistung_id: string | null; eigener_preis: number | null; mwst_satz: number | null };

/** Posten prüfen. Mit Katalog-Leistung kein eigener Preis (der kommt aus dem Katalog). */
export function postenPruefen(e: PostenEingabe):
  { ok: true; felder: { bezeichnung: string; leistung_id: string | null; eigener_preis: number | null; mwst_satz: number } } | { ok: false; fehler: string } {
  const bez = String(e.bezeichnung ?? '').replace(/\s+/g, ' ').trim();
  if (!bez) return { ok: false, fehler: 'Bitte eine Bezeichnung eintragen, z. B. „Herrenhaarschnitt" oder „Schnitzel Wiener Art".' };
  if (bez.length > 120) return { ok: false, fehler: 'Die Bezeichnung ist zu lang (höchstens 120 Zeichen).' };
  const mwst = e.mwst_satz === null ? 19 : e.mwst_satz;
  if (!Number.isFinite(mwst) || mwst < 0 || mwst > 30) return { ok: false, fehler: 'Der Steuersatz muss zwischen 0 und 30 % liegen.' };
  if (e.leistung_id) return { ok: true, felder: { bezeichnung: bez, leistung_id: e.leistung_id, eigener_preis: null, mwst_satz: mwst } };
  if (e.eigener_preis !== null && (!Number.isFinite(e.eigener_preis) || e.eigener_preis <= 0 || e.eigener_preis > 1_000_000)) {
    return { ok: false, fehler: 'Ihr Preis muss größer als 0 sein.' };
  }
  return { ok: true, felder: { bezeichnung: bez, leistung_id: null, eigener_preis: e.eigener_preis === null ? null : centRunden(e.eigener_preis), mwst_satz: mwst } };
}

// ---------------------------------------------------------------------------
// Vergleiche
// ---------------------------------------------------------------------------

export type Vergleich = {
  id?: string;
  anbieter: string;
  preis: number | null;
  ist_brutto: boolean | null;
  erfasst_am: string;              // YYYY-MM-DD
  quelle?: string | null;
  entfernung_km?: number | null;
  link?: string | null;
  notiz?: string | null;
};

export type VergleichEingabe = {
  anbieter: string; preis: number | null; ist_brutto: boolean; quelle: string | null;
  entfernung_km: number | null; link: string | null; notiz: string | null; am?: string | null;
};

/**
 * Kennung des Mitbewerbers prüfen. Erlaubt: „Mitbewerber A", „Salon Innenstadt",
 * „Pizzeria am Bahnhof". Abgelehnt: E-Mail, Telefonnummer, Link.
 * (Ob ein Wort ein Personenname ist, kann keine Regel erkennen — der Hinweis
 * steht deshalb am Feld.)
 */
export function anbieterPruefen(roh: string): { ok: true; wert: string } | { ok: false; fehler: string } {
  const a = String(roh ?? '').replace(/\s+/g, ' ').trim();
  if (!a) return { ok: false, fehler: 'Bitte den Mitbewerber kennzeichnen, z. B. „Mitbewerber A" oder „Salon Innenstadt".' };
  if (a.length > 40) return { ok: false, fehler: 'Die Kennung ist zu lang (höchstens 40 Zeichen).' };
  if (/@/.test(a) || /\d[\d\s/()+-]{4,}\d/.test(a) || /https?:|www\./i.test(a)) {
    return { ok: false, fehler: 'Bitte keine Kontaktdaten (Telefon, E-Mail, Link) in die Kennung — den Link tragen Sie im Feld „Link" ein.' };
  }
  return { ok: true, wert: a };
}

/** Schlüssel, unter dem Einträge desselben Mitbewerbers zusammenfallen. */
export function anbieterSchluessel(a: string): string {
  return String(a ?? '').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim();
}

/** Eingabe prüfen und in Datenbankfelder übersetzen. Preis ist Pflicht, Link nur https. */
export function vergleichPruefen(e: VergleichEingabe, heuteIso: string):
  { ok: true; felder: { anbieter: string; preis: number; ist_brutto: boolean; quelle: string; entfernung_km: number | null; link: string | null; notiz: string | null; erfasst_am: string } } | { ok: false; fehler: string } {
  const an = anbieterPruefen(e.anbieter);
  if (!an.ok) return an;
  if (e.preis === null || !Number.isFinite(e.preis) || e.preis <= 0) return { ok: false, fehler: 'Bitte den Preis des Mitbewerbers eintragen.' };
  if (e.preis > 1_000_000) return { ok: false, fehler: 'Der Preis ist unplausibel hoch.' };
  if (e.entfernung_km !== null && (!Number.isFinite(e.entfernung_km) || e.entfernung_km < 0 || e.entfernung_km > 500)) {
    return { ok: false, fehler: 'Die Entfernung muss zwischen 0 und 500 km liegen.' };
  }
  const link = String(e.link ?? '').trim();
  if (link && (!/^https:\/\/[^\s"'<>]+$/.test(link) || link.length > 500)) return { ok: false, fehler: 'Der Link muss mit https:// beginnen.' };
  const quelle = String(e.quelle ?? '').trim().slice(0, 60) || 'Sonstige';
  const am = e.am && /^\d{4}-\d{2}-\d{2}$/.test(e.am) && e.am <= heuteIso ? e.am : heuteIso;
  return { ok: true, felder: {
    anbieter: an.wert, preis: centRunden(e.preis), ist_brutto: !!e.ist_brutto, quelle,
    entfernung_km: e.entfernung_km === null ? null : rundeStellen(e.entfernung_km, 1),
    link: link || null, notiz: String(e.notiz ?? '').trim().slice(0, 200) || null, erfasst_am: am,
  } };
}

/** Vergleichspreis brutto (netto erfasste Preise mit dem Steuersatz des Postens). */
export function bruttoVon(v: Vergleich, mwst: number): number | null {
  const p = zahl(v.preis);
  if (p === null || p <= 0) return null;
  return v.ist_brutto === false ? centRunden(p * (1 + mwstSatz(mwst) / 100)) : centRunden(p);
}

export function aktuell(v: Vergleich, heuteIso: string): boolean {
  const p = zahl(v.preis);
  return alterTage(v.erfasst_am, heuteIso) <= MAX_TAGE && p !== null && p > 0;
}

/** Je Mitbewerber nur der neueste aktuelle Eintrag (bei gleichem Datum der zuletzt gelistete). */
export function neuesteJeAnbieter(liste: Vergleich[], heuteIso: string): Vergleich[] {
  const je = new Map<string, Vergleich>();
  for (const v of liste) {
    if (!aktuell(v, heuteIso)) continue;
    const k = anbieterSchluessel(v.anbieter);
    const alt = je.get(k);
    if (!alt || String(v.erfasst_am) >= String(alt.erfasst_am)) je.set(k, v);
  }
  return [...je.values()];
}

// ---------------------------------------------------------------------------
// Lage
// ---------------------------------------------------------------------------

export type Klasse = 'unten' | 'mitte' | 'oben' | null;

export type Lage = {
  aktuell: number;         // aktuelle Einträge (vor dem Zusammenfassen)
  veraltet: number;
  anbieter: number;        // verschiedene Mitbewerber in der Rechnung
  basis: 'ok' | 'zu_wenig';
  median: number | null;
  min: number | null;
  max: number | null;
  q1: number | null;
  q3: number | null;
  eigen: number | null;
  abweichung: number | null;          // eigener Preis − Mitte (€)
  abweichungProzent: number | null;
  guenstiger: number | null;          // wie viele Mitbewerber sind günstiger
  klasse: Klasse;                     // untere / mittlere / obere Preisklasse (Quartile)
  stufe: 'ok' | 'warn' | 'info' | 'dim';
  text: string;
};

const euroText = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/**
 * Wo liegt der eigene Bruttopreis im Umfeld?
 * - Grundlage: je Mitbewerber der neueste Eintrag der letzten 180 Tage, ab 3 Mitbewerbern.
 * - Klasse nach Quartilen: bis q1 untere, ab q3 obere, dazwischen mittlere Preisklasse.
 * - Farbe: mehr als 15 % über der Mitte gelb („sichtbar begründen"), mehr als
 *   10 % darunter blau („möglicherweise verschenkter Ertrag"), sonst grün.
 *   Teuer ist kein Fehler — die Farbe ist ein Hinweis, keine Bewertung.
 */
export function spiegelLage(eigen: EigenerPreis | null, liste: Vergleich[], heuteIso: string): Lage {
  const mwst = eigen?.mwst ?? 19;
  const akt = liste.filter((v) => aktuell(v, heuteIso));
  const je = neuesteJeAnbieter(liste, heuteIso);
  const preise = je.map((v) => bruttoVon(v, mwst)).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const leer: Lage = {
    aktuell: akt.length, veraltet: liste.length - akt.length, anbieter: preise.length, basis: 'zu_wenig',
    median: null, min: null, max: null, q1: null, q3: null, eigen: eigen?.brutto ?? null,
    abweichung: null, abweichungProzent: null, guenstiger: null, klasse: null, stufe: 'dim',
    text: `Zu wenige Mitbewerber (${preise.length} von mindestens ${MIN_VERGLEICHE}). Erfassen Sie Preise weiterer Betriebe aus Ihrem Umfeld — gezählt wird je Betrieb der neueste Eintrag der letzten ${MAX_TAGE} Tage.`,
  };
  if (preise.length < MIN_VERGLEICHE) return leer;
  const median = centRunden(quantil(preise, 0.5));
  const lage: Lage = {
    ...leer, basis: 'ok', median, min: preise[0], max: preise[preise.length - 1],
    q1: centRunden(quantil(preise, 0.25)), q3: centRunden(quantil(preise, 0.75)), text: '',
  };
  if (!eigen) {
    lage.text = `Marktmitte ${euroText(median)} aus ${preise.length} Mitbewerbern (Spanne ${euroText(preise[0])} bis ${euroText(preise[preise.length - 1])}). Für diesen Posten ist noch kein eigener Preis hinterlegt.`;
    return lage;
  }
  const e = eigen.brutto;
  lage.abweichung = centRunden(e - median);
  lage.abweichungProzent = rundeStellen(((e - median) / median) * 100, 1);
  lage.guenstiger = preise.filter((p) => p < e).length;
  lage.klasse = e <= (lage.q1 as number) && e < median ? 'unten' : e >= (lage.q3 as number) && e > median ? 'oben' : 'mitte';
  const p = lage.abweichungProzent;
  lage.stufe = p > 15 ? 'warn' : p < -10 ? 'info' : 'ok';
  const klasseText = lage.klasse === 'unten' ? 'untere Preisklasse' : lage.klasse === 'oben' ? 'obere Preisklasse' : 'mittlere Preisklasse';
  const rang = e < preise[0] ? 'günstiger als alle erfassten Mitbewerber'
    : e > preise[preise.length - 1] ? 'teurer als alle erfassten Mitbewerber'
    : `${lage.guenstiger} von ${preise.length} Mitbewerbern sind günstiger`;
  const richtung = p === 0 ? 'genau in der Marktmitte' : `${Math.abs(p).toLocaleString('de-DE')} % ${p > 0 ? 'über' : 'unter'} der Marktmitte (${euroText(median)})`;
  const zusatz = p > 15 ? ' Machen Sie sichtbar, was Ihre Leistung besonders macht.' : p < -10 ? ' Möglicherweise verschenken Sie Ertrag.' : '';
  lage.text = `Ihr Preis liegt ${richtung} — ${klasseText}, ${rang}.${zusatz}`;
  return lage;
}

// ---------------------------------------------------------------------------
// Übersicht über alle Posten
// ---------------------------------------------------------------------------

export type Uebersicht = {
  posten: number;
  mitAussage: number;
  unten: number;
  mitte: number;
  oben: number;
  ohnePreis: number;
  mittlereAbweichung: number | null;   // Durchschnitt der Abweichungen in % (nur mit Aussage und eigenem Preis)
  veraltet: number;                    // Einträge älter als 180 Tage
};

export function uebersicht(lagen: Lage[]): Uebersicht {
  const mit = lagen.filter((l) => l.basis === 'ok');
  const abw = mit.map((l) => l.abweichungProzent).filter((x): x is number => x !== null);
  return {
    posten: lagen.length,
    mitAussage: mit.length,
    unten: mit.filter((l) => l.klasse === 'unten').length,
    mitte: mit.filter((l) => l.klasse === 'mitte').length,
    oben: mit.filter((l) => l.klasse === 'oben').length,
    ohnePreis: lagen.filter((l) => l.eigen === null).length,
    mittlereAbweichung: abw.length ? rundeStellen(abw.reduce((s, x) => s + x, 0) / abw.length, 1) : null,
    veraltet: lagen.reduce((s, l) => s + l.veraltet, 0),
  };
}

/** Sortierung: zuerst Posten mit Handlungsbedarf (blau, gelb), dann ohne Aussage, dann grün. */
export function rang(l: Lage): number {
  return l.stufe === 'info' ? 0 : l.stufe === 'warn' ? 1 : l.stufe === 'dim' ? 2 : 3;
}
