import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · W6 · app/api/fotos/route.ts — Foto-Suche
// Sucht kostenlose Bilder für den Website-Bauer.
//   • Ist UNSPLASH_ACCESS_KEY gesetzt → echte Stichwort-Suche über Unsplash.
//   • Sonst → sofort funktionierender Fallback (Lorem Picsum, seed-basiert),
//     damit die Bildauswahl auch ohne Einrichtung schon Bilder zeigt.
// Nur eingeloggt. GET ?q=<stichwort>&page=<n>
// ============================================================

export const runtime = 'nodejs';

type Foto = { url: string; thumb: string; autor: string; autorUrl: string; quelle: string };

function picsumFallback(q: string, page: number): Foto[] {
  const basis = (q || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business';
  const out: Foto[] = [];
  for (let i = 0; i < 12; i++) {
    const seed = `${basis}-${page}-${i}`;
    out.push({
      url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/1280/854`,
      thumb: `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/300`,
      autor: 'Lorem Picsum',
      autorUrl: 'https://picsum.photos',
      quelle: 'picsum',
    });
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().slice(0, 80);
    const page = Math.max(1, Math.min(20, parseInt(searchParams.get('page') || '1') || 1));

    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) {
      return NextResponse.json({ quelle: 'picsum', hinweis: 'Bildsuche im Testmodus (ohne Unsplash-Schlüssel). Für echte Stichwortsuche UNSPLASH_ACCESS_KEY hinterlegen.', fotos: picsumFallback(q || 'business', page) });
    }

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q || 'business')}&per_page=12&page=${page}&orientation=landscape&content_filter=high`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
    if (!res.ok) {
      return NextResponse.json({ quelle: 'picsum', hinweis: 'Unsplash gerade nicht erreichbar — Testbilder geladen.', fotos: picsumFallback(q || 'business', page) });
    }
    const data = await res.json();
    const fotos: Foto[] = (Array.isArray(data.results) ? data.results : []).map((r: Record<string, unknown>) => {
      const urls = (r.urls || {}) as Record<string, string>;
      const user = (r.user || {}) as Record<string, unknown>;
      const links = (user.links || {}) as Record<string, string>;
      return {
        url: urls.regular || urls.full || urls.raw || '',
        thumb: urls.small || urls.thumb || urls.regular || '',
        autor: (user.name as string) || 'Unsplash',
        autorUrl: links.html || 'https://unsplash.com',
        quelle: 'unsplash',
      };
    }).filter((f: Foto) => f.url);

    return NextResponse.json({ quelle: 'unsplash', fotos });
  } catch (e: unknown) {
    console.error('Foto-Suche Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ quelle: 'picsum', hinweis: 'Fehler bei der Bildsuche — Testbilder geladen.', fotos: picsumFallback('business', 1) });
  }
}
