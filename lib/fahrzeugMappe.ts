// ============================================================================
// ARGONAUT OS · lib/fahrzeugMappe.ts — Paket 305 (10.10.2026) · FM1 Fahrzeugmappe
//
// Wer sein Auto verkaufen oder in Zahlung geben will, stellt auf der Seite
// SEINES Autohauses eine Mappe zusammen: Fahrzeugschein, 8 Pflichtfotos,
// Schäden, Kaltstart-Video, Unterlagen und Preisvorstellung. Die Mappe geht an
// genau diesen einen Betrieb (kein Marktplatz) und landet dort unter
// „Ankauf und Bewertung" als Ankauf „In Bewertung".
//
// Reine Logik, node-testbar: KEIN Import von node:crypto, Supabase oder React —
// die Datei wird auch im Browser gebraucht (Fächer, Prüfungen, Schärfe-Test).
//
// Die Schärfe-/Helligkeits-Prüfung läuft im BROWSER des Verkäufers auf einer
// verkleinerten Kopie des Fotos. Es verlässt dabei nichts das Gerät, es gibt
// keine KI und keine Kosten. Das Ergebnis ist ein HINWEIS, keine Sperre.
// ============================================================================

import { leseZahl, rundeStellen } from './zahlen';

export const MAPPE_BUCKET = 'fahrzeugmappe';
export const EINWILLIGUNG_FASSUNG = 'fm1-2026-10';
export const MAX_DATEIEN = 70;              // wie der Wächter in SQL p305
export const DOMAIN_PFAD = '/fahrzeug-verkaufen';

export type MappeArt = 'schein' | 'foto' | 'schaden' | 'video' | 'dokument';
export type Gruppe = 'schein' | 'fotos' | 'schaeden' | 'videos' | 'unterlagen';

export type Fach = {
  key: string; art: MappeArt; gruppe: Gruppe; titel: string; hinweis: string;
  pflicht: boolean; max: number; symbol: string;
};

