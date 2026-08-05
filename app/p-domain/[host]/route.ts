import { createAdminClient } from '@/lib/supabase-admin';
import { seiteHtml, type CiWeb, type Block } from '@/lib/webBloecke';

// ============================================================
// ARGONAUT OS · W7 · app/p-domain/[host]/route.ts
// Liefert die veröffentlichte Kundenseite anhand der CUSTOM-DOMAIN aus.
// Der Proxy (proxy.ts) schreibt Aufrufe fremder Domains hierher um.
// Nur Seiten mit status = 'live' und passender `domain`. Service-Role.
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function seite404(): Response {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Seite nicht gefunden</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0A1628;color:#E8EDF4;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}div{max-width:440px;padding:24px}h1{font-size:56px;margin:0;color:#C9A84C}p{color:#8FA3BE;line-height:1.6}</style></head>
<body><div><h1>404</h1><p>Für diese Adresse ist noch keine veröffentlichte Seite verbunden.</p></div></body></html>`;
  return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const domain = decodeURIComponent(host || '').toLowerCase().replace(/^www\./, '').split(':')[0].trim();
  if (!domain) return seite404();

  try {
    const db = createAdminClient();
    // Domain kann mit oder ohne www gespeichert sein — beide Varianten prüfen.
    const { data: seite } = await db
      .from('web_seiten')
      .select('owner_user_id, titel, bloecke, status, domain')
      .in('domain', [domain, `www.${domain}`])
      .eq('status', 'live')
      .maybeSingle();

    if (!seite) return seite404();

    const { data: ci } = await db
      .from('web_ci')
      .select('*')
      .eq('owner_user_id', (seite as { owner_user_id: string }).owner_user_id)
      .maybeSingle();

    const bloecke = Array.isArray((seite as { bloecke?: unknown }).bloecke) ? ((seite as { bloecke: Block[] }).bloecke) : [];
    const html = seiteHtml({ titel: (seite as { titel?: string }).titel, bloecke }, (ci as CiWeb) || {}, new Date().getFullYear());

    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (e: unknown) {
    console.error('Custom-Domain Seite Fehler:', e instanceof Error ? e.message : e);
    return seite404();
  }
}
