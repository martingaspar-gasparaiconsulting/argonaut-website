// ============================================================================
// ARGONAUT OS · lib/fahrzeugMiete.ts — V1 Fahrzeugvermietung Kern (Paket 291/292)
//
// Für Autovermietung, Luxus-, Wohnmobil-, Transporter-, Motorrad- und
// E-Bike-Verleih: Mietflotte, Buchung ohne Doppelbuchung, Fahrer-Prüfung
// (Mindestalter, Führerschein-Dauer, Klasse, Gültigkeit — OHNE Nummer),
// Kaution (nur Art/Status/Vorgangsnummer des Zahlungsanbieters, NIE
// Kartendaten), Übergabe/Rückgabe mit km und Tank in Achteln, Abrechnung.
//
// Geld immer in ganzen Cent (netto). Miettage = angefangene 24 Stunden ab
// Abholung, mit Kulanz-Minuten, die der Betrieb selbst festlegt. Keine Preise
// im Code — alle Sätze trägt der Betrieb ein.
//
// Kaution und Schadenersatz stehen NICHT auf der Rechnung (kein Entgelt für
// eine Leistung) — klären Sie Einzelheiten mit Ihrem Steuerberater.
//
// Rein (nur lib/zahlen, lib/fuehrerscheinKontrolle), node-getestet
// (tests/fahrzeugMieteP291).
// ============================================================================

import { leseZahl, inCent } from './zahlen';
import { klassenLesen, siehtAusWieNummer } from './fuehrerscheinKontrolle';

export const MIET_BUCKET = 'vermietung';
export const STUNDE = 3_600_000;
export const TAG = 24 * STUNDE;

export const ARTEN = [
  { key: 'pkw', label: 'Pkw' },
  { key: 'transporter', label: 'Transporter' },
  { key: 'wohnmobil', label: 'Wohnmobil' },
  { key: 'motorrad', label: 'Motorrad' },
  { key: 'ebike', label: 'E-Bike / Fahrrad' },
  { key: 'luxus', label: 'Luxus / Sportwagen' },
  { key: 'lkw', label: 'Lkw' },
  { key: 'anhaenger', label: 'Anhänger' },
] as const;
export type Art = typeof ARTEN[number]['key'];

export const KAUTION_ARTEN = [
  { key: 'keine', label: 'Keine Kaution' },
  { key: 'bar', label: 'Bar (Quittung)' },
  { key: 'ueberweisung', label: 'Überweisung' },
  { key: 'zahlungsanbieter', label: 'Über Ihren Zahlungsanbieter (Vormerkung auf der Karte)' },
] as const;
export const KAUTION_STATUS: Record<string, string> = {
  offen: 'offen', hinterlegt: 'hinterlegt', freigegeben: 'zurückgegeben', einbehalten: 'einbehalten',
};
export const STATUS: Record<string, string> = {
  reserviert: 'reserviert', uebergeben: 'unterwegs', zurueck: 'zurück', storniert: 'storniert',
};

