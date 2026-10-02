// ============================================================================
// ARGONAUT OS · lib/rechnungAblage.ts — Verschickte Rechnungen fest ablegen (Paket 197)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks — node-testbar.
//
// WARUM (GoBD, Unveränderbarkeit): Bisher wurde eine Rechnung bei JEDEM Öffnen
// neu aus den Daten gerechnet. Der PDF-Fuß trägt das heutige Datum, der
// Bezahllink verschwindet nach der Zahlung, jede Layout-Änderung im Programm
// verändert alte Belege. Das Dokument, das der Kunde bekommen hat, war nicht
// mehr reproduzierbar.
//
// JETZT: Beim Versand (E-Mail) bzw. beim Festschreiben wird genau die Datei,
// die der Kunde bekommt, unverändert abgelegt — mit SHA-256-Prüfsumme. Ab da
// zeigt „PDF" immer dieses Original, die Rechnung ist für Änderungen gesperrt
// (Korrektur nur per Storno + neue Rechnung). Die Datenbank sichert das ab
// (SQL p197: Tabelle rechnung_ablage ohne Ändern, Sperre auf Beträge/Positionen).
// ============================================================================

export const ABLAGE_MAX_BYTES = 10 * 1024 * 1024;

export type AblageAnlass = 'versand_mail' | 'festgeschrieben';

export const ABLAGE_ANLASS_TEXT: Record<AblageAnlass, string> = {
  versand_mail: 'Per E-Mail verschickt',
  festgeschrieben: 'Festgeschrieben (PDF)',
};

export function istAnlass(x: unknown): x is AblageAnlass {
  return x === 'versand_mail' || x === 'festgeschrieben';
}

export type AblageTyp = 'application/pdf' | 'application/xml';

/** Erste Bytes lesen: echtes PDF („%PDF-") oder XML („<?xml" / „<" nach BOM/Leerraum). */
export function dateiArt(bytes: Uint8Array): AblageTyp | null {
  if (!bytes || bytes.length < 5) return null;
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3; // UTF-8-BOM
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i++;
  if (bytes[i] === 0x3c) return 'application/xml'; // „<"
  return null;
}

export type DateiPruefung = { ok: true; typ: AblageTyp } | { ok: false; fehler: string };

/** Nur echte PDF-/XML-Dateien bis 10 MB; der angegebene Typ muss zum Inhalt passen. */
export function pruefeAblageDatei(bytes: Uint8Array, angegebenerTyp?: string | null): DateiPruefung {
  if (!bytes || bytes.length === 0) return { ok: false, fehler: 'Die Datei ist leer.' };
  if (bytes.length > ABLAGE_MAX_BYTES) return { ok: false, fehler: 'Die Datei ist größer als 10 MB.' };
  const art = dateiArt(bytes);
  if (!art) return { ok: false, fehler: 'Nur PDF- oder XML-Rechnungen können abgelegt werden.' };
  const t = String(angegebenerTyp || '').toLowerCase();
  if (t) {
    const passt = art === 'application/pdf' ? t === 'application/pdf' : (t === 'application/xml' || t === 'text/xml');
    if (!passt) return { ok: false, fehler: 'Dateityp und Inhalt passen nicht zusammen.' };
  }
  return { ok: true, typ: art };
}

/** Dateiname für den Speicher: nur Buchstaben, Ziffern, . _ - (Umlaute umgeschrieben). */
export function sichererName(name: string | null | undefined, typ: AblageTyp): string {
  const roh = String(name || '').trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '').slice(0, 80);
  const endung = typ === 'application/pdf' ? '.pdf' : '.xml';
  const basis = roh.replace(/\.(pdf|xml)$/i, '') || 'Rechnung';
  return basis + endung;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(x: unknown): x is string {
  return typeof x === 'string' && UUID.test(x);
}

/**
 * Speicherpfad im privaten Ordner „erechnungen":
 * {betrieb}/ausgang/{jahr}/{rechnung}/{zeit}_{name}
 * Der erste Teil ist IMMER der Betrieb (Speicherregeln greifen je Betrieb).
 */
