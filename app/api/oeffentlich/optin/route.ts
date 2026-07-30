import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail, absenderBranding } from '@/lib/mail';
import { emailNormalisieren, istEmailGueltig, optinBestaetigenUrl, optinBestaetigungHtml } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/optin/route.ts  (Paket 2b · Double-Opt-In)
//
// ÖFFENTLICH (kein Login). Das oeffentliche Anmeldeformular eines Betriebs.
//   GET  ?slug=..   -> { betrieb, titel, text, akzent }  (Branding fuer die Seite)
//   POST { slug, email, name? } -> legt/aktualisiert den Abonnenten als
//        status='unbestaetigt' an und schickt die Double-Opt-In-Bestaetigungs-
//        mail. ERST nach Klick auf den Bestaetigen-Link (andere Route) wird er
//        'aktiv'. DSGVO/BGH: nachweisbare Einwilligung.
//
// Betrieb wird ueber profiles.optin_slug ermittelt; die Seite muss
// ausdruecklich freigeschaltet sein (profiles.optin_aktiv = true).
// Service-Role umgeht RLS -> owner_user_id wird explizit gesetzt.
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

async function betriebAusSlug(db: ReturnType<typeof admin>, slug: string) {
  const { data } = await db
    .from('profiles')
    .select('id, firma_name, firma_akzentfarbe, optin_aktiv, optin_titel, optin_text')
    .eq('optin_slug', slug)
    .maybeSingle();
  if (!data || (data as { optin_aktiv?: boolean }).optin_aktiv !== true) return null;
  const p = data as {
    id: string;
    firma_name: string | null;
    firma_akzentfarbe: string | null;
    optin_titel: string | null;
    optin_text: string | null;
  };
  return {
    ownerId: p.id,
    firma: (p.firma_name || '').trim() || 'Newsletter',
    akzent: p.firma_akzentfarbe,
    titel: (p.optin_titel || '').trim() || 'Newsletter abonnieren',
    text: (p.optin_text || '').trim() || 'Tragen Sie sich ein und bleiben Sie auf dem Laufenden.',
  };
}

export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: 'Kein Anmelde-Link angegeben.' }, { status: 400 });
  try {
    const betrieb = await betriebAusSlug(admin(), slug);
    if (!betrieb) return NextResponse.json({ error: 'Diese Anmeldeseite ist nicht (mehr) verfügbar.' }, { status: 404 });
    return NextResponse.json({ betrieb: betrieb.firma, titel: betrieb.titel, text: betrieb.text, akzent: betrieb.akzent });
  } catch {
    return NextResponse.json({ error: 'Anmeldeseite konnte nicht geladen werden.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const slug = (body?.slug || '').toString().trim().toLowerCase();
    const email = emailNormalisieren(body?.email);
    const name = (body?.name || '').toString().trim() || null;
    if (!slug) return NextResponse.json({ ok: false, error: 'Kein Anmelde-Link.' }, { status: 400 });
    if (!istEmailGueltig(email)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });

    const db = admin();
    const betrieb = await betriebAusSlug(db, slug);
    if (!betrieb) return NextResponse.json({ ok: false, error: 'Diese Anmeldeseite ist nicht (mehr) verfügbar.' }, { status: 404 });

    // Bestehenden Eintrag pruefen (unique owner + lower(email)).
    const { data: vorhanden } = await db
      .from('newsletter_abonnenten')
      .select('id, status')
      .eq('owner_user_id', betrieb.ownerId)
      .eq('email', email)
      .maybeSingle();

    const v = vorhanden as { id: string; status: string } | null;
    if (v && v.status === 'aktiv') {
      // Schon bestaetigt -> keine zweite Mail noetig.
      return NextResponse.json({ ok: true, status: 'bereits' });
    }

    const token = randomUUID();
    if (v) {
      await db
        .from('newsletter_abonnenten')
        .update({ status: 'unbestaetigt', bestaetigt_token: token, bestaetigt_am: null, name: name })
        .eq('id', v.id);
    } else {
      await db.from('newsletter_abonnenten').insert({
        owner_user_id: betrieb.ownerId,
        email,
        name,
        status: 'unbestaetigt',
        quelle: 'opt-in',
        bestaetigt_token: token,
      });
    }

    // Double-Opt-In-Bestaetigungsmail im Branding des Betriebs.
    const brand = await absenderBranding(db, betrieb.ownerId);
    const url = optinBestaetigenUrl(BASIS_URL, token);
    await sendeMail({
      an: email,
      betreff: `Bitte bestätige deine Anmeldung bei ${betrieb.firma}`,
      html: optinBestaetigungHtml(betrieb.firma, url, brand.akzent, name),
      absenderName: betrieb.firma,
      antwortAn: brand.email,
    });

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
