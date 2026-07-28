// lib/etiketten.ts
// L2-2 · Etiketten & Kennzeichnung nach LMIV (EU 1169/2011) — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Deckt Lebensmittel-Kennzeichnung ab: 14 Pflichtallergene (Anhang II, im
// Zutatenverzeichnis hervorzuheben — Art. 21), verpflichtende Nährwert-
// deklaration je 100 g/ml (Brennwert kJ+kcal, Fett, davon gesättigte,
// Kohlenhydrate, davon Zucker, Eiweiß, Salz — Art. 30/34) und die Prüfung der
// LMIV-Pflichtangaben (Art. 9). Für lose Ware/Gastro gilt nur die Allergen-
// pflicht (LMIDV), keine Nährwerttabelle.
// Rechtsstand verifiziert 07/2026. Node-getestet (etiketten.test.ts).

export interface Allergen {
  key: string;
  name: string;
  beispiele: string;
  /** Synonyme/Signalwörter für die automatische Hervorhebung im Zutatentext. */
  synonyme: string[];
}

/** Die 14 kennzeichnungspflichtigen Allergene nach LMIV Anhang II. Reihenfolge = amtlich. */
export const ALLERGENE: Allergen[] = [
  { key: 'gluten', name: 'Glutenhaltiges Getreide', beispiele: 'Weizen, Roggen, Gerste, Hafer, Dinkel, Kamut', synonyme: ['gluten', 'weizen', 'roggen', 'gerste', 'hafer', 'dinkel', 'kamut', 'malz', 'grieß', 'weizenmehl', 'hartweizen'] },
  { key: 'krebstiere', name: 'Krebstiere', beispiele: 'Garnelen, Krabben, Hummer, Scampi', synonyme: ['krebstier', 'garnele', 'krabbe', 'hummer', 'scampi', 'languste', 'shrimp'] },
  { key: 'eier', name: 'Eier', beispiele: 'Hühnerei und Erzeugnisse', synonyme: ['ei', 'eier', 'eigelb', 'eiklar', 'volei', 'hühnerei', 'eipulver'] },
  { key: 'fische', name: 'Fische', beispiele: 'Lachs, Thunfisch, Hering, Kabeljau', synonyme: ['fisch', 'lachs', 'thunfisch', 'hering', 'kabeljau', 'forelle', 'sardelle', 'anchovis', 'makrele'] },
  { key: 'erdnuesse', name: 'Erdnüsse', beispiele: 'Erdnuss und Erzeugnisse', synonyme: ['erdnuss', 'erdnüsse', 'erdnussöl', 'peanut'] },
  { key: 'soja', name: 'Sojabohnen', beispiele: 'Soja, Tofu, Sojalecithin', synonyme: ['soja', 'sojabohne', 'sojalecithin', 'sojaöl', 'tofu', 'edamame'] },
  { key: 'milch', name: 'Milch (inkl. Laktose)', beispiele: 'Milch, Butter, Käse, Sahne, Molke', synonyme: ['milch', 'laktose', 'sahne', 'butter', 'käse', 'molke', 'joghurt', 'rahm', 'kasein', 'magermilchpulver', 'milcheiweiß', 'quark'] },
  { key: 'schalenfruechte', name: 'Schalenfrüchte (Nüsse)', beispiele: 'Mandeln, Haselnüsse, Walnüsse, Cashew, Pistazien, Macadamia', synonyme: ['mandel', 'haselnuss', 'walnuss', 'cashew', 'pecan', 'paranuss', 'pistazie', 'macadamia', 'nuss', 'nüsse'] },
  { key: 'sellerie', name: 'Sellerie', beispiele: 'Sellerie und Erzeugnisse', synonyme: ['sellerie'] },
  { key: 'senf', name: 'Senf', beispiele: 'Senf und Erzeugnisse', synonyme: ['senf'] },
  { key: 'sesam', name: 'Sesamsamen', beispiele: 'Sesam und Erzeugnisse', synonyme: ['sesam', 'tahin', 'tahini'] },
  { key: 'sulfite', name: 'Schwefeldioxid & Sulfite', beispiele: '> 10 mg/kg bzw. mg/l (als SO₂)', synonyme: ['sulfit', 'schwefeldioxid', 'so2', 'e220', 'e221', 'e222', 'e223', 'e224', 'e226', 'e227', 'e228'] },
  { key: 'lupinen', name: 'Lupinen', beispiele: 'Lupine und Erzeugnisse', synonyme: ['lupine', 'lupinen', 'lupinenmehl'] },
  { key: 'weichtiere', name: 'Weichtiere', beispiele: 'Muscheln, Schnecken, Tintenfisch, Austern', synonyme: ['weichtier', 'muschel', 'schnecke', 'tintenfisch', 'calamari', 'auster', 'miesmuschel', 'jakobsmuschel'] },
];

