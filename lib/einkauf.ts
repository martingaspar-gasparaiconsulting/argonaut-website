// lib/einkauf.ts
// B-I · Warenfluss / Beschaffung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Deckt Einkauf & Lieferanten, Wareneingang, Retouren/Reklamationen und
// Nachkalkulation ab. Alle Beträge netto.
// Handelskalkulation (verifiziert 07/2026):
//   Kalkulationszuschlag/Aufschlag = (VK − EK) / EK × 100  (bezogen auf EK)
//   Handelsspanne/Marge            = (VK − EK) / VK × 100  (bezogen auf VK)
// Node-getestet (einkauf.test.ts).

// ▄▄▄ PUNKT 30 (20.09.2026) — an lib/zahlen.ts angeschlossen ▄▄▄
// Die eigenen Zahl-Leser (Number(x) || 0) und die eigene Cent-Rundung sind
// weg. Zwei Fehler steckten darin:
//   1. Ein Betrag als "1.234,56" wurde zu 0, "12.500" zu 12,5 — Supabase
//      liefert numeric-Spalten haeufig als Text.
//   2. Ein negativer Wert rundete anders als derselbe Betrag positiv:
//      -2,675 wurde -2,67, +2,675 aber 2,68.
// Wichtiger als beides: es wird jetzt ZUERST GELESEN und DANN GERECHNET.
// Runden allein half nicht — bei a - b macht JavaScript aus "10.000"
// schon vor dem Runden die Zahl 10.
// Die ANZEIGE aendert sich dadurch nicht — nur die Zahlen stimmen.
import { leseZahlOder, centRunden } from './zahlen';

export type BestellStatus = 'entwurf' | 'bestellt' | 'teilgeliefert' | 'geliefert' | 'storniert';

export const BESTELL_STATUS: Record<BestellStatus, { label: string; farbe: 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' | 'warn' }> = {
  entwurf:       { label: '📝 Entwurf',       farbe: 'textDim' },
  bestellt:      { label: '📦 Bestellt',      farbe: 'cyan' },
  teilgeliefert: { label: '🚚 Teilgeliefert', farbe: 'gold' },
  geliefert:     { label: '✓ Geliefert',      farbe: 'green' },
  storniert:     { label: '✕ Storniert',      farbe: 'textDim' },
};

/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

export interface PositionLite {
  menge?: number;
  menge_erhalten?: number;
  retoure_menge?: number;
  ek_preis?: number;    // netto je Einheit
  mwst_satz?: number;
}

/** Netto-Wert einer Bestellposition (Menge × EK). */
export function positionNetto(p: PositionLite): number {
  return r2(z(p.menge) * z(p.ek_preis));
}

/** Noch nicht gelieferte Menge (>= 0). */
export function offeneMenge(p: PositionLite): number {
  return Math.max(z(p.menge) - z(p.menge_erhalten), 0);
}

/** Netto-Summe einer Bestellung über alle Positionen. */
export function bestellNetto(positionen: PositionLite[]): number {
  return r2(positionen.reduce((s, p) => s + positionNetto(p), 0));
}

/** Retoure-Menge-Summe über alle Positionen. */
export function retoureSumme(positionen: PositionLite[]): number {
  return positionen.reduce((s, p) => s + z(p.retoure_menge), 0);
}

/** Liefergrad aus den Positionen ableiten (unabhängig vom gespeicherten Status). */
export function lieferStatus(positionen: PositionLite[]): 'offen' | 'teilgeliefert' | 'geliefert' {
  if (positionen.length === 0) return 'offen';
  const gesamt = positionen.reduce((s, p) => s + z(p.menge), 0);
  const erhalten = positionen.reduce((s, p) => s + z(p.menge_erhalten), 0);
  if (erhalten <= 0) return 'offen';
  if (erhalten >= gesamt) return 'geliefert';
  return 'teilgeliefert';
}

// ---------------------------------------------------------------------------
// Kalkulation
// ---------------------------------------------------------------------------
export interface KalkErgebnis {
  ekNetto: number;
  selbstkosten: number;     // EK + Gemeinkosten
  vkNetto: number;
  rohertrag: number;        // VK − EK
  aufschlagProz: number;    // Kalkulationszuschlag (auf EK)
  handelsspanneProz: number; // Marge (auf VK)
}

/** Vorkalkulation: aus EK + Gemeinkosten-% + Gewinn-% den VK bestimmen. */
export function kalkuliereVk(ekNetto: number, gemeinkostenProz: number, gewinnProz: number): KalkErgebnis {
  const ek = r2(ekNetto);
  const selbstkosten = r2(ek * (1 + z(gemeinkostenProz) / 100));
  const vkNetto = r2(selbstkosten * (1 + z(gewinnProz) / 100));
  return baueKalk(ek, selbstkosten, vkNetto);
}

/** Nachkalkulation: aus tatsächlichem EK und erzieltem VK die Kennzahlen. */
export function margenAusVk(ekNetto: number, vkNetto: number, gemeinkostenProz: number = 0): KalkErgebnis {
  const ek = r2(ekNetto);
  const selbstkosten = r2(ek * (1 + z(gemeinkostenProz) / 100));
  return baueKalk(ek, selbstkosten, r2(vkNetto));
}

function baueKalk(ek: number, selbstkosten: number, vkNetto: number): KalkErgebnis {
  const rohertrag = r2(vkNetto - ek);
  const aufschlagProz = ek > 0 ? r2(((vkNetto - ek) / ek) * 100) : 0;
  const handelsspanneProz = vkNetto > 0 ? r2(((vkNetto - ek) / vkNetto) * 100) : 0;
  return { ekNetto: ek, selbstkosten, vkNetto, rohertrag, aufschlagProz, handelsspanneProz };
}

export function bruttoAusNetto(netto: number, mwstSatz: number = 19): { netto: number; mwst: number; brutto: number; mwstSatz: number } {
  const n = r2(netto); const satz = z(mwstSatz);
  const mwst = r2(n * satz / 100);
  return { netto: n, mwst, brutto: r2(n + mwst), mwstSatz: satz };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeEinkauf).
// ---------------------------------------------------------------------------
export interface BestellungLite {
  status?: string;
  positionen: PositionLite[];
}
export interface EinkaufKennzahlen {
  offeneBestellungen: number;   // bestellt/teilgeliefert
  wareneingangOffen: number;    // offene Bestellungen mit noch offener Menge
  retourenOffen: number;        // Positionen mit Retoure-Menge > 0
  bestellwertOffen: number;     // Netto-Summe offener Bestellungen
  lieferantenAktiv: number;
}

export function zaehleEinkauf(bestellungen: BestellungLite[], lieferanten: { status?: string }[] = []): EinkaufKennzahlen {
  let offeneBestellungen = 0, wareneingangOffen = 0, retourenOffen = 0, bestellwertOffen = 0;
  for (const b of bestellungen) {
    const st = b.status ?? 'entwurf';
    retourenOffen += b.positionen.filter((p) => z(p.retoure_menge) > 0).length;
    if (st === 'bestellt' || st === 'teilgeliefert') {
      offeneBestellungen++;
      bestellwertOffen += bestellNetto(b.positionen);
      if (b.positionen.some((p) => offeneMenge(p) > 0)) wareneingangOffen++;
    }
  }
  return {
    offeneBestellungen,
    wareneingangOffen,
    retourenOffen,
    bestellwertOffen: r2(bestellwertOffen),
    lieferantenAktiv: lieferanten.filter((l) => (l.status ?? 'aktiv') === 'aktiv').length,
  };
}
