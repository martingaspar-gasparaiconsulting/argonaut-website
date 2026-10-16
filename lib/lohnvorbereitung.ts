// ============================================================================
// ARGONAUT OS · lib/lohnvorbereitung.ts — LK5 Teil 1 (16.10.2026)
//
// Monatsübersicht je Mitarbeiter fürs Steuerbüro / Lohnprogramm:
// Ist-Stunden, Soll, Mehrarbeit, Zeiten mit Zuschlags-Bezug (Nacht,
// Sonntag, Feiertag), Urlaubs- und Krankheitstage, Spesen.
//
// ARGONAUT RECHNET KEINEN LOHN. Es sortiert die gestempelten Zeiten in
// die Zeitfenster, für die üblicherweise Zuschläge gezahlt werden
// (Anlehnung an § 3b EStG). Ob und mit welchem Satz ein Zuschlag gezahlt
// wird, regeln Arbeitsvertrag/Tarif — das entscheidet das Lohnprogramm.
//
// Zeitfenster (deutsche Zeit, Europe/Berlin):
//   nacht        20–6 Uhr
//   nachtTief    0–4 Uhr, wenn die Schicht vor 0 Uhr begann (Teilmenge von nacht)
//   sonntag      Sonntag 0–24 Uhr (nicht, wenn zugleich Feiertag)
//   feiertag     gesetzlicher Feiertag des Bundeslands und 31.12. ab 14 Uhr
//   feiertagHoch 24.12. ab 14 Uhr, 25./26.12., 01.05.
// Nacht kommt zusätzlich zu Sonntag/Feiertag; Sonntag und Feiertag nie doppelt.
// Pausen werden anteilig über die Schicht abgezogen (Stempeluhr kennt die
// Lage der Pause nicht) — steht so im Export.
//
// Rein, getestet in tests/lohnvorbereitungLK5.test.mjs.
// ============================================================================

import { leseZahl, rundeStellen, centRunden } from './zahlen';
import { ausfallImMonat, type Ausfall } from './ausfallstunden';

export type Sitzung = { mitarbeiter_id: string; datum: string; kommen_um: string; gehen_um: string | null; pause_minuten?: number | null };
export type Abwesenheit = { mitarbeiter_id: string; typ: string; von: string; bis: string; status?: string | null };
export type Mitarbeiter = { id: string; vorname?: string | null; nachname?: string | null; wochenstunden?: number | string | null; arbeitszeit_modell?: string | null; personalnummer?: string | null };
export type Spesen = { reisender?: string | null; abreise?: string | null; gesamt?: number | string | null; verpflegung_netto?: number | string | null };

export type Fenster = { gesamt: number; nacht: number; nachtTief: number; sonntag: number; feiertag: number; feiertagHoch: number };

const TZ = 'Europe/Berlin';
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });

function teile(ms: number): { datum: string; stunde: number; minute: number; sonntag: boolean } {
  const p = FMT.formatToParts(new Date(ms));
  const w = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { datum: `${w('year')}-${w('month')}-${w('day')}`, stunde: Number(w('hour')), minute: Number(w('minute')), sonntag: w('weekday') === 'Sun' };
}

export function leer(): Fenster { return { gesamt: 0, nacht: 0, nachtTief: 0, sonntag: 0, feiertag: 0, feiertagHoch: 0 }; }

function istHoch(datum: string, stunde: number): boolean {
  const mt = datum.slice(5);
  return mt === '12-25' || mt === '12-26' || mt === '05-01' || (mt === '12-24' && stunde >= 14);
}
function istFeiertagFenster(datum: string, stunde: number, feiertage: Set<string>): boolean {
  return feiertage.has(datum) || (datum.slice(5) === '12-31' && stunde >= 14);
}

/**
 * Netto-Minuten einer Schicht, aufgeteilt in Zeitfenster. Offene Schicht
 * (ohne Gehen) oder Unsinn -> null. Läuft in Stunden-Schritten in deutscher
 * Zeit (Sommer-/Winterzeit wird je Schritt neu bestimmt).
 */
