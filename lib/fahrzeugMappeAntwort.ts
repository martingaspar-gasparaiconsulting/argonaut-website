// ============================================================================
// ARGONAUT OS · lib/fahrzeugMappeAntwort.ts — Paket 306 (10.10.2026) · FM2
// Fahrzeugmappe: Händler antwortet, Verkäufer sieht den Stand.
//
// Reine Logik, node-testbar (kein Supabase, kein Node-Modul, keine Systemuhr —
// „heute"/„jetzt" kommen als Parameter):
//  - Antworten des Händlers prüfen: Angebot unter Vorbehalt (Betrag, gültig bis),
//    Rückfrage, Einladung (Termin), Absage
//  - Antworten des Verkäufers prüfen: Nachricht, Termin passt
//  - Texte für Seite und E-Mail (Sie-Form)
//  - Befund der Fahrzeughistorie (carVertical o. a.)
//  - Löschfrist: welche Mappen weg dürfen
// Der Vorbehalt beim Angebot ist FEST und lässt sich nicht weglassen: ohne
// Besichtigung gibt es kein verbindliches Angebot.
// ============================================================================

import { leseZahl, centRunden } from './zahlen';

export const VORBEHALT_TEXT = 'Dieses Angebot ist unverbindlich und gilt vorbehaltlich der Besichtigung des Fahrzeugs. Es beruht auf Ihren Angaben, Fotos, Videos und Unterlagen. Ein verbindlicher Ankaufspreis wird erst nach der Besichtigung vereinbart.';
export const NACHREICHEN_TAGE = 14;
export const LOESCHEN_ENTWURF_TAGE = 30;
export const LOESCHEN_ABGELEHNT_TAGE = 90;

export type HaendlerArt = 'angebot' | 'rueckfrage' | 'einladung' | 'absage';
export type KundeArt = 'antwort' | 'termin_ok' | 'nachgereicht';

export const HAENDLER_ARTEN: { key: HaendlerArt; label: string; symbol: string }[] = [
  { key: 'angebot', label: 'Angebot unter Vorbehalt', symbol: '💶' },
  { key: 'einladung', label: 'Zur Besichtigung einladen', symbol: '📅' },
  { key: 'rueckfrage', label: 'Rückfrage', symbol: '❓' },
  { key: 'absage', label: 'Absage', symbol: '✕' },
];

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

const TAG_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Termin aus Datum (JJJJ-MM-TT) und Uhrzeit (HH:MM) in Berliner Zeit -> ISO in UTC (Sommer-/Winterzeit über Intl). */
export function berlinZuIso(tag: string, uhr: string): string | null {
  if (!TAG_RE.test(tag) || !/^\d{2}:\d{2}$/.test(uhr)) return null;
  const [j, m, d] = tag.split('-').map(Number);
  const [h, mi] = uhr.split(':').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  for (const versatz of [2, 1]) {
    const ms = Date.UTC(j, m - 1, d, h - versatz, mi);
    const lokal = new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' });
    if (lokal.startsWith(`${tag} ${uhr}`)) return new Date(ms).toISOString();
  }
  return null;
}

export type HaendlerAntwort = { art: HaendlerArt; text: string | null; betrag: number | null; gueltig_bis: string | null; termin: string | null };

