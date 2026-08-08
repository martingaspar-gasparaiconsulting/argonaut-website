// ============================================================================
// ARGONAUT OS · lib/standortDaten.ts — Standort-Zuschnitt der Modul-Daten (Block D)
//
// Ergänzt den Filial-Umschalter (lib/aktiverStandort.ts) um den RECORD-LEVEL-
// Zuschnitt: neue Datensätze werden dem aktiven Standort zugeordnet, Listen
// werden fail-open gefiltert (Datensätze OHNE Standort bleiben überall sichtbar,
// nichts verschwindet). Muster, das Modul für Modul ausgerollt wird.
//
// Reine Funktionen — in Browser UND Server nutzbar. Der Cookie-Wert kommt vom
// Aufrufer (Server: next/headers cookies(); Client: leseStandortCookie()).
// ============================================================================

import { ALLE_STANDORTE } from './aktiverStandort';

// UUID-Streng: nur ein gültiger Standort-Schlüssel wird durchgelassen — schützt
// zugleich vor Einschleusen in Supabase-Filterstrings (.or(...)).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Liefert die konkrete Standort-ID, wenn ein einzelner Standort aktiv ist —
 * sonst null (Wert 'alle', leer oder ungültig => kein Zuschnitt).
 */
export function konkreterStandort(wert: string | null | undefined): string | null {
  const w = (wert || '').trim();
  if (!w || w === ALLE_STANDORTE) return null;
  return UUID_RE.test(w) ? w : null;
}

/**
 * Fail-open-Filterausdruck für Supabase `.or(...)`: Datensätze des aktiven
 * Standorts PLUS solche ohne Standort (Alt-/Website-Daten). Nur aufrufen, wenn
 * konkreterStandort() eine ID geliefert hat (die ID ist dann uuid-geprüft).
 */
export function standortOrFilter(standortId: string): string {
  return `standort_id.eq.${standortId},standort_id.is.null`;
}
