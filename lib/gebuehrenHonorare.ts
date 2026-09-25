// ============================================================================
// ARGONAUT OS · lib/gebuehrenHonorare.ts — Paket PS5 · Gebühren & Honorare
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
//   A  Kanzlei: RVG-Wertgebühren (Anlage 2 zu § 13, Stand 01.06.2025) mit
//      Gebührensätzen aus dem VV, Anrechnung, Auslagenpauschale, USt —
//      und StBVV-Beratungstabelle (Tabelle A) mit Zehntel-Rahmen.
//   B  Tierarztpraxis: GOT-Rechner (einfacher bis dreifacher Satz, Notdienst
//      zweifach bis vierfach + Notdienstgebühr, Wegegeld, Abweichung nur mit
//      Vereinbarung in Textform vorher).
//   C  Bildung: Dozentenhonorar aus Unterrichtseinheiten, Monatsübersicht je
//      Dozent, Übersicht der Teilnahmebescheinigungen je Kurs.
//   D  Gastro: Trinkgeld-Verteilung (Pool) centgenau nach Stunden, Punkten
//      oder gleich.
//   E  Sport/Studio: frühestes Vertragsende nach Kündigung (§ 309 Nr. 9 BGB,
//      Verträge ab 01.03.2022), Vereinsaustritt nach Satzung, Check-in-Prüfung,
//      Auslastung je Stunde, lange nicht mehr da gewesen.
//
// Alles hier ist eine RECHENHILFE: Es entsteht KEINE Rechnung (Rechnungen und
// Angebote bleiben in den Kern-Modulen — GEMEINSAM-Regel). Tabellen mit
// Fundstelle; Richtwerte als solche beschriftet. Recherchiert 25.09.2026 —
// Anwalt-Checkliste R25.
//
// Geld intern in Cent (ganze Zahlen) — keine Rundungsdrift bei Summen.
// Datum IMMER als 'YYYY-MM-DD'-Text; Uhrzeit als 'HH:MM'.
// ============================================================================

import { leseZahl } from './zahlen';
import { feiertageImJahr } from './feiertage';

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------
function zwei(n: number): string { return String(n).padStart(2, '0'); }

export function cent(euro: number): number { return Math.round((euro + (euro >= 0 ? 1 : -1) * Number.EPSILON) * 100); }
export function euro(c: number): number { return c / 100; }
export function euroText(betrag: number | null | undefined): string {
  if (betrag == null || !Number.isFinite(betrag)) return '—';
  return betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}
export function istIsoDatum(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(x)) return false;
  const [j, m, t] = x.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}
export function datumDe(iso: string | null | undefined): string {
  if (!istIsoDatum(iso)) return '—';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}
