import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { istMarktplatz, MARKTPLAETZE } from '@/lib/marktplatz';

// ============================================================================
// ARGONAUT OS · Marktplatz 6 · app/api/marktplatz/verbindung/route.ts
// Speichert die Marktplatz-Zugänge (Amazon/eBay/Kaufland/OTTO) je Betrieb —
// anschlussfertig, der Bestell-/Bestands-Abgleich ist „in Aufbau".
//   GET    -> { status: {amazon:{verbunden,konto_id}, ...}, encKeyBereit }
//   POST {plattform, konto_id, token} -> Token verschluesselt in marktplatz_zugang
//   DELETE ?plattform=.. -> trennen
// Token NIE an den Client. marktplatz_zugang ist per RLS nur der Service-Role
// zugaenglich. Muster wie ads-verbindung.
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
  const { data } = await admin.from('marktplatz_zugang')
    .select('plattform, konto_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid);
  const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  const status: Record<string, { verbunden: boolean; konto_id: string }> = {};
  for (const m of MARKTPLAETZE) {
    const r = rows.find((x) => x.plattform === m.key);
    status[m.key] = {
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

  const plattform = (body.plattform || '').toString();
  if (!istMarktplatz(plattform)) return NextResponse.json({ ok: false, error: 'Unbekannter Marktplatz.' }, { status: 400 });
  const konto_id = (body.konto_id || '').toString().trim().slice(0, 200);
  const token = (body.token || '').toString().trim();
  if (!konto_id) return NextResponse.json({ ok: false, error: 'Bitte die Konto-Kennung eingeben.' }, { status: 400 });
  if (!token) return NextResponse.json({ ok: false, error: 'Bitte den Token/Schlüssel eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try { token_verschluesselt = verschluessele(token); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.' }, { status: 500 }); }

  const admin = createAdminClient();
  const { error } = await admin.from('marktplatz_zugang').upsert(
    { owner_user_id: uid, plattform, konto_id, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
    { onConflict: 'owner_user_id,plattform' },
  );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const plattform = (new URL(req.url).searchParams.get('plattform') || '').trim();
  if (!istMarktplatz(plattform)) return NextResponse.json({ ok: false, error: 'Unbekannter Marktplatz.' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from('marktplatz_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid).eq('plattform', plattform);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
