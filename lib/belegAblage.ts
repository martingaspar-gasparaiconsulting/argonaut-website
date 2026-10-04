// ============================================================================
// ARGONAUT OS · lib/belegAblage.ts — Mahnungen und Angebots-Zusagen fest ablegen (Paket 198)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks — node-testbar.
//
// WARUM (GoBD / Nachweis): Paket 197 legt verschickte RECHNUNGEN unverändert ab.
// Zwei weitere Belege wurden bisher bei jedem Öffnen neu erzeugt:
//   • die MAHNUNG (Handelsbrief) — das PDF entstand nur beim Herunterladen,
//     danach gab es nur noch den Historie-Vermerk, nicht das Schreiben selbst;
//   • die ANGEBOTS-ZUSAGE über den Link — gespeichert waren nur Name, Zeitpunkt
//     und die Erklärung, nicht WAS der Kunde angenommen hat (Positionen, Preise).
//
// JETZT:
//   • Mahnung: beim „Als gesendet markieren" wird genau das PDF der Stufe
//     abgelegt (SHA-256-Prüfsumme), das der Kunde bekommt.
//   • Zusage: im Moment der Annahme wird ein Nachweis mit Kopf, Positionen,
//     Summen, Name und Erklärung als JSON abgelegt (Prüfsumme), und das
//     Angebot ist ab da in der Datenbank gesperrt (SQL p198).
//
// Gutschriften/Stornorechnungen gibt es bisher nur als freies Dokument aus dem
// Dokumenten-Generator, nicht als eigenen Beleg mit Nummernkreis — deshalb hier
// bewusst nicht dabei (eigenes Paket, Stufe 3).
// ============================================================================

import { dateiArt } from './rechnungAblage';

export const BELEG_MAX_BYTES = 10 * 1024 * 1024;

export type BelegArt = 'mahnung' | 'angebot_annahme';

export const BELEG_ART_TEXT: Record<BelegArt, string> = {
  mahnung: 'Mahnung',
  angebot_annahme: 'Angebots-Zusage',
};

export function istBelegArt(x: unknown): x is BelegArt {
  return x === 'mahnung' || x === 'angebot_annahme';
}

export type BelegTyp = 'application/pdf' | 'application/json';

/** Welcher Dateityp gehört zu welcher Art? Mahnung = PDF, Zusage = JSON. */
export function belegTypFuer(art: BelegArt): BelegTyp {
  return art === 'mahnung' ? 'application/pdf' : 'application/json';
}

export type BelegPruefung = { ok: true; typ: BelegTyp } | { ok: false; fehler: string };

/** Mahnung nur als echtes PDF, Zusage nur als gültiges JSON-Objekt; beides bis 10 MB. */
export function pruefeBelegDatei(bytes: Uint8Array, art: BelegArt): BelegPruefung {
  if (!bytes || bytes.length === 0) return { ok: false, fehler: 'Die Datei ist leer.' };
  if (bytes.length > BELEG_MAX_BYTES) return { ok: false, fehler: 'Die Datei ist größer als 10 MB.' };
  if (art === 'mahnung') {
    return dateiArt(bytes) === 'application/pdf'
      ? { ok: true, typ: 'application/pdf' }
      : { ok: false, fehler: 'Eine Mahnung wird nur als PDF abgelegt.' };
  }
  try {
    const wert = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!wert || typeof wert !== 'object' || Array.isArray(wert)) return { ok: false, fehler: 'Der Nachweis ist kein gültiges Objekt.' };
    return { ok: true, typ: 'application/json' };
  } catch {
    return { ok: false, fehler: 'Der Nachweis ist kein gültiges JSON.' };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function istUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID.test(x);
}

/** Dateiname: nur Buchstaben, Ziffern, . _ - (Umlaute umgeschrieben), passende Endung. */
export function belegName(name: string | null | undefined, typ: BelegTyp): string {
  const roh = String(name || '').trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '').slice(0, 80);
  const endung = typ === 'application/pdf' ? '.pdf' : '.json';
  const basis = roh.replace(/\.(pdf|json)$/i, '') || 'Beleg';
  return basis + endung;
}

/** Dateiname einer Mahnung je Stufe — gleiche Vorsilben wie der Download auf der Seite. */
export function mahnungDateiname(stufe: number, rechnungsnummer: string | null | undefined): string {
  const praefix = stufe >= 4 ? 'LetzteMahnung' : stufe === 3 ? 'Mahnung2' : stufe === 2 ? 'Mahnung1' : 'Zahlungserinnerung';
  return belegName(`${praefix}_${rechnungsnummer || 'Dokument'}`, 'application/pdf');
}

/**
 * Speicherpfad im privaten Ordner „rechnung-ablage" (derselbe Ordner wie 197,
 * eigener Zweig „beleg"): {betrieb}/beleg/{art}/{jahr}/{bezug}/{zeit}_{name}
 * Der erste Teil ist IMMER der Betrieb.
 */
export function belegPfad(betrieb: string, art: BelegArt, bezugId: string, zeitMs: number, dateiname: string): string {
  if (!istUuid(betrieb) || !istUuid(bezugId) || !istBelegArt(art)) throw new Error('Ungültige Kennung für den Ablagepfad.');
  const jahr = String(new Date(zeitMs).getUTCFullYear());
  return `${betrieb.toLowerCase()}/beleg/${art}/${jahr}/${bezugId.toLowerCase()}/${Math.floor(zeitMs)}_${dateiname}`;
}

