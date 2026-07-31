import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { AGGREGATOR } from '@/lib/versandBuchung';

// ============================================================================
// ARGONAUT OS · Versand 4b · app/api/versand/verbindung/route.ts
// Sichere Ablage des Versand-Aggregator-Zugangs (shipcloud) je Betrieb.
//   GET    -> { verbunden, konto_name, encKeyBereit }
//   POST {api_key, konto_name} -> API-Key AES-256-GCM verschluesselt in
//            versand_zugang, verbunden=true
//   DELETE -> Verbindung trennen (Key entfernen)
// Der Key wird NIE an den Client zurueckgegeben. versand_zugang ist per RLS nur
// der Service-Role zugaenglich; das Buchen (api/versand/buchen) liest + ent-
// schluesselt serverseitig. Muster wie ads-verbindung.
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
  const { data } = await admin
    .from('versand_zugang')
    .select('konto_name, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .eq('aggregator', AGGREGATOR.key)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    aggregator: AGGREGATOR.name,
    verbunden: data?.verbunden === true && !!data?.token_verschluesselt,
    konto_name: data?.konto_name ?? '',
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

  const api_key = (body.api_key || '').toString().trim();
  const konto_name = (body.konto_name || '').toString().trim().slice(0, 200) || null;
  if (!api_key) return NextResponse.json({ ok: false, error: 'Bitte den shipcloud-API-Key eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try {
    token_verschluesselt = verschluessele(api_key);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' }, { status: 500 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('versand_zugang')
    .upsert(
      { owner_user_id: uid, aggregator: AGGREGATOR.key, konto_name, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
      { onConflict: 'owner_user_id,aggregator' },
    );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('versand_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid)
    .eq('aggregator', AGGREGATOR.key);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
