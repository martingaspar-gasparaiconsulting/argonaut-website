// ARGONAUT OS · lib/pipelineEigene.ts — Paket 359 (13.10.2026)
// VK1 Verkaufsteam, Teil 2: eigene Pipelines mit eigenen Stufen.
//
// Reine Logik (node-getestet in tests/pipelineEigeneP359). Dieselben Regeln wie
// supabase-sql/p359-eigene-pipelines.sql:
//   · Ohne Pipeline (pipeline_id leer) gilt die Standard-Pipeline mit den
//     6 festen Stufen aus lib/pipeline.ts — wie bisher.
//   · Jede eigene Pipeline hat die Stufen mit den Schlüsseln „gewonnen" und
//     „verloren" (Name frei). Deshalb erkennen Provisionen, Aufträge, Partner
//     und Berichte gewonnene Deals in jeder Pipeline ohne Umbau.
//   · Schlüssel und Art einer Stufe bleiben fest; Name, Wahrscheinlichkeit,
//     Farbe und Reihenfolge sind frei.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { STUFEN, type StufeInfo } from './pipeline';
import { leseZahl } from './zahlen';

export type PipelineRoh = { id: string; name: string; beschreibung?: string | null; standard?: boolean | null; position?: number | null; aktiv?: boolean | null };
export type StufeRoh = { id?: string; pipeline_id: string; schluessel: string; name: string; wahrscheinlichkeit: number | string | null; art: string; position?: number | null; farbe?: string | null };

export const ENTSCHIEDEN = Object.freeze(['gewonnen', 'verloren'] as const);

/** Gewonnen oder verloren — in jeder Pipeline an denselben Schlüsseln erkennbar. */
export function istEntschieden(stufe: string | null | undefined): boolean {
  return stufe === 'gewonnen' || stufe === 'verloren';
}

const FARBEN = ['#8FA3BE', '#00e5ff', '#C9A84C', '#E0A24C', '#B48CE0', '#5FB3D9', '#D98C5F', '#7FC6A4'];
export function farbeFuer(i: number): string {
  return FARBEN[((i % FARBEN.length) + FARBEN.length) % FARBEN.length];
}

function prozent(x: unknown, standard: number): number {
  const n = typeof x === 'number' ? x : leseZahl(String(x ?? ''));
  if (n == null || !Number.isFinite(n)) return standard;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Stufen einer Pipeline in Anzeige-Reihenfolge: offene nach Position,
 * dann Gewonnen, dann Verloren. Ohne Pipeline: die 6 Standard-Stufen.
 */
export function stufenFuer(pipelineId: string | null | undefined, alle: readonly StufeRoh[]): StufeInfo[] {
  if (!pipelineId) return STUFEN.slice();
  const eigene = alle.filter((s) => s.pipeline_id === pipelineId);
  const offen = eigene.filter((s) => s.art === 'offen')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'de'));
  const aus = (s: StufeRoh, i: number, farbe: string): StufeInfo => ({
    key: s.schluessel,
    label: s.name,
    wahrscheinlichkeit: prozent(s.wahrscheinlichkeit, s.art === 'gewonnen' ? 100 : s.art === 'verloren' ? 0 : 10),
    farbe: s.farbe && /^#[0-9A-Fa-f]{6}$/.test(s.farbe) ? s.farbe : farbe,
    offen: s.art === 'offen',
  });
  const out = offen.map((s, i) => aus(s, i, farbeFuer(i)));
  const g = eigene.find((s) => s.art === 'gewonnen');
  const v = eigene.find((s) => s.art === 'verloren');
  out.push(g ? aus(g, 0, '#4CAF7D') : { key: 'gewonnen', label: 'Gewonnen', wahrscheinlichkeit: 100, farbe: '#4CAF7D', offen: false });
  out.push(v ? aus(v, 0, '#E06666') : { key: 'verloren', label: 'Verloren', wahrscheinlichkeit: 0, farbe: '#E06666', offen: false });
  return out;
}

/** Stufe nachschlagen; unbekannt -> erste offene Stufe (wie lib/pipeline stufeInfo). */
export function stufeIn(stufen: readonly StufeInfo[], key: string | null | undefined): StufeInfo {
  return stufen.find((s) => s.key === key) ?? stufen.find((s) => s.offen) ?? stufen[0] ?? STUFEN[0];
}

/** Erste offene Stufe — für neue Deals und beim Verschieben in eine andere Pipeline. */
export function ersteOffene(stufen: readonly StufeInfo[]): string {
  return stufen.find((s) => s.offen)?.key ?? 'lead';
}

