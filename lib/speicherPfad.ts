// ============================================================================
// ARGONAUT OS · lib/speicherPfad.ts — Gehört dieser Speicher-Pfad dem Betrieb? (Paket 184)
//
// Claude-Befund (Rundumschlag M5): Einige Download-/Lösch-Wege nahmen den
// Datei-Pfad aus einer Zeile, die der Betrieb selbst beschreiben kann, und
// erzeugten damit per Dienstschlüssel einen Link. Wer den Pfad in seiner Zeile
// auf eine fremde Datei umschrieb (Dateiname bekannt), bekam die fremde Datei.
//
// Regel: Ein Pfad muss im Ordner einer Kennung des eigenen Betriebs liegen
// (`<kennung>/…`) und darf nichts enthalten, was aus dem Ordner herausführt.
//
// Rein, ohne Importe — node-getestet (tests/dateienImportP184).
// ============================================================================

/** Ist der Pfad sauber (kein .., kein \, kein //, kein führender /, keine Steuerzeichen)? */
export function pfadSauber(pfad: unknown): pfad is string {
  if (typeof pfad !== 'string') return false;
  const p = pfad;
  if (!p || p.length > 1024) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('//')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return false;
  if (p.split('/').some((teil) => teil === '..' || teil === '.' || teil === '')) return false;
  if (/%2e|%2f|%5c/i.test(p)) return false;
  return true;
}

/**
 * Liegt der Pfad im Ordner einer der erlaubten Kennungen?
 * `ordner` = Kennungen des Betriebs (Chef + Mitarbeiter-Zugänge).
 */
export function pfadImOrdner(pfad: unknown, ordner: ReadonlyArray<string | null | undefined>): boolean {
  if (!pfadSauber(pfad)) return false;
  const erste = pfad.split('/')[0].toLowerCase();
  if (!erste || pfad.split('/').length < 2) return false;
  return ordner.some((o) => typeof o === 'string' && o.trim() !== '' && o.trim().toLowerCase() === erste);
}

/** Dateiname für Speicher-Pfade: nur Buchstaben, Ziffern, . _ - (Umlaute umgeschrieben). */
export function sichererDateiname(name: unknown, ersatz = 'datei'): string {
  const s = String(name ?? '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/\.{2,}/g, '.')
    .replace(/^[._-]+/, '').slice(0, 100);
  return s || ersatz;
}
