// lib/pipeline.ts
// CRM Deal-Pipeline: Vertriebsstufen, gewichteter Forecast und Kennzahlen.
// Reine Formeln — KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
// Node-getestet (pipeline.test.ts).

export interface StufeInfo {
  key: string;
  label: string;
  wahrscheinlichkeit: number; // Standard-Abschlusswahrscheinlichkeit in %
  farbe: string;
  offen: boolean;             // zählt zur offenen Pipeline (nicht gewonnen/verloren)
}

export const STUFEN: StufeInfo[] = [
  { key: 'lead',         label: 'Lead',         wahrscheinlichkeit: 10,  farbe: '#8FA3BE', offen: true },
  { key: 'qualifiziert', label: 'Qualifiziert', wahrscheinlichkeit: 30,  farbe: '#00e5ff', offen: true },
  { key: 'angebot',      label: 'Angebot',      wahrscheinlichkeit: 50,  farbe: '#C9A84C', offen: true },
  { key: 'verhandlung',  label: 'Verhandlung',  wahrscheinlichkeit: 75,  farbe: '#E0A24C', offen: true },
  { key: 'gewonnen',     label: 'Gewonnen',     wahrscheinlichkeit: 100, farbe: '#4CAF7D', offen: false },
  { key: 'verloren',     label: 'Verloren',     wahrscheinlichkeit: 0,   farbe: '#E06666', offen: false },
];

export const OFFENE_STUFEN: StufeInfo[] = STUFEN.filter((s) => s.offen);

export function stufeInfo(key: string | null | undefined): StufeInfo {
  return STUFEN.find((s) => s.key === key) ?? STUFEN[0];
}
export function stufeWahrscheinlichkeit(key: string | null | undefined): number {
  return stufeInfo(key).wahrscheinlichkeit;
}
export function istOffen(key: string | null | undefined): boolean {
  return stufeInfo(key).offen;
}

export interface DealLite {
  wert_netto?: number | string | null;
  stufe?: string | null;
  wahrscheinlichkeit?: number | string | null;
}

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }
function clampP(p: number): number { return Math.min(Math.max(p, 0), 100); }

/** Wahrscheinlichkeit eines Deals: eigener Wert, sonst Standard der Stufe. */
export function dealWahrscheinlichkeit(d: DealLite): number {
  if (d.wahrscheinlichkeit == null || d.wahrscheinlichkeit === '') return stufeWahrscheinlichkeit(d.stufe);
  return clampP(z(d.wahrscheinlichkeit));
}

/** Gewichteter Forecast = Summe(Wert × Wahrscheinlichkeit) über OFFENE Deals. */
export function forecastGewichtet(deals: DealLite[]): number {
  let s = 0;
  for (const d of deals || []) {
    if (!istOffen(d.stufe)) continue;
    s += z(d.wert_netto) * (dealWahrscheinlichkeit(d) / 100);
  }
  return r2(s);
}

/** Ungewichteter Wert der offenen Pipeline. */
export function pipelineWert(deals: DealLite[]): number {
  let s = 0;
  for (const d of deals || []) if (istOffen(d.stufe)) s += z(d.wert_netto);
  return r2(s);
}

export interface PipelineKennzahlen {
  offen: number;
  pipelineWert: number;
  gewichtet: number;
  gewonnen: number;
  gewonnenWert: number;
  verloren: number;
  winRate: number; // % gewonnener von entschiedenen
}

export function zaehlePipeline(deals: DealLite[]): PipelineKennzahlen {
  const list = deals || [];
  const gewonnenL = list.filter((d) => d.stufe === 'gewonnen');
  const verlorenL = list.filter((d) => d.stufe === 'verloren');
  const entschieden = gewonnenL.length + verlorenL.length;
  return {
    offen: list.filter((d) => istOffen(d.stufe)).length,
    pipelineWert: pipelineWert(list),
    gewichtet: forecastGewichtet(list),
    gewonnen: gewonnenL.length,
    gewonnenWert: r2(gewonnenL.reduce((a, d) => a + z(d.wert_netto), 0)),
    verloren: verlorenL.length,
    winRate: entschieden === 0 ? 0 : Math.round((gewonnenL.length / entschieden) * 100),
  };
}

export function formatEuro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
