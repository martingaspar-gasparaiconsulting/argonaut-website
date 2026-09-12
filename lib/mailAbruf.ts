// ============================================================================
// ARGONAUT OS · lib/mailAbruf.ts   (Punkt 3.4 · E-Mail Push 3)
//
// Reine, node-testbare Logik für die drei neuen Fähigkeiten des Posteingangs:
// Ordner wählen, suchen, Anhänge herunterladen. Kein IMAP, kein Netz — der
// Abruf selbst bleibt in den Routen.
//
// ▄▄▄ WARUM EIN ANHANG DER GEFÄHRLICHSTE TEIL DES POSTEINGANGS IST ▄▄▄
// Ein Anhang ist eine Datei, die ein Fremder geschickt hat — mit einem Namen,
// den er sich ausgesucht hat, und einem Typ, den er selbst angegeben hat.
// Beides landet in HTTP-Kopfzeilen und im Browser des Chefs. Drei Dinge dürfen
// deshalb nie passieren:
//
//   1) ANZEIGEN STATT HERUNTERLADEN. Läge eine Mail-Anlage als text/html oder
//      image/svg+xml INLINE auf unserer eigenen Adresse, liefe fremdes Skript
//      im angemeldeten Dashboard — mit Zugriff auf die Sitzung. Deshalb geht
//      jeder Anhang ausnahmslos als `attachment` raus, nie als `inline`.
//   2) FREMDER TYP UNGEPRÜFT. Der vom Absender behauptete Content-Type wird
//      nur übernommen, wenn er auf einer kurzen, harmlosen Liste steht. Alles
//      andere wird zu application/octet-stream — der Browser zeigt es dann
//      nicht an, sondern legt es weg.
//   3) KOPFZEILEN-SCHMUGGEL. Ein Dateiname mit Anführungszeichen, Semikolon
//      oder Zeilenumbruch kann eine HTTP-Kopfzeile aufbrechen. Der Name wird
//      deshalb hart gesäubert und zusätzlich nach RFC 5987 kodiert, damit
//      Umlaute trotzdem ankommen.
// ============================================================================

/** Mehr als das liefern wir nicht aus — eine Serverless-Antwort ist begrenzt. */
export const MAX_ANHANG_BYTES = 20 * 1024 * 1024;

/**
 * Typen, die ein Browser gefahrlos benennen darf. Bewusst KURZ und ohne
 * text/html, image/svg+xml oder irgendetwas mit Skript. Im Zweifel lieber
 * octet-stream: eine Datei, die heruntergeladen statt angezeigt wird, kann
 * im Browser nichts anrichten.
 */
const TYP_ERLAUBT = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'text/plain', 'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
]);

/**
 * Macht aus dem behaupteten Typ einen, den wir ausliefern. Parameter hinter
 * dem Semikolon (charset, name=…) fliegen weg — dort steckt sonst der
 * Schmuggel.
 */
export function sichererTyp(roh: unknown): string {
  const t = String(roh ?? '').split(';')[0].trim().toLowerCase();
  if (!t) return 'application/octet-stream';
  return TYP_ERLAUBT.has(t) ? t : 'application/octet-stream';
}

/**
 * Säubert den Dateinamen: Pfadanteile, Steuerzeichen und alles, was eine
 * Kopfzeile aufbrechen könnte. Gibt nie einen leeren Namen zurück.
 */
export function sichererDateiname(roh: unknown): string {
  let n = String(roh ?? '').trim();
  // Pfadanteile: nur der letzte Teil zählt — schützt vor ../ und C:\…
  const teile = n.split(/[/\\]/);
  n = teile[teile.length - 1] || '';
  // Steuerzeichen und Kopfzeilen-Zeichen raus
  n = n.replace(/[\u0000-\u001F\u007F]/g, '').replace(/["';\r\n]/g, '');
  n = n.replace(/^\.+/, '').trim();
  if (!n) return 'anhang';
  return n.slice(0, 200);
}

/** ASCII-Fassung für alte Browser — alles Fremde wird zum Unterstrich. */
export function asciiName(name: string): string {
  const a = name.replace(/[^\x20-\x7E]/g, '_').replace(/["';\r\n]/g, '');
  return a.trim() || 'anhang';
}

/**
 * Baut die Content-Disposition. IMMER `attachment` — siehe Kopf dieser Datei.
 * Der Name kommt zweimal: einmal in ASCII, einmal nach RFC 5987 mit Umlauten.
 */
export function contentDisposition(name: string): string {
  const sauber = sichererDateiname(name);
  const ascii = asciiName(sauber);
  const kodiert = encodeURIComponent(sauber).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${ascii}"; filename*=UTF-8''${kodiert}`;
}

/** Der Index kommt aus der Adresszeile — er muss eine echte Zahl ab 0 sein. */
export function anhangIndex(roh: unknown): number | null {
  const s = String(roh ?? '').trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 && n < 200 ? n : null;
}

/**
 * Welcher Ordner darf geöffnet werden. Der Wunsch kommt vom Browser, die
 * Liste vom Server — geöffnet wird nur, was der Server selbst gemeldet hat.
 * Ohne Wunsch: INBOX. Unbekannter Wunsch: null, also Abbruch statt Rateversuch.
 */
export function ordnerErlaubt(wunsch: unknown, vorhandene: string[]): string | null {
  const w = String(wunsch ?? '').trim();
  if (!w) return 'INBOX';
  if (w.length > 200) return null;
  if (/[\r\n\u0000]/.test(w)) return null;
  if (w.toUpperCase() === 'INBOX') return 'INBOX';
  return vorhandene.includes(w) ? w : null;
}

/**
 * Der Suchtext. Leer heisst: nicht suchen, alles holen. Länge begrenzt, damit
 * niemand dem Postfach eine Monster-Abfrage schickt.
 */
export function suchText(roh: unknown): string | null {
  const s = String(roh ?? '').trim();
  if (!s) return null;
  return s.slice(0, 100);
}

/**
 * Baut das Suchkriterium für ImapFlow. Bewusst als OBJEKT, nicht als
 * zusammengebauter Text: so kann kein Suchbegriff die Abfrage verändern.
 * Gesucht wird in Betreff UND Absender — das ist, wonach man wirklich sucht.
 */
export function suchKriterium(text: string): { or: Array<{ subject?: string; from?: string }> } {
  return { or: [{ subject: text }, { from: text }] };
}

/** Ordnerliste aufräumen: keine Duplikate, keine leeren, INBOX immer zuerst. */
export function ordnerListe(roh: Array<{ path?: unknown }> | null | undefined): string[] {
  const gesehen = new Set<string>();
  const raus: string[] = [];
  for (const o of roh ?? []) {
    const p = String(o?.path ?? '').trim();
    if (!p || gesehen.has(p)) continue;
    gesehen.add(p);
    raus.push(p);
  }
  raus.sort((a, b) => {
    if (a.toUpperCase() === 'INBOX') return -1;
    if (b.toUpperCase() === 'INBOX') return 1;
    return a.localeCompare(b, 'de');
  });
  return raus;
}

/** Lesbare Größe für die Anzeige am Anhang. */
export function groesseText(bytes: unknown): string {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
