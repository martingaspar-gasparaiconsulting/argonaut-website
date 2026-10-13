// ARGONAUT OS · lib/tierArznei.ts — Paket 357 (13.10.2026)
// A4d Fachpaket Tierhaltung: Arzneimittel-Bestandsbuch für Höfe mit Nutztieren.
//
// Reine Logik (node-getestet in tests/tierArzneiP357): Prüfung vor dem
// Speichern (dieselben Grenzen wie supabase-sql/p357-tier-arznei-bestandsbuch.sql),
// „frei ab" wie die Datenbank (letzter Behandlungstag + Wartezeit), Sperr-Stand
// je Tiergruppe, Fristen, halbjährliche Antibiotika-Übersicht, Druck und CSV.
//
// Grundsatz: Das Bestandsbuch wird nur angehängt. Korrektur = Storno mit Grund
// (Geschäftsleitung) und neuer Eintrag. Die Wartezeit trägt der Betrieb vom
// Beleg des Tierarztes bzw. der Packungsbeilage ein — ARGONAUT schätzt keine
// Wartezeit und übermittelt nichts an HIT oder die Antibiotika-Datenbank.
//
// Keine Supabase-, React- oder Next-Abhängigkeit.
// ============================================================================

import { berlinTag, datumDe, zeitDe, esc, type Firmenkopf } from './bewachung';
import { leseZahl } from './zahlen';
import { csvText } from './csvSchreiben';

export { berlinTag, datumDe, zeitDe, esc };
export type { Firmenkopf };

export const MODUL = 'tierbestand';

export const EINHEITEN = Object.freeze([
  { key: 'ml', name: 'ml' },
  { key: 'l', name: 'l' },
  { key: 'g', name: 'g' },
  { key: 'kg', name: 'kg' },
  { key: 'stk', name: 'Stück' },
  { key: 'dosis', name: 'Dosen' },
] as const);
export function einheitName(k: string | null | undefined): string {
  return EINHEITEN.find((e) => e.key === k)?.name ?? String(k ?? '');
}
const EINHEIT_KEYS: readonly string[] = EINHEITEN.map((e) => e.key);

export const WARTE_ARTEN = Object.freeze([
  { key: 'fleisch', name: 'Fleisch', spalte: 'wartezeit_fleisch', frei: 'frei_fleisch_ab' },
  { key: 'milch', name: 'Milch', spalte: 'wartezeit_milch', frei: 'frei_milch_ab' },
  { key: 'eier', name: 'Eier', spalte: 'wartezeit_eier', frei: 'frei_eier_ab' },
] as const);
export type WarteArt = (typeof WARTE_ARTEN)[number]['key'];

// --- Eingaben lesen -------------------------------------------------------------------

