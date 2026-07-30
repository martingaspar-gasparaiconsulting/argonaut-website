import { createClient } from '@supabase/supabase-js';

// ============================================================================
// ARGONAUT OS · app/api/newsletter/abmelden/route.ts  (Punkt 29b)
//
// ÖFFENTLICH (kein Login). Wird über den Abmelde-Link in jeder Newsletter-Mail
// aufgerufen: GET ?token=<abmelde_token>. Setzt den Abonnenten auf
// status='abgemeldet' (Service-Role, umgeht RLS) und zeigt eine schlichte,
// markenkonforme Bestätigungsseite. §7 UWG: Abmeldung muss ohne Hürde gehen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function seite(titel: string, text: string): Response {
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${titel} · ARGONAUT OS</title>
</head>
<body style="margin:0;background:#0A1628;font-family:Helvetica,Arial,sans-serif;color:#ffffff;">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <div style="color:#C9A84C;font-size:24px;font-weight:800;letter-spacing:0.04em;">ARGONAUT&nbsp;OS</div>
    <h1 style="font-size:22px;margin:28px 0 12px;font-weight:700;">${titel}</h1>
    <p style="color:#8FA3BE;font-size:15px;line-height:1.6;">${text}</p>
  </div>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  if (!token) return seite('Abmeldung', 'Kein gültiger Abmelde-Link.');

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const admin = createClient(url, key);

    const { data, error } = await admin
      .from('newsletter_abonnenten')
      .update({ status: 'abgemeldet', abgemeldet_am: new Date().toISOString() })
      .eq('abmelde_token', token)
      .select('email');

    if (error) return seite('Abmeldung', 'Es gab ein technisches Problem. Bitte versuche es später erneut.');
    if (!data || data.length === 0) {
      return seite('Abmeldung', 'Dieser Link ist nicht mehr gültig — vielleicht bist du bereits abgemeldet.');
    }
    return seite(
      'Erfolgreich abgemeldet ✓',
      'Du wurdest vom Newsletter abgemeldet und erhältst keine weiteren E-Mails mehr. Du kannst dieses Fenster schließen.',
    );
  } catch {
    return seite('Abmeldung', 'Es gab ein technisches Problem. Bitte versuche es später erneut.');
  }
}
