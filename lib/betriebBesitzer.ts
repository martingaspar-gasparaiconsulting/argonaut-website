// ============================================================================
// ARGONAUT OS · lib/betriebBesitzer.ts — Paket 131 (27.09.2026)
//
// Wem gehoert ein neu angelegter Datensatz? Dem BETRIEB — nicht der Person,
// die gerade angemeldet ist. Beim Chef ist das dieselbe Kennung. Beim
// Mitarbeiter ist es die Kennung des Chefs (RPC mein_chef_id). Sonst sieht
// der Chef nicht, was sein Mitarbeiter angelegt hat.
//
// Schutzgelaender gegen Aussperren: Laeuft das Anlegen fuer den Betrieb an
// einer Zugriffsregel auf (SQL-Regel fehlt noch), wird EINMAL mit der eigenen
// Kennung wiederholt — so wie vor Paket 131. Niemand verliert dadurch die
// Moeglichkeit, etwas anzulegen.
//
// Keine Imports, keine Hooks — mit `node --test` pruefbar.
// ============================================================================

/** Betrieb aus dem Ergebnis von mein_chef_id() und der eigenen Kennung. */
export function betriebsKennung(chef: unknown, eigene: string | null | undefined): string | null {
  if (typeof chef === 'string' && chef.trim()) return chef.trim();
  return eigene ? String(eigene) : null;
}

type Fehler = { message?: string; code?: string } | null | undefined;

/** Scheiterte ein Schreibversuch an einer Zugriffsregel (RLS)? */
export function istZugriffsFehler(fehler: Fehler): boolean {
  if (!fehler) return false;
  if (fehler.code === '42501') return true;
  const t = String(fehler.message || '').toLowerCase();
  return t.includes('row-level security') || t.includes('row level security') || t.includes('permission denied');
}

/** Setzt owner_user_id auf eine oder mehrere Zeilen (Kopie, das Original bleibt). */
export function mitBesitzer<T extends Record<string, unknown>>(zeilen: T | T[], besitzer: string | null): T | T[] {
  const setze = (z: T): T => (besitzer ? { ...z, owner_user_id: besitzer } : { ...z });
  return Array.isArray(zeilen) ? zeilen.map(setze) : setze(zeilen);
}

/**
 * Anlegen fuer den Betrieb, mit Rueckfall auf die eigene Kennung.
 * `schreibe` fuehrt den eigentlichen insert aus und gibt { error } zurueck.
 * Ergebnis: das Ergebnis des letzten Versuchs + ob der Rueckfall gegriffen hat.
 */
export async function anlegenFuerBetrieb<T extends Record<string, unknown>, R extends { error: Fehler }>(
  zeilen: T | T[],
  besitzer: string | null,
  eigene: string | null,
  schreibe: (daten: T | T[]) => PromiseLike<R>,
): Promise<{ ergebnis: R; rueckfall: boolean }> {
  const erst = await schreibe(mitBesitzer(zeilen, besitzer ?? eigene));
  if (!erst.error || !istZugriffsFehler(erst.error) || !eigene || !besitzer || besitzer === eigene) {
    return { ergebnis: erst, rueckfall: false };
  }
  const zweit = await schreibe(mitBesitzer(zeilen, eigene));
  return { ergebnis: zweit, rueckfall: true };
}
