import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { sendeMail, absenderBranding } from '@/lib/mail';
import { emailNormalisieren, istEmailGueltig, optinBestaetigenUrl, optinBestaetigungHtml } from '@/lib/newsletter';
import { protokolliereLpEreignis } from '@/lib/lpEreignis';
import { waehleVariante, inhaltFuerVariante, type Variante } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/lp/route.ts  (LP P1 + Funnel P1 + A-B-Tests)
//
// ÖFFENTLICH (kein Login). Versorgt eine Landingpage /lp/<slug>:
//   GET  ?slug=..  -> Inhalt (je Variante) + Branding + Impressum
//                     (+ Funnel-'aufruf' mit variante; setzt Varianten-Cookie)
//   POST { slug, email, name? } -> Double-Opt-In-Anmeldung (+ Funnel-'anmeldung'
//        mit variante; landingpage_id + variante am Abonnenten fuer die spaetere
//        'bestaetigung'-Zuordnung).
//
// A-B: Ist ab_aktiv, wird der Besucher 50/50 auf A/B verteilt und per Cookie
// (lpv_<lpId>) stabil gehalten. Der Cookie ist Grundlage der Zuordnung im POST.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';
const COOKIE_TAGE = 60 * 60 * 24 * 30;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

/** Liest die gesetzte Variante ('A'|'B') aus dem Cookie lpv_<lpId>. */
function varianteAusCookie(req: Request, lpId: string): Variante | null {
  const roh = req.headers.get('cookie') || '';
  const name = `lpv_${lpId}=`;
  for (const teil of roh.split(';')) {
    const t = teil.trim();
    if (t.startsWith(name)) {
      const w = t.slice(name.length);
      return w === 'A' || w === 'B' ? w : null;
    }
  }
  return null;
}

/** D1-Dedupe: hat dieser Browser im aktuellen Fenster schon einen Aufruf
 *  gezählt? Cookie lpa_<lpId> verhindert, dass Reloads die Aufrufe hochzählen. */
function schonAlsAufrufGezaehlt(req: Request, lpId: string): boolean {
  const roh = req.headers.get('cookie') || '';
  const name = `lpa_${lpId}=`;
  return roh.split(';').some((teil) => teil.trim().startsWith(name));
}

async function lpAusSlug(db: ReturnType<typeof admin>, slug: string) {
  const { data } = await db
    .from('landingpages')
    .select('id, owner_user_id, typ, titel, untertitel, nutzen, cta_text, hero_bild_url, video_url, aktiv, ab_aktiv, titel_b, untertitel_b, nutzen_b, cta_text_b, hero_bild_b_url')
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
    ab_aktiv: boolean | null;
    titel_b: string | null;
    untertitel_b: string | null;
    nutzen_b: string[] | null;
    cta_text_b: string | null;
    hero_bild_b_url: string | null;
  };
}

export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug) return NextResponse.json({ error: 'Kein Landingpage-Link angegeben.' }, { status: 400 });
  try {
    const db = admin();
    const lp = await lpAusSlug(db, slug);
    if (!lp) return NextResponse.json({ error: 'Diese Seite ist nicht (mehr) verfügbar.' }, { status: 404 });

    // A-B: Variante bestimmen (Cookie-stabil, sonst 50/50).
    const variante: Variante | null = lp.ab_aktiv
      ? waehleVariante(varianteAusCookie(req, lp.id), Math.random())
      : null;
    const inhalt = inhaltFuerVariante(lp, variante);

    // Funnel: Seitenaufruf zaehlen — DEDUPE (D1): nur EINMAL je Browser/Fenster,
    // damit Reloads die Aufrufe nicht künstlich hochzählen. Cookie lpa_<id> unten.
    const schonGezaehlt = schonAlsAufrufGezaehlt(req, lp.id);
    if (!schonGezaehlt) {
      await protokolliereLpEreignis(db, lp.owner_user_id, lp.id, 'aufruf', variante);
    }

    const { data: prof } = await db
      .from('profiles')
      .select('firma_name, firma_akzentfarbe, firma_rechtsform, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_geschaeftsfuehrer, firma_ust_id, firma_registergericht, firma_hrb, firma_steuernummer')
      .eq('id', lp.owner_user_id)
      .maybeSingle();
    const p = (prof ?? {}) as Record<string, string | null>;

    const res = NextResponse.json({
      titel: inhalt.titel,
      untertitel: inhalt.untertitel,
      nutzen: inhalt.nutzen,
      cta_text: inhalt.cta_text,
      typ: lp.typ,
      hero_bild_url: inhalt.hero_bild_url,
      video_url: lp.video_url,
      variante,
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

    if (variante) {
      res.cookies.set(`lpv_${lp.id}`, variante, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_TAGE });
    }
    // D1-Dedupe-Fenster für Aufrufe: 24 h (max. 1 gezählter Aufruf je Browser/Tag).
    if (!schonGezaehlt) {
      res.cookies.set(`lpa_${lp.id}`, '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 });
    }
    return res;
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

    // A-B: die Variante, die dieser Besucher gesehen hat (aus dem Cookie).
    const variante: Variante | null = lp.ab_aktiv ? varianteAusCookie(req, lp.id) : null;

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
        .update({ status: 'unbestaetigt', bestaetigt_token: token, bestaetigt_am: null, name, landingpage_id: lp.id, variante })
        .eq('id', v.id);
    } else {
      await db.from('newsletter_abonnenten').insert({
        owner_user_id: lp.owner_user_id,
        email,
        name,
        status: 'unbestaetigt',
        quelle: 'landingpage',
        bestaetigt_token: token,
        landingpage_id: lp.id,
        variante,
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

    // Funnel: Anmeldung (Opt-in gestartet) zaehlen (nicht-blockierend, mit variante).
    await protokolliereLpEreignis(db, lp.owner_user_id, lp.id, 'anmeldung', variante);

    return NextResponse.json({ ok: true, status: 'bestaetigung_gesendet' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
