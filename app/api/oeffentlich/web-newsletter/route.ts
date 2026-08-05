import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail, absenderBranding } from '@/lib/mail';
import { emailNormalisieren, istEmailGueltig, optinBestaetigenUrl, optinBestaetigungHtml } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/web-newsletter  (Website-Bauer · Newsletter-DOI)
// ÖFFENTLICH. Nimmt eine Newsletter-Anmeldung von einer veröffentlichten
// Kundenseite (/p/[id] oder eigene Domain) entgegen, ordnet sie über die
// oeffentlich_id dem Seiten-Inhaber zu und trägt den Abonnenten mit Double-
// Opt-In in dessen eigene Liste (newsletter_abonnenten) ein — gleiches Muster
// wie /api/oeffentlich/optin, nur über die Seite statt über einen optin_slug.
// Erst nach Klick auf den Bestätigen-Link (optin-bestaetigen, token-basiert)
// wird der Abonnent 'aktiv'. Service-Role umgeht RLS; owner_user_id kommt
// sicher aus web_seiten, NIE vom Client.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Ungültige Anfrage.' }, { status: 400 });
    }
    const b = body as Record<string, unknown>;

    // Spam-Falle (Honeypot): gefüllt -> stumm „ok", nichts eintragen.
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') {
      return NextResponse.json({ ok: true });
    }

    const seite = (b.seite || '').toString().trim();
    const email = emailNormalisieren(b.email as string | null | undefined);
    if (!seite) return NextResponse.json({ ok: false, error: 'Seite nicht erkannt.' }, { status: 400 });
    if (!istEmailGueltig(email)) {
      return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });
    }
    if (b.privacy !== true) {
      return NextResponse.json({ ok: false, error: 'Bitte der Datenschutzerklärung zustimmen.' }, { status: 400 });
    }

    const db = admin();

    // Seiten-Inhaber sicher bestimmen — nur veröffentlichte Seiten nehmen an.
    const { data: seiteRow } = await db
      .from('web_seiten')
      .select('owner_user_id, status')
      .eq('oeffentlich_id', seite)
      .maybeSingle();
    const inhaber = seiteRow as { owner_user_id?: string; status?: string } | null;
    if (!inhaber || inhaber.status !== 'live' || !inhaber.owner_user_id) {
      return NextResponse.json({ ok: false, error: 'Diese Seite nimmt gerade keine Anmeldungen an.' }, { status: 404 });
    }
    const ownerId = inhaber.owner_user_id;

    // Bestehenden Eintrag prüfen (owner + email).
    const { data: vorhanden } = await db
      .from('newsletter_abonnenten')
      .select('id, status')
      .eq('owner_user_id', ownerId)
      .eq('email', email)
      .maybeSingle();
    const v = vorhanden as { id: string; status: string } | null;
    if (v && v.status === 'aktiv') {
      // Schon bestätigt -> keine zweite Mail nötig.
      return NextResponse.json({ ok: true, status: 'bereits' });
    }

    const token = randomUUID();
    if (v) {
      await db
        .from('newsletter_abonnenten')
        .update({ status: 'unbestaetigt', bestaetigt_token: token, bestaetigt_am: null })
        .eq('id', v.id);
    } else {
      await db.from('newsletter_abonnenten').insert({
        owner_user_id: ownerId,
        email,
        status: 'unbestaetigt',
        quelle: 'website',
        bestaetigt_token: token,
      });
    }

    // Branding des Betriebs (wie die Bestätigungsseite: profiles).
    const { data: prof } = await db
      .from('profiles')
      .select('firma_name')
      .eq('id', ownerId)
      .maybeSingle();
    const firma = ((prof as { firma_name?: string } | null)?.firma_name || '').toString().trim() || 'Newsletter';
    const brand = await absenderBranding(db, ownerId);
    const url = optinBestaetigenUrl(BASIS_URL, token);

    await sendeMail({
      an: email,
      betreff: `Bitte bestätige deine Anmeldung bei ${firma}`,
      html: optinBestaetigungHtml(firma, url, brand.akzent, null),
      absenderName: firma,
      antwortAn: brand.email,
    });

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch (e: unknown) {
    console.error('web-newsletter Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Anmeldung fehlgeschlagen. Bitte später erneut.' }, { status: 500 });
  }
}