/** Alle Fächer der Mappe in der Reihenfolge, in der der Verkäufer sie sieht. */
export const FAECHER: Fach[] = [
  { key: 'schein', art: 'schein', gruppe: 'schein', titel: 'Fahrzeugschein', hinweis: 'Zulassungsbescheinigung Teil I, Vorderseite, ganz im Bild und gut lesbar', pflicht: true, max: 2, symbol: '🪪' },
  { key: 'vorne_links', art: 'foto', gruppe: 'fotos', titel: 'Vorne schräg', hinweis: 'Von vorne links, ganzes Fahrzeug im Bild', pflicht: true, max: 1, symbol: '🚗' },
  { key: 'hinten_rechts', art: 'foto', gruppe: 'fotos', titel: 'Hinten schräg', hinweis: 'Von hinten rechts, ganzes Fahrzeug im Bild', pflicht: true, max: 1, symbol: '🚙' },
  { key: 'seite_links', art: 'foto', gruppe: 'fotos', titel: 'Seite links', hinweis: 'Fahrerseite komplett', pflicht: true, max: 1, symbol: '⬅️' },
  { key: 'seite_rechts', art: 'foto', gruppe: 'fotos', titel: 'Seite rechts', hinweis: 'Beifahrerseite komplett', pflicht: true, max: 1, symbol: '➡️' },
  { key: 'innen_vorne', art: 'foto', gruppe: 'fotos', titel: 'Innenraum vorne', hinweis: 'Von der Fahrertür aus: Sitze, Lenkrad, Armaturen', pflicht: true, max: 1, symbol: '🪑' },
  { key: 'tacho', art: 'foto', gruppe: 'fotos', titel: 'Tacho', hinweis: 'Zündung an, Kilometerstand gut lesbar, keine Warnleuchten verdecken', pflicht: true, max: 1, symbol: '⏱️' },
  { key: 'reifen', art: 'foto', gruppe: 'fotos', titel: 'Reifenprofil', hinweis: 'Nah an einem Vorderreifen, Profil gut sichtbar', pflicht: true, max: 1, symbol: '🛞' },
  { key: 'kofferraum', art: 'foto', gruppe: 'fotos', titel: 'Kofferraum', hinweis: 'Klappe offen, Laderaum und Boden', pflicht: true, max: 1, symbol: '🧳' },
  { key: 'weitere', art: 'foto', gruppe: 'fotos', titel: 'Weitere Fotos', hinweis: 'Ausstattung, Felgen, Navigation, Extras', pflicht: false, max: 12, symbol: '📸' },
  { key: 'schaden', art: 'schaden', gruppe: 'schaeden', titel: 'Schäden', hinweis: 'Kratzer, Delle, Steinschlag, Rost — nah und mit kurzer Beschreibung', pflicht: false, max: 10, symbol: '🩹' },
  { key: 'kaltstart', art: 'video', gruppe: 'videos', titel: 'Kaltstart', hinweis: 'Motor kalt starten, 15 bis 30 Sekunden laufen lassen, Tacho und Motorraum zeigen', pflicht: true, max: 1, symbol: '🔑' },
  { key: 'rundgang', art: 'video', gruppe: 'videos', titel: 'Rundgang', hinweis: 'Einmal langsam um das Fahrzeug gehen', pflicht: false, max: 1, symbol: '🔄' },
  { key: 'botschaft', art: 'video', gruppe: 'videos', titel: 'Ihre Videobotschaft', hinweis: 'Erzählen Sie kurz, was das Fahrzeug ausmacht', pflicht: false, max: 1, symbol: '🎙️' },
  { key: 'tuev', art: 'dokument', gruppe: 'unterlagen', titel: 'TÜV-/HU-Bericht', hinweis: 'Letzter Prüfbericht, Foto oder PDF', pflicht: false, max: 5, symbol: '📋' },
  { key: 'service', art: 'dokument', gruppe: 'unterlagen', titel: 'Serviceheft', hinweis: 'Alle Seiten mit Stempeln, gerne als Fotos', pflicht: false, max: 10, symbol: '📘' },
  { key: 'rechnung', art: 'dokument', gruppe: 'unterlagen', titel: 'Rechnungen', hinweis: 'Werkstatt, Reifen, Reparaturen', pflicht: false, max: 10, symbol: '🧾' },
  { key: 'sonstiges', art: 'dokument', gruppe: 'unterlagen', titel: 'Weitere Unterlagen', hinweis: 'Garantie, Gutachten, Kaufvertrag', pflicht: false, max: 5, symbol: '📎' },
];

export const GRUPPEN: { key: Gruppe; titel: string }[] = [
  { key: 'schein', titel: 'Fahrzeugschein' },
  { key: 'fotos', titel: 'Fotos' },
  { key: 'schaeden', titel: 'Schäden' },
  { key: 'videos', titel: 'Videos' },
  { key: 'unterlagen', titel: 'Unterlagen' },
];

export function fachZu(key: unknown): Fach | null {
  return typeof key === 'string' ? FAECHER.find((f) => f.key === key) ?? null : null;
}

// --- Dateiarten und Größen ------------------------------------------------------------------
const BILD = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO = ['video/mp4', 'video/quicktime', 'video/webm'];
const PDF = ['application/pdf'];

export const MIME_JE_ART: Record<MappeArt, string[]> = {
  schein: [...BILD, ...PDF], foto: BILD, schaden: BILD, video: VIDEO, dokument: [...BILD, ...PDF],
};

export const MB = 1024 * 1024;
export const MAX_BYTES = { bild: 15 * MB, video: 50 * MB, pdf: 20 * MB };

const ENDUNG: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf',
};

/** „video/webm;codecs=vp9" -> „video/webm"; Großschreibung weg. */
export function mimeSauber(m: unknown): string {
  return typeof m === 'string' ? m.split(';')[0].trim().toLowerCase() : '';
}