export const ALLERGEN_KEYS: string[] = ALLERGENE.map((a) => a.key);
const ALLERGEN_BY_KEY: Record<string, Allergen> = Object.fromEntries(ALLERGENE.map((a) => [a.key, a]));

/** Nährwertfelder in amtlicher Reihenfolge (je 100 g/ml). */
export const NAEHRWERT_FELDER: { key: string; label: string; einheit: string; unter?: boolean }[] = [
  { key: 'energie_kj', label: 'Brennwert', einheit: 'kJ' },
  { key: 'energie_kcal', label: 'Brennwert', einheit: 'kcal' },
  { key: 'fett', label: 'Fett', einheit: 'g' },
  { key: 'gesaettigt', label: 'davon gesättigte Fettsäuren', einheit: 'g', unter: true },
  { key: 'kohlenhydrate', label: 'Kohlenhydrate', einheit: 'g' },
  { key: 'zucker', label: 'davon Zucker', einheit: 'g', unter: true },
  { key: 'eiweiss', label: 'Eiweiß', einheit: 'g' },
  { key: 'salz', label: 'Salz', einheit: 'g' },
];

function r2(n: unknown): number { return Math.round((Number(n) || 0) * 100) / 100; }

// ---------------------------------------------------------------------------
// Allergene parsen / benennen
// ---------------------------------------------------------------------------
export function parseAllergene(text: string | null | undefined): string[] {
  if (!text) return [];
  const roh = String(text).split(/[;,\n\r\t]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return roh.filter((k, i) => ALLERGEN_BY_KEY[k] && roh.indexOf(k) === i);
}

export function allergenNamen(keys: string[]): string[] {
  return keys.map((k) => ALLERGEN_BY_KEY[k]?.name).filter(Boolean) as string[];
}

export function istAllergenKey(key: string): boolean {
  return !!ALLERGEN_BY_KEY[key];
}

// ---------------------------------------------------------------------------
// Energie-Umrechnung / Plausibilität (1 kcal = 4,184 kJ)
// ---------------------------------------------------------------------------
export function kjAusKcal(kcal: unknown): number { return r2((Number(kcal) || 0) * 4.184); }
export function kcalAusKj(kj: unknown): number { return r2((Number(kj) || 0) / 4.184); }

/** Passen kJ und kcal grob zusammen? (Toleranz Standard 15 %). */
export function energiePlausibel(kj: unknown, kcal: unknown, toleranz = 0.15): boolean {
  const k = Number(kj) || 0, c = Number(kcal) || 0;
  if (k <= 0 || c <= 0) return true; // nichts zu prüfen
  const erwartet = c * 4.184;
  return Math.abs(k - erwartet) <= erwartet * toleranz;
}

// ---------------------------------------------------------------------------
// Allergen-Hervorhebung im Zutatentext (Art. 21 — fett hervorheben)
// ---------------------------------------------------------------------------
export interface Segment { t: string; bold: boolean }

function synonymeFor(keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const a = ALLERGEN_BY_KEY[k];
    if (a) out.push(...a.synonyme);
  }
  return [...new Set(out)];
}

/**
 * Passt ein einzelnes Wort auf eines der Synonyme?
 * Lange Stämme (≥4 Zeichen) greifen als Teilwort — deckt deutsche Komposita ab
 * (Vollmilch→milch, Weizenmehl→weizen). Kurze Signale (<4, z. B. „ei") nur als
 * ganzes Wort, damit „Weizen"/„Fleisch" NICHT fälschlich als Ei zählen.
 */
function wortTrifft(wort: string, syns: string[]): boolean {
  const w = wort.toLowerCase();
  for (const s of syns) {
    if (s.length >= 4) { if (w.includes(s)) return true; }
    else if (w === s) return true;
  }
  return false;
}

/**
 * Zerlegt den Zutatentext in Segmente; ganze Wörter, die zu einem Synonym der
 * ausgewählten Allergene gehören, werden bold=true markiert (Art. 21 — fett).
 * Der Text bleibt vollständig erhalten (Segmente aneinandergehängt = Original).
 */
