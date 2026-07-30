import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { SOCIAL_PLATTFORM_IDS } from '@/lib/social';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-kanaele/route.ts  (Social P1)
//
// Kanal-Verwaltung: welche Plattformen der Betrieb nutzen moechte (vormerken).
//   GET            -> { liste }  (social_kanal-Zeilen des Betriebs)
//   POST {..}      -> Plattform aktiv/inaktiv setzen (Upsert je Plattform)
//
// Das echte Verbinden (OAuth-Token) je Plattform kommt in den Folgepaketen (P2+).
// 'verbunden' bleibt hier false, bis der Zugang hinterlegt ist. Owner-hart.
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
  const { data: liste } = await admin
    .from('social_kanal')
    .select('plattform, aktiv, verbunden, konto_name, geprueft_am')
    .eq('owner_user_id', uid);

  return NextResponse.json({ ok: true, liste: liste ?? [] });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const plattform = (body.plattform || '').toString();
  if (!SOCIAL_PLATTFORM_IDS.includes(plattform)) {
    return NextResponse.json({ ok: false, error: 'Unbekannte Plattform.' }, { status: 400 });
  }
  const aktiv = body.aktiv === true;

  const admin = createAdminClient();
  const { error } = await admin
    .from('social_kanal')
    .upsert(
      { owner_user_id: uid, plattform, aktiv },
      { onConflict: 'owner_user_id,plattform' },
    );
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
