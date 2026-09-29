// ============================================================
// ARGONAUT OS · Admin-Route: CTA-Modus umschalten (nur Betreiber)
// Setzt betreiber_flags.cta_modus = 'termin' | 'beide' | 'bestellen'. Auth: eingeloggt
// UND user.id === ANALYSE_BETREIBER_ID (Paket 170: ohne Variable niemand). Schreiben via Service-Role.
// ============================================================
import { NextResponse } from 'next/server';
import { betreiberGuard } from '@/lib/betreiberGuard';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Paket 170 (K4, 29.09.2026): vorher kam ohne ANALYSE_BETREIBER_ID jeder Angemeldete durch
  // (keine Rollenpruefung). Jetzt Doppelschloss wie alle Betreiber-Wege.
  const absage = await betreiberGuard();
  if (absage) return absage;

  const body = await req.json().catch(() => ({}));
  const raw = body?.modus;
  const modus = raw === 'bestellen' ? 'bestellen' : raw === 'beide' ? 'beide' : 'termin';

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