/** Gehört der Pfad zu Betrieb, Art und Bezug? (Schutz beim Ausliefern) */
export function belegPfadPasstZu(pfad: string, betrieb: string, art: string, bezugId: string): boolean {
  const p = String(pfad || '');
  if (p.includes('..') || p.includes('//') || p.startsWith('/')) return false;
  const t = p.split('/');
  return t.length === 6 && t[0] === String(betrieb).toLowerCase() && t[1] === 'beleg' && istBelegArt(t[2]) && t[2] === art
    && /^\d{4}$/.test(t[3]) && t[4] === String(bezugId).toLowerCase() && t[5].length > 0;
}

// ---------------------------------------------------------------------------
// Nachweis der Angebots-Zusage
// ---------------------------------------------------------------------------

export interface AnnahmeKopf {
  id: string;
  angebotsnummer?: string | null;
  titel?: string | null;
  kunde_name?: string | null;
  gueltig_bis?: string | null;
  netto_summe?: number | string | null;
  mwst_summe?: number | string | null;
  brutto_summe?: number | string | null;
}

export interface AnnahmePosition {
  position?: number | null;
  bezeichnung?: string | null;
  menge?: number | string | null;
  einheit?: string | null;
  einzelpreis?: number | string | null;
  mwst_satz?: number | string | null;
  gesamt_netto?: number | string | null;
}

const zahl = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Baut den Nachweis als JSON-Text mit FESTER Feldreihenfolge (gleiche Zusage
 * = gleiche Bytes = gleiche Prüfsumme). Enthält, was der Kunde gesehen und
 * angenommen hat — keine IP, keine Mail-Adresse (Datensparsamkeit).
 */
export function annahmeNachweis(opts: {
  kopf: AnnahmeKopf;
  positionen: readonly AnnahmePosition[];
  betrieb: string;
  name: string;
  erklaerung: string;
  zeitpunkt: string;
}): string {
  const pos = [...(opts.positionen || [])]
    .sort((a, b) => zahl(a.position) - zahl(b.position))
    .map((p) => ({
      position: zahl(p.position),
      bezeichnung: String(p.bezeichnung ?? ''),
      menge: zahl(p.menge),
      einheit: String(p.einheit ?? ''),
      einzelpreis: zahl(p.einzelpreis),
      mwst_satz: zahl(p.mwst_satz),
      gesamt_netto: zahl(p.gesamt_netto),
    }));
  const k = opts.kopf;
  const nachweis = {
    art: 'angebot_annahme',
    fassung: 1,
    angebot_id: String(k.id),
    angebotsnummer: String(k.angebotsnummer ?? ''),
    titel: String(k.titel ?? ''),
    kunde: String(k.kunde_name ?? ''),
    betrieb: String(opts.betrieb ?? ''),
    gueltig_bis: k.gueltig_bis ? String(k.gueltig_bis) : null,
    summen: { netto: zahl(k.netto_summe), mwst: zahl(k.mwst_summe), brutto: zahl(k.brutto_summe) },
    positionen: pos,
    zusage: { name: String(opts.name ?? ''), erklaerung: String(opts.erklaerung ?? ''), zeitpunkt: String(opts.zeitpunkt ?? '') },
  };
  return JSON.stringify(nachweis, null, 2);
}

// ---------------------------------------------------------------------------
// Automatisch festschreiben (Spiegel der Datenbank-Regel p198_auto_fest, damit
// die Bedingung testbar ist und die Seite dieselbe Sprache spricht)
// ---------------------------------------------------------------------------

export interface FestZustand {
  festgeschrieben_am?: string | null;
  zahlungsstatus?: string | null;
  mahnstufe?: number | null;
  zahlung_gemeldet_am?: string | null;
}

/**
 * Wird eine Rechnung durch diese Änderung automatisch festgeschrieben?
 * Ja, sobald sie nachweislich beim Kunden ist: Zahlung (ganz oder teilweise)
 * eingegangen, gemahnt oder vom Kunden als bezahlt gemeldet. Ein Storno
 * schreibt nicht fest (eine nie verschickte Rechnung bleibt korrigierbar).
 */
export function autoFestschreiben(alt: FestZustand, neu: FestZustand): boolean {
  if (alt.festgeschrieben_am || neu.festgeschrieben_am) return false;
  const bezahltJetzt = neu.zahlungsstatus === 'bezahlt' || neu.zahlungsstatus === 'teilbezahlt';
  const bezahltVorher = alt.zahlungsstatus === 'bezahlt' || alt.zahlungsstatus === 'teilbezahlt';
  if (bezahltJetzt && !bezahltVorher) return true;
  if ((Number(neu.mahnstufe) || 0) > (Number(alt.mahnstufe) || 0)) return true;
  if (neu.zahlung_gemeldet_am && !alt.zahlung_gemeldet_am) return true;
  return false;
}

export const AUTO_FEST_HINWEIS =
  'Rechnungen werden automatisch festgeschrieben, sobald eine Zahlung erfasst, gemahnt oder eine Zahlung vom Kunden gemeldet wird — spätestens dann ist die Rechnung beim Kunden.';

/** Fehlt Tabelle/Spalte noch (SQL p198 nicht gelaufen)? */
export function belegAblageFehlt(fehlerText: string | null | undefined): boolean {
  return /beleg_ablage|schema cache|does not exist|42P01|PGRST20[45]/i.test(String(fehlerText || ''));
}
