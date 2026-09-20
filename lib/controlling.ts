// ============================================================================
// ARGONAUT OS · lib/controlling.ts — Regel-Ebene: Controlling-Kennzahlen
//
// KEINE KI. Nur betriebswirtschaftliche Standardformeln — sofort, kostenlos,
// nachvollziehbar. Jede Funktion nimmt Klartext-Zahlen und liefert die
// abgeleiteten Kennzahlen zurueck. Bewertung (Ampel) macht die Seite.
//
// Reine Funktionen, keine Hooks/Supabase — ueberall importierbar.
// ============================================================================

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

/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

export function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

/** Sicheres Prozent teil/ganz*100 (0 bei Nenner 0). */
export function pct(teil: number, ganz: number): number {
  const g = z(ganz);
  if (g === 0) return 0;
  return r2(z(teil) / g * 100);
}

// ---- Ergebnis & Marge ----
export type ErgebnisIn = { umsatz: number; wareneinsatz: number; personalkosten: number; sonstigeKosten: number };
export type ErgebnisOut = {
  rohertrag: number; rohertragsquote: number;
  gesamtkosten: number; betriebsergebnis: number; umsatzrendite: number;
  personalkostenquote: number;
};
export function ergebnis(i: ErgebnisIn): ErgebnisOut {
  // ZUERST lesen, DANN rechnen. Wurde der Umsatz als "10.000" geliefert,
  // machte JavaScript bei i.umsatz - i.wareneinsatz daraus stillschweigend
  // die Zahl 10 — das Runden danach konnte das nicht mehr heilen.
  const umsatz = z(i.umsatz);
  const wareneinsatz = z(i.wareneinsatz);
  const personalkosten = z(i.personalkosten);
  const sonstigeKosten = z(i.sonstigeKosten);
  const rohertrag = r2(umsatz - wareneinsatz);
  const gesamtkosten = r2(wareneinsatz + personalkosten + sonstigeKosten);
  const betriebsergebnis = r2(umsatz - gesamtkosten);
  return {
    rohertrag, rohertragsquote: pct(rohertrag, umsatz),
    gesamtkosten, betriebsergebnis, umsatzrendite: pct(betriebsergebnis, umsatz),
    personalkostenquote: pct(personalkosten, umsatz),
  };
}

// ---- Break-even ----
export type BreakEvenOut = { breakEvenUmsatz: number | null; sicherheitsabstand: number | null };
export function breakEven(fixkosten: number, dbMargeProzent: number, istUmsatz?: number): BreakEvenOut {
  const m = z(dbMargeProzent) / 100;
  if (m <= 0) return { breakEvenUmsatz: null, sicherheitsabstand: null };
  const be = r2(z(fixkosten) / m);
  const ist = z(istUmsatz);
  const sicher = ist > 0 ? pct(ist - be, ist) : null;
  return { breakEvenUmsatz: be, sicherheitsabstand: sicher };
}

// ---- Liquidität (in %) ----
export type LiquiditaetIn = { liquide: number; forderungen: number; vorraete: number; kurzVerb: number };
export type LiquiditaetOut = { grad1: number; grad2: number; grad3: number };
export function liquiditaet(i: LiquiditaetIn): LiquiditaetOut {
  const liquide = z(i.liquide);
  const forderungen = z(i.forderungen);
  const vorraete = z(i.vorraete);
  const kurzVerb = z(i.kurzVerb);
  return {
    grad1: pct(liquide, kurzVerb),
    grad2: pct(liquide + forderungen, kurzVerb),
    grad3: pct(liquide + forderungen + vorraete, kurzVerb),
  };
}

// ---- Kalkulatorischer Stundensatz ----
export type StundensatzOut = { kostenSatz: number | null; mitGewinn: number | null };
export function stundensatz(jahreskosten: number, produktiveStunden: number, gewinnProzent: number): StundensatzOut {
  const std = z(produktiveStunden);
  if (std <= 0) return { kostenSatz: null, mitGewinn: null };
  const kostenSatz = r2(z(jahreskosten) / std);
  const mitGewinn = r2(kostenSatz * (1 + z(gewinnProzent) / 100));
  return { kostenSatz, mitGewinn };
}

// ---- Eigenkapitalquote (in %) ----
export function ekQuote(eigenkapital: number, bilanzsumme: number): number {
  return pct(eigenkapital, bilanzsumme);
}
