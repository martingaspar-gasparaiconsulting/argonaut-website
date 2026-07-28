// lib/varianten.ts
// L2-1 · Handel: Artikel-Varianten & Matrix — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Modell: eine „Varianten-Gruppe" definiert eine Matrix aus zwei Achsen
// (z. B. Größe × Farbe). Jede Zelle der Matrix = ein Varianten-Artikel (SKU)
// mit eigenem Bestand, EAN und optionalem Aufpreis auf den Basis-VK.
// Achse 2 ist optional → auch eine eindimensionale Liste (nur Größen) möglich.
//
// Node-getestet (varianten.test.ts). Alle Beträge netto/€.

export type BestandStufe = 'leer' | 'kritisch' | 'knapp' | 'ok';

export const VARIANTE_STATUS = ['aktiv', 'archiviert'] as const;
export type VarianteStatus = (typeof VARIANTE_STATUS)[number];

function r2(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Achsen-Werte parsen
// ---------------------------------------------------------------------------
/**
 * Zerlegt eine Werte-Eingabe („S, M, L, XL" oder „S;M;L" oder je Zeile) in eine
 * saubere Liste: getrimmt, ohne Leere, ohne Duplikate, Reihenfolge erhalten.
 */
export function parseWerte(text: string | null | undefined): string[] {
  if (!text) return [];
  const roh = String(text)
    .split(/[;,\n\r\t]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const gesehen = new Set<string>();
  const out: string[] = [];
  for (const w of roh) {
    const key = w.toLowerCase();
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Matrix-Zellen
// ---------------------------------------------------------------------------
export interface Zelle {
  a1: string;
  a2: string;
}

/**
 * Kartesisches Produkt beider Achsen = alle Matrix-Zellen.
 * Achse 2 leer → eindimensional (a2 = '').
 * Achse 1 leer → keine Zellen.
 */
export function matrixZellen(a1: string[], a2: string[]): Zelle[] {
  const w1 = (a1 || []).filter((x) => x && x.trim().length > 0);
  const w2 = (a2 || []).filter((x) => x && x.trim().length > 0);
  if (w1.length === 0) return [];
  if (w2.length === 0) return w1.map((x) => ({ a1: x, a2: '' }));
  const out: Zelle[] = [];
  for (const x of w1) for (const y of w2) out.push({ a1: x, a2: y });
  return out;
}

/** Eindeutiger Schlüssel einer Zelle (case-insensitiv, für Vergleich/Dedupe). */
export function zelleKey(a1: string | null | undefined, a2: string | null | undefined): string {
  return `${(a1 || '').trim().toLowerCase()}||${(a2 || '').trim().toLowerCase()}`;
}

/**
 * Baut eine SKU aus Basis + Achsenwerten. Sanitisiert (A–Z, 0–9), Großschrift,
 * mit Bindestrichen verbunden. Leere Teile fallen weg.
 */
export function skuFor(basis: string | null | undefined, a1: string | null | undefined, a2: string | null | undefined): string {
  const teil = (s: string | null | undefined) =>
    String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 12);
  return [teil(basis), teil(a1), teil(a2)].filter((s) => s.length > 0).join('-');
}

/** Verkaufspreis einer Variante = Basis-VK + Aufpreis (nie negativ gerundet). */
export function variantePreis(basisVk: unknown, aufpreis: unknown): number {
  return r2((Number(basisVk) || 0) + (Number(aufpreis) || 0));
}

// ---------------------------------------------------------------------------
// Bestands-Ampel (gleiche Semantik wie ERP/Lager)
// ---------------------------------------------------------------------------
export function bestandStufe(bestand: unknown, mindest: unknown): BestandStufe {
  const b = Number(bestand) || 0;
  const m = Number(mindest) || 0;
  if (b <= 0) return 'leer';
  if (m > 0 && b <= m) return 'kritisch';
  if (m > 0 && b <= m * 1.5) return 'knapp';
  return 'ok';
}

/** Gilt eine Variante als nachbestell-bedürftig (leer oder unter Mindestbestand)? */
export function unterMindest(bestand: unknown, mindest: unknown): boolean {
  const stufe = bestandStufe(bestand, mindest);
  return stufe === 'leer' || stufe === 'kritisch';
}

// ---------------------------------------------------------------------------
// Matrix-Vollständigkeit (welche Zellen fehlen noch als Varianten-Artikel?)
// ---------------------------------------------------------------------------
export interface GruppeLite {
  achse1_werte?: string | null;
  achse2_werte?: string | null;
}

/**
 * Zellen, die die Matrix definiert, aber für die noch KEIN Varianten-Artikel
 * existiert. `vorhandeneKeys` = Set der zelleKey() bereits angelegter Varianten.
 */
export function fehlendeZellen(gruppe: GruppeLite, vorhandeneKeys: Set<string> | string[]): Zelle[] {
  const keys = vorhandeneKeys instanceof Set ? vorhandeneKeys : new Set(vorhandeneKeys);
  const zellen = matrixZellen(parseWerte(gruppe.achse1_werte), parseWerte(gruppe.achse2_werte));
  return zellen.filter((z) => !keys.has(zelleKey(z.a1, z.a2)));
}

/** Ist die Matrix vollständig angelegt (keine fehlenden Zellen)? */
export function matrixVollstaendig(gruppe: GruppeLite, vorhandeneKeys: Set<string> | string[]): boolean {
  return fehlendeZellen(gruppe, vorhandeneKeys).length === 0;
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeVarianten)
// ---------------------------------------------------------------------------
export interface VarianteLite {
  gruppe_id?: string;
  achse1_wert?: string | null;
  achse2_wert?: string | null;
  bestand?: number | null;
  mindestbestand?: number | null;
  aufpreis?: number | null;
  aktiv?: boolean | null;
}

export interface GruppeVoll extends GruppeLite {
  id: string;
  status?: string | null;
  basis_vk?: number | null;
}

export interface VariantenKennzahlen {
  gruppen: number;          // aktive Matrizen
  varianten: number;        // Varianten gesamt (aktiv)
  gesamtBestand: number;    // Summe Bestand über aktive Varianten
  unterMindest: number;     // Varianten leer/kritisch
  luecken: number;          // fehlende Matrix-Zellen über alle Gruppen
  lagerwert: number;        // Bestand × VK (Basis + Aufpreis)
}

/**
 * Zählt Matrizen + Varianten und misst die Matrix-Lücken.
 * Lücken = Summe fehlender Zellen je aktiver Gruppe (matrix definiert, aber
 * noch keine Variante angelegt) — das ist der zentrale Hebel des Moduls.
 */
export function zaehleVarianten(gruppen: GruppeVoll[], varianten: VarianteLite[]): VariantenKennzahlen {
  const aktiveGruppen = (gruppen || []).filter((g) => (g.status ?? 'aktiv') !== 'archiviert');
  const basisVkById = new Map<string, number>();
  for (const g of aktiveGruppen) basisVkById.set(g.id, Number(g.basis_vk) || 0);

  // vorhandene Zellen je Gruppe (nur für aktive Gruppen)
  const keysByGruppe = new Map<string, Set<string>>();
  for (const v of varianten || []) {
    if (!v.gruppe_id || !basisVkById.has(v.gruppe_id)) continue;
    if (!keysByGruppe.has(v.gruppe_id)) keysByGruppe.set(v.gruppe_id, new Set());
    keysByGruppe.get(v.gruppe_id)!.add(zelleKey(v.achse1_wert, v.achse2_wert));
  }

  let varAnzahl = 0;
  let gesamtBestand = 0;
  let unter = 0;
  let lagerwert = 0;
  for (const v of varianten || []) {
    if (!v.gruppe_id || !basisVkById.has(v.gruppe_id)) continue;
    if (v.aktiv === false) continue;
    varAnzahl++;
    const b = Number(v.bestand) || 0;
    gesamtBestand += b;
    if (unterMindest(v.bestand, v.mindestbestand)) unter++;
    const vk = variantePreis(basisVkById.get(v.gruppe_id) || 0, v.aufpreis);
    lagerwert += b * vk;
  }

  let luecken = 0;
  for (const g of aktiveGruppen) {
    luecken += fehlendeZellen(g, keysByGruppe.get(g.id) ?? new Set<string>()).length;
  }

  return {
    gruppen: aktiveGruppen.length,
    varianten: varAnzahl,
    gesamtBestand: r2(gesamtBestand),
    unterMindest: unter,
    luecken,
    lagerwert: r2(lagerwert),
  };
}