/** Eingabe aus der Ankaufsakte prüfen. */
export function antwortPruefen(roh: unknown, heuteIso: string, jetztMs: number): { ok: true; daten: HaendlerAntwort } | { ok: false; fehler: string } {
  const b = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const art = HAENDLER_ARTEN.find((a) => a.key === b.art)?.key;
  if (!art) return { ok: false, fehler: 'Bitte eine Antwort wählen.' };
  const t = text(b.text, 1500);
  const heute = heuteIso.slice(0, 10);
  if (art === 'angebot') {
    const betrag = leseZahl(b.betrag);
    if (betrag === null || !Number.isFinite(betrag) || betrag <= 0 || betrag >= 10_000_000) return { ok: false, fehler: 'Bitte einen Betrag für das Angebot eintragen.' };
    const bis = typeof b.gueltig_bis === 'string' && TAG_RE.test(b.gueltig_bis) ? b.gueltig_bis : null;
    if (!bis) return { ok: false, fehler: 'Bitte angeben, bis wann das Angebot gilt.' };
    if (bis < heute) return { ok: false, fehler: 'Das Datum „gültig bis" liegt in der Vergangenheit.' };
    return { ok: true, daten: { art, text: t, betrag: centRunden(betrag), gueltig_bis: bis, termin: null } };
  }
  if (art === 'einladung') {
    const iso = berlinZuIso(String(b.tag ?? ''), String(b.uhr ?? ''));
    if (!iso) return { ok: false, fehler: 'Bitte Datum und Uhrzeit für den Termin angeben.' };
    if (Date.parse(iso) <= jetztMs) return { ok: false, fehler: 'Der Termin liegt in der Vergangenheit.' };
    return { ok: true, daten: { art, text: t, betrag: null, gueltig_bis: null, termin: iso } };
  }
  if (art === 'rueckfrage') {
    if (!t || t.length < 5) return { ok: false, fehler: 'Bitte schreiben Sie, was der Verkäufer nachreichen oder beantworten soll.' };
    return { ok: true, daten: { art, text: t, betrag: null, gueltig_bis: null, termin: null } };
  }
  return { ok: true, daten: { art, text: t, betrag: null, gueltig_bis: null, termin: null } };
}

/** Antwort des Verkäufers über seinen Link. */
export function kundeAntwortPruefen(roh: unknown): { ok: true; art: KundeArt; text: string | null } | { ok: false; fehler: string } {
  const b = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const t = text(b.text, 1500);
  if (b.art === 'termin_ok') return { ok: true, art: 'termin_ok', text: t };
  if (b.art === 'antwort') {
    if (!t) return { ok: false, fehler: 'Bitte eine Nachricht eingeben.' };
    return { ok: true, art: 'antwort', text: t };
  }
  return { ok: false, fehler: 'Unbekannte Antwort.' };
}

// --- Darstellung -----------------------------------------------------------------------
export function euroText(n: number): string {
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;
}

