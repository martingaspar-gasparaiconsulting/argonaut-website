// ============================================================================
// ARGONAUT OS · app/api/marketing/whatsapp-eingang  (G2 · Push 2)
//
// Die Einrichtung des Eingangs — das Gegenstück zu whatsapp-verbindung, die
// den AUSgang regelt.
//
//   GET  → { webhook_token, hatAppSecret }
//   POST → Prüf-Token erzeugen und/oder App-Secret speichern
//
// Das App-Secret wird wie der Zugangs-Token verschlüsselt abgelegt (AES-256-GCM)
// und NIE zurückgegeben. Der Prüf-Token dagegen schon: der Betrieb muss ihn im
// Meta-Formular abtippen.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { baueWebhookToken } from '@/lib/whatsappEingang';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('whatsapp_zugang')
    .select('webhook_token, app_secret_verschluesselt')
    .eq('owner_user_id', uid)
    .maybeSingle();
  const z = (data ?? {}) as { webhook_token?: string | null; app_secret_verschluesselt?: string | null };

  return NextResponse.json({
    ok: true,
    webhook_token: z.webhook_token ?? '',
    hatAppSecret: !!(z.app_secret_verschluesselt && z.app_secret_verschluesselt.length),
    encKeyBereit: encKeyBereit(),
  });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const neuerToken = body?.neuerToken === true;
  const appSecret = (body?.app_secret || '').toString().trim();

  if (!neuerToken && !appSecret) {
    return NextResponse.json({ ok: false, error: 'Nichts zu speichern.' }, { status: 400 });
  }
  if (appSecret && !encKeyBereit()) {
    return NextResponse.json(
      { ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt in den Umgebungsvariablen. Bitte einmalig setzen, dann erneut speichern.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const felder: Record<string, string> = {};

  if (neuerToken) {
    // Bei einem neuen Token wird der alte ungültig — Meta muss dann erneut
    // bestätigt werden. Das ist Absicht: ein durchgesickerter Token soll sich
    // mit einem Klick austauschen lassen.
    felder.webhook_token = baueWebhookToken();
  }
  if (appSecret) {
    try {
      felder.app_secret_verschluesselt = verschluessele(appSecret);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' },
        { status: 500 },
      );
    }
  }

  const { data: vorhanden } = await admin
    .from('whatsapp_zugang')
    .select('owner_user_id')
    .eq('owner_user_id', uid)
    .maybeSingle();

  let error;
  if (vorhanden) {
    ({ error } = await admin.from('whatsapp_zugang').update(felder).eq('owner_user_id', uid));
  } else {
    ({ error } = await admin.from('whatsapp_zugang').insert({ owner_user_id: uid, ...felder }));
  }
  if (error) {
    console.error('whatsapp-eingang speichern:', error.message);
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  const { data: neu } = await admin
    .from('whatsapp_zugang')
    .select('webhook_token, app_secret_verschluesselt')
    .eq('owner_user_id', uid)
    .maybeSingle();
  const z = (neu ?? {}) as { webhook_token?: string | null; app_secret_verschluesselt?: string | null };

  return NextResponse.json({
    ok: true,
    webhook_token: z.webhook_token ?? '',
    hatAppSecret: !!(z.app_secret_verschluesselt && z.app_secret_verschluesselt.length),
  });
}
