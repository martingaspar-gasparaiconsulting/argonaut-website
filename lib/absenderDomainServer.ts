// ============================================================================
// ARGONAUT OS · lib/absenderDomainServer.ts — Paket 210 (05.10.2026) · B7
//
// Liest die eigene Absender-Adresse eines Betriebs (Tabelle absender_domain,
// SQL p210) mit dem Server-Schlüssel. Wird von sendeMail() gefragt, wenn der
// Aufrufer betriebId mitgibt. Ist die Kennung ein Mitarbeiter, gilt die
// Domain seines Betriebs.
//
// Kann nichts gelesen werden (Tabelle fehlt, Server-Schlüssel fehlt), kommt
// null — dann geht die Mail wie bisher über noreply@argonaut-os.com.
// NUR serverseitig verwenden.
// ============================================================================

import { createAdminClient } from './supabase-admin';
import { Resend } from 'resend';
import {
  absenderAdresse, CACHE_MS, dnsZeilen, statusAusResend,
  type AbsenderZeile, type DnsZeile, type DomainStatus,
} from './absenderDomain';

const cache = new Map<string, { adresse: string | null; bis: number }>();

const istKennung = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);

/** Cache leeren (nach Änderung im Command Center). */
export function absenderCacheLeeren(betrieb?: string): void {
  if (betrieb) cache.delete(betrieb.trim().toLowerCase());
  else cache.clear();
}

/** Eigene Absender-Adresse des Betriebs (bzw. des Betriebs des Mitarbeiters) oder null. */
export async function absenderFuerBetrieb(kennung: string | null | undefined): Promise<string | null> {
  const id = String(kennung ?? '').trim().toLowerCase();
  if (!istKennung(id)) return null;
  const jetzt = Date.now();
  const treffer = cache.get(id);
  if (treffer && treffer.bis > jetzt) return treffer.adresse;
  let adresse: string | null = null;
  try {
    const db = createAdminClient();
    const lies = async (owner: string) => {
      const { data, error } = await db.from('absender_domain')
        .select('owner_user_id, domain, lokalteil, status, aktiv').eq('owner_user_id', owner).maybeSingle();
      if (error) return { fehlt: true, zeile: null as AbsenderZeile | null };
      return { fehlt: false, zeile: (data ?? null) as AbsenderZeile | null };
    };
    let r = await lies(id);
    if (!r.fehlt && !r.zeile) {
      // Mitarbeiter? Dann die Domain seines Betriebs.
      const { data: ma } = await db.from('mitarbeiter').select('owner_user_id')
        .eq('auth_user_id', id).limit(1).maybeSingle();
      const chef = String((ma as { owner_user_id?: string } | null)?.owner_user_id ?? '').toLowerCase();
      if (istKennung(chef) && chef !== id) r = await lies(chef);
    }
    adresse = absenderAdresse(r.zeile);
  } catch {
    adresse = null;
  }
  cache.set(id, { adresse, bis: jetzt + CACHE_MS });
  return adresse;
}

// ---------------------------------------------------------------------------
// Resend-Domain-Schnittstelle (Anlegen, Prüfen, Entfernen) — nur Server.
// ---------------------------------------------------------------------------

function resendKlient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY fehlt.');
  return new Resend(key);
}

export type ResendStand = { ok: true; id: string; status: DomainStatus; dns: DnsZeile[] } | { ok: false; fehler: string };

/** Domain bei Resend anlegen (Region EU, Irland). */
export async function resendDomainAnlegen(domain: string): Promise<ResendStand> {
  try {
    const { data, error } = await resendKlient().domains.create({ name: domain, region: 'eu-west-1' });
    if (error || !data?.id) return { ok: false, fehler: error?.message || 'Resend hat die Domain nicht angelegt.' };
    return { ok: true, id: data.id, status: statusAusResend(data.status), dns: dnsZeilen(data.records, domain) };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : 'Resend nicht erreichbar.' };
  }
}

/** Prüfung bei Resend anstoßen und den aktuellen Stand lesen. */
export async function resendDomainPruefen(id: string, domain: string): Promise<ResendStand> {
  try {
    const r = resendKlient();
    await r.domains.verify(id).catch(() => null);
    const { data, error } = await r.domains.get(id);
    if (error || !data) return { ok: false, fehler: error?.message || 'Resend kennt diese Domain nicht.' };
    return { ok: true, id, status: statusAusResend(data.status), dns: dnsZeilen((data as { records?: unknown }).records, domain) };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : 'Resend nicht erreichbar.' };
  }
}

/** Domain bei Resend entfernen (Fehler „nicht gefunden" zählt als erledigt). */
export async function resendDomainEntfernen(id: string): Promise<{ ok: boolean; fehler?: string }> {
  try {
    const { error } = await resendKlient().domains.remove(id);
    if (error && !/not.?found/i.test(error.message || '')) return { ok: false, fehler: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, fehler: e instanceof Error ? e.message : 'Resend nicht erreichbar.' };
  }
}
