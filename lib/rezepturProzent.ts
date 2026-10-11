// ============================================================================
// ARGONAUT OS · lib/rezepturProzent.ts — Rezeptur in Prozent (Paket 321 · R1)
//
// Für alle, die mischen oder abfüllen: Farben und Lacke, Reinigungsmittel,
// Kosmetik, Seifen und Kerzen, Futter und Dünger, Baustoff-Mischungen,
// Brauerei und Destillerie. Die Rezeptur steht in Anteilen (Prozent), die
// Einwaage wird für jede Ansatzgröße frisch gerechnet.
//
//  · Anteile in Prozent, eine Zeile darf „ad 100" sein (Rest, z. B. Wasser)
//  · Einwaage je Rohstoff = Ansatz × Anteil / 100 — mit Rundungsausgleich,
//    damit die Summe der Einwaagen GENAU die Ansatzgröße ergibt
//  · Mengen-Rezept → Anteile (umrechnen, Summe genau 100 %)
//  · Rohstoffkosten je kg (bzw. l) Mischung, je Ansatz, nach Verlust, je Gebinde
//  · Einkaufspreis aus dem Artikel auf €/kg bzw. €/l umrechnen
//
// Bewusst NICHT: Einstufung nach GHS/CLP oder Gefahrgut — das bleibt beim
// Sicherheitsdatenblatt des Herstellers bzw. bei Fachsoftware (Stufe 3).
// Masse und Volumen werden nie ineinander umgerechnet (Dichte unbekannt).
//
// Reine Logik: keine Supabase-Aufrufe, keine React-Hooks. Runden nur über
// lib/zahlen (rundeStellen/centRunden) — keine eigenen Cent-Runder.
// ============================================================================

import { rundeStellen, centRunden } from './zahlen';

/** Typ-Schlüssel einer Prozent-Rezeptur in rezepturen.typ. */
export const TYP_MISCHUNG = 'mischung';

export function istMischung(typ: unknown): boolean {
  return typ === TYP_MISCHUNG;
}

// ------------------------------------------------------------- Einheiten ---

export type Familie = 'masse' | 'volumen';
export interface EinheitInfo { familie: Familie; faktor: number; basis: 'kg' | 'l'; kurz: string }

const EINHEITEN: Record<string, EinheitInfo> = {
  mg: { familie: 'masse', faktor: 0.000001, basis: 'kg', kurz: 'mg' },
  g: { familie: 'masse', faktor: 0.001, basis: 'kg', kurz: 'g' },
  kg: { familie: 'masse', faktor: 1, basis: 'kg', kurz: 'kg' },
  t: { familie: 'masse', faktor: 1000, basis: 'kg', kurz: 't' },
  ml: { familie: 'volumen', faktor: 0.001, basis: 'l', kurz: 'ml' },
  l: { familie: 'volumen', faktor: 1, basis: 'l', kurz: 'l' },
  hl: { familie: 'volumen', faktor: 100, basis: 'l', kurz: 'hl' },
  m3: { familie: 'volumen', faktor: 1000, basis: 'l', kurz: 'm³' },
};

const ALIAS: Record<string, string> = {
  milligramm: 'mg', gramm: 'g', gr: 'g', kilogramm: 'kg', kilo: 'kg', kgs: 'kg',
  tonne: 't', tonnen: 't', to: 't', milliliter: 'ml', liter: 'l', ltr: 'l', lt: 'l',
  hektoliter: 'hl', 'm³': 'm3', kubikmeter: 'm3', cbm: 'm3',
};

/** Einheit erkennen (kg, g, t, l, ml, hl, m³ …). Stück, Packung usw. → null. */
export function einheitInfo(e: unknown): EinheitInfo | null {
  if (typeof e !== 'string') return null;
  const k = e.trim().toLowerCase().replace(/\.$/, '');
  if (!k) return null;
  return EINHEITEN[ALIAS[k] ?? k] ?? null;
}

/** Menge in die Basiseinheit (kg bzw. l) umrechnen; unbekannte Einheit → null. */
export function inBasis(menge: number, einheit: unknown): number | null {
  const i = einheitInfo(einheit);
  if (!i || !Number.isFinite(menge)) return null;
  return menge * i.faktor;
}

// ---------------------------------------------------------------- Anteile ---

export interface AnteilZeile {
  bezeichnung?: string | null;
  anteil: number | null;   // Prozent, z. B. 12.5
  istRest?: boolean;       // „ad 100" — bekommt den Rest
}

