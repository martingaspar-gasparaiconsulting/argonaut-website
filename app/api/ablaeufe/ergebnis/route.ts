import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/ergebnis?id= — PDF aus einem Ablauf öffnen (Paket 167)
//
// Nur die Geschäftsleitung (RLS auf ablauf_ergebnisse und auf dem privaten
// Speicher „ablauf-dateien"). Liefert einen Link, der 60 Sekunden gilt, und
// leitet dorthin weiter. Kein Service-Schlüssel — alles mit der Anmeldung.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'Kein Ergebnis gewählt.' }, { status: 400 });

  const { data } = await supabase.from('ablauf_ergebnisse').select('id, owner_user_id, art, datei_pfad').eq('id', id).maybeSingle();
  const e = data as { owner_user_id: string; art: string; datei_pfad: string | null } | null;
  if (!e || e.owner_user_id !== user.id) return NextResponse.json({ ok: false, error: 'Nicht gefunden.' }, { status: 404 });
  if (e.art !== 'pdf' || !e.datei_pfad) return NextResponse.json({ ok: false, error: 'Zu diesem Ergebnis gibt es keine Datei.' }, { status: 400 });

  const { data: link, error } = await supabase.storage.from('ablauf-dateien').createSignedUrl(e.datei_pfad, 60);
  if (error || !link?.signedUrl) return NextResponse.json({ ok: false, error: 'Die Datei ist gerade nicht erreichbar.' }, { status: 502 });
  return NextResponse.redirect(link.signedUrl, 302);
}