export const SCHADEN_BEREICHE = [
  { key: 'vorne', label: 'Vorne' }, { key: 'hinten', label: 'Hinten' }, { key: 'links', label: 'Links' },
  { key: 'rechts', label: 'Rechts' }, { key: 'dach', label: 'Dach' }, { key: 'scheiben', label: 'Scheiben' },
  { key: 'felgen_reifen', label: 'Felgen / Reifen' }, { key: 'innenraum', label: 'Innenraum' },
  { key: 'technik', label: 'Technik' }, { key: 'sonstiges', label: 'Sonstiges' },
] as const;
export const SCHADEN_ARTEN = [
  { key: 'kratzer', label: 'Kratzer' }, { key: 'delle', label: 'Delle' }, { key: 'steinschlag', label: 'Steinschlag' },
  { key: 'riss', label: 'Riss / Bruch' }, { key: 'fehlt', label: 'Teil fehlt' }, { key: 'verschmutzung', label: 'Verschmutzung' },
  { key: 'defekt', label: 'Defekt' }, { key: 'sonstiges', label: 'Sonstiges' },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(x: unknown): x is string { return typeof x === 'string' && UUID.test(x); }

export function istIso(x: unknown): x is string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false;
  const [j, m, t] = x.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

function text(roh: unknown, max: number): string | null {
  const t = String(roh ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  return t || null;
}

// ----------------------------------------------------------------- Zeit ---

/** Zeitpunkt lesen (ISO mit Zone oder Millisekunden). Ungültig → null. */
export function zeit(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  if (typeof x !== 'string' || !x) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? t : null;
}

/** Kalendertag in Berlin (YYYY-MM-DD) eines Zeitpunkts. */
export function berlinTag(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Volle Jahre zwischen zwei Kalendertagen (Geburtstag zählt am Tag selbst). */
export function volleJahre(von: string, stichtag: string): number {
  const [j1, m1, t1] = von.split('-').map(Number);
  const [j2, m2, t2] = stichtag.split('-').map(Number);
  let j = j2 - j1;
  if (m2 < m1 || (m2 === m1 && t2 < t1)) j -= 1;
  return j;
}

/**
 * Miettage: jede angefangene 24 Stunden ab Abholung zählt als Tag, mindestens 1.
 * Kulanz: so viele Minuten über einen vollen Tag hinaus zählen noch nicht als
 * neuer Tag (legt der Betrieb fest, 0–180).
 */
export function mietTage(abholung: unknown, rueckgabe: unknown, kulanzMinuten = 0): number {
  const a = zeit(abholung), r = zeit(rueckgabe);
  if (a === null || r === null || r <= a) return 1;
  const k = Math.max(0, Math.min(180, Math.floor(Number(kulanzMinuten) || 0))) * 60_000;
  const dauer = r - a;
  const voll = Math.floor(dauer / TAG);
  const rest = dauer - voll * TAG;
  const tage = rest === 0 || rest <= k ? voll : voll + 1;
  return Math.max(1, tage);
}

/** Abgerechnete Tage: geplanter Zeitraum, bei späterer Rückgabe die tatsächliche (Kulanz beachtet). Frühere Rückgabe mindert nicht. */
export function abrechnungsTage(abholung: unknown, rueckgabePlan: unknown, rueckgabeIst: unknown, kulanzMinuten = 0): number {
  const plan = mietTage(abholung, rueckgabePlan, 0);
  const ist = zeit(rueckgabeIst) === null ? 0 : mietTage(abholung, rueckgabeIst, kulanzMinuten);
  return Math.max(plan, ist);
}

/** Überschneiden sich [aVon,aBis) und [bVon,bBis)? Direkt anschließend ist erlaubt. */
export function ueberschneidet(aVon: number, aBis: number, bVon: number, bBis: number): boolean {
  return aVon < bBis && bVon < aBis;
}

export type BuchungKurz = { id: string; fahrzeug_id: string; abholung: string; rueckgabe_plan: string; status: string; mieter_name?: string | null; nummer?: string | null };

/** Blockiert eine Buchung das Fahrzeug? (wie die Datenbank: reserviert oder unterwegs) */
export function blockiert(b: { status: string }): boolean { return b.status === 'reserviert' || b.status === 'uebergeben'; }

/** Erste kollidierende Buchung für das Fahrzeug im Zeitraum (Vorprüfung — die Datenbank sperrt endgültig). */
export function kollision(buchungen: BuchungKurz[], fahrzeugId: string, von: number, bis: number, ohneId?: string): BuchungKurz | null {
  for (const b of buchungen) {
    if (b.fahrzeug_id !== fahrzeugId || b.id === ohneId || !blockiert(b)) continue;
    const bv = zeit(b.abholung), bb = zeit(b.rueckgabe_plan);
    if (bv === null || bb === null) continue;
    if (ueberschneidet(von, bis, bv, bb)) return b;
  }
  return null;
}

/** Ist die Buchung überfällig (unterwegs, geplante Rückgabe vorbei)? */
export function ueberfaellig(b: { status: string; rueckgabe_plan: string }, jetzt: number): boolean {
  const r = zeit(b.rueckgabe_plan);
  return b.status === 'uebergeben' && r !== null && r < jetzt;
}

/**
 * Kalender: für jeden Tag (YYYY-MM-DD, Berlin) die Buchung, die das Fahrzeug an
 * diesem Tag belegt (erste, die den Tag berührt). Nur blockierende Buchungen.
 */
export function kalenderZeile(buchungen: BuchungKurz[], fahrzeugId: string, tage: string[]): (BuchungKurz | null)[] {
  const eigene = buchungen.filter((b) => b.fahrzeug_id === fahrzeugId && blockiert(b));
  return tage.map((tag) => {
    for (const b of eigene) {
      const a = zeit(b.abholung), r = zeit(b.rueckgabe_plan);
      if (a === null || r === null) continue;
      const von = berlinTag(a), bis = berlinTag(r - 1);
      if (tag >= von && tag <= bis) return b;
    }
    return null;
  });
}

/** n Kalendertage ab start (YYYY-MM-DD). */
export function tageAb(start: string, n: number): string[] {
  const [j, m, t] = start.split('-').map(Number);
  const r: string[] = [];
  for (let i = 0; i < n; i++) r.push(new Date(Date.UTC(j, m - 1, t + i)).toISOString().slice(0, 10));
  return r;
}

// ----------------------------------------------------------------- Geld ---

/** Euro-Eingabe („49,90", „1.250") → ganze Cent. Leer → null; ungültig → NaN. */
export function euroInCent(roh: unknown): number | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  const n = leseZahl(s);
  if (n === null || n < 0 || n > 1_000_000) return NaN;
  return inCent(n);
}

/** Mietpreis in Cent: volle Wochen zum Wochensatz, Resttage zum Tagessatz — die Resttage nie teurer als eine weitere Woche. */
export function mietpreisCent(tage: number, tagCent: number, wocheCent: number | null): number {
  const t = Math.max(0, Math.floor(tage));
  if (wocheCent && wocheCent > 0 && t >= 7) {
    const w = Math.floor(t / 7), rest = t % 7;
    return w * wocheCent + Math.min(rest * tagCent, wocheCent);
  }
  if (wocheCent && wocheCent > 0 && t * tagCent > wocheCent && t < 7) return Math.min(t * tagCent, wocheCent);
  return t * tagCent;
}

/** Frei-km für die Mietdauer (null = unbegrenzt). */
export function freiKm(tage: number, freiKmTag: number | null): number | null {
  return freiKmTag === null || freiKmTag === undefined ? null : Math.max(0, Math.floor(tage)) * freiKmTag;
}

/** Tank in Achteln lesen (0 = leer … 8 = voll). */
export function achtel(roh: unknown): number | null {
  const n = typeof roh === 'number' ? roh : leseZahl(roh);
  return n !== null && Number.isInteger(n) && n >= 0 && n <= 8 ? n : null;
}
export function achtelText(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n === 8) return 'voll';
  if (n === 0) return 'leer';
  return n % 2 === 0 ? `${n / 2}/4` : `${n}/8`;
}

export type MietBuchung = {
  abholung: string; rueckgabe_plan: string; rueckgabe_ist: string | null;
  tagessatz_cent: number; wochensatz_cent: number | null; frei_km_tag: number | null; mehr_km_cent: number;
  zusatzfahrer_tag_cent: number; tank_achtel_cent: number;
  km_start: number | null; km_ende: number | null; tank_start: number | null; tank_ende: number | null;
};
export type Posten = { bezeichnung: string; menge: number; einheit: string; einzelpreis_cent: number; summe_cent: number };

/**
 * Rechnungsposten aus einer zurückgegebenen Miete (netto, Cent):
 * Miete (Wochen + Resttage), Zusatzfahrer je Tag, Mehrkilometer über die
 * Frei-km, Nachtanken je fehlendem Achtel. Kaution und Schäden gehören NICHT
 * auf die Rechnung.
 */
export function abrechnung(b: MietBuchung, zusatzfahrer: number, kulanzMinuten: number, fahrzeug: string): { tage: number; posten: Posten[]; netto_cent: number; gefahren: number | null; frei: number | null; mehrKm: number; fehlAchtel: number } {
  const tage = abrechnungsTage(b.abholung, b.rueckgabe_plan, b.rueckgabe_ist, kulanzMinuten);
  const posten: Posten[] = [];
  const ts = Math.max(0, b.tagessatz_cent || 0), ws = b.wochensatz_cent && b.wochensatz_cent > 0 ? b.wochensatz_cent : null;
  if (ws && tage >= 7) {
    const w = Math.floor(tage / 7), rest = tage % 7;
    if (rest * ts >= ws) {
      posten.push({ bezeichnung: `Miete ${fahrzeug}`, menge: w + 1, einheit: 'Woche', einzelpreis_cent: ws, summe_cent: (w + 1) * ws });
    } else {
      posten.push({ bezeichnung: `Miete ${fahrzeug}`, menge: w, einheit: 'Woche', einzelpreis_cent: ws, summe_cent: w * ws });
      if (rest > 0) posten.push({ bezeichnung: `Miete ${fahrzeug} · weitere Tage`, menge: rest, einheit: 'Tag', einzelpreis_cent: ts, summe_cent: rest * ts });
    }
  } else if (ws && tage * ts > ws) {
    posten.push({ bezeichnung: `Miete ${fahrzeug} (Wochenpreis, ${tage} Tage)`, menge: 1, einheit: 'Woche', einzelpreis_cent: ws, summe_cent: ws });
  } else {
    posten.push({ bezeichnung: `Miete ${fahrzeug}`, menge: tage, einheit: 'Tag', einzelpreis_cent: ts, summe_cent: tage * ts });
  }
  const zf = Math.max(0, Math.floor(zusatzfahrer));
  if (zf > 0 && b.zusatzfahrer_tag_cent > 0) {
    posten.push({ bezeichnung: zf === 1 ? 'Zusatzfahrer' : `Zusatzfahrer (${zf})`, menge: tage * zf, einheit: 'Tag', einzelpreis_cent: b.zusatzfahrer_tag_cent, summe_cent: tage * zf * b.zusatzfahrer_tag_cent });
  }
  const gefahren = b.km_start !== null && b.km_ende !== null && b.km_ende >= b.km_start ? b.km_ende - b.km_start : null;
  const frei = freiKm(tage, b.frei_km_tag);
  const mehrKm = gefahren !== null && frei !== null ? Math.max(0, gefahren - frei) : 0;
  if (mehrKm > 0 && b.mehr_km_cent > 0) {
    posten.push({ bezeichnung: `Mehrkilometer (${gefahren} km gefahren, ${frei} km frei)`, menge: mehrKm, einheit: 'km', einzelpreis_cent: b.mehr_km_cent, summe_cent: mehrKm * b.mehr_km_cent });
  }
  const fehlAchtel = b.tank_start !== null && b.tank_ende !== null ? Math.max(0, b.tank_start - b.tank_ende) : 0;
  if (fehlAchtel > 0 && b.tank_achtel_cent > 0) {
    posten.push({ bezeichnung: `Nachtanken / Nachladen (${achtelText(b.tank_start)} → ${achtelText(b.tank_ende)})`, menge: fehlAchtel, einheit: 'Achtel', einzelpreis_cent: b.tank_achtel_cent, summe_cent: fehlAchtel * b.tank_achtel_cent });
  }
  const gefiltert = posten.filter((p) => p.menge > 0 && p.summe_cent > 0);
  return { tage, posten: gefiltert, netto_cent: gefiltert.reduce((s, p) => s + p.summe_cent, 0), gefahren, frei, mehrKm, fehlAchtel };
}

// --------------------------------------------------------------- Prüfen ---

export type FahrzeugZeile = {
  bezeichnung: string; kennzeichen: string | null; art: Art; fs_klasse: string | null;
  tagessatz_cent: number; wochensatz_cent: number | null; frei_km_tag: number | null; mehr_km_cent: number;
  kaution_cent: number; mindestalter: number; fs_jahre_min: number; zusatzfahrer_tag_cent: number; tank_achtel_cent: number;
  km_stand: number | null; notiz: string | null; aktiv: boolean;
};

function ganz(roh: unknown, min: number, max: number): number | null | typeof NaN {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  const n = leseZahl(s);
  return n !== null && Number.isInteger(n) && n >= min && n <= max ? n : NaN;
}

/** Fahrzeug der Mietflotte prüfen. Euro-Felder als Text, Ergebnis in Cent. */
export function fahrzeugPruefen(o: {
  bezeichnung: unknown; kennzeichen?: unknown; art: unknown; fsKlasse?: unknown; tagessatz: unknown; wochensatz?: unknown; freiKmTag?: unknown;
  mehrKm?: unknown; kaution?: unknown; mindestalter?: unknown; fsJahre?: unknown; zusatzfahrer?: unknown; tankAchtel?: unknown; kmStand?: unknown; notiz?: unknown; aktiv?: unknown;
}): { ok: true; zeile: FahrzeugZeile } | { ok: false; grund: string } {
  const bezeichnung = text(o.bezeichnung, 120);
  if (!bezeichnung || bezeichnung.length < 2) return { ok: false, grund: 'Bitte das Fahrzeug benennen (z. B. „VW Golf Automatik“).' };
  const art = ARTEN.find((a) => a.key === o.art)?.key;
  if (!art) return { ok: false, grund: 'Bitte die Fahrzeugart wählen.' };
  const kl = String(o.fsKlasse ?? '').trim().toUpperCase();
  let fs_klasse: string | null = null;
  if (kl) {
    const k = klassenLesen(kl);
    if (!k.ok || !k.wert || k.wert.includes(',')) return { ok: false, grund: 'Bitte genau eine Führerscheinklasse angeben (z. B. B, BE, C1, A2) oder leer lassen.' };
    fs_klasse = k.wert;
  }
  const tag = euroInCent(o.tagessatz);
  if (tag === null || Number.isNaN(tag)) return { ok: false, grund: 'Bitte den Tagessatz (netto) in Euro eintragen.' };
  const woche = euroInCent(o.wochensatz);
  if (Number.isNaN(woche) || woche === 0) return { ok: false, grund: 'Der Wochensatz ist ungültig (leer lassen, wenn es keinen gibt).' };
  const mehr = euroInCent(o.mehrKm) ?? 0;
  const kaution = euroInCent(o.kaution) ?? 0;
  const zusatz = euroInCent(o.zusatzfahrer) ?? 0;
  const tank = euroInCent(o.tankAchtel) ?? 0;
  if ([mehr, kaution, zusatz, tank].some((x) => Number.isNaN(x))) return { ok: false, grund: 'Ein Betrag ist ungültig — bitte nur Zahlen in Euro (z. B. 0,25 oder 500).' };
  const freiKmTag = ganz(o.freiKmTag, 0, 10000);
  if (Number.isNaN(freiKmTag)) return { ok: false, grund: 'Frei-km je Tag: ganze Zahl von 0 bis 10.000 (leer = unbegrenzt).' };
  const alter = ganz(o.mindestalter, 14, 99);
  if (Number.isNaN(alter)) return { ok: false, grund: 'Mindestalter: ganze Zahl von 14 bis 99.' };
  const jahre = ganz(o.fsJahre, 0, 30);
  if (Number.isNaN(jahre)) return { ok: false, grund: 'Führerschein seit mindestens: ganze Jahre von 0 bis 30.' };
  const km = ganz(o.kmStand, 0, 5_000_000);
  if (Number.isNaN(km)) return { ok: false, grund: 'Der km-Stand ist ungültig (ganze km).' };
  return {
    ok: true,
    zeile: {
      bezeichnung, kennzeichen: text(o.kennzeichen, 15)?.toUpperCase() ?? null, art, fs_klasse,
      tagessatz_cent: tag, wochensatz_cent: woche, frei_km_tag: freiKmTag as number | null, mehr_km_cent: mehr,
      kaution_cent: kaution, mindestalter: (alter as number | null) ?? 18, fs_jahre_min: (jahre as number | null) ?? 0,
      zusatzfahrer_tag_cent: zusatz, tank_achtel_cent: tank, km_stand: km as number | null, notiz: text(o.notiz, 500), aktiv: o.aktiv !== false,
    },
  };
}

/** Buchung prüfen: Fahrzeug, Mieter, Zeitraum (Rückgabe nach Abholung, höchstens 400 Tage), Vorprüfung auf Überschneidung. */
export function buchungPruefen(o: {
  fahrzeugId: unknown; mieterName: unknown; anschrift?: unknown; email?: unknown; telefon?: unknown; kontaktId?: unknown;
  abholung: unknown; rueckgabe: unknown; notiz?: unknown; buchungen: BuchungKurz[]; ohneId?: string;
}): { ok: true; zeile: { fahrzeug_id: string; kontakt_id: string | null; mieter_name: string; mieter_anschrift: string | null; mieter_email: string | null; mieter_telefon: string | null; abholung: string; rueckgabe_plan: string; notiz: string | null } } | { ok: false; grund: string } {
  if (!istUuid(o.fahrzeugId)) return { ok: false, grund: 'Bitte ein Fahrzeug wählen.' };
  const name = text(o.mieterName, 120);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte den Namen des Mieters eintragen.' };
  const a = zeit(o.abholung), r = zeit(o.rueckgabe);
  if (a === null) return { ok: false, grund: 'Bitte Datum und Uhrzeit der Abholung angeben.' };
  if (r === null) return { ok: false, grund: 'Bitte Datum und Uhrzeit der Rückgabe angeben.' };
  if (r <= a) return { ok: false, grund: 'Die Rückgabe muss nach der Abholung liegen.' };
  if (r - a > 400 * TAG) return { ok: false, grund: 'Mietdauer über 400 Tage — bitte als Langzeitmiete in Teilen buchen.' };
  const email = text(o.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, grund: 'Die E-Mail-Adresse sieht nicht gültig aus.' };
  const k = kollision(o.buchungen, o.fahrzeugId, a, r, o.ohneId);
  if (k) return { ok: false, grund: `Das Fahrzeug ist in diesem Zeitraum schon vergeben${k.nummer ? ` (${k.nummer}${k.mieter_name ? `, ${k.mieter_name}` : ''})` : ''}.` };
  const anschrift = String(o.anschrift ?? '').split(/\r?\n/).map((z) => z.trim()).filter(Boolean).join('\n').slice(0, 300) || null;
  return {
    ok: true,
    zeile: {
      fahrzeug_id: o.fahrzeugId, kontakt_id: istUuid(o.kontaktId) ? o.kontaktId : null, mieter_name: name, mieter_anschrift: anschrift,
      mieter_email: email, mieter_telefon: text(o.telefon, 40), abholung: new Date(a).toISOString(), rueckgabe_plan: new Date(r).toISOString(), notiz: text(o.notiz, 1000),
    },
  };
}

export type FahrerBedingung = { mindestalter: number; fs_jahre_min: number; fs_klasse: string | null };
export type FahrerErgebnis = { alter: number; jahre: number; alter_ok: boolean; dauer_ok: boolean; klasse_ok: boolean; dokument_ok: boolean; ok: boolean; gruende: string[] };

/** Rechnet wie die Datenbank (Abholtag in Berlin): Alter, Führerschein-Dauer, Klasse, Ausweis/Gültigkeit bis Rückgabe. */
export function fahrerBewerten(f: { geburtsdatum: string; fs_erteilt_am: string; fs_klassen: string | null; fs_gueltig_bis: string | null; ausweis_abgeglichen: boolean }, b: FahrerBedingung, abholTag: string, rueckgabeTag: string): FahrerErgebnis {
  const alter = volleJahre(f.geburtsdatum, abholTag);
  const jahre = volleJahre(f.fs_erteilt_am, abholTag);
  const alter_ok = alter >= b.mindestalter;
  const dauer_ok = f.fs_erteilt_am <= abholTag && jahre >= b.fs_jahre_min;
  const liste = String(f.fs_klassen ?? '').replace(/\s/g, '').split(',').filter(Boolean);
  const klasse_ok = !b.fs_klasse || liste.includes(b.fs_klasse);
  const dokument_ok = f.ausweis_abgeglichen && (!f.fs_gueltig_bis || f.fs_gueltig_bis >= rueckgabeTag);
  const gruende: string[] = [];
  if (!alter_ok) gruende.push(`Mindestalter ${b.mindestalter} Jahre (ist ${alter})`);
  if (!dauer_ok) gruende.push(`Führerschein seit mindestens ${b.fs_jahre_min} Jahr${b.fs_jahre_min === 1 ? '' : 'en'} (sind ${Math.max(0, jahre)})`);
  if (!klasse_ok) gruende.push(`Klasse ${b.fs_klasse} fehlt`);
  if (!f.ausweis_abgeglichen) gruende.push('Ausweis nicht abgeglichen');
  else if (!dokument_ok) gruende.push('Führerschein läuft vor der Rückgabe ab');
  return { alter, jahre, alter_ok, dauer_ok, klasse_ok, dokument_ok, ok: alter_ok && dauer_ok && klasse_ok && dokument_ok, gruende };
}

/** Fahrer-Eingabe prüfen (ohne Führerscheinnummer!). */
export function fahrerPruefen(o: {
  buchungId: unknown; rolle: unknown; name: unknown; geburtsdatum: unknown; fsErteilt: unknown; klassen: unknown; gueltigBis?: unknown; ausweis: unknown; bemerkung?: unknown; heute: string;
}): { ok: true; zeile: { buchung_id: string; rolle: 'haupt' | 'zusatz'; name: string; geburtsdatum: string; fs_erteilt_am: string; fs_klassen: string | null; fs_gueltig_bis: string | null; ausweis_abgeglichen: boolean; bemerkung: string | null } } | { ok: false; grund: string } {
  if (!istUuid(o.buchungId)) return { ok: false, grund: 'Buchung fehlt.' };
  const rolle = o.rolle === 'zusatz' ? 'zusatz' : o.rolle === 'haupt' ? 'haupt' : null;
  if (!rolle) return { ok: false, grund: 'Bitte Haupt- oder Zusatzfahrer wählen.' };
  const name = text(o.name, 120);
  if (!name || name.length < 2) return { ok: false, grund: 'Bitte den Namen des Fahrers eintragen.' };
  if (!istIso(o.geburtsdatum) || o.geburtsdatum > o.heute || o.geburtsdatum < '1900-01-01') return { ok: false, grund: 'Bitte das Geburtsdatum eintragen.' };
  if (!istIso(o.fsErteilt) || o.fsErteilt > o.heute) return { ok: false, grund: 'Bitte eintragen, seit wann der Führerschein besteht (Datum der Erteilung).' };
  if (o.fsErteilt < o.geburtsdatum) return { ok: false, grund: 'Der Führerschein kann nicht vor der Geburt erteilt sein.' };
  const k = klassenLesen(o.klassen);
  if (!k.ok) return { ok: false, grund: k.grund };
  const bis = String(o.gueltigBis ?? '').trim();
  if (bis && !istIso(bis)) return { ok: false, grund: 'Gültig bis: bitte ein Datum oder leer lassen (unbefristet).' };
  const bem = text(o.bemerkung, 200);
  if (bem && siehtAusWieNummer(bem)) return { ok: false, grund: 'Bitte keine Führerschein- oder Ausweisnummer eintragen — gespeichert wird nur der Prüfvermerk.' };
  if (siehtAusWieNummer(name)) return { ok: false, grund: 'Im Namen steht etwas, das wie eine Nummer aussieht.' };
  return {
    ok: true,
    zeile: { buchung_id: o.buchungId, rolle, name, geburtsdatum: o.geburtsdatum, fs_erteilt_am: o.fsErteilt, fs_klassen: k.wert, fs_gueltig_bis: bis || null, ausweis_abgeglichen: o.ausweis === true, bemerkung: bem },
  };
}

/** Sieht die Eingabe wie eine Kartennummer aus (13–19 Ziffern, auch mit Leerzeichen)? Die gehört NIE zu ARGONAUT. */
export function siehtAusWieKarte(roh: unknown): boolean {
  return /[0-9](?:[ -]?[0-9]){12,}/.test(String(roh ?? ''));
}

/** Kaution: Art, Status, Vorgangsnummer des Zahlungsanbieters (keine Kartennummer). */
export function kautionPruefen(o: { art: unknown; status: unknown; referenz?: unknown; kautionCent: number }): { ok: true; zeile: { kaution_art: string; kaution_status: string; kaution_referenz: string | null } } | { ok: false; grund: string } {
  const art = KAUTION_ARTEN.find((k) => k.key === o.art)?.key;
  if (!art) return { ok: false, grund: 'Bitte die Art der Kaution wählen.' };
  const status = typeof o.status === 'string' && o.status in KAUTION_STATUS ? o.status : null;
  if (!status || status === 'einbehalten') return { ok: false, grund: 'Bitte den Status der Kaution wählen.' };
  const ref = text(o.referenz, 60);
  if (ref && siehtAusWieKarte(ref)) return { ok: false, grund: 'Bitte KEINE Kartennummer eintragen — nur die Vorgangsnummer Ihres Zahlungsanbieters (z. B. „pi_3N…“ oder „Quittung 17“).' };
  if (o.kautionCent > 0 && art === 'keine' && status === 'hinterlegt') return { ok: false, grund: 'Vereinbart ist eine Kaution — bitte die Art wählen.' };
  if (art === 'zahlungsanbieter' && status === 'hinterlegt' && !ref) return { ok: false, grund: 'Bitte die Vorgangsnummer der Vormerkung bei Ihrem Zahlungsanbieter eintragen.' };
  return { ok: true, zeile: { kaution_art: art, kaution_status: status, kaution_referenz: ref } };
}

/** Übergabe prüfen (Vorprüfung — die Datenbank prüft dasselbe noch einmal). */
export function uebergabePruefen(o: {
  km: unknown; tank: unknown; kmFlotte: number | null; unterschrieben: boolean; anschrift: string | null;
  hauptOk: boolean; fahrerAbgelehnt: number; kautionCent: number; kautionStatus: string;
}): { ok: true; km: number; tank: number; hinweis: string | null } | { ok: false; grund: string } {
  if (!o.hauptOk) return { ok: false, grund: 'Zuerst den Hauptfahrer prüfen (Alter, Führerschein, Klasse, Ausweis).' };
  if (o.fahrerAbgelehnt > 0) return { ok: false, grund: 'Ein Fahrer erfüllt die Bedingungen nicht — bitte vor der Übergabe aus dem Vertrag nehmen.' };
  if (!o.anschrift || o.anschrift.trim().length < 5) return { ok: false, grund: 'Bitte die Anschrift des Mieters eintragen.' };
  if (o.kautionCent > 0 && o.kautionStatus !== 'hinterlegt') return { ok: false, grund: 'Die vereinbarte Kaution ist noch nicht hinterlegt.' };
  const km = ganz(o.km, 0, 5_000_000);
  if (km === null || Number.isNaN(km)) return { ok: false, grund: 'Bitte den km-Stand bei der Übergabe eintragen (ganze km).' };
  const tank = achtel(o.tank);
  if (tank === null) return { ok: false, grund: 'Bitte den Tank-/Akkustand wählen.' };
  if (!o.unterschrieben) return { ok: false, grund: 'Bitte bestätigen, dass der Mieter den Mietvertrag unterschrieben hat.' };
  const hinweis = o.kmFlotte !== null && (km as number) < o.kmFlotte ? `Achtung: kleiner als der letzte bekannte Stand (${o.kmFlotte.toLocaleString('de-DE')} km).` : null;
  return { ok: true, km: km as number, tank, hinweis };
}

/** Rückgabe prüfen. */
export function rueckgabePruefen(o: { km: unknown; tank: unknown; kmStart: number | null }): { ok: true; km: number; tank: number } | { ok: false; grund: string } {
  const km = ganz(o.km, 0, 5_000_000);
  if (km === null || Number.isNaN(km)) return { ok: false, grund: 'Bitte den km-Stand bei der Rückgabe eintragen (ganze km).' };
  if (o.kmStart !== null && (km as number) < o.kmStart) return { ok: false, grund: `Der km-Stand ist kleiner als bei der Übergabe (${o.kmStart.toLocaleString('de-DE')} km).` };
  if (o.kmStart !== null && (km as number) - o.kmStart > 100_000) return { ok: false, grund: 'Mehr als 100.000 km — bitte den km-Stand prüfen.' };
  const tank = achtel(o.tank);
  if (tank === null) return { ok: false, grund: 'Bitte den Tank-/Akkustand wählen.' };
  return { ok: true, km: km as number, tank };
}

/** Einbehalt der Kaution (nur Chef): Betrag bis zur Kaution, Grund Pflicht. */
export function einbehaltPruefen(o: { betrag: unknown; grund: unknown; kautionCent: number }): { ok: true; cent: number; grund: string } | { ok: false; grund: string } {
  const c = euroInCent(o.betrag);
  if (c === null || Number.isNaN(c) || c <= 0) return { ok: false, grund: 'Bitte den einbehaltenen Betrag in Euro eintragen.' };
  if (c > o.kautionCent) return { ok: false, grund: 'Der Einbehalt ist höher als die Kaution.' };
  const g = text(o.grund, 300);
  if (!g || g.length < 5) return { ok: false, grund: 'Bitte den Grund angeben (mindestens 5 Zeichen).' };
  return { ok: true, cent: c, grund: g };
}

/** Schaden prüfen. */
export function schadenPruefen(o: { fahrzeugId: unknown; buchungId?: unknown; phase: unknown; bereich: unknown; art: unknown; beschreibung?: unknown }): { ok: true; zeile: { fahrzeug_id: string; buchung_id: string | null; phase: string; bereich: string; art: string; beschreibung: string | null } } | { ok: false; grund: string } {
  if (!istUuid(o.fahrzeugId)) return { ok: false, grund: 'Fahrzeug fehlt.' };
  const phase = ['uebergabe', 'rueckgabe', 'sonstig'].includes(String(o.phase)) ? String(o.phase) : null;
  if (!phase) return { ok: false, grund: 'Bitte wählen, wann der Schaden festgestellt wurde.' };
  const bereich = SCHADEN_BEREICHE.find((b) => b.key === o.bereich)?.key;
  if (!bereich) return { ok: false, grund: 'Bitte die Stelle am Fahrzeug wählen.' };
  const art = SCHADEN_ARTEN.find((b) => b.key === o.art)?.key;
  if (!art) return { ok: false, grund: 'Bitte die Art des Schadens wählen.' };
  return { ok: true, zeile: { fahrzeug_id: o.fahrzeugId, buchung_id: istUuid(o.buchungId) ? o.buchungId : null, phase, bereich, art, beschreibung: text(o.beschreibung, 500) } };
}

/** Ablageort eines Fotos: <betrieb>/<buchung>/<phase>-<zeit>-<zufall>.<endung> */
export function fotoPfad(betrieb: string, buchungId: string, phase: 'uebergabe' | 'rueckgabe' | 'schaden', endung: string, zeitMs: number, zufall: string): string | null {
  if (!istUuid(betrieb) || !istUuid(buchungId)) return null;
  const e = /^(jpg|jpeg|png|webp|heic|heif)$/i.test(endung) ? endung.toLowerCase() : null;
  const z = zufall.replace(/[^a-z0-9]/gi, '').slice(0, 10);
  if (!e || !z) return null;
  return `${betrieb}/${buchungId}/${phase}-${Math.floor(zeitMs)}-${z}.${e}`;
}

/** Kennzahlen für die Übersicht. */
export function kennzahlen(buchungen: (BuchungKurz & { kaution_status?: string; kaution_cent?: number })[], jetzt: number, heute: string): { unterwegs: number; heuteAbholung: number; heuteRueckgabe: number; ueberfaellig: number; kautionOffen: number } {
  let unterwegs = 0, heuteAbholung = 0, heuteRueckgabe = 0, ueber = 0, kautionOffen = 0;
  for (const b of buchungen) {
    const a = zeit(b.abholung), r = zeit(b.rueckgabe_plan);
    if (b.status === 'uebergeben') unterwegs++;
    if (b.status === 'reserviert' && a !== null && berlinTag(a) === heute) heuteAbholung++;
    if (b.status === 'uebergeben' && r !== null && berlinTag(r) === heute) heuteRueckgabe++;
    if (ueberfaellig(b, jetzt)) ueber++;
    if ((b.status === 'zurueck' || b.status === 'storniert') && b.kaution_status === 'hinterlegt') kautionOffen++;
  }
  return { unterwegs, heuteAbholung, heuteRueckgabe, ueberfaellig: ueber, kautionOffen };
}