export function ablagePfad(betrieb: string, rechnungId: string, rechnungsdatum: string | null | undefined, zeitMs: number, dateiname: string): string {
  if (!istUuid(betrieb) || !istUuid(rechnungId)) throw new Error('Ungültige Kennung für den Ablagepfad.');
  const jahr = /^\d{4}-\d{2}-\d{2}/.test(String(rechnungsdatum || '')) ? String(rechnungsdatum).slice(0, 4) : String(new Date(zeitMs).getUTCFullYear());
  return `${betrieb.toLowerCase()}/ausgang/${jahr}/${rechnungId.toLowerCase()}/${Math.floor(zeitMs)}_${dateiname}`;
}

/** Gehört der Pfad zum Betrieb und zur Rechnung? (Schutz beim Ausliefern) */
export function pfadPasstZu(pfad: string, betrieb: string, rechnungId: string): boolean {
  const p = String(pfad || '');
  if (p.includes('..') || p.includes('//') || p.startsWith('/')) return false;
  const teile = p.split('/');
  return teile.length === 5 && teile[0] === String(betrieb).toLowerCase() && teile[1] === 'ausgang'
    && /^\d{4}$/.test(teile[2]) && teile[3] === String(rechnungId).toLowerCase() && teile[4].length > 0;
}

/** Prüfsumme lesbar kürzen: „3f2a 9c1b 77d0 …" (erste 12 Zeichen). */
export function pruefsummeKurz(hash: string | null | undefined): string {
  const h = String(hash || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(h)) return '';
  return `${h.slice(0, 4)} ${h.slice(4, 8)} ${h.slice(8, 12)} …`;
}

export interface AblageZeile {
  id: string;
  anlass: string;
  datei_typ: string;
  datei_hash: string;
  datei_name?: string | null;
  datei_pfad?: string | null;
  empfaenger?: string | null;
  erstellt_am: string;
}

/**
 * Das Original für „PDF": das ERSTE abgelegte PDF (so hat der Kunde die
 * Rechnung zuerst bekommen). Spätere Ablagen sind weitere Versand-Ereignisse.
 */
export function originalPdf<T extends AblageZeile>(ablagen: readonly T[] | null | undefined): T | null {
  const pdfs = (ablagen || []).filter((a) => a && a.datei_typ === 'application/pdf');
  if (!pdfs.length) return null;
  return [...pdfs].sort((a, b) => String(a.erstellt_am).localeCompare(String(b.erstellt_am)))[0];
}

/** Ist die Rechnung festgeschrieben? (Spalte gesetzt ODER schon etwas abgelegt) */
export function istFestgeschrieben(rechnung: { festgeschrieben_am?: string | null } | null | undefined, ablagen?: readonly unknown[] | null): boolean {
  return !!(rechnung && rechnung.festgeschrieben_am) || (Array.isArray(ablagen) && ablagen.length > 0);
}

/** Vorhandene Datei gleicher Prüfsumme bei derselben Rechnung wiederverwenden (kein Doppel-Upload). */
export function gleicheDatei<T extends { datei_hash: string; datei_pfad?: string | null }>(ablagen: readonly T[] | null | undefined, hash: string): T | null {
  return (ablagen || []).find((a) => a && a.datei_hash === hash && !!a.datei_pfad) || null;
}

/** Fehlt die Tabelle/Spalte noch (SQL p197 nicht gelaufen)? */
export function ablageFehlt(fehlerText: string | null | undefined): boolean {
  return /rechnung_ablage|festgeschrieben_am|schema cache|does not exist|42P01|PGRST20[45]/i.test(String(fehlerText || ''));
}

export const FESTGESCHRIEBEN_HINWEIS =
  'Diese Rechnung ist festgeschrieben (GoBD): Beträge, Daten und Positionen lassen sich nicht mehr ändern. Für eine Korrektur stornieren Sie die Rechnung und erstellen eine neue.';

/** Eigener privater Speicherordner — OHNE Speicherregeln für Nutzer: nur der Server liest und schreibt. */
export const ABLAGE_BUCKET = 'rechnung-ablage';
