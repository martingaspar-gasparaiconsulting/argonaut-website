// app/api/ki-nutzung-test/route.ts
// ============================================================================
// ARGONAUT OS · TEMPORAERE Diagnose-Route (Phase 1 · B)
// Testet den Schreibweg von lib/ki.ts: versucht EINE Test-Zeile in ki_nutzung
// zu schreiben und gibt das Ergebnis als Klartext-JSON im Browser zurueck.
// -> zeigt sofort, ob der Service-Role-Schreibweg funktioniert oder woran es hakt.
// NACH der Diagnose wieder loeschen.
// Aufruf: https://www.argonaut-os.com/api/ki-nutzung-test
// ============================================================================
import { createAdminClient } from '@/lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const envDa = {
    url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyLaenge: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
  }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ki_nutzung')
      .insert({
        route: 'DIAGNOSE-TEST',
        modell: 'test',
        tokens_rein: 1,
        tokens_raus: 1,
        tokens_cache_write: 0,
        tokens_cache_read: 0,
        kosten_usd: 0,
      })
      .select()

    return Response.json({
      ok: !error,
      envDa,
      error: error
        ? { message: error.message, details: error.details, hint: error.hint, code: error.code }
        : null,
      geschriebeneId: data?.[0]?.id ?? null,
    })
  } catch (e) {
    return Response.json({
      ok: false,
      envDa,
      threw: e instanceof Error ? e.message : String(e),
    })
  }
}
