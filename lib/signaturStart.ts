// ============================================================================
// ARGONAUT OS · Welle 5 · lib/signaturStart.ts
// Kleiner Client-Helfer: aus einem beliebigen Vorgang (Angebot, SEPA-Mandat,
// Vertrag …) eine Signatur-Anfrage anlegen und den Unterschrifts-Link liefern.
// So ist „→ zur Unterschrift" in jedem Modul nur ein Aufruf.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type SignaturStartOpts = {
  titel: string;
  empfaenger_name?: string | null;
  empfaenger_email?: string | null;
  kontakt_id?: string | null;
  dokument: string;
  aufbewahrung_jahre?: number;
};

export async function signaturStarten(
  supabase: SupabaseClient,
  uid: string,
  o: SignaturStartOpts,
): Promise<{ ok: boolean; token?: string; link?: string; error?: string }> {
  try {
    const token = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Math.random().toString(36).slice(2) + Date.now().toString(36));
    const { error } = await supabase.from('signatur_anfragen').insert({
      owner_user_id: uid, token, titel: o.titel.slice(0, 200),
      kontakt_id: o.kontakt_id || null,
      empfaenger_name: o.empfaenger_name || null,
      empfaenger_email: o.empfaenger_email || null,
      dokument: o.dokument, status: 'gesendet',
      aufbewahrung_jahre: o.aufbewahrung_jahre || 10,
    });
    if (error) return { ok: false, error: error.message };
    const link = (typeof window !== 'undefined' ? window.location.origin : '') + '/signieren/' + token;
    return { ok: true, token, link };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fehler' };
  }
}
