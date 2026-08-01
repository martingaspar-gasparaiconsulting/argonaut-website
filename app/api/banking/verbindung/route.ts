import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';

// ============================================================================
// ARGONAUT OS · Banking 11 · app/api/banking/verbindung/route.ts
// MEHRBANK-fähig: beliebig viele Bank-Zugänge (finAPI) je Betrieb — jeder mit
// eigenem Namen. Anschlussfertig, Auto-Abruf noch „in Aufbau". CSV-Abgleich
// läuft parallel. Secret verschluesselt (AES-256-GCM), nie an den Client.
// bank_zugang ist per RLS nur der Service-Role zugaenglich.
//   GET    -> { verbindungen: [{id, bank_name, verbunden}], encKeyBereit }
//   POST {bank_name, client_id, secret} -> neuen Zugang anlegen
//   DELETE ?id=.. -> diesen Zugang entfernen (owner-hart)
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
    .select('id, bank_name, verbunden, token_verschluesselt')
    .eq('owner_user_id', uid).eq('aggregator', AGGREGATOR)
    .order('bank_name', { ascending: true });
  const verbindungen = ((data as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
    id: String(r.id),
    bank_name: (r.bank_name as string) || 'Bank',
    verbunden: r.verbunden === true && !!r.token_verschluesselt,
  }));
  return NextResponse.json({ ok: true, verbindungen, encKeyBereit: encKeyBereit() });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  if (!encKeyBereit()) {
    return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt. Bitte einmalig setzen, dann erneut speichern.' }, { status: 400 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const bank_name = (body.bank_name || '').toString().trim().slice(0, 120) || 'Bank';
  const client_id = (body.client_id || '').toString().trim().slice(0, 200);
  const secret = (body.secret || '').toString().trim();
  if (!client_id) return NextResponse.json({ ok: false, error: 'Bitte die finAPI Client-ID eingeben.' }, { status: 400 });
  if (!secret) return NextResponse.json({ ok: false, error: 'Bitte das finAPI Secret eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try { token_verschluesselt = verschluessele(secret); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' }, { status: 500 }); }

  const admin = createAdminClient();
  const { error } = await admin.from('bank_zugang').insert({
    owner_user_id: uid, aggregator: AGGREGATOR, bank_name, konto_id: client_id,
    token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Kein Zugang angegeben.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('bank_zugang')
    .delete().eq('id', id).eq('owner_user_id', uid).eq('aggregator', AGGREGATOR);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
