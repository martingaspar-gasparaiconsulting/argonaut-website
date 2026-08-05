// ============================================================================
// ARGONAUT OS · lib/aktiverStandort.ts — aktiver Standort (Filial-Umschalter, G3)
//
// Der im Header gewählte Standort wird in einem Cookie gehalten, damit er über
// Seitenwechsel hinweg bleibt und später auch serverseitig gelesen werden kann.
// Wert = standort_id ODER 'alle' (kein Zuschnitt). KEINE Supabase-Aufrufe,
// KEINE Hooks — in Browser UND Node nutzbar (Server-Zweige sind abgesichert).
// ============================================================================

export const STANDORT_COOKIE = 'argonaut_standort';
export const ALLE_STANDORTE = 'alle';

/** Liest den aktiven Standort aus dem Cookie (Browser). Server -> 'alle'. */
export function leseStandortCookie(): string {
  if (typeof document === 'undefined') return ALLE_STANDORTE;
  const m = document.cookie.match(/(?:^|;\s*)argonaut_standort=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : ALLE_STANDORTE;
}

/** Setzt den aktiven Standort (Browser). Ein Jahr gültig, pfadweit. */
export function setzeStandortCookie(wert: string): void {
  if (typeof document === 'undefined') return;
  const v = encodeURIComponent(wert || ALLE_STANDORTE);
  document.cookie = `${STANDORT_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** true = ein konkreter Standort ist aktiv (nicht 'alle' / leer). */
export function istStandortAktiv(wert: string | null | undefined): boolean {
  return !!wert && wert !== ALLE_STANDORTE;
}
