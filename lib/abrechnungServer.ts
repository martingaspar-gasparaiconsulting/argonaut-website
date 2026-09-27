// ============================================================================
// ARGONAUT OS · lib/abrechnungServer.ts — „Darf abrechnen" (27.09.2026)
// NUR serverseitig verwenden (Route Handler) — nutzt den Server-Schlüssel.
//
// Das Problem: Eine Rechnung „aus Angebot / Aufmaß / Auftrag …" schreibt am
// Ende die Rechnungsnummer in den Ursprung zurück (rechnung_id, „abgerechnet").
// Dieser Rückschrieb ist der Doppel-Schutz: fehlt er, kann derselbe Vorgang ein
// zweites Mal abgerechnet werden. Mitarbeiter dürfen viele dieser Ursprungs-
// Tabellen aber nicht ändern (z. B. holz_auftraege) — der Rückschrieb liefe
// dann still ins Leere.
//
// Die Lösung: Für einen Mitarbeiter mit „Darf abrechnen" schreibt der Server
// den Rückschrieb — aber nur, nachdem die Route den Ursprung mit der Sitzung
// der Person gelesen hat (RLS hat also bestätigt, dass sie ihn sehen darf),
// und jede Änderung trägt zusätzlich .eq('owner_user_id', betrieb), damit nie
// ein fremder Betrieb getroffen wird. Beim Chef bleibt alles wie bisher.
// ============================================================================

import { createAdminClient } from './supabase-admin';

/** Client für den Rückschrieb in den Ursprung: beim Mitarbeiter der Server, sonst die Sitzung. */
export function quellSchreiber<T>(supabase: T, abr: { mitarbeiter: boolean }): T {
  if (!abr.mitarbeiter) return supabase;
  return createAdminClient() as unknown as T;
}

type RpcFaehig = { rpc: (fn: string) => PromiseLike<{ data: unknown }> };

/**
 * Wer liest die Einstellungen des Betriebs (Logo/Farben aus web_ci, Bezahl-
 * Anbieter aus betrieb_integrationen)? Diese Tabellen sieht nur der Chef.
 * Erstellt ein Mitarbeiter ein PDF, fehlten bisher Logo und Bezahllink.
 * Beim Mitarbeiter liest der Server GENAU die Zeilen seines Betriebs
 * (mein_chef_id() mit seiner Sitzung geprüft), beim Chef die Sitzung.
 */
export async function betriebLeser<T>(supabase: T, eigeneId: string): Promise<{ leser: T; betrieb: string; mitarbeiter: boolean }> {
  let chef: unknown = null;
  try { chef = (await (supabase as unknown as RpcFaehig).rpc('mein_chef_id')).data; } catch { chef = null; }
  if (typeof chef === 'string' && chef.trim() && chef.trim() !== eigeneId) {
    try {
      return { leser: createAdminClient() as unknown as T, betrieb: chef.trim(), mitarbeiter: true };
    } catch { /* ohne Server-Schlüssel: Sitzung wie bisher */ }
  }
  return { leser: supabase, betrieb: eigeneId, mitarbeiter: false };
}
