// ============================================================================
// ARGONAUT OS · lib/socialPruefung.ts  (Stufe 3 · B1 Social-Baustein, Paket 208)
//
// Reine Logik: KI-Entwürfe für Social Media gehen NIE ungeprüft hinaus.
//
// Claude-Befunde 05.10.2026 (vorher):
//   1. Presse, SEO-Ratgeber, E-Book und Strategie gibt es schon (Text-Werkstatt,
//      Paket PC, mit Prüf-Bestätigung). Für Social-Texte aus dem Content-
//      Fließband fehlte diese Bestätigung: ein KI-Entwurf konnte mit einem
//      Klick gepostet oder eingeplant werden, ohne dass ein Mensch ihn gelesen
//      hatte (Art. 50 Abs. 4 KI-VO — redaktionelle Verantwortung, R02).
//   2. Die Beitrags-Schnittstelle prüfte kein Modulrecht: jeder Mitarbeiter
//      konnte Beiträge des Betriebs anlegen, ändern und löschen.
//
// Regel: ki_entwurf = true und geprueft_am leer -> nicht posten, nicht
// einplanen. Wird der Text geändert, gilt die Prüfung als aufgehoben, bis
// erneut bestätigt wird.
// ============================================================================

export type PruefStand = {
  ki_entwurf?: boolean | null;
  geprueft_am?: string | null;
};

export const PRUEF_FEHLER =
  'Dieser Beitrag ist ein KI-Entwurf und noch nicht geprüft. Bitte den Text lesen und „Ich habe den Text geprüft" anhaken.';

/** Darf der Beitrag gepostet oder eingeplant werden? */
export function darfVeroeffentlichen(b: PruefStand | null | undefined): { ok: true } | { ok: false; fehler: string } {
  if (b && b.ki_entwurf === true && !String(b.geprueft_am ?? '').trim()) return { ok: false, fehler: PRUEF_FEHLER };
  return { ok: true };
}

const norm = (t: unknown) => String(t ?? '').replace(/\r\n/g, '\n').trim();

/**
 * Prüf-Stand nach dem Speichern.
 *  - angehakt: jetzt geprüft (von dieser Person)
 *  - nicht angehakt, Text unverändert: alter Stand bleibt
 *  - nicht angehakt, Text geändert: Prüfung aufgehoben
 */
export function pruefStandNachSpeichern(
  alt: { text?: string | null; geprueft_am?: string | null; geprueft_von?: string | null } | null,
  neuText: unknown,
  angehakt: unknown,
  jetztIso: string,
  person: string,
): { geprueft_am: string | null; geprueft_von: string | null } {
  if (angehakt === true) return { geprueft_am: jetztIso, geprueft_von: person };
  if (alt && norm(alt.text) === norm(neuText)) return { geprueft_am: alt.geprueft_am ?? null, geprueft_von: alt.geprueft_von ?? null };
  return { geprueft_am: null, geprueft_von: null };
}

/** Anzeige im Editor / in der Liste. */
export function pruefAnzeige(b: PruefStand | null | undefined): 'ki_offen' | 'ki_geprueft' | 'eigen' {
  if (!b || b.ki_entwurf !== true) return 'eigen';
  return String(b.geprueft_am ?? '').trim() ? 'ki_geprueft' : 'ki_offen';
}
