// lib/ertraege.ts
// Teil C · Singleton #2 — Live-Monitoring & Erträge (Energie/PV/Anlagen).
// Reine Formeln & Logik — KEINE Supabase-Aufrufe, KEINE React-Hooks
// (importierbar von Client + Node). Node-getestet (ertraege.test.ts).
//
// Kennzahlen (verifiziert 07/2026):
//   Spezifischer Ertrag = Ertrag (kWh) / Nennleistung (kWp)   [DE typ. 800–1200 kWh/kWp·a]
//   Soll-Erreichung     = Ist-Ertrag / Soll-Ertrag (Soll pro-rata aus Jahres-Sollwert)
//   Verfügbarkeit       = 1 − Ausfallstunden / Periodenstunden
//   Eigenverbrauchsquote= Eigenverbrauch / Erzeugung
//   Autarkiegrad        = Eigenverbrauch / Gesamtverbrauch
//   Erlös               = Einspeisung × Vergütung + Eigenverbrauch × Strompreis (Ersparnis)
// „Soll-Erreichung" bewusst NICHT Performance Ratio (das bräuchte Einstrahlungsdaten).

export type AnlagenTyp = 'pv' | 'bhkw' | 'wind' | 'speicher' | 'waermepumpe' | 'sonstige';

export interface AnlagenTypInfo { key: AnlagenTyp; label: string; einheit: string }
export const ANLAGEN_TYPEN: AnlagenTypInfo[] = [
  { key: 'pv',          label: 'Photovoltaik',   einheit: 'kWp' },
  { key: 'bhkw',        label: 'BHKW / KWK',     einheit: 'kW' },
  { key: 'wind',        label: 'Windkraft',      einheit: 'kW' },
  { key: 'speicher',    label: 'Batteriespeicher', einheit: 'kWh' },
  { key: 'waermepumpe', label: 'Wärmepumpe',     einheit: 'kW' },
  { key: 'sonstige',    label: 'Sonstige',       einheit: 'kW' },
];
export function typLabel(key: string): string { return ANLAGEN_TYPEN.find((t) => t.key === key)?.label ?? key; }
export function typEinheit(key: string): string { return ANLAGEN_TYPEN.find((t) => t.key === key)?.einheit ?? 'kW'; }

// Orientierungswerte spezifischer Jahresertrag PV (kWh/kWp·a), DE.
export const SOLL_SPEZIFISCH_STD = 950;
export const SPEZIFISCH_DE_MIN = 800;
export const SPEZIFISCH_DE_MAX = 1200;

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }
function clamp01(n: number): number { return Math.min(Math.max(Number(n) || 0, 0), 1); }

export interface AnlageLite {
  id?: string;
  status?: string;
  nennleistung_kwp?: number;
  soll_spezifisch?: number;   // kWh/kWp·a
  verguetung_ct?: number;     // ct/kWh Einspeisevergütung
  strompreis_ct?: number;     // ct/kWh Bezugspreis (für Eigenverbrauchs-Ersparnis)
}
export interface AblesungLite {
  anlage_id?: string;
  von?: string;               // ISO-Datum
  bis?: string;               // ISO-Datum (Periodenende, inklusiv)
  ertrag_kwh?: number;
  eigenverbrauch_kwh?: number;
  einspeisung_kwh?: number;
  verbrauch_kwh?: number;     // Gesamtverbrauch am Standort (optional, für Autarkie)
  ausfall_stunden?: number;
}

