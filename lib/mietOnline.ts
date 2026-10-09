// ============================================================================
// ARGONAUT OS · lib/mietOnline.ts — V2b Vermietung: Online-Anfrage (Paket 294)
//
// Öffentliche Seite /mieten/<kennung> mit der Mietflotte eines Betriebs und
// einem Formular „Unverbindlich anfragen". GRUNDSÄTZE
// - UNVERBINDLICH: kein Bezahlen, keine Vertragsannahme online. Die Anfrage
//   landet beim Betrieb; erst der Betrieb reserviert (Mietvertrag wie bisher).
//   Verbindliche Online-Buchung erst nach dem Anwalt (Bestellstrecke dunkel).
// - Nach außen geht NUR die Positivliste FLOTTE_OEFFENTLICH — nie Kennzeichen,
//   km-Stand, Notiz, Fuhrpark-Verknüpfung, Mieter, Buchungen.
// - Verbraucherpreise BRUTTO (PAngV): netto × 1,19 auf ganze Cent; beim
//   Kleinunternehmer ist der Preis schon der Endpreis (§ 19 UStG).
// - Verfügbarkeit nur als „frei / im Wunschzeitraum vergeben" — nie wer.
// Rein (nur lib/zahlen, lib/fahrzeugMiete), node-getestet (tests/mietOnlineP294).
// ============================================================================

import { leseZahl } from './zahlen';
import { abrechnung, zeit, kollision, ARTEN, NUR_STRECKE, TAG, type BuchungKurz } from './fahrzeugMiete';

export const MIET_ONLINE_MODUL = 'miet-online';
export const MAX_TAGE_ANFRAGE = 120;

export const ANFRAGE_STATUS: Record<string, string> = { neu: 'neu', reserviert: 'reserviert', abgelehnt: 'abgelehnt', erledigt: 'erledigt' };

/** Spalten, die die öffentliche Seite aus miet_fahrzeug liest. NIE: kennzeichen, km_stand, notiz, fahrzeug_id, owner_user_id. */
export const FLOTTE_OEFFENTLICH = 'id, bezeichnung, art, fs_klasse, tagessatz_cent, wochensatz_cent, frei_km_tag, mehr_km_cent, kaution_cent, mindestalter, fs_jahre_min, zusatzfahrer_tag_cent, tank_achtel_cent, aktiv';
export const NIE_OEFFENTLICH = ['kennzeichen', 'km_stand', 'notiz', 'fahrzeug_id', 'owner_user_id', 'erstellt_am'];

export type MietFahrzeugOeffentlich = {
  id: string; bezeichnung: string; art: string; fs_klasse: string | null;
  tagessatz_cent: number; wochensatz_cent: number | null; frei_km_tag: number | null; mehr_km_cent: number; kaution_cent: number;
  mindestalter: number; fs_jahre_min: number; zusatzfahrer_tag_cent: number; tank_achtel_cent: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ganz = (v: unknown, std: number) => { const n = typeof v === 'number' ? v : leseZahl(v); return n !== null && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : std; };
const ganzOderNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : ganz(v, 0));

/** Positivliste: nur aktive Fahrzeuge, nur erlaubte Felder (auch wenn jemand die Abfrage ändert). */
export function oeffentlich(roh: unknown): MietFahrzeugOeffentlich | null {
  if (!roh || typeof roh !== 'object') return null;
  const r = roh as Record<string, unknown>;
  if (r.aktiv !== true || typeof r.id !== 'string' || !UUID.test(r.id) || typeof r.bezeichnung !== 'string') return null;
  if (NUR_STRECKE.includes(String(r.art))) return null; // Paket 296: Kart/Rennfahrzeug nur auf der Strecke, nie öffentlich zur Miete
  const art = ARTEN.some((a) => a.key === r.art) ? String(r.art) : 'pkw';
  return {
    id: r.id, bezeichnung: r.bezeichnung.slice(0, 120), art, fs_klasse: typeof r.fs_klasse === 'string' && /^[A-Z0-9]{1,4}$/.test(r.fs_klasse) ? r.fs_klasse : null,
    tagessatz_cent: ganz(r.tagessatz_cent, 0), wochensatz_cent: ganzOderNull(r.wochensatz_cent), frei_km_tag: ganzOderNull(r.frei_km_tag),
    mehr_km_cent: ganz(r.mehr_km_cent, 0), kaution_cent: ganz(r.kaution_cent, 0), mindestalter: ganz(r.mindestalter, 18), fs_jahre_min: ganz(r.fs_jahre_min, 0),
    zusatzfahrer_tag_cent: ganz(r.zusatzfahrer_tag_cent, 0), tank_achtel_cent: ganz(r.tank_achtel_cent, 0),
  };
}

