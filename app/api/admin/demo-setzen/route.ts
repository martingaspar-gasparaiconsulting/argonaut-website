import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { betreiberGuard } from '../../../../lib/betreiberGuard';
import { ablaufAusTagen } from '../../../../lib/demo';
import { naechsterPlan } from '../../../../lib/dossierSequenz';
import { ilikeGenau } from '../../../../lib/kontoSchutz';

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

// Korrektur 15.09.2026: eigene Kopie durch das Doppelschloss ersetzt.
// Siehe lib/betreiberGuard.ts — role === 'admin' allein reicht nicht.
async function adminGuard(): Promise<NextResponse | null> {
  return betreiberGuard();
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
  const jetzt = new Date();
  const ablauf = ablaufAusTagen(jetzt.toISOString(), tage);
  const { error } = await admin.from('profiles').update({ demo: true, demo_ablauf: ablauf }).eq('id', tenantId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const strecke = await testStreckeStarten(admin, tenantId, jetzt, ablauf);
  return NextResponse.json({ ok: true, demo: true, demo_ablauf: ablauf, tage, testStrecke: strecke });
}

// ----------------------------------------------------------------------------
// Paket 187: Die Test-Mailstrecke (lib/dossierSequenz) zählt ab jetzt ab der
// FREISCHALTUNG. Hier — beim Start/Verlängern des Testzugangs — bekommt der
// passende Test-Lead (gleiche E-Mail wie das Konto) Start und Ende gesetzt;
// eine wartende Strecke läuft weiter. Fehler hier brechen das Freischalten
// nie ab (Antwort sagt nur „nicht gefunden"/„Fehler").
// ----------------------------------------------------------------------------
type Lead = { id: string; seq_schritt: number | null; seq_status: string | null; bestaetigt_am: string | null };
async function testStreckeStarten(admin: ReturnType<typeof getClient>, tenantId: string, jetzt: Date, ablauf: string): Promise<'gestartet' | 'aktualisiert' | 'kein_lead' | 'fehler'> {
  try {
    const { data: u } = await admin.auth.admin.getUserById(tenantId);
    const email = String(u?.user?.email || '').trim().toLowerCase();
    if (!email) return 'kein_lead';
    const { data: leads, error } = await admin.from('dossier_leads')
      .select('id, seq_schritt, seq_status, bestaetigt_am')
      .eq('seq_quelle', 'test').ilike('email', ilikeGenau(email))
      .in('seq_status', ['aktiv', 'wartet_freischaltung']);
    if (error) return 'fehler';
    const liste = (leads ?? []) as Lead[];
    if (liste.length === 0) return 'kein_lead';
    const start = jetzt.toISOString();
    let gestartet = false;
    for (const l of liste) {
      const update: Record<string, unknown> = { test_start_am: start, test_ende_am: ablauf };
      if (l.seq_status === 'wartet_freischaltung') {
        const plan = naechsterPlan(Math.max(0, (l.seq_schritt ?? 1) - 1), l.bestaetigt_am, start, ablauf, jetzt);
        if (plan.art === 'termin') { update.seq_status = 'aktiv'; update.seq_schritt = plan.schritt; update.seq_naechster_am = plan.am; gestartet = true; }
        else if (plan.art === 'fertig') update.seq_status = 'fertig';
      }
      await admin.from('dossier_leads').update(update).eq('id', l.id);
    }
    return gestartet ? 'gestartet' : 'aktualisiert';
  } catch {
    return 'fehler';
  }
}
