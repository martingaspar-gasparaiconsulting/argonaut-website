// lib/gutscheine.ts
// B-III · Verkaufsförderung — Gutscheine & Pakete. Reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Drei Gutschein-Arten in EINEM Modul (art):
//   · wert          — Wertgutschein: Guthaben in €, teil-einlösbar, Restwert bleibt.
//   · mehrfachkarte — 10er-Karte / Leistungspaket: N Nutzungen, je Besuch -1.
//   · leistung      — Leistungsgutschein: eine konkrete Leistung, ganz einlösbar.
//
// Recht (verifiziert 07/2026):
//   · Verjährung §195/§199 BGB = 3 Jahre, Beginn Schluss des Ausstellungsjahres.
//     Ein Gutschein von 2026 ist also bis 31.12.2029 gültig. AGB-Verkürzung (z. B.
//     "1 Jahr") ist grundsätzlich unwirksam (BGH XI ZR 56/07). Restwert bleibt.
//   · USt §3 Abs. 13–15 UStG: Einzweckgutschein -> Steuer bei AUSGABE; Mehrzweck-
//     gutschein -> Steuer erst bei EINLÖSUNG.
// Node-getestet (gutscheine.test.ts).

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

export type GutscheinArt = 'wert' | 'mehrfachkarte' | 'leistung';
export type MwStTyp = 'einzweck' | 'mehrzweck';

export interface GutscheinArtInfo {
  key: GutscheinArt;
  label: string;
  icon: string;
  hatBetrag: boolean;      // Guthaben in € (wert/leistung/karte-Preis)
  hatNutzungen: boolean;   // N Nutzungen (mehrfachkarte)
}

export const GUTSCHEIN_ARTEN: GutscheinArtInfo[] = [
  { key: 'wert',          label: 'Wertgutschein',      icon: '💶', hatBetrag: true,  hatNutzungen: false },
  { key: 'mehrfachkarte', label: 'Mehrfachkarte',      icon: '🎟', hatBetrag: true,  hatNutzungen: true  },
  { key: 'leistung',      label: 'Leistungsgutschein', icon: '🎁', hatBetrag: true,  hatNutzungen: false },
];

export function gutscheinArtInfo(art: GutscheinArt): GutscheinArtInfo {
  return GUTSCHEIN_ARTEN.find((a) => a.key === art) ?? GUTSCHEIN_ARTEN[0];
}

export const MWST_TYPEN: { key: MwStTyp; label: string; hinweis: string }[] = [
  { key: 'mehrzweck', label: 'Mehrzweckgutschein', hinweis: 'Steuer erst bei Einlösung (Leistung/Steuersatz bei Ausgabe offen).' },
  { key: 'einzweck',  label: 'Einzweckgutschein',  hinweis: 'Steuer schon bei Ausgabe (Leistung & Steuersatz stehen fest).' },
];

export const VERJAEHRUNG_JAHRE = 3;

// ---------------------------------------------------------------------------
// Verjährung / Gültigkeit
// ---------------------------------------------------------------------------
function jahrVon(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 4) { const y = Number(v.slice(0, 4)); if (y) return y; }
  return (v instanceof Date ? v : new Date(v)).getFullYear();
}

/** Gesetzliches Gültigkeitsende: 31.12. des Jahres (Ausstellungsjahr + 3). */
export function verjaehrungEnde(ausgestelltAm: string | Date, jahre: number = VERJAEHRUNG_JAHRE): string {
  return `${jahrVon(ausgestelltAm) + jahre}-12-31`;
}

const MS_TAG = 86400000;
function tagUTC(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 10) {
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (y && m && d) return Date.UTC(y, m - 1, d);
  }
  const dt = v instanceof Date ? v : new Date(v);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** Verfallen = gültig-bis liegt VOR heute (der Gültigkeitstag selbst zählt noch). */
export function istVerfallen(gueltigBis: string | Date | null | undefined, jetzt: string | Date = new Date()): boolean {
  if (!gueltigBis) return false;
  return tagUTC(gueltigBis) < tagUTC(jetzt);
}

/** Tage bis zum Verfall (negativ = schon verfallen). */
export function tageBisVerfall(gueltigBis: string | Date, jetzt: string | Date = new Date()): number {
  return Math.round((tagUTC(gueltigBis) - tagUTC(jetzt)) / MS_TAG);
}

// ---------------------------------------------------------------------------
// Restwert / Restnutzungen
// ---------------------------------------------------------------------------
/** Liest einen Wert aus der Datenbank als Zahl. Supabase liefert numeric oft als Text. */
function z(x: unknown): number { return leseZahlOder(x, 0); }

function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

export function restwert(wert: number, eingeloest: number): number {
  return r2(Math.max(z(wert) - z(eingeloest), 0));
}

export function restNutzungen(gesamt: number, verbraucht: number): number {
  return Math.max(z(gesamt) - z(verbraucht), 0);
}

export interface GutscheinLite {
  art: GutscheinArt;
  wert?: number;
  eingeloest?: number;
  nutzungen_gesamt?: number | null;
  nutzungen_verbraucht?: number;
  gueltig_bis?: string | null;
  status?: string; // aktiv|eingeloest|verfallen|storniert (gespeichert)
}

