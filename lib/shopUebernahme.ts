// ============================================================================
// ARGONAUT OS · lib/shopUebernahme.ts  (Stufe 3 · B4 „Shop aus Inventar", Paket 204)
//
// Reine Logik (ohne Datenbank) für die Übernahme von Lager-Artikeln in den
// Onlineshop und für die Shop-Kasse.
//
// Claude-Befunde 04.10.2026 (vorher):
//   1. „Alle übernehmen" stellte auch Artikel OHNE Verkaufspreis in den Shop —
//      sie erschienen mit 0,00 € und wurden für 0,00 € bestellt.
//   2. Inaktive (ausgelistete) Artikel wurden mit übernommen und blieben im Shop
//      sichtbar und bestellbar.
//   3. Jede Shop-Bestellung rechnete pauschal mit 19 % MwSt — falsch für
//      Lebensmittel, Bücher usw. (7 %).
//   4. Die Kassen-Summe rundete mit Math.round statt der zentralen Cent-Rundung.
//   5. Übernahme nur über Filter, nicht per Auswahl einzelner Artikel.
//
// Bewusst NICHT: Bestand sperrt keine Bestellung. aktueller_bestand ist in der
// Datenbank „not null default 0" — Betriebe ohne Lagerführung hätten sonst
// jeden Artikel als ausverkauft. Bestand dient nur als Filter beim Übernehmen.
// ============================================================================

import { centRunden, leseZahl } from './zahlen';

/** Erlaubte MwSt-Sätze im Shop (Deutschland): Regelsatz, ermäßigt, steuerfrei. */
export const SHOP_MWST_SAETZE = [19, 7, 0] as const;
export type ShopMwst = (typeof SHOP_MWST_SAETZE)[number];
export const SHOP_MWST_STANDARD: ShopMwst = 19;

/** Gelesener Satz oder 19 % — nie ein Fantasie-Satz. */
export function shopMwst(wert: unknown): ShopMwst {
  const n = leseZahl(wert);
  if (n == null) return SHOP_MWST_STANDARD;
  const treffer = SHOP_MWST_SAETZE.find((s) => s === n);
  return treffer ?? SHOP_MWST_STANDARD;
}

export type ShopArtikelLite = {
  id: string;
  bezeichnung?: string | null;
  verkaufspreis?: number | string | null;
  aktiv?: boolean | null;
  aktueller_bestand?: number | string | null;
  im_shop?: boolean | null;
};

export type ShopHindernis = 'kein_preis' | 'inaktiv' | 'ohne_name';

/** Darf dieser Artikel in den Shop? Gründe in fester Reihenfolge. */
export function shopHindernisse(a: ShopArtikelLite): ShopHindernis[] {
  const h: ShopHindernis[] = [];
  const preis = leseZahl(a.verkaufspreis);
  if (preis == null || preis <= 0) h.push('kein_preis');
  if (a.aktiv === false) h.push('inaktiv');
  if (!String(a.bezeichnung ?? '').trim()) h.push('ohne_name');
  return h;
}

export function shopTauglich(a: ShopArtikelLite): boolean {
  return shopHindernisse(a).length === 0;
}

export const HINDERNIS_TEXT: Record<ShopHindernis, string> = {
  kein_preis: 'kein Verkaufspreis',
  inaktiv: 'Artikel ist inaktiv',
  ohne_name: 'keine Bezeichnung',
};

export function hindernisText(a: ShopArtikelLite): string {
  return shopHindernisse(a).map((h) => HINDERNIS_TEXT[h]).join(', ');
}

export type UebernahmePlan = {
  /** IDs, die in den Shop gestellt werden (tauglich und noch nicht drin). */
  neu: string[];
  /** Schon im Shop — bleibt, wird nicht doppelt gezählt. */
  schonDrin: number;
  /** Übersprungen je Grund (ein Artikel zählt beim ersten Grund). */
  ohnePreis: number;
  inaktiv: number;
  ohneName: number;
};

