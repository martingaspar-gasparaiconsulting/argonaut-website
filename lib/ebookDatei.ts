// ============================================================================
// ARGONAUT OS · lib/ebookDatei.ts
//
// EINE Quelle fuer den Dateinamen eines Branchen-E-Books im Bucket.
// Genau wie lib/dossierDatei.ts, aus demselben Grund: sobald eine zweite
// Stelle dieselben Dateien anfasst, laufen zwei hartkodierte Suffixe frueher
// oder spaeter auseinander — dann erzeugt der Control-Room Dateien, die die
// oeffentliche Route nie findet, und jeder Abruf rendert erneut. Der Fehler
// waere teuer und voellig unsichtbar.
//
// WANN DIE VERSION HOCHGEZAEHLT WIRD
// Bei jeder Aenderung am LAYOUT. Nicht bei geaenderten Kapiteltexten — dafuer
// gibt es den Inhalts-Stempel unten.
//
// WARUM ES ZUSAETZLICH EINEN INHALTS-STEMPEL GIBT
// Ein Dossier aendert sich nur, wenn sich der Code aendert. Ein E-Book aendert
// sich, sobald Martin ein Kapitel freigibt — der Code bleibt derselbe. Ohne
// Stempel laege die alte Datei im Bucket und niemand bekaeme die neuen
// Kapitel je zu sehen. Der Stempel ist die Zahl der freigegebenen Bausteine
// plus der juengste Aenderungszeitpunkt: beides zusammen aendert sich
// zuverlaessig, wenn sich am Inhalt etwas tut, und bleibt gleich, wenn nicht.
//
// Keine Imports — node-testbar.
// ============================================================================

/** eb1: erste Fassung des E-Book-Layouts (dunkel, wie das Dossier). */
export const EBOOK_VERSION = 'eb1';

/**
 * Ein kurzer, stabiler Stempel ueber den Inhalt.
 * Gleiche Kapitel -> gleicher Stempel. Ein Kapitel mehr oder ein spaeter
 * geaendertes -> anderer Stempel -> neue Datei im Bucket.
 */
export function inhaltsStempel(anzahl: number, juengsteAenderung: string | null | undefined): string {
  const n = Math.max(0, Math.floor(Number(anzahl) || 0));
  const roh = String(juengsteAenderung ?? '').trim();

  // Die Zeit auf die Minute genau — Sekunden und Zeitzonen-Schreibweisen
  // unterscheiden sich je nach Treiber und wuerden sonst Dateien erzeugen,
  // die sich nur im Namen unterscheiden.
  const zeit = new Date(roh);
  const teil = isNaN(zeit.getTime())
    ? '0'
    : String(Math.floor(zeit.getTime() / 60000).toString(36));

  return `${n}-${teil}`;
}

/** Der Dateiname im Bucket `ebooks` fuer einen Branchen-Schluessel. */
export function ebookDateiPfad(key: string, stempel: string): string {
  const sauber = String(key || 'allgemein').trim() || 'allgemein';
  const st = String(stempel || '0').replace(/[^a-z0-9-]/gi, '') || '0';
  return `${sauber}-${EBOOK_VERSION}-${st}.pdf`;
}

/** Gehoert eine Datei zur aktuellen Layout-Fassung? (Inhalt egal) */
export function istAktuellesLayout(dateiName: string): boolean {
  return new RegExp(`-${EBOOK_VERSION}-[a-z0-9-]+\\.pdf$`, 'i').test(String(dateiName || ''));
}

/** Der Branchen-Schluessel zurueck aus einem Dateinamen. null, wenn er nicht passt. */
export function keyAusDatei(dateiName: string): string | null {
  const n = String(dateiName || '');
  const treffer = n.match(new RegExp(`^(.+)-${EBOOK_VERSION}-[a-z0-9-]+\\.pdf$`, 'i'));
  const key = treffer?.[1];
  return key ? key : null;
}

/** Sauberer Download-Name, z. B. ARGONAUT-Handbuch-Dachdecker.pdf */
export function downloadName(brancheName: string): string {
  const sauber = String(brancheName || 'Allgemein')
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return `ARGONAUT-Handbuch-${sauber || 'Allgemein'}.pdf`;
}
