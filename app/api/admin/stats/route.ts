import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';

// ============================================================================
// ARGONAUT OS · app/api/admin/stats/route.ts
//
// Laeuft NUR serverseitig. Service-Key bleibt geheim.
//
// SICHERHEIT (14.07.26 nachgeruestet): Diese Route umgeht mit dem Service-Role-
// Key die RLS und liefert ALLE Kunden + Meilensteine. Sie MUSS daher selbst
// pruefen, wer anfragt. Frueher fehlte das komplett -> jeder haette die
// Kundenliste abrufen koennen. Jetzt: Session lesen -> profiles.role === 'admin'
// -> sonst 401/403. Gleiches Muster wie app/admin/page.tsx.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Service-Role-Client (umgeht RLS) — erst NACH bestandenem Admin-Check nutzen. */
function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

/**
 * Der Tuersteher. Prueft die eingeloggte Session gegen profiles.role.
 * @returns null = Zugriff erlaubt (Admin). Sonst eine fertige Fehler-Response.
 */
async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'nicht angemeldet' }, { status: 401 });
  }

  // Rolle des eingeloggten Nutzers pruefen (die eigene Zeile darf er per RLS lesen)
  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profil || profil.role !== 'admin') {
    return NextResponse.json({ error: 'kein Zugriff' }, { status: 403 });
  }

  return null; // alles gut -> Admin
}

// GET: liefert Kunden + Meilensteine
export async function GET() {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

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

// POST: Meilenstein als gegruendet/nicht-gegruendet markieren
export async function POST(req: Request) {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

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
