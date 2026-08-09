// ============================================================
// ARGONAUT OS · Admin-Route: CTA-Modus umschalten (nur Betreiber)
// Setzt betreiber_flags.cta_modus = 'termin' | 'bestellen'. Auth: eingeloggt
// UND (falls gesetzt) user.id === ANALYSE_BETREIBER_ID. Schreiben via Service-Role.
// ============================================================
import { NextResponse } from 'next/server';
import { createClient as createServer } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (betreiber && user.id !== betreiber) {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const modus = body?.modus === 'bestellen' ? 'bestellen' : 'termin';

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
  const { error } = await admin
    .from('betreiber_flags')
    .upsert({ schluessel: 'cta_modus', wert: modus, aktualisiert_am: new Date().toISOString() }, { onConflict: 'schluessel' });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, modus });
}
