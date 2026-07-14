// ============================================================================
// ARGONAUT OS · app/api/betreiber/uebersicht/route.ts  (P50)
//
// OPERATOR-COCKPIT — Datenquelle. Liefert ALLE Tenants (Betreiber/Kunden) mit
// Plan, Status, Onboarding und Modul-Zaehlern aus tenant_module.
//
// SICHERHEIT — zwei harte Schranken:
//   1. Nur ein Operator darf rein. Kennung = Env-Allowlist BETREIBER_OPERATOR_IDS
//      (kommagetrennte auth-User-UIDs). Kein Eintrag / keine Uebereinstimmung
//      -> 403. Ohne gesetzte Env kommt NIEMAND rein (fail-closed).
//   2. Der RLS-ueberschreitende Read laeuft AUSSCHLIESSLICH server-seitig ueber
//      den Service-Role-Client (createAdminClient). Der wird nie an den Browser
//      gegeben — die Seite bekommt nur das fertige, gefilterte JSON.
//
// Mitarbeiter (Zeile in public.mitarbeiter) sind KEINE Tenants und werden aus
// der Liste entfernt — genau wie DashboardNav "kein mitarbeiter-Eintrag = Chef".
// ============================================================================
import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Erlaubte Operator-UIDs aus der Env (leer = niemand, fail-closed). */
function operatorIds(): string[] {
  return (process.env.BETREIBER_OPERATOR_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function GET() {
  // --- 1) Wer ruft an? -------------------------------------------------------
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, fehler: 'nicht angemeldet' }, { status: 401 })
  }

  // --- 2) Operator-Gate (hart) ----------------------------------------------
  if (!operatorIds().includes(user.id)) {
    return NextResponse.json({ ok: false, fehler: 'kein Zugriff' }, { status: 403 })
  }

  // --- 3) Service-Role: alle Daten laden (umgeht RLS, nur hier erlaubt) ------
  const admin = createAdminClient()

  // Angestellte identifizieren -> spaeter aus der Tenant-Liste ausschliessen
  const { data: maRows } = await admin
    .from('mitarbeiter')
    .select('auth_user_id')
  const mitarbeiterIds = new Set(
    (maRows ?? []).map((r) => r.auth_user_id).filter(Boolean) as string[],
  )

  // Profile = Tenant-Kandidaten
  const { data: profRows, error: profErr } = await admin
    .from('profiles')
    .select('id, email, firma_name, company_name, company, plan, status, onboarding_completed, created_at')
    .order('created_at', { ascending: true, nullsFirst: false })
  if (profErr) {
    return NextResponse.json({ ok: false, fehler: profErr.message }, { status: 500 })
  }

  // tenant_module -> Modul-Zaehler je Betreiber
  const { data: tmRows } = await admin
    .from('tenant_module')
    .select('owner_user_id, modul_key, aktiv')
  const moduleProTenant = new Map<string, { gebucht: number; aktiv: number }>()
  for (const r of tmRows ?? []) {
    const e = moduleProTenant.get(r.owner_user_id) ?? { gebucht: 0, aktiv: 0 }
    e.gebucht += 1
    if (r.aktiv) e.aktiv += 1
    moduleProTenant.set(r.owner_user_id, e)
  }

  // --- 4) Zusammenbauen ------------------------------------------------------
  const tenants = (profRows ?? [])
    .filter((p) => !mitarbeiterIds.has(p.id))
    .map((p) => {
      const m = moduleProTenant.get(p.id) ?? { gebucht: 0, aktiv: 0 }
      return {
        id: p.id,
        email: p.email ?? '',
        firma: p.firma_name || p.company_name || p.company || '—',
        plan: p.plan ?? '—',
        status: p.status ?? '—',
        onboarding: !!p.onboarding_completed,
        moduleGebucht: m.gebucht,
        moduleAktiv: m.aktiv,
        // keine tenant_module-Zeile => fail-open (Kunde sieht alle Module)
        failOpen: m.gebucht === 0,
      }
    })

  return NextResponse.json({ ok: true, anzahl: tenants.length, tenants })
}