/** Deals einer Pipeline (leer = Standard-Pipeline). */
export function dealsIn<T extends { pipeline_id?: string | null }>(deals: readonly T[], pipelineId: string | null | undefined): T[] {
  const id = pipelineId || null;
  return deals.filter((d) => (d.pipeline_id || null) === id);
}

/** Start-Ansicht: gemerkte Wahl, sonst die als Start markierte Pipeline, sonst Standard (''). */
export function startAuswahl(pipelines: readonly PipelineRoh[], gemerkt?: string | null): string {
  const aktiv = pipelines.filter((p) => p.aktiv !== false);
  if (gemerkt === '') return '';
  if (gemerkt && aktiv.some((p) => p.id === gemerkt)) return gemerkt;
  return aktiv.find((p) => p.standard)?.id ?? '';
}

/** Reihenfolge für Auswahl-Listen: Start-Ansicht zuerst, dann Position, dann Name. Inaktive ans Ende. */
export function sortiert(pipelines: readonly PipelineRoh[]): PipelineRoh[] {
  return pipelines.slice().sort((a, b) =>
    Number(a.aktiv === false) - Number(b.aktiv === false)
    || Number(!!b.standard) - Number(!!a.standard)
    || (a.position ?? 0) - (b.position ?? 0)
    || a.name.localeCompare(b.name, 'de'));
}

// --- Vorlagen ---------------------------------------------------------------
export type VorlageStufe = { name: string; wahrscheinlichkeit: number };
export const VORLAGEN = Object.freeze([
  { key: 'neukunden', name: 'Neukunden', text: 'vom ersten Kontakt bis zur Unterschrift', stufen: [
    { name: 'Erstkontakt', wahrscheinlichkeit: 10 }, { name: 'Bedarf geklärt', wahrscheinlichkeit: 25 },
    { name: 'Termin vereinbart', wahrscheinlichkeit: 40 }, { name: 'Angebot', wahrscheinlichkeit: 60 }, { name: 'Verhandlung', wahrscheinlichkeit: 80 },
  ] },
  { key: 'bestandskunden', name: 'Bestandskunden', text: 'Folgeaufträge und Erweiterungen', stufen: [
    { name: 'Anfrage', wahrscheinlichkeit: 30 }, { name: 'Angebot', wahrscheinlichkeit: 60 }, { name: 'Nachfassen', wahrscheinlichkeit: 75 },
  ] },
  { key: 'auftraggeber', name: 'Je Auftraggeber (Termin-Vertrieb)', text: 'Setter bucht, Closer schließt ab', stufen: [
    { name: 'Neu', wahrscheinlichkeit: 5 }, { name: 'Erreicht', wahrscheinlichkeit: 15 }, { name: 'Termin gebucht', wahrscheinlichkeit: 35 },
    { name: 'Termin gehalten', wahrscheinlichkeit: 55 }, { name: 'Abschluss in Klärung', wahrscheinlichkeit: 75 },
  ] },
  { key: 'leer', name: 'Leer', text: 'nur Gewonnen und Verloren — Stufen selbst anlegen', stufen: [] as VorlageStufe[] },
] as const);
export type VorlageKey = (typeof VORLAGEN)[number]['key'];

/** Schlüssel aus einem Namen: klein, ohne Umlaute, nur a-z 0-9 _, eindeutig, nie gewonnen/verloren. */
export function schluesselAus(name: string, vorhandene: readonly string[]): string {
  const roh = String(name ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 34) || 'stufe';
  const basis = (ENTSCHIEDEN as readonly string[]).includes(roh) ? `${roh}_offen` : roh;
  const belegt = new Set(vorhandene);
  if (!belegt.has(basis)) return basis;
  for (let i = 2; i < 1000; i++) { const k = `${basis}_${i}`; if (!belegt.has(k)) return k; }
  return `${basis}_${Date.now() % 100000}`;
}

/** Zeilen für die offenen Stufen einer Vorlage (Gewonnen/Verloren legt die Datenbank an). */
export function vorlageStufen(key: string, pipelineId: string): StufeRoh[] {
  const v = VORLAGEN.find((x) => x.key === key);
  if (!v) return [];
  const keys: string[] = [];
  return (v.stufen as readonly VorlageStufe[]).map((s, i) => {
    const k = schluesselAus(s.name, keys); keys.push(k);
    return { pipeline_id: pipelineId, schluessel: k, name: s.name, wahrscheinlichkeit: s.wahrscheinlichkeit, art: 'offen', position: i };
  });
}

