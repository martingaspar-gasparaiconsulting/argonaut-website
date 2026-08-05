import { createAdminClient } from '@/lib/supabase-admin';
import { seiteHtml, type CiWeb, type Block } from '@/lib/webBloecke';

// ============================================================
// ARGONAUT OS · W7 · app/p/[id]/route.ts — Öffentliche Auslieferung
// Liefert eine veröffentlichte Kundenseite als fertiges HTML unter
// /p/<oeffentlich_id>. Nur Seiten mit status = 'live'. Läuft serverseitig
// über den Service-Role-Admin (umgeht RLS, gibt aber nur öffentliche
// Webseiten-Inhalte zurück — nichts Sensibles).
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function seite404(): Response {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Seite nicht gefunden</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#0A1628;color:#E8EDF4;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}div{max-width:420px;padding:24px}h1{font-size:56px;margin:0;color:#C9A84C}p{color:#8FA3BE;line-height:1.6}</style></head>
<body><div><h1>404</h1><p>Diese Seite ist nicht (mehr) veröffentlicht.</p></div></body></html>`;
  return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kennung = (id || '').trim();
  if (!kennung) return seite404();

  try {
    const db = createAdminClient();
    const { data: seite } = await db
      .from('web_seiten')
      .select('owner_user_id, titel, bloecke, status')
      .eq('oeffentlich_id', kennung)
      .maybeSingle();

    if (!seite || seite.status !== 'live') return seite404();

    const { data: ci } = await db
      .from('web_ci')
      .select('*')
      .eq('owner_user_id', (seite as { owner_user_id: string }).owner_user_id)
      .maybeSingle();

    const bloecke = Array.isArray((seite as { bloecke?: unknown }).bloecke) ? ((seite as { bloecke: Block[] }).bloecke) : [];
    const html = seiteHtml({ titel: (seite as { titel?: string }).titel, bloecke }, (ci as CiWeb) || {}, new Date().getFullYear(), { oeffentlichId: kennung });

    return new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60, s-maxage=60' },
    });
  } catch (e: unknown) {
    console.error('Öffentliche Seite Fehler:', e instanceof Error ? e.message : e);
    return seite404();
  }
}
