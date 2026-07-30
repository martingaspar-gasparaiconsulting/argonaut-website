import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { anbieterFuer, telefonNormalisieren, istTelefonPlausibel } from '@/lib/whatsapp';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-einstellungen/route.ts  (WhatsApp P1)
//
// Anbieter-Wahl + Absender-Nummer des Betriebs.
//   GET   -> { anbieter, absender, aktiv }
//   POST  -> speichert anbieter ('meta'|'dialog360') + absender (Nummer)
//
// Die eigentlichen Zugangsdaten (Token etc.) + der Versand kommen in Paket 2
// (sichere Ablage). Hier nur die nicht-geheime Grundeinstellung.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('whatsapp_anbieter, whatsapp_absender, whatsapp_aktiv')
    .eq('id', uid)
    .maybeSingle();
  const p = (prof ?? {}) as { whatsapp_anbieter?: string | null; whatsapp_absender?: string | null; whatsapp_aktiv?: boolean | null };

  return NextResponse.json({
    ok: true,
    anbieter: p.whatsapp_anbieter ?? null,
    absender: p.whatsapp_absender ?? '',
    aktiv: p.whatsapp_aktiv === true,
  });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const anbieterRoh = (body.anbieter || '').toString();
  const anbieter = anbieterFuer(anbieterRoh)?.id ?? null;
  if (anbieterRoh && !anbieter) return NextResponse.json({ ok: false, error: 'Unbekannter Anbieter.' }, { status: 400 });

  const absenderRoh = (body.absender || '').toString().trim();
  const absender = absenderRoh ? telefonNormalisieren(absenderRoh) : '';
  if (absender && !istTelefonPlausibel(absender)) {
    return NextResponse.json({ ok: false, error: 'Bitte eine gültige Telefonnummer eingeben (z. B. +49 170 1234567).' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ whatsapp_anbieter: anbieter, whatsapp_absender: absender || null })
    .eq('id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
