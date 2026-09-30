// ============================================================================
// ARGONAUT OS · lib/ablaufKnopfServer.ts — Aufrufer eines Knopf-Ablaufs ermitteln (Paket 192)
//
// NUR SERVER (Service-Schlüssel). Kennung kommt aus getUser(), Betrieb, Austritt
// und Rechte aus der Datenbank — nie vom Browser. Kein Mitarbeiter-Eintrag =
// Geschäftsleitung des eigenen Betriebs (wie lib/zweiFaktorTeamServer).
// ============================================================================

import type { KnopfAufrufer } from './ablaufKnopfRecht';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = { from: (t: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function knopfAufrufer(admin: Admin, userId: string): Promise<KnopfAufrufer & { name: string }> {
  const { data } = await admin.from('mitarbeiter').select('id, owner_user_id, austrittsdatum, vorname, nachname')
    .eq('auth_user_id', userId).maybeSingle();
  const m = data as { id: string; owner_user_id: string; austrittsdatum: string | null; vorname: string | null; nachname: string | null } | null;
  if (!m) return { rolle: 'chef', userId, name: 'Geschäftsleitung' };
  const { data: r } = await admin.from('mitarbeiter_rechte').select('module, schreib_module').eq('mitarbeiter_id', m.id).maybeSingle();
  const recht = r as { module?: string[] | null; schreib_module?: string[] | null } | null;
  return {
    rolle: 'mitarbeiter', userId, betrieb: m.owner_user_id, austrittsdatum: m.austrittsdatum ?? null,
    module: Array.isArray(recht?.module) ? recht!.module! : [],
    schreibModule: Array.isArray(recht?.schreib_module) ? recht!.schreib_module! : [],
    name: [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter',
  };
}
