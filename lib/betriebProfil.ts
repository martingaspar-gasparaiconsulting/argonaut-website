// ============================================================================
// ARGONAUT OS · lib/betriebProfil.ts — B1b-2 (26.09.2026)
//
// Der Fehler: Angebots- und Förder-PDF lasen Firmenname, Adresse, Telefon und
// E-Mail aus dem Profil der ANGEMELDETEN Person. Erstellt ein Mitarbeiter das
// PDF, stand oben „Ihr Betrieb" und keine Anschrift — sein eigenes Profil hat
// keine Firmendaten.
//
// Die Lösung: Die Firmendaten kommen immer vom Betrieb. mein_chef_id() wird
// mit der Sitzung der Person geprüft (RLS-Funktion, beim Chef null). Nur wenn
// sie einen Chef liefert, wird GENAU dessen Profil mit dem Server-Schlüssel
// gelesen — Mitarbeiter dürfen fremde Profile sonst nicht lesen. Es wird nur
// gelesen, nie geschrieben, und nur für den eigenen Betrieb.
// NUR serverseitig verwenden (Route Handler).
// ============================================================================

import { createAdminClient } from './supabase-admin';

type RpcFaehig = {
  rpc: (fn: string) => PromiseLike<{ data: unknown }>;
  from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown }> } } };
};

/** Welche Kennung trägt die Firmendaten? Beim Mitarbeiter der Chef. */
export function profilKennung(chef: unknown, eigene: string): { id: string; fremd: boolean } {
  if (typeof chef === 'string' && chef.trim() && chef.trim() !== eigene) return { id: chef.trim(), fremd: true };
  return { id: eigene, fremd: false };
}

/** Profil des Betriebs (Firmendaten) — für PDFs. */
export async function ladeBetriebProfil(supabase: unknown, eigeneId: string): Promise<Record<string, unknown>> {
  const sb = supabase as RpcFaehig;
  let chef: unknown = null;
  try { chef = (await sb.rpc('mein_chef_id')).data; } catch { chef = null; }
  const k = profilKennung(chef, eigeneId);
  if (k.fremd) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.from('profiles').select('*').eq('id', k.id).maybeSingle();
      if (data) return data as Record<string, unknown>;
    } catch { /* ohne Server-Schlüssel: eigenes Profil wie bisher */ }
  }
  const { data } = await sb.from('profiles').select('*').eq('id', eigeneId).maybeSingle();
  return (data || {}) as Record<string, unknown>;
}
