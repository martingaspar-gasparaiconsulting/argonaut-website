// ============================================================================
// ARGONAUT OS · lib/importAktualisieren.ts  (Paket 187)
//
// Was beim Import mit „Vorhandene aktualisieren" in einen BESTEHENDEN
// Datensatz geschrieben werden darf.
//
// ▄▄▄ BEFUND (Claude, Rundumschlag 29.09. + Nachmessung 01.10.) ▄▄▄
// 1. Artikel-Import überschreibt Filialbestände: artikel.aktueller_bestand ist
//    bei Betrieben mit Filialen die SUMME aus artikel_bestand_standort (gepflegt
//    über lager_buchen). Ein Artikel-Import mit Spalte „Bestand" schrieb die
//    Zahl direkt in den Artikel — ohne Lagerbewegung, ohne Filiale. Danach
//    passten Summe und Filialen nicht mehr zusammen.
// 2. Unzugeordnete Felder wurden mit ihrem Standardwert überschrieben: Der
//    Parser füllt leere Felder mit `standard` (Bestand 0, EK 0, VK 0, Einheit
//    „Stk"). Beim Anlegen ist das richtig — beim Aktualisieren setzte eine
//    Datei OHNE Preisspalte alle vorhandenen Preise auf 0.
//
// ▄▄▄ REGEL ▄▄▄
// · Beim Aktualisieren bleibt ein Feld unangetastet, wenn es in der Datei
//   keiner Spalte zugeordnet ist UND nur den Standardwert trägt.
//   (Errechnete Felder wie der Netto-VK aus „VK brutto" haben einen echten
//   Wert und bleiben drin.)
// · Artikel bei Betrieben MIT Filialen: der Bestand wird nie über den
//   Artikel-Import geschrieben (weder neu noch aktualisiert) — dafür gibt es
//   das Ziel „Bestand je Filiale", das richtig bucht. Der Bericht sagt das.
//
// Rein, ohne Supabase — node-getestet in tests/sammelpaketP187.test.mjs.
// ============================================================================

export type FeldMitStandard = { key: string; standard?: string | number | boolean };
export type ZielFuerAktualisieren = { key: string; felder: FeldMitStandard[] };

/** Welche Zielfelder sind in der Datei wirklich einer Spalte zugeordnet? */
export function gemappteFelder(mapping: Record<string, string> | null | undefined): Set<string> {
  return new Set(Object.values(mapping ?? {}).filter((v) => typeof v === 'string' && v.trim() !== ''));
}

/** Darf der Artikel-Import den Bestand schreiben? Nur ohne Filialen. */
export function artikelBestandSperren(zielKey: string, aktiveFilialen: number): boolean {
  return zielKey === 'artikel' && aktiveFilialen > 0;
}

export const ARTIKEL_BESTAND_HINWEIS =
  'Ihr Betrieb führt Bestände je Filiale. Die Spalte „Bestand" wurde deshalb nicht in die Artikel geschrieben — bitte die Bestände über „Bestand je Filiale" importieren, dann stimmen Filialen und Summe überein.';

/**
 * Werte für ein UPDATE eines vorhandenen Datensatzes.
 * Entfernt Standardwerte unzugeordneter Felder und (bei Filialbetrieben) den Artikel-Bestand.
 */
export function werteFuerAktualisierung(
  werte: Record<string, unknown>,
  ziel: ZielFuerAktualisieren,
  gemappt: Set<string>,
  aktiveFilialen = 0,
): Record<string, unknown> {
  const aus: Record<string, unknown> = { ...werte };
  for (const f of ziel.felder) {
    if (!(f.key in aus)) continue;
    if (f.standard === undefined) continue;
    if (gemappt.has(f.key)) continue;
    if (aus[f.key] === f.standard) delete aus[f.key];
  }
  if (artikelBestandSperren(ziel.key, aktiveFilialen)) delete aus.aktueller_bestand;
  return aus;
}

/** Werte für einen NEUEN Datensatz: bei Filialbetrieben startet der Artikel mit Bestand 0. */
export function werteFuerNeuanlage(
  werte: Record<string, unknown>,
  ziel: ZielFuerAktualisieren,
  aktiveFilialen = 0,
): Record<string, unknown> {
  if (!artikelBestandSperren(ziel.key, aktiveFilialen)) return werte;
  if (!('aktueller_bestand' in werte)) return werte;
  return { ...werte, aktueller_bestand: 0 };
}

/** Hat die Datei überhaupt Bestandszahlen (≠ 0), die wegen Filialen nicht übernommen wurden? */
export function bestandVerworfen(werte: Record<string, unknown>): boolean {
  const n = Number(werte.aktueller_bestand);
  return Number.isFinite(n) && n !== 0;
}