export function tagText(iso: string | null | undefined): string {
  if (!iso || !TAG_RE.test(iso.slice(0, 10))) return '';
  const [j, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${j}`;
}

export function terminText(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}

export type Nachricht = { von: string; art: string; text: string | null; betrag: number | null; gueltig_bis: string | null; termin: string | null; erstellt_am: string };

/** Überschrift und Zeilen für Verlauf und E-Mail (ohne HTML). */
export function nachrichtInhalt(n: Pick<Nachricht, 'art' | 'text' | 'betrag' | 'gueltig_bis' | 'termin'>, firma: string): { titel: string; zeilen: string[] } {
  const f = firma.trim() || 'Das Autohaus';
  const extra = n.text ? [n.text] : [];
  switch (n.art) {
    case 'angebot':
      return { titel: `Angebot: ${euroText(Number(n.betrag))}`, zeilen: [`${f} bietet Ihnen ${euroText(Number(n.betrag))} für Ihr Fahrzeug, gültig bis ${tagText(n.gueltig_bis)}.`, ...extra, VORBEHALT_TEXT] };
    case 'einladung':
      return { titel: 'Einladung zur Besichtigung', zeilen: [`${f} schlägt Ihnen einen Termin vor: ${terminText(n.termin)}.`, ...extra] };
    case 'rueckfrage':
      return { titel: 'Rückfrage zu Ihrer Mappe', zeilen: [...extra, `Sie können ${NACHREICHEN_TAGE} Tage lang Fotos und Unterlagen nachreichen.`] };
    case 'absage':
      return { titel: 'Absage', zeilen: [`${f} kann Ihr Fahrzeug leider nicht ankaufen.`, ...extra] };
    case 'termin_ok':
      return { titel: 'Termin bestätigt', zeilen: extra };
    case 'nachgereicht':
      return { titel: 'Dateien nachgereicht', zeilen: extra };
    default:
      return { titel: 'Nachricht', zeilen: extra };
  }
}

/** Stand der Mappe für den Verkäufer — aus dem letzten Eintrag des Händlers. */
export function standFuerKunde(verlauf: Pick<Nachricht, 'von' | 'art' | 'erstellt_am'>[], nachreichenBis: string | null, jetztMs: number): { stufe: 'pruefung' | 'rueckfrage' | 'angebot' | 'einladung' | 'absage'; text: string } {
  const h = [...verlauf].filter((n) => n.von === 'haendler').sort((a, b) => a.erstellt_am.localeCompare(b.erstellt_am)).pop();
  if (!h) return { stufe: 'pruefung', text: 'Ihre Mappe wird geprüft.' };
  if (h.art === 'rueckfrage') {
    return nachreichenBis && Date.parse(nachreichenBis) > jetztMs
      ? { stufe: 'rueckfrage', text: 'Rückfrage: Bitte ergänzen Sie Ihre Mappe.' }
      : { stufe: 'pruefung', text: 'Ihre Mappe wird geprüft.' };
  }
  if (h.art === 'angebot') return { stufe: 'angebot', text: 'Sie haben ein Angebot unter Vorbehalt.' };
  if (h.art === 'einladung') return { stufe: 'einladung', text: 'Sie sind zur Besichtigung eingeladen.' };
  return { stufe: 'absage', text: 'Das Autohaus kann Ihr Fahrzeug leider nicht ankaufen.' };
}

// --- Fahrzeughistorie (Befund) -------------------------------------------------------------
export const BEFUND_PUNKTE: { key: string; label: string }[] = [
  { key: 'km', label: 'Kilometer-Verlauf' },
  { key: 'unfall', label: 'Unfälle / Schäden' },
  { key: 'diebstahl', label: 'Diebstahl' },
];
export const BEFUND_WERTE: { key: string; label: string; ton: 'ok' | 'warn' | 'bad' | 'dim' }[] = [
  { key: 'ok', label: 'unauffällig', ton: 'ok' },
  { key: 'auffaellig', label: 'auffällig', ton: 'warn' },
  { key: 'kritisch', label: 'kritisch', ton: 'bad' },
  { key: 'offen', label: 'nicht geprüft', ton: 'dim' },
];

export function befundBereinigen(roh: unknown): Record<string, string> {
  const b = roh && typeof roh === 'object' && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  const aus: Record<string, string> = {};
  for (const p of BEFUND_PUNKTE) {
    const v = b[p.key];
    aus[p.key] = BEFUND_WERTE.some((w) => w.key === v) ? (v as string) : 'offen';
  }
  const notiz = text(b.notiz, 300);
  if (notiz) aus.notiz = notiz;
  return aus;
}

/** Ampel aus dem Befund: kritisch vor auffällig vor unauffällig. */
export function befundAmpel(befund: Record<string, string>): 'ok' | 'warn' | 'bad' | 'dim' {
  const w = BEFUND_PUNKTE.map((p) => befund[p.key] ?? 'offen');
  if (w.includes('kritisch')) return 'bad';
  if (w.includes('auffaellig')) return 'warn';
  if (w.every((x) => x === 'ok')) return 'ok';
  return 'dim';
}

// --- Löschfrist ---------------------------------------------------------------------------------
export type LoeschZeile = { id: string; status: string; erstellt_am: string; ankauf_id: string | null; ankauf_status?: string | null; ankauf_geaendert?: string | null };

/**
 * Welche Mappen dürfen samt Dateien weg?
 *  - Entwurf, nie abgeschickt, älter als 30 Tage
 *  - eingereicht, Ankauf gelöscht (Verweis leer)
 *  - eingereicht, Ankauf „Nicht angekauft" seit mehr als 90 Tagen
 * Angekaufte, laufende und angebotene Mappen bleiben.
 */
export function loeschGrund(z: LoeschZeile, jetztMs: number): 'entwurf' | 'ohne_ankauf' | 'abgelehnt' | null {
  const tag = 86_400_000;
  if (z.status === 'entwurf') return Date.parse(z.erstellt_am) < jetztMs - LOESCHEN_ENTWURF_TAGE * tag ? 'entwurf' : null;
  if (z.status !== 'eingereicht') return null;
  if (!z.ankauf_id) return 'ohne_ankauf';
  if (z.ankauf_status === 'abgelehnt' && z.ankauf_geaendert && Date.parse(z.ankauf_geaendert) < jetztMs - LOESCHEN_ABGELEHNT_TAGE * tag) return 'abgelehnt';
  return null;
}