export function endungZu(mime: string): string | null {
  return ENDUNG[mimeSauber(mime)] ?? null;
}

export function maxBytesFuer(mime: string): number {
  const m = mimeSauber(mime);
  if (VIDEO.includes(m)) return MAX_BYTES.video;
  if (PDF.includes(m)) return MAX_BYTES.pdf;
  return MAX_BYTES.bild;
}

export function istBild(mime: string): boolean { return BILD.includes(mimeSauber(mime)); }
export function istVideo(mime: string): boolean { return VIDEO.includes(mimeSauber(mime)); }
export function istPdf(mime: string): boolean { return PDF.includes(mimeSauber(mime)); }

export function mbText(bytes: number): string {
  return `${rundeStellen(bytes / MB, 1).toLocaleString('de-DE')} MB`;
}

/**
 * Darf diese Datei in dieses Fach? Prüft Fach, Art, Größe. Die Anzahl prüft
 * `platzFrei`, den Inhalt (Schärfe) der Browser.
 */
export function dateiPruefen(e: { fach: unknown; mime: unknown; bytes: unknown }):
  { ok: true; fach: Fach; mime: string; endung: string; bytes: number } | { ok: false; fehler: string } {
  const fach = fachZu(e.fach);
  if (!fach) return { ok: false, fehler: 'Unbekanntes Fach.' };
  const mime = mimeSauber(e.mime);
  const endung = endungZu(mime);
  if (!endung || !MIME_JE_ART[fach.art].includes(mime)) {
    return { ok: false, fehler: fach.art === 'video' ? 'Bitte ein Video (MP4, MOV oder WebM).'
      : fach.art === 'dokument' || fach.art === 'schein' ? 'Bitte ein Foto oder eine PDF-Datei.' : 'Bitte ein Foto (JPEG, PNG, WebP oder HEIC).' };
  }
  const bytes = typeof e.bytes === 'number' && Number.isFinite(e.bytes) ? Math.floor(e.bytes) : NaN;
  if (!(bytes > 0)) return { ok: false, fehler: 'Die Datei ist leer.' };
  const max = maxBytesFuer(mime);
  if (bytes > max) {
    return { ok: false, fehler: istVideo(mime)
      ? `Das Video ist zu groß (${mbText(bytes)}, höchstens ${mbText(max)}). Bitte kürzer aufnehmen, 20 bis 40 Sekunden genügen.`
      : `Die Datei ist zu groß (${mbText(bytes)}, höchstens ${mbText(max)}).` };
  }
  return { ok: true, fach, mime, endung, bytes };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function istUuid(v: unknown): v is string { return typeof v === 'string' && UUID_RE.test(v); }

/** Ablage: <Betrieb>/<Mappe>/<Datei>.<endung> — alles geprüfte Kennungen, nie Namen des Kunden. */
export function mappePfad(betrieb: string, mappe: string, datei: string, endung: string): string | null {
  if (!istUuid(betrieb) || !istUuid(mappe) || !istUuid(datei) || !/^[a-z0-9]{2,5}$/.test(endung)) return null;
  return `${betrieb.toLowerCase()}/${mappe.toLowerCase()}/${datei.toLowerCase()}.${endung}`;
}

/** Zugangs-Link des Verkäufers: 32 Zufallsbytes als base64url (43 Zeichen). */
export function tokenGueltig(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
}

// --- Zählen und Vollständigkeit -------------------------------------------------------------
export type DateiKurz = { fach: string; status?: string | null };

export function anzahlJeFach(dateien: DateiKurz[]): Record<string, number> {
  const n: Record<string, number> = {};
  for (const d of dateien) if (!d.status || d.status === 'fertig') n[d.fach] = (n[d.fach] ?? 0) + 1;
  return n;
}

/**
 * Ist im Fach noch Platz? Fächer mit genau einem Platz werden beim neuen
 * Foto ERSETZT (ersetzen = true), Sammel-Fächer haben eine Obergrenze.
 */
export function platzFrei(fach: Fach, anzahl: number, gesamt: number): { ok: true; ersetzen: boolean } | { ok: false; fehler: string } {
  if (fach.max === 1) return { ok: true, ersetzen: anzahl >= 1 };
  if (gesamt >= MAX_DATEIEN) return { ok: false, fehler: `Die Mappe ist voll (höchstens ${MAX_DATEIEN} Dateien).` };
  if (anzahl >= fach.max) return { ok: false, fehler: `In „${fach.titel}" passen höchstens ${fach.max} Dateien. Bitte vorher eine löschen.` };
  return { ok: true, ersetzen: false };
}

export function vollstaendigkeit(dateien: DateiKurz[]): { fehlend: Fach[]; erledigt: number; pflicht: number; prozent: number } {
  const n = anzahlJeFach(dateien);
  const pflicht = FAECHER.filter((f) => f.pflicht);
  const fehlend = pflicht.filter((f) => !(n[f.key] > 0));
  const erledigt = pflicht.length - fehlend.length;
  return { fehlend, erledigt, pflicht: pflicht.length, prozent: Math.round((erledigt / pflicht.length) * 100) };
}

export function zusammenfassung(dateien: (DateiKurz & { art?: string })[]): { fotos: number; schaeden: number; videos: number; unterlagen: number; schein: number } {
  const z = { fotos: 0, schaeden: 0, videos: 0, unterlagen: 0, schein: 0 };
  for (const d of dateien) {
    if (d.status && d.status !== 'fertig') continue;
    const f = fachZu(d.fach);
    if (!f) continue;
    if (f.gruppe === 'fotos') z.fotos++;
    else if (f.gruppe === 'schaeden') z.schaeden++;
    else if (f.gruppe === 'videos') z.videos++;
    else if (f.gruppe === 'unterlagen') z.unterlagen++;
    else z.schein++;
  }
  return z;
}

// --- Angaben (Entwurf) ------------------------------------------------------------------------
export type Wunsch = 'verkauf' | 'inzahlungnahme';
export const ANGABEN_FELDER: Record<string, number> = {
  name: 120, email: 160, telefon: 40, plz: 10, ort: 80, marke: 60, modell: 80, variante: 80,
  erstzulassung: 10, km: 12, leistung: 6, kraftstoff: 40, fin: 30, unfall: 20, unfall_text: 300, preis: 20, beschreibung: 1500,
};

/** Entwurf säubern: nur bekannte Felder, Text gekürzt, Steuerzeichen raus. Nie wird hier etwas abgelehnt. */
export function angabenBereinigen(roh: unknown): Record<string, string | boolean> {
  const b = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const aus: Record<string, string | boolean> = {};
  for (const [k, max] of Object.entries(ANGABEN_FELDER)) {
    const v = b[k];
    if (typeof v !== 'string') continue;
    const t = v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, max);
    if (t.trim()) aus[k] = t;
  }
  if (b.gewerblich === true) aus.gewerblich = true;
  if (b.schein_gelesen === true) aus.schein_gelesen = true;   // Paket 307: Daten teils aus dem Fahrzeugschein erkannt
  if (b.wunsch === 'verkauf' || b.wunsch === 'inzahlungnahme') aus.wunsch = b.wunsch;
  return aus;
}

