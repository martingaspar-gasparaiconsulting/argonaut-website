// ============================================================================
// ARGONAUT OS · lib/elektroMesswerte.ts — Messwerte mit Grenzwerten (Paket 196)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks — node-testbar.
// Prüfprotokolle bekommen neben ok/Mangel echte Zahlenfelder: Messwert,
// Einheit, untere und/oder obere Grenze. Liegt ein Messwert ausserhalb der
// Grenze, wird der Prüfpunkt automatisch zum Mangel.
//
// Grenzwerte (Stand 10/2026, gegen Fachquellen geprüft):
//   DIN VDE 0100-600 (Erstprüfung):
//     · Isolationswiderstand: SELV/PELV 250 V DC ≥ 0,5 MΩ; bis 500 V 500 V DC ≥ 1,0 MΩ;
//       über 500 V 1000 V DC ≥ 1,0 MΩ
//     · RCD: Auslösezeit bei IΔn ≤ 300 ms, Auslösestrom zwischen 0,5 und 1,0 × IΔn,
//       Berührungsspannung ≤ 50 V
//     · Schleifenimpedanz TN: Zs ≤ U0 / Ia (DIN VDE 0100-410); im Feld mit
//       Faktor 2/3 wegen Leitererwärmung (z. B. B16 bei 230 V: 1,92 Ω)
//   DIN VDE 0701-0702 (Geräte):
//     · Schutzleiterwiderstand ≤ 0,3 Ω bis 5 m, je weitere 7,5 m + 0,1 Ω, höchstens 1 Ω
//     · Isolationswiderstand SK I ≥ 1 MΩ (Heizelemente ≥ 0,3 MΩ), SK II ≥ 2 MΩ, SK III ≥ 0,25 MΩ
//     · Schutzleiterstrom ≤ 3,5 mA (Heizgeräte über 3,5 kW: 1 mA/kW, höchstens 10 mA)
//     · Berührungsstrom ≤ 0,5 mA
//
// Punkt-Texte bewusst ohne Ω/Δ/≤: sie landen im PDF (Helvetica = WinAnsi).
//
// Alle Grenzen sind STARTWERTE für die befähigte Person — sie kann jede Grenze
// im Protokoll ändern (z. B. anderer Leitungsschutz, längere Leitung).
// ============================================================================

import { leseZahl } from './zahlen';

export interface MessVorlage {
  /** Text des Prüfpunkts, z. B. „Isolationswiderstand". */
  punkt: string;
  /** Anzeige-Einheit, z. B. „MΩ", „Ω", „ms", „mA", „V". */
  einheit: string;
  /** Untere Grenze (Messwert muss ≥ sein). */
  min?: number;
  /** Obere Grenze (Messwert muss ≤ sein). */
  max?: number;
  /** Kurzer Hinweis für den Prüfer (Prüfspannung, Bezug) — nur in der Oberfläche, nicht im PDF. */
  hinweis?: string;
}

export type MessBewertung = 'ok' | 'mangel' | 'leer';

/**
 * Messwert lesen: „0,21" / „1.5" / „ 2 " → Zahl; leer/ungültig → null.
 * Über den zentralen Zahlen-Leser (lib/zahlen.leseZahl) — kein eigener Parser.
 */
export function messZahl(eingabe: unknown): number | null {
  if (eingabe === null || eingabe === undefined) return null;
  return leseZahl(typeof eingabe === 'number' ? eingabe : String(eingabe).trim());
}

/** Messwert gegen Grenzen prüfen. Ohne Messwert: „leer" (der Prüfer entscheidet selbst). */
export function bewerteMesswert(wert: unknown, min?: number | null, max?: number | null): MessBewertung {
  const w = messZahl(wert);
  if (w === null) return 'leer';
  const lo = messZahl(min);
  const hi = messZahl(max);
  if (lo !== null && w < lo) return 'mangel';
  if (hi !== null && w > hi) return 'mangel';
  return 'ok';
}

/** Zahl deutsch formatiert, ohne überflüssige Nullen (0,3 · 1,92 · 300). */
export function zahlDe(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace('.', ',');
}

/** Grenze als Text für Oberfläche: „≤ 0,3 Ω", „≥ 1 MΩ", „15 – 30 mA". */
export function grenzeText(min?: number | null, max?: number | null, einheit = ''): string {
  const e = einheit ? ' ' + einheit : '';
  const lo = messZahl(min), hi = messZahl(max);
  if (lo !== null && hi !== null) return `${zahlDe(lo)} – ${zahlDe(hi)}${e}`;
  if (hi !== null) return `≤ ${zahlDe(hi)}${e}`;
  if (lo !== null) return `≥ ${zahlDe(lo)}${e}`;
  return '';
}

