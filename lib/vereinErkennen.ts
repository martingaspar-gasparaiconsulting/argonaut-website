// ============================================================================
// ARGONAUT OS · lib/vereinErkennen.ts  (Paket 187)
//
// Claude-Befund (Rundumschlag 29.09.): Die Spalte mitglieder.vertragsart hat
// in der Datenbank den Standard 'studio' (SQL ps5), die Seite „Verträge &
// Kündigung" nimmt bei leerem Wert ebenfalls 'studio'. Ein Verein bekam damit
// für jedes neue Mitglied einen VERBRAUCHERVERTRAG (BGB § 309 Nr. 9:
// Erstlaufzeit, 1 Monat Kündigungsfrist) statt der Satzungs-Kündigung —
// das Kündigungsdatum war falsch.
//
// Jetzt: Ist der Betrieb ein Verein, bekommen neue Mitglieder 'verein', und
// noch unbearbeitete 'studio'-Einträge lassen sich mit einem Klick umstellen.
//
// Verein heißt (eine Bedingung reicht):
//   · Rechtsform oder Firmenname nennt „e. V." / „eingetragener Verein" / „Verein"
//   · gebuchte Module (tenant_module) enthalten 'verein' und NICHT 'wellness'
//     (Fitnessstudios buchen wellness; ohne gebuchte Module = keine Aussage)
//
// Rein, ohne Supabase — node-getestet in tests/sammelpaketP187.test.mjs.
// ============================================================================

export type VereinMerkmale = {
  rechtsform?: string | null;
  firmaName?: string | null;
  gebucht?: Set<string> | null;
};

const VEREIN_TEXT = /(^|[\s,(])e\.\s?v\.?($|[\s,)])|eingetragener\s+verein|verein\b|\bev$/i;

export function textNenntVerein(text: string | null | undefined): boolean {
  const t = String(text ?? '').trim();
  return t !== '' && VEREIN_TEXT.test(t);
}

export function betriebIstVerein(m: VereinMerkmale): boolean {
  if (textNenntVerein(m.rechtsform) || textNenntVerein(m.firmaName)) return true;
  const g = m.gebucht;
  if (g && g.has('verein') && !g.has('wellness')) return true;
  return false;
}

export type Vertragsart = 'studio' | 'verein';

/** Vertragsart für ein neues Mitglied bzw. bei leerem Wert. */
export function vertragsartStandard(istVerein: boolean): Vertragsart {
  return istVerein ? 'verein' : 'studio';
}

export type MitgliedVertrag = {
  vertragsart?: string | null;
  abgeschlossen_am?: string | null;
  erstlaufzeit_monate?: number | null;
  kuendigungsfrist_monate?: number | null;
  verlaengerung_monate?: number | null;
  kuendigung_zum?: string | null;
};

/**
 * Steht das Mitglied nur durch den alten Standard auf 'studio'?
 * Ja, wenn KEIN Studio-Feld je ausgefüllt und keine Kündigung eingetragen wurde.
 * Bearbeitete Einträge werden nie automatisch angefasst.
 */
export function studioNurStandard(m: MitgliedVertrag): boolean {
  if ((m.vertragsart ?? 'studio') !== 'studio') return false;
  return m.abgeschlossen_am == null && m.erstlaufzeit_monate == null
    && m.kuendigungsfrist_monate == null && m.verlaengerung_monate == null && !m.kuendigung_zum;
}
