// ============================================================================
// ARGONAUT OS · lib/kontoSchutzServer.ts  (Paket 169 · Konto-Schutz)
//
// Sammelt mit dem Service-Schluessel alles, was lib/kontoSchutz.ts fuer die
// Entscheidung braucht, und setzt beim ersten sauberen Zuruecksetzen das
// Kennzeichen nach. Nur serverseitig importieren.
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { KONTO_KENNZEICHEN, kontoGehoertZumMitarbeiter, ilikeGenau, type KontoUrteil } from './kontoSchutz';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export async function pruefeMitarbeiterKonto(
  admin: Admin,
  o: { zielId: string; betrieb: string; maEmail: string | null },
): Promise<KontoUrteil> {
  const { data: u, error: uErr } = await admin.auth.admin.getUserById(o.zielId);
  if (uErr || !u?.user) return { ja: false, grund: 'Zugang nicht gefunden.' };
  const zielEmail = u.user.email ?? null;
  const meta = (u.user.app_metadata ?? {}) as Record<string, unknown>;
  const kennzeichen = typeof meta[KONTO_KENNZEICHEN] === 'string' ? (meta[KONTO_KENNZEICHEN] as string) : null;

  const [kunde, profil, fremd, eigen] = await Promise.all([
    zielEmail
      ? admin.from('customers').select('email').ilike('email', ilikeGenau(zielEmail)).limit(1)
      : Promise.resolve({ data: [] as unknown[] }),
    admin.from('profiles').select('role').eq('id', o.zielId).maybeSingle(),
    admin.from('mitarbeiter').select('id', { count: 'exact', head: true }).eq('auth_user_id', o.zielId).neq('owner_user_id', o.betrieb),
    admin.from('mitarbeiter').select('id', { count: 'exact', head: true }).eq('auth_user_id', o.zielId).eq('owner_user_id', o.betrieb),
  ]);

  return kontoGehoertZumMitarbeiter({
    zielId: o.zielId,
    betrieb: o.betrieb,
    betreiberId: process.env.ANALYSE_BETREIBER_ID ?? null,
    zielEmail,
    maEmail: o.maEmail,
    kennzeichen,
    istKunde: Array.isArray(kunde.data) && kunde.data.length > 0,
    rolle: (profil.data as { role?: string | null } | null)?.role ?? null,
    fremdVerknuepft: fremd.count ?? 1,
    eigeneVerknuepft: eigen.count ?? 0,
  });
}

/** Kennzeichen am Konto setzen (nur Server; der Nutzer kann app_metadata nicht aendern). */
export async function kennzeichenSetzen(admin: Admin, zielId: string, betrieb: string): Promise<void> {
  const { data: u } = await admin.auth.admin.getUserById(zielId);
  const alt = (u?.user?.app_metadata ?? {}) as Record<string, unknown>;
  await admin.auth.admin.updateUserById(zielId, { app_metadata: { ...alt, [KONTO_KENNZEICHEN]: betrieb } });
}
