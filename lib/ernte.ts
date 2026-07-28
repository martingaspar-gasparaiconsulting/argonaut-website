// lib/ernte.ts
// L2-6 · Ernte, Direktvermarktung & Marktstände (Landwirtschaft) — reine Formeln.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Drei Bereiche: Ernteerfassung (Menge/Qualität/Lager, dockt an Schlagkartei),
// Produktkatalog (Direktvermarktung, Preise inkl. MwSt) und Markttag-Abrechnung
// (verkaufte Mengen → Tageserlös netto/MwSt/brutto).
// Verkaufspreise werden als BRUTTO (Endkundenpreis) geführt; netto/MwSt werden
// herausgerechnet. MwSt-Satz je Produkt frei (Default 7 %; §24-Pauschalierer
// setzen ihren eigenen Durchschnittssatz). Node-getestet (ernte.test.ts).

export const ERNTE_STATUS = ['gelagert', 'verkauft', 'verarbeitet', 'entsorgt'] as const;
export const MARKT_KATEGORIEN = ['Gemüse', 'Obst', 'Kartoffeln', 'Eier', 'Fleisch & Wurst', 'Milchprodukte', 'Getreide & Mehl', 'Honig', 'Getränke', 'Sonstiges'] as const;
export const HERKUNFT = ['eigen', 'zugekauft'] as const;

function n(x: unknown): number { return Number(x) || 0; }
function r2(x: unknown): number { return Math.round(n(x) * 100) / 100; }

// ---------------------------------------------------------------------------
// Verkaufswerte (Preis = Brutto, netto/MwSt herausgerechnet)
// ---------------------------------------------------------------------------
export interface VerkaufsWerte { brutto: number; netto: number; mwst: number; }
export function verkaufsWerte(menge: unknown, einzelpreisBrutto: unknown, mwstSatz: unknown): VerkaufsWerte {
  const brutto = r2(n(menge) * n(einzelpreisBrutto));
  const satz = n(mwstSatz);
  const netto = r2(brutto / (1 + satz / 100));
  return { brutto, netto, mwst: r2(brutto - netto) };
}

export interface VerkaufLite { datum?: string | null; ort?: string | null; menge?: number | null; einzelpreis?: number | null; mwst_satz?: number | null; }

/** Tagessumme über eine Liste Verkäufe. */
export function tagesSumme(verkaeufe: VerkaufLite[]): { brutto: number; netto: number; mwst: number; posten: number } {
  let brutto = 0, netto = 0, mwst = 0;
  for (const v of verkaeufe || []) {
    const w = verkaufsWerte(v.menge, v.einzelpreis, v.mwst_satz);
    brutto += w.brutto; netto += w.netto; mwst += w.mwst;
  }
  return { brutto: r2(brutto), netto: r2(netto), mwst: r2(mwst), posten: (verkaeufe || []).length };
}

export function markttagKey(datum: string | null | undefined, ort: string | null | undefined): string {
  return `${(datum ?? '').trim()}||${(ort ?? '').trim().toLowerCase()}`;
}

export interface Markttag { datum: string; ort: string; verkaeufe: VerkaufLite[]; brutto: number; netto: number; mwst: number; }
/** Verkäufe zu Markttagen (datum + ort) bündeln, neueste zuerst. */
export function gruppiereMarkttage(verkaeufe: VerkaufLite[]): Markttag[] {
  const map = new Map<string, VerkaufLite[]>();
  for (const v of verkaeufe || []) {
    const k = markttagKey(v.datum, v.ort);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(v);
  }
  const tage: Markttag[] = [];
  for (const vs of map.values()) {
    const s = tagesSumme(vs);
    tage.push({ datum: vs[0].datum ?? '', ort: vs[0].ort ?? '', verkaeufe: vs, brutto: s.brutto, netto: s.netto, mwst: s.mwst });
  }
  tage.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  return tage;
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------
export interface ErnteLite { status?: string | null; }
export interface ProduktLite { verfuegbar?: boolean | null; }

export interface ErnteKennzahlen {
  erntePosten: number; gelagert: number;
  produkte: number; verfuegbar: number;
  verkaufsposten: number; umsatzBrutto: number; markttage: number;
  gesamt: number;
}

export function zaehleErnte(ernten: ErnteLite[], produkte: ProduktLite[], verkaeufe: VerkaufLite[]): ErnteKennzahlen {
  const gelagert = (ernten || []).filter((e) => (e.status ?? 'gelagert') === 'gelagert').length;
  const verfuegbar = (produkte || []).filter((p) => p.verfuegbar !== false).length;
  const s = tagesSumme(verkaeufe || []);
  const markttage = new Set((verkaeufe || []).map((v) => markttagKey(v.datum, v.ort))).size;
  return {
    erntePosten: (ernten || []).length, gelagert,
    produkte: (produkte || []).length, verfuegbar,
    verkaufsposten: (verkaeufe || []).length, umsatzBrutto: s.brutto, markttage,
    gesamt: (ernten || []).length + (produkte || []).length + (verkaeufe || []).length,
  };
}
