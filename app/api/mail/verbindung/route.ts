import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { istMailAnbieter, MAIL_ANBIETER } from '@/lib/mailKalender';

// ============================================================================
// ARGONAUT OS · Mail-/Kalender 14 · app/api/mail/verbindung/route.ts
// Speichert die Mail-/Kalender-Zugänge (Outlook/Google/IMAP/CalDAV) je Betrieb —
// anschlussfertig, der eigentliche Sync ist „in Aufbau".
//   GET    -> { status: {microsoft:{verbunden,konto_id}, ...}, encKeyBereit }
//   POST {anbieter, konto_id, token} -> Geheimnis verschlüsselt in mail_zugang
//   DELETE ?anbieter=.. -> trennen
// Geheimnis NIE an den Client. mail_zugang ist per RLS nur der Service-Role
// zugänglich. Muster wie ads-verbindung / marktplatz-verbindung.
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
  const { data } = await admin.from('mail_zugang')
    .select('anbieter, konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid);
  const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  const status: Record<string, { verbunden: boolean; konto_id: string }> = {};
  for (const a of MAIL_ANBIETER) {
    const r = rows.find((x) => x.anbieter === a.key);
    status[a.key] = {
      verbunden: r?.verbunden === true && !!r?.token_verschluesselt,
      konto_id: (r?.konto_id as string) || '',
    };
  }
  return NextResponse.json({ ok: true, status, encKeyBereit: encKeyBereit() });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!encKeyBereit()) {
    return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt. Bitte einmalig setzen, dann erneut speichern.' }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const anbieter = (body.anbieter || '').toString();
  if (!istMailAnbieter(anbieter)) return NextResponse.json({ ok: false, error: 'Unbekannter Anbieter.' }, { status: 400 });
  const konto_id = (body.konto_id || '').toString().trim().slice(0, 300);
  const token = (body.token || '').toString().trim();
  if (!konto_id) return NextResponse.json({ ok: false, error: 'Bitte die Konto-Kennung eingeben.' }, { status: 400 });
  if (!token) return NextResponse.json({ ok: false, error: 'Bitte das Passwort / Secret eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try { token_verschluesselt = verschluessele(token); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' }, { status: 500 }); }

  const admin = createAdminClient();
  const { error } = await admin.from('mail_zugang').upsert(
    { owner_user_id: uid, anbieter, konto_id, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
    { onConflict: 'owner_user_id,anbieter' },
  );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const anbieter = (new URL(req.url).searchParams.get('anbieter') || '').trim();
  if (!istMailAnbieter(anbieter)) return NextResponse.json({ ok: false, error: 'Unbekannter Anbieter.' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from('mail_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid).eq('anbieter', anbieter);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
