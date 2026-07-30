import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { istMetaPlattform } from '@/lib/social';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-verbindung/route.ts  (Social P2)
//
// Sichere Ablage der Meta-Zugaenge (Facebook-Seite + Instagram) je Betrieb.
//   GET               -> { facebook, instagram, encKeyBereit }
//   POST {plattform,ziel_id,konto_name,token} -> Token AES-256-GCM verschluesselt
//                        in social_zugang + verbunden=true; social_kanal mitgepflegt
//   DELETE ?plattform=.. -> Verbindung trennen (Token entfernen)
//
// Der Token wird NIE an den Client zurueckgegeben. social_zugang ist per RLS
// nur der Service-Role zugaenglich. Das echte Posten (P3) liest + entschluesselt
// den Token serverseitig. Nur Meta-Kanaele ('facebook'|'instagram') erlaubt.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type ZugangRow = { plattform: string; ziel_id: string | null; konto_name: string | null; token_verschluesselt: string | null; verbunden: boolean | null };

function status(row: ZugangRow | undefined) {
  return {
    verbunden: row?.verbunden === true,
    ziel_id: row?.ziel_id ?? '',
    konto_name: row?.konto_name ?? '',
    hatToken: !!(row?.token_verschluesselt && row.token_verschluesselt.length),
  };
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('social_zugang')
    .select('plattform, ziel_id, konto_name, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .in('plattform', ['facebook', 'instagram']);
  const rows = (data ?? []) as ZugangRow[];

  return NextResponse.json({
    ok: true,
    facebook: status(rows.find((r) => r.plattform === 'facebook')),
    instagram: status(rows.find((r) => r.plattform === 'instagram')),
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

  const plattform = (body.plattform || '').toString();
  if (!istMetaPlattform(plattform)) return NextResponse.json({ ok: false, error: 'Diese Verbindung gilt nur für Facebook und Instagram.' }, { status: 400 });

  const ziel_id = (body.ziel_id || '').toString().trim().slice(0, 120);
  const konto_name = (body.konto_name || '').toString().trim().slice(0, 200) || null;
  const token = (body.token || '').toString().trim();
  if (!ziel_id) return NextResponse.json({ ok: false, error: plattform === 'facebook' ? 'Bitte die Seiten-ID eingeben.' : 'Bitte die Instagram-Konto-ID eingeben.' }, { status: 400 });
  if (!token) return NextResponse.json({ ok: false, error: 'Bitte den Zugangs-Token eingeben.' }, { status: 400 });

  let token_verschluesselt: string;
  try {
    token_verschluesselt = verschluessele(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Verschlüsselung fehlgeschlagen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('social_zugang')
    .upsert(
      { owner_user_id: uid, plattform, ziel_id, konto_name, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
      { onConflict: 'owner_user_id,plattform' },
    );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  // Kanal mitpflegen: verbunden + aktiv setzen (Upsert).
  await admin
    .from('social_kanal')
    .upsert(
      { owner_user_id: uid, plattform, aktiv: true, verbunden: true },
      { onConflict: 'owner_user_id,plattform' },
    );

  return NextResponse.json({ ok: true, verbunden: true });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const plattform = (new URL(req.url).searchParams.get('plattform') || '').trim();
  if (!istMetaPlattform(plattform)) return NextResponse.json({ ok: false, error: 'Unbekannte Plattform.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('social_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid)
    .eq('plattform', plattform);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });

  // Kanal als nicht mehr verbunden markieren (aktiv/vorgemerkt bleibt).
  await admin.from('social_kanal').update({ verbunden: false }).eq('owner_user_id', uid).eq('plattform', plattform);

  return NextResponse.json({ ok: true });
}