export function plusTage(iso: string, tage: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + Math.round(tage)));
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`;
}
/** Monate addieren; gibt es den Tag im Zielmonat nicht, gilt der Monatsletzte (§ 188 Abs. 3 BGB). */
export function plusMonate(iso: string, monate: number): string {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  const ziel = new Date(Date.UTC(j, m - 1 + monate, 1));
  const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  return `${ziel.getUTCFullYear()}-${zwei(ziel.getUTCMonth() + 1)}-${zwei(Math.min(t, letzter))}`;
}
export function tageZwischen(von: string, bis: string): number {
  const [a, b, c] = von.slice(0, 10).split('-').map(Number);
  const [d, e, f] = bis.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(d, e - 1, f) - Date.UTC(a, b - 1, c)) / 86_400_000);
}
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}
/** Datum + Uhrzeit + Wochentag (0 = So) in Berlin für einen Zeitstempel. */
export function berlinTeile(zeit: string | Date): { datum: string; stunde: number; minute: number; wochentag: number } | null {
  const d = zeit instanceof Date ? zeit : new Date(zeit);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const t: Record<string, string> = {};
  for (const p of f.formatToParts(d)) t[p.type] = p.value;
  const wt = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(t.weekday);
  return { datum: `${t.year}-${t.month}-${t.day}`, stunde: Number(t.hour) % 24, minute: Number(t.minute), wochentag: wt };
}
function zahl(x: unknown): number | null {
  if (x === '' || x == null) return null;
  return leseZahl(x);
}
function wochentagVon(iso: string): number {
  const [j, m, t] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t)).getUTCDay();
}

// ===========================================================================
// A  KANZLEI — RVG und StBVV
// ===========================================================================

/**
 * RVG Anlage 2 zu § 13 Abs. 1, gültig für Aufträge ab 01.06.2025
 * (KostBRÄG 2025, BGBl. 2025 I Nr. 109). Aufbau wie § 13 Abs. 1:
 * bis 500 € → 51,50 €; danach je angefangenem Schritt + Betrag.
 * Kontrollwerte: 1.000 → 93,00 · 5.000 → 354,50 · 10.000 → 652,00 ·
 * 50.000 → 1.357,00 · 500.000 → 3.752,00 · 2.000.000 → 9.002,00.
 */
export const RVG_STAND = '01.06.2025';
export const RVG_AB = '2025-06-01';
const RVG_STUFEN: { bis: number; schritt: number; plus: number }[] = [
  { bis: 2_000, schritt: 500, plus: 4_150 },
  { bis: 10_000, schritt: 1_000, plus: 5_950 },
  { bis: 25_000, schritt: 3_000, plus: 5_500 },
  { bis: 50_000, schritt: 5_000, plus: 8_600 },
  { bis: 200_000, schritt: 15_000, plus: 9_950 },
  { bis: 500_000, schritt: 30_000, plus: 14_000 },
  { bis: Infinity, schritt: 50_000, plus: 17_500 },
];
const RVG_GRUND_CENT = 5_150;
/** Mindestbetrag einer Gebühr, § 13 Abs. 2 RVG. */
export const RVG_MINDEST_CENT = 1_500;

/** Stufen-Tabelle generisch: Grundbetrag bis `start`, dann je angefangenem Schritt + Betrag. */
function stufenGebuehr(wert: number, start: number, grund: number, stufen: { bis: number; schritt: number; plus: number }[]): number {
  let gebuehr = grund;
  let unten = start;
  for (const s of stufen) {
    if (wert <= unten) break;
    const oben = Math.min(wert, s.bis);
    gebuehr += Math.ceil((oben - unten) / s.schritt) * s.plus;
    unten = s.bis;
  }
  return gebuehr;
}

/** Volle (1,0-)Gebühr nach RVG in Cent; null bei fehlendem/negativem Wert. */
export function rvgGebuehrCent(gegenstandswert: unknown): number | null {
  const w = zahl(gegenstandswert);
  if (w == null || w < 0) return null;
  return stufenGebuehr(Math.max(w, 0), 500, RVG_GRUND_CENT, RVG_STUFEN);
}

export type RvgAngelegenheit = 'aussergerichtlich' | 'instanz1' | 'berufung';
export type RvgPosition = { nr: string; label: string; satz: number; angelegenheit: RvgAngelegenheit; rahmen?: [number, number]; hinweis?: string };
export const RVG_ANGELEGENHEITEN: Record<RvgAngelegenheit, string> = { aussergerichtlich: 'Außergerichtliche Vertretung', instanz1: 'Gerichtsverfahren 1. Instanz', berufung: 'Berufung' };
/** Häufige Gebührentatbestände aus dem Vergütungsverzeichnis (VV RVG). */
export const RVG_POSITIONEN: RvgPosition[] = [
  { nr: '2300', label: 'Geschäftsgebühr (außergerichtlich)', satz: 1.3, angelegenheit: 'aussergerichtlich', rahmen: [0.5, 2.5], hinweis: 'Mehr als 1,3 nur, wenn die Tätigkeit umfangreich oder schwierig war.' },
  { nr: '1000', label: 'Einigungsgebühr (außergerichtlich)', satz: 1.5, angelegenheit: 'aussergerichtlich' },
  { nr: '3100', label: 'Verfahrensgebühr (1. Instanz)', satz: 1.3, angelegenheit: 'instanz1' },
  { nr: '3104', label: 'Terminsgebühr (1. Instanz)', satz: 1.2, angelegenheit: 'instanz1' },
  { nr: '1003', label: 'Einigungsgebühr (Verfahren anhängig)', satz: 1.0, angelegenheit: 'instanz1' },
  { nr: '3200', label: 'Verfahrensgebühr (Berufung)', satz: 1.6, angelegenheit: 'berufung' },
  { nr: '3202', label: 'Terminsgebühr (Berufung)', satz: 1.2, angelegenheit: 'berufung' },
];
const ERHOEHBAR = new Set(['2300', '3100', '3200']);

export type RvgEingabe = {
  gegenstandswert: unknown;
  positionen: { nr: string; satz?: unknown; label?: string }[];
  /** Zahl der Auftraggeber (Nr. 1008: je weiterer +0,3, höchstens +2,0 — nur auf Verfahrens-/Geschäftsgebühr). */
  auftraggeber?: unknown;
  /** Geschäftsgebühr 2300 wird zur Hälfte, höchstens 0,75, auf die Verfahrensgebühr angerechnet (Vorbem. 3 Abs. 4 VV). */
  anrechnung?: boolean;
  auslagenpauschale?: boolean;
  ustSatz?: unknown;
  auftragAm?: string | null;
};
export type RvgZeile = { nr: string; label: string; satz: number; betragCent: number };
export type RvgErgebnis = {
  ok: boolean;
  fehler: string | null;
  vollGebuehrCent: number | null;
  zeilen: RvgZeile[];
  nettoCent: number;
  ustCent: number;
  bruttoCent: number;
  hinweise: string[];
};

function satzRunden(s: number): number { return Math.round(s * 100) / 100; }

export function rvgBerechnung(e: RvgEingabe): RvgErgebnis {
  const leer = (fehler: string, hinweise: string[] = []): RvgErgebnis => ({ ok: false, fehler, vollGebuehrCent: null, zeilen: [], nettoCent: 0, ustCent: 0, bruttoCent: 0, hinweise });
  if (e.auftragAm && istIsoDatum(e.auftragAm) && e.auftragAm < RVG_AB) {
    return leer('Auftrag vor dem 01.06.2025: Es gilt die alte Tabelle (§ 60 RVG). Sie ist hier nicht hinterlegt — bitte mit der Tabelle bis 31.05.2025 rechnen.');
  }
  const voll = rvgGebuehrCent(e.gegenstandswert);
  if (voll == null) return leer('Gegenstandswert fehlt oder ist nicht lesbar.');
  if (!e.positionen.length) return leer('Mindestens einen Gebührentatbestand wählen.');
  const hinweise: string[] = [];
  const ag = Math.max(1, Math.floor(zahl(e.auftraggeber) ?? 1));
  const erhoehung = Math.min(2.0, satzRunden((ag - 1) * 0.3));
  let erhoeht = false;
  const gruppen = new Map<string, RvgZeile[]>();

  for (const p of e.positionen) {
    const vorlage = RVG_POSITIONEN.find((x) => x.nr === p.nr);
    if (!vorlage) return leer(`Nr. ${p.nr} ist nicht hinterlegt.`);
    const s = p.satz === undefined || p.satz === '' ? vorlage.satz : zahl(p.satz);
    if (s == null || s <= 0) return leer(`Gebührensatz für Nr. ${p.nr} fehlt.`);
    if (vorlage.rahmen && (s < vorlage.rahmen[0] || s > vorlage.rahmen[1])) {
      return leer(`Nr. ${p.nr}: Satz ${String(s).replace('.', ',')} liegt außerhalb des Rahmens ${String(vorlage.rahmen[0]).replace('.', ',')} bis ${String(vorlage.rahmen[1]).replace('.', ',')}.`);
    }
    if (p.nr === '2300' && s > 1.3) hinweise.push('Geschäftsgebühr über 1,3: Umfang oder Schwierigkeit in der Akte begründen.');
    let satz = s;
    let zusatz = '';
    if (erhoehung > 0 && ERHOEHBAR.has(p.nr)) { satz = satzRunden(s + erhoehung); zusatz = ` (erhöht um ${String(erhoehung).replace('.', ',')} nach Nr. 1008, ${ag} Auftraggeber)`; erhoeht = true; }
    const betrag = Math.max(RVG_MINDEST_CENT, Math.round(voll * satz));
    const liste = gruppen.get(vorlage.angelegenheit) ?? [];
    liste.push({ nr: p.nr, label: (p.label || vorlage.label) + zusatz, satz, betragCent: betrag });
    gruppen.set(vorlage.angelegenheit, liste);
  }
  if (erhoehung > 0 && !erhoeht) hinweise.push('Mehrere Auftraggeber: Erhöhung nach Nr. 1008 greift nur bei Geschäfts- oder Verfahrensgebühr.');

  if (e.anrechnung) {
    const gesch = gruppen.get('aussergerichtlich')?.find((z) => z.nr === '2300');
    const verf = gruppen.get('instanz1')?.find((z) => z.nr === '3100');
    if (gesch && verf) {
      const anrSatz = Math.min(0.75, satzRunden(gesch.satz / 2));
      const abzug = Math.min(verf.betragCent, Math.round(voll * anrSatz));
      gruppen.get('instanz1')!.push({ nr: 'Vorbem. 3 Abs. 4', label: `Anrechnung der Geschäftsgebühr (${String(anrSatz).replace('.', ',')})`, satz: -anrSatz, betragCent: -abzug });
    } else {
      hinweise.push('Anrechnung gewählt, aber nicht beide Gebühren (2300 und 3100) vorhanden — keine Anrechnung.');
    }
  }
  // Je Angelegenheit eigene Auslagenpauschale (Nr. 7002: 20 %, höchstens 20 €).
  const zeilen: RvgZeile[] = [];
  for (const key of Object.keys(RVG_ANGELEGENHEITEN) as RvgAngelegenheit[]) {
    const g = gruppen.get(key);
    if (!g) continue;
    zeilen.push(...g);
    if (e.auslagenpauschale !== false) {
      const summe = g.reduce((s, z) => s + z.betragCent, 0);
      const pausch = Math.min(2_000, Math.round(summe * 0.2));
      if (pausch > 0) zeilen.push({ nr: '7002', label: `Pauschale Post/Telekommunikation — ${RVG_ANGELEGENHEITEN[key]}`, satz: 0, betragCent: pausch });
    }
  }
  const netto = zeilen.reduce((s, z) => s + z.betragCent, 0);
  const ust = zahl(e.ustSatz ?? 19) ?? 19;
  const ustCent = ust > 0 ? Math.round(netto * ust / 100) : 0;
  if (ust > 0) zeilen.push({ nr: '7008', label: `Umsatzsteuer ${String(ust).replace('.', ',')} %`, satz: 0, betragCent: ustCent });
  hinweise.push(`Tabelle Anlage 2 RVG, Stand ${RVG_STAND}. Rechenhilfe — keine Rechnung. Honorarvereinbarungen gehen vor.`);
  return { ok: true, fehler: null, vollGebuehrCent: voll, zeilen, nettoCent: netto, ustCent, bruttoCent: netto + ustCent, hinweise };
}

/**
 * StBVV Anlage 1 · Tabelle A (Beratungstabelle) — volle Gebühr (10/10) je
 * Gegenstandswert bis … €. Über 600.000 € je angefangene 50.000 €:
 * bis 5 Mio. + 149 €, bis 25 Mio. + 112 €, darüber + 88 €.
 * Werte aus zwei unabhängigen Tabellen-Quellen übereinstimmend (25.09.2026).
 */
export const STBVV_TABELLE_A: [number, number][] = [
  [300, 31], [600, 56], [900, 81], [1_200, 106], [1_500, 130], [2_000, 166], [2_500, 200], [3_000, 235],
  [3_500, 270], [4_000, 305], [4_500, 340], [5_000, 375], [6_000, 422], [7_000, 467], [8_000, 514],
  [9_000, 560], [10_000, 605], [13_000, 655], [16_000, 705], [19_000, 755], [22_000, 805], [25_000, 854],
  [30_000, 946], [35_000, 1_036], [40_000, 1_125], [45_000, 1_215], [50_000, 1_304], [65_000, 1_399],
  [80_000, 1_496], [95_000, 1_592], [110_000, 1_689], [125_000, 1_784], [140_000, 1_879], [155_000, 1_976],
  [170_000, 2_071], [185_000, 2_168], [200_000, 2_264], [230_000, 2_412], [260_000, 2_559], [290_000, 2_705],
  [320_000, 2_859], [350_000, 2_926], [380_000, 2_990], [410_000, 3_055], [440_000, 3_115], [470_000, 3_175],
  [500_000, 3_234], [550_000, 3_320], [600_000, 3_404],
];

/** Volle Gebühr (10/10) nach StBVV Tabelle A in Cent. */
export function stbvvGebuehrCent(gegenstandswert: unknown): number | null {
  const w = zahl(gegenstandswert);
  if (w == null || w < 0) return null;
  for (const [bis, g] of STBVV_TABELLE_A) if (w <= bis) return g * 100;
  return stufenGebuehr(w, 600_000, 340_400, [
    { bis: 5_000_000, schritt: 50_000, plus: 14_900 },
    { bis: 25_000_000, schritt: 50_000, plus: 11_200 },
    { bis: Infinity, schritt: 50_000, plus: 8_800 },
  ]);
}

export type StbvvVorlage = { key: string; label: string; von: number; bis: number; mindestwert?: number; wertHinweis: string };
/** Beispiel-Rahmen. Vor Nutzung gegen § 24 StBVV prüfen (R25). */
export const STBVV_VORLAGEN: StbvvVorlage[] = [
  { key: 'est', label: 'Einkommensteuererklärung (§ 24 Abs. 1 Nr. 1)', von: 1, bis: 6, mindestwert: 8_000, wertHinweis: 'Summe der positiven Einkünfte, mindestens 8.000 €' },
  { key: 'frei', label: 'Eigener Rahmen', von: 1, bis: 10, wertHinweis: 'Gegenstandswert nach der einschlägigen Vorschrift' },
];

export type StbvvEingabe = { gegenstandswert: unknown; zehntelVon: unknown; zehntelBis: unknown; zehntel?: unknown; mindestwert?: number; auslagenpauschale?: boolean; ustSatz?: unknown };
export type StbvvErgebnis = { ok: boolean; fehler: string | null; wert: number | null; vollCent: number | null; mittel: number | null; zehntel: number | null; gebuehrCent: number; pauschaleCent: number; ustCent: number; bruttoCent: number; hinweise: string[] };

export function stbvvBerechnung(e: StbvvEingabe): StbvvErgebnis {
  const leer = (fehler: string): StbvvErgebnis => ({ ok: false, fehler, wert: null, vollCent: null, mittel: null, zehntel: null, gebuehrCent: 0, pauschaleCent: 0, ustCent: 0, bruttoCent: 0, hinweise: [] });
  const roh = zahl(e.gegenstandswert);
  if (roh == null || roh < 0) return leer('Gegenstandswert fehlt oder ist nicht lesbar.');
  const von = zahl(e.zehntelVon); const bis = zahl(e.zehntelBis);
  if (von == null || bis == null || von <= 0 || bis < von || bis > 30) return leer('Zehntel-Rahmen ungültig.');
  const hinweise: string[] = [];
  let wert = roh;
  if (e.mindestwert && roh < e.mindestwert) { wert = e.mindestwert; hinweise.push(`Mindest-Gegenstandswert ${euroText(e.mindestwert)} angesetzt.`); }
  const voll = stbvvGebuehrCent(wert) as number;
  const mittel = (von + bis) / 2;
  const gew = e.zehntel === undefined || e.zehntel === '' ? mittel : zahl(e.zehntel);
  if (gew == null || gew < von || gew > bis) return leer(`Gewählte Zehntel müssen zwischen ${String(von).replace('.', ',')} und ${String(bis).replace('.', ',')} liegen.`);
  if (gew > mittel) hinweise.push('Über der Mittelgebühr: Umfang, Schwierigkeit oder Bedeutung festhalten (§ 11 StBVV).');
  const gebuehr = Math.round(voll * gew / 10);
  const pausch = e.auslagenpauschale === false ? 0 : Math.min(2_000, Math.round(gebuehr * 0.2));
  const ust = zahl(e.ustSatz ?? 19) ?? 19;
  const ustCent = Math.round((gebuehr + pausch) * ust / 100);
  hinweise.push('StBVV Tabelle A. Rechenhilfe — keine Rechnung. Pauschale nach § 16 StBVV (20 %, höchstens 20 €).');
  return { ok: true, fehler: null, wert, vollCent: voll, mittel, zehntel: gew, gebuehrCent: gebuehr, pauschaleCent: pausch, ustCent, bruttoCent: gebuehr + pausch + ustCent, hinweise };
}

/** Kostenaufstellung als Text (zum Kopieren in Schreiben/Akte). */
export function kostenText(titel: string, zeilen: { label: string; betragCent: number }[], summeCent: number, hinweise: string[] = []): string {
  const l = [titel, ''];
  for (const z of zeilen) l.push(`${z.label.padEnd(60, ' ')} ${euroText(euro(z.betragCent)).padStart(14, ' ')}`);
  l.push(''.padEnd(75, '-'));
  l.push(`${'Summe'.padEnd(60, ' ')} ${euroText(euro(summeCent)).padStart(14, ' ')}`);
  if (hinweise.length) { l.push(''); for (const h of hinweise) l.push(h); }
  return l.join('\n');
}

// ===========================================================================
// B  TIERARZTPRAXIS — GOT (Fassung ab 22.11.2022)
// ===========================================================================
export const GOT_STAND = '22.11.2022';
export const GOT_NOTDIENST_GEBUEHR_CENT = 5_000;   // § 4 GOT
export const GOT_WEGEGELD_JE_DOPPELKM_CENT = 350;  // § 10 GOT
export const GOT_WEGEGELD_MINDEST_CENT = 1_300;    // § 10 GOT
export const GOT_HINWEIS = 'GOT ab 22.11.2022: einfacher bis dreifacher Satz (§ 2), im Notdienst zweifach bis vierfach plus 50 € Notdienstgebühr (§ 4), Abweichungen nur im begründeten Einzelfall vorher in Textform vereinbart (§ 5), Wegegeld 3,50 € je Doppelkilometer, mindestens 13 € (§ 10). Die GOT wird derzeit evaluiert — Änderungen frühestens 2027.';

/** Liegt der Zeitpunkt im tierärztlichen Notdienst? Nacht 18–8 Uhr, Wochenende, Feiertag (§ 4 GOT). */
export function istNotdienstZeit(datum: string, uhrzeit: string | null | undefined, bundesland?: string | null): { notdienst: boolean; grund: string | null } {
  if (!istIsoDatum(datum)) return { notdienst: false, grund: null };
  const wt = wochentagVon(datum);
  const ft = feiertageImJahr(Number(datum.slice(0, 4)), bundesland ?? null).find((f) => f.datum === datum.slice(0, 10));
  if (ft) return { notdienst: true, grund: `Feiertag (${ft.name})` };
  if (wt === 0 || wt === 6) return { notdienst: true, grund: 'Wochenende' };
  const m = /^(\d{1,2}):(\d{2})/.exec(uhrzeit ?? '');
  if (m) {
    const min = Number(m[1]) * 60 + Number(m[2]);
    if (min < 8 * 60 || min >= 18 * 60) {
      // Freitag ab 18 Uhr und Montag vor 8 Uhr gehören zum Wochenende.
      if (wt === 5 && min >= 18 * 60) return { notdienst: true, grund: 'Wochenende (Freitag ab 18 Uhr)' };
      if (wt === 1 && min < 8 * 60) return { notdienst: true, grund: 'Wochenende (Montag vor 8 Uhr)' };
      return { notdienst: true, grund: 'Nacht (18–8 Uhr)' };
    }
  }
  return { notdienst: false, grund: null };
}

export type GotPosEingabe = { nr?: string; bezeichnung: string; einfachSatz: unknown; faktor: unknown; anzahl?: unknown };
export type GotZeile = { nr: string; bezeichnung: string; einfachCent: number; faktor: number; anzahl: number; betragCent: number };
export type GotEingabe = { positionen: GotPosEingabe[]; notdienst: boolean; vereinbartTextform?: boolean; doppelKm?: unknown; ustSatz?: unknown };
export type GotErgebnis = { ok: boolean; fehler: string | null; zeilen: GotZeile[]; nettoCent: number; ustCent: number; bruttoCent: number; warnungen: string[] };

export function gotRahmen(notdienst: boolean): [number, number] { return notdienst ? [2, 4] : [1, 3]; }

export function gotBerechnung(e: GotEingabe): GotErgebnis {
  const leer = (fehler: string): GotErgebnis => ({ ok: false, fehler, zeilen: [], nettoCent: 0, ustCent: 0, bruttoCent: 0, warnungen: [] });
  if (!e.positionen.length) return leer('Mindestens eine Leistung eintragen.');
  const [min, max] = gotRahmen(e.notdienst);
  const zeilen: GotZeile[] = [];
  const warnungen: string[] = [];
  for (const p of e.positionen) {
    const einf = zahl(p.einfachSatz);
    const f = zahl(p.faktor);
    const n = p.anzahl === undefined || p.anzahl === '' ? 1 : zahl(p.anzahl);
    if (!p.bezeichnung?.trim()) return leer('Jede Leistung braucht eine Bezeichnung.');
    if (einf == null || einf <= 0) return leer(`${p.bezeichnung}: einfacher Satz fehlt.`);
    if (f == null || f <= 0) return leer(`${p.bezeichnung}: Faktor fehlt.`);
    if (n == null || n <= 0 || !Number.isInteger(n)) return leer(`${p.bezeichnung}: Anzahl muss eine ganze Zahl sein.`);
    if ((f < min || f > max) && !e.vereinbartTextform) {
      return leer(`${p.bezeichnung}: Faktor ${String(f).replace('.', ',')} liegt außerhalb ${min}- bis ${max}-fach. Nur mit vorheriger Vereinbarung in Textform (§ 5 GOT).`);
    }
    if (f < min || f > max) warnungen.push(`${p.bezeichnung}: Faktor ${String(f).replace('.', ',')} außerhalb des Rahmens — Vereinbarung in Textform zur Akte.`);
    zeilen.push({ nr: p.nr?.trim() || '', bezeichnung: p.bezeichnung.trim(), einfachCent: cent(einf), faktor: f, anzahl: n, betragCent: Math.round(cent(einf) * f) * n });
  }
  if (e.notdienst) zeilen.push({ nr: '§ 4', bezeichnung: 'Notdienstgebühr', einfachCent: GOT_NOTDIENST_GEBUEHR_CENT, faktor: 1, anzahl: 1, betragCent: GOT_NOTDIENST_GEBUEHR_CENT });
  const km = zahl(e.doppelKm);
  if (km != null && km > 0) {
    const weg = Math.max(GOT_WEGEGELD_MINDEST_CENT, Math.round(km * GOT_WEGEGELD_JE_DOPPELKM_CENT));
    zeilen.push({ nr: '§ 10', bezeichnung: `Wegegeld (${String(km).replace('.', ',')} Doppel-km)`, einfachCent: GOT_WEGEGELD_JE_DOPPELKM_CENT, faktor: 1, anzahl: 1, betragCent: weg });
  }
  const netto = zeilen.reduce((s, z) => s + z.betragCent, 0);
  const ust = zahl(e.ustSatz ?? 19) ?? 19;
  const ustCent = Math.round(netto * ust / 100);
  return { ok: true, fehler: null, zeilen, nettoCent: netto, ustCent, bruttoCent: netto + ustCent, warnungen };
}

// ===========================================================================
// C  BILDUNG — Dozentenhonorar und Teilnahmebescheinigungen
// ===========================================================================
export const UE_MINUTEN = 45;
export const DOZENT_HINWEIS = 'Honorar-Lehrkräfte: Nach dem Herrenberg-Urteil (BSG 2022) droht Scheinselbstständigkeit. Die Übergangsregel § 127 SGB IV gilt bis 31.12.2027 — Voraussetzungen mit Steuerberater prüfen. Umsatzsteuer: Unterricht kann nach § 4 Nr. 21 UStG befreit sein.';

/** Unterrichtseinheiten aus 'HH:MM'-Zeiten (45 Minuten = 1 UE), auf Viertel-UE gerundet. */
export function unterrichtsEinheiten(von: string | null | undefined, bis: string | null | undefined, pauseMin = 0, ueMinuten = UE_MINUTEN): number | null {
  const a = /^(\d{1,2}):(\d{2})/.exec(von ?? ''); const b = /^(\d{1,2}):(\d{2})/.exec(bis ?? '');
  if (!a || !b) return null;
  const min = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2])) - Math.max(0, pauseMin);
  if (min <= 0) return null;
  return Math.round((min / ueMinuten) * 4) / 4;
}

export type HonorarEingabe = { ue: unknown; satzJeUe: unknown; fahrtKm?: unknown; kmSatz?: unknown; auslagen?: unknown; ustSatz?: unknown };
export type HonorarErgebnis = { ok: boolean; fehler: string | null; honorarCent: number; fahrtCent: number; auslagenCent: number; nettoCent: number; ustCent: number; bruttoCent: number };

export function dozentenHonorar(e: HonorarEingabe): HonorarErgebnis {
  const leer = (fehler: string): HonorarErgebnis => ({ ok: false, fehler, honorarCent: 0, fahrtCent: 0, auslagenCent: 0, nettoCent: 0, ustCent: 0, bruttoCent: 0 });
  const ue = zahl(e.ue); const satz = zahl(e.satzJeUe);
  if (ue == null || ue <= 0) return leer('Unterrichtseinheiten fehlen.');
  if (satz == null || satz < 0) return leer('Satz je Unterrichtseinheit fehlt.');
  const km = zahl(e.fahrtKm) ?? 0; const kmSatz = zahl(e.kmSatz) ?? 0.30;
  const aus = zahl(e.auslagen) ?? 0;
  if (km < 0 || aus < 0 || kmSatz < 0) return leer('Fahrt und Auslagen dürfen nicht negativ sein.');
  const honorar = Math.round(ue * cent(satz));
  const fahrt = Math.round(km * cent(kmSatz));
  const auslagen = cent(aus);
  const netto = honorar + fahrt + auslagen;
  const ust = zahl(e.ustSatz ?? 0) ?? 0;
  const ustCent = Math.round(netto * ust / 100);
  return { ok: true, fehler: null, honorarCent: honorar, fahrtCent: fahrt, auslagenCent: auslagen, nettoCent: netto, ustCent, bruttoCent: netto + ustCent };
}

export type HonorarEintrag = { dozent: string; datum: string; ue: number; satz: number; fahrt_km?: number | null; km_satz?: number | null; auslagen?: number | null; ust_satz?: number | null; status: string };
export type DozentMonat = { dozent: string; monat: string; ue: number; offenCent: number; abgerechnetCent: number; bezahltCent: number; gesamtCent: number; eintraege: number };

/** Übersicht je Dozent und Monat (YYYY-MM), sortiert nach Monat absteigend, dann Name. */
export function honorarUebersicht(eintraege: HonorarEintrag[]): DozentMonat[] {
  const map = new Map<string, DozentMonat>();
  for (const e of eintraege) {
    if (!istIsoDatum(e.datum) || !e.dozent?.trim()) continue;
    const r = dozentenHonorar({ ue: e.ue, satzJeUe: e.satz, fahrtKm: e.fahrt_km ?? 0, kmSatz: e.km_satz ?? 0.30, auslagen: e.auslagen ?? 0, ustSatz: e.ust_satz ?? 0 });
    if (!r.ok) continue;
    const key = `${e.dozent.trim()}|${e.datum.slice(0, 7)}`;
    const m = map.get(key) ?? { dozent: e.dozent.trim(), monat: e.datum.slice(0, 7), ue: 0, offenCent: 0, abgerechnetCent: 0, bezahltCent: 0, gesamtCent: 0, eintraege: 0 };
    m.ue += Number(e.ue) || 0; m.eintraege += 1; m.gesamtCent += r.bruttoCent;
    if (e.status === 'bezahlt') m.bezahltCent += r.bruttoCent;
    else if (e.status === 'abgerechnet') m.abgerechnetCent += r.bruttoCent;
    else m.offenCent += r.bruttoCent;
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => (a.monat === b.monat ? a.dozent.localeCompare(b.dozent, 'de') : a.monat < b.monat ? 1 : -1));
}

export type BescheinigungZeile = { anmeldungId: string; name: string; anwesend: number; termine: number; quote: number | null; berechtigt: boolean; ausgestellt: string | null; grund: string };

/** Wer bekommt eine Teilnahmebescheinigung? Schwelle Standard 80 % der Termine (wie lib/kurse). */
export function bescheinigungsListe(
  anmeldungen: { id: string; name: string; status: string; zertifikat_am?: string | null }[],
  terminIds: string[],
  anwesenheit: { termin_id: string; anmeldung_id: string; anwesend: boolean }[],
  schwelle = 0.8,
): BescheinigungZeile[] {
  const termine = new Set(terminIds);
  return anmeldungen
    .filter((a) => a.status !== 'storniert' && a.status !== 'warteliste')
    .map((a) => {
      const anw = anwesenheit.filter((w) => w.anmeldung_id === a.id && w.anwesend && termine.has(w.termin_id)).length;
      const quote = termine.size ? anw / termine.size : null;
      let berechtigt: boolean; let grund: string;
      if (quote == null) { berechtigt = a.status === 'teilgenommen'; grund = berechtigt ? 'als teilgenommen markiert (keine Termine erfasst)' : 'keine Termine erfasst'; }
      else if (quote + 1e-9 >= schwelle) { berechtigt = true; grund = `${anw} von ${termine.size} Terminen`; }
      else { berechtigt = false; grund = `nur ${anw} von ${termine.size} Terminen (mind. ${Math.ceil(schwelle * termine.size)})`; }
      return { anmeldungId: a.id, name: a.name, anwesend: anw, termine: termine.size, quote, berechtigt, ausgestellt: a.zertifikat_am ?? null, grund };
    })
    .sort((x, y) => Number(y.berechtigt) - Number(x.berechtigt) || x.name.localeCompare(y.name, 'de'));
}

// ===========================================================================
// D  GASTRO — Trinkgeld-Verteilung
// ===========================================================================
export const TRINKGELD_HINWEIS = 'Trinkgeld, das Gäste freiwillig für das Personal geben, ist für Arbeitnehmer steuer- und beitragsfrei (§ 3 Nr. 51 EStG) — auch per Karte, wenn es vollständig weitergegeben wird. Trinkgeld an Inhaber ist Betriebseinnahme. Der Verteilschlüssel sollte schriftlich feststehen.';
export type TrinkgeldMethode = 'stunden' | 'punkte' | 'gleich';
export type TrinkgeldPerson = { name: string; stunden?: unknown; punkte?: unknown; inhaber?: boolean };
export type TrinkgeldAnteil = { name: string; basis: number; anteilCent: number };
export type TrinkgeldErgebnis = { ok: boolean; fehler: string | null; topfCent: number; anteile: TrinkgeldAnteil[]; warnungen: string[] };

/** Verteilt einen Topf centgenau (größte Reste zuerst), Summe = Topf. */
export function trinkgeldVerteilen(topf: { bar?: unknown; karte?: unknown }, personen: TrinkgeldPerson[], methode: TrinkgeldMethode): TrinkgeldErgebnis {
  const leer = (fehler: string): TrinkgeldErgebnis => ({ ok: false, fehler, topfCent: 0, anteile: [], warnungen: [] });
  const bar = zahl(topf.bar) ?? 0; const karte = zahl(topf.karte) ?? 0;
  if (bar < 0 || karte < 0) return leer('Beträge dürfen nicht negativ sein.');
  const topfCent = cent(bar) + cent(karte);
  if (topfCent <= 0) return leer('Kein Trinkgeld im Topf.');
  const warnungen: string[] = [];
  const liste = personen.filter((p) => p.name?.trim());
  if (liste.some((p) => p.inhaber)) warnungen.push('Inhaber im Verteilschlüssel: dessen Anteil ist keine steuerfreie Zuwendung, sondern Betriebseinnahme.');
  const basen = liste.map((p) => {
    if (methode === 'gleich') return 1;
    const v = zahl(methode === 'stunden' ? p.stunden : p.punkte);
    return v != null && v > 0 ? v : 0;
  });
  const summe = basen.reduce((s, b) => s + b, 0);
  if (!liste.length || summe <= 0) return leer(methode === 'stunden' ? 'Keine Stunden eingetragen.' : methode === 'punkte' ? 'Keine Punkte eingetragen.' : 'Niemand eingetragen.');
  const roh = basen.map((b) => (topfCent * b) / summe);
  const anteile = roh.map((r) => Math.floor(r + 1e-9));
  let rest = topfCent - anteile.reduce((s, a) => s + a, 0);
  const reihenfolge = roh.map((r, i) => ({ i, rest: r - Math.floor(r + 1e-9) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; rest > 0 && k < reihenfolge.length; k++, rest--) anteile[reihenfolge[k].i] += 1;
  liste.forEach((p, i) => { if (basen[i] === 0) warnungen.push(`${p.name.trim()}: ohne ${methode === 'stunden' ? 'Stunden' : 'Punkte'} — erhält nichts.`); });
  return { ok: true, fehler: null, topfCent, anteile: liste.map((p, i) => ({ name: p.name.trim(), basis: basen[i], anteilCent: anteile[i] })), warnungen };
}

/** Jahres-/Monatssumme je Person aus gespeicherten Verteilungen. */
export function trinkgeldSummen(verteilungen: { datum: string; anteile: { name: string; anteilCent: number }[] }[], zeitraum: string): { name: string; summeCent: number; tage: number }[] {
  const m = new Map<string, { name: string; summeCent: number; tage: number }>();
  for (const v of verteilungen) {
    if (!istIsoDatum(v.datum) || !v.datum.startsWith(zeitraum)) continue;
    for (const a of v.anteile ?? []) {
      const x = m.get(a.name) ?? { name: a.name, summeCent: 0, tage: 0 };
      x.summeCent += Number(a.anteilCent) || 0; x.tage += 1; m.set(a.name, x);
    }
  }
  return [...m.values()].sort((a, b) => b.summeCent - a.summeCent || a.name.localeCompare(b.name, 'de'));
}

// ===========================================================================
// E  SPORT / STUDIO — Kündigungsfristen und Check-in
// ===========================================================================
export const FAIR_AB = '2022-03-01';
export const KUENDIGUNG_HINWEIS = 'Verbraucherverträge ab 01.03.2022 (§ 309 Nr. 9 BGB): Erstlaufzeit höchstens 2 Jahre, Kündigungsfrist höchstens 1 Monat vor Ablauf, stillschweigende Verlängerung nur auf unbestimmte Zeit mit höchstens 1 Monat Frist. Vorher geschlossene Verträge: Verlängerung höchstens 1 Jahr, Frist höchstens 3 Monate. Kündigung aus wichtigem Grund (§ 314 BGB) bleibt immer möglich. Vereine: Austritt nach Satzung, Frist höchstens 2 Jahre (§ 39 BGB).';

export type VertragsDaten = {
  art: 'studio' | 'verein';
  beginn: string | null;
  abgeschlossen?: string | null;          // Vertragsschluss; fehlt → beginn
  erstlaufzeitMonate?: unknown;            // Studio
  kuendigungsfristMonate?: unknown;        // laut Vertrag
  verlaengerungMonate?: unknown;           // nur Altverträge; 0/leer = unbestimmt
  satzungFristMonate?: unknown;            // Verein
  satzungZum?: 'monatsende' | 'quartalsende' | 'jahresende' | 'jederzeit';
};
export type KuendigungErgebnis = { ok: boolean; fehler: string | null; endeAm: string | null; begruendung: string; warnungen: string[] };

function monatsEnde(iso: string): string { const [j, m] = iso.split('-').map(Number); const d = new Date(Date.UTC(j, m, 0)); return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`; }
function periodenEnde(iso: string, zum: VertragsDaten['satzungZum']): string {
  if (zum === 'jederzeit') return iso;
  const [j, m] = iso.split('-').map(Number);
  if (zum === 'jahresende') return `${j}-12-31`;
  if (zum === 'quartalsende') { const q = Math.ceil(m / 3) * 3; return monatsEnde(`${j}-${zwei(q)}-01`); }
  return monatsEnde(iso);
}

