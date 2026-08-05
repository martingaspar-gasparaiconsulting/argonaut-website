import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · W7 · app/api/webseite-veroeffentlichen/route.ts
// Schaltet eine gespeicherte Seite live oder offline. Vergibt beim ersten
// Veröffentlichen eine öffentliche Kennung (oeffentlich_id) für die URL
// /p/<id>. Nur eingeloggt; RLS scopt auf die eigene Seite.
// Body: { slug: string, live: boolean }
// ============================================================

export const runtime = 'nodejs';

function slugify(s: string): string {
  return (s || 'seite').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'seite';
}
function suffix(): string {
  // kurze Zufallskennung (Browser-unabhängig, serverseitig)
  return Math.random().toString(36).slice(2, 8);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slug = (typeof body?.slug === 'string' ? body.slug : '').trim();
    const live = !!body?.live;
    if (!slug) return NextResponse.json({ error: 'Kein Seiten-Slug übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { data: row } = await supabase
      .from('web_seiten')
      .select('id, oeffentlich_id, titel')
      .eq('owner_user_id', user.id)
      .eq('slug', slug)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'Bitte die Seite zuerst speichern.' }, { status: 400 });

    const r = row as { id: string; oeffentlich_id: string | null; titel: string | null };
    const oeffentlich_id = r.oeffentlich_id || `${slugify(r.titel || 'seite')}-${suffix()}`;

    const { error } = await supabase
      .from('web_seiten')
      .update({ status: live ? 'live' : 'entwurf', oeffentlich_id, aktualisiert_am: new Date().toISOString() })
      .eq('id', r.id);

    if (error) return NextResponse.json({ error: 'Konnte den Status nicht ändern.' }, { status: 500 });

    return NextResponse.json({ oeffentlich_id, status: live ? 'live' : 'entwurf' });
  } catch (e: unknown) {
    console.error('Veröffentlichen Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
