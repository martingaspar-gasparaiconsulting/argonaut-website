// ============================================================================
// ARGONAUT OS · lib/mobilitaet.ts — J1 Jobticket, Dienstrad, Mobilitätszuschuss (Paket 302)
//
// Je Mitarbeiter die Mobilitäts-Leistungen des Betriebs: Jobticket-Zuschuss
// (z. B. Deutschlandticket), Dienstrad (Leasingrate, Eigenanteil per
// Gehaltsumwandlung), Ladestrom-Vereinbarung, Fahrtkosten-Zuschuss, Sonstiges.
// Mit Betrag je Monat (oder einmalig), Laufzeit, Nachweis und Hinweis für die
// Lohnabrechnung.
//
// KEINE Steuerregeln im Code: Ob eine Leistung steuerfrei, pauschal versteuert
// oder steuerpflichtig ist, trägt der Betrieb ein — und nur mit Datum der
// Bestätigung durch den Steuerberater (die Datenbank verlangt das ebenfalls).
// Ohne Bestätigung steht die Leistung auf „mit Steuerberater klären“.
//
// Rein (nur lib/zahlen), node-getestet (tests/mobilitaetP302).
// ============================================================================

import { leseBetrag, inCent } from './zahlen';

export const ARTEN = [
  { key: 'jobticket', label: 'Jobticket / Deutschlandticket', icon: '🚆' },
  { key: 'dienstrad', label: 'Dienstrad', icon: '🚲' },
  { key: 'ladestrom', label: 'Ladestrom-Vereinbarung', icon: '⚡' },
  { key: 'fahrtkosten', label: 'Fahrtkosten-Zuschuss', icon: '🚗' },
  { key: 'sonstiges', label: 'Sonstige Mobilität', icon: '🧭' },
] as const;
export type Art = typeof ARTEN[number]['key'];

export const BEHANDLUNG = [
  { key: 'offen', label: 'Mit Steuerberater klären' },
  { key: 'steuerfrei', label: 'Steuerfrei (laut Steuerberater)' },
  { key: 'pauschal', label: 'Pauschal versteuert (laut Steuerberater)' },
  { key: 'steuerpflichtig', label: 'Steuerpflichtiger Arbeitslohn (laut Steuerberater)' },
] as const;
export type Behandlung = typeof BEHANDLUNG[number]['key'];

export const TURNUS = [
  { key: 'monatlich', label: 'monatlich' },
  { key: 'einmalig', label: 'einmalig' },
] as const;
export type Turnus = typeof TURNUS[number]['key'];

/** Ab wie vielen Tagen vor Ablauf die Ampel gelb wird. */
export const BALD_TAGE = 30;
/** Höchstbetrag je Leistung (Schutz vor Tippfehlern), in Cent: 5.000 €. */
export const MAX_CENT = 500_000;

