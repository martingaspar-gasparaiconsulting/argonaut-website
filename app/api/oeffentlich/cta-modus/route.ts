// ============================================================
// ARGONAUT OS · Öffentliche Route: aktueller CTA-Modus
// Liefert, ob die öffentlichen Knöpfe „Termin vereinbaren" (Standard) oder
// „Sofort bestellen" zeigen sollen. Rein lesend, Service-Role, kein Login.
// ============================================================
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}

export async function GET() {
  try {
    const { data } = await admin()
      .from('betreiber_flags')
      .select('wert')
      .eq('schluessel', 'cta_modus')
      .maybeSingle();
    const modus = data?.wert === 'bestellen' ? 'bestellen' : 'termin';
    return NextResponse.json({ modus });
  } catch {
    return NextResponse.json({ modus: 'termin' });
  }
}
