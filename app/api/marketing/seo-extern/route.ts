import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { normalisiereUrl, extrahiereSeite, pruefeExtern } from '@/lib/seoExtern';

// ============================================================================
// ARGONAUT OS · app/api/marketing/seo-extern/route.ts
// (Marketing-Ausbau · Punkt 6b — bestehende externe Website prüfen)
//
// Holt die vom Kunden angegebene Live-Seite SERVERSEITIG, zerlegt das HTML und
// bewertet es gegen die On-Page-SEO-Faktoren (lib/seoExtern). Schutz gegen
// SSRF (keine internen/privaten Adressen), Timeout, Größenlimit, nur HTML.
//   POST { url } -> { ok, url, score, note, offen, checks, title }
// Nur eingeloggt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Blockt interne/private Ziele (SSRF-Schutz). true = öffentlich erlaubt. */
function istOeffentlich(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    // IP-Literale in privaten Bereichen sperren.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const p = host.split('.').map(Number);
      if (p[0] === 10) return false;
      if (p[0] === 127) return false;
      if (p[0] === 0) return false;
      if (p[0] === 169 && p[1] === 254) return false;
      if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
      if (p[0] === 192 && p[1] === 168) return false;
    }
    if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const url = normalisiereUrl((body as Record<string, unknown> | null)?.url);
  if (!url) return NextResponse.json({ ok: false, error: 'Bitte eine gültige Website-Adresse eingeben (z. B. meine-firma.de).' }, { status: 400 });
  if (!istOeffentlich(url)) return NextResponse.json({ ok: false, error: 'Diese Adresse kann nicht geprüft werden (interne/lokale Adressen sind nicht erlaubt).' }, { status: 400 });

  // Live-Seite holen: Timeout 9 s, HTML erwartet, Größe begrenzt.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  let html = '';
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'ARGONAUT-SEO-Check/1.0 (+https://argonaut-os.com)',
        'accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) {
      clearTimeout(timer);
      return NextResponse.json({ ok: false, error: `Die Seite antwortet mit Fehler ${res.status}. Adresse prüfen und erneut versuchen.` }, { status: 502 });
    }
    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (ctype && !ctype.includes('html')) {
      clearTimeout(timer);
      return NextResponse.json({ ok: false, error: 'Unter dieser Adresse liegt keine normale Webseite (kein HTML).' }, { status: 415 });
    }
    const roh = await res.text();
    html = roh.slice(0, 800_000); // ~800 KB reichen für den <head> + Inhalt
  } catch (e: unknown) {
    clearTimeout(timer);
    const abort = e instanceof Error && e.name === 'AbortError';
    return NextResponse.json({ ok: false, error: abort ? 'Die Seite hat zu lange gebraucht (Zeitüberschreitung). Bitte später erneut versuchen.' : 'Die Seite ist nicht erreichbar. Bitte die Adresse prüfen.' }, { status: 502 });
  }
  clearTimeout(timer);

  const parsed = extrahiereSeite(html);
  const ergebnis = pruefeExtern(parsed, url);

  return NextResponse.json({ ok: true, url, ...ergebnis });
}
