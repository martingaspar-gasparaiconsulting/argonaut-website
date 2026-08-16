import { createClient } from '@supabase/supabase-js';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';
import { ersterAktiverSchritt, naechsterVersandAm } from '@/lib/autoresponder';
import { verschickeFaellige, type LaufRow } from '@/lib/autoresponderVersand';
import { protokolliereLpEreignis } from '@/lib/lpEreignis';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/optin-bestaetigen/route.ts  (Paket 2b + Funnel P1)
//
// ÖFFENTLICH (kein Login). Ziel des Bestaetigen-Knopfs aus der Double-Opt-In-
// Mail: GET ?token=<bestaetigt_token>. Setzt den Abonnenten auf status='aktiv'
// + bestaetigt_am=jetzt (nachweisbare Einwilligung). Zeigt eine gebrandete
// Bestaetigungsseite. Idempotent: erneuter Klick zeigt weiterhin Erfolg.
// Funnel P1: stammt der Abonnent von einer Landingpage (landingpage_id gesetzt),
// wird bei der ERSTEN Bestaetigung ein 'bestaetigung'-Ereignis gezaehlt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

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
      .select('id, status, owner_user_id, email, name, landingpage_id, variante')
      .eq('bestaetigt_token', token)
      .maybeSingle();

    const ab = gefunden as {
      id: string; status: string; owner_user_id: string | null;
      email: string; name: string | null; landingpage_id: string | null;
      variante: 'A' | 'B' | null;
    } | null;

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

    // Funnel P1: stammt der Kontakt von einer Landingpage, Bestaetigung zaehlen
    // (A-B: mit der Variante, die der Kontakt bei der Anmeldung gesehen hat).
    await protokolliereLpEreignis(admin, ab.owner_user_id, ab.landingpage_id, 'bestaetigung', ab.variante, req.headers);

    // Verzahnung (Paket 2c): Ist beim Betrieb eine Willkommens-Sequenz
    // hinterlegt (optin_sequenz_id) und aktiv, tritt der frisch bestaetigte
    // Kontakt automatisch ein — der Tag-0-Schritt geht sofort raus.
    try {
      if (ab.owner_user_id) {
        const { data: prof } = await admin
          .from('profiles')
          .select('optin_sequenz_id')
          .eq('id', ab.owner_user_id)
          .maybeSingle();
        const seqId = (prof as { optin_sequenz_id?: string | null } | null)?.optin_sequenz_id || null;
        if (seqId) {
          const { data: seq } = await admin
            .from('autoresponder_sequenz')
            .select('id, status')
            .eq('id', seqId)
            .maybeSingle();
          if (seq && (seq as { status: string }).status === 'aktiv') {
            const { data: schritte } = await admin
              .from('autoresponder_schritt')
              .select('position, verzoegerung_tage, aktiv')
              .eq('sequenz_id', seqId);
            const erster = ersterAktiverSchritt(
              (schritte ?? []) as { position: number; verzoegerung_tage: number; aktiv: boolean }[],
            );
            if (erster) {
              const { data: schon } = await admin
                .from('autoresponder_lauf')
                .select('id')
                .eq('sequenz_id', seqId)
                .eq('email', ab.email)
                .maybeSingle();
              if (!schon) {
                const jetzt = new Date().toISOString();
                const { data: neu } = await admin
                  .from('autoresponder_lauf')
                  .insert({
                    owner_user_id: ab.owner_user_id,
                    sequenz_id: seqId,
                    email: ab.email,
                    name: ab.name,
                    naechste_position: erster.position ?? 1,
                    naechster_versand_am: naechsterVersandAm(jetzt, erster.verzoegerung_tage ?? 0),
                    gestartet_am: jetzt,
                    status: 'aktiv',
                  })
                  .select('id, owner_user_id, sequenz_id, email, name, abmelde_token, naechste_position, gestartet_am')
                  .single();
                if (neu && Math.round(erster.verzoegerung_tage ?? 0) === 0) {
                  await verschickeFaellige(admin, [neu as LaufRow], BASIS_URL);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Opt-in Sequenz-Eintritt fehlgeschlagen', e instanceof Error ? e.message : e);
    }

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
