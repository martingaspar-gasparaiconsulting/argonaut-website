import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createAdminClient } from '@/lib/supabase-admin'

// ============================================================================
// ARGONAUT OS · app/api/admin/anfragen/route.ts
// Liefert alle Website-Anfragen (Tabelle website_anfragen) für den Control Room.
// Nur für Admins (profiles.role === 'admin'), Zugriff per Service-Role.
// ============================================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'nicht angemeldet' }, { status: 401 })
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profil || profil.role !== 'admin') return NextResponse.json({ error: 'kein Zugriff' }, { status: 403 })
  return null
}

export async function GET() {
  const gesperrt = await adminGuard()
  if (gesperrt) return gesperrt

  const admin = createAdminClient()

  // Robust: bevorzugt nach created_at sortiert; fällt automatisch zurück, falls
  // die Spalte in der Tabelle anders heißt oder fehlt.
  let data: Array<Record<string, unknown>> | null = null
  let error: { message?: string } | null = null

  {
    const r = await admin.from('website_anfragen').select('*').order('created_at', { ascending: false }).limit(500)
    data = (r.data as Array<Record<string, unknown>> | null)
    error = r.error
  }
  if (error) {
    const r2 = await admin.from('website_anfragen').select('*').limit(500)
    data = (r2.data as Array<Record<string, unknown>> | null)
    error = r2.error
  }

  if (error) {
    return NextResponse.json(
      { error: 'Anfragen nicht verfügbar (ist die Tabelle website_anfragen vorhanden?).', detail: error.message },
      { status: 200 },
    )
  }

  return NextResponse.json({ anfragen: data ?? [] })
}
