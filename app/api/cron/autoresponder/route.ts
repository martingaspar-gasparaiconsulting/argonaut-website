import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { verschickeFaellige, type LaufRow } from '../../../../lib/autoresponderVersand';

// ============================================================================
// ARGONAUT OS · app/api/cron/autoresponder/route.ts  (Paket 2 / 2a)
//
// Der taegliche Versand-MOTOR. Holt alle faelligen Laeufe (status='aktiv',
// naechster_versand_am <= jetzt) und verschickt je Lauf den faelligen Schritt
// ueber den gemeinsamen Baustein lib/autoresponderVersand.
//
// Ausloesung: Vercel Cron (Bearer CRON_SECRET) ODER eingeloggter Admin (Test).
// Service-Role umgeht RLS. Demo-Konten senden NICHT (im Baustein geprueft).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PRO_DURCHGANG = 300;
const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

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
  return p?.role === 'admin';
}

async function lauf(req: Request) {
  if (!(await erlaubt(req))) {
    return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  }
  const admin = service();
  const jetzt = new Date().toISOString();

  const { data: laeufeD, error } = await admin
    .from('autoresponder_lauf')
    .select('id, owner_user_id, sequenz_id, email, name, abmelde_token, naechste_position, gestartet_am')
    .eq('status', 'aktiv')
    .lte('naechster_versand_am', jetzt)
    .order('naechster_versand_am', { ascending: true })
    .limit(MAX_PRO_DURCHGANG);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const laeufe = (laeufeD ?? []) as LaufRow[];
  const res = await verschickeFaellige(admin, laeufe, BASIS_URL);

  return NextResponse.json({
    ok: true,
    geprueft: laeufe.length,
    ...res,
    gedeckelt: laeufe.length >= MAX_PRO_DURCHGANG,
  });
}

export async function GET(req: Request) {
  return lauf(req);
}
export async function POST(req: Request) {
  return lauf(req);
}