export function wunschText(w: unknown): string {
  return w === 'inzahlungnahme' ? 'In Zahlung geben (beim Kauf eines Fahrzeugs)' : 'Verkaufen';
}

/** Zusatz für die Notiz am Ankauf — so sieht der Händler in der Liste, was es mit der Anfrage auf sich hat. */
export function notizZusatz(wunsch: unknown, z: ReturnType<typeof zusammenfassung>): string {
  const teile = [
    `${z.fotos} ${z.fotos === 1 ? 'Foto' : 'Fotos'}`,
    `${z.schaeden} ${z.schaeden === 1 ? 'Schaden' : 'Schäden'}`,
    `${z.videos} ${z.videos === 1 ? 'Video' : 'Videos'}`,
    `${z.unterlagen} ${z.unterlagen === 1 ? 'Unterlage' : 'Unterlagen'}`,
  ];
  return [`Wunsch des Verkäufers: ${wunschText(wunsch)}`, `Fahrzeugmappe: ${teile.join(', ')} (Karte „Fahrzeugmappe" in dieser Akte)`].join('\n');
}

export function preisVorstellung(roh: unknown): number | null {
  if (typeof roh !== 'string' || !roh.trim()) return null;
  const z = leseZahl(roh);
  return z !== null && Number.isFinite(z) && z > 0 && z < 10_000_000 ? Math.round(z) : null;
}