/** Frühestes Vertragsende, wenn die Kündigung am `eingang` zugeht. */
export function fruehestesEnde(v: VertragsDaten, eingang: string): KuendigungErgebnis {
  const leer = (fehler: string): KuendigungErgebnis => ({ ok: false, fehler, endeAm: null, begruendung: '', warnungen: [] });
  if (!istIsoDatum(eingang)) return leer('Eingangsdatum der Kündigung fehlt.');
  const warnungen: string[] = [];
  if (v.art === 'verein') {
    const f = zahl(v.satzungFristMonate) ?? 0;
    if (f < 0) return leer('Satzungsfrist ungültig.');
    if (f > 24) warnungen.push('Satzungsfrist über 2 Jahre ist unzulässig (§ 39 Abs. 2 BGB) — höchstens 2 Jahre angesetzt.');
    const ende = periodenEnde(plusMonate(eingang, Math.min(f, 24)), v.satzungZum ?? 'jahresende');
    return { ok: true, fehler: null, endeAm: ende, begruendung: `Austritt nach Satzung: ${Math.min(f, 24)} Monat(e) Frist zum ${v.satzungZum === 'monatsende' ? 'Monatsende' : v.satzungZum === 'quartalsende' ? 'Quartalsende' : v.satzungZum === 'jederzeit' ? 'Eingangstag' : 'Jahresende'}.`, warnungen };
  }
  if (!istIsoDatum(v.beginn)) return leer('Vertragsbeginn fehlt.');
  const schluss = istIsoDatum(v.abgeschlossen) ? v.abgeschlossen : v.beginn;
  const neu = schluss >= FAIR_AB;
  let erst = zahl(v.erstlaufzeitMonate) ?? 0;
  if (erst < 0) return leer('Erstlaufzeit ungültig.');
  if (erst > 24) { warnungen.push('Erstlaufzeit über 24 Monate ist in AGB unwirksam (§ 309 Nr. 9 a BGB) — 24 Monate angesetzt.'); erst = 24; }
  const maxFrist = neu ? 1 : 3;
  let frist = zahl(v.kuendigungsfristMonate) ?? maxFrist;
  if (frist > maxFrist) { warnungen.push(`Kündigungsfrist ${String(frist).replace('.', ',')} Monate ist zu lang — höchstens ${maxFrist} Monat(e) angesetzt.`); frist = maxFrist; }
  if (frist < 0) frist = 0;
  const erstEnde = erst > 0 ? plusTage(plusMonate(v.beginn, erst), -1) : null;
  if (erstEnde && eingang <= plusTage(plusMonate(plusTage(erstEnde, 1), -frist), -1)) {
    return { ok: true, fehler: null, endeAm: erstEnde, begruendung: `Kündigung rechtzeitig vor Ende der Erstlaufzeit (${erst} Monate, Frist ${frist} Monat(e)).`, warnungen };
  }
  if (neu) {
    const ende = frist > 0 ? plusMonate(eingang, frist) : eingang;
    const nachErst = erstEnde && ende <= erstEnde ? erstEnde : ende;
    return { ok: true, fehler: null, endeAm: nachErst, begruendung: erstEnde && eingang <= erstEnde ? `Frist zum Ende der Erstlaufzeit verpasst — der Vertrag läuft unbefristet weiter und endet ${frist} Monat(e) nach Zugang (§ 309 Nr. 9 b BGB).` : `Unbefristete Verlängerung: Ende ${frist} Monat(e) nach Zugang (§ 309 Nr. 9 b BGB).`, warnungen };
  }
  // Altvertrag: Verlängerung um feste Perioden (höchstens 12 Monate).
  let verl = zahl(v.verlaengerungMonate) ?? 0;
  if (verl > 12) { warnungen.push('Verlängerung über 12 Monate ist unzulässig (Altvertrag) — 12 Monate angesetzt.'); verl = 12; }
  if (verl <= 0 || !erstEnde) {
    const ende = plusMonate(eingang, frist);
    return { ok: true, fehler: null, endeAm: ende, begruendung: `Altvertrag ohne feste Verlängerung: Ende ${frist} Monat(e) nach Zugang.`, warnungen };
  }
  let periodeEnde = erstEnde;
  for (let i = 0; i < 1200; i++) {
    const naechstes = plusTage(plusMonate(plusTage(periodeEnde, 1), verl), -1);
    const spaetestens = plusTage(plusMonate(plusTage(naechstes, 1), -frist), -1);
    if (eingang <= spaetestens) return { ok: true, fehler: null, endeAm: naechstes, begruendung: `Altvertrag (vor 01.03.2022): verlängert sich um je ${verl} Monate, Frist ${frist} Monat(e).`, warnungen };
    periodeEnde = naechstes;
  }
  return leer('Vertragsende nicht bestimmbar.');
}

