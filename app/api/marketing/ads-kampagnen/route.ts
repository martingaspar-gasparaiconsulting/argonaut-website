import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { bereinigeKanaele, validiereKampagne, zuBetrag, ADS_ZIEL_IDS } from '@/lib/ads';
import { sichereMedienUrl } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/marketing/ads-kampagnen/route.ts  (Ads P1)
//
// Werbe-Kampagnen eines Betriebs anlegen/aendern/loeschen (Entwurf oder bereit).
//   GET            -> { liste }
//   POST {..}      -> anlegen/aktualisieren (status 'entwurf' | 'bereit')
//   DELETE ?id=..  -> loeschen
//
// Das echte Schalten (status 'aktiv'/'pausiert'/'beendet') + die Budget-Steuerung
// je Werbeplattform folgen in den Folgepaketen (P2+), sobald der Werbekonto-Zugang
// beim Betrieb hinterlegt ist. Alles hart auf owner_user_id = user.id (Admin-Client).
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
    .from('ads_kampagne')
    .select('id, name, ziel, kanaele, tagesbudget, start_datum, end_datum, zielgruppe, ueberschrift, text, medien_urls, status, created_at')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });

  return NextResponse.json({ ok: true, liste: liste ?? [] });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const id = (body.id || '').toString().trim() || null;
  const name = (body.name || '').toString().slice(0, 200).trim();
  const kanaele = bereinigeKanaele(body.kanaele);
  const ziel = ADS_ZIEL_IDS.includes((body.ziel || '').toString()) ? body.ziel.toString() : null;
  const tagesbudget = zuBetrag(body.tagesbudget);
  const start_datum = (body.start_datum || '').toString().trim() || null;
  const end_datum = (body.end_datum || '').toString().trim() || null;
  const zielgruppe = (body.zielgruppe || '').toString().slice(0, 2000);
  const ueberschrift = (body.ueberschrift || '').toString().slice(0, 300);
  const text = (body.text || '').toString().slice(0, 8000);

  // Medien-URLs saeubern: nur echte http(s)-Links, max 10.
  const medienRoh = Array.isArray(body.medien_urls) ? body.medien_urls : [];
  const medien_urls = medienRoh
    .map((u: unknown) => sichereMedienUrl(typeof u === 'string' ? u : ''))
    .filter((u: string) => !!u)
    .slice(0, 10);

  const status = body.status === 'bereit' ? 'bereit' : 'entwurf';

  // Fachliche Pruefung (gleiche Logik wie im Editor).
  const pruef = validiereKampagne({ name, ziel, kanaele, tagesBudget: tagesbudget, startDatum: start_datum, endDatum: end_datum });
  if (!pruef.ok) return NextResponse.json({ ok: false, error: pruef.fehler.join(' ') }, { status: 400 });

  const admin = createAdminClient();
  const felder = {
    name, ziel, kanaele, tagesbudget,
    start_datum, end_datum, zielgruppe, ueberschrift, text, medien_urls, status,
  };

  let error;
  let neuId = id;
  if (id) {
    ({ error } = await admin.from('ads_kampagne').update(felder).eq('id', id).eq('owner_user_id', uid));
  } else {
    const { data, error: insErr } = await admin
      .from('ads_kampagne')
      .insert({ ...felder, owner_user_id: uid })
      .select('id')
      .single();
    error = insErr;
    neuId = (data as { id: string } | null)?.id ?? null;
  }

  if (error) return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, id: neuId });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Keine ID.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('ads_kampagne').delete().eq('id', id).eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