/** Ist der Gutschein fachlich aufgebraucht (unabhängig vom gespeicherten Status)? */
export function istAufgebraucht(g: GutscheinLite): boolean {
  if (g.art === 'mehrfachkarte') return restNutzungen(g.nutzungen_gesamt || 0, g.nutzungen_verbraucht || 0) <= 0;
  return restwert(g.wert || 0, g.eingeloest || 0) <= 0;
}

/** Abgeleiteter Anzeige-Status: storniert > verfallen > eingeloest > aktiv. */
export function gutscheinStatus(g: GutscheinLite, jetzt: string | Date = new Date()): 'aktiv' | 'eingeloest' | 'verfallen' | 'storniert' {
  if (g.status === 'storniert') return 'storniert';
  if (istAufgebraucht(g)) return 'eingeloest';
  if (istVerfallen(g.gueltig_bis, jetzt)) return 'verfallen';
  return 'aktiv';
}

// ---------------------------------------------------------------------------
// Einlösung — prüft und rechnet, mutiert NICHTS.
// ---------------------------------------------------------------------------
export interface EinloesePruefung { ok: boolean; grund?: string; neuerRest: number; }

/** Prüft eine Wert-/Leistungs-Einlösung um `betrag` (brutto). */
export function pruefeEinloesungBetrag(g: GutscheinLite, betrag: number, jetzt: string | Date = new Date()): EinloesePruefung {
  const rest = restwert(g.wert || 0, g.eingeloest || 0);
  if (g.status === 'storniert') return { ok: false, grund: 'Gutschein ist storniert.', neuerRest: rest };
  if (istVerfallen(g.gueltig_bis, jetzt)) return { ok: false, grund: 'Gutschein ist verfallen.', neuerRest: rest };
  const b = z(betrag);
  if (b <= 0) return { ok: false, grund: 'Betrag muss größer als 0 sein.', neuerRest: rest };
  if (b > rest + 1e-9) return { ok: false, grund: `Nur noch ${rest.toFixed(2)} € Restwert verfügbar.`, neuerRest: rest };
  return { ok: true, neuerRest: r2(rest - b) };
}

/** Prüft eine Karten-Einlösung um `anzahl` Nutzungen. */
export function pruefeEinloesungNutzung(g: GutscheinLite, anzahl: number, jetzt: string | Date = new Date()): EinloesePruefung {
  const rest = restNutzungen(g.nutzungen_gesamt || 0, g.nutzungen_verbraucht || 0);
  if (g.status === 'storniert') return { ok: false, grund: 'Karte ist storniert.', neuerRest: rest };
  if (istVerfallen(g.gueltig_bis, jetzt)) return { ok: false, grund: 'Karte ist verfallen.', neuerRest: rest };
  const n = Math.round(z(anzahl));
  if (n <= 0) return { ok: false, grund: 'Anzahl muss größer als 0 sein.', neuerRest: rest };
  if (n > rest) return { ok: false, grund: `Nur noch ${rest} Nutzung(en) verfügbar.`, neuerRest: rest };
  return { ok: true, neuerRest: rest - n };
}

// ---------------------------------------------------------------------------
// Steuer (Einzweckgutschein): Netto/USt aus Bruttowert.
// ---------------------------------------------------------------------------
export interface SteuerAufteilung { brutto: number; netto: number; mwstSatz: number; mwst: number; }
export function nettoAusBrutto(brutto: number, mwstSatz: number): SteuerAufteilung {
  const b = r2(brutto);
  const satz = z(mwstSatz);
  const netto = r2(b / (1 + satz / 100));
  return { brutto: b, netto, mwstSatz: satz, mwst: r2(b - netto) };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeGutscheine).
// ---------------------------------------------------------------------------
export interface GutscheinKennzahlen {
  aktive: number;
  offenerRestwert: number;   // Summe Restwert aktiver Wert-/Leistungsgutscheine (Verbindlichkeit)
  kartenOffen: number;       // aktive Mehrfachkarten mit Restnutzungen
  baldVerfallend: number;    // aktiv & Verfall in <= 90 Tagen
  verfallen: number;         // verfallen, aber Restwert/Nutzung offen
  eingeloestBetrag: number;  // Summe bereits eingelöster Beträge
}

export const BALD_VERFALL_TAGE = 90;

export function zaehleGutscheine(gutscheine: GutscheinLite[], jetzt: string | Date = new Date()): GutscheinKennzahlen {
  let aktive = 0, offenerRestwert = 0, kartenOffen = 0, baldVerfallend = 0, verfallen = 0, eingeloestBetrag = 0;
  for (const g of gutscheine) {
    eingeloestBetrag += z(g.eingeloest);
    const st = gutscheinStatus(g, jetzt);
    if (st === 'aktiv') {
      aktive++;
      if (g.art === 'mehrfachkarte') {
        if (restNutzungen(g.nutzungen_gesamt || 0, g.nutzungen_verbraucht || 0) > 0) kartenOffen++;
      } else {
        offenerRestwert += restwert(g.wert || 0, g.eingeloest || 0);
      }
      if (g.gueltig_bis) {
        const t = tageBisVerfall(g.gueltig_bis, jetzt);
        if (t >= 0 && t <= BALD_VERFALL_TAGE) baldVerfallend++;
      }
    } else if (st === 'verfallen') {
      verfallen++;
    }
  }
  return {
    aktive,
    offenerRestwert: r2(offenerRestwert),
    kartenOffen,
    baldVerfallend,
    verfallen,
    eingeloestBetrag: r2(eingeloestBetrag),
  };
}
