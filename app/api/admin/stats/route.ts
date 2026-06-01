import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Diese Route läuft NUR serverseitig. Der Service-Key ist hier sicher
// und wird niemals an den Browser ausgeliefert.
export const dynamic = 'force-dynamic';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server config fehlt' }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase
    .from('customers')
    .select('id, name, email, paket, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Nur echte Kunden zurückgeben — keine Mock-Daten
  return NextResponse.json(data ?? []);
}
