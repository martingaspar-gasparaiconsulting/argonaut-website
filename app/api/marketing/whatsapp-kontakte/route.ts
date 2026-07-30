import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { telefonNormalisieren, istTelefonPlausibel } from '@/lib/whatsapp';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-kontakte/route.ts  (WhatsApp P2)
//
// Empfänger-Verwaltung durch den Betrieb selbst.
//   GET            -> { liste }
//   POST {..}      -> manuell hinzufügen (Betrieb verantwortet die Einwilligung)
//   DELETE ?id=..  -> löschen
// Alles hart auf owner_user_id = user.id beschränkt.
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
  const { data: liste } = await admin
    .from('whatsapp_kontakt')
    .select('id, telefon, name, status, quelle, einwilligung_am, created_at')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });

  return NextResponse.json({ ok: true, liste: liste ?? [] });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const telefon = telefonNormalisieren((body.telefon || '').toString());
  const name = (body.name || '').toString().trim() || null;
  if (!istTelefonPlausibel(telefon)) return NextResponse.json({ ok: false, error: 'Bitte eine gültige Handynummer eingeben (z. B. +49 170 1234567).' }, { status: 400 });

  const admin = createAdminClient();
  const { data: vorhanden } = await admin
    .from('whatsapp_kontakt')
    .select('id')
    .eq('owner_user_id', uid)
    .eq('telefon', telefon)
    .maybeSingle();
  if (vorhanden) return NextResponse.json({ ok: false, error: 'Diese Nummer ist bereits in Ihrer Liste.' }, { status: 409 });

  const { error } = await admin.from('whatsapp_kontakt').insert({
    owner_user_id: uid,
    telefon,
    name,
    status: 'aktiv',
    quelle: 'manuell',
    einwilligung_am: new Date().toISOString(),
    einwilligung_text: 'Manuell erfasst — die Einwilligung liegt dem Betrieb vor.',
    abmelde_token: randomUUID(),
  });
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Keine ID.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('whatsapp_kontakt').delete().eq('id', id).eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
