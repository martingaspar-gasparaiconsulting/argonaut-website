// lib/dealScoring.ts
// KI-Deal-Scoring: bewertet OFFENE Vertriebschancen 0–100, damit der Chef
// sofort sieht, welchen Deal er JETZT anpacken soll. Reine Heuristik —
// KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node nutzbar).
// Der Stichtag „heute" wird injiziert → deterministisch testbar.
// Node-getestet (dealScoring.test.ts).

export interface ScoreDeal {
  wert_netto?: number | string | null;
  stufe?: string | null;
  wahrscheinlichkeit?: number | string | null;
  erstellt_am?: string | null;
  aktualisiert_am?: string | null;
  erwartetes_datum?: string | null;
}

export interface DealScore {
  score: number;               // 0–100
  klasse: 'heiss' | 'warm' | 'kalt';
  klasseLabel: string;         // Heiß / Warm / Kalt
  farbe: string;
  gruende: string[];
}

// --- interne Stufen-Wahrscheinlichkeiten (Spiegel von lib/pipeline, ohne Import
//     damit diese Datei importfrei/node-testbar bleibt). --------------------
const STUFEN_P: Record<string, number> = {
  lead: 10, qualifiziert: 30, angebot: 50, verhandlung: 75, gewonnen: 100, verloren: 0,
};
const OFFEN = new Set(['lead', 'qualifiziert', 'angebot', 'verhandlung']);

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function clamp(n: number, lo: number, hi: number): number { return Math.min(Math.max(n, lo), hi); }

/** Ganze Tage zwischen zwei ISO-Daten (b − a). Ungültig → null. */
export function tageZwischen(a: string | null | undefined, b: Date): number | null {
  if (!a) return null;
  const da = new Date(a + (a.length <= 10 ? 'T00:00:00' : ''));
  if (isNaN(da.getTime())) return null;
  return Math.floor((b.getTime() - da.getTime()) / 86_400_000);
}

export function istOffeneStufe(stufe: string | null | undefined): boolean {
  return OFFEN.has((stufe ?? '') as string);
}

/** Wahrscheinlichkeit: eigener Wert vor Stufen-Standard (0–100). */
export function scoreWahrscheinlichkeit(d: ScoreDeal): number {
  if (d.wahrscheinlichkeit != null && d.wahrscheinlichkeit !== '') return clamp(z(d.wahrscheinlichkeit), 0, 100);
  return STUFEN_P[(d.stufe ?? 'lead') as string] ?? 10;
}

/**
 * Deal-Score 0–100 aus vier Signalen:
 *   Abschlusswahrscheinlichkeit (45%) · Auftragswert (20%) ·
 *   Frische/Momentum (20%) · Termin-Nähe (15%).
 * Geschlossene Deals (gewonnen/verloren) → Score 0 (nicht mehr zu jagen).
 */
export function dealScore(d: ScoreDeal, heute: Date): DealScore {
  const gruende: string[] = [];

  if (!istOffeneStufe(d.stufe)) {
    return { score: 0, klasse: 'kalt', klasseLabel: 'Abgeschlossen', farbe: '#8FA3BE', gruende: ['Deal ist bereits entschieden.'] };
  }

  // 1) Wahrscheinlichkeit
  const p = scoreWahrscheinlichkeit(d);
  const sProb = p / 100;

  // 2) Wert (weiche Kurve: 10.000 € ≈ 0,5)
  const wert = z(d.wert_netto);
  const sWert = wert > 0 ? wert / (wert + 10_000) : 0;

  // 3) Frische: Tage seit letzter Bewegung (aktualisiert_am, sonst erstellt_am)
  const tageBew = tageZwischen(d.aktualisiert_am ?? d.erstellt_am, heute);
  let sFrische = 0.5;
  if (tageBew != null) {
    if (tageBew <= 7) sFrische = 1;
    else if (tageBew <= 30) sFrische = 1 - ((tageBew - 7) / 23) * 0.7; // 1 → 0,3
    else sFrische = 0.1;
  }

  // 4) Termin-Nähe: Tage bis erwartetem Abschluss
  const tageBisTermin = d.erwartetes_datum ? -(tageZwischen(d.erwartetes_datum, heute) ?? 0) : null;
  let sTermin = 0.5;
  if (tageBisTermin != null) {
    if (tageBisTermin < 0) sTermin = 1;            // überfällig
    else if (tageBisTermin <= 14) sTermin = 0.9;
    else if (tageBisTermin <= 45) sTermin = 0.6;
    else sTermin = 0.35;
  }

  const roh = sProb * 0.45 + sWert * 0.20 + sFrische * 0.20 + sTermin * 0.15;
  const score = clamp(Math.round(roh * 100), 0, 100);

  // Begründungen (das Wichtigste zuerst)
  gruende.push(`${Math.round(p)} % Abschlusswahrscheinlichkeit`);
  if (wert > 0) gruende.push(`Auftragswert ${wert.toLocaleString('de-DE')} €`);
  if (tageBew != null && tageBew > 30) gruende.push(`Seit ${tageBew} Tagen nicht bewegt`);
  else if (tageBew != null && tageBew <= 7) gruende.push('Kürzlich bewegt');
  if (tageBisTermin != null) {
    if (tageBisTermin < 0) gruende.push('Abschlusstermin überfällig');
    else if (tageBisTermin <= 14) gruende.push(`Abschluss in ${tageBisTermin} Tagen`);
  }

  const klasse: DealScore['klasse'] = score >= 70 ? 'heiss' : score >= 40 ? 'warm' : 'kalt';
  const klasseLabel = klasse === 'heiss' ? 'Heiß' : klasse === 'warm' ? 'Warm' : 'Kalt';
  const farbe = klasse === 'heiss' ? '#E0662E' : klasse === 'warm' ? '#C9A84C' : '#8FA3BE';

  return { score, klasse, klasseLabel, farbe, gruende };
}

export interface GescorterDeal<T> { deal: T; score: DealScore; }

/** Offene Deals nach Score sortiert (höchster zuerst). Geschlossene fliegen raus. */
export function priorisiere<T extends ScoreDeal>(deals: T[], heute: Date): GescorterDeal<T>[] {
  return (deals || [])
    .filter((d) => istOffeneStufe(d.stufe))
    .map((d) => ({ deal: d, score: dealScore(d, heute) }))
    .sort((a, b) => b.score.score - a.score.score);
}
