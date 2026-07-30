import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// ARGONAUT OS · lib/lpEreignis.ts — Server-Helfer: Landingpage-Ereignis loggen
// (Marketing-Autopilot · Funnel-Analytics P1 + A-B-Tests)
//
// Schreibt EINE Zeile in lp_ereignisse. Immer NICHT-BLOCKIEREND aufrufen:
// Analytics darf den oeffentlichen Ablauf (Seitenaufruf, Opt-in, Bestaetigung)
// niemals stoeren. Fehler werden geschluckt.
// Aufruf ausschliesslich mit Service-Role-Client (umgeht RLS).
// `variante` ('A'|'B') nur bei aktivem A-B-Test, sonst null.
// ============================================================================

export type LpEreignisTyp = 'aufruf' | 'anmeldung' | 'bestaetigung';

export async function protokolliereLpEreignis(
  admin: SupabaseClient,
  ownerUserId: string | null | undefined,
  landingpageId: string | null | undefined,
  typ: LpEreignisTyp,
  variante?: 'A' | 'B' | null,
): Promise<void> {
  if (!ownerUserId || !landingpageId) return;
  try {
    await admin.from('lp_ereignisse').insert({
      owner_user_id: ownerUserId,
      landingpage_id: landingpageId,
      typ,
      variante: variante === 'A' || variante === 'B' ? variante : null,
    });
  } catch {
    // bewusst geschluckt — Messung darf den Ablauf nie blockieren
  }
}
