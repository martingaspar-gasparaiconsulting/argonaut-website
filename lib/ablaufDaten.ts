// ============================================================================
// ARGONAUT OS · lib/ablaufDaten.ts — Datenhelfer der Abläufe (Paket 157)
//
// Rechnungen tragen nur eine kontakt_id, keinen Namen und keine Adresse.
// Damit {{name}} und die Mail-Adresse stimmen, wird der Kontakt ergänzt —
// im Motor (Service-Role) wie im Probelauf der Seite (Anmeldung des Chefs).
// Immer auf den Betrieb gefiltert.
// ============================================================================

import type { Datensatz } from './automation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (tabelle: string) => any };

export async function ergaenzeKontakte(db: Client, ownerId: string, saetze: Datensatz[]): Promise<void> {
  const ids = Array.from(new Set(saetze.map((s) => s.kontakt_id).filter((x): x is string => typeof x === 'string' && x.length > 0)));
  if (ids.length === 0) return;
  const { data } = await db.from('kontakte')
    .select('id,vorname,nachname,firma,email,status,werbe_einwilligung,werbe_widerspruch_am')
    .eq('owner_user_id', ownerId).in('id', ids);
  const map = new Map<string, Record<string, unknown>>();
  for (const k of (data ?? []) as Record<string, unknown>[]) map.set(String(k.id), k);
  for (const s of saetze) {
    const k = typeof s.kontakt_id === 'string' ? map.get(s.kontakt_id) : undefined;
    if (!k) continue;
    if (s.vorname === undefined) s.vorname = k.vorname;
    if (s.nachname === undefined) s.nachname = k.nachname;
    if (s.firma === undefined) s.firma = k.firma;
    if (!s.email && !s.kunde_email) s.email = k.email;
    // Platzhalter {{kunde.firma}}, {{kunde.email}} … (nie ein vorhandenes Feld überschreiben)
    if (s.kunde === undefined) s.kunde = { ...k };
  }
}