/** Tage im Zeitraum, inklusiv (von=bis → 1 Tag). Ungültig/leer → 0. */
export function tageZeitraum(von?: string, bis?: string): number {
  if (!von || !bis) return 0;
  const a = Date.parse(von + 'T00:00:00Z');
  const b = Date.parse(bis + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** Spezifischer Ertrag = Ertrag / Nennleistung (kWh je kWp/kW). */
export function spezifischerErtrag(ertrag_kwh: number, nennleistung: number): number {
  const p = Number(nennleistung) || 0;
  if (p <= 0) return 0;
  return r2((Number(ertrag_kwh) || 0) / p);
}

/** Soll-Ertrag im Zeitraum = Jahres-Sollwert × kWp × Tage/365. */
export function sollErtragZeitraum(soll_spezifisch: number, nennleistung: number, tage: number): number {
  return r2((Number(soll_spezifisch) || 0) * (Number(nennleistung) || 0) * (Number(tage) || 0) / 365);
}

/** Soll-Erreichung = Ist / Soll (kann >1 sein bei Übererfüllung). */
export function sollErreichung(ist_kwh: number, soll_kwh: number): number {
  const s = Number(soll_kwh) || 0;
  if (s <= 0) return 0;
  return (Number(ist_kwh) || 0) / s;
}

/** Verfügbarkeit = 1 − Ausfallstunden / Periodenstunden (0..1). */
export function verfuegbarkeit(ausfall_stunden: number, tage: number): number {
  const perioden = (Number(tage) || 0) * 24;
  if (perioden <= 0) return 0;
  return clamp01(1 - (Number(ausfall_stunden) || 0) / perioden);
}

export function eigenverbrauchsquote(eigen_kwh: number, ertrag_kwh: number): number {
  const e = Number(ertrag_kwh) || 0;
  if (e <= 0) return 0;
  return clamp01((Number(eigen_kwh) || 0) / e);
}
export function einspeisequote(einspeisung_kwh: number, ertrag_kwh: number): number {
  const e = Number(ertrag_kwh) || 0;
  if (e <= 0) return 0;
  return clamp01((Number(einspeisung_kwh) || 0) / e);
}
export function autarkiegrad(eigen_kwh: number, verbrauch_kwh: number): number {
  const v = Number(verbrauch_kwh) || 0;
  if (v <= 0) return 0;
  return clamp01((Number(eigen_kwh) || 0) / v);
}

/** Erlös = Einspeisung × Vergütung + Eigenverbrauch × Strompreis (Ersparnis), in €. */
export function erloes(einspeisung_kwh: number, verguetung_ct: number, eigen_kwh: number, strompreis_ct: number): number {
  const einspeise = (Number(einspeisung_kwh) || 0) * (Number(verguetung_ct) || 0) / 100;
  const ersparnis = (Number(eigen_kwh) || 0) * (Number(strompreis_ct) || 0) / 100;
  return r2(einspeise + ersparnis);
}

export interface ErtragKennzahl {
  tage: number;
  ertrag_kwh: number;
  spezifisch: number;
  soll_kwh: number;
  sollErreichung: number;
  verfuegbarkeit: number;
  eigenverbrauchsquote: number;
  einspeisequote: number;
  autarkiegrad: number;
  erloes: number;
}

/** Alle Kennzahlen für EINE Ablesung + zugehörige Anlage. */
export function kennzahlAblesung(a: AnlageLite, ab: AblesungLite): ErtragKennzahl {
  const tage = tageZeitraum(ab.von, ab.bis);
  const ertrag = Number(ab.ertrag_kwh) || 0;
  const soll = sollErtragZeitraum(Number(a.soll_spezifisch) || 0, Number(a.nennleistung_kwp) || 0, tage);
  return {
    tage,
    ertrag_kwh: r2(ertrag),
    spezifisch: spezifischerErtrag(ertrag, Number(a.nennleistung_kwp) || 0),
    soll_kwh: soll,
    sollErreichung: sollErreichung(ertrag, soll),
    verfuegbarkeit: verfuegbarkeit(Number(ab.ausfall_stunden) || 0, tage),
    eigenverbrauchsquote: eigenverbrauchsquote(Number(ab.eigenverbrauch_kwh) || 0, ertrag),
    einspeisequote: einspeisequote(Number(ab.einspeisung_kwh) || 0, ertrag),
    autarkiegrad: autarkiegrad(Number(ab.eigenverbrauch_kwh) || 0, Number(ab.verbrauch_kwh) || 0),
    erloes: erloes(Number(ab.einspeisung_kwh) || 0, Number(a.verguetung_ct) || 0, Number(ab.eigenverbrauch_kwh) || 0, Number(a.strompreis_ct) || 0),
  };
}

export interface ErtragAggregat {
  ablesungen: number;
  tage: number;
  ertrag_kwh: number; eigen_kwh: number; einspeisung_kwh: number; verbrauch_kwh: number;
  soll_kwh: number; ausfall_stunden: number;
  sollErreichung: number; verfuegbarkeit: number;
  eigenverbrauchsquote: number; einspeisequote: number; autarkiegrad: number;
  erloes: number;
}

/** Aggregat über mehrere Ablesungen (je Anlage oder gesamt). */
export function aggregat(items: { a: AnlageLite; ab: AblesungLite }[]): ErtragAggregat {
  let tage = 0, ertrag = 0, eigen = 0, einsp = 0, verbr = 0, soll = 0, ausfall = 0, erl = 0;
  for (const it of items || []) {
    const t = tageZeitraum(it.ab.von, it.ab.bis);
    tage += t;
    ertrag += Number(it.ab.ertrag_kwh) || 0;
    eigen += Number(it.ab.eigenverbrauch_kwh) || 0;
    einsp += Number(it.ab.einspeisung_kwh) || 0;
    verbr += Number(it.ab.verbrauch_kwh) || 0;
    ausfall += Number(it.ab.ausfall_stunden) || 0;
    soll += sollErtragZeitraum(Number(it.a.soll_spezifisch) || 0, Number(it.a.nennleistung_kwp) || 0, t);
    erl += erloes(Number(it.ab.einspeisung_kwh) || 0, Number(it.a.verguetung_ct) || 0, Number(it.ab.eigenverbrauch_kwh) || 0, Number(it.a.strompreis_ct) || 0);
  }
  const perioden = tage * 24;
  return {
    ablesungen: (items || []).length,
    tage,
    ertrag_kwh: r2(ertrag), eigen_kwh: r2(eigen), einspeisung_kwh: r2(einsp), verbrauch_kwh: r2(verbr),
    soll_kwh: r2(soll), ausfall_stunden: r2(ausfall),
    sollErreichung: soll > 0 ? ertrag / soll : 0,
    verfuegbarkeit: perioden > 0 ? clamp01(1 - ausfall / perioden) : 0,
    eigenverbrauchsquote: ertrag > 0 ? clamp01(eigen / ertrag) : 0,
    einspeisequote: ertrag > 0 ? clamp01(einsp / ertrag) : 0,
    autarkiegrad: verbr > 0 ? clamp01(eigen / verbr) : 0,
    erloes: r2(erl),
  };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (Tiles + Regel-Auge)
// ---------------------------------------------------------------------------
export const SOLL_SCHWELLE = 0.9; // unter 90 % Soll-Erreichung = auffällig

export interface ErtragKpi {
  anlagenAktiv: number;
  ablesungen: number;
  ertragKwh: number;
  sollErreichung: number;
  verfuegbarkeit: number;
  eigenverbrauchsquote: number;
  erloesGesamt: number;
  schwacheAnlagen: number;   // Anlagen mit Daten unter SOLL_SCHWELLE
  schwaechsteAnlage: string | null;
}

export function zaehleErtraege(
  anlagen: (AnlageLite & { bezeichnung?: string })[],
  ablesungen: AblesungLite[],
): ErtragKpi {
  const anlById = new Map<string, AnlageLite & { bezeichnung?: string }>();
  for (const a of anlagen || []) if (a.id) anlById.set(a.id, a);

  const gesamt = aggregat((ablesungen || []).filter((ab) => ab.anlage_id && anlById.has(ab.anlage_id)).map((ab) => ({ a: anlById.get(ab.anlage_id as string) as AnlageLite, ab })));

  // Soll-Erreichung je Anlage
  let schwach = 0; let schwaechste: { name: string; wert: number } | null = null;
  for (const a of anlagen || []) {
    if (!a.id) continue;
    const abs = (ablesungen || []).filter((ab) => ab.anlage_id === a.id);
    if (!abs.length) continue;
    const agg = aggregat(abs.map((ab) => ({ a, ab })));
    if (agg.soll_kwh > 0) {
      if (agg.sollErreichung < SOLL_SCHWELLE) schwach++;
      if (!schwaechste || agg.sollErreichung < schwaechste.wert) schwaechste = { name: a.bezeichnung || 'Anlage', wert: agg.sollErreichung };
    }
  }

  return {
    anlagenAktiv: (anlagen || []).filter((a) => (a.status ?? 'aktiv') === 'aktiv').length,
    ablesungen: (ablesungen || []).length,
    ertragKwh: gesamt.ertrag_kwh,
    sollErreichung: gesamt.sollErreichung,
    verfuegbarkeit: gesamt.verfuegbarkeit,
    eigenverbrauchsquote: gesamt.eigenverbrauchsquote,
    erloesGesamt: gesamt.erloes,
    schwacheAnlagen: schwach,
    schwaechsteAnlage: schwaechste ? schwaechste.name : null,
  };
}
