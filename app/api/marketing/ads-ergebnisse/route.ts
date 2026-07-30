import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { zuZahl } from '@/lib/adsAnalytics';

// ============================================================================
// ARGONAUT OS · app/api/marketing/ads-ergebnisse/route.ts  (Ads P4)
//
// Ist-Kennzahlen je Kampagne (Ausgaben/Impressionen/Klicks/Conversions/Umsatz).
//   GET               -> { liste }  (ads_ergebnis-Zeilen des Betriebs)
//   POST {kampagne_id, ..} -> Kennzahlen setzen/aktualisieren (Upsert je Kampagne)
//   DELETE ?kampagne_id=.. -> Kennzahlen entfernen
//
// In P4 trägt der Betrieb die Werte selbst ein; sobald die Werbekonten Insights
// liefern (Folgepaket), aktualisiert ARGONAUT sie automatisch. Owner-hart.
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
    .from('ads_ergebnis')
    .select('kampagne_id, ausgaben, impressionen, klicks, conversions, umsatz, aktualisiert_am')
    .eq('owner_user_id', uid);

  return NextResponse.json({ ok: true, liste: liste ?? [] });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const kampagne_id = (body.kampagne_id || '').toString().trim();
  if (!kampagne_id) return NextResponse.json({ ok: false, error: 'Keine Kampagne angegeben.' }, { status: 400 });

  // Kampagne muss dem Betrieb gehoeren.
  const admin = createAdminClient();
  const { data: k } = await admin.from('ads_kampagne').select('id').eq('id', kampagne_id).eq('owner_user_id', uid).maybeSingle();
  if (!k) return NextResponse.json({ ok: false, error: 'Kampagne nicht gefunden.' }, { status: 404 });

  const felder = {
    owner_user_id: uid,
    kampagne_id,
    ausgaben: zuZahl(body.ausgaben),
    impressionen: Math.round(zuZahl(body.impressionen)),
    klicks: Math.round(zuZahl(body.klicks)),
    conversions: Math.round(zuZahl(body.conversions)),
    umsatz: zuZahl(body.umsatz),
    aktualisiert_am: new Date().toISOString(),
  };

  const { error } = await admin
    .from('ads_ergebnis')
    .upsert(felder, { onConflict: 'owner_user_id,kampagne_id' });
  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const kampagneId = (new URL(req.url).searchParams.get('kampagne_id') || '').trim();
  if (!kampagneId) return NextResponse.json({ ok: false, error: 'Keine Kampagne.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('ads_ergebnis').delete().eq('owner_user_id', uid).eq('kampagne_id', kampagneId);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