export function istIso(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [j, m, t] = x.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

function text(roh: unknown, max: number): string | null {
  const t = String(roh ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}
function datumOderNull(roh: unknown): string | null | false {
  if (roh === null || roh === undefined || String(roh).trim() === '') return null;
  return istIso(roh) ? roh : false;
}
/** Euro-Eingabe -> ganze Cent; leer = 0 nur wenn erlaubt, sonst null. */
function centAus(roh: unknown, leerIstNull: boolean): number | null {
  if (roh === null || roh === undefined || String(roh).trim() === '') return leerIstNull ? 0 : null;
  const b = leseBetrag(roh);
  if (b === null || b < 0) return null;
  return inCent(b);
}

export type LeistungZeile = {
  mitarbeiter_id: string | null; person_name: string; art: Art; bezeichnung: string | null;
  betrag_cent: number; eigenanteil_cent: number; turnus: Turnus; beginn: string; ende: string | null;
  lohn_behandlung: Behandlung; stb_bestaetigt_am: string | null; stb_name: string | null;
  nachweis: string | null; nachweis_bis: string | null; notiz: string | null;
};

/** Eingabe prüfen. Beträge in Euro, gespeichert in ganzen Cent. */
export function leistungPruefen(o: {
  mitarbeiterId?: unknown; name: unknown; art: unknown; bezeichnung?: unknown; betrag: unknown; eigenanteil?: unknown;
  turnus: unknown; beginn: unknown; ende?: unknown; behandlung: unknown; stbAm?: unknown; stbName?: unknown;
  nachweis?: unknown; nachweisBis?: unknown; notiz?: unknown; heute: string;
}): { ok: true; zeile: LeistungZeile } | { ok: false; grund: string } {
  const name = text(o.name, 120);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte den Mitarbeiter wählen oder einen Namen eintragen.' };
  if (!ARTEN.some((a) => a.key === o.art)) return { ok: false, grund: 'Bitte die Art der Leistung wählen.' };
  if (!TURNUS.some((t) => t.key === o.turnus)) return { ok: false, grund: 'Bitte „monatlich“ oder „einmalig“ wählen.' };
  const betrag = centAus(o.betrag, false);
  if (betrag === null) return { ok: false, grund: 'Bitte den Betrag des Betriebs in Euro eintragen (0 ist erlaubt, z. B. bei reiner Gehaltsumwandlung).' };
  const eigen = centAus(o.eigenanteil, true);
  if (eigen === null) return { ok: false, grund: 'Der Eigenanteil des Mitarbeiters ist keine gültige Zahl.' };
  if (betrag > MAX_CENT || eigen > MAX_CENT) return { ok: false, grund: 'Mehr als 5.000 € je Leistung — bitte den Betrag prüfen.' };
  if (betrag === 0 && eigen === 0) return { ok: false, grund: 'Betrieb und Mitarbeiter zahlen beide 0 € — bitte mindestens einen Betrag eintragen.' };
  if (!istIso(o.beginn)) return { ok: false, grund: 'Bitte angeben, ab wann die Leistung gilt.' };
  const ende = datumOderNull(o.ende);
  if (ende === false) return { ok: false, grund: 'Das Enddatum ist kein gültiges Datum.' };
  if (ende !== null && ende < o.beginn) return { ok: false, grund: 'Das Ende liegt vor dem Beginn.' };
  if (o.turnus === 'einmalig' && ende !== null) return { ok: false, grund: 'Eine einmalige Leistung hat kein Ende — bitte das Enddatum leeren.' };
  if (!BEHANDLUNG.some((b) => b.key === o.behandlung)) return { ok: false, grund: 'Bitte den Hinweis für die Lohnabrechnung wählen.' };
  let stbAm: string | null = null;
  let stbName: string | null = null;
  if (o.behandlung !== 'offen') {
    const d = datumOderNull(o.stbAm);
    if (d === false || d === null) return { ok: false, grund: 'Steuerfrei, pauschal oder steuerpflichtig nur mit Datum, an dem der Steuerberater das bestätigt hat. Sonst „Mit Steuerberater klären“ wählen.' };
    if (d > o.heute) return { ok: false, grund: 'Die Bestätigung des Steuerberaters kann nicht in der Zukunft liegen.' };
    stbAm = d;
    stbName = text(o.stbName, 120);
  }
  const nachweisBis = datumOderNull(o.nachweisBis);
  if (nachweisBis === false) return { ok: false, grund: '„Nachweis gültig bis“ ist kein gültiges Datum.' };
  const mid = typeof o.mitarbeiterId === 'string' && /^[0-9a-f-]{36}$/i.test(o.mitarbeiterId) ? o.mitarbeiterId : null;
  return {
    ok: true,
    zeile: {
      mitarbeiter_id: mid, person_name: name, art: o.art as Art, bezeichnung: text(o.bezeichnung, 120),
      betrag_cent: betrag, eigenanteil_cent: eigen, turnus: o.turnus as Turnus, beginn: o.beginn, ende,
      lohn_behandlung: o.behandlung as Behandlung, stb_bestaetigt_am: stbAm, stb_name: stbName,
      nachweis: text(o.nachweis, 200), nachweis_bis: nachweisBis, notiz: text(o.notiz, 300),
    },
  };
}

export type Leistung = {
  id?: string; person_name: string; art: string; betrag_cent: number; eigenanteil_cent: number; turnus: string;
  beginn: string; ende: string | null; lohn_behandlung: string; nachweis_bis?: string | null;
};

function monatsende(monat: string): string {
  const [j, m] = monat.split('-').map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
}
export function monatVon(iso: string): string { return iso.slice(0, 7) + '-01'; }

/** Monate von..bis (je der 1.), höchstens 60. */
export function monate(von: string, bis: string): string[] {
  const r: string[] = [];
  let [j, m] = monatVon(von).split('-').map(Number);
  const ziel = monatVon(bis);
  for (let i = 0; i < 60; i++) {
    const k = `${j}-${String(m).padStart(2, '0')}-01`;
    if (k > ziel) break;
    r.push(k);
    m += 1; if (m > 12) { m = 1; j += 1; }
  }
  return r;
}

/** Fällt die Leistung in diesen Monat? Monatlich: Laufzeit berührt den Monat (voller Betrag, keine Tagesanteile). Einmalig: Beginn im Monat. */
export function imMonat(l: Leistung, monat: string): boolean {
  const ende = monatsende(monat);
  if (l.turnus === 'einmalig') return l.beginn >= monat && l.beginn <= ende;
  return l.beginn <= ende && (l.ende === null || l.ende >= monat);
}

export type MonatsSumme = {
  monat: string; betrieb_cent: number; eigen_cent: number;
  jeArt: Record<string, number>; jeBehandlung: Record<string, number>; anzahl: number;
};

/** Kosten des Betriebs je Monat (Summe in Cent), aufgeteilt nach Art und Lohn-Hinweis; Eigenanteile getrennt. */
export function kostenJeMonat(leistungen: Leistung[], von: string, bis: string): MonatsSumme[] {
  return monate(von, bis).map((monat) => {
    const s: MonatsSumme = { monat, betrieb_cent: 0, eigen_cent: 0, jeArt: {}, jeBehandlung: {}, anzahl: 0 };
    for (const l of leistungen) {
      if (!imMonat(l, monat)) continue;
      const b = Math.trunc(Number(l.betrag_cent) || 0), e = Math.trunc(Number(l.eigenanteil_cent) || 0);
      s.betrieb_cent += b; s.eigen_cent += e; s.anzahl += 1;
      s.jeArt[l.art] = (s.jeArt[l.art] ?? 0) + b;
      s.jeBehandlung[l.lohn_behandlung] = (s.jeBehandlung[l.lohn_behandlung] ?? 0) + b;
    }
    return s;
  });
}

function tageZwischen(a: string, b: string): number {
  const [j1, m1, t1] = a.split('-').map(Number), [j2, m2, t2] = b.split('-').map(Number);
  return Math.round((Date.UTC(j2, m2 - 1, t2) - Date.UTC(j1, m1 - 1, t1)) / 86_400_000);
}

export type Ampel = { stufe: 'abgelaufen' | 'bald' | 'ok' | 'keine'; tage: number | null; was: 'laufzeit' | 'nachweis' | null };

/** Früheste Frist aus Laufzeit-Ende und „Nachweis gültig bis“: abgelaufen / bald (≤ 30 Tage) / ok / keine. */
export function fristAmpel(l: Pick<Leistung, 'ende' | 'nachweis_bis' | 'turnus'>, heute: string): Ampel {
  const kandidaten: { tag: string; was: 'laufzeit' | 'nachweis' }[] = [];
  if (l.turnus !== 'einmalig' && l.ende) kandidaten.push({ tag: l.ende, was: 'laufzeit' });
  if (l.nachweis_bis) kandidaten.push({ tag: l.nachweis_bis, was: 'nachweis' });
  if (!kandidaten.length) return { stufe: 'keine', tage: null, was: null };
  kandidaten.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const k = kandidaten[0];
  const tage = tageZwischen(heute, k.tag);
  return { stufe: tage < 0 ? 'abgelaufen' : tage <= BALD_TAGE ? 'bald' : 'ok', tage, was: k.was };
}

/** Läuft die Leistung heute? (einmalige zählen nur im Monat ihres Beginns als „aktiv“) */
export function aktiv(l: Leistung, heute: string): boolean {
  if (l.turnus === 'einmalig') return monatVon(l.beginn) === monatVon(heute);
  return l.beginn <= heute && (l.ende === null || l.ende >= heute);
}

/** Erinnerungstag: 30 Tage vor der Frist, frühestens heute. */
export function erinnerungsTag(frist: string, heute: string): string {
  const [j, m, t] = frist.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t - BALD_TAGE)).toISOString().slice(0, 10);
  return d < heute ? heute : d;
}

