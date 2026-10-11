// ============================================================================
// ARGONAUT OS · lib/ersparnis.ts — „Was ARGONAUT Ihnen gespart hat" (Paket 309, SP1)
//
// Die Karte im Chef-Blick zeigt NUR MESSBARE Werte. Jede Zahl hat eine Quelle
// im eigenen Datenbestand des Betriebs — nichts wird geschaetzt, keine
// Stunden-Pauschale, keine "durchschnittliche Ersparnis".
//
//   1. Genutztes Skonto     eingangsbelege.skonto_abzug (vom Betrieb beim
//                           Bezahlen eingetragen), nur bezahlte Belege
//   2. Verzugszinsen        mahnung_historie: je Rechnung der HOECHSTE Zins-
//                           und Pauschalbetrag (jede Mahnstufe rechnet den
//                           Zins bis zu ihrem Tag neu — Summieren ueber die
//                           Stufen waere doppelt gezaehlt). Ausgewiesen als
//                           "geltend gemacht", NICHT als eingenommen, und
//                           deshalb NICHT in der Gesamtsumme.
//   3. Ersetzte Programme   import_altsystem_wahl.systeme (Umzug) — Betrag nur,
//                           wenn der Betrieb seine alten Kosten selbst
//                           eintraegt (ersparnis_angabe, art altprogramm);
//                           gezaehlt werden volle Monate ab "nicht mehr bezahlt ab"
//   4. THG-Praemie          ersparnis_angabe, art thg — vom Betrieb eingetragene
//                           ausgezahlte Praemien
//   5. Importe              import_jobs: uebernommene Datensaetze statt
//                           Abtippen — als ANZAHL, ohne Stunden (es gibt keine
//                           belegte Zeitquelle je Datensatz)
//
// Teilen (Social Media) nur mit Einwilligung des Betriebs: teilenText()
// enthaelt nie Kunden-, Lieferanten- oder Mitarbeiternamen, nur Summen.
//
// Reine Funktionen, keine Supabase-/React-Abhaengigkeit. Betraege in CENT.
// Node-getestet: tests/ersparnisP309.test.mjs
// ============================================================================

import { leseZahlOder, inCent } from './zahlen';

export const ART = ['altprogramm', 'thg'] as const;
export type ErsparnisArt = (typeof ART)[number];
export const JE = ['monat', 'einmal'] as const;
export type ErsparnisJe = (typeof JE)[number];

/** Obergrenze je Angabe: 100.000 € (Tippfehler-Schutz, wie in der DB). */
export const BETRAG_MAX_CENT = 10_000_000;
/** Modul-Schluessel in modul_einstellung fuer die Teilen-Einwilligung. */
export const ERSPARNIS_MODUL = 'ersparnis';

