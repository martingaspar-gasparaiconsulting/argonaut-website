import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { sendeMail } from '@/lib/mail';
import { TEST_STEPS, naechsterSchrittIndex } from '@/lib/dossierSequenz';

// ============================================================================
// ARGONAUT OS · /api/cron/dossier-sequenz
// Tages-Motor der 7-Tage-Test-Nachfass-Strecke. Holt fällige Test-Leads
// (seq_quelle='test', seq_status='aktiv', seq_naechster_am <= jetzt), verschickt
// den fälligen Schritt und schaltet weiter. Auslösung: Vercel-Cron (CRON_SECRET)
// oder eingeloggter Admin (Test). Service-Role umgeht RLS.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';
const MAX_PRO_DURCHGANG = 300;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function erlaubt(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    if (auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (p as { role?: string } | null)?.role === 'admin';
}

type SeqLead = { id: string; email: string; name: string | null; seq_schritt: number | null; abmelde_token: string | null };

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  const admin = service();
  const jetzt = new Date();

  const { data, error } = await admin
    .from('dossier_leads')
    .select('id, email, name, seq_schritt, abmelde_token')
    .eq('seq_quelle', 'test')
    .eq('seq_status', 'aktiv')
    .lte('seq_naechster_am', jetzt.toISOString())
    .order('seq_naechster_am', { ascending: true })
    .limit(MAX_PRO_DURCHGANG);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const leads = (data ?? []) as SeqLead[];
  let gesendet = 0, fertig = 0, fehler = 0;

  for (const l of leads) {
    const idx = Math.max(0, l.seq_schritt ?? 0);
    const step = TEST_STEPS[idx];
    if (!step) {
      await admin.from('dossier_leads').update({ seq_status: 'fertig' }).eq('id', l.id);
      fertig++;
      continue;
    }
    const abmeldeUrl = `${BASIS_URL}/api/oeffentlich/dossier-abmelden?token=${encodeURIComponent(l.abmelde_token || '')}`;
    const vars = { name: l.name || null, abmeldeUrl, terminUrl: `${BASIS_URL}/demo`, testUrl: `${BASIS_URL}/testen` };

    try {
      const r = await sendeMail({ an: l.email, betreff: step.betreff, html: step.html(vars) });
      if (!r.ok) throw new Error(r.fehler || 'Versand fehlgeschlagen');
      gesendet++;
    } catch {
      // Nicht weiterschalten — der nächste Lauf versucht diesen Schritt erneut.
      fehler++;
      continue;
    }

    const next = naechsterSchrittIndex(idx);
    const nextStep = next >= 0 ? TEST_STEPS[next] : undefined;
    if (!nextStep) {
      await admin.from('dossier_leads').update({ seq_schritt: idx, seq_status: 'fertig' }).eq('id', l.id);
      fertig++;
    } else {
      const deltaTage = nextStep.tag - step.tag;
      const nextAm = new Date(jetzt.getTime() + Math.max(0, deltaTage) * 86400000).toISOString();
      await admin.from('dossier_leads').update({ seq_schritt: next, seq_naechster_am: nextAm }).eq('id', l.id);
    }
  }

  return NextResponse.json({ ok: true, geprueft: leads.length, gesendet, fertig, fehler });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
