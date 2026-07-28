// lib/housekeeping.ts
// L2-7 · Housekeeping & Speisekarte/Menü (Gastro/Hotellerie) — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Zwei Bereiche:
//   (A) Housekeeping — Reinigungsstatus je Zimmer/Einheit (schmutzig →
//       in Reinigung → sauber → geprüft), Priorität Abreise/Bleibt/Blockiert.
//   (B) Speisekarte/Menü — Gerichte mit Kategorie, Preis, Allergenen (14 aus
//       lib/etiketten wiederverwendet) und Zusatzstoff-Kenntlichmachung (Klartext,
//       rechtssicher; Nummern sind nur DEHOGA-Empfehlung).
// Node-getestet (housekeeping.test.ts).

// ===================== (A) HOUSEKEEPING =====================
export const HK_STATUS = ['schmutzig', 'in_reinigung', 'sauber', 'geprueft', 'gesperrt'] as const;
export type HkStatus = (typeof HK_STATUS)[number];
export const HK_PRIO = ['abreise', 'bleibt', 'blockiert'] as const;

/** Nächster Schritt im Reinigungs-Workflow. Endzustände (geprüft/gesperrt) bleiben. */
export function naechsterHkStatus(s: string): HkStatus {
  switch (s) {
    case 'schmutzig': return 'in_reinigung';
    case 'in_reinigung': return 'sauber';
    case 'sauber': return 'geprueft';
    default: return (s === 'gesperrt' ? 'gesperrt' : 'geprueft');
  }
}

/** Gilt das Zimmer als gereinigt (sauber oder geprüft)? */
export function istGereinigt(s: string | null | undefined): boolean {
  return s === 'sauber' || s === 'geprueft';
}

export interface ZimmerLite { status?: string | null; prio?: string | null; }

export interface HousekeepingKennzahlen {
  gesamt: number; schmutzig: number; inReinigung: number; sauber: number; geprueft: number; gesperrt: number;
  abreisenOffen: number; // Abreise-Zimmer, die noch nicht gereinigt und nicht gesperrt sind
}

export function zaehleHousekeeping(zimmer: ZimmerLite[]): HousekeepingKennzahlen {
  let schmutzig = 0, inReinigung = 0, sauber = 0, geprueft = 0, gesperrt = 0, abreisenOffen = 0;
  for (const z of zimmer || []) {
    const st = z.status ?? 'schmutzig';
    if (st === 'schmutzig') schmutzig++;
    else if (st === 'in_reinigung') inReinigung++;
    else if (st === 'sauber') sauber++;
    else if (st === 'geprueft') geprueft++;
    else if (st === 'gesperrt') gesperrt++;
    if ((z.prio ?? 'bleibt') === 'abreise' && st !== 'gesperrt' && !istGereinigt(st)) abreisenOffen++;
  }
  return { gesamt: (zimmer || []).length, schmutzig, inReinigung, sauber, geprueft, gesperrt, abreisenOffen };
}

// ===================== (B) SPEISEKARTE / MENÜ =====================
export const MENU_KATEGORIEN = ['Vorspeise', 'Suppe', 'Salat', 'Hauptgericht', 'Beilage', 'Dessert', 'Getränk', 'Snack', 'Sonstiges'] as const;

export interface Zusatzstoff { key: string; label: string }

/** Kennzeichnungspflichtige Zusatzstoffe (Klartext-Kenntlichmachung, DEHOGA-üblich). */
export const ZUSATZSTOFFE: Zusatzstoff[] = [
  { key: 'konservierung', label: 'mit Konservierungsstoff' },
  { key: 'farbstoff', label: 'mit Farbstoff' },
  { key: 'antioxidation', label: 'mit Antioxidationsmittel' },
  { key: 'geschmacksverstaerker', label: 'mit Geschmacksverstärker' },
  { key: 'geschwefelt', label: 'geschwefelt' },
  { key: 'geschwaerzt', label: 'geschwärzt' },
  { key: 'gewachst', label: 'gewachst' },
  { key: 'phosphat', label: 'mit Phosphat' },
  { key: 'suessung', label: 'mit Süßungsmittel' },
  { key: 'phenylalanin', label: 'enthält eine Phenylalaninquelle' },
  { key: 'koffein', label: 'koffeinhaltig' },
  { key: 'chinin', label: 'chininhaltig' },
];
const ZUSATZ_BY_KEY: Record<string, Zusatzstoff> = Object.fromEntries(ZUSATZSTOFFE.map((z) => [z.key, z]));

/** Zerlegt eine Schlüssel-Liste (";"/","/Zeile) → gültige, deduplizierte Keys. */
export function parseKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const roh = String(text).split(/[;,\n\r\t]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return roh.filter((k, i) => roh.indexOf(k) === i);
}

/** Zusatzstoff-Keys → Klartext-Labels (unbekannte fallen weg). */
export function zusatzLabels(keys: string[]): string[] {
  return keys.map((k) => ZUSATZ_BY_KEY[k]?.label).filter(Boolean) as string[];
}

export interface GerichtLite { preis?: number | null; verfuegbar?: boolean | null; }

export interface MenuKennzahlen { gesamt: number; verfuegbar: number; ausverkauft: number; ohnePreis: number; }

export function zaehleMenu(gerichte: GerichtLite[]): MenuKennzahlen {
  let verfuegbar = 0, ausverkauft = 0, ohnePreis = 0;
  for (const g of gerichte || []) {
    if (g.verfuegbar === false) ausverkauft++; else verfuegbar++;
    if (g.preis == null || Number(g.preis) === 0) ohnePreis++;
  }
  return { gesamt: (gerichte || []).length, verfuegbar, ausverkauft, ohnePreis };
}

/** Gerichte in der festen Kategorie-Reihenfolge gruppieren (unbekannte Kategorien ans Ende). */
export function kategorieRang(kat: string | null | undefined): number {
  const i = (MENU_KATEGORIEN as readonly string[]).indexOf(kat ?? 'Sonstiges');
  return i < 0 ? MENU_KATEGORIEN.length : i;
}
