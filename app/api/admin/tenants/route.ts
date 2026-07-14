import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';

// ============================================================================
// ARGONAUT OS · app/api/admin/tenants/route.ts  (P50 -> Command-Center)
//
// Liefert alle Tenants (Betreiber/Kunden) mit Plan, Status, Onboarding und
// Modul-Zaehlern aus tenant_module — fuer den TENANTS-Tab im Command-Center.
//
// SICHERHEIT: identischer Admin-Guard wie /api/admin/stats. Nur eingeloggte
// Nutzer mit profiles.role === 'admin' kommen durch (401/403 sonst). Der
// RLS-ueberschreitende Read laeuft erst NACH bestandenem Guard ueber die
// Service-Role.
//
// Mitarbeiter (Zeile in public.mitarbeiter) sind KEINE Tenants und werden
// herausgefiltert — wie in der urspruenglichen P50-Route.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

/** Tuersteher: eingeloggt + role === 'admin'. null = erlaubt. */
async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'nicht angemeldet' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profil || profil.role !== 'admin') {
    return NextResponse.json({ error: 'kein Zugriff' }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

  const admin = getClient();

  // Angestellte identifizieren -> aus der Tenant-Liste ausschliessen
  const { data: maRows } = await admin
    .from('mitarbeiter')
    .select('auth_user_id');
  const mitarbeiterIds = new Set(
    (maRows ?? []).map((r) => r.auth_user_id).filter(Boolean) as string[],
  );

  const { data: profRows, error: profErr } = await admin
    .from('profiles')
    .select('id, email, firma_name, company_name, company, plan, status, onboarding_completed, created_at')
    .order('created_at', { ascending: true, nullsFirst: false });
  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  const { data: tmRows } = await admin
    .from('tenant_module')
    .select('owner_user_id, modul_key, aktiv');
  const moduleProTenant = new Map<string, { gebucht: number; aktiv: number }>();
  for (const r of tmRows ?? []) {
    const e = moduleProTenant.get(r.owner_user_id) ?? { gebucht: 0, aktiv: 0 };
    e.gebucht += 1;
    if (r.aktiv) e.aktiv += 1;
    moduleProTenant.set(r.owner_user_id, e);
  }

  const tenants = (profRows ?? [])
    .filter((p) => !mitarbeiterIds.has(p.id))
    .map((p) => {
      const m = moduleProTenant.get(p.id) ?? { gebucht: 0, aktiv: 0 };
      return {
        id: p.id,
        email: p.email ?? '',
        firma: p.firma_name || p.company_name || p.company || '—',
        plan: p.plan ?? '—',
        status: p.status ?? '—',
        onboarding: !!p.onboarding_completed,
        moduleGebucht: m.gebucht,
        moduleAktiv: m.aktiv,
        failOpen: m.gebucht === 0,
      };
    });

  return NextResponse.json({ ok: true, anzahl: tenants.length, tenants });
}
