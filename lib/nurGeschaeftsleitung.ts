// ============================================================================
// ARGONAUT OS · lib/nurGeschaeftsleitung.ts — B1b-2 (26.09.2026)
//
// Der Fehler: Alle 17 „Rechnung aus …"-Wege legten die Rechnung auf die Person,
// die klickt. Rechnungen und Zahlungen sieht laut Befund K5 bewusst nur der
// Chef. Klickte ein Mitarbeiter, entstand eine Rechnung, die der Chef nie sah
// und die in EÜR, Mahnwesen und Finanzen fehlte — und die Vorgänge waren
// trotzdem als abgerechnet markiert.
//
// Die Lösung (Martins Entscheidung 26.09.2026): Rechnungen bleiben Chefsache.
// Der Weg prüft vorher mein_chef_id(): liefert sie einen Chef, ist die Person
// Mitarbeiter und bekommt eine klare Meldung. Es entsteht nichts.
// ============================================================================

export const RECHNUNG_NUR_CHEF =
  'Rechnungen erstellt die Geschäftsleitung. Der Vorgang bleibt offen und kann dort abgerechnet werden.';

/** Ist das Ergebnis von mein_chef_id() ein Chef — also die Person Mitarbeiter? */
export function istMitarbeiterKennung(chef: unknown): boolean {
  return typeof chef === 'string' && chef.trim().length > 0;
}

type RpcFaehig = { rpc: (fn: string) => PromiseLike<{ data: unknown }> };

/** null = darf abrechnen; sonst die Meldung für den Mitarbeiter. */
export async function rechnungsRechtFehlt(supabase: unknown): Promise<string | null> {
  try {
    const { data } = await (supabase as RpcFaehig).rpc('mein_chef_id');
    return istMitarbeiterKennung(data) ? RECHNUNG_NUR_CHEF : null;
  } catch {
    return null; // Funktion nicht erreichbar: Verhalten wie bisher (RLS schützt weiter)
  }
}

// Befund 26.09.2026 (Lese-Abfrage B1b-2): Mitarbeiter dürfen Rechnungen des
// Chefs LESEN (rechnungen_select_mitarbeiter), Zahlungen aber nur mit eigener
// Kennung anlegen. Erfasste ein Mitarbeiter auf Zahlungen oder Banking eine
// Zahlung, änderte der Trigger den Rechnungsstatus — die Zahlung selbst sah
// der Chef nie. Deshalb gilt auch hier: Zahlungen erfasst die Geschäftsleitung.
export const ZAHLUNG_NUR_CHEF =
  'Zahlungen erfasst die Geschäftsleitung — sonst stimmen Rechnungsstatus und Zahlungsliste nicht überein.';