// --- Prüfungen (wie die Datenbank) ------------------------------------------
export function pipelinePruefen(name: string, vorhandene: readonly PipelineRoh[], eigeneId?: string | null): string[] {
  const f: string[] = [];
  const n = String(name ?? '').trim();
  if (!n) f.push('Bitte einen Namen angeben.');
  else if (n.length > 80) f.push('Der Name darf höchstens 80 Zeichen haben.');
  else if (n.toLowerCase() === 'standard') f.push('„Standard" ist die eingebaute Pipeline — bitte einen anderen Namen wählen.');
  else if (vorhandene.some((p) => p.id !== eigeneId && p.name.trim().toLowerCase() === n.toLowerCase())) f.push('Eine Pipeline mit diesem Namen gibt es schon.');
  return f;
}

export type StufeEingabe = { name: string; wahrscheinlichkeit: string | number };
export function stufePruefen(e: StufeEingabe, art: string = 'offen'): { fehler: string[]; wahrscheinlichkeit: number } {
  const f: string[] = [];
  const n = String(e.name ?? '').trim();
  if (!n) f.push('Bitte einen Namen für die Stufe angeben.');
  else if (n.length > 60) f.push('Der Name einer Stufe darf höchstens 60 Zeichen haben.');
  let w = art === 'gewonnen' ? 100 : art === 'verloren' ? 0 : NaN;
  if (art === 'offen') {
    const z = typeof e.wahrscheinlichkeit === 'number' ? e.wahrscheinlichkeit : leseZahl(String(e.wahrscheinlichkeit ?? ''));
    if (z == null || !Number.isFinite(z)) f.push('Bitte die Wahrscheinlichkeit als Zahl von 0 bis 100 angeben.');
    else if (z < 0 || z > 100) f.push('Die Wahrscheinlichkeit liegt zwischen 0 und 100 %.');
    else w = Math.round(z);
  }
  return { fehler: f, wahrscheinlichkeit: Number.isFinite(w) ? w : 0 };
}

/** Stufe nach oben/unten: liefert die neuen Positionen der offenen Stufen (nur geänderte). */
export function verschieben(stufen: readonly StufeRoh[], schluessel: string, richtung: -1 | 1): { schluessel: string; position: number }[] {
  const offen = stufen.filter((s) => s.art === 'offen').slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, 'de'));
  const i = offen.findIndex((s) => s.schluessel === schluessel);
  const j = i + richtung;
  if (i < 0 || j < 0 || j >= offen.length) return [];
  [offen[i], offen[j]] = [offen[j], offen[i]];
  return offen.map((s, k) => ({ schluessel: s.schluessel, position: k })).filter((x) => {
    const alt = stufen.find((s) => s.schluessel === x.schluessel);
    return (alt?.position ?? -1) !== x.position;
  });
}

/** Darf diese Stufe weg? Gewonnen/Verloren nie, sonst nur ohne Deals. */
export function stufeLoeschbar(s: StufeRoh, deals: readonly { pipeline_id?: string | null; stufe?: string | null }[]): string | null {
  if (s.art !== 'offen') return '„Gewonnen" und „Verloren" gehören zu jeder Pipeline — nur umbenennen.';
  const n = deals.filter((d) => d.pipeline_id === s.pipeline_id && d.stufe === s.schluessel).length;
  return n ? `In dieser Stufe stehen noch ${n} Deal${n === 1 ? '' : 's'}.` : null;
}

/** Werte für „Deal in andere Pipeline verschieben": Ziel und erste offene Stufe dort. */
export function umzugWerte(ziel: string, alleStufen: readonly StufeRoh[]): { pipeline_id: string | null; stufe: string; wahrscheinlichkeit: number } {
  const st = stufenFuer(ziel || null, alleStufen);
  const erste = stufeIn(st, ersteOffene(st));
  return { pipeline_id: ziel || null, stufe: erste.key, wahrscheinlichkeit: erste.wahrscheinlichkeit };
}

/** Kurzüberblick je Pipeline für die Verwaltung. */
export function pipelineZahlen(pipelineId: string | null, deals: readonly { pipeline_id?: string | null; stufe?: string | null }[]): { gesamt: number; offen: number; gewonnen: number; verloren: number } {
  const ds = dealsIn(deals, pipelineId);
  return {
    gesamt: ds.length,
    offen: ds.filter((d) => !istEntschieden(d.stufe)).length,
    gewonnen: ds.filter((d) => d.stufe === 'gewonnen').length,
    verloren: ds.filter((d) => d.stufe === 'verloren').length,
  };
}
