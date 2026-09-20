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

// ▄▄▄ PUNKT 30 (20.09.2026) — an lib/zahlen.ts angeschlossen ▄▄▄
// Die eigenen Zahl-Leser (Number(x) || 0) und die eigene Cent-Rundung sind
// weg. Zwei Fehler steckten darin:
//   1. Ein Betrag als "1.234,56" wurde zu 0, "12.500" zu 12,5 — Supabase
//      liefert numeric-Spalten haeufig als Text.
//   2. Ein negativer Wert rundete anders als derselbe Betrag positiv:
//      -2,675 wurde -2,67, +2,675 aber 2,68.
// Wichtiger als beides: es wird jetzt ZUERST GELESEN und DANN GERECHNET.
// Runden allein half nicht — bei a - b macht JavaScript aus "10.000"
// schon vor dem Runden die Zahl 10.
// Die ANZEIGE aendert sich dadurch nicht — nur die Zahlen stimmen.
import { leseZahlOder, centRunden } from './zahlen';

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

/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }
function clamp01(n: number): number { return Math.min(Math.max(z(n), 0), 1); }

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
  const p = z(nennleistung);
  if (p <= 0) return 0;
  return r2(z(ertrag_kwh) / p);
}

/** Soll-Ertrag im Zeitraum = Jahres-Sollwert × kWp × Tage/365. */
export function sollErtragZeitraum(soll_spezifisch: number, nennleistung: number, tage: number): number {
  return r2(z(soll_spezifisch) * z(nennleistung) * z(tage) / 365);
}

/** Soll-Erreichung = Ist / Soll (kann >1 sein bei Übererfüllung). */
export function sollErreichung(ist_kwh: number, soll_kwh: number): number {
  const s = z(soll_kwh);
  if (s <= 0) return 0;
  return z(ist_kwh) / s;
}

/** Verfügbarkeit = 1 − Ausfallstunden / Periodenstunden (0..1). */
export function verfuegbarkeit(ausfall_stunden: number, tage: number): number {
  const perioden = z(tage) * 24;
  if (perioden <= 0) return 0;
  return clamp01(1 - z(ausfall_stunden) / perioden);
}

export function eigenverbrauchsquote(eigen_kwh: number, ertrag_kwh: number): number {
  const e = z(ertrag_kwh);
  if (e <= 0) return 0;
  return clamp01(z(eigen_kwh) / e);
}
export function einspeisequote(einspeisung_kwh: number, ertrag_kwh: number): number {
  const e = z(ertrag_kwh);
  if (e <= 0) return 0;
  return clamp01(z(einspeisung_kwh) / e);
}
export function autarkiegrad(eigen_kwh: number, verbrauch_kwh: number): number {
  const v = z(verbrauch_kwh);
  if (v <= 0) return 0;
  return clamp01(z(eigen_kwh) / v);
}

/** Erlös = Einspeisung × Vergütung + Eigenverbrauch × Strompreis (Ersparnis), in €. */
export function erloes(einspeisung_kwh: number, verguetung_ct: number, eigen_kwh: number, strompreis_ct: number): number {
  const einspeise = z(einspeisung_kwh) * z(verguetung_ct) / 100;
  const ersparnis = z(eigen_kwh) * z(strompreis_ct) / 100;
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
  const ertrag = z(ab.ertrag_kwh);
  const soll = sollErtragZeitraum(z(a.soll_spezifisch), z(a.nennleistung_kwp), tage);
  return {
    tage,
    ertrag_kwh: r2(ertrag),
    spezifisch: spezifischerErtrag(ertrag, z(a.nennleistung_kwp)),
    soll_kwh: soll,
    sollErreichung: sollErreichung(ertrag, soll),
    verfuegbarkeit: verfuegbarkeit(z(ab.ausfall_stunden), tage),
    eigenverbrauchsquote: eigenverbrauchsquote(z(ab.eigenverbrauch_kwh), ertrag),
    einspeisequote: einspeisequote(z(ab.einspeisung_kwh), ertrag),
    autarkiegrad: autarkiegrad(z(ab.eigenverbrauch_kwh), z(ab.verbrauch_kwh)),
    erloes: erloes(z(ab.einspeisung_kwh), z(a.verguetung_ct), z(ab.eigenverbrauch_kwh), z(a.strompreis_ct)),
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
    ertrag += z(it.ab.ertrag_kwh);
    eigen += z(it.ab.eigenverbrauch_kwh);
    einsp += z(it.ab.einspeisung_kwh);
    verbr += z(it.ab.verbrauch_kwh);
    ausfall += z(it.ab.ausfall_stunden);
    soll += sollErtragZeitraum(z(it.a.soll_spezifisch), z(it.a.nennleistung_kwp), t);
    erl += erloes(z(it.ab.einspeisung_kwh), z(it.a.verguetung_ct), z(it.ab.eigenverbrauch_kwh), z(it.a.strompreis_ct));
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
