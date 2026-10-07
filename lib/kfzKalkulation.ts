// ============================================================================
// ARGONAUT OS · lib/kfzKalkulation.ts — Paket 265 (07.10.2026) · K5 Kalkulation und Provision
//
// Plan- und Nachkalkulation je Bestandsfahrzeug: Erlös netto (§ 25a oder
// Regelsteuer), Einkauf, Kosten (Plan/Ist), Standkosten, Rohertrag,
// Gemeinkosten, Provision Verkäufer und Hereinnehmer, Deckungsbeitrag.
//
// GRUNDSÄTZE
// - Nichts wird erfunden: ohne Verkaufspreis oder ohne Einkauf kein Ertrag (null).
// - § 25a: Umsatzsteuer nur auf die positive Differenz VK − EK (19/119 davon);
//   Kosten mindern die Differenz NICHT, ihre Vorsteuer ist abziehbar (netto).
// - Provision nie negativ: bei Verlust ist eine Rohertrags-Provision 0.
// - Richtrechnung mit 19 %; die Rechnung selbst entsteht in K7.
//
// Nur Import der zentralen Rundung, KEINE Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden, rundeStellen } from './zahlen';

export const UST = 19;

export const KOSTEN_ARTEN: { key: string; name: string }[] = [
  { key: 'aufbereitung', name: 'Aufbereitung' },
  { key: 'reparatur', name: 'Reparatur / Werkstatt' },
  { key: 'teile', name: 'Teile' },
  { key: 'lack', name: 'Lack / Smart-Repair' },
  { key: 'reifen', name: 'Reifen' },
  { key: 'hu', name: 'HU / Gutachten' },
  { key: 'transport', name: 'Transport / Überführung' },
  { key: 'zulassung', name: 'Zulassung' },
  { key: 'werbung', name: 'Inserate / Werbung' },
  { key: 'fremd', name: 'Fremdleistung' },
  { key: 'sonstiges', name: 'Sonstiges' },
];

export type Kosten = { art: string; betrag_netto: number | null; plan: boolean };

export type ProvArt = 'rohertrag' | 'umsatz' | 'fest';
export const PROV_ARTEN: { key: ProvArt; name: string }[] = [
  { key: 'rohertrag', name: '% vom Rohertrag' },
  { key: 'umsatz', name: '% vom Erlös netto' },
  { key: 'fest', name: 'fester Betrag' },
];

export type KalkEingabe = {
  besteuerung: string | null;      // '25a' | 'regel' | null (offen: gerechnet wie § 25a, Hinweis in kalkHinweise)
  ek: number | null;               // Einkauf (bei Regel netto; bei § 25a Zahlbetrag; Kommission: Auszahlung an Eigentümer)
  vk: number | null;               // Verkaufspreis brutto
  kosten: number;                  // Summe Kosten netto
  standtage: number | null;
  standkostenTag: number | null;
  gemeinkostenProzent: number | null;  // auf Erlös netto
  provV: { art: ProvArt | null; wert: number | null };
  provH: { art: ProvArt | null; wert: number | null };
};

export type KalkErgebnis = {
  vollstaendig: boolean;
  fehlt: string[];
  erloesNetto: number | null;
  ust: number | null;
  ek: number | null;
  kosten: number;
  standkosten: number;
  rohertrag: number | null;        // Erlös netto − EK − Kosten − Standkosten
  gemeinkosten: number | null;
  provVerkaeufer: number | null;
  provHereinnehmer: number | null;
  deckungsbeitrag: number | null;  // Rohertrag − Gemeinkosten − Provisionen
  margeProzent: number | null;     // Deckungsbeitrag / Erlös netto
};

function pos(x: number | null | undefined): number {
  return x !== null && x !== undefined && Number.isFinite(x) && x > 0 ? x : 0;
}
function gueltig(x: number | null | undefined): x is number {
  return x !== null && x !== undefined && Number.isFinite(x) && x >= 0;
}

/** Erlös netto und Umsatzsteuer aus dem Brutto-Verkaufspreis. */
export function erloes(vk: number, ek: number, besteuerung: string | null): { netto: number; ust: number } {
  if (besteuerung === 'regel') {
    const netto = centRunden(vk / (1 + UST / 100));
    return { netto, ust: centRunden(vk - netto) };
  }
  // § 25a (auch wenn noch offen: Gebrauchtwagen von Privat sind der Regelfall; die Ansicht sagt es dazu)
  const diff = vk - ek;
  const ust = diff > 0 ? centRunden((diff * UST) / (100 + UST)) : 0;
  return { netto: centRunden(vk - ust), ust };
}