/**
 * Einheit für die PDF-Schrift (Helvetica kennt nur WinAnsi — „Ω" und „≤"
 * kämen als Zeichensalat heraus). Ω → Ohm, MΩ → MOhm.
 */
export function einheitPdf(einheit: string | null | undefined): string {
  return String(einheit || '').replace(/MΩ/g, 'MOhm').replace(/kΩ/g, 'kOhm').replace(/Ω/g, 'Ohm');
}

/** Messwert-Zeile fürs PDF: „Messwert 0,21 Ohm (Grenze max. 0,3 Ohm)". */
export function messTextPdf(p: { messwert?: number | null; einheit?: string | null; grenz_min?: number | null; grenz_max?: number | null }): string {
  const w = messZahl(p.messwert);
  if (w === null) return '';
  const e = einheitPdf(p.einheit);
  const eS = e ? ' ' + e : '';
  const lo = messZahl(p.grenz_min), hi = messZahl(p.grenz_max);
  let g = '';
  if (lo !== null && hi !== null) g = `${zahlDe(lo)} bis ${zahlDe(hi)}${eS}`;
  else if (hi !== null) g = `max. ${zahlDe(hi)}${eS}`;
  else if (lo !== null) g = `min. ${zahlDe(lo)}${eS}`;
  return `Messwert ${zahlDe(w)}${eS}` + (g ? ` (Grenze ${g})` : '');
}

// ---------------------------------------------------------------------------
// Rechen-Helfer für Grenzwerte, die von der Anlage abhängen
// ---------------------------------------------------------------------------

export type LsCharakteristik = 'B' | 'C' | 'D';
const LS_FAKTOR: Record<LsCharakteristik, number> = { B: 5, C: 10, D: 20 };

/**
 * Höchste Schleifenimpedanz Zs im TN-System für einen Leitungsschutzschalter.
 * Norm-Rechenwert: U0 / Ia, Ia = Faktor × In (B 5, C 10, D 20).
 * praxis = true (Standard): × 2/3 für den gemessenen Wert bei kaltem Leiter.
 * Ergebnis auf 2 Nachkommastellen ABGERUNDET (sicherere Seite).
 */
export function zsMax(charakteristik: LsCharakteristik, nennstromA: number, u0 = 230, praxis = true): number | null {
  const f = LS_FAKTOR[charakteristik];
  const In = Number(nennstromA), U = Number(u0);
  if (!f || !Number.isFinite(In) || In <= 0 || !Number.isFinite(U) || U <= 0) return null;
  const roh = U / (f * In) * (praxis ? 2 / 3 : 1);
  return Math.floor(roh * 100 + 1e-9) / 100;
}

/**
 * Schutzleiterwiderstand-Grenze nach DIN VDE 0701-0702 (Leitung bis 1,5 mm²):
 * 0,3 Ω bis 5 m, je angefangene weitere 7,5 m + 0,1 Ω, höchstens 1,0 Ω.
 */
export function schutzleiterMax(laengeM: number): number {
  const l = Math.max(0, Number(laengeM) || 0);
  const zusatz = l <= 5 ? 0 : Math.ceil((l - 5) / 7.5 - 1e-9);
  return Math.min(1, Math.round((0.3 + 0.1 * zusatz) * 10) / 10);
}

export type Schutzklasse = 'I' | 'II' | 'III';

/** Mindest-Isolationswiderstand eines Geräts (DIN VDE 0701-0702) in MΩ. */
export function isoMinGeraet(sk: Schutzklasse, heizelement = false): number {
  if (sk === 'II') return 2;
  if (sk === 'III') return 0.25;
  return heizelement ? 0.3 : 1;
}

/** Mindest-Isolationswiderstand einer Anlage (DIN VDE 0100-600) in MΩ + Prüfspannung. */
export function isoMinAnlage(art: 'selv' | 'bis500' | 'ueber500'): { minMOhm: number; pruefspannungV: number } {
  if (art === 'selv') return { minMOhm: 0.5, pruefspannungV: 250 };
  if (art === 'ueber500') return { minMOhm: 1, pruefspannungV: 1000 };
  return { minMOhm: 1, pruefspannungV: 500 };
}