export type SummenStatus = 'ok' | 'zuWenig' | 'zuViel' | 'fehler';

export interface AnteileErgebnis {
  anteile: number[];      // je Zeile, Rest-Zeile aufgefüllt; leere Zeilen = 0
  summe: number;          // Summe der Anteile (4 Nachkommastellen)
  differenz: number;      // 100 − Summe (positiv = es fehlt etwas)
  status: SummenStatus;
  fehler: string[];
}

const P4 = 10000; // Anteile werden in Zehntausendstel-Prozent geführt

function ganz(n: number): number {
  return rundeStellen(n, 0);
}

/**
 * Anteile prüfen und die „ad 100"-Zeile auffüllen.
 * Gerechnet wird in Zehntausendstel-Prozent (ganze Zahlen) — 33,3333 + 33,3333
 * + 33,3334 ergibt so genau 100 und nicht 99,99999999.
 */
export function anteileAufloesen(zeilen: AnteilZeile[]): AnteileErgebnis {
  const fehler: string[] = [];
  const restIdx = zeilen.map((z, i) => (z.istRest ? i : -1)).filter((i) => i >= 0);
  if (restIdx.length > 1) fehler.push('Nur eine Zeile darf „ad 100" sein.');

  const ganze = zeilen.map((z, i) => {
    if (restIdx.length === 1 && i === restIdx[0]) return 0;
    const a = z.anteil;
    if (a == null || !Number.isFinite(a)) return 0;
    if (a < 0) { fehler.push(`${name(z, i)}: Anteil darf nicht negativ sein.`); return 0; }
    if (a > 100) fehler.push(`${name(z, i)}: Anteil über 100 %.`);
    return ganz(a * P4);
  });

  if (restIdx.length === 1) {
    const ohneRest = ganze.reduce((s, v) => s + v, 0);
    const rest = 100 * P4 - ohneRest;
    if (rest < 0) {
      fehler.push(`Die übrigen Anteile ergeben schon ${anzeige(ohneRest / P4)} % — für „ad 100" bleibt nichts.`);
      ganze[restIdx[0]] = 0;
    } else {
      ganze[restIdx[0]] = rest;
    }
  }

  const summeG = ganze.reduce((s, v) => s + v, 0);
  const differenzG = 100 * P4 - summeG;
  let status: SummenStatus = differenzG === 0 ? 'ok' : differenzG > 0 ? 'zuWenig' : 'zuViel';
  if (fehler.length) status = 'fehler';
  return {
    anteile: ganze.map((v) => v / P4),
    summe: summeG / P4,
    differenz: differenzG / P4,
    status,
    fehler,
  };
}

function name(z: AnteilZeile, i: number): string {
  const b = (z.bezeichnung ?? '').trim();
  return b || `Zeile ${i + 1}`;
}

function anzeige(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 4 });
}

/**
 * Ganzzahlige Verteilung nach dem Verfahren der größten Reste: jede Zeile
 * bekommt ihren abgerundeten Teil, die übrigen Einheiten gehen an die Zeilen
 * mit dem größten Rest (bei Gleichstand an die vordere). Die Summe stimmt so
 * immer genau.
 */
function verteilen(gesamt: number, gewichte: number[]): number[] {
  const summe = gewichte.reduce((s, g) => s + g, 0);
  if (summe <= 0 || gesamt <= 0) return gewichte.map(() => 0);
  const roh = gewichte.map((g) => (gesamt * g) / summe);
  const unten = roh.map((r) => Math.floor(r));
  let uebrig = gesamt - unten.reduce((s, v) => s + v, 0);
  const reihenfolge = roh
    .map((r, i) => ({ i, rest: r - unten[i] }))
    .filter((x) => gewichte[x.i] > 0)
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; uebrig > 0 && reihenfolge.length; k++, uebrig--) {
    unten[reihenfolge[k % reihenfolge.length].i] += 1;
  }
  return unten;
}

/**
 * Einwaage je Rohstoff für eine Ansatzgröße (gleiche Einheit wie der Ansatz).
 * Ergeben die Anteile genau 100 %, ist die Summe der Einwaagen GENAU der
 * Ansatz (Rundungsausgleich). Sonst wird jede Zeile einzeln gerundet.
 */