/** Provision nach Art: % vom Rohertrag (nie negativ), % vom Erlös netto oder fester Betrag. */
export function provision(p: { art: ProvArt | null; wert: number | null }, rohertrag: number, erloesNetto: number): number {
  if (!p.art || !gueltig(p.wert) || p.wert === 0) return 0;
  if (p.art === 'fest') return centRunden(p.wert);
  if (p.art === 'umsatz') return centRunden(Math.max(0, erloesNetto) * p.wert / 100);
  return centRunden(Math.max(0, rohertrag) * p.wert / 100);
}

export function kalkulation(e: KalkEingabe): KalkErgebnis {
  const fehlt: string[] = [];
  if (!gueltig(e.vk) || e.vk === 0) fehlt.push('Verkaufspreis');
  if (!gueltig(e.ek)) fehlt.push('Einkaufspreis');
  const standkosten = centRunden(pos(e.standtage) * pos(e.standkostenTag));
  const kosten = centRunden(pos(e.kosten));
  const leer: KalkErgebnis = {
    vollstaendig: false, fehlt, erloesNetto: null, ust: null, ek: gueltig(e.ek) ? e.ek : null, kosten, standkosten,
    rohertrag: null, gemeinkosten: null, provVerkaeufer: null, provHereinnehmer: null, deckungsbeitrag: null, margeProzent: null,
  };
  if (fehlt.length) return leer;
  const vk = e.vk as number, ek = e.ek as number;
  const { netto, ust } = erloes(vk, ek, e.besteuerung);
  const rohertrag = centRunden(netto - ek - kosten - standkosten);
  const gemeinkosten = centRunden(netto * pos(e.gemeinkostenProzent) / 100);
  const provVerkaeufer = provision(e.provV, rohertrag, netto);
  const provHereinnehmer = provision(e.provH, rohertrag, netto);
  const deckungsbeitrag = centRunden(rohertrag - gemeinkosten - provVerkaeufer - provHereinnehmer);
  const margeProzent = netto > 0 ? rundeStellen((deckungsbeitrag / netto) * 100, 1) : null;
  return { vollstaendig: true, fehlt, erloesNetto: netto, ust, ek, kosten, standkosten, rohertrag, gemeinkosten, provVerkaeufer, provHereinnehmer, deckungsbeitrag, margeProzent };
}

/**
 * Kosten summieren.
 * Ist   = alle Ist-Posten (wirklich angefallen).
 * Plan  = Ist-Posten + Plan-Posten, deren Art noch keinen Ist-Posten hat —
 *         ein erledigter Planposten zählt nicht doppelt.
 */
export function kostenSummen(liste: Kosten[]): { plan: number; ist: number } {
  const istArten = new Set(liste.filter((k) => !k.plan && pos(k.betrag_netto) > 0).map((k) => k.art));
  let plan = 0, ist = 0;
  for (const k of liste) {
    const b = pos(k.betrag_netto);
    if (!k.plan) { ist += b; plan += b; } else if (!istArten.has(k.art)) plan += b;
  }
  return { plan: centRunden(plan), ist: centRunden(ist) };
}

/** Ampel für den Deckungsbeitrag: rot bei Verlust, gelb unter 3 % vom Erlös, sonst grün. */
export function ertragAmpel(r: KalkErgebnis): 'ok' | 'warn' | 'bad' | 'dim' {
  if (!r.vollstaendig || r.deckungsbeitrag === null) return 'dim';
  if (r.deckungsbeitrag < 0) return 'bad';
  if (r.margeProzent !== null && r.margeProzent < 3) return 'warn';
  return 'ok';
}

/** Gültige Provisionseinstellung aus Datenbankwerten (unbekannte Art -> keine Provision). */
export function provAus(art: unknown, wert: unknown): { art: ProvArt | null; wert: number | null } {
  const a = art === 'rohertrag' || art === 'umsatz' || art === 'fest' ? art : null;
  const w = typeof wert === 'number' ? wert : wert === null || wert === undefined || wert === '' ? null : Number(wert);
  return { art: a, wert: w !== null && Number.isFinite(w) && w >= 0 ? w : null };
}

/** Hinweise in Klartext (nichts wird verhindert — vereinbart ist, was der Betrieb vereinbart hat). */
export function kalkHinweise(e: { provV: { art: ProvArt | null; wert: number | null }; provH: { art: ProvArt | null; wert: number | null }; besteuerung: string | null; kommission: boolean }): string[] {
  const h: string[] = [];
  for (const [wer, p] of [['Verkäufer', e.provV], ['Hereinnehmer', e.provH]] as const) {
    if (p.art && p.art !== 'fest' && p.wert !== null && p.wert > 50) h.push(`Provision ${wer}: ${p.wert} % ist ungewöhnlich hoch — bitte prüfen.`);
  }
  if (!e.besteuerung) h.push('Besteuerung ist offen — gerechnet wird wie § 25a. Bitte in den Stammdaten festlegen.');
  if (e.kommission) h.push('Kommission: Als Einkauf zählt der Betrag, den der Eigentümer nach dem Verkauf erhält.');
  return h;
}