export interface Angabe {
  art: string | null;
  bezeichnung?: string | null;
  altsystem_key?: string | null;
  betrag_cent: number | string | null;
  je?: string | null;
  ab: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const istIso = (s: unknown): s is string => typeof s === 'string' && ISO.test(s.slice(0, 10)) && !Number.isNaN(Date.parse(s.slice(0, 10) + 'T00:00:00Z'));
const tag = (s: string) => s.slice(0, 10);
const ganz = (v: unknown) => Math.trunc(leseZahlOder(v, 0));

/** Volle Monate von `ab` bis `heute` (beide 'YYYY-MM-DD'); nie negativ. */
export function volleMonate(ab: string, heute: string): number {
  if (!istIso(ab) || !istIso(heute)) return 0;
  const [y1, m1, d1] = tag(ab).split('-').map(Number);
  const [y2, m2, d2] = tag(heute).split('-').map(Number);
  const m = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return m > 0 ? m : 0;
}

/** Tag genau 12 Monate vor heute (fuer "letzte 12 Monate"). */
export function vorZwoelfMonaten(heute: string): string {
  const [y, m, d] = tag(heute).split('-').map(Number);
  const t = new Date(Date.UTC(y - 1, m - 1, d));
  return t.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 1. Skonto
export interface BelegZeile { skonto_abzug: number | string | null; bezahlt_am: string | null }

export function skonto(belege: readonly BelegZeile[], heute: string) {
  const grenze = vorZwoelfMonaten(heute);
  let gesamt = 0, zwoelf = 0, anzahl = 0;
  for (const b of belege) {
    if (!b || !istIso(b.bezahlt_am)) continue;
    const c = inCent(leseZahlOder(b.skonto_abzug, 0));
    if (!(c > 0)) continue;
    gesamt += c; anzahl++;
    if (tag(b.bezahlt_am) > grenze) zwoelf += c;
  }
  return { gesamtCent: gesamt, zwoelfMonateCent: zwoelf, anzahl };
}

/**
 * Skonto-Abzug pruefen, bevor er am Beleg gespeichert wird.
 * Leer = kein Skonto (null). Sonst groesser 0 und hoechstens 10 % des Bruttobetrags
 * (lib/skonto SKONTO_MAX_PROZENT — alles darueber ist ein Tippfehler).
 */
export function skontoAbzugPruefen(eingabe: unknown, brutto: unknown): { ok: true; wert: number | null } | { ok: false; fehler: string } {
  if (eingabe === null || eingabe === undefined || String(eingabe).trim() === '') return { ok: true, wert: null };
  const w = leseZahlOder(eingabe, NaN);
  if (!Number.isFinite(w) || w <= 0) return { ok: false, fehler: 'Skonto-Abzug bitte als Betrag größer 0 eingeben (z. B. 24,80).' };
  const b = leseZahlOder(brutto, 0);
  if (b > 0 && inCent(w) > inCent(b) / 10) return { ok: false, fehler: 'Der Skonto-Abzug ist höher als 10 % des Belegs — bitte prüfen.' };
  return { ok: true, wert: inCent(w) / 100 };
}

// ------------------------------------------------------- 2. Verzugszinsen
export interface MahnZeile { rechnung_id: string | null; zins_betrag: number | string | null; pauschale_betrag: number | string | null }

export function verzug(historie: readonly MahnZeile[]) {
  const je = new Map<string, { zins: number; pauschale: number }>();
  for (const h of historie) {
    if (!h || !h.rechnung_id) continue;
    const z = Math.max(0, inCent(leseZahlOder(h.zins_betrag, 0)));
    const p = Math.max(0, inCent(leseZahlOder(h.pauschale_betrag, 0)));
    const alt = je.get(h.rechnung_id) ?? { zins: 0, pauschale: 0 };
    je.set(h.rechnung_id, { zins: Math.max(alt.zins, z), pauschale: Math.max(alt.pauschale, p) });
  }
  let zinsen = 0, pauschalen = 0, rechnungen = 0;
  for (const v of je.values()) {
    if (v.zins + v.pauschale <= 0) continue;
    zinsen += v.zins; pauschalen += v.pauschale; rechnungen++;
  }
  return { zinsenCent: zinsen, pauschalenCent: pauschalen, summeCent: zinsen + pauschalen, rechnungen };
}

// --------------------------------------------------- 3. Ersetzte Programme
export interface Programm {
  key: string;
  name: string;
  /** Monatliche Altkosten laut Betrieb — null, wenn nicht eingetragen. */
  monatCent: number | null;
  ab: string | null;
  monate: number;
  /** Gesparter Betrag = Monatskosten x volle Monate; null ohne Angabe. */
  gespartCent: number | null;
}

export function programme(
  systeme: readonly string[],
  angaben: readonly Angabe[],
  heute: string,
  nameVon: (key: string) => string | undefined,
): Programm[] {
  const kosten = new Map<string, Angabe>();
  for (const a of angaben) if (a?.art === 'altprogramm' && a.altsystem_key) kosten.set(a.altsystem_key, a);
  const keys = [...new Set([...systeme.filter((k) => typeof k === 'string' && k), ...kosten.keys()])];
  return keys.map((key) => {
    const a = kosten.get(key);
    const name = nameVon(key) ?? (a?.bezeichnung || key);
    if (!a || !istIso(a.ab)) return { key, name, monatCent: null, ab: null, monate: 0, gespartCent: null };
    const c = Math.max(0, ganz(a.betrag_cent));
    const monate = volleMonate(a.ab, heute);
    return { key, name, monatCent: c, ab: tag(a.ab), monate, gespartCent: c * monate };
  });
}

// --------------------------------------------------------------- 4. THG
export function thg(angaben: readonly Angabe[], heute: string) {
  let gesamt = 0, anzahl = 0;
  for (const a of angaben) {
    if (a?.art !== 'thg' || !istIso(a.ab) || tag(a.ab) > tag(heute)) continue;
    const c = Math.max(0, ganz(a.betrag_cent));
    if (c <= 0) continue;
    gesamt += c; anzahl++;
  }
  return { gesamtCent: gesamt, anzahl };
}

// ----------------------------------------------------------- 5. Importe
export interface ImportZeile { status: string | null; zeilen_ok: number | string | null }

export function importe(jobs: readonly ImportZeile[]) {
  let datensaetze = 0, dateien = 0;
  for (const j of jobs) {
    if (!j || (j.status !== 'fertig' && j.status !== 'teilweise')) continue;
    const n = Math.max(0, ganz(j.zeilen_ok));
    if (n <= 0) continue;
    datensaetze += n; dateien++;
  }
  return { datensaetze, dateien };
}

// ----------------------------------------------------- Angabe pruefen
export interface AngabeEingabe {
  art: unknown; bezeichnung: unknown; altsystem_key?: unknown; betrag: unknown; ab: unknown; notiz?: unknown;
}

export function angabePruefen(e: AngabeEingabe, heute: string):
  { ok: true; zeile: { art: ErsparnisArt; bezeichnung: string; altsystem_key: string | null; betrag_cent: number; je: ErsparnisJe; ab: string; notiz: string | null } }
  | { ok: false; fehler: string } {
  const art = String(e.art ?? '');
  if (!(ART as readonly string[]).includes(art)) return { ok: false, fehler: 'Unbekannte Art.' };
  const bez = String(e.bezeichnung ?? '').trim();
  if (bez.length < 2 || bez.length > 120) return { ok: false, fehler: art === 'thg' ? 'Bitte Fahrzeug bzw. Kennzeichen angeben.' : 'Bitte den Namen des Programms angeben.' };
  const w = leseZahlOder(e.betrag, NaN);
  if (!Number.isFinite(w) || w <= 0) return { ok: false, fehler: 'Bitte einen Betrag größer 0 eingeben.' };
  const c = inCent(w);
  if (c > BETRAG_MAX_CENT) return { ok: false, fehler: 'Betrag zu hoch — bitte prüfen.' };
  const ab = String(e.ab ?? '').slice(0, 10);
  if (!istIso(ab)) return { ok: false, fehler: art === 'thg' ? 'Bitte das Auszahlungsdatum angeben.' : 'Bitte angeben, ab wann Sie das Programm nicht mehr bezahlen.' };
  if (art === 'thg' && ab > tag(heute)) return { ok: false, fehler: 'Eine THG-Prämie zählt erst, wenn sie ausgezahlt ist.' };
  const key = e.altsystem_key ? String(e.altsystem_key).trim().slice(0, 60) : '';
  const notiz = String(e.notiz ?? '').trim().slice(0, 300);
  return {
    ok: true,
    zeile: {
      art: art as ErsparnisArt, bezeichnung: bez, altsystem_key: art === 'altprogramm' && key ? key : null,
      betrag_cent: c, je: art === 'thg' ? 'einmal' : 'monat', ab, notiz: notiz || null,
    },
  };
}

// --------------------------------------------------------- Zusammenfassung
export interface Gesamt {
  skonto: ReturnType<typeof skonto>;
  verzug: ReturnType<typeof verzug>;
  programme: Programm[];
  thg: ReturnType<typeof thg>;
  importe: ReturnType<typeof importe>;
}

/**
 * Gesamtsumme in Cent: NUR Geld, das nachweislich im Betrieb geblieben bzw.
 * angekommen ist — Skonto, eingetragene Programmkosten, ausgezahlte THG-Praemie.
 * Verzugszinsen sind nur geltend gemacht und zaehlen hier NICHT mit.
 */
export function gesamtCent(g: Gesamt): number {
  const prog = g.programme.reduce((s, p) => s + (p.gespartCent ?? 0), 0);
  return g.skonto.gesamtCent + prog + g.thg.gesamtCent;
}

export function hatWerte(g: Gesamt): boolean {
  return gesamtCent(g) > 0 || g.verzug.summeCent > 0 || g.programme.length > 0 || g.importe.datensaetze > 0;
}

export function euroText(cent: number): string {
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/**
 * Text zum Teilen — nur Summen, nie Namen von Kunden, Lieferanten oder
 * Mitarbeitern. Programme nur als Anzahl. Zeilen ohne Wert fallen weg.
 */
export function teilenText(g: Gesamt, firma: string): string {
  const z: string[] = [];
  const kopf = firma.trim() ? `${firma.trim()} arbeitet mit ARGONAUT OS.` : 'Wir arbeiten mit ARGONAUT OS.';
  z.push(kopf);
  const summe = gesamtCent(g);
  if (summe > 0) z.push(`Bisher nachweislich im Betrieb geblieben: ${euroText(summe)}.`);
  if (g.skonto.gesamtCent > 0) z.push(`• ${euroText(g.skonto.gesamtCent)} Skonto genutzt`);
  const prog = g.programme.filter((p) => (p.gespartCent ?? 0) > 0);
  if (prog.length) z.push(`• ${prog.length === 1 ? 'ein altes Programm' : `${prog.length} alte Programme`} ersetzt – ${euroText(prog.reduce((s, p) => s + (p.gespartCent ?? 0), 0))} Lizenzkosten gespart`);
  else if (g.programme.length) z.push(`• ${g.programme.length === 1 ? 'ein altes Programm' : `${g.programme.length} alte Programme`} ersetzt`);
  if (g.thg.gesamtCent > 0) z.push(`• ${euroText(g.thg.gesamtCent)} THG-Prämie erhalten`);
  if (g.importe.datensaetze > 0) z.push(`• ${g.importe.datensaetze.toLocaleString('de-DE')} Datensätze übernommen statt abgetippt`);
  if (g.verzug.summeCent > 0) z.push(`• ${euroText(g.verzug.summeCent)} Verzugszinsen und Pauschalen korrekt geltend gemacht`);
  return z.join('\n');
}