export function einwaage(anteile: number[], ansatz: number, stellen = 3): number[] {
  const st = Math.max(0, Math.min(6, Math.floor(stellen)));
  if (!Number.isFinite(ansatz) || ansatz <= 0) return anteile.map(() => 0);
  const summeG = anteile.reduce((s, a) => s + ganz((a || 0) * P4), 0);
  if (summeG === 100 * P4) {
    const teile = 10 ** st;
    const gesamt = ganz(ansatz * teile);
    return verteilen(gesamt, anteile.map((a) => ganz((a || 0) * P4))).map((v) => rundeStellen(v / teile, st));
  }
  return anteile.map((a) => rundeStellen((ansatz * (a || 0)) / 100, st));
}

/**
 * Mengen-Rezept in Anteile umrechnen. Die Anteile (4 Nachkommastellen)
 * ergeben zusammen genau 100 %. Mengen in verschiedenen Einheiten werden
 * erst in kg bzw. l umgerechnet; Masse und Volumen gemischt → null.
 */
export function anteileAusMengen(zeilen: { menge: number | null; einheit?: string | null }[]): { anteile: number[] | null; grund?: string } {
  const familien = new Set<Familie>();
  const basis = zeilen.map((z) => {
    const m = z.menge;
    if (m == null || !Number.isFinite(m) || m <= 0) return 0;
    const info = einheitInfo(z.einheit ?? 'kg');
    if (!info) return NaN;
    familien.add(info.familie);
    return m * info.faktor;
  });
  if (basis.some((b) => Number.isNaN(b))) return { anteile: null, grund: 'Mindestens eine Zeile hat keine Gewichts- oder Volumeneinheit (z. B. Stück).' };
  if (familien.size > 1) return { anteile: null, grund: 'Gewicht und Volumen gemischt — ohne Dichte lässt sich das nicht in Prozent umrechnen.' };
  const summe = basis.reduce((s, b) => s + b, 0);
  if (summe <= 0) return { anteile: null, grund: 'Keine Mengen eingetragen.' };
  // Gewichte auf 1e9 skalieren, damit die Verteilung ganzzahlig bleibt
  const gewichte = basis.map((b) => ganz((b / summe) * 1e9));
  return { anteile: verteilen(100 * P4, gewichte).map((v) => v / P4) };
}

// ----------------------------------------------------------------- Kosten ---

/**
 * Einkaufspreis eines Artikels auf €/kg bzw. €/l umrechnen — passend zur
 * Einheit des Ansatzes. Unterschiedliche Familien (kg ↔ l) oder Stück → null.
 */
export function preisJeBasis(einkaufspreis: unknown, artikelEinheit: unknown, ansatzEinheit: unknown): number | null {
  const p = typeof einkaufspreis === 'number' ? einkaufspreis : Number.NaN;
  if (!Number.isFinite(p) || p < 0) return null;
  const a = einheitInfo(artikelEinheit);
  const z = einheitInfo(ansatzEinheit);
  if (!a || !z || a.familie !== z.familie) return null;
  return rundeStellen(p / a.faktor, 4);
}

export interface KostenEingabe {
  anteile: number[];             // aus anteileAufloesen
  preise: (number | null)[];     // € je kg bzw. l (Basis der Ansatz-Einheit)
  ansatz: number | null;         // Ansatzgröße in ansatzEinheit
  ansatzEinheit: string | null;
  verlustProzent?: number | null; // Abfüll-/Prozessverlust
  gebindeMenge?: number | null;   // Inhalt je Gebinde in ansatzEinheit
  gebindeKosten?: number | null;  // Verpackung je Gebinde in €
}

export interface KostenErgebnis {
  basis: 'kg' | 'l' | null;
  jeBasisRoh: number | null;      // Rohstoffkosten je kg/l Mischung
  ansatzKosten: number | null;    // Rohstoffkosten für den ganzen Ansatz
  ausbringung: number | null;     // Menge nach Verlust (ansatzEinheit)
  jeBasisFertig: number | null;   // je kg/l Fertigware nach Verlust
  gebindeAnzahl: number | null;   // volle Gebinde aus dem Ansatz
  gebindeRest: number | null;     // Rest (ansatzEinheit)
  kostenJeGebinde: number | null; // Inhalt + Verpackung
  fehlendePreise: number;         // Zeilen mit Anteil, aber ohne Preis
  hinweise: string[];
}

