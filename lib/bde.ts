// lib/bde.ts
// Teil C · Singleton #1 — BDE/MDE Betriebsdatenerfassung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Kennzahlen nach VDMA-Einheitsblatt 66412-1 (verifiziert 07/2026):
//   OEE (Gesamtanlageneffektivität) = Verfügbarkeitsgrad × Leistungsgrad × Qualitätsgrad
//   Verfügbarkeitsgrad = Laufzeit / Planbelegungszeit
//   Leistungsgrad      = (Idealzeit je Teil × produzierte Menge) / Laufzeit
//   Qualitätsgrad      = Gutmenge / produzierte Gesamtmenge
//   Laufzeit           = Planbelegungszeit − Summe Störzeiten
// Node-getestet (bde.test.ts).

// ---------------------------------------------------------------------------
// Störgrund-Katalog (typische Verlustquellen, „Six Big Losses")
// ---------------------------------------------------------------------------
export type StoerKategorie =
  | 'ruesten' | 'stoerung' | 'wartung' | 'material'
  | 'organisation' | 'qualitaet' | 'pause' | 'sonstige';

export interface StoerKatEintrag { key: StoerKategorie; label: string; gruende: string[]; geplant?: boolean }

export const STOER_KATALOG: StoerKatEintrag[] = [
  { key: 'ruesten',      label: 'Rüsten / Umrüsten',        gruende: ['Werkzeugwechsel', 'Einrichten', 'Materialwechsel', 'Programmwechsel'] },
  { key: 'stoerung',     label: 'Störung / Defekt',         gruende: ['Maschinenstörung', 'Werkzeugbruch', 'Elektrik/Steuerung', 'Blockade/Stau'] },
  { key: 'wartung',      label: 'Wartung / Instandhaltung', gruende: ['Geplante Wartung', 'Reparatur', 'Reinigung'] },
  { key: 'material',     label: 'Material / Nachschub',     gruende: ['Material fehlt', 'Warten auf Nachschub', 'Falsches Material'] },
  { key: 'organisation', label: 'Organisation',             gruende: ['Kein Auftrag', 'Personal fehlt', 'Warten auf Vorgabe', 'Besprechung'] },
  { key: 'qualitaet',    label: 'Qualität / Nacharbeit',    gruende: ['Nacharbeit', 'Prüfung', 'Ausschuss-Klärung'] },
  { key: 'pause',        label: 'Pause / geplant',          gruende: ['Pause', 'Schichtende', 'Betriebsruhe'], geplant: true },
  { key: 'sonstige',     label: 'Sonstige',                 gruende: ['Sonstiges'] },
];