export function fensterEinerSitzung(s: Sitzung, feiertage: Set<string>): Fenster | null {
  if (!s.gehen_um) return null;
  const a = Date.parse(s.kommen_um), b = Date.parse(s.gehen_um);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 24 * 3_600_000) return null;
  const brutto = leer();
  const startTag = teile(a).datum;
  let t = a;
  while (t < b) {
    const p = teile(t);
    const bisVolleStunde = (60 - p.minute) * 60_000 - (t % 60_000);
    const schritt = Math.min(b - t, Math.max(bisVolleStunde, 60_000));
    const min = schritt / 60_000;
    brutto.gesamt += min;
    if (p.stunde >= 20 || p.stunde < 6) brutto.nacht += min;
    if (p.stunde < 4 && p.datum > startTag) brutto.nachtTief += min;
    if (istHoch(p.datum, p.stunde)) brutto.feiertagHoch += min;
    else if (istFeiertagFenster(p.datum, p.stunde, feiertage)) brutto.feiertag += min;
    else if (p.sonntag) brutto.sonntag += min;
    t += schritt;
  }
  const pause = Math.max(0, Math.min(Number(s.pause_minuten) || 0, brutto.gesamt));
  const f = brutto.gesamt ? (brutto.gesamt - pause) / brutto.gesamt : 0;
  const r = (x: number) => rundeStellen(x * f, 2);
  return { gesamt: r(brutto.gesamt), nacht: r(brutto.nacht), nachtTief: r(brutto.nachtTief), sonntag: r(brutto.sonntag), feiertag: r(brutto.feiertag), feiertagHoch: r(brutto.feiertagHoch) };
}

// ---------------------------------------------------------------------------
// Monat
// ---------------------------------------------------------------------------

function zwei(n: number) { return n < 10 ? `0${n}` : String(n); }
export function monatsGrenzen(monat: string): { von: string; bis: string } | null {
  if (!/^\d{4}-\d{2}$/.test(monat)) return null;
  const [j, m] = monat.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const letzter = new Date(Date.UTC(j, m, 0)).getUTCDate();
  return { von: `${monat}-01`, bis: `${monat}-${zwei(letzter)}` };
}

