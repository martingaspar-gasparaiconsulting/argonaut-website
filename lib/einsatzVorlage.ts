// ============================================================================
// ARGONAUT OS · lib/einsatzVorlage.ts — Paket 313 (11.10.2026) · BV2 Einsätze
// Einsätze im Dispo-Board nach Branchen-Vorlage (lib/branchenVorlage.ts, Modul
// „einsaetze"): Kalendertag in Europe/Berlin, gespeicherte Suchen über alle
// Wochen hinweg.
//
//   ampel=rot          = Tag vorbei, Einsatz noch geplant / unterwegs / vor Ort
//   tag=heute          = Einsatz heute (nicht abgesagt)
//   abgerechnet=nein   = erledigt, aber keine Rechnung daraus erzeugt
//
// Reine Funktionen, keine Seiteneffekte. Node-getestet: tests/einsatzVorlageP313.test.mjs
// ============================================================================

export interface EinsatzLite {
  beginn_am?: string | null;
  status?: string | null;
  rechnung_id?: string | null;
}

const OFFEN = new Set(['geplant', 'unterwegs', 'vor_ort']);

/** Kalendertag des Beginns in Europe/Berlin ('YYYY-MM-DD'); null ohne gültiges Datum. */
export function einsatzTag(beginn: string | null | undefined): string | null {
  if (!beginn) return null;
  const d = new Date(beginn);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

/** Noch nicht erledigt und nicht abgesagt (ohne Status = geplant). */
export function offen(e: EinsatzLite): boolean {
  return OFFEN.has(String(e.status ?? 'geplant'));
}

/**
 * Gespeicherte Suche anwenden. Bekannte Regeln:
 *   ampel=rot · tag=heute · abgerechnet=nein
 * Unbekannte Regeln treffen nichts (lieber leer als falsch).
 */
export function suchePasst(regel: string, e: EinsatzLite, heute: string): boolean {
  const r = String(regel || '').trim();
  const tag = einsatzTag(e.beginn_am);
  if (r === 'ampel=rot') return offen(e) && tag !== null && tag < heute;
  if (r === 'tag=heute') return tag === heute && e.status !== 'abgesagt';
  if (r === 'abgerechnet=nein') return e.status === 'erledigt' && !String(e.rechnung_id ?? '').trim();
  return false;
}

/** Treffer einer Suche, nach Beginn sortiert (ohne Datum zuletzt). */
export function treffer<T extends EinsatzLite>(liste: readonly T[], regel: string, heute: string): T[] {
  return liste
    .filter((e) => suchePasst(regel, e, heute))
    .sort((a, b) => (a.beginn_am ?? '\uffff').localeCompare(b.beginn_am ?? '\uffff'));
}
