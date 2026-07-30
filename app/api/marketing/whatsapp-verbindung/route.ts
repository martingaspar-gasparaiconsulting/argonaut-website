import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { anbieterFuer } from '@/lib/whatsapp';

// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-verbindung/route.ts  (WhatsApp P3a)
//
// Sichere Ablage der WhatsApp-Zugangsdaten je Betrieb (Meta Cloud API / 360dialog).
//   GET    -> { verbunden, anbieter, meta_phone_number_id, hatToken, geprueft_am, encKeyBereit }
//   POST   -> Zugangsdaten speichern (Token AES-256-GCM verschlüsselt) + verbunden=true
//   DELETE -> Verbindung trennen (Token entfernen)
//
// Der Token wird NIE an den Client zurückgegeben. Die Tabelle whatsapp_zugang
// ist per RLS nur der Service-Role zugänglich. Der eigentliche Versand (P3b)
// liest den Token serverseitig und entschlüsselt ihn dort.
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
  const { data: prof } = await admin.from('profiles').select('whatsapp_anbieter').eq('id', uid).maybeSingle();
  const { data: zug } = await admin
    .from('whatsapp_zugang')
    .select('meta_phone_number_id, token_verschluesselt, verbunden, geprueft_am')
    .eq('owner_user_id', uid)
    .maybeSingle();
  const z = (zug ?? {}) as { meta_phone_number_id?: string | null; token_verschluesselt?: string | null; verbunden?: boolean | null; geprueft_am?: string | null };

  return NextResponse.json({
    ok: true,
    anbieter: (prof as { whatsapp_anbieter?: string | null } | null)?.whatsapp_anbieter ?? null,
    verbunden: z.verbunden === true,
    meta_phone_number_id: z.meta_phone_number_id ?? '',
    hatToken: !!(z.token_verschluesselt && z.token_verschluesselt.length),
    geprueft_am: z.geprueft_am ?? null,
    encKeyBereit: encKeyBereit(),
  });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  if (!encKeyBereit()) {
    return NextResponse.json(
      { ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt in den Umgebungsvariablen. Bitte einmalig setzen, dann erneut speichern.' },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: prof } = await admin.from('profiles').select('whatsapp_anbieter').eq('id', uid).maybeSingle();
  const anbieter = anbieterFuer((prof as { whatsapp_anbieter?: string | null } | null)?.whatsapp_anbieter);
  if (!anbieter) return NextResponse.json({ ok: false, error: 'Bitte zuerst oben einen Anbieter wählen und speichern.' }, { status: 400 });

  const token = (body.token || '').toString().trim();
  const metaPhoneId = (body.meta_phone_number_id || '').toString().trim();
  if (!token) return NextResponse.json({ ok: false, error: anbieter.id === 'meta' ? 'Bitte den Zugangs-Token eingeben.' : 'Bitte den API-Schlüssel eingeben.' }, { status: 400 });
  if (anbieter.id === 'meta' && !metaPhoneId) return NextResponse.json({ ok: false, error: 'Bitte die Telefonnummer-ID (phone number id) eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try {
    token_verschluesselt = verschluessele(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const felder = {
    meta_phone_number_id: anbieter.id === 'meta' ? metaPhoneId : null,
    token_verschluesselt,
    verbunden: true,
    geprueft_am: new Date().toISOString(),
  };

  const { data: vorhanden } = await admin.from('whatsapp_zugang').select('owner_user_id').eq('owner_user_id', uid).maybeSingle();
  let error;
  if (vorhanden) {
    ({ error } = await admin.from('whatsapp_zugang').update(felder).eq('owner_user_id', uid));
  } else {
    ({ error } = await admin.from('whatsapp_zugang').insert({ owner_user_id: uid, ...felder }));
  }
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('whatsapp_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
