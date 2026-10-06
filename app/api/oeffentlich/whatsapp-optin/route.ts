import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { telefonNormalisieren, istTelefonPlausibel } from '@/lib/whatsapp';
import { baueBestaetigungsCode, anmeldeNachricht, waMeLink, BESTAETIGUNG_GUELTIG_TAGE } from '@/lib/whatsappBestaetigung';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { startSperrGrund } from '@/lib/startSperre';

// ============================================================================
// ARGONAUT OS · app/api/oeffentlich/whatsapp-optin/route.ts  (WhatsApp P2 · Paket 183)
//
// ÖFFENTLICH (kein Login). WhatsApp-Anmeldeformular eines Betriebs.
//   GET  ?slug=..  -> { betrieb, titel, text, akzent } (Branding)
//   POST { slug, telefon, name? } -> legt einen WARTENDEN Kontakt an und gibt
//        einen Bestätigungscode + wa.me-Link zurück.
//
// Paket 183: Das Formular macht NIEMANDEN mehr aktiv. Aktiv wird eine Nummer
// erst, wenn die Person selbst „ANMELDEN <CODE>" per WhatsApp an den Betrieb
// schickt (app/api/whatsapp/webhook). Vorher standen auch fremde Nummern
// sofort als „aktiv" in der Werbeliste. Wir schreiben an die eingetragene
// Nummer NICHTS — das Formular kann niemanden belästigen.
//
// Das Formular ist nur offen, wenn der Betrieb eine WhatsApp-Nummer und den
// Eingang (Telefonnummer-ID + App-Secret) hinterlegt hat — sonst käme die
// Bestätigung nie an.
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
    .select('id, firma_name, firma_akzentfarbe, whatsapp_optin_aktiv, whatsapp_optin_titel, whatsapp_optin_text, whatsapp_absender')
    .eq('whatsapp_optin_slug', slug)
    .maybeSingle();
  if (!data || (data as { whatsapp_optin_aktiv?: boolean }).whatsapp_optin_aktiv !== true) return null;
  const p = data as {
    id: string;
    firma_name: string | null;
    firma_akzentfarbe: string | null;
    whatsapp_optin_titel: string | null;
    whatsapp_optin_text: string | null;
    whatsapp_absender: string | null;
  };
  // Paket 183: Ohne Nummer und ohne eingerichteten Eingang kann niemand
  // bestätigen — dann ist die Seite nicht verfügbar statt halb kaputt.
  const nummer = telefonNormalisieren(p.whatsapp_absender);
  if (!istTelefonPlausibel(nummer)) return null;
  const { data: zug } = await db
    .from('whatsapp_zugang')
    .select('meta_phone_number_id, app_secret_verschluesselt')
    .eq('owner_user_id', p.id)
    .maybeSingle();
  const z = zug as { meta_phone_number_id?: string | null; app_secret_verschluesselt?: string | null } | null;
  if (!z?.meta_phone_number_id || !z?.app_secret_verschluesselt) return null;
  return {
    nummer,
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
  // Paket 216: WhatsApp-Anmeldung zur Werbung bis zur Freigabe aus (lib/startSperre.ts).
  const waGesperrt = startSperrGrund('whatsappWerbung');
  if (waGesperrt) return NextResponse.json({ ok: false, error: waGesperrt }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    const slug = (body?.slug || '').toString().trim().toLowerCase();
    const telefon = telefonNormalisieren((body?.telefon || '').toString());
    const name = (body?.name || '').toString().trim().slice(0, 80) || null;
    if (!slug) return NextResponse.json({ ok: false, error: 'Kein Anmelde-Link.' }, { status: 400 });
    if (!istTelefonPlausibel(telefon)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige Handynummer eingeben (z. B. +49 170 1234567).' }, { status: 400 });

    const db = admin();
    // S1: Mengen-Deckel je Absender und je Nummer + Betrieb (lib/drossel.ts).
    const zuViel = await drossel(db, 'oeffentlich/whatsapp-optin', { ip: drosselIp(req.headers), ziel: `${slug}|${telefon}` });
    if (zuViel) return NextResponse.json({ ok: false, error: drosselText(zuViel) }, { status: 429 });
    const betrieb = await betriebAusSlug(db, slug);
    if (!betrieb) return NextResponse.json({ ok: false, error: 'Diese Anmeldeseite ist nicht (mehr) verfügbar.' }, { status: 404 });

    const { data: vorhanden } = await db
      .from('whatsapp_kontakt')
      .select('id, status, name')
      .eq('owner_user_id', betrieb.ownerId)
      .eq('telefon', telefon)
      .maybeSingle();
    const v = vorhanden as { id: string; status: string; name: string | null } | null;
    if (v && v.status === 'aktiv') return NextResponse.json({ ok: true, status: 'bereits' });

    // Paket 183: Nur ein Code wird hinterlegt — Status und Einwilligung bleiben
    // unberührt, bis die Person selbst per WhatsApp bestätigt. Auch eine früher
    // abgemeldete Nummer bleibt abgemeldet, bis sie sich selbst meldet.
    const code = baueBestaetigungsCode();
    const jetzt = new Date().toISOString();
    if (v) {
      const felder: Record<string, unknown> = { bestaetigungs_code: code, bestaetigung_angefragt_am: jetzt };
      if (name && !(v.name || '').trim()) felder.name = name;
      const { error } = await db.from('whatsapp_kontakt').update(felder).eq('id', v.id).eq('owner_user_id', betrieb.ownerId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from('whatsapp_kontakt').insert({
        owner_user_id: betrieb.ownerId,
        telefon,
        name,
        status: 'unbekannt',
        quelle: 'opt-in',
        abmelde_token: randomUUID(),
        bestaetigungs_code: code,
        bestaetigung_angefragt_am: jetzt,
      });
      if (error) throw new Error(error.message);
    }

    const nachricht = anmeldeNachricht(code);
    return NextResponse.json({
      ok: true,
      status: 'bestaetigen',
      nachricht,
      nummer: betrieb.nummer,
      link: waMeLink(betrieb.nummer, nachricht),
      gueltigTage: BESTAETIGUNG_GUELTIG_TAGE,
    });
  } catch (e: unknown) {
    // S1: interne Fehlertexte nie nach außen.
    console.error('whatsapp-optin POST:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.' }, { status: 500 });
  }
}
