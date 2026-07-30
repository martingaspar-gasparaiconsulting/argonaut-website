import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verschluessele, encKeyBereit } from '@/lib/crypto';
import { istVerbindbar, VERBINDBARE_ADS } from '@/lib/ads';

// ============================================================================
// ARGONAUT OS · app/api/marketing/ads-verbindung/route.ts  (Ads P2)
//
// Sichere Ablage der Werbekonto-Zugaenge (Meta/Google/LinkedIn/TikTok) je Betrieb.
//   GET                -> { meta, google, linkedin, tiktok, encKeyBereit }
//   POST {plattform,konto_id,konto_name,token}
//                        -> Token AES-256-GCM verschluesselt in ads_zugang
//                           + verbunden=true; ads_kanal mitgepflegt
//   DELETE ?plattform=.. -> Verbindung trennen (Token entfernen)
//
// Der Token wird NIE an den Client zurueckgegeben. ads_zugang ist per RLS nur
// der Service-Role zugaenglich. Das echte Schalten (P3) liest + entschluesselt
// den Token serverseitig. Muster wie social-verbindung (Social P2).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type ZugangRow = { plattform: string; konto_id: string | null; konto_name: string | null; token_verschluesselt: string | null; verbunden: boolean | null };

function status(row: ZugangRow | undefined) {
  return {
    verbunden: row?.verbunden === true,
    konto_id: row?.konto_id ?? '',
    konto_name: row?.konto_name ?? '',
    hatToken: !!(row?.token_verschluesselt && row.token_verschluesselt.length),
  };
}

export async function GET() {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('ads_zugang')
    .select('plattform, konto_id, konto_name, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .in('plattform', VERBINDBARE_ADS);
  const rows = (data ?? []) as ZugangRow[];

  return NextResponse.json({
    ok: true,
    meta: status(rows.find((r) => r.plattform === 'meta')),
    google: status(rows.find((r) => r.plattform === 'google')),
    linkedin: status(rows.find((r) => r.plattform === 'linkedin')),
    tiktok: status(rows.find((r) => r.plattform === 'tiktok')),
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
  if (!istVerbindbar(plattform)) return NextResponse.json({ ok: false, error: 'Dieser Werbekanal ist für die Direkt-Verbindung nicht vorgesehen.' }, { status: 400 });

  const konto_id = (body.konto_id || '').toString().trim().slice(0, 200);
  const konto_name = (body.konto_name || '').toString().trim().slice(0, 200) || null;
  const token = (body.token || '').toString().trim();
  if (!konto_id) return NextResponse.json({ ok: false, error: 'Bitte die Konto-Kennung (z. B. Werbekonto-ID, Kundennummer oder URN) eingeben.' }, { status: 400 });
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
    .from('ads_zugang')
    .upsert(
      { owner_user_id: uid, plattform, konto_id, konto_name, token_verschluesselt, verbunden: true, geprueft_am: new Date().toISOString() },
      { onConflict: 'owner_user_id,plattform' },
    );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  // Werbekanal mitpflegen: verbunden + aktiv setzen (Upsert).
  await admin
    .from('ads_kanal')
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
  if (!istVerbindbar(plattform)) return NextResponse.json({ ok: false, error: 'Unbekannte Plattform.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from('ads_zugang')
    .update({ token_verschluesselt: null, verbunden: false, geprueft_am: null })
    .eq('owner_user_id', uid)
    .eq('plattform', plattform);
  if (error) return NextResponse.json({ ok: false, error: 'Trennen fehlgeschlagen.' }, { status: 500 });

  // Werbekanal als nicht mehr verbunden markieren (aktiv/vorgemerkt bleibt).
  await admin.from('ads_kanal').update({ verbunden: false }).eq('owner_user_id', uid).eq('plattform', plattform);

  return NextResponse.json({ ok: true });
}
