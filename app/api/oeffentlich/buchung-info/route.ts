// ============================================================================
// ARGONAUT OS · /api/oeffentlich/buchung-info  (Website-Bauer · Termin-Baustein)
// ÖFFENTLICH (login-frei). Sagt dem „Online-Terminbuchung"-Baustein, ob der
// Seiten-Inhaber die Buchung freigeschaltet hat, und liefert den Buchungs-Slug
// für den Link auf /buchen/<slug>. Inhaber wird sicher über die oeffentlich_id
// aus web_seiten (status=live) bestimmt — NIE vom Client. Der Slug geht nur
// nach außen, wenn die Buchung aktiv ist (kein Leaken inaktiver Slugs).
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: Request) {
  try {
    const seite = (new URL(req.url).searchParams.get('seite') || '').trim();
    if (!seite) return NextResponse.json({ aktiv: false, slug: null });

    const db = admin();

    const { data: s } = await db
      .from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ aktiv: false, slug: null });
    }

    const { data: p } = await db
      .from('profiles').select('buchung_slug, buchung_aktiv').eq('id', inh.owner_user_id).maybeSingle();
    const prof = p as { buchung_slug?: string | null; buchung_aktiv?: boolean } | null;
    const aktiv = !!(prof && prof.buchung_aktiv === true && prof.buchung_slug);
    return NextResponse.json({ aktiv, slug: aktiv ? prof!.buchung_slug : null });
  } catch (e: unknown) {
    console.error('oeffentlich/buchung-info:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ aktiv: false, slug: null });
  }
}