function tageZwischen(von: string, bis: string): string[] {
  const out: string[] = [];
  const d = new Date(`${von}T12:00:00Z`), e = new Date(`${bis}T12:00:00Z`);
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
function istWerktag(iso: string, feiertage: Set<string>): boolean {
  const wt = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return wt >= 1 && wt <= 5 && !feiertage.has(iso);
}

/** Arbeitstage Mo–Fr ohne Feiertage im Monat. */
export function arbeitstage(monat: string, feiertage: Set<string>): number {
  const g = monatsGrenzen(monat); if (!g) return 0;
  return tageZwischen(g.von, g.bis).filter((d) => istWerktag(d, feiertage)).length;
}

/** Abwesenheitstage (Mo–Fr ohne Feiertage) im Monat. Urlaub nur genehmigt, Krankheit nie abgelehnte. */
export function abwesenheitTage(abw: Abwesenheit[], monat: string, feiertage: Set<string>): { urlaub: number; krank: number } {
  const g = monatsGrenzen(monat); const out = { urlaub: 0, krank: 0 };
  if (!g) return out;
  for (const x of abw) {
    if (!x.von || !x.bis) continue;
    const von = x.von > g.von ? x.von : g.von, bis = x.bis < g.bis ? x.bis : g.bis;
    if (von > bis) continue;
    const n = tageZwischen(von, bis).filter((d) => istWerktag(d, feiertage)).length;
    if (x.typ === 'urlaub' && x.status === 'genehmigt') out.urlaub += n;
    else if (x.typ === 'krankheit' && x.status !== 'abgelehnt') out.krank += n;
  }
  return out;
}

export type MonatsZeile = {
  mitarbeiter_id: string; name: string; personalnummer: string;
  fenster: Fenster; sollMin: number | null; mehrMin: number | null;
  urlaubTage: number; krankTage: number; spesen: number; hinweise: string[];
  /** HW-4: Ausfallstunden in Minuten */
  ausfall: { schlechtwetter: number; arbeitsmangel: number };
};

export function anzeigeName(m: Mitarbeiter): string {
  return [m.vorname, m.nachname].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || 'Ohne Namen';
}

function zahl(x: unknown): number | null { return leseZahl(x); }

/**
 * Eine Zeile je Mitarbeiter. Sitzungen zählen nach ihrem Datum (Stempel-Tag).
 * Soll = Wochenstunden ÷ 5 × Arbeitstage (Mo–Fr). Urlaub/Krankheit werden mit
 * dem Tagessoll angerechnet. Ohne Wochenstunden kein Soll, keine Mehrarbeit.
 */
export function monatsZeile(
  m: Mitarbeiter, sitzungen: Sitzung[], abw: Abwesenheit[], spesen: Spesen[], monat: string, feiertage: Set<string>,
  ausfallRows: Ausfall[] = [],
): MonatsZeile {
  const g = monatsGrenzen(monat);
  const fenster = leer();
  const hinweise: string[] = [];
  let offen = 0, kaputt = 0;
  for (const s of sitzungen) {
    if (s.mitarbeiter_id !== m.id || !g || s.datum < g.von || s.datum > g.bis) continue;
    if (!s.gehen_um) { offen++; continue; }
    const f = fensterEinerSitzung(s, feiertage);
    if (!f) { kaputt++; continue; }
    for (const k of Object.keys(fenster) as (keyof Fenster)[]) fenster[k] = rundeStellen(fenster[k] + f[k], 2);
  }
  if (offen) hinweise.push(`${offen} Schicht(en) ohne „Gehen" — nicht gezählt, bitte nachtragen`);
  if (kaputt) hinweise.push(`${kaputt} Schicht(en) unplausibel (über 24 Std. oder Ende vor Beginn) — nicht gezählt`);
  const a = abwesenheitTage(abw.filter((x) => x.mitarbeiter_id === m.id), monat, feiertage);
  const ws = zahl(m.wochenstunden);
  let sollMin: number | null = null, mehrMin: number | null = null;
  if (ws && ws > 0) {
    const tag = (ws / 5) * 60;
    sollMin = Math.round(tag * arbeitstage(monat, feiertage));
    mehrMin = Math.round(fenster.gesamt + (a.urlaub + a.krank) * tag - sollMin);
  } else hinweise.push('Keine Wochenstunden hinterlegt — Soll und Mehrarbeit nicht berechnet');
  const name = anzeigeName(m);
  const eigeneSpesen = (spesen ?? []).filter((x) => String(x.reisender ?? '').trim().toLowerCase() === name.toLowerCase()
    && !!g && !!x.abreise && x.abreise.slice(0, 10) >= g.von && x.abreise.slice(0, 10) <= g.bis);
  const spesenSumme = centRunden(eigeneSpesen.reduce((s, x) => s + (zahl(x.gesamt) ?? 0), 0));
  return {
    mitarbeiter_id: m.id, name, personalnummer: String(m.personalnummer ?? '').trim(),
    fenster, sollMin, mehrMin, urlaubTage: a.urlaub, krankTage: a.krank, spesen: spesenSumme, hinweise,
    ausfall: g ? ausfallImMonat(ausfallRows, m.id, g.von, g.bis) : { schlechtwetter: 0, arbeitsmangel: 0 },
  };
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

export function stunden(min: number | null): string {
  if (min == null) return '';
  return rundeStellen(min / 60, 2).toFixed(2).replace('.', ',');
}

function zelle(x: string): string {
  const t = String(x ?? '');
  // Formel-Einschleusung in Tabellenprogrammen verhindern
  const sicher = /^[=+\-@\t\r]/.test(t) && !/^-?\d/.test(t) ? `'${t}` : t;
  return /[;"\n\r]/.test(sicher) ? `"${sicher.replace(/"/g, '""')}"` : sicher;
}

export const CSV_KOPF = ['Personalnummer', 'Name', 'Monat', 'Ist Std', 'Soll Std', 'Mehrarbeit Std', 'Nacht 20-6 Std', 'davon 0-4 Std', 'Sonntag Std', 'Feiertag Std', 'Feiertag 24.12./25.12./26.12./1.5. Std', 'Urlaubstage', 'Krankheitstage', 'Spesen EUR', 'Ausfall Schlechtwetter Std', 'Ausfall Arbeitsmangel Std', 'Hinweise'];

/** Semikolon-CSV (deutsche Kommazahlen, UTF-8 mit BOM) für Lohnprogramm / Steuerbüro. */
export function csvExport(zeilen: MonatsZeile[], monat: string): string {
  const z = [CSV_KOPF.join(';')];
  for (const r of zeilen) {
    z.push([
      r.personalnummer, r.name, monat, stunden(r.fenster.gesamt), stunden(r.sollMin), stunden(r.mehrMin),
      stunden(r.fenster.nacht), stunden(r.fenster.nachtTief), stunden(r.fenster.sonntag), stunden(r.fenster.feiertag), stunden(r.fenster.feiertagHoch),
      String(r.urlaubTage), String(r.krankTage), r.spesen.toFixed(2).replace('.', ','),
      stunden(r.ausfall.schlechtwetter), stunden(r.ausfall.arbeitsmangel), r.hinweise.join(' | '),
    ].map(zelle).join(';'));
  }
  return '﻿' + z.join('\r\n') + '\r\n';
}

export const ERKLAERUNG = 'Vorbereitung aus der Zeiterfassung, keine Lohnabrechnung. Zeitfenster in deutscher Zeit: Nacht 20–6 Uhr (davon 0–4 Uhr bei Schichtbeginn vor 0 Uhr), Sonntag, Feiertag des Bundeslands und 31.12. ab 14 Uhr, besondere Feiertage (24.12. ab 14 Uhr, 25./26.12., 01.05.). Pausen anteilig abgezogen. Ob und in welcher Höhe Zuschläge gezahlt werden, regeln Vertrag/Tarif.';
