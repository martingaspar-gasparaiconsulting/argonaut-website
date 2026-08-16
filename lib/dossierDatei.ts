// ============================================================================
// ARGONAUT OS · lib/dossierDatei.ts
//
// EINE Quelle fuer den Dateinamen eines Branchen-Dossiers im Bucket.
//
// WARUM DAS EINE EIGENE DATEI IST
// Das Versions-Suffix stand bisher als Zeichenkette mitten in
// /api/oeffentlich/dossier-pdf. Solange nur eine Stelle es kannte, ging das
// gut. Mit dem Control-Room greift eine ZWEITE Stelle auf dieselben Dateien
// zu — und zwei hartkodierte Suffixe laufen frueher oder spaeter
// auseinander. Dann erzeugt der Control-Room Dateien, die die oeffentliche
// Route nie findet, und jeder Abruf rendert erneut. Der Fehler waere teuer
// und voellig unsichtbar.
//
// VERSION HOCHZAEHLEN, WENN SICH DAS LAYOUT AENDERT
// Alte Dateien werden dadurch nicht geloescht, aber nicht mehr gefunden —
// beim naechsten Abruf entsteht die neue Fassung. Wer sofort alles neu haben
// will, erzeugt sie im Control-Room im Stapel vor.
//
// Keine Imports — node-testbar.
// ============================================================================

/**
 * eb1–eb3: frueherer heller Stand.
 * eb4: dunkel, saubere Seitenumbrueche, Ueberschrift bleibt bei ihrem Block.
 */
export const DOSSIER_VERSION = 'eb4';

/** Der Dateiname im Bucket `dossiers` fuer einen Branchen-Schluessel. */
export function dossierDateiPfad(key: string): string {
  const sauber = String(key || 'allgemein').trim() || 'allgemein';
  return `${sauber}-${DOSSIER_VERSION}.pdf`;
}

/** Gehoert eine Datei zur aktuellen Fassung? */
export function istAktuelleFassung(dateiName: string): boolean {
  return String(dateiName || '').endsWith(`-${DOSSIER_VERSION}.pdf`);
}

/** Der Branchen-Schluessel zurueck aus einem Dateinamen der aktuellen Fassung. */
export function keyAusDatei(dateiName: string): string | null {
  const n = String(dateiName || '');
  const endung = `-${DOSSIER_VERSION}.pdf`;
  if (!n.endsWith(endung)) return null;
  const key = n.slice(0, -endung.length);
  return key || null;
}
