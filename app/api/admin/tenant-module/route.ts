import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { ALLE_MODUL_KEYS } from '../../../../lib/rechte';

// ============================================================================
// ARGONAUT OS · app/api/admin/tenant-module/route.ts  (P50 · Modul-Freischalter)
//
// Schaltet EIN Modul fuer EINEN Tenant an/aus — aus dem Admin-Login des
// Operators. Der Kunde muss nie eingeloggt sein.
//
// Schreibt in public.tenant_module (owner_user_id, modul_key, aktiv) per Upsert
// auf den Unique-Index (owner_user_id, modul_key). AUS = aktiv=false; die Zeile
// bleibt als Historie stehen, das P49-Gate (lib/tenantModule.ts) ignoriert sie.
//
// WICHTIG zur Gate-Mechanik (gebuchteModulKeys): solange KEINE Zeile aktiv ist,
// gilt fail-open — der Kunde sieht ALLES. Ab der ersten aktiv=true-Zeile kippt
// es auf strikte Whitelist: nur angeschaltete Module bleiben sichtbar. Das
// Anschalten baut also die Freigabe-Liste auf, es "versteckt" nicht einzeln.
//
// SICHERHEIT: identischer Admin-Guard wie /api/admin/tenants + /api/admin/stats.
// Nur eingeloggte Nutzer mit profiles.role === 'admin' kommen durch. Erst NACH
// bestandenem Guard laeuft der RLS-ueberschreitende Write ueber die Service-Role.
// Zusaetzlich: modul_key muss ein bekannter Modul-Schluessel sein (ALLE_MODUL_KEYS).
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

export async function POST(req: Request) {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

  // --- Eingabe lesen + streng pruefen ---------------------------------------
  let body: { ownerUserId?: string; modulKey?: string; aktiv?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Ungueltiger Body.' }, { status: 400 });
  }

  const ownerUserId = (body.ownerUserId || '').trim();
  const modulKey = (body.modulKey || '').trim();
  const aktiv = body.aktiv === true;

  if (!ownerUserId) {
    return NextResponse.json({ ok: false, error: 'ownerUserId fehlt.' }, { status: 400 });
  }
  if (!modulKey) {
    return NextResponse.json({ ok: false, error: 'modulKey fehlt.' }, { status: 400 });
  }
  // Kein Fremdschreiben: nur bekannte Modul-Schluessel zulassen.
  if (!ALLE_MODUL_KEYS.includes(modulKey)) {
    return NextResponse.json(
      { ok: false, error: `Unbekanntes Modul: ${modulKey}` },
      { status: 400 },
    );
  }

  // --- Upsert auf den Unique-Index (owner_user_id, modul_key) ----------------
  const admin = getClient();
  const { error } = await admin
    .from('tenant_module')
    .upsert(
      { owner_user_id: ownerUserId, modul_key: modulKey, aktiv },
      { onConflict: 'owner_user_id,modul_key' },
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ownerUserId, modulKey, aktiv });
}
