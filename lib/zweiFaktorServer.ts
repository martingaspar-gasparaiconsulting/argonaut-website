// ============================================================================
// ARGONAUT OS · lib/zweiFaktorServer.ts — Zwei-Faktor-Stand am Server (Paket 164)
//
// Die EINE Stelle, an der der Server fragt: „Hat dieser Zugang einen zweiten
// Faktor, und ist er in dieser Sitzung bestätigt?"
//   · Faktoren: aus dem Nutzer, den getUser() eben beim Anmelde-Dienst geholt hat
//   · aal: über getClaims() — das Token wird geprüft (Signatur bzw. Rückfrage
//     beim Anmelde-Dienst). NIE getSession(): der Cookie-Inhalt ist ungeprüft.
// Ohne zweiten Faktor wird gar nicht erst nachgefragt (kein Zusatz-Aufwand).
// Fehler bei der Nachfrage zählen als aal1 — also „Code eingeben", nie „durch".
// ============================================================================

import { zweiFaktorWeg, hatVerifiziertenFaktor, type Aal, type ZweiFaktorWeg } from './zweiFaktor';

type AuthMitClaims = {
  auth: { getClaims: () => Promise<{ data: { claims?: { aal?: unknown } | null } | null; error: unknown }> };
};

export async function bestaetigteStufe(supabase: AuthMitClaims): Promise<Aal> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) return 'aal1';
    return data?.claims?.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return 'aal1';
  }
}

export async function zweiFaktorStand(
  supabase: AuthMitClaims,
  user: { factors?: Array<{ status?: string | null }> | null } | null,
  pflicht = false,
): Promise<{ weg: ZweiFaktorWeg; hatFaktor: boolean; aal: Aal }> {
  const hatFaktor = hatVerifiziertenFaktor(user);
  const aal = hatFaktor ? await bestaetigteStufe(supabase) : 'aal1';
  return { weg: zweiFaktorWeg({ aktuell: aal, hatFaktor, pflicht }), hatFaktor, aal };
}

// ── Paket 190: Pflicht je Betrieb ───────────────────────────────────────────
// Fragt die Datenbank-Funktion zwei_faktor_pflicht_ab() (Betrieb = Chef bzw.
// mein_chef_id). Liefert den Pflicht-Tag oder null. STÖRUNG SPERRT NIE: jeder
// Fehler (auch „Funktion gibt es noch nicht", falls das SQL noch fehlt) ergibt
// null = keine Betriebs-Pflicht. Die Umgebungs-Pflicht (ZWEI_FAKTOR_PFLICHT)
// bleibt davon unberührt.
type MitRpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

export async function betriebPflichtAb(supabase: MitRpc): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('zwei_faktor_pflicht_ab');
    if (error || data === null || data === undefined || data === '') return null;
    return String(data);
  } catch {
    return null;
  }
}