/** Grenzen für den RCD-Auslösestrom: 0,5 – 1,0 × IΔn (mA). */
export function rcdAusloeseBereich(idnMa: number): { min: number; max: number } | null {
  const i = Number(idnMa);
  if (!Number.isFinite(i) || i <= 0) return null;
  return { min: i / 2, max: i };
}

/** Schutzleiterstrom-Grenze (mA): 3,5 mA; Heizgeräte über 3,5 kW 1 mA/kW, höchstens 10 mA. */
export function schutzleiterstromMax(heizleistungKw = 0): number {
  const kw = Number(heizleistungKw) || 0;
  if (kw > 3.5) return Math.min(10, Math.round(kw * 10) / 10);
  return 3.5;
}

// ---------------------------------------------------------------------------
// Messwert-Vorlagen je Prüfnorm (werden in lib/pruefungen eingehängt)
// ---------------------------------------------------------------------------

/** Erstprüfung DIN VDE 0100-600 — Standard: 230/400 V, RCD 30 mA, LS B16. */
export const MESS_VDE_0100_600: MessVorlage[] = [
  { punkt: 'Durchgängigkeit Schutzleiter / Potentialausgleich', einheit: 'Ω', max: 1, hinweis: 'Prüfstrom ≥ 200 mA; Richtwert — maßgeblich ist der berechnete Leitungswiderstand' },
  { punkt: 'Isolationswiderstand (Stromkreise bis 500 V)', einheit: 'MΩ', min: 1, hinweis: 'Prüfspannung 500 V DC; SELV/PELV: 250 V DC, ≥ 0,5 MΩ' },
  { punkt: 'Schleifenimpedanz Zs (LS B16, 230 V)', einheit: 'Ω', max: zsMax('B', 16) ?? 1.91, hinweis: 'Zs ≤ U0/Ia × 2/3; anderer Leitungsschutz: Grenze anpassen (C16: 0,95 Ω)' },
  { punkt: 'RCD Auslösezeit bei Nennfehlerstrom (30 mA)', einheit: 'ms', max: 300, hinweis: 'bei 5 × IΔn ≤ 40 ms' },
  { punkt: 'RCD Auslösestrom (30 mA)', einheit: 'mA', min: 15, max: 30, hinweis: '0,5 – 1,0 × IΔn' },
  { punkt: 'Berührungsspannung UL bei Nennfehlerstrom', einheit: 'V', max: 50 },
];

/** Wiederholungsprüfung ortsfeste Anlage (DIN VDE 0105-100) — Startwerte. */
export const MESS_VDE_0105: MessVorlage[] = [
  { punkt: 'Isolationswiderstand', einheit: 'MΩ', min: 1, hinweis: 'Neuanlagen-Wert; bei angeschlossenen Verbrauchern lässt DIN VDE 0105-100 niedrigere Werte zu — Grenze ggf. anpassen' },
  { punkt: 'Schleifenimpedanz Zs (LS B16, 230 V)', einheit: 'Ω', max: zsMax('B', 16) ?? 1.91, hinweis: 'anderer Leitungsschutz: Grenze anpassen' },
  { punkt: 'RCD Auslösezeit bei Nennfehlerstrom (30 mA)', einheit: 'ms', max: 300 },
  { punkt: 'Berührungsspannung UL bei Nennfehlerstrom', einheit: 'V', max: 50 },
];

/** Geräteprüfung DIN VDE 0701-0702 — Standard: Schutzklasse I, Leitung bis 5 m. */
export const MESS_VDE_0701_0702: MessVorlage[] = [
  { punkt: 'Schutzleiterwiderstand', einheit: 'Ω', max: schutzleiterMax(5), hinweis: 'bis 5 m; je weitere 7,5 m + 0,1 Ω, höchstens 1 Ω' },
  { punkt: 'Isolationswiderstand', einheit: 'MΩ', min: isoMinGeraet('I'), hinweis: 'SK I ≥ 1 MΩ (Heizelemente ≥ 0,3 MΩ), SK II ≥ 2 MΩ, SK III ≥ 0,25 MΩ' },
  { punkt: 'Schutzleiterstrom', einheit: 'mA', max: schutzleiterstromMax(), hinweis: 'Heizgeräte über 3,5 kW: 1 mA/kW, höchstens 10 mA' },
  { punkt: 'Berührungsstrom', einheit: 'mA', max: 0.5 },
];