export function zutatenSegmente(text: string | null | undefined, keys: string[]): Segment[] {
  const s = String(text || '');
  if (!s) return [];
  const syns = synonymeFor(keys);
  if (syns.length === 0) return [{ t: s, bold: false }];
  const parts = s.split(/([\p{L}][\p{L}\d]*)/u); // Wörter als eigene Stücke
  const out: Segment[] = [];
  for (const part of parts) {
    if (part === '') continue;
    const istWort = /^[\p{L}]/u.test(part);
    const bold = istWort && wortTrifft(part, syns);
    const letztes = out[out.length - 1];
    if (letztes && letztes.bold === bold) letztes.t += part;
    else out.push({ t: part, bold });
  }
  return out;
}

/** Erkennt anhand des Zutatentexts, welche der 14 Allergene vermutlich enthalten sind (Vorschlag). */
export function findeAllergene(text: string | null | undefined): string[] {
  const s = String(text || '');
  if (!s) return [];
  const woerter = (s.match(/[\p{L}][\p{L}\d]*/gu) || []).map((w) => w.toLowerCase());
  const treffer: string[] = [];
  for (const a of ALLERGENE) {
    if (woerter.some((w) => wortTrifft(w, a.synonyme))) treffer.push(a.key);
  }
  return treffer;
}

// ---------------------------------------------------------------------------
// Pflichtangaben (LMIV Art. 9) — verpackt vs. lose
// ---------------------------------------------------------------------------
export interface EtikettLite {
  art?: string | null; // 'verpackt' | 'lose'
  bezeichnung?: string | null;
  zutaten?: string | null;
  nettomenge?: string | null;
  mhd?: string | null;
  verantwortlicher?: string | null;
  allergene?: string | null;
  energie_kj?: number | null;
  energie_kcal?: number | null;
  fett?: number | null;
  gesaettigt?: number | null;
  kohlenhydrate?: number | null;
  zucker?: number | null;
  eiweiss?: number | null;
  salz?: number | null;
}

const NW_KEYS: (keyof EtikettLite)[] = ['energie_kj', 'energie_kcal', 'fett', 'gesaettigt', 'kohlenhydrate', 'zucker', 'eiweiss', 'salz'];

/** Sind alle 8 Nährwertangaben gesetzt? (0 ist gültig, null/undefined nicht.) */
export function naehrwertVollstaendig(p: EtikettLite): boolean {
  return NW_KEYS.every((k) => p[k] != null && p[k] !== ('' as never));
}

function leer(s: string | null | undefined): boolean { return !s || String(s).trim() === ''; }

/**
 * Fehlende LMIV-Pflichtangaben als lesbare Labels.
 * verpackt (Art. 9): Bezeichnung, Zutatenverzeichnis, Nettofüllmenge, MHD,
 *   Verantwortlicher (Name/Anschrift), vollständige Nährwertdeklaration.
 * lose (LMIDV): nur Verkehrsbezeichnung + Allergeninfo verfügbar.
 */
export function fehlendePflichtangaben(p: EtikettLite): string[] {
  const fehlt: string[] = [];
  const lose = (p.art ?? 'verpackt') === 'lose';
  if (leer(p.bezeichnung)) fehlt.push('Verkehrsbezeichnung');
  if (lose) {
    if (leer(p.allergene)) fehlt.push('Allergenangabe');
    return fehlt;
  }
  if (leer(p.zutaten)) fehlt.push('Zutatenverzeichnis');
  if (leer(p.nettomenge)) fehlt.push('Nettofüllmenge');
  if (leer(p.mhd)) fehlt.push('Mindesthaltbarkeitsdatum');
  if (leer(p.verantwortlicher)) fehlt.push('Verantwortlicher (Name/Anschrift)');
  if (!naehrwertVollstaendig(p)) fehlt.push('Nährwertdeklaration');
  return fehlt;
}

export function pflichtangabenVollstaendig(p: EtikettLite): boolean {
  return fehlendePflichtangaben(p).length === 0;
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeEtiketten)
// ---------------------------------------------------------------------------
export interface EtikettenKennzahlen {
  gesamt: number;
  unvollstaendig: number; // Pflichtangaben fehlen
  ohneNaehrwert: number;  // verpackt, aber Nährwerttabelle unvollständig
  verpackt: number;
}

export function zaehleEtiketten(produkte: EtikettLite[]): EtikettenKennzahlen {
  let unvollstaendig = 0, ohneNaehrwert = 0, verpackt = 0;
  for (const p of produkte || []) {
    if (fehlendePflichtangaben(p).length > 0) unvollstaendig++;
    const istVerpackt = (p.art ?? 'verpackt') !== 'lose';
    if (istVerpackt) {
      verpackt++;
      if (!naehrwertVollstaendig(p)) ohneNaehrwert++;
    }
  }
  return { gesamt: (produkte || []).length, unvollstaendig, ohneNaehrwert, verpackt };
}
