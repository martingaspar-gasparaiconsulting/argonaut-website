// ARGONAUT OS · lib/verkaufsteamLaden.ts — Paket 358 (13.10.2026)
// Lädt Team, eigene Kennung und „bin ich freier Setter?" mit dem Client des
// angemeldeten Nutzers (RLS gilt). Jeder Fehler (z. B. SQL Paket 358 fehlt)
// ergibt ein leeres Team und frei = false — die Lead-Seiten bleiben nutzbar.

import type { SupabaseClient } from '@supabase/supabase-js';
import { teamAufbauen, type Person, type MitarbeiterRoh, type FunktionRoh } from './verkaufsteam';

export type TeamStand = { team: Person[]; ich: string | null; chefId: string | null; istChef: boolean; frei: boolean; bereit: boolean };

export async function ladeVerkaufsteam(supabase: SupabaseClient): Promise<TeamStand> {
  const leer: TeamStand = { team: [], ich: null, chefId: null, istChef: false, frei: false, bereit: false };
  try {
    const { data: u } = await supabase.auth.getUser();
    const ich = u?.user?.id ?? null;
    if (!ich) return leer;
    let chef: unknown = null;
    try { chef = (await supabase.rpc('mein_chef_id')).data; } catch { chef = null; }
    const chefId = typeof chef === 'string' && chef ? chef : ich;
    const istChef = chefId === ich;
    const [m, f, fr] = await Promise.all([
      supabase.from('mitarbeiter').select('auth_user_id, vorname, nachname, status').eq('owner_user_id', chefId).limit(2000),
      supabase.from('vk_funktion').select('user_id, funktion, frei, aktiv').limit(2000),
      supabase.rpc('p358_frei'),
    ]);
    const bereit = !f.error;
    const team = teamAufbauen(chefId, m.error ? [] : ((m.data as unknown) as MitarbeiterRoh[]) ?? [], f.error ? [] : ((f.data as unknown) as FunktionRoh[]) ?? []);
    return { team, ich, chefId, istChef, frei: !fr.error && fr.data === true, bereit };
  } catch {
    return leer;
  }
}

/** Zuständige nachladen — nur Leads, die jemandem zugewiesen sind (eigene Abfrage:
 *  fehlt SQL 358, bleibt die Liste trotzdem da). Optional ein einzelner Lead. */
export async function ladeZustaendige(supabase: SupabaseClient, nurId?: string): Promise<Map<string, { setter_user_id: string | null; closer_user_id: string | null }>> {
  const out = new Map<string, { setter_user_id: string | null; closer_user_id: string | null }>();
  let q = supabase.from('leads').select('id, setter_user_id, closer_user_id');
  q = nurId ? q.eq('id', nurId) : q.or('setter_user_id.not.is.null,closer_user_id.not.is.null').limit(5000);
  const { data, error } = await q;
  if (error) return out;
  for (const r of (data as unknown as { id: string; setter_user_id: string | null; closer_user_id: string | null }[]) ?? []) {
    out.set(r.id, { setter_user_id: r.setter_user_id, closer_user_id: r.closer_user_id });
  }
  return out;
}
