import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { pflichtAn, hatVerifiziertenFaktor } from '@/lib/zweiFaktor';

// ARGONAUT OS · /api/zwei-faktor/stand — ist die Pflicht an? (Paket 164 Stufe 2)
// Nur für die Anzeige (Knöpfe „Später"/„Entfernen" ausblenden). Die Pflicht selbst
// setzt der Pfoertner durch, nicht diese Antwort.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  return NextResponse.json({ ok: true, pflicht: pflichtAn(process.env), hatFaktor: hatVerifiziertenFaktor(user) }, { headers: { 'cache-control': 'no-store' } });
}
