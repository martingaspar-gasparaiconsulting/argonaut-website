import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { pflichtAn, hatVerifiziertenFaktor } from '@/lib/zweiFaktor';
import { betriebPflichtAb } from '@/lib/zweiFaktorServer';
import { pflichtWirkt } from '@/lib/zweiFaktorPflicht';

// ARGONAUT OS · /api/zwei-faktor/stand — ist die Pflicht an? (Paket 164 Stufe 2)
// Nur für die Anzeige (Knöpfe „Später"/„Entfernen" ausblenden). Die Pflicht selbst
// setzt der Pfoertner durch, nicht diese Antwort.
// Paket 190: zusätzlich die Pflicht des eigenen Betriebs (pflichtAb = Pflicht-Tag,
// auch während der Übergangsfrist, damit die Seite den Termin nennen kann).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const pflichtAb = await betriebPflichtAb(supabase);
  const pflicht = pflichtAn(process.env) || pflichtWirkt(pflichtAb, new Date());
  return NextResponse.json({ ok: true, pflicht, pflichtAb, hatFaktor: hatVerifiziertenFaktor(user) }, { headers: { 'cache-control': 'no-store' } });
}