// --- Einwilligung -------------------------------------------------------------------------------
export function einwilligungText(firma: string): string {
  const f = firma.trim() || 'das Autohaus';
  return `Ich willige ein, dass ${f} meine Angaben, Fotos, Videos und Unterlagen zur Bewertung meines Fahrzeugs und zur Kontaktaufnahme verarbeitet. Ich kann die Einwilligung jederzeit widerrufen. Werbung erhalte ich dadurch nicht.`;
}

export const FOTO_HINWEIS = 'Bitte achten Sie darauf, dass keine anderen Personen und keine fremden Kennzeichen auf den Fotos und Videos zu sehen sind.';

// --- Schärfe und Helligkeit (läuft im Browser) -------------------------------------------------
/**
 * Graustufen-Werte (0–255, Zeile für Zeile) -> Schärfe (Varianz des
 * Laplace-Filters) und mittlere Helligkeit. Erwartet ein verkleinertes Bild
 * (lange Seite ca. 640 Pixel), damit die Werte vergleichbar bleiben.
 */
export function bildMesswerte(grau: ArrayLike<number>, breite: number, hoehe: number): { schaerfe: number; helligkeit: number } {
  const w = Math.floor(breite), h = Math.floor(hoehe);
  if (!(w >= 3 && h >= 3) || grau.length < w * h) return { schaerfe: 0, helligkeit: 0 };
  let summeHell = 0;
  for (let i = 0; i < w * h; i++) summeHell += grau[i];
  let n = 0, summe = 0, summeQ = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = grau[i - w] + grau[i + w] + grau[i - 1] + grau[i + 1] - 4 * grau[i];
      summe += l; summeQ += l * l; n++;
    }
  }
  const mittel = summe / n;
  return { schaerfe: rundeStellen(summeQ / n - mittel * mittel, 1), helligkeit: rundeStellen(summeHell / (w * h), 1) };
}

export type Urteil = { stufe: 'gut' | 'unscharf' | 'dunkel' | 'hell'; text: string };
export const GRENZEN = { unscharf: 40, dunkel: 45, hell: 235 };

/** Hinweis an den Verkäufer — nie eine Sperre. */
export function bildUrteil(m: { schaerfe: number; helligkeit: number } | null | undefined): Urteil | null {
  if (!m || !Number.isFinite(m.schaerfe) || !Number.isFinite(m.helligkeit)) return null;
  if (m.helligkeit < GRENZEN.dunkel) return { stufe: 'dunkel', text: 'Ziemlich dunkel. Mehr Licht oder Blitz?' };
  if (m.helligkeit > GRENZEN.hell) return { stufe: 'hell', text: 'Sehr hell. Gegenlicht vermeiden.' };
  if (m.schaerfe < GRENZEN.unscharf) return { stufe: 'unscharf', text: 'Wirkt unscharf. Kurz stillhalten und neu aufnehmen?' };
  return { stufe: 'gut', text: 'Gut erkennbar' };
}

