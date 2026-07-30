import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { telefonNormalisieren, istTelefonPlausibel, einwilligungsText } from '@/lib/whatsapp';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/whatsapp-optin/route.ts  (WhatsApp P2)
//
// ÖFFENTLICH (kein Login). WhatsApp-Anmeldeformular eines Betriebs.
//   GET  ?slug=..  -> { betrieb, titel, text, akzent } (Branding)
//   POST { slug, telefon, name? } -> legt den Empfänger mit dokumentierter
//        Einwilligung an (status='aktiv', einwilligung_am + einwilligung_text).
//        Da noch kein WhatsApp-Versand aktiv ist (Paket 3), erfolgt die
//        Einwilligung als dokumentiertes Web-Opt-in; eine WhatsApp-Bestätigung
//        kann in Paket 3 ergänzt werden.
//
// Betrieb über profiles.whatsapp_optin_slug; muss whatsapp_optin_aktiv=true sein.
// Service-Role umgeht RLS -> owner_user_id explizit.
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

async function betriebAusSlug(db: ReturnType<typeof admin>, slug: string) {
  const { data } = await db
    .from('profiles')
    .select('id, firma_name, firma_akzentfarbe, whatsapp_optin_aktiv, whatsapp_optin_titel, whatsapp_optin_text')
    .eq('whatsapp_optin_slug', slug)
    .maybeSingle();
  if (!data || (data as { whatsapp_optin_aktiv?: boolean }).whatsapp_optin_aktiv !== true) return null;
  const p = data as {
    id: string;
    firma_name: string | null;
    firma_akzentfarbe: string | null;
    whatsapp_optin_titel: string | null;
    whatsapp_optin_text: string | null;
  };
  return {
    ownerId: p.id,
    firma: (p.firma_name || '').trim() || 'Unternehmen',
    akzent: p.firma_akzentfarbe,
    titel: (p.whatsapp_optin_titel || '').trim() || 'WhatsApp-Neuigkeiten erhalten',
    text: (p.whatsapp_optin_text || '').trim() || 'Tragen Sie sich ein und erhalten Sie Angebote und Neuigkeiten direkt per WhatsApp.',
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
    const telefon = telefonNormalisieren((body?.telefon || '').toString());
    const name = (body?.name || '').toString().trim() || null;
    if (!slug) return NextResponse.json({ ok: false, error: 'Kein Anmelde-Link.' }, { status: 400 });
    if (!istTelefonPlausibel(telefon)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige Handynummer eingeben (z. B. +49 170 1234567).' }, { status: 400 });

    const db = admin();
    const betrieb = await betriebAusSlug(db, slug);
    if (!betrieb) return NextResponse.json({ ok: false, error: 'Diese Anmeldeseite ist nicht (mehr) verfügbar.' }, { status: 404 });

    const consentText = einwilligungsText(betrieb.firma);

    const { data: vorhanden } = await db
      .from('whatsapp_kontakt')
      .select('id, status')
      .eq('owner_user_id', betrieb.ownerId)
      .eq('telefon', telefon)
      .maybeSingle();
    const v = vorhanden as { id: string; status: string } | null;
    if (v && v.status === 'aktiv') return NextResponse.json({ ok: true, status: 'bereits' });

    const jetzt = new Date().toISOString();
    if (v) {
      await db
        .from('whatsapp_kontakt')
        .update({ status: 'aktiv', name, einwilligung_am: jetzt, einwilligung_text: consentText, quelle: 'opt-in' })
        .eq('id', v.id);
    } else {
      await db.from('whatsapp_kontakt').insert({
        owner_user_id: betrieb.ownerId,
        telefon,
        name,
        status: 'aktiv',
        quelle: 'opt-in',
        einwilligung_am: jetzt,
        einwilligung_text: consentText,
        abmelde_token: randomUUID(),
      });
    }

    return NextResponse.json({ ok: true, status: 'angemeldet' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