// ------------------------------------------------------------ Einstellung ---

export type MietOnlineEinstellung = { aktiv: boolean; kennung: string | null; google: boolean };

export function kennungGueltig(k: unknown): k is string { return typeof k === 'string' && /^[a-z0-9]{24}$/.test(k); }

export function einstellungLesen(roh: unknown): MietOnlineEinstellung {
  const e = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const kennung = kennungGueltig(e.kennung) ? e.kennung : null;
  const aktiv = e.aktiv === true && kennung !== null;
  return { aktiv, kennung, google: aktiv && e.google === true };
}

export function mietPfad(kennung: string): string { return `/mieten/${kennung}`; }

// ---------------------------------------------------------------- Preise ---

/** Netto-Cent → Endpreis in Cent. Regelbesteuert: + 19 %, auf ganze Cent (halbe Cent aufgerundet). Kleinunternehmer: unverändert. */
export function endpreisCent(nettoCent: number, kleinunternehmer: boolean): number {
  const n = Math.max(0, Math.floor(Number(nettoCent) || 0));
  if (kleinunternehmer) return n;
  return Math.floor((n * 119 + 50) / 100);
}

export function euroText(cent: number): string {
  return (cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function steuerHinweis(kleinunternehmer: boolean): string {
  return kleinunternehmer ? 'Endpreise. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.' : 'Alle Preise sind Endpreise inkl. 19 % MwSt.';
}

/** Konditionen eines Fahrzeugs als Textzeilen (Endpreise). */
export function konditionen(f: MietFahrzeugOeffentlich, ku: boolean): { label: string; wert: string }[] {
  const p = (c: number) => euroText(endpreisCent(c, ku));
  const z: { label: string; wert: string }[] = [{ label: 'Tag', wert: p(f.tagessatz_cent) }];
  if (f.wochensatz_cent) z.push({ label: 'Woche', wert: p(f.wochensatz_cent) });
  z.push({ label: 'Freikilometer', wert: f.frei_km_tag === null ? 'unbegrenzt' : `${f.frei_km_tag.toLocaleString('de-DE')} km je Tag` });
  if (f.frei_km_tag !== null && f.mehr_km_cent > 0) z.push({ label: 'Mehrkilometer', wert: `${p(f.mehr_km_cent)} je km` });
  if (f.kaution_cent > 0) z.push({ label: 'Kaution', wert: euroText(f.kaution_cent) + ' (wird zurückgegeben)' });
  if (f.zusatzfahrer_tag_cent > 0) z.push({ label: 'Zusatzfahrer', wert: `${p(f.zusatzfahrer_tag_cent)} je Tag` });
  if (f.tank_achtel_cent > 0) z.push({ label: 'Nachtanken / Nachladen', wert: `${p(f.tank_achtel_cent)} je fehlendem Achtel` });
  z.push({ label: 'Fahrer', wert: `ab ${f.mindestalter} Jahren, Führerschein seit mindestens ${f.fs_jahre_min} Jahr${f.fs_jahre_min === 1 ? '' : 'en'}${f.fs_klasse ? `, Klasse ${f.fs_klasse}` : ''}` });
  return z;
}

/** Preis-Vorschau für den Wunschzeitraum (Endpreis, ohne Mehr-km, Tank, Zusatzfahrer). */
export function vorschau(f: MietFahrzeugOeffentlich, von: unknown, bis: unknown, ku: boolean): { tage: number; endpreis_cent: number; frei_km: number | null } | null {
  const a = zeit(von), b = zeit(bis);
  if (a === null || b === null || b <= a) return null;
  const r = abrechnung({
    abholung: new Date(a).toISOString(), rueckgabe_plan: new Date(b).toISOString(), rueckgabe_ist: null,
    tagessatz_cent: f.tagessatz_cent, wochensatz_cent: f.wochensatz_cent, frei_km_tag: f.frei_km_tag, mehr_km_cent: 0,
    zusatzfahrer_tag_cent: 0, tank_achtel_cent: 0, km_start: null, km_ende: null, tank_start: null, tank_ende: null,
  }, 0, 0, f.bezeichnung);
  return { tage: r.tage, endpreis_cent: endpreisCent(r.netto_cent, ku), frei_km: r.frei };
}

// --------------------------------------------------------------- Anfrage ---

const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function feld(v: unknown, max: number): string | null {
  const t = String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  return t || null;
}

export type AnfrageDaten = { fahrzeug_id: string; von: string; bis: string; name: string; email: string | null; telefon: string | null; nachricht: string | null };

/** Eingabe des Formulars prüfen. Wunschzeit nicht in der Vergangenheit, höchstens 120 Tage, frühestens heute. */
export function anfragePruefen(roh: unknown, jetzt: number): { ok: true; daten: AnfrageDaten } | { ok: false; fehler: string } {
  if (!roh || typeof roh !== 'object') return { ok: false, fehler: 'Ungültige Anfrage.' };
  const b = roh as Record<string, unknown>;
  if (typeof b.fahrzeugId !== 'string' || !UUID.test(b.fahrzeugId)) return { ok: false, fehler: 'Bitte ein Fahrzeug wählen.' };
  const von = zeit(b.von), bis = zeit(b.bis);
  if (von === null || bis === null) return { ok: false, fehler: 'Bitte Abholung und Rückgabe mit Datum und Uhrzeit angeben.' };
  if (von < jetzt - 3_600_000) return { ok: false, fehler: 'Die Abholung liegt in der Vergangenheit.' };
  if (von > jetzt + 540 * TAG) return { ok: false, fehler: 'Anfragen sind bis 18 Monate im Voraus möglich.' };
  if (bis <= von) return { ok: false, fehler: 'Die Rückgabe muss nach der Abholung liegen.' };
  if (bis - von > MAX_TAGE_ANFRAGE * TAG) return { ok: false, fehler: `Online bis ${MAX_TAGE_ANFRAGE} Tage — für längere Mieten rufen Sie bitte an.` };
  const name = feld(b.name, 120);
  const email = feld(b.email, 160);
  const telefon = feld(b.telefon, 40);
  if (!name || name.length < 2) return { ok: false, fehler: 'Bitte geben Sie Ihren Namen an.' };
  if (!email && !telefon) return { ok: false, fehler: 'Bitte geben Sie eine E-Mail-Adresse oder Telefonnummer an.' };
  if (email && !MAIL_RE.test(email)) return { ok: false, fehler: 'Bitte geben Sie eine gültige E-Mail-Adresse an.' };
  if (telefon && !/^[+0-9 ()/-]{5,40}$/.test(telefon)) return { ok: false, fehler: 'Bitte prüfen Sie die Telefonnummer.' };
  if (b.datenschutz !== true) return { ok: false, fehler: 'Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu.' };
  return { ok: true, daten: { fahrzeug_id: b.fahrzeugId, von: new Date(von).toISOString(), bis: new Date(bis).toISOString(), name, email, telefon, nachricht: feld(b.nachricht, 1000) } };
}

/** Ist das Fahrzeug im Wunschzeitraum frei? (reservierte oder unterwegs befindliche Mieten sperren — wie die Datenbank) */
export function frei(buchungen: BuchungKurz[], fahrzeugId: string, von: string, bis: string): boolean {
  const a = zeit(von), b = zeit(bis);
  if (a === null || b === null) return false;
  return kollision(buchungen, fahrzeugId, a, b) === null;
}

/** Notiz für die Reservierung aus einer Anfrage. */
export function reservierungsNotiz(a: { nr: string | null; nachricht: string | null }): string {
  return `Aus Online-Anfrage ${a.nr ?? ''}${a.nachricht ? `: ${a.nachricht}` : ''}`.replace(/\s+/g, ' ').trim().slice(0, 1000);
}