/** Menge mit bis zu drei Nachkommastellen (deutsches Komma). Leer → null, ungültig → undefined. */
export function mengeLesen(roh: string | number | null | undefined): number | null | undefined {
  if (!String(roh ?? '').trim()) return null;
  const z = leseZahl(roh);
  if (z === null || !Number.isFinite(z) || z <= 0 || z > 10000000) return undefined;
  return Math.abs(z * 1000 - Math.round(z * 1000)) < 1e-6 ? z : undefined;
}
/** 1234,5 → „1.234,5". */
export function zahlDe(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const [ganz, rest] = String(Math.round(n * 1000) / 1000).split('.');
  const g = ganz.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}${rest ? `${g},${rest}` : g}`;
}
export function mengeText(menge: number | null | undefined, einheit: string | null | undefined): string {
  return menge == null ? '—' : `${zahlDe(menge)} ${einheitName(einheit)}`;
}

/** Wartezeit in ganzen Tagen 0–999. Leer → null (nicht zutreffend), ungültig → undefined. */
export function wartezeitLesen(roh: string | number | null | undefined): number | null | undefined {
  const t = String(roh ?? '').trim();
  if (!t) return null;
  if (!/^\d{1,3}$/.test(t)) return undefined;
  return Number(t);
}

/** Anzahl Tiere 1–100.000 (Punkt als Tausender erlaubt). */
export function anzahlLesen(roh: string | number | null | undefined): number | undefined {
  if (!String(roh ?? '').trim()) return undefined;
  const n = leseZahl(roh);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 100000 ? n : undefined;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function istDatum(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** Datum + n Tage (UTC, sommerzeitsicher) — wie `date + integer` in Postgres. */
export function tageDazu(datum: string, n: number): string {
  const d = new Date(datum + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Ganze Tage von a bis b. */
export function tageZwischen(a: string, b: string): number {
  return Math.round((new Date(b + 'T12:00:00Z').getTime() - new Date(a + 'T12:00:00Z').getTime()) / 86400000);
}
/** „Frei ab" wie die Datenbank: letzter Behandlungstag + Wartezeit. Ohne Wartezeit → null. */
export function freiAb(datumBis: string, wartezeit: number | null | undefined): string | null {
  return wartezeit == null || !istDatum(datumBis) ? null : tageDazu(datumBis, wartezeit);
}
/** Behandlungstage einschließlich erstem und letztem Tag. */
export function behandlungsTage(von: string, bis: string): number {
  return istDatum(von) && istDatum(bis) && bis >= von ? tageZwischen(von, bis) + 1 : 0;
}

function text(roh: unknown, max: number): string | null | undefined {
  const t = String(roh ?? '').trim();
  if (!t) return null;
  return t.length <= max ? t : undefined;
}

// --- Prüfung vor dem Speichern ---------------------------------------------------------

export type EingangRoh = {
  datum?: string; arzneimittel?: string; zulassungs_nr?: string; charge?: string; menge?: string | number; einheit?: string;
  lieferant?: string; beleg_nr?: string; verfall?: string; notiz?: string;
};
export type EingangWerte = {
  datum: string; arzneimittel: string; zulassungs_nr: string | null; charge: string | null; menge: number; einheit: string;
  lieferant: string; beleg_nr: string | null; verfall: string | null; notiz: string | null;
};
export type Pruefung<T> = { ok: true; werte: T; hinweise: string[] } | { ok: false; fehler: string[]; hinweise: string[] };

export function eingangPruefen(r: EingangRoh, heute: string): Pruefung<EingangWerte> {
  const fehler: string[] = []; const hinweise: string[] = [];
  const datum = String(r.datum ?? '').trim();
  if (!istDatum(datum)) fehler.push('Bitte das Datum des Erwerbs wählen.');
  else if (datum > heute) fehler.push('Das Datum des Erwerbs liegt in der Zukunft.');
  const mittel = text(r.arzneimittel, 200);
  if (!mittel) fehler.push(mittel === undefined ? 'Die Bezeichnung des Arzneimittels ist zu lang (höchstens 200 Zeichen).' : 'Bitte das Arzneimittel eintragen.');
  const zul = text(r.zulassungs_nr, 40); if (zul === undefined) fehler.push('Die Zulassungsnummer ist zu lang (höchstens 40 Zeichen).');
  const charge = text(r.charge, 40); if (charge === undefined) fehler.push('Die Charge ist zu lang (höchstens 40 Zeichen).');
  const menge = mengeLesen(r.menge);
  if (menge == null) fehler.push(menge === null ? 'Bitte die Menge eintragen.' : 'Die Menge ist ungültig (größer 0, höchstens drei Nachkommastellen).');
  const einheit = String(r.einheit ?? 'ml');
  if (!EINHEIT_KEYS.includes(einheit)) fehler.push('Bitte eine Einheit wählen.');
  const lief = text(r.lieferant, 300);
  if (!lief) fehler.push(lief === undefined ? 'Der Lieferant ist zu lang (höchstens 300 Zeichen).' : 'Bitte eintragen, von wem das Mittel stammt (Tierarztpraxis oder Apotheke).');
  const beleg = text(r.beleg_nr, 40); if (beleg === undefined) fehler.push('Die Belegnummer ist zu lang (höchstens 40 Zeichen).');
  const verfall = String(r.verfall ?? '').trim();
  if (verfall && !istDatum(verfall)) fehler.push('Das Verfallsdatum ist ungültig.');
  else if (verfall && verfall < heute) hinweise.push('Das Verfallsdatum ist bereits überschritten.');
  const notiz = text(r.notiz, 500); if (notiz === undefined) fehler.push('Die Notiz ist zu lang (höchstens 500 Zeichen).');
  if (!beleg) hinweise.push('Ohne Belegnummer lässt sich der Erwerb später schwer dem Beleg zuordnen.');
  if (fehler.length) return { ok: false, fehler, hinweise };
  return {
    ok: true, hinweise,
    werte: { datum, arzneimittel: mittel as string, zulassungs_nr: zul ?? null, charge: charge ?? null, menge: menge as number, einheit, lieferant: lief as string, beleg_nr: beleg ?? null, verfall: verfall || null, notiz: notiz ?? null },
  };
}

export type AnwendungRoh = {
  gruppe_id?: string | null; tier_kennung?: string; anzahl_tiere?: string | number; arzneimittel?: string; eingang_id?: string | null;
  beleg_nr?: string; menge?: string | number; einheit?: string; dosierung?: string; datum_von?: string; datum_bis?: string;
  wartezeit_fleisch?: string | number | null; wartezeit_milch?: string | number | null; wartezeit_eier?: string | number | null;
  antibiotikum?: boolean; tierarzt?: string; anwender_name?: string; notiz?: string;
};
export type AnwendungWerte = {
  gruppe_id: string; tier_kennung: string | null; anzahl_tiere: number; arzneimittel: string; eingang_id: string | null; beleg_nr: string | null;
  menge: number; einheit: string; dosierung: string | null; datum_von: string; datum_bis: string;
  wartezeit_fleisch: number | null; wartezeit_milch: number | null; wartezeit_eier: number | null;
  antibiotikum: boolean; tierarzt: string | null; anwender_name: string; notiz: string | null;
};

/** Tierarten, deren Tiere einzeln gekennzeichnet sind (Ohrmarke, Transponder). */
const EINZELN: readonly string[] = ['rind', 'schaf', 'ziege', 'pferd'];

export function anwendungPruefen(r: AnwendungRoh, heute: string, tierart?: string | null): Pruefung<AnwendungWerte> {
  const fehler: string[] = []; const hinweise: string[] = [];
  const gruppe = String(r.gruppe_id ?? '').trim();
  if (!gruppe) fehler.push('Bitte die Tiergruppe wählen.');
  const kennung = text(r.tier_kennung, 1000); if (kennung === undefined) fehler.push('Die Kennzeichnung der Tiere ist zu lang (höchstens 1.000 Zeichen).');
  const anzahl = anzahlLesen(r.anzahl_tiere);
  if (anzahl === undefined) fehler.push('Bitte die Anzahl der behandelten Tiere eintragen (1 bis 100.000).');
  const mittel = text(r.arzneimittel, 200);
  if (!mittel) fehler.push(mittel === undefined ? 'Die Bezeichnung des Arzneimittels ist zu lang (höchstens 200 Zeichen).' : 'Bitte das Arzneimittel eintragen.');
  const beleg = text(r.beleg_nr, 40); if (beleg === undefined) fehler.push('Die Belegnummer ist zu lang (höchstens 40 Zeichen).');
  const menge = mengeLesen(r.menge);
  if (menge == null) fehler.push(menge === null ? 'Bitte die angewendete Menge eintragen.' : 'Die Menge ist ungültig (größer 0, höchstens drei Nachkommastellen).');
  const einheit = String(r.einheit ?? 'ml');
  if (!EINHEIT_KEYS.includes(einheit)) fehler.push('Bitte eine Einheit wählen.');
  const dos = text(r.dosierung, 200); if (dos === undefined) fehler.push('Die Dosierung ist zu lang (höchstens 200 Zeichen).');
  const von = String(r.datum_von ?? '').trim();
  const bis = String(r.datum_bis ?? '').trim() || von;
  if (!istDatum(von)) fehler.push('Bitte den ersten Behandlungstag wählen.');
  else if (von > heute) fehler.push('Der Beginn der Behandlung liegt in der Zukunft.');
  if (istDatum(von) && !istDatum(bis)) fehler.push('Der letzte Behandlungstag ist ungültig.');
  else if (istDatum(von) && bis < von) fehler.push('Der letzte Behandlungstag liegt vor dem ersten.');
  else if (istDatum(von) && tageZwischen(von, bis) > 365) fehler.push('Eine Behandlung dauert hier höchstens ein Jahr.');
  const wz = {
    fleisch: wartezeitLesen(r.wartezeit_fleisch), milch: wartezeitLesen(r.wartezeit_milch), eier: wartezeitLesen(r.wartezeit_eier),
  };
  for (const a of WARTE_ARTEN) if (wz[a.key] === undefined) fehler.push(`Die Wartezeit ${a.name} ist ungültig (ganze Tage, 0 bis 999).`);
  if (wz.fleisch === null && wz.milch === null && wz.eier === null) fehler.push('Bitte mindestens eine Wartezeit eintragen (Fleisch, Milch oder Eier) — 0 Tage, wenn der Beleg keine Wartezeit nennt.');
  const ta = text(r.tierarzt, 300); if (ta === undefined) fehler.push('Der Name der Tierarztpraxis ist zu lang (höchstens 300 Zeichen).');
  const anw = text(r.anwender_name, 200);
  if (!anw) fehler.push(anw === undefined ? 'Der Name ist zu lang (höchstens 200 Zeichen).' : 'Bitte eintragen, wer das Mittel angewendet hat.');
  const notiz = text(r.notiz, 500); if (notiz === undefined) fehler.push('Die Notiz ist zu lang (höchstens 500 Zeichen).');
  const ab = r.antibiotikum === true;
  if (!beleg) hinweise.push('Die Nummer des tierärztlichen Belegs (Anwendungs- und Abgabebeleg) fehlt.');
  if (!kennung && tierart && EINZELN.includes(tierart)) hinweise.push('Bitte die Kennzeichnung der behandelten Tiere eintragen (z. B. Ohrmarken).');
  if (ab && !ta) hinweise.push('Bei Antibiotika bitte die Tierarztpraxis eintragen.');
  if (fehler.length) return { ok: false, fehler, hinweise };
  return {
    ok: true, hinweise,
    werte: {
      gruppe_id: gruppe, tier_kennung: kennung ?? null, anzahl_tiere: anzahl as number, arzneimittel: mittel as string,
      eingang_id: String(r.eingang_id ?? '').trim() || null, beleg_nr: beleg ?? null, menge: menge as number, einheit, dosierung: dos ?? null,
      datum_von: von, datum_bis: bis,
      wartezeit_fleisch: wz.fleisch as number | null, wartezeit_milch: wz.milch as number | null, wartezeit_eier: wz.eier as number | null,
      antibiotikum: ab, tierarzt: ta ?? null, anwender_name: anw as string, notiz: notiz ?? null,
    },
  };
}

// --- Sperr-Stand und Fristen ----------------------------------------------------------

export type Eingang = EingangWerte & {
  id: string; status: string; storno_grund?: string | null; erfasst_am?: string | null; erfasst_name?: string | null;
};
export type Anwendung = AnwendungWerte & {
  id: string; gruppe_bezeichnung?: string | null; tierart?: string | null; status: string; storno_grund?: string | null;
  frei_fleisch_ab?: string | null; frei_milch_ab?: string | null; frei_eier_ab?: string | null;
  erfasst_am?: string | null; erfasst_name?: string | null;
};

function frei(a: Anwendung, art: WarteArt): string | null {
  const spalte = WARTE_ARTEN.find((w) => w.key === art)!;
  const db = (a as unknown as Record<string, string | null | undefined>)[spalte.frei];
  return db ?? freiAb(a.datum_bis, (a as unknown as Record<string, number | null>)[spalte.spalte]);
}

export type Sperre = { gruppe_id: string; gruppe: string; tierart: string | null; art: WarteArt; frei_ab: string; rest_tage: number; mittel: string[] };

/** Gesperrte Erzeugnisse je Tiergruppe: „frei ab" liegt nach heute. Stornierte zählen nicht. */
export function sperrStand(anwendungen: readonly Anwendung[], heute: string): Sperre[] {
  const m = new Map<string, Sperre>();
  for (const a of anwendungen) {
    if (a.status !== 'gueltig') continue;
    for (const w of WARTE_ARTEN) {
      const f = frei(a, w.key);
      if (!f || f <= heute) continue;
      const k = `${a.gruppe_id}|${w.key}`;
      const alt = m.get(k);
      if (!alt) m.set(k, { gruppe_id: a.gruppe_id, gruppe: a.gruppe_bezeichnung ?? '—', tierart: a.tierart ?? null, art: w.key, frei_ab: f, rest_tage: tageZwischen(heute, f), mittel: [a.arzneimittel] });
      else {
        if (!alt.mittel.includes(a.arzneimittel)) alt.mittel.push(a.arzneimittel);
        if (f > alt.frei_ab) { alt.frei_ab = f; alt.rest_tage = tageZwischen(heute, f); }
      }
    }
  }
  return [...m.values()].sort((a, b) => a.gruppe.localeCompare(b.gruppe, 'de') || WARTE_ARTEN.findIndex((w) => w.key === a.art) - WARTE_ARTEN.findIndex((w) => w.key === b.art));
}

/** Ist eine Gruppe für ein Erzeugnis gerade gesperrt? (z. B. vor Schlachtung oder Milchabgabe) */
export function gesperrt(sperren: readonly Sperre[], gruppeId: string, art: WarteArt): Sperre | null {
  return sperren.find((s) => s.gruppe_id === gruppeId && s.art === art) ?? null;
}

/** Halbjahr eines Datums. */
export function halbjahr(datum: string): { jahr: number; h: 1 | 2 } {
  return { jahr: Number(datum.slice(0, 4)), h: Number(datum.slice(5, 7)) <= 6 ? 1 : 2 };
}
/** Frist der halbjährlichen Antibiotika-Mitteilung: 14. Juli bzw. 14. Januar des Folgejahres. */
export function mitteilungsFrist(jahr: number, h: 1 | 2): string {
  return h === 1 ? `${jahr}-07-14` : `${jahr + 1}-01-14`;
}
export function halbjahrText(jahr: number, h: 1 | 2): string {
  return `${h}. Halbjahr ${jahr}`;
}
function halbjahrGrenzen(jahr: number, h: 1 | 2): { von: string; bis: string } {
  return h === 1 ? { von: `${jahr}-01-01`, bis: `${jahr}-06-30` } : { von: `${jahr}-07-01`, bis: `${jahr}-12-31` };
}

export type AbZeile = { tierart: string; gruppe: string; arzneimittel: string; anwendungen: number; tiere: number; behandlungstage: number; menge: number; einheit: string };

/**
 * Antibiotika-Anwendungen eines Halbjahres, zusammengefasst je Gruppe und Mittel.
 * Zählt die Behandlungstage, die in das Halbjahr fallen (Behandlungen über die Grenze werden geteilt).
 * Die Menge wird anteilig nach Tagen aufgeteilt, wenn eine Behandlung über die Grenze geht.
 */
export function antibiotikaHalbjahr(anwendungen: readonly Anwendung[], jahr: number, h: 1 | 2): AbZeile[] {
  const { von, bis } = halbjahrGrenzen(jahr, h);
  const m = new Map<string, AbZeile>();
  for (const a of anwendungen) {
    if (a.status !== 'gueltig' || !a.antibiotikum) continue;
    const s = a.datum_von > von ? a.datum_von : von;
    const e = a.datum_bis < bis ? a.datum_bis : bis;
    if (e < s) continue;
    const tage = behandlungsTage(s, e);
    const gesamt = behandlungsTage(a.datum_von, a.datum_bis) || 1;
    const k = `${a.gruppe_id}|${a.arzneimittel}|${a.einheit}`;
    const z = m.get(k) ?? { tierart: a.tierart ?? '', gruppe: a.gruppe_bezeichnung ?? '—', arzneimittel: a.arzneimittel, anwendungen: 0, tiere: 0, behandlungstage: 0, menge: 0, einheit: a.einheit };
    z.anwendungen += 1;
    z.tiere += a.anzahl_tiere;
    z.behandlungstage += tage;
    z.menge = Math.round((z.menge + (Number(a.menge) * tage) / gesamt) * 1000) / 1000;
    m.set(k, z);
  }
  return [...m.values()].sort((a, b) => a.gruppe.localeCompare(b.gruppe, 'de') || a.arzneimittel.localeCompare(b.arzneimittel, 'de'));
}

export type Frist = { art: 'wartezeit' | 'antibiotika' | 'verfall'; datum: string; rest_tage: number; titel: string; text: string; dringend: boolean };

/**
 * Fristen-Übersicht: Wartezeiten, die in den nächsten 14 Tagen enden; die
 * Antibiotika-Mitteilung des abgelaufenen Halbjahres (nur wenn es dort
 * Antibiotika-Anwendungen gab und die Frist noch nicht vorbei ist); Mittel,
 * die in 60 Tagen verfallen. Ob der Betrieb mitteilungspflichtig ist, hängt
 * von Nutzungsart und Bestandsgröße ab — das prüft der Betrieb.
 */
export function fristen(anwendungen: readonly Anwendung[], eingaenge: readonly Eingang[], heute: string): Frist[] {
  const out: Frist[] = [];
  for (const s of sperrStand(anwendungen, heute)) {
    if (s.rest_tage > 14) continue;
    const wname = WARTE_ARTEN.find((w) => w.key === s.art)!.name;
    out.push({ art: 'wartezeit', datum: s.frei_ab, rest_tage: s.rest_tage, titel: `${s.gruppe}: ${wname} frei ab ${datumDe(s.frei_ab)}`, text: `Wartezeit nach ${s.mittel.join(', ')}.`, dringend: false });
  }
  const { jahr, h } = halbjahr(heute);
  const vorher: { jahr: number; h: 1 | 2 } = h === 1 ? { jahr: jahr - 1, h: 2 } : { jahr, h: 1 };
  const frist = mitteilungsFrist(vorher.jahr, vorher.h);
  if (heute <= frist && antibiotikaHalbjahr(anwendungen, vorher.jahr, vorher.h).length) {
    const rest = tageZwischen(heute, frist);
    out.push({
      art: 'antibiotika', datum: frist, rest_tage: rest, dringend: rest <= 7,
      titel: `Antibiotika-Mitteilung ${halbjahrText(vorher.jahr, vorher.h)} bis ${datumDe(frist)}`,
      text: 'Falls Ihr Betrieb mitteilungspflichtig ist: Angaben in der HIT-Antibiotika-Datenbank eintragen. Die Übersicht dazu steht im Reiter „Antibiotika".',
    });
  }
  for (const e of eingaenge) {
    if (e.status !== 'gueltig' || !e.verfall) continue;
    const rest = tageZwischen(heute, e.verfall);
    if (rest > 60) continue;
    out.push({ art: 'verfall', datum: e.verfall, rest_tage: rest, dringend: rest < 0, titel: `${e.arzneimittel}${e.charge ? ` (Charge ${e.charge})` : ''}: ${rest < 0 ? 'verfallen seit' : 'verfällt am'} ${datumDe(e.verfall)}`, text: `Erworben am ${datumDe(e.datum)} bei ${e.lieferant}.` });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum));
}

/** Aufbewahrung: Einträge mindestens fünf Jahre aufbewahren — bis zum selben Tag fünf Jahre später. */
export function aufbewahrenBis(datum: string): string {
  if (!istDatum(datum)) return '';
  const [j, mo, t] = datum.split('-');
  const ziel = `${Number(j) + 5}-${mo}-${t}`;
  return istDatum(ziel) ? ziel : `${Number(j) + 5}-${mo}-28`;
}

export type Kennzahlen = { gesperrteGruppen: number; anwendungenJahr: number; antibiotikaJahr: number; offeneFristen: number };
export function kennzahlen(anwendungen: readonly Anwendung[], eingaenge: readonly Eingang[], heute: string): Kennzahlen {
  const jahr = heute.slice(0, 4);
  const gueltig = anwendungen.filter((a) => a.status === 'gueltig' && a.datum_von.startsWith(jahr));
  return {
    gesperrteGruppen: new Set(sperrStand(anwendungen, heute).map((s) => s.gruppe_id)).size,
    anwendungenJahr: gueltig.length,
    antibiotikaJahr: gueltig.filter((a) => a.antibiotikum).length,
    offeneFristen: fristen(anwendungen, eingaenge, heute).length,
  };
}

// --- Druck und CSV --------------------------------------------------------------------

const STIL = '<style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:11.5px;line-height:1.4;margin:18px}'
  + '.kopf{font-size:11px;color:#444;border-bottom:1px solid #999;padding-bottom:6px;margin-bottom:12px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}'
  + 'table{width:100%;border-collapse:collapse;margin:4px 0}th,td{text-align:left;padding:3px 5px;border:1px solid #ccc;vertical-align:top}th{font-size:10.5px;background:#f1f1f1}'
  + '.klein{font-size:10.5px;color:#555}.storno td{color:#888;text-decoration:line-through}.storno td.grund{text-decoration:none}.zahl{text-align:right;white-space:nowrap}'
  + '@media print{.nodruck{display:none}}</style>';

function kopfHtml(f: Firmenkopf): string {
  const z = [f.name, [f.strasse, [f.plz, f.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), f.telefon, f.email].filter(Boolean);
  return `<div class="kopf">${z.map(esc).join(' · ')}</div>`;
}
function wzText(a: Anwendung): string {
  return WARTE_ARTEN.map((w) => {
    const t = (a as unknown as Record<string, number | null>)[w.spalte];
    if (t == null) return '';
    return `${w.name}: ${t} T. → ${datumDe(frei(a, w.key))}`;
  }).filter(Boolean).join('<br>');
}

/** Bestandsbuch-Druck für einen Zeitraum (optional nur eine Tiergruppe). Stornierte bleiben sichtbar, durchgestrichen. */
export function bestandsbuchHtml(opt: {
  firma: Firmenkopf; von: string; bis: string; gruppe?: string | null; betriebsnummer?: string | null;
  eingaenge: readonly Eingang[]; anwendungen: readonly Anwendung[]; gedrucktAm: string;
}): string {
  const inZeit = (d: string) => d >= opt.von && d <= opt.bis;
  const ein = opt.eingaenge.filter((e) => inZeit(e.datum)).sort((a, b) => a.datum.localeCompare(b.datum));
  const anw = opt.anwendungen.filter((a) => inZeit(a.datum_von)).sort((a, b) => a.datum_von.localeCompare(b.datum_von));
  const titel = `Bestandsbuch Tierarzneimittel${opt.gruppe ? ` · ${esc(opt.gruppe)}` : ''}`;
  const zEin = ein.map((e) => `<tr class="${e.status === 'storniert' ? 'storno' : ''}"><td>${datumDe(e.datum)}</td><td>${esc(e.arzneimittel)}${e.zulassungs_nr ? `<br><span class="klein">Zul.-Nr. ${esc(e.zulassungs_nr)}</span>` : ''}</td><td>${esc(e.charge ?? '')}</td><td class="zahl">${esc(mengeText(e.menge, e.einheit))}</td><td>${esc(e.lieferant)}</td><td>${esc(e.beleg_nr ?? '')}</td><td>${datumDe(e.verfall)}</td><td>${esc(e.erfasst_name ?? '')}<br><span class="klein">${esc(zeitDe(e.erfasst_am))}</span></td><td class="grund">${e.status === 'storniert' ? `Storno: ${esc(e.storno_grund ?? '')}` : ''}</td></tr>`).join('');
  const zAnw = anw.map((a) => `<tr class="${a.status === 'storniert' ? 'storno' : ''}"><td>${datumDe(a.datum_von)}${a.datum_bis !== a.datum_von ? `<br>bis ${datumDe(a.datum_bis)}` : ''}</td><td>${esc(a.gruppe_bezeichnung ?? '')}</td><td class="zahl">${zahlDe(a.anzahl_tiere)}</td><td>${esc(a.tier_kennung ?? '')}</td><td>${esc(a.arzneimittel)}${a.antibiotikum ? '<br><span class="klein">Antibiotikum</span>' : ''}</td><td>${esc(a.beleg_nr ?? '')}</td><td class="zahl">${esc(mengeText(a.menge, a.einheit))}${a.dosierung ? `<br><span class="klein">${esc(a.dosierung)}</span>` : ''}</td><td>${wzText(a)}</td><td>${esc(a.anwender_name)}${a.tierarzt ? `<br><span class="klein">Tierarzt: ${esc(a.tierarzt)}</span>` : ''}</td><td>${esc(a.erfasst_name ?? '')}<br><span class="klein">${esc(zeitDe(a.erfasst_am))}</span></td><td class="grund">${a.status === 'storniert' ? `Storno: ${esc(a.storno_grund ?? '')}` : ''}</td></tr>`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${titel}</title>${STIL}</head><body>`
    + kopfHtml(opt.firma)
    + `<h1>${titel}</h1><div class="klein">Zeitraum ${datumDe(opt.von)} bis ${datumDe(opt.bis)}${opt.betriebsnummer ? ` · Registriernummer ${esc(opt.betriebsnummer)}` : ''} · gedruckt ${esc(zeitDe(opt.gedrucktAm))}</div>`
    + `<h2>Anwendungen (${anw.length})</h2>`
    + (anw.length ? `<table><thead><tr><th>Behandlung</th><th>Tiergruppe</th><th>Anzahl</th><th>Kennzeichnung</th><th>Arzneimittel</th><th>Beleg-Nr.</th><th>Menge</th><th>Wartezeit → frei ab</th><th>Angewendet von</th><th>Erfasst</th><th></th></tr></thead><tbody>${zAnw}</tbody></table>` : '<p class="klein">Keine Anwendungen im Zeitraum.</p>')
    + (opt.gruppe ? '' : `<h2>Erwerb (${ein.length})</h2>`
      + (ein.length ? `<table><thead><tr><th>Datum</th><th>Arzneimittel</th><th>Charge</th><th>Menge</th><th>Bezogen von</th><th>Beleg-Nr.</th><th>Verfall</th><th>Erfasst</th><th></th></tr></thead><tbody>${zEin}</tbody></table>` : '<p class="klein">Kein Erwerb im Zeitraum.</p>'))
    + '<p class="klein">Einträge werden nur angehängt; Korrekturen erscheinen als Storno mit Grund und neuem Eintrag. „Frei ab" = letzter Behandlungstag + eingetragene Wartezeit. Die Wartezeiten stammen vom tierärztlichen Beleg bzw. der Packungsbeilage. Belege und Bestandsbuch mindestens fünf Jahre aufbewahren.</p>'
    + '</body></html>';
}

/** CSV der Antibiotika-Übersicht eines Halbjahres (Formel-Schutz über csvSchreiben). */
export function antibiotikaCsv(zeilen: readonly AbZeile[]): string {
  return csvText([
    ['Tierart', 'Tiergruppe', 'Arzneimittel', 'Anwendungen', 'Tiere', 'Behandlungstage', 'Menge', 'Einheit'],
    ...zeilen.map((z) => [z.tierart, z.gruppe, z.arzneimittel, z.anwendungen, z.tiere, z.behandlungstage, zahlDe(z.menge), einheitName(z.einheit)]),
  ]);
}
