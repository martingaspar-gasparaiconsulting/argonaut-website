// ============================================================================
// ARGONAUT OS · lib/foerder.ts — Fördermittel-Nachweis-Formeln (Baustein 6)
//
// Reine Logik: KEINE Supabase-Aufrufe, KEINE React-Hooks. Fristen-Ampel für
// Antrags- und Nachweisfristen, Rest-Verwendung eines bewilligten Betrags und
// die Frage „braucht dieses Vorhaben noch einen Verwendungsnachweis?".
// ============================================================================

export interface FoerderBasis {
  status?: string | null;            // interessiert|beantragt|bewilligt|abgelehnt|abgeschlossen
  frist?: string | null;             // nächste Antrags-/relevante Frist
  nachweis_frist?: string | null;    // Frist für den Verwendungsnachweis
  nachweis_status?: string | null;   // offen|eingereicht|anerkannt
  bewilligt_betrag?: number | null;
  verwendet_betrag?: number | null;
}

/** Resttage bis Frist (negativ = überfällig), oder null ohne Frist. */
export function fristRestTage(frist?: string | null, heuteIso?: string): number | null {
  if (!frist || !heuteIso) return null;
  const f = new Date(frist.slice(0, 10) + 'T00:00:00').getTime();
  const h = new Date(heuteIso.slice(0, 10) + 'T00:00:00').getTime();
  if (isNaN(f) || isNaN(h)) return null;
  return Math.ceil((f - h) / 86400000);
}

export type FristBucket = 'ueberfaellig' | 'bald' | 'ok' | 'kein';

/** Fristen-Einordnung: überfällig · bald (<= warnTage) · ok · kein (ohne Frist). */
export function fristBucket(frist?: string | null, heuteIso?: string, warnTage = 14): FristBucket {
  const t = fristRestTage(frist, heuteIso);
  if (t == null) return 'kein';
  if (t < 0) return 'ueberfaellig';
  if (t <= warnTage) return 'bald';
  return 'ok';
}

/** Rest-Betrag, der noch zu verwenden/nachzuweisen ist (bewilligt − verwendet). */
export function restVerwendung(bewilligt?: number | null, verwendet?: number | null): number {
  return (Number(bewilligt) || 0) - (Number(verwendet) || 0);
}

/** Verwendungs-Quote in % (verwendet / bewilligt), oder null ohne Bewilligung. */
export function verwendungsQuote(bewilligt?: number | null, verwendet?: number | null): number | null {
  const b = Number(bewilligt) || 0;
  if (b <= 0) return null;
  return Math.round(((Number(verwendet) || 0) / b) * 1000) / 10;
}

/** Braucht das Vorhaben noch einen (offenen) Verwendungsnachweis? */
export function nachweisOffen(v: FoerderBasis): boolean {
  const relevant = v.status === 'bewilligt' || v.status === 'abgeschlossen';
  return relevant && v.nachweis_status !== 'anerkannt';
}

/** Kennzahlen über eine Vorhaben-Liste (für das Fristen-/Nachweis-Cockpit). */
export function zaehleFoerder(
  liste: FoerderBasis[],
  heuteIso: string,
  warnTage = 14,
): { gesamt: number; bewilligt: number; summeBewilligt: number; fristenOffen: number; nachweiseOffen: number } {
  let gesamt = 0, bewilligt = 0, summeBewilligt = 0, fristenOffen = 0, nachweiseOffen = 0;
  for (const v of liste) {
    gesamt++;
    if (v.status === 'bewilligt') { bewilligt++; summeBewilligt += Number(v.bewilligt_betrag) || 0; }

    // Antragsfrist zählt, solange noch nicht beantragt/bewilligt (interessiert/beantragt).
    const af = fristBucket(v.frist, heuteIso, warnTage);
    if ((af === 'ueberfaellig' || af === 'bald') && (v.status === 'interessiert' || v.status === 'beantragt')) fristenOffen++;

    // Nachweisfrist zählt, solange der Nachweis noch offen ist.
    const nf = fristBucket(v.nachweis_frist, heuteIso, warnTage);
    if ((nf === 'ueberfaellig' || nf === 'bald') && nachweisOffen(v)) fristenOffen++;

    if (nachweisOffen(v)) nachweiseOffen++;
  }
  return { gesamt, bewilligt, summeBewilligt, fristenOffen, nachweiseOffen };
}
