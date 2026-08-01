import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';

// ============================================================================
// ARGONAUT OS · ELSTER 12 · app/api/elster/verbindung/route.ts
// Speichert den ELSTER-Zugang (Steuernummer + Zertifikat-Passwort) je Betrieb —
// anschlussfertig, die direkte Übermittlung (ERiC) ist noch „in Aufbau".
//   GET    -> { verbunden, steuernummer, encKeyBereit }
//   POST {steuernummer, zertifikat_pw} -> Passwort verschluesselt in elster_zugang
//   DELETE -> trennen
// Passwort NIE an den Client. elster_zugang ist per RLS nur der Service-Role
// zugaenglich. Muster wie banking-/ads-verbindung.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGGREGATOR = 'elster';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const admin = createAdminClient();
  const { data } = await admin.from('elster_zugang')
    .select('konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid).eq('aggregator', AGGREGATOR).maybeSingle();
  return NextResponse.json({
    ok: true,
    verbunden: data?.verbunden === true && !!data?.token_verschluesselt,
    steuernummer: (data?.konto_id as string) || '',
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

  const steuernummer = (body.steuernummer || '').toString().trim().slice(0, 60);
  const zertifikat_pw = (body.zertifikat_pw || '').toString().trim();
  if (!steuernummer) return NextResponse.json({ ok: false, error: 'Bitte die Steuernummer eingeben.' }, { status: 400 });
  if (!zertifikat_pw) return NextResponse.json({ ok: false, error: 'Bitte das Zertifikat-Passwort eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try { token_verschluesselt = verschluessele(zertifikat_pw); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' }, { status: 500 }); }

  const admin = createAdminClient();
  const { error } = await admin.from('elster_zugang').upsert(
    { owner_user_id: uid, aggregator: AGGREGATOR, konto_id: steuernummer, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
    { onConflict: 'owner_user_id,aggregator' },
  );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const admin = createAdminClient();
  const { error } = await admin.from('elster_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid).eq('aggregator', AGGREGATOR);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