export function kosten(e: KostenEingabe): KostenErgebnis {
  const hinweise: string[] = [];
  const info = einheitInfo(e.ansatzEinheit);
  const leer: KostenErgebnis = {
    basis: info?.basis ?? null, jeBasisRoh: null, ansatzKosten: null, ausbringung: null, jeBasisFertig: null,
    gebindeAnzahl: null, gebindeRest: null, kostenJeGebinde: null, fehlendePreise: 0, hinweise,
  };
  let fehlend = 0;
  let jeBasis = 0;
  e.anteile.forEach((a, i) => {
    if (!(a > 0)) return;
    const p = e.preise[i];
    if (p == null || !Number.isFinite(p)) { fehlend += 1; return; }
    jeBasis += (a / 100) * p;
  });
  leer.fehlendePreise = fehlend;
  if (fehlend) hinweise.push(`${fehlend} Rohstoff(e) ohne Preis — die Kosten sind zu niedrig.`);
  if (!info) {
    hinweise.push('Für die Kosten braucht der Ansatz eine Gewichts- oder Volumeneinheit (kg, g, t, l, ml).');
    return leer;
  }
  leer.jeBasisRoh = rundeStellen(jeBasis, 4);

  const ansatz = e.ansatz;
  if (ansatz == null || !Number.isFinite(ansatz) || ansatz <= 0) return leer;
  const ansatzBasis = ansatz * info.faktor;
  leer.ansatzKosten = centRunden(jeBasis * ansatzBasis);

  const v = e.verlustProzent ?? 0;
  if (!Number.isFinite(v) || v < 0 || v >= 100) {
    hinweise.push('Der Verlust muss zwischen 0 und unter 100 % liegen.');
    return leer;
  }
  const ausbringung = ansatz * (1 - v / 100);
  leer.ausbringung = rundeStellen(ausbringung, 3);
  const ausbringungBasis = ausbringung * info.faktor;
  leer.jeBasisFertig = rundeStellen((jeBasis * ansatzBasis) / ausbringungBasis, 4);

  const g = e.gebindeMenge;
  if (g != null && Number.isFinite(g) && g > 0) {
    // in Tausendstel rechnen, damit 10 / 0,2 nicht 49,99999 ergibt
    const aus = ganz(ausbringung * 1000);
    const geb = ganz(g * 1000);
    if (geb > 0) {
      leer.gebindeAnzahl = Math.floor(aus / geb);
      leer.gebindeRest = rundeStellen((aus - leer.gebindeAnzahl * geb) / 1000, 3);
      const verpackung = e.gebindeKosten != null && Number.isFinite(e.gebindeKosten) && e.gebindeKosten > 0 ? e.gebindeKosten : 0;
      leer.kostenJeGebinde = centRunden(((jeBasis * ansatzBasis) / ausbringungBasis) * g * info.faktor + verpackung);
    }
  }
  return leer;
}

// --------------------------------------------------------------- Regel-Auge ---

export interface MischungsAuge {
  klartext: string;
  punkte: string[];
  stimmung: 'gut' | 'neutral' | 'achtung';
}

/** Regel-Auge für die Prozent-Rezeptur (0 € — ohne KI). */
export function augeMischung(d: { status: SummenStatus; differenz: number; fehler: string[]; zeilen: number; fehlendePreise: number; jeBasisRoh: number | null; basis: 'kg' | 'l' | null }): MischungsAuge {
  if (d.zeilen === 0) {
    return { klartext: 'Tragen Sie die Rohstoffe mit ihrem Anteil in Prozent ein — eine Zeile darf „ad 100" sein (z. B. Wasser).', punkte: [], stimmung: 'neutral' };
  }
  if (d.status === 'fehler') {
    return { klartext: 'Die Rezeptur ist so nicht stimmig.', punkte: d.fehler, stimmung: 'achtung' };
  }
  if (d.status !== 'ok') {
    const wie = d.status === 'zuWenig' ? `Es fehlen ${anzeige(d.differenz)} %` : `Es sind ${anzeige(-d.differenz)} % zu viel`;
    return { klartext: `${wie} bis 100 %. Ergänzen Sie einen Rohstoff oder setzen Sie eine Zeile auf „ad 100".`, punkte: [], stimmung: 'achtung' };
  }
  const punkte: string[] = [];
  if (d.jeBasisRoh != null && d.basis) punkte.push(`Rohstoffkosten: ${d.jeBasisRoh.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} je ${d.basis}.`);
  if (d.fehlendePreise > 0) {
    return { klartext: `Die Anteile ergeben 100 %. ${d.fehlendePreise} Rohstoff(e) haben noch keinen Preis — verknüpfen Sie den Artikel oder tragen Sie €/${d.basis ?? 'kg'} ein.`, punkte, stimmung: 'neutral' };
  }
  return { klartext: 'Die Anteile ergeben genau 100 % — die Einwaage stimmt für jede Ansatzgröße.', punkte, stimmung: 'gut' };
}
