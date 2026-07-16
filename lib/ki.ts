// lib/ki.ts
// ============================================================================
// ARGONAUT OS · lib/ki.ts — zentraler KI-Aufruf mit Nutzungs-Protokoll (Phase 1 · B)
//
// Statt in jeder Route direkt an Anthropic zu fetchen, laeuft jeder Aufruf
// durch kiFetch(). Der Helfer:
//   - macht den IDENTISCHEN fetch-Aufruf (Original-Antwort bleibt unberuehrt),
//   - liest die Token-Zahlen aus einem KLON der Antwort,
//   - ermittelt den Kunden selbst aus dem Login-Cookie (keine Route liefert das),
//   - rechnet die Kosten in USD,
//   - schreibt eine Zeile nach public.ki_nutzung (Service-Role, umgeht RLS).
//
// Umbau in einer Route — vorher:
//   const res = await fetch("https://api.anthropic.com/v1/messages", { ...optionen });
// nachher:
//   const res = await kiFetch("dashboard-chat", { ...optionen });
// Alles danach (res.ok, res.json(), ...) bleibt WORT FUER WORT gleich.
//
// NUR serverseitig (Route Handlers). Niemals im Client importieren.
// ============================================================================
import { createClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// --- Preise in USD pro 1 Mio Tokens -----------------------------------------
// Bei Modell-/Preis-Aenderung NUR hier anpassen. USD, keine EUR-Umrechnung
// (die macht spaeter der "Waechter" live). Unbekanntes Modell -> 'default'.
// Standard-Sonnet-Preise; bei bestaetigtem Sonnet-5-Preis hier eintragen.
const PREISE_USD_PRO_MTOK: Record<
  string,
  { rein: number; raus: number; cacheWrite: number; cacheRead: number }
> = {
  default: { rein: 3.0, raus: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
}

function preisFuer(modell: string) {
  return PREISE_USD_PRO_MTOK[modell] ?? PREISE_USD_PRO_MTOK.default
}

/** Kunde aus dem Login-Cookie. Kein Login (oeffentlicher Chat) -> null. */
async function ermittleUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/** Schreibt eine Nutzungs-Zeile. Darf die eigentliche Antwort NIE gefaehrden. */
async function protokolliere(userId: string | null, route: string, data: any) {
  try {
    const u = data?.usage ?? {}
    const rein = Number(u.input_tokens) || 0
    const raus = Number(u.output_tokens) || 0
    const cacheWrite = Number(u.cache_creation_input_tokens) || 0
    const cacheRead = Number(u.cache_read_input_tokens) || 0
    const modell = typeof data?.model === 'string' ? data.model : 'unbekannt'
    const p = preisFuer(modell)
    const kostenUsd =
      (rein * p.rein + raus * p.raus + cacheWrite * p.cacheWrite + cacheRead * p.cacheRead) /
      1_000_000

    const admin = createAdminClient()
    await admin.from('ki_nutzung').insert({
      user_id: userId,
      route,
      modell,
      tokens_rein: rein,
      tokens_raus: raus,
      tokens_cache_write: cacheWrite,
      tokens_cache_read: cacheRead,
      kosten_usd: kostenUsd,
    })
  } catch (e) {
    console.error('[ki_nutzung] Protokoll fehlgeschlagen:', e)
  }
}

/**
 * Ersatz fuer `fetch("https://api.anthropic.com/v1/messages", options)`.
 * Gibt die UNVERAENDERTE Original-Antwort zurueck (res.ok / res.json() wie gehabt)
 * und schreibt zusaetzlich eine Nutzungs-Zeile nach ki_nutzung.
 *
 * @param route  Sprechender Name der Funktion, z.B. "ki-auge", "dashboard-chat".
 * @param options Exakt dieselben fetch-Optionen wie bisher (method/headers/body).
 */
export async function kiFetch(route: string, options: RequestInit): Promise<Response> {
  // Nutzer-Ermittlung laeuft PARALLEL zum KI-Aufruf -> praktisch keine Extra-Latenz.
  const [userId, res] = await Promise.all([ermittleUserId(), fetch(ANTHROPIC_URL, options)])

  // Nur erfolgreiche Antworten protokollieren. Klon lesen -> Original unberuehrt.
  try {
    if (res.ok) {
      const data = await res.clone().json()
      await protokolliere(userId, route, data)
    }
  } catch (e) {
    console.error('[ki_nutzung] Lesen der Antwort fehlgeschlagen:', e)
  }

  return res
}
