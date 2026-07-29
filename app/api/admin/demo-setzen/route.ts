import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { ablaufAusTagen } from '../../../../lib/demo';

// ============================================================================
// ARGONAUT OS · app/api/admin/demo-setzen/route.ts  (Punkt 26a)
//
// OPERATOR startet/verlaengert/beendet ein Demo-Konto.
//   Body { tenantId, tage }        -> demo = true,  demo_ablauf = jetzt + tage Tage
//   Body { tenantId, beenden:true } -> demo = false, demo_ablauf = null
//
// Admin-Guard wie in /api/admin/tenants (nur profiles.role === 'admin').
// Der Schreibzugriff auf ein fremdes profiles laeuft ueber die Service-Role.
// Setzt NUR die zwei Demo-Spalten — ruehrt sonst nichts am Konto an.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || profil.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  return null;
}

export async function POST(req: Request) {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

  let body: { tenantId?: string; tage?: number; beenden?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Ungueltiger Body.' }, { status: 400 });
  }

  const tenantId = String(body?.tenantId || '').trim();
  if (!tenantId) return NextResponse.json({ ok: false, error: 'Keine Tenant-ID.' }, { status: 400 });

  const admin = getClient();

  if (body?.beenden) {
    const { error } = await admin.from('profiles').update({ demo: false, demo_ablauf: null }).eq('id', tenantId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, demo: false, demo_ablauf: null });
  }

  const tage = Math.max(1, Math.round(Number(body?.tage) || 7));
  const ablauf = ablaufAusTagen(new Date().toISOString(), tage);
  const { error } = await admin.from('profiles').update({ demo: true, demo_ablauf: ablauf }).eq('id', tenantId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, demo: true, demo_ablauf: ablauf, tage });
}
