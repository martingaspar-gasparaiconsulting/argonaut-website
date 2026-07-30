import { createClient } from '@supabase/supabase-js';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/optin-bestaetigen/route.ts  (Paket 2b)
//
// ÖFFENTLICH (kein Login). Ziel des Bestaetigen-Knopfs aus der Double-Opt-In-
// Mail: GET ?token=<bestaetigt_token>. Setzt den Abonnenten auf status='aktiv'
// + bestaetigt_am=jetzt (nachweisbare Einwilligung). Zeigt eine gebrandete
// Bestaetigungsseite. Idempotent: erneuter Klick zeigt weiterhin Erfolg.
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
  if (!token) return seite('Newsletter', '#1a2332', 'Anmeldung', 'Kein gültiger Bestätigungs-Link.');

  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } },
    );

    const { data: gefunden } = await admin
      .from('newsletter_abonnenten')
      .select('id, status, owner_user_id')
      .eq('bestaetigt_token', token)
      .maybeSingle();

    const ab = gefunden as { id: string; status: string; owner_user_id: string | null } | null;

    // Branding des Betriebs fuer die Seite laden (falls vorhanden).
    let firma = 'Newsletter';
    let akzent = '#1a2332';
    if (ab?.owner_user_id) {
      const { data: prof } = await admin
        .from('profiles')
        .select('firma_name, firma_akzentfarbe')
        .eq('id', ab.owner_user_id)
        .maybeSingle();
      const pp = (prof ?? {}) as { firma_name?: string | null; firma_akzentfarbe?: string | null };
      firma = (pp.firma_name || '').trim() || 'Newsletter';
      akzent = sichereFarbe(pp.firma_akzentfarbe);
    }

    if (!ab) {
      return seite('Newsletter', '#1a2332', 'Anmeldung', 'Dieser Bestätigungs-Link ist nicht (mehr) gültig.');
    }
    if (ab.status === 'aktiv') {
      return seite(firma, akzent, 'Bereits bestätigt', `Deine Anmeldung bei ${firma} war schon bestätigt. Du bist dabei — nichts weiter zu tun.`);
    }

    await admin
      .from('newsletter_abonnenten')
      .update({ status: 'aktiv', bestaetigt_am: new Date().toISOString() })
      .eq('id', ab.id);

    return seite(
      firma,
      akzent,
      'Anmeldung bestätigt',
      `Vielen Dank — deine Anmeldung bei ${firma} ist jetzt bestätigt. Du kannst dieses Fenster schließen.`,
    );
  } catch {
    return seite('Newsletter', '#1a2332', 'Anmeldung', 'Es gab ein technisches Problem. Bitte versuche es später erneut.');
  }
}
