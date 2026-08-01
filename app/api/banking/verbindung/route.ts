import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';

// ============================================================================
// ARGONAUT OS · Banking 11 · app/api/banking/verbindung/route.ts
// Speichert den Bank-Aggregator-Zugang (finAPI) je Betrieb — anschlussfertig,
// aber der Auto-Abruf ist noch „in Aufbau". Bis dahin läuft der CSV-Abgleich.
//   GET    -> { verbunden, encKeyBereit }
//   POST {client_id, secret} -> Secret verschluesselt in bank_zugang
//   DELETE -> trennen
// Secret NIE an den Client. bank_zugang ist per RLS nur der Service-Role
// zugaenglich. Muster wie ads-/versand-verbindung.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGGREGATOR = 'finapi';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from('bank_zugang')
    .select('konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid).eq('aggregator', AGGREGATOR).maybeSingle();
  return NextResponse.json({
    ok: true,
    verbunden: data?.verbunden === true && !!data?.token_verschluesselt,
    encKeyBereit: encKeyBereit(),
  });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!encKeyBereit()) {
    return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt. Bitte einmalig setzen, dann erneut speichern.' }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const client_id = (body.client_id || '').toString().trim().slice(0, 200);
  const secret = (body.secret || '').toString().trim();
  if (!client_id) return NextResponse.json({ ok: false, error: 'Bitte die finAPI Client-ID eingeben.' }, { status: 400 });
  if (!secret) return NextResponse.json({ ok: false, error: 'Bitte das finAPI Secret eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try { token_verschluesselt = verschluessele(secret); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' }, { status: 500 }); }

  const admin = createAdminClient();
  const { error } = await admin.from('bank_zugang').upsert(
    { owner_user_id: uid, aggregator: AGGREGATOR, konto_id: client_id, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
    { onConflict: 'owner_user_id,aggregator' },
  );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const admin = createAdminClient();
  const { error } = await admin.from('bank_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid).eq('aggregator', AGGREGATOR);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