/** Plan für die Sammel-Übernahme (Filter oder Auswahl). */
export function planeUebernahme(liste: ShopArtikelLite[]): UebernahmePlan {
  const plan: UebernahmePlan = { neu: [], schonDrin: 0, ohnePreis: 0, inaktiv: 0, ohneName: 0 };
  const gesehen = new Set<string>();
  for (const a of liste) {
    if (!a || !a.id || gesehen.has(a.id)) continue;
    gesehen.add(a.id);
    const h = shopHindernisse(a);
    if (h.length) {
      if (h[0] === 'kein_preis') plan.ohnePreis++;
      else if (h[0] === 'inaktiv') plan.inaktiv++;
      else plan.ohneName++;
      continue;
    }
    if (a.im_shop) { plan.schonDrin++; continue; }
    plan.neu.push(a.id);
  }
  return plan;
}

function anzahl(n: number, ein: string, mehr: string): string {
  return `${n} ${n === 1 ? ein : mehr}`;
}

/** Rückmeldung nach der Übernahme, in „Sie"-Form, nur nicht-leere Teile. */
export function uebernahmeMeldung(plan: UebernahmePlan): string {
  const teile: string[] = [];
  teile.push(plan.neu.length
    ? `${anzahl(plan.neu.length, 'Artikel', 'Artikel')} in den Shop übernommen.`
    : 'Keine neuen Artikel übernommen.');
  if (plan.schonDrin) teile.push(`${anzahl(plan.schonDrin, 'war', 'waren')} schon im Shop.`);
  const sprung: string[] = [];
  if (plan.ohnePreis) sprung.push(`${plan.ohnePreis} ohne Verkaufspreis`);
  if (plan.inaktiv) sprung.push(`${plan.inaktiv} inaktiv`);
  if (plan.ohneName) sprung.push(`${plan.ohneName} ohne Bezeichnung`);
  if (sprung.length) {
    teile.push(`Übersprungen: ${sprung.join(', ')}.${plan.ohnePreis ? ' Bitte den Preis unter ERP → Preisliste ergänzen.' : ''}`);
  }
  return teile.join(' ');
}

/** Bestand-Filter beim Übernehmen: nur Artikel mit Bestand über 0. */
export function hatBestand(a: ShopArtikelLite): boolean {
  const b = leseZahl(a.aktueller_bestand);
  return b != null && b > 0;
}

// ---------------------------------------------------------------------------
// Öffentliche Seite und Kasse
// ---------------------------------------------------------------------------

export type ShopZeile = {
  id: string;
  bezeichnung: string | null;
  verkaufspreis: number | string | null;
  aktiv?: boolean | null;
  artikelnummer?: string | null;
  shop_mwst?: number | string | null;
};

/** Sichtbar und bestellbar: im Shop (vom Aufrufer gefiltert), aktiv, Preis > 0. */
export function oeffentlichBestellbar(a: ShopZeile): boolean {
  const preis = leseZahl(a.verkaufspreis);
  return a.aktiv !== false && preis != null && preis > 0;
}

export type ShopPosition = {
  bezeichnung: string;
  menge: number;
  einzelpreis: number;
  mwst: ShopMwst;
  artikelnummer?: string;
};

/** Menge aus dem Warenkorb: ganze Zahl 1 … 9999, sonst 0 (= verwerfen). */
export function leseMenge(wert: unknown): number {
  const n = Math.round(Number(wert));
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.min(9999, n);
}

/**
 * Bestell-Positionen aus den Server-Artikeln und den Wunschmengen.
 * Preise kommen NUR aus den Artikeln (nie vom Browser), nicht bestellbare
 * Artikel fallen weg. Summe brutto in Cent ohne Gleitkomma-Fehler.
 */
export function baueBestellung(
  artikel: ShopZeile[],
  wunsch: Map<string, number>,
): { positionen: ShopPosition[]; brutto: number } {
  const positionen: ShopPosition[] = [];
  let cent = 0;
  for (const a of artikel) {
    const menge = wunsch.get(a.id) || 0;
    if (menge <= 0 || !oeffentlichBestellbar(a)) continue;
    const einzel = centRunden(leseZahl(a.verkaufspreis) as number);
    positionen.push({
      bezeichnung: String(a.bezeichnung || 'Produkt'),
      menge,
      einzelpreis: einzel,
      mwst: shopMwst(a.shop_mwst),
      ...(a.artikelnummer ? { artikelnummer: String(a.artikelnummer) } : {}),
    });
    cent += Math.round(centRunden(menge * einzel) * 100);
  }
  return { positionen, brutto: centRunden(cent / 100) };
}
