// ============================================================================
// ARGONAUT OS · lib/motorsport.ts — T1 Trackday, Rennschule, Kartbahn (Paket 296)
//
// Event mit Startgruppen und Startplätzen, Teilnehmer mit eigenem Fahrzeug
// oder Leihfahrzeug aus der Mietflotte (V1), Haftungsverzicht über das
// Signatur-Modul, Startfreigabe, Sponsoren und Gäste mit Akkreditierung,
// Teile mit Laufzeit (Stunden/Runden) je Leihfahrzeug, Rechnung.
//
// Die Datenbank (supabase-sql/p296-motorsport.sql) prüft alles noch einmal —
// die Regeln hier spiegeln sie, damit die Seite vorher sagt, was fehlt.
//
// HAFTUNGSVERZICHT: ARGONAUT liefert bewusst KEINEN Mustertext. Der Betrieb
// trägt seinen eigenen, anwaltlich geprüften Text ein.
//
// Geld in ganzen Cent (netto), 19 % bzw. Kleinunternehmer 0 %. Keine Preise
// im Code. Rein (nur lib/zahlen), node-getestet (tests/motorsportP296).
// ============================================================================

import { leseZahl, inCent, rundeStellen } from './zahlen';

// ------------------------------------------------------------ Listen ---
export const MS_ARTEN = [
  { key: 'trackday', label: 'Trackday / Freies Fahren' },
  { key: 'rennschule', label: 'Rennschule / Lehrgang' },
  { key: 'kart', label: 'Kartbahn / Kart-Event' },
  { key: 'fahrertraining', label: 'Fahrsicherheitstraining' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const;

export const EVENT_STATUS: Record<string, string> = {
  geplant: 'geplant', offen: 'Anmeldung offen', abgesagt: 'abgesagt', beendet: 'beendet',
};
const EVENT_WEGE: Record<string, readonly string[]> = {
  geplant: ['offen', 'abgesagt', 'beendet'],
  offen: ['geplant', 'abgesagt', 'beendet'],
  abgesagt: [], beendet: [],
};
export function eventWeiter(alt: string): readonly string[] { return EVENT_WEGE[alt] ?? []; }

export const TN_STATUS: Record<string, string> = {
  angemeldet: 'angemeldet', bestaetigt: 'bestätigt', warteliste: 'Warteliste',
  freigegeben: 'startfreigegeben', teilgenommen: 'teilgenommen', storniert: 'storniert',
};
/** Status, die einen Startplatz belegen (wie die Datenbank). */
export const BELEGEND: readonly string[] = ['angemeldet', 'bestaetigt', 'freigegeben', 'teilgenommen'];
const TN_WEGE: Record<string, readonly string[]> = {
  angemeldet: ['bestaetigt', 'warteliste', 'storniert'],
  warteliste: ['angemeldet', 'bestaetigt', 'storniert'],
  bestaetigt: ['angemeldet', 'warteliste', 'freigegeben', 'storniert'],
  freigegeben: ['bestaetigt', 'teilgenommen', 'storniert'],
  teilgenommen: [], storniert: [],
};
export function tnWeiter(alt: string): readonly string[] { return TN_WEGE[alt] ?? []; }

export const GAST_ARTEN = [
  { key: 'sponsor', label: 'Sponsor' }, { key: 'gast', label: 'Gast' },
  { key: 'presse', label: 'Presse' }, { key: 'helfer', label: 'Helfer / Streckenposten' },
] as const;
export const BEREICHE = [
  { key: 'tribuene', label: 'Tribüne / Zuschauer' },
  { key: 'fahrerlager', label: 'Fahrerlager' },
  { key: 'boxengasse', label: 'Boxengasse (nur mit Verzicht)' },
] as const;
export const TEIL_KATEGORIEN = [
  { key: 'motor', label: 'Motor' }, { key: 'reifen', label: 'Reifen' }, { key: 'bremse', label: 'Bremse' },
  { key: 'kette', label: 'Kette / Antrieb' }, { key: 'kupplung', label: 'Kupplung' }, { key: 'fahrwerk', label: 'Fahrwerk' },
  { key: 'sicherheit', label: 'Sicherheit (Gurt, Käfig, Helm)' }, { key: 'sonstiges', label: 'Sonstiges' },
] as const;
export const EINHEITEN = [{ key: 'stunden', label: 'Betriebsstunden' }, { key: 'runden', label: 'Runden' }] as const;

export function label(liste: readonly { key: string; label: string }[], k: string | null | undefined): string {
  return liste.find((x) => x.key === k)?.label ?? (k || '—');
}

// ------------------------------------------------------------ Helfer ---
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(x: unknown): x is string { return typeof x === 'string' && UUID.test(x); }

function text(roh: unknown, max: number): string | null {
  const t = String(roh ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  return t || null;
}
function ganz(roh: unknown, min: number, max: number): number | null | typeof NaN {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  const n = leseZahl(s);
  if (n === null || !Number.isInteger(n) || n < min || n > max) return NaN;
  return n;
}
export function istTag(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [j, m, t] = x.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Euro-Eingabe („249,00", „1.250") → ganze Cent. Leer → null; ungültig → NaN. */
export function euroInCent(roh: unknown): number | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  const n = leseZahl(s);
  if (n === null || n < 0 || n > 1_000_000) return NaN;
  return inCent(n);
}

// -------------------------------------------------------------- Zeit ---
function berlinTeile(ms: number): { j: number; m: number; t: number; h: number; mi: number } {
  const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const w = (typ: string) => Number(teile.find((p) => p.type === typ)?.value);
  return { j: w('year'), m: w('month'), t: w('day'), h: w('hour'), mi: w('minute') };
}

/** Berliner Ortszeit „JJJJ-MM-TTTHH:MM" (Eingabefeld) → Zeitpunkt (ISO, UTC). Ungültig → null. */
export function berlinZeitpunkt(lokal: unknown): string | null {
  const m = String(lokal ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [j, mo, t, h, mi] = m.slice(1).map(Number);
  if (!istTag(`${m[1]}-${m[2]}-${m[3]}`) || h > 23 || mi > 59) return null;
  const ziel = Date.UTC(j, mo - 1, t, h, mi);
  let ms = ziel;
  for (let i = 0; i < 3; i++) {
    const b = berlinTeile(ms);
    ms += ziel - Date.UTC(b.j, b.m - 1, b.t, b.h, b.mi);
  }
  return new Date(ms).toISOString();
}

/** Zeitpunkt → Berliner Ortszeit fürs Eingabefeld (JJJJ-MM-TTTHH:MM). */
export function berlinLokal(iso: unknown): string {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const b = berlinTeile(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${b.j}-${p(b.m)}-${p(b.t)}T${p(b.h)}:${p(b.mi)}`;
}

/** Kalendertag in Berlin (JJJJ-MM-TT) eines Zeitpunkts. */
export function berlinTagVon(iso: unknown): string {
  const l = berlinLokal(iso);
  return l ? l.slice(0, 10) : '';
}

/** „10.11.2026, 08:00" */
export function wannText(iso: unknown): string {
  const l = berlinLokal(iso);
  if (!l) return '—';
  return `${l.slice(8, 10)}.${l.slice(5, 7)}.${l.slice(0, 4)}, ${l.slice(11, 16)}`;
}
/** „10.11.2026, 08:00–18:00" bzw. über mehrere Tage mit beiden Daten. */
export function zeitraumText(beginn: unknown, ende: unknown): string {
  const a = berlinLokal(beginn); const b = berlinLokal(ende);
  if (!a || !b) return '—';
  return a.slice(0, 10) === b.slice(0, 10) ? `${wannText(beginn)}–${b.slice(11, 16)}` : `${wannText(beginn)} bis ${wannText(ende)}`;
}
export function datumDe(tag: string | null | undefined): string {
  if (!tag || !istTag(tag.slice(0, 10))) return '—';
  const [j, m, t] = tag.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

// ------------------------------------------------------------- Event ---
export type EventForm = {
  titel: string; art: string; strecke: string; beginn: string; ende: string; status?: string;
  mindestalter: string; fuehrerscheinPflicht: boolean; briefingPflicht: boolean; notiz: string;
};
export const MAX_EVENT_MS = 14 * 24 * 3_600_000;

export function eventPruefen(f: EventForm, neu: boolean): { ok: true; zeile: Record<string, unknown> } | { ok: false; grund: string } {
  const titel = text(f.titel, 160);
  if (!titel || titel.length < 3) return { ok: false, grund: 'Bitte einen Titel mit mindestens 3 Zeichen eingeben.' };
  if (!MS_ARTEN.some((a) => a.key === f.art)) return { ok: false, grund: 'Bitte die Art des Events wählen.' };
  const beginn = berlinZeitpunkt(f.beginn);
  const ende = berlinZeitpunkt(f.ende);
  if (!beginn || !ende) return { ok: false, grund: 'Bitte Beginn und Ende mit Datum und Uhrzeit eingeben.' };
  const dauer = Date.parse(ende) - Date.parse(beginn);
  if (dauer <= 0) return { ok: false, grund: 'Das Ende muss nach dem Beginn liegen.' };
  if (dauer > MAX_EVENT_MS) return { ok: false, grund: 'Ein Event dauert höchstens 14 Tage.' };
  const alter = ganz(f.mindestalter || '0', 0, 99);
  if (alter === null || Number.isNaN(alter)) return { ok: false, grund: 'Mindestalter: ganze Zahl von 0 bis 99.' };
  const zeile: Record<string, unknown> = {
    titel, art: f.art, strecke: text(f.strecke, 160), beginn, ende, mindestalter: alter,
    fuehrerschein_pflicht: !!f.fuehrerscheinPflicht, briefing_pflicht: !!f.briefingPflicht, notiz: text(f.notiz, 1000),
  };
  if (neu) zeile.status = f.status === 'offen' ? 'offen' : 'geplant';
  return { ok: true, zeile };
}

export const VERZICHT_MIN = 50;
export const VERZICHT_MAX = 20000;
/** Eigener Text des Betriebs — nur Länge wird geprüft, kein Mustertext. */
export function verzichtPruefen(roh: unknown): { ok: true; text: string } | { ok: false; grund: string } {
  const t = String(roh ?? '').replace(/\r\n/g, '\n').trim();
  if (t.length < VERZICHT_MIN) return { ok: false, grund: `Bitte Ihren vollständigen Text eintragen (mindestens ${VERZICHT_MIN} Zeichen).` };
  if (t.length > VERZICHT_MAX) return { ok: false, grund: `Der Text ist zu lang (höchstens ${VERZICHT_MAX.toLocaleString('de-DE')} Zeichen).` };
  return { ok: true, text: t };
}

// ------------------------------------------------------------ Steuer ---
/** Steuer auf eine Netto-Summe in Cent — wie steuerGruppen: cent(netto * (satz / 100)). */
export function steuerCent(nettoCent: number, satz: number): number {
  return inCent((nettoCent / 100) * (satz / 100));
}
/** Netto zu einem Brutto-Preis (19 %); exakt = false, wenn der Brutto-Cent-Betrag mit 19 % nicht genau erreichbar ist. */
export function nettoAusBrutto(bruttoCent: number): { netto_cent: number; exakt: boolean } {
  const b = Math.max(0, Math.floor(bruttoCent));
  const n0 = Math.round(b / 1.19);
  for (const d of [0, -1, 1, -2, 2]) {
    const n = n0 + d;
    if (n >= 0 && n + steuerCent(n, 19) === b) return { netto_cent: n, exakt: true };
  }
  return { netto_cent: n0, exakt: false };
}
/** Endpreis für Teilnehmer (inkl. 19 % bzw. Kleinunternehmer ohne USt). */
export function bruttoCent(nettoCent: number, kleinunternehmer: boolean): number {
  return kleinunternehmer ? nettoCent : nettoCent + steuerCent(nettoCent, 19);
}

// ------------------------------------------------------------ Gruppe ---
export type GruppeForm = { name: string; startplaetze: string; startgeld: string; brutto: boolean; reihenfolge?: string };
export function gruppePruefen(f: GruppeForm, kleinunternehmer: boolean): { ok: true; zeile: { name: string; startplaetze: number; startgeld_netto_cent: number; reihenfolge: number }; exakt: boolean } | { ok: false; grund: string } {
  const name = text(f.name, 60);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte einen Gruppennamen eingeben (z. B. „Einsteiger“).' };
  const plaetze = ganz(f.startplaetze, 1, 500);
  if (plaetze === null || Number.isNaN(plaetze)) return { ok: false, grund: 'Startplätze: ganze Zahl von 1 bis 500.' };
  const c = euroInCent(f.startgeld || '0');
  if (c === null || Number.isNaN(c) || c > 10_000_000) return { ok: false, grund: 'Bitte ein gültiges Startgeld eingeben (0 für kostenlos).' };
  const reihe = ganz(f.reihenfolge || '0', 0, 99);
  if (reihe === null || Number.isNaN(reihe)) return { ok: false, grund: 'Reihenfolge: 0 bis 99.' };
  const nb = f.brutto && !kleinunternehmer ? nettoAusBrutto(c as number) : { netto_cent: c as number, exakt: true };
  return { ok: true, zeile: { name, startplaetze: plaetze as number, startgeld_netto_cent: nb.netto_cent, reihenfolge: reihe as number }, exakt: nb.exakt };
}

export type TnKurz = {
  id: string; gruppe_id: string; status: string; startnummer: number | null; miet_fahrzeug_id: string | null;
};
/** Belegte Startplätze einer Gruppe (wie die Datenbank). */
export function belegt(tns: readonly TnKurz[], gruppeId: string, ohneId?: string): number {
  return tns.filter((t) => t.gruppe_id === gruppeId && t.id !== ohneId && BELEGEND.includes(t.status)).length;
}
export function frei(gruppe: { id: string; startplaetze: number }, tns: readonly TnKurz[], ohneId?: string): number {
  return Math.max(0, gruppe.startplaetze - belegt(tns, gruppe.id, ohneId));
}
/** Kleinste freie Startnummer (stornierte zählen nicht). */
export function naechsteStartnummer(tns: readonly TnKurz[]): number {
  const vergeben = new Set(tns.filter((t) => t.status !== 'storniert' && t.startnummer).map((t) => t.startnummer as number));
  let n = 1;
  while (vergeben.has(n) && n < 9999) n += 1;
  return n;
}
/** Leihfahrzeuge, die in diesem Event schon vergeben sind (ohne Warteliste/Storno). */
export function vergebeneLeih(tns: readonly TnKurz[], ohneId?: string): Set<string> {
  return new Set(tns.filter((t) => t.id !== ohneId && t.miet_fahrzeug_id && !['storniert', 'warteliste'].includes(t.status)).map((t) => t.miet_fahrzeug_id as string));
}

// -------------------------------------------------------- Teilnehmer ---
export type TnForm = {
  name: string; email: string; telefon: string; kontaktId: string; minderjaehrig: boolean; sorgeberechtigt: string;
  startnummer: string; fahrzeugArt: string; eigenesFahrzeug: string; mietFahrzeugId: string; leihPreis: string; leihBrutto: boolean; notiz: string;
};
export function teilnehmerPruefen(f: TnForm, kleinunternehmer: boolean): { ok: true; zeile: Record<string, unknown>; exakt: boolean } | { ok: false; grund: string } {
  const name = text(f.name, 120);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte den Namen des Teilnehmers eingeben.' };
  const email = text(f.email, 160);
  if (email && !EMAIL.test(email)) return { ok: false, grund: 'Die E-Mail-Adresse sieht nicht gültig aus.' };
  const telefon = text(f.telefon, 40);
  if (f.kontaktId && !istUuid(f.kontaktId)) return { ok: false, grund: 'Kontakt ungültig.' };
  const sorge = text(f.sorgeberechtigt, 120);
  if (f.minderjaehrig && (!sorge || sorge.length < 2)) return { ok: false, grund: 'Bei Minderjährigen bitte die sorgeberechtigte Person eintragen — sie unterschreibt den Verzicht.' };
  const nr = ganz(f.startnummer, 1, 9999);
  if (Number.isNaN(nr)) return { ok: false, grund: 'Startnummer: ganze Zahl von 1 bis 9999.' };
  if (f.fahrzeugArt !== 'eigen' && f.fahrzeugArt !== 'leih') return { ok: false, grund: 'Bitte wählen: eigenes Fahrzeug oder Leihfahrzeug.' };
  let leih = 0; let exakt = true;
  if (f.fahrzeugArt === 'leih') {
    if (!istUuid(f.mietFahrzeugId)) return { ok: false, grund: 'Bitte ein Leihfahrzeug aus Ihrer Mietflotte wählen.' };
    const c = euroInCent(f.leihPreis || '0');
    if (c === null || Number.isNaN(c) || c > 10_000_000) return { ok: false, grund: 'Bitte einen gültigen Preis fürs Leihfahrzeug eingeben (0 für inklusive).' };
    const nb = f.leihBrutto && !kleinunternehmer ? nettoAusBrutto(c as number) : { netto_cent: c as number, exakt: true };
    leih = nb.netto_cent; exakt = nb.exakt;
  }
  return {
    ok: true, exakt,
    zeile: {
      name, email, telefon, kontakt_id: f.kontaktId || null,
      minderjaehrig: !!f.minderjaehrig, sorgeberechtigt_name: f.minderjaehrig ? sorge : null,
      startnummer: nr, fahrzeug_art: f.fahrzeugArt,
      eigenes_fahrzeug: f.fahrzeugArt === 'eigen' ? text(f.eigenesFahrzeug, 120) : null,
      miet_fahrzeug_id: f.fahrzeugArt === 'leih' ? f.mietFahrzeugId : null,
      leih_netto_cent: leih, notiz: text(f.notiz, 1000),
    },
  };
}

export type TnVoll = TnKurz & {
  name: string; minderjaehrig: boolean; sorgeberechtigt_name: string | null; email: string | null;
  fahrzeug_art: string; eigenes_fahrzeug: string | null; alter_geprueft: boolean; fuehrerschein_geprueft: boolean; briefing: boolean;
  verzicht_token: string | null; startgeld_netto_cent: number; leih_netto_cent: number; rechnung_id: string | null;
};
export type EventKurz = {
  id: string; titel: string; art: string; strecke: string | null; beginn: string; ende: string; status: string;
  mindestalter: number; fuehrerschein_pflicht: boolean; briefing_pflicht: boolean; verzicht_text: string | null; verzicht_fest?: boolean;
};

/** Was fehlt noch zur Startfreigabe? Leer = freigabebereit (gleiche Reihenfolge wie die Datenbank). */
export function freigabeFehlt(t: TnVoll, ev: EventKurz, signiert: boolean): string[] {
  const f: string[] = [];
  if (ev.status === 'abgesagt' || ev.status === 'beendet') f.push(`Event ${EVENT_STATUS[ev.status]}`);
  if (t.status !== 'bestaetigt') f.push('Anmeldung zuerst bestätigen');
  if (!t.startnummer) f.push('Startnummer');
  if (!t.verzicht_token) f.push('Haftungsverzicht versenden');
  else if (!signiert) f.push('Haftungsverzicht unterschreiben lassen');
  if (ev.mindestalter > 0 && !t.alter_geprueft) f.push(`Alter (ab ${ev.mindestalter}) prüfen`);
  if (ev.fuehrerschein_pflicht && !t.fuehrerschein_geprueft) f.push('Führerschein prüfen');
  if (ev.briefing_pflicht && !t.briefing) f.push('Fahrerbesprechung');
  if (t.fahrzeug_art === 'eigen' && !(t.eigenes_fahrzeug ?? '').trim()) f.push('eigenes Fahrzeug eintragen');
  return f;
}

/** Wer unterschreibt den Verzicht? Bei Minderjährigen die sorgeberechtigte Person. */
export function verzichtEmpfaenger(t: { name: string; email: string | null; minderjaehrig: boolean; sorgeberechtigt_name: string | null }): { name: string; email: string | null; hinweis: string | null } {
  if (t.minderjaehrig && t.sorgeberechtigt_name) {
    return { name: t.sorgeberechtigt_name, email: t.email, hinweis: `für ${t.name} (minderjährig)` };
  }
  return { name: t.name, email: t.email, hinweis: null };
}

/** Dokument zur Unterschrift: Kopf mit Event und Person, dann der EIGENE Text des Betriebs unverändert. */
export function verzichtDokument(o: {
  betrieb: string; event: EventKurz; person: string; rolle: 'teilnehmer' | 'gast'; minderjaehrig?: boolean; sorgeberechtigt?: string | null;
  startnummer?: number | null; fahrzeug?: string | null; bereich?: string | null;
}): string {
  const z: string[] = [
    `Veranstalter: ${o.betrieb || '—'}`,
    `Veranstaltung: ${o.event.titel} (${label(MS_ARTEN, o.event.art)})`,
    `Strecke / Ort: ${o.event.strecke || '—'}`,
    `Zeitraum: ${zeitraumText(o.event.beginn, o.event.ende)}`,
  ];
  if (o.rolle === 'teilnehmer') {
    z.push(`Teilnehmer: ${o.person}${o.startnummer ? ` · Startnummer ${o.startnummer}` : ''}`);
    if (o.fahrzeug) z.push(`Fahrzeug: ${o.fahrzeug}`);
    if (o.minderjaehrig) z.push(`Minderjährig — es unterschreibt die sorgeberechtigte Person: ${o.sorgeberechtigt || '—'}`);
  } else {
    z.push(`Gast: ${o.person}${o.bereich ? ` · Bereich: ${label(BEREICHE, o.bereich)}` : ''}`);
  }
  z.push('', '— — —', '', String(o.event.verzicht_text ?? '').trim());
  return z.join('\n');
}

// ------------------------------------------------------- Gäste ---
export type GastForm = { art: string; name: string; firma: string; email: string; personen: string; bereich: string; leistung: string; betrag: string; notiz: string };
export function gastPruefen(f: GastForm): { ok: true; zeile: Record<string, unknown> } | { ok: false; grund: string } {
  if (!GAST_ARTEN.some((a) => a.key === f.art)) return { ok: false, grund: 'Bitte die Art wählen.' };
  const name = text(f.name, 120);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte einen Namen eingeben.' };
  const email = text(f.email, 160);
  if (email && !EMAIL.test(email)) return { ok: false, grund: 'Die E-Mail-Adresse sieht nicht gültig aus.' };
  const personen = ganz(f.personen || '1', 1, 50);
  if (personen === null || Number.isNaN(personen)) return { ok: false, grund: 'Personen: 1 bis 50.' };
  if (!BEREICHE.some((b) => b.key === f.bereich)) return { ok: false, grund: 'Bitte den Bereich wählen.' };
  const betrag = euroInCent(f.betrag);
  if (Number.isNaN(betrag)) return { ok: false, grund: 'Bitte einen gültigen Betrag eingeben oder das Feld leer lassen.' };
  return {
    ok: true,
    zeile: {
      art: f.art, name, firma: text(f.firma, 160), email, personen, bereich: f.bereich,
      leistung: text(f.leistung, 500), betrag_netto_cent: f.art === 'sponsor' ? betrag : null, notiz: text(f.notiz, 1000),
    },
  };
}
/** Grund, warum (noch) nicht akkreditiert werden kann — sonst null. */
export function akkreditierFehlt(g: { bereich: string; verzicht_token: string | null; akkreditiert_am: string | null }, signiert: boolean): string | null {
  if (g.akkreditiert_am) return 'bereits akkreditiert';
  if (g.bereich === 'boxengasse' && (!g.verzicht_token || !signiert)) return 'Boxengasse: Haftungsverzicht muss unterschrieben sein';
  return null;
}

// ------------------------------------------------ Teile mit Laufzeit ---
export type TeilForm = { mietFahrzeugId: string; bezeichnung: string; kategorie: string; seriennummer: string; einheit: string; grenze: string; startwert: string; eingebautAm: string; notiz: string };
export function teilPruefen(f: TeilForm, heute: string): { ok: true; zeile: Record<string, unknown> } | { ok: false; grund: string } {
  if (!istUuid(f.mietFahrzeugId)) return { ok: false, grund: 'Bitte das Fahrzeug wählen.' };
  const bez = text(f.bezeichnung, 80);
  if (!bez || bez.length < 2) return { ok: false, grund: 'Bitte das Teil benennen (z. B. „Motor“, „Slicks Satz 3“).' };
  if (!TEIL_KATEGORIEN.some((k) => k.key === f.kategorie)) return { ok: false, grund: 'Bitte die Kategorie wählen.' };
  if (!EINHEITEN.some((e) => e.key === f.einheit)) return { ok: false, grund: 'Bitte wählen: Stunden oder Runden.' };
  const grenze = leseZahl(f.grenze);
  if (grenze === null || grenze <= 0 || grenze > 100000) return { ok: false, grund: 'Bitte die Laufzeit-Grenze eingeben (größer als 0).' };
  const start = String(f.startwert ?? '').trim() ? leseZahl(f.startwert) : 0;
  if (start === null || start < 0 || start > 100000) return { ok: false, grund: 'Laufzeit beim Einbau: 0 oder mehr.' };
  if (!istTag(f.eingebautAm) || f.eingebautAm > heute) return { ok: false, grund: 'Bitte ein gültiges Einbaudatum (nicht in der Zukunft).' };
  const runden = f.einheit === 'runden';
  if (runden && (!Number.isInteger(grenze) || !Number.isInteger(start))) return { ok: false, grund: 'Runden bitte als ganze Zahlen.' };
  return {
    ok: true,
    zeile: {
      miet_fahrzeug_id: f.mietFahrzeugId, bezeichnung: bez, kategorie: f.kategorie, seriennummer: text(f.seriennummer, 60), einheit: f.einheit,
      grenze: rundeStellen(grenze, 2), startwert: rundeStellen(start, 2), eingebaut_am: f.eingebautAm, notiz: text(f.notiz, 500),
    },
  };
}

export type EinsatzForm = { mietFahrzeugId: string; eventId: string; datum: string; stunden: string; runden: string; notiz: string };
export function einsatzPruefen(f: EinsatzForm, heute: string): { ok: true; zeile: Record<string, unknown> } | { ok: false; grund: string } {
  if (!istUuid(f.mietFahrzeugId)) return { ok: false, grund: 'Bitte das Fahrzeug wählen.' };
  if (f.eventId && !istUuid(f.eventId)) return { ok: false, grund: 'Event ungültig.' };
  if (!istTag(f.datum) || f.datum > heute) return { ok: false, grund: 'Bitte ein gültiges Datum (nicht in der Zukunft).' };
  const std = String(f.stunden ?? '').trim() ? leseZahl(f.stunden) : 0;
  if (std === null || std < 0 || std > 48) return { ok: false, grund: 'Stunden: 0 bis 48 (z. B. 1,5).' };
  const rd = ganz(f.runden || '0', 0, 5000);
  if (rd === null || Number.isNaN(rd)) return { ok: false, grund: 'Runden: ganze Zahl von 0 bis 5000.' };
  if (std <= 0 && (rd as number) <= 0) return { ok: false, grund: 'Bitte Stunden oder Runden eintragen.' };
  return { ok: true, zeile: { miet_fahrzeug_id: f.mietFahrzeugId, event_id: f.eventId || null, datum: f.datum, stunden: rundeStellen(std, 2), runden: rd, notiz: text(f.notiz, 300) } };
}

export type Teil = { id: string; miet_fahrzeug_id: string; einheit: string; grenze: number | string; startwert: number | string; eingebaut_am: string; ausgebaut_am: string | null };
export type Einsatz = { miet_fahrzeug_id: string; datum: string; stunden: number | string; runden: number | string };
export type Laufzeit = { verbraucht: number; rest: number; anteil: number; ampel: 'ueber' | 'bald' | 'ok' };
export const BALD_AB = 0.8;

/** Laufzeit eines Teils: Startwert + Einsätze desselben Fahrzeugs ab Einbau (bis Tausch, jeweils einschließlich). */
export function laufzeit(t: Teil, einsaetze: readonly Einsatz[]): Laufzeit {
  const grenze = leseZahl(t.grenze) ?? 0;
  let summe = leseZahl(t.startwert) ?? 0;
  for (const e of einsaetze) {
    if (e.miet_fahrzeug_id !== t.miet_fahrzeug_id) continue;
    if (e.datum < t.eingebaut_am) continue;
    if (t.ausgebaut_am && e.datum > t.ausgebaut_am) continue;
    summe += (t.einheit === 'runden' ? leseZahl(e.runden) : leseZahl(e.stunden)) ?? 0;
  }
  const verbraucht = rundeStellen(summe, 2);
  const rest = rundeStellen(grenze - verbraucht, 2);
  const anteil = grenze > 0 ? verbraucht / grenze : 0;
  return { verbraucht, rest, anteil, ampel: anteil >= 1 ? 'ueber' : anteil >= BALD_AB ? 'bald' : 'ok' };
}
export function laufzeitText(wert: number, einheit: string): string {
  const z = wert.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  return einheit === 'runden' ? `${z} Runden` : `${z} h`;
}

// ---------------------------------------------------------- Rechnung ---
export type Posten = { bezeichnung: string; menge: number; einheit: string; einzelpreis_cent: number; summe_cent: number };
export function tnRechnungMoeglich(t: { status: string; startgeld_netto_cent: number; leih_netto_cent: number }): { ok: true } | { ok: false; grund: string } {
  if (t.status === 'warteliste' || t.status === 'storniert') return { ok: false, grund: 'Für Warteliste und Stornierungen entsteht keine Rechnung.' };
  if ((t.startgeld_netto_cent || 0) + (t.leih_netto_cent || 0) <= 0) return { ok: false, grund: 'Kein abrechenbarer Betrag (Startplatz kostenlos).' };
  return { ok: true };
}
export function tnPosten(t: { startgeld_netto_cent: number; leih_netto_cent: number; startnummer: number | null }, ev: { titel: string; beginn: string; strecke: string | null }, gruppe: string, leihFahrzeug: string | null): Posten[] {
  const tag = datumDe(berlinTagVon(ev.beginn));
  const p: Posten[] = [];
  if (t.startgeld_netto_cent > 0) {
    p.push({
      bezeichnung: `Startplatz ${ev.titel} am ${tag}${ev.strecke ? `, ${ev.strecke}` : ''} — Gruppe ${gruppe}${t.startnummer ? `, Startnummer ${t.startnummer}` : ''}`.slice(0, 300),
      menge: 1, einheit: 'Startplatz', einzelpreis_cent: t.startgeld_netto_cent, summe_cent: t.startgeld_netto_cent,
    });
  }
  if (t.leih_netto_cent > 0) {
    p.push({ bezeichnung: `Leihfahrzeug ${leihFahrzeug || ''} für ${ev.titel} am ${tag}`.replace(/\s+/g, ' ').slice(0, 300), menge: 1, einheit: 'Event', einzelpreis_cent: t.leih_netto_cent, summe_cent: t.leih_netto_cent });
  }
  return p;
}
export function summe(p: readonly Posten[], satz: number): { netto_cent: number; steuer_cent: number; brutto_cent: number } {
  const n = p.reduce((s, x) => s + x.summe_cent, 0);
  const st = steuerCent(n, satz);
  return { netto_cent: n, steuer_cent: st, brutto_cent: n + st };
}

// ------------------------------------------------------- Kennzahlen ---
export function kennzahlen(events: readonly { id: string; status: string; beginn: string; ende: string }[], tns: readonly { event_id?: string; status: string; startgeld_netto_cent: number; leih_netto_cent: number }[], jetztMs: number): {
  kommend: number; teilnehmer: number; warteliste: number; umsatzNetto: number;
} {
  const kommend = events.filter((e) => (e.status === 'geplant' || e.status === 'offen') && Date.parse(e.ende) >= jetztMs);
  const ids = new Set(kommend.map((e) => e.id));
  const imKommenden = tns.filter((t) => t.event_id && ids.has(t.event_id));
  return {
    kommend: kommend.length,
    teilnehmer: imKommenden.filter((t) => BELEGEND.includes(t.status)).length,
    warteliste: imKommenden.filter((t) => t.status === 'warteliste').length,
    umsatzNetto: tns.filter((t) => BELEGEND.includes(t.status)).reduce((s, t) => s + (t.startgeld_netto_cent || 0) + (t.leih_netto_cent || 0), 0),
  };
}
