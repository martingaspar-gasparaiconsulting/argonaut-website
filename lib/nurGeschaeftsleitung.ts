// ============================================================================
// ARGONAUT OS · lib/nurGeschaeftsleitung.ts — B1b-2 (26.09.2026), „Darf abrechnen" (27.09.2026)
//
// Der ursprüngliche Fehler (B1b-2): Alle 17 „Rechnung aus …"-Wege legten die
// Rechnung auf die Person, die klickt. Klickte ein Mitarbeiter, entstand eine
// Rechnung, die der Chef nie sah und die in EÜR, Mahnwesen und Finanzen fehlte.
// Die schnelle Lösung vom 26.09.: Rechnungen und Zahlungen nur der Chef.
//
// Martins Entscheidung 27.09.2026: Das passt nicht zum echten Betrieb — die
// Büroleitung muss abrechnen können, der Chef will kontrollieren, nicht tippen.
// Deshalb gibt es das Recht „💶 Darf abrechnen" (mitarbeiter.darf_abrechnen,
// setzen kann es nur der Eigentümer auf /dashboard/rechte).
//
// Regel ab jetzt:
//   - Chef: rechnet ab wie bisher, Besitzer = er selbst.
//   - Mitarbeiter MIT Haken: rechnet ab, Besitzer = der BETRIEB (Chef-Kennung).
//     Der Chef sieht alles sofort und bekommt eine Meldung in der Glocke.
//   - Mitarbeiter OHNE Haken: klare Meldung, es entsteht nichts.
//   - Stornieren, Reaktivieren, Zahlungen löschen: nur die Geschäftsleitung
//     (in der Datenbank durch supabase-sql/darf-abrechnen.sql abgesichert).
//
// Ist die Datenbank-Funktion darf_ich_abrechnen() noch nicht da (SQL nicht
// gelaufen), gilt für Mitarbeiter „kein Recht" — nie still erlauben.
// ============================================================================

export const RECHNUNG_NUR_CHEF =
  'Rechnungen erstellt die Geschäftsleitung oder wer das Recht „Darf abrechnen" hat. Der Vorgang bleibt offen und kann dort abgerechnet werden.';

export const ZAHLUNG_NUR_CHEF =
  'Zahlungen erfasst die Geschäftsleitung oder wer das Recht „Darf abrechnen" hat — sonst stimmen Rechnungsstatus und Zahlungsliste nicht überein.';

export const STORNO_NUR_CHEF = 'Stornieren und Reaktivieren macht die Geschäftsleitung.';

export const ZAHLUNG_LOESCHEN_NUR_CHEF = 'Zahlungen löscht die Geschäftsleitung.';

export const SEPA_NUR_CHEF =
  'SEPA-Lastschriften und Gläubigerdaten pflegt die Geschäftsleitung — dort hängen Bankdaten des Betriebs dran.';

/** Ist das Ergebnis von mein_chef_id() ein Chef — also die Person Mitarbeiter? */
export function istMitarbeiterKennung(chef: unknown): boolean {
  return typeof chef === 'string' && chef.trim().length > 0;
}

type RpcFaehig = { rpc: (fn: string) => PromiseLike<{ data: unknown; error?: unknown }> };

/** Ergebnis der Prüfung: für wen wird abgerechnet — oder warum nicht. */
export type Abrechnung =
  | { ok: true; betrieb: string; mitarbeiter: boolean }
  | { ok: false; fehler: string };

/**
 * Reine Entscheidung (ohne Datenbank, testbar).
 * @param chef       Ergebnis von mein_chef_id() (null beim Chef)
 * @param darf       Ergebnis von darf_ich_abrechnen() (nur für Mitarbeiter relevant)
 * @param eigeneId   Kennung der angemeldeten Person
 * @param meldung    Text, falls das Recht fehlt
 */
export function abrechnungEntscheiden(chef: unknown, darf: unknown, eigeneId: string, meldung: string = RECHNUNG_NUR_CHEF): Abrechnung {
  if (!istMitarbeiterKennung(chef)) return { ok: true, betrieb: eigeneId, mitarbeiter: false };
  if (darf === true) return { ok: true, betrieb: String(chef).trim(), mitarbeiter: true };
  return { ok: false, fehler: meldung };
}

/**
 * Darf die angemeldete Person abrechnen — und für welchen Betrieb?
 * Chef: betrieb = eigene Kennung. Mitarbeiter mit Haken: betrieb = Chef.
 * Beim Chef bleibt ein Fehler von mein_chef_id() wie bisher folgenlos (RLS schützt weiter).
 */
export async function abrechnungPruefen(supabase: unknown, eigeneId: string, meldung: string = RECHNUNG_NUR_CHEF): Promise<Abrechnung> {
  const sb = supabase as RpcFaehig;
  let chef: unknown = null;
  try {
    chef = (await sb.rpc('mein_chef_id')).data;
  } catch {
    chef = null; // Funktion nicht erreichbar: Verhalten wie bisher
  }
  if (!istMitarbeiterKennung(chef)) return abrechnungEntscheiden(chef, false, eigeneId, meldung);
  let darf: unknown = false;
  try {
    const r = await sb.rpc('darf_ich_abrechnen');
    darf = r.error ? false : r.data;
  } catch {
    darf = false; // SQL noch nicht gelaufen: nie still erlauben
  }
  return abrechnungEntscheiden(chef, darf, eigeneId, meldung);
}

/**
 * Alte Schnittstelle (B1b-2): null = darf abrechnen; sonst die Meldung.
 * Kennt jetzt das Recht „Darf abrechnen".
 */
export async function rechnungsRechtFehlt(supabase: unknown): Promise<string | null> {
  const a = await abrechnungPruefen(supabase, '');
  return a.ok ? null : a.fehler;
}

export const MAHNUNG_NUR_CHEF =
  'Mahnungen verschickt die Geschäftsleitung oder wer das Recht „Darf abrechnen" hat.';

/**
 * Paket 187: Soll der Knopf „Rechnung erstellen" angezeigt werden?
 * Chef (keine Chef-Kennung) -> ja. Mitarbeiter -> nur mit darf_ich_abrechnen() === true.
 * Nur Anzeige — die Sperre bleibt auf dem Server.
 */
export function abrechnenKnopfZeigen(chef: unknown, darf: unknown): boolean {
  return abrechnungEntscheiden(chef, darf, '').ok;
}