/** Messwerte aus dem Browser säubern, bevor sie gespeichert werden. */
export function pruefungSauber(roh: unknown): { schaerfe?: number; helligkeit?: number; stufe?: string } {
  const b = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const zahl = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? rundeStellen(v, 1) : undefined);
  const schaerfe = zahl(b.schaerfe, 100000);
  const helligkeit = zahl(b.helligkeit, 255);
  const u = schaerfe !== undefined && helligkeit !== undefined ? bildUrteil({ schaerfe, helligkeit }) : null;
  return { ...(schaerfe !== undefined ? { schaerfe } : {}), ...(helligkeit !== undefined ? { helligkeit } : {}), ...(u ? { stufe: u.stufe } : {}) };
}

/** Neue Größe für die verkleinerte Kopie (lange Seite höchstens `max`). */
export function zielGroesse(breite: number, hoehe: number, max: number): { breite: number; hoehe: number } {
  if (!(breite > 0 && hoehe > 0)) return { breite: 0, hoehe: 0 };
  const f = Math.min(1, max / Math.max(breite, hoehe));
  return { breite: Math.max(1, Math.round(breite * f)), hoehe: Math.max(1, Math.round(hoehe * f)) };
}

// --- Für die Webseite des Händlers --------------------------------------------------------------
function htmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Knopf zum Einfügen in eine FREMDE Webseite (WordPress, Jimdo …): ein normaler
 * Link mit eigenem Stil, kein Skript, kein Rahmen (iFrame) — Kamera und Upload
 * laufen dann auf der Mappen-Seite selbst.
 */
export function knopfHtml(link: string, farbe: string): string | null {
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?\/[A-Za-z0-9/_-]*$/.test(link)) return null;
  const f = /^#[0-9a-fA-F]{6}$/.test(farbe) ? farbe : '#0A1628';
  return `<a href="${htmlEsc(link)}" target="_blank" rel="noopener" style="display:inline-block;background:${f};color:#fff;padding:14px 22px;border-radius:12px;font:600 16px/1.2 system-ui,sans-serif;text-decoration:none">Fahrzeug bewerten lassen</a>`;
}

/** Menüpunkt der Webseite: nur unsere relativen Pfade. */
export function verkaufenLinkGueltig(l: unknown): l is string {
  return typeof l === 'string' && (l === DOMAIN_PFAD || /^\/ankauf\/[a-z0-9]{24}$/.test(l));
}

/** Datenschutz-Hinweis unter der Einwilligung (Verantwortlich ist das Autohaus). */
export function mappeDatenschutz(f: { name?: string; strasse?: string; plz?: string; ort?: string; email?: string }): string {
  const wer = [f.name || 'Das Autohaus', f.strasse, [f.plz, f.ort].filter(Boolean).join(' ')].filter((x) => x && String(x).trim()).join(', ');
  return `Verantwortlich: ${wer}${f.email ? `, ${f.email}` : ''}. `
    + 'Ihre Angaben, Fotos, Videos und Unterlagen werden auf Grundlage Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) und zur Vorbereitung eines Kaufvertrags (Art. 6 Abs. 1 lit. b DSGVO) '
    + 'nur zur Bewertung Ihres Fahrzeugs und zur Kontaktaufnahme verwendet und gelöscht, sobald sie dafür nicht mehr gebraucht werden und keine gesetzliche Aufbewahrungspflicht besteht. '
    + 'Sie können Ihre Einwilligung jederzeit widerrufen und haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Beschwerde bei einer Datenschutz-Aufsichtsbehörde. '
    + 'Die Dateien liegen in einem geschützten Speicher in der EU. Technisch betrieben mit ARGONAUT OS (Gaspar AI Consulting, Böblingen) als Auftragsverarbeiter. '
    + 'Nur wenn Sie „Automatisch ausfüllen" wählen, wird das Foto Ihres Fahrzeugscheins einmalig an Anthropic PBC (USA, Standardvertragsklauseln) übermittelt, um die Fahrzeugdaten zu lesen; '
    + 'Namen und Anschrift werden dabei nicht ausgelesen, das Ergebnis ist nur ein Vorschlag, den Sie selbst prüfen und übernehmen.';
}
