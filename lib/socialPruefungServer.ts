// ============================================================================
// ARGONAUT OS · lib/socialPruefungServer.ts  (Paket 208) · NUR serverseitig
// Liest den Prüf-Stand eines Social-Beitrags. Fehlen die Spalten noch
// (SQL p208 nicht gelaufen), gilt der Beitrag als „eigen" (wie bisher).
// ============================================================================

import type { PruefStand } from './socialPruefung';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function ladePruefStand(db: Db, id: string, besitzer: string): Promise<PruefStand | null> {
  try {
    const { data, error } = await db
      .from('social_beitrag')
      .select('ki_entwurf, geprueft_am')
      .eq('id', id)
      .eq('owner_user_id', besitzer)
      .maybeSingle();
    if (error) return null;
    return (data as PruefStand | null) ?? null;
  } catch {
    return null;
  }
}
