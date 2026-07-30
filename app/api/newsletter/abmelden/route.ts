import { createClient } from '@supabase/supabase-js';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · app/api/newsletter/abmelden/route.ts  (Punkt 29b/29c)
//
// ÖFFENTLICH (kein Login). Wird über den Abmelde-Link in jeder Newsletter-Mail
// aufgerufen: GET ?token=<abmelde_token>. Setzt den Abonnenten auf
// status='abgemeldet' (Service-Role, umgeht RLS) und zeigt eine schlichte
// Bestätigungsseite im Branding DES KUNDEN (Firmenname + Akzentfarbe), NICHT
// ARGONAUT. §7 UWG: Abmeldung muss ohne Hürde gehen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function seite(firma: string, akzent: string, titel: string, text: string): Response {
  const f = escapeHtml(firma);
  const a = sichereFarbe(akzent);
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(titel)}</title>
</head>
<body style="margin:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;color:#1a2332;">
  <div style="max-width:520px;margin:0 auto;padding:56px 24px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:40px 28px;text-align:center;">
      <div style="font-size:20px;font-weight:800;color:${a};">${f}</div>
      <div style="height:3px;width:56px;background:${a};margin:14px auto 24px;border-radius:2px;"></div>
      <h1 style="font-size:22px;margin:0 0 12px;font-weight:700;">${escapeHtml(titel)}</h1>
      <p style="color:#6b7280;font-size:15px;line-height:1.6;margin:0;">${escapeHtml(text)}</p>
    </div>
  </div>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function GET(req: Request) {
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  if (!token) return seite('Newsletter', '#1a2332', 'Abmeldung', 'Kein gültiger Abmelde-Link.');

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const admin = createClient(url, key);

    const { data, error } = await admin
      .from('newsletter_abonnenten')
      .update({ status: 'abgemeldet', abgemeldet_am: new Date().toISOString() })
      .eq('abmelde_token', token)
      .select('email, owner_user_id');

    if (error) return seite('Newsletter', '#1a2332', 'Abmeldung', 'Es gab ein technisches Problem. Bitte versuche es später erneut.');
    if (!data || data.length === 0) {
      return seite('Newsletter', '#1a2332', 'Abmeldung', 'Dieser Link ist nicht mehr gültig — vielleicht bist du bereits abgemeldet.');
    }

    // Branding des versendenden Kunden für die Bestätigungsseite laden.
    let firma = 'Newsletter';
    let akzent = '#1a2332';
    const ownerId = (data[0] as { owner_user_id?: string | null }).owner_user_id;
    if (ownerId) {
      const { data: prof } = await admin
        .from('profiles')
        .select('firma_name, firma_akzentfarbe')
        .eq('id', ownerId)
        .maybeSingle();
      const pp = (prof ?? {}) as { firma_name?: string | null; firma_akzentfarbe?: string | null };
      firma = (pp.firma_name || '').trim() || 'Newsletter';
      akzent = sichereFarbe(pp.firma_akzentfarbe);
    }

    return seite(
      firma,
      akzent,
      'Erfolgreich abgemeldet',
      `Du wurdest vom Newsletter von ${firma} abgemeldet und erhältst keine weiteren E-Mails mehr. Du kannst dieses Fenster schließen.`,
    );
  } catch {
    return seite('Newsletter', '#1a2332', 'Abmeldung', 'Es gab ein technisches Problem. Bitte versuche es später erneut.');
  }
}