export function kuendigungsBestaetigung(o: { betrieb: string; name: string; eingang: string; endeAm: string; mitgliedsNr?: string | null }): string {
  return [
    `Kündigungsbestätigung`,
    '',
    `Guten Tag ${o.name},`,
    '',
    `wir bestätigen den Eingang Ihrer Kündigung am ${datumDe(o.eingang)}${o.mitgliedsNr ? ` (Mitgliedsnummer ${o.mitgliedsNr})` : ''}.`,
    `Ihre Mitgliedschaft endet zum ${datumDe(o.endeAm)}. Bis dahin können Sie alle Leistungen wie gewohnt nutzen.`,
    '',
    'Mit freundlichen Grüßen',
    o.betrieb || '',
  ].join('\n');
}

export type CheckinMitglied = { id: string; name: string; status: string; kuendigung_zum?: string | null; beginn_am?: string | null };
export type CheckinPruefung = { stufe: 'ok' | 'gelb' | 'rot'; text: string };

/** Darf das Mitglied heute trainieren? */
export function checkinPruefung(m: CheckinMitglied, heute: string): CheckinPruefung {
  if (istIsoDatum(m.beginn_am) && m.beginn_am > heute) return { stufe: 'gelb', text: `Mitgliedschaft beginnt erst am ${datumDe(m.beginn_am)}.` };
  if (istIsoDatum(m.kuendigung_zum) && m.kuendigung_zum < heute) return { stufe: 'rot', text: `Mitgliedschaft ist am ${datumDe(m.kuendigung_zum)} ausgelaufen.` };
  if (m.status === 'pausiert') return { stufe: 'gelb', text: 'Mitgliedschaft ist pausiert.' };
  if (m.status === 'gekuendigt' && !istIsoDatum(m.kuendigung_zum)) return { stufe: 'gelb', text: 'Gekündigt, Enddatum fehlt.' };
  if (istIsoDatum(m.kuendigung_zum)) return { stufe: 'ok', text: `Gekündigt zum ${datumDe(m.kuendigung_zum)} — bis dahin aktiv.` };
  return { stufe: 'ok', text: 'Aktiv.' };
}

