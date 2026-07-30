import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail, absenderBranding } from '@/lib/mail';
import { emailNormalisieren, istEmailGueltig, optinBestaetigenUrl, optinBestaetigungHtml } from '@/lib/newsletter';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/lp/route.ts  (LP Paket 1)
//
// ÖFFENTLICH (kein Login). Versorgt eine Landingpage /lp/<slug>:
//   GET  ?slug=..  -> Inhalt + Branding + Impressumsdaten des Betriebs
//   POST { slug, email, name? } -> Double-Opt-In-Anmeldung (wie /anmelden):
//        Abonnent status='unbestaetigt' + Bestaetigungsmail. Nach Klick auf den
//        Bestaetigen-Link (optin-bestaetigen) wird er aktiv und tritt ggf. in
//        die konto-weite Willkommens-Sequenz ein (profiles.optin_sequenz_id).
//
// Betrieb wird ueber landingpages.slug ermittelt; die Seite muss aktiv sein.
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

async function lpAusSlug(db: ReturnType<typeof admin>, slug: string) {
  const { data } = await db
    .from('landingpages')
    .select('id, owner_user_id, typ, titel, untertitel, nutzen, cta_text, hero_bild_url, video_url, aktiv')
    .eq('slug', slug)
    .maybeSingle();
  if (!data || (data as { aktiv?: boolean }).aktiv !== true) return null;
  return data as {
    id: string;
    owner_user_id: string;
    typ: string;
    titel: string;
    untertitel: string | null;
    nutzen: string[] | null;
    cta_text: string | null;
    hero_bild_url: string | null;
    video_url: string | null;
  };
}

export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: 'Kein Landingpage-Link angegeben.' }, { status: 400 });
  try {
    const db = admin();
    const lp = await lpAusSlug(db, slug);
    if (!lp) return NextResponse.json({ error: 'Diese Seite ist nicht (mehr) verfügbar.' }, { status: 404 });

    const { data: prof } = await db
      .from('profiles')
      .select('firma_name, firma_akzentfarbe, firma_rechtsform, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_geschaeftsfuehrer, firma_ust_id, firma_registergericht, firma_hrb, firma_steuernummer')
      .eq('id', lp.owner_user_id)
      .maybeSingle();
    const p = (prof ?? {}) as Record<string, string | null>;

    return NextResponse.json({
      titel: lp.titel,
      untertitel: lp.untertitel,
      nutzen: Array.isArray(lp.nutzen) ? lp.nutzen : [],
      cta_text: lp.cta_text,
      typ: lp.typ,
      hero_bild_url: lp.hero_bild_url,
      video_url: lp.video_url,
      betrieb: (p.firma_name || '').trim() || 'Angebot',
      akzent: p.firma_akzentfarbe,
      impressum: {
        firma_name: p.firma_name || '',
        rechtsform: p.firma_rechtsform || '',
        strasse: p.firma_strasse || '',
        plz: p.firma_plz || '',
        ort: p.firma_ort || '',
        telefon: p.firma_telefon || '',
        email: p.firma_email || '',
        website: p.firma_website || '',
        geschaeftsfuehrer: p.firma_geschaeftsfuehrer || '',
        ust_id: p.firma_ust_id || '',
        registergericht: p.firma_registergericht || '',
        hrb: p.firma_hrb || '',
        steuernummer: p.firma_steuernummer || '',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Seite konnte nicht geladen werden.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const slug = (body?.slug || '').toString().trim().toLowerCase();
    const email = emailNormalisieren(body?.email);
    const name = (body?.name || '').toString().trim() || null;
    if (!slug) return NextResponse.json({ ok: false, error: 'Kein Landingpage-Link.' }, { status: 400 });
    if (!istEmailGueltig(email)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' }, { status: 400 });

    const db = admin();
    const lp = await lpAusSlug(db, slug);
    if (!lp) return NextResponse.json({ ok: false, error: 'Diese Seite ist nicht (mehr) verfügbar.' }, { status: 404 });

    const { data: vorhanden } = await db
      .from('newsletter_abonnenten')
      .select('id, status')
      .eq('owner_user_id', lp.owner_user_id)
      .eq('email', email)
      .maybeSingle();
    const v = vorhanden as { id: string; status: string } | null;
    if (v && v.status === 'aktiv') return NextResponse.json({ ok: true, status: 'bereits' });

    const token = randomUUID();
    if (v) {
      await db
        .from('newsletter_abonnenten')
        .update({ status: 'unbestaetigt', bestaetigt_token: token, bestaetigt_am: null, name })
        .eq('id', v.id);
    } else {
      await db.from('newsletter_abonnenten').insert({
        owner_user_id: lp.owner_user_id,
        email,
        name,
        status: 'unbestaetigt',
        quelle: 'landingpage',
        bestaetigt_token: token,
      });
    }

    const brand = await absenderBranding(db, lp.owner_user_id);
    const url = optinBestaetigenUrl(BASIS_URL, token);
    await sendeMail({
      an: email,
      betreff: `Bitte bestätige deine Anmeldung bei ${brand.firma}`,
      html: optinBestaetigungHtml(brand.firma, url, brand.akzent, name),
      absenderName: brand.firma,
      antwortAn: brand.email,
    });

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
