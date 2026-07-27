// ============================================================================
// ARGONAUT OS · lib/kurse.ts — Kurs-/Teilnehmer-Formeln (A2)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Kapazität &
// Warteliste, Wartelisten-Rang, Anwesenheitsquote und Zertifikats-Berechtigung.
// Status-Werte kompatibel zum bestehenden Bildung-Modul:
//   angemeldet | bestaetigt | teilgenommen | storniert | warteliste
// ============================================================================

export interface AnmeldungBasis {
  id?: string;
  status?: string | null;
  warteliste_seit?: string | null;
}

/** Diese Status belegen einen Platz (zählen gegen die Kapazität). */
export const BELEGT_STATUS = ['angemeldet', 'bestaetigt', 'teilgenommen'];

/** Belegt dieser Status einen Platz? (Warteliste & Storno zählen NICHT.) */
export function istBelegend(status?: string | null): boolean {
  return BELEGT_STATUS.includes(String(status || ''));
}

/** Wie viele Plätze sind belegt? */
export function zaehleBelegt(anmeldungen: AnmeldungBasis[]): number {
  let n = 0;
  for (const a of anmeldungen) if (istBelegend(a.status)) n++;
  return n;
}

/** Freie Plätze (nie negativ). */
export function freiePlaetze(plaetze: number, anmeldungen: AnmeldungBasis[]): number {
  return Math.max(0, (Number(plaetze) || 0) - zaehleBelegt(anmeldungen));
}

/** Ist der Kurs voll? */
export function istVoll(plaetze: number, anmeldungen: AnmeldungBasis[]): boolean {
  return freiePlaetze(plaetze, anmeldungen) <= 0;
}

/** Warteliste nach Eintragungs-Zeitpunkt sortiert (frühester zuerst). */
export function wartelisteSortiert<T extends AnmeldungBasis>(anmeldungen: T[]): T[] {
  return anmeldungen
    .filter((a) => a.status === 'warteliste')
    .sort((x, y) => String(x.warteliste_seit || '').localeCompare(String(y.warteliste_seit || '')));
}

/** Rang auf der Warteliste (1-basiert); 0 = nicht auf der Warteliste. */
export function wartelisteRang(anmeldungen: AnmeldungBasis[], id: string): number {
  const liste = wartelisteSortiert(anmeldungen);
  const i = liste.findIndex((a) => a.id === id);
  return i < 0 ? 0 : i + 1;
}

/** Der nächste Nachrücker (frühester Wartelisten-Eintrag) oder null. */
export function naechsterNachruecker<T extends AnmeldungBasis>(anmeldungen: T[]): T | null {
  const liste = wartelisteSortiert(anmeldungen);
  return liste.length ? liste[0] : null;
}

/** Anwesenheitsquote 0..1 (anwesend / Gesamt-Termine). */
export function anwesenheitsQuote(anwesend: number, gesamtTermine: number): number {
  const g = Number(gesamtTermine) || 0;
  if (g <= 0) return 0;
  return Math.max(0, Math.min(1, (Number(anwesend) || 0) / g));
}

/**
 * Zertifikats-Berechtigung: mind. `schwelle` (Standard 80 %) der Termine
 * anwesend UND es gab überhaupt Termine.
 */
export function zertifikatBerechtigt(anwesend: number, gesamtTermine: number, schwelle = 0.8): boolean {
  const g = Number(gesamtTermine) || 0;
  if (g <= 0) return false;
  return anwesenheitsQuote(anwesend, g) >= schwelle;
}

/** Kennzahlen über alle Kurse/Anmeldungen (fürs Cockpit/Auge). */
export function zaehleKurse(
  kurse: { id: string; plaetze: number }[],
  anmeldungen: (AnmeldungBasis & { kurs_id?: string })[],
): { kurse: number; teilnehmer: number; warteliste: number; freiePlaetze: number } {
  let teilnehmer = 0, warteliste = 0, freie = 0;
  for (const k of kurse) {
    const anm = anmeldungen.filter((a) => a.kurs_id === k.id);
    teilnehmer += zaehleBelegt(anm);
    warteliste += anm.filter((a) => a.status === 'warteliste').length;
    freie += freiePlaetze(k.plaetze, anm);
  }
  return { kurse: kurse.length, teilnehmer, warteliste, freiePlaetze: freie };
}