/** Durchschnittliche Check-ins je Wochentag und Stunde in einem Zeitraum (Berliner Zeit). */
export function auslastung(checkins: { zeit: string }[], von: string, bis: string): { jeStunde: number[]; jeWochentag: number[]; gesamt: number; tage: number } {
  const jeStunde = new Array(24).fill(0);
  const jeWochentag = new Array(7).fill(0);
  let gesamt = 0;
  for (const c of checkins) {
    const t = berlinTeile(c.zeit);
    if (!t || t.datum < von || t.datum > bis) continue;
    jeStunde[t.stunde] += 1; jeWochentag[t.wochentag] += 1; gesamt += 1;
  }
  const tage = Math.max(1, tageZwischen(von, bis) + 1);
  return { jeStunde: jeStunde.map((n) => Math.round((n / tage) * 10) / 10), jeWochentag, gesamt, tage };
}

/** Aktive Mitglieder, die seit `tage` Tagen nicht mehr da waren (Kündigungsgefahr). */
export function langeNichtDa(mitglieder: CheckinMitglied[], checkins: { mitglied_id: string; zeit: string }[], heute: string, tage = 30): { id: string; name: string; letzter: string | null; tageWeg: number | null }[] {
  const letzte = new Map<string, string>();
  for (const c of checkins) {
    const t = berlinTeile(c.zeit);
    if (!t) continue;
    const alt = letzte.get(c.mitglied_id);
    if (!alt || t.datum > alt) letzte.set(c.mitglied_id, t.datum);
  }
  return mitglieder
    .filter((m) => m.status === 'aktiv' && !istIsoDatum(m.kuendigung_zum))
    .map((m) => { const l = letzte.get(m.id) ?? null; return { id: m.id, name: m.name, letzter: l, tageWeg: l ? tageZwischen(l, heute) : null }; })
    .filter((x) => x.tageWeg == null || x.tageWeg >= tage)
    .sort((a, b) => (b.tageWeg ?? 1e9) - (a.tageWeg ?? 1e9) || a.name.localeCompare(b.name, 'de'));
}

/** Schon heute eingecheckt? (verhindert Doppel-Check-in) */
export function heuteSchonDa(mitgliedId: string, checkins: { mitglied_id: string; zeit: string }[], heute: string): boolean {
  return checkins.some((c) => c.mitglied_id === mitgliedId && berlinTeile(c.zeit)?.datum === heute);
}