/** Zeilen für die Lohnabrechnung eines Monats (Hinweis, keine Berechnung von Steuern oder Beiträgen). */
export function lohnListe(leistungen: (Leistung & { stb_bestaetigt_am?: string | null })[], monat: string): {
  person: string; art: string; betrieb_cent: number; eigen_cent: number; behandlung: string; bestaetigt: string | null;
}[] {
  return leistungen
    .filter((l) => imMonat(l, monat))
    .map((l) => ({
      person: l.person_name, art: l.art, betrieb_cent: Math.trunc(Number(l.betrag_cent) || 0),
      eigen_cent: Math.trunc(Number(l.eigenanteil_cent) || 0), behandlung: l.lohn_behandlung, bestaetigt: l.stb_bestaetigt_am ?? null,
    }))
    .sort((a, b) => a.person.localeCompare(b.person, 'de') || a.art.localeCompare(b.art));
}

/** Ganze Cent als Eingabe-/CSV-Text ohne Tausenderpunkt: 2900 -> "29,00". */
export function centText(c: number): string {
  const n = Math.trunc(Number(c) || 0);
  return `${n < 0 ? '-' : ''}${Math.trunc(Math.abs(n) / 100)},${String(Math.abs(n) % 100).padStart(2, '0')}`;
}

/** CSV (Semikolon, deutsche Beträge) für das Steuerbüro. */
export function lohnCsv(zeilen: ReturnType<typeof lohnListe>, monat: string): string {
  const betrag = centText;
  const art = (k: string) => ARTEN.find((a) => a.key === k)?.label ?? k;
  const beh = (k: string) => BEHANDLUNG.find((b) => b.key === k)?.label ?? k;
  const feld = (s: string) => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const kopf = 'Monat;Mitarbeiter;Leistung;Betrag Betrieb (EUR);Eigenanteil Mitarbeiter (EUR);Hinweis Lohnabrechnung;Steuerberater bestaetigt am';
  return [kopf, ...zeilen.map((z) => [monat.slice(0, 7), feld(z.person), feld(art(z.art)), betrag(z.betrieb_cent), betrag(z.eigen_cent), feld(beh(z.behandlung)), z.bestaetigt ?? ''].join(';'))].join('\r\n');
}
