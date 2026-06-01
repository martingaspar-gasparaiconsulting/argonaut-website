import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Läuft NUR serverseitig. Service-Key bleibt geheim.
export const dynamic = 'force-dynamic';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

// GET: liefert Kunden + Meilensteine
export async function GET() {
  const supabase = getClient();

  const [{ data: customers, error: cErr }, { data: meilensteine, error: mErr }] = await Promise.all([
    supabase.from('customers').select('id, name, email, paket, status, created_at').order('created_at', { ascending: false }),
    supabase.from('meilensteine').select('*').order('sortierung', { ascending: true }),
  ]);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  return NextResponse.json({
    customers: customers ?? [],
    meilensteine: meilensteine ?? [],
  });
}

// POST: Meilenstein als gegründet/nicht-gegründet markieren
export async function POST(req: Request) {
  const supabase = getClient();
  let body: { id?: number; gegruendet?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  if (typeof body.id !== 'number') {
    return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  }

  const updates = body.gegruendet
    ? { status: 'gegruendet', gegruendet_am: new Date().toISOString() }
    : { status: 'leistbar', gegruendet_am: null };

  const { error } = await supabase
    .from('meilensteine')
    .update(updates)
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
