import { createBrowserClient } from '@supabase/ssr'
import { MERK_COOKIE, dauerFuer, leseWunsch } from './anmeldedauer'

// ============================================================================
// ARGONAUT OS · Browser-Client
//
// ▄▄▄ WARUM HIER EINE DAUER STEHT ▄▄▄
// @supabase/ssr setzt das Anmelde-Cookie sonst mit seiner Vorgabe von
// 400 TAGEN (DEFAULT_COOKIE_OPTIONS). Das war nie eine Entscheidung, sondern
// der Standardwert der Bibliothek — und er bedeutet: Wer sich an einem
// fremden Rechner anmeldet, bleibt dort ueber ein Jahr angemeldet.
//
// Ab 08.09.26 (B9) entscheidet der Mensch beim Anmelden: mit Haken 30 Tage,
// ohne Haken nur bis zum Schliessen des Browsers. Die Wahl steht im
// Merk-Cookie, damit `proxy.ts` sie bei jeder Auffrischung mitliest —
// sonst wuerde die Vorgabe beim ersten Seitenwechsel zurueckkommen.
//
// Die Regeln liegen in lib/anmeldedauer.ts und sind dort node-getestet.
// ============================================================================

export function createClient() {
  const bleiben = leseWunsch(
    typeof document === 'undefined' ? '' : document.cookie,
  )
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: dauerFuer(bleiben) },
  )
}

export { MERK_COOKIE }
