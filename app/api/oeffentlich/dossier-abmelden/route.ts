import { createClient } from '@supabase/supabase-js';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/dossier-abmelden
// ÖFFENTLICH. GET ?token=.. -> stoppt die Test-Nachfass-Strecke für diesen Lead
// (seq_status='abgemeldet'). Zeigt eine kurze Bestätigungsseite. Service-Role.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function seite(titel: string, text: string): Response {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${titel} — ARGONAUT OS</title>
<style>*{font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}body{margin:0;background:#0A1628;color:#EAF1F6;min-height:100dvh;display:flex;align-items:center;justify-content:center}
.box{max-width:520px;padding:40px 28px;text-align:center}.t{font-size:26px}h1{font-weight:700;font-size:22px;margin:14px 0 10px}p{color:#b9cdd6;line-height:1.6}a{color:#C9A84C}</style></head>
<body><div class="box"><div class="t">🔱</div><h1>${titel}</h1><p>${text}</p><p><a href="https://argonaut-os.com">← Zur Startseite</a></p></div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  if (!token) return seite('Link ungültig', 'Dieser Abmelde-Link ist nicht vollständig. Bitte nutze den Link aus der E-Mail.');
  try {
    const db = admin();
    const { data } = await db.from('dossier_leads').select('id').eq('abmelde_token', token).maybeSingle();
    const l = data as { id: string } | null;
    if (!l) return seite('Bereits erledigt', 'Wir konnten keinen aktiven Eintrag finden — vermutlich bist du schon abgemeldet. Alles gut.');
    await db.from('dossier_leads').update({ seq_status: 'abgemeldet' }).eq('id', l.id);
    return seite('Abgemeldet', 'Du erhältst keine weiteren Mails zum Test. Dein Dossier bleibt gültig — und du kannst jederzeit wieder auf uns zukommen.');
  } catch {
    return seite('Kleiner Fehler', 'Das hat gerade nicht geklappt. Bitte versuche es später noch einmal oder antworte kurz auf eine unserer Mails.');
  }
}