export function kategorieLabel(key: string): string {
  return STOER_KATALOG.find((k) => k.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
function r0(n: number): number { return Math.round(Number(n) || 0); }
function clamp01(n: number): number { return Math.min(Math.max(Number(n) || 0, 0), 1); }

export interface StoerungLite { dauer_min?: number; kategorie?: string; buchung_id?: string }
export interface BuchungLite {
  id?: string;
  status?: string;
  planbelegung_min?: number;   // Planbelegungszeit (Min) — geplante Produktionszeit
  menge_gesamt?: number;       // produzierte Gesamtmenge (Stk)
  menge_gut?: number;          // Gutmenge (Stk)
  ideal_takt_sek?: number;     // Idealzeit je Teil (Sek) — aus Maschine oder Buchung
}

/** Summe der Störzeiten in Minuten. */
export function stoerzeitSumme(stoerungen: StoerungLite[]): number {
  return r0((stoerungen || []).reduce((s, x) => s + (Number(x.dauer_min) || 0), 0));
}

/** Laufzeit = Planbelegung − Störzeit, nie negativ. */
export function laufzeitMin(planbelegung_min: number, stoerzeit_min: number): number {
  return Math.max(0, (Number(planbelegung_min) || 0) - (Number(stoerzeit_min) || 0));
}

/** Verfügbarkeitsgrad = Laufzeit / Planbelegung (0..1). */
export function verfuegbarkeit(laufzeit_min: number, planbelegung_min: number): number {
  const p = Number(planbelegung_min) || 0;
  if (p <= 0) return 0;
  return clamp01((Number(laufzeit_min) || 0) / p);
}

/**
 * Leistungsgrad (roh) = (Idealtakt[s] × Menge) / (Laufzeit[min] × 60).
 * Kann >1 werden, wenn schneller als der Idealtakt gefahren wurde (Datenhinweis).
 */
export function leistungRoh(ideal_takt_sek: number, menge_gesamt: number, laufzeit_min: number): number {
  const lSek = (Number(laufzeit_min) || 0) * 60;
  const t = Number(ideal_takt_sek) || 0;
  if (lSek <= 0 || t <= 0) return 0;
  return (t * (Number(menge_gesamt) || 0)) / lSek;
}

/** Qualitätsgrad = Gutmenge / Gesamtmenge (0..1). */
export function qualitaet(menge_gut: number, menge_gesamt: number): number {
  const g = Number(menge_gesamt) || 0;
  if (g <= 0) return 0;
  return clamp01((Number(menge_gut) || 0) / g);
}

export interface BdeKennzahl {
  planbelegung_min: number; stoerzeit_min: number; laufzeit_min: number;
  verfuegbarkeit: number; leistung: number; leistungRoh: number; qualitaet: number; oee: number;
  menge_gesamt: number; menge_gut: number; ausschuss: number;
}

/**
 * Alle Kennzahlen für EINE Buchung. Der OEE-Wert nutzt die auf 100 % gekappte
 * Leistung (Standardpraxis), damit fehlerhafte Idealtakte den OEE nicht über 100 %
 * treiben; `leistungRoh` bleibt zur Kontrolle erhalten.
 */
export function kennzahlBuchung(b: BuchungLite, stoerzeit_min: number): BdeKennzahl {
  const plan = Number(b.planbelegung_min) || 0;
  const stz = Number(stoerzeit_min) || 0;
  const lauf = laufzeitMin(plan, stz);
  const v = verfuegbarkeit(lauf, plan);
  const lRoh = leistungRoh(Number(b.ideal_takt_sek) || 0, Number(b.menge_gesamt) || 0, lauf);
  const l = clamp01(lRoh);
  const q = qualitaet(Number(b.menge_gut) || 0, Number(b.menge_gesamt) || 0);
  const mg = Number(b.menge_gesamt) || 0, gut = Number(b.menge_gut) || 0;
  return {
    planbelegung_min: r0(plan), stoerzeit_min: r0(stz), laufzeit_min: r0(lauf),
    verfuegbarkeit: v, leistung: l, leistungRoh: lRoh, qualitaet: q, oee: clamp01(v * l * q),
    menge_gesamt: mg, menge_gut: gut, ausschuss: Math.max(0, mg - gut),
  };
}

// ---------------------------------------------------------------------------
// Aggregat über mehrere Buchungen (Perioden-/Maschinen-OEE)
// ---------------------------------------------------------------------------
export interface BdeAggregat {
  planbelegung_min: number; stoerzeit_min: number; laufzeit_min: number;
  menge_gesamt: number; menge_gut: number; ausschuss: number;
  verfuegbarkeit: number; leistung: number; qualitaet: number; oee: number;
}

/** OEE über mehrere Buchungen: Zeiten & Mengen summieren, dann Kennzahlen bilden. */
export function aggregat(items: { b: BuchungLite; stoerzeit_min: number }[]): BdeAggregat {
  let plan = 0, stz = 0, lauf = 0, mg = 0, gut = 0, taktMenge = 0;
  for (const it of items || []) {
    const p = Number(it.b.planbelegung_min) || 0;
    const s = Number(it.stoerzeit_min) || 0;
    const l = laufzeitMin(p, s);
    plan += p; stz += s; lauf += l;
    mg += Number(it.b.menge_gesamt) || 0;
    gut += Number(it.b.menge_gut) || 0;
    taktMenge += (Number(it.b.ideal_takt_sek) || 0) * (Number(it.b.menge_gesamt) || 0);
  }
  const v = plan > 0 ? clamp01(lauf / plan) : 0;
  const l = clamp01(lauf > 0 ? taktMenge / (lauf * 60) : 0);
  const q = mg > 0 ? clamp01(gut / mg) : 0;
  return {
    planbelegung_min: r0(plan), stoerzeit_min: r0(stz), laufzeit_min: r0(lauf),
    menge_gesamt: mg, menge_gut: gut, ausschuss: Math.max(0, mg - gut),
    verfuegbarkeit: v, leistung: l, qualitaet: q, oee: clamp01(v * l * q),
  };
}

/** Störzeit je Kategorie (Min), absteigend — für Pareto/Top-Störgrund. */
export function stoerungNachKategorie(stoerungen: StoerungLite[]): { kategorie: string; label: string; min: number }[] {
  const map = new Map<string, number>();
  for (const s of stoerungen || []) {
    const k = s.kategorie || 'sonstige';
    map.set(k, (map.get(k) || 0) + (Number(s.dauer_min) || 0));
  }
  return [...map.entries()]
    .map(([kategorie, min]) => ({ kategorie, label: kategorieLabel(kategorie), min: r0(min) }))
    .sort((a, b) => b.min - a.min);
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für Tiles + Regel-Auge)
// ---------------------------------------------------------------------------
export interface BdeKpi {
  maschinenAktiv: number;
  buchungen: number;
  offene: number;
  oee: number; verfuegbarkeit: number; leistung: number; qualitaet: number;
  laufzeitStd: number; stoerzeitStd: number;
  mengeGesamt: number; ausschuss: number;
  topStoerLabel: string | null; topStoerMin: number;
}

export function zaehleBde(
  maschinen: { status?: string }[],
  buchungen: BuchungLite[],
  stoerungen: StoerungLite[],
): BdeKpi {
  // Störzeit je Buchung gruppieren
  const stzProBuchung = new Map<string, number>();
  for (const s of stoerungen || []) {
    if (!s.buchung_id) continue;
    stzProBuchung.set(s.buchung_id, (stzProBuchung.get(s.buchung_id) || 0) + (Number(s.dauer_min) || 0));
  }
  const items = (buchungen || []).map((b) => ({ b, stoerzeit_min: b.id ? (stzProBuchung.get(b.id) || 0) : 0 }));
  const agg = aggregat(items);
  const top = stoerungNachKategorie(stoerungen || [])[0] || null;
  return {
    maschinenAktiv: (maschinen || []).filter((m) => (m.status ?? 'aktiv') === 'aktiv').length,
    buchungen: (buchungen || []).length,
    offene: (buchungen || []).filter((b) => (b.status ?? 'offen') !== 'abgeschlossen').length,
    oee: agg.oee, verfuegbarkeit: agg.verfuegbarkeit, leistung: agg.leistung, qualitaet: agg.qualitaet,
    laufzeitStd: Math.round((agg.laufzeit_min / 60) * 10) / 10,
    stoerzeitStd: Math.round((agg.stoerzeit_min / 60) * 10) / 10,
    mengeGesamt: agg.menge_gesamt, ausschuss: agg.ausschuss,
    topStoerLabel: top ? top.label : null, topStoerMin: top ? top.min : 0,
  };
}
