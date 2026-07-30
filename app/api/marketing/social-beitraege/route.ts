import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { bereinigeKanaele, validiereBeitrag, validierePlanung } from '@/lib/social';
import { sichereMedienUrl } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-beitraege/route.ts  (Social P1)
//
// Beitraege eines Betriebs anlegen/aendern/loeschen (Entwurf oder eingeplant).
//   GET            -> { liste }
//   POST {..}      -> anlegen/aktualisieren (status 'entwurf' | 'geplant')
//   DELETE ?id=..  -> loeschen
//
// Das echte Veroeffentlichen (status 'gesendet') setzt spaeter der Posting-Job
// je Plattform (P2+), sobald der Zugang (OAuth) beim Betrieb hinterlegt ist.
// Alles hart auf owner_user_id = user.id beschraenkt (Service-Role-Client).
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
    .from('social_beitrag')
    .select('id, text, medien_urls, kanaele, status, geplant_am, created_at')
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
  const text = (body.text || '').toString().slice(0, 8000);
  const kanaele = bereinigeKanaele(body.kanaele);

  // Medien-URLs saeubern: nur echte http(s)-Links, max 10.
  const medienRoh = Array.isArray(body.medien_urls) ? body.medien_urls : [];
  const medien_urls = medienRoh
    .map((u: unknown) => sichereMedienUrl(typeof u === 'string' ? u : ''))
    .filter((u: string) => !!u)
    .slice(0, 10);

  const status = body.status === 'geplant' ? 'geplant' : 'entwurf';
  const geplant_am = status === 'geplant' && body.geplant_am ? new Date(body.geplant_am).toISOString() : null;

  // Fachliche Pruefung (gleiche Logik wie im Editor).
  const pruef = validiereBeitrag({ text, medienAnzahl: medien_urls.length, kanaele });
  if (!pruef.ok) return NextResponse.json({ ok: false, error: pruef.fehler.join(' ') }, { status: 400 });

  const plan = validierePlanung(status, geplant_am, new Date().toISOString());
  if (!plan.ok) return NextResponse.json({ ok: false, error: plan.fehler }, { status: 400 });

  const admin = createAdminClient();
  const felder = { text, medien_urls, kanaele, status, geplant_am };

  let error;
  let neuId = id;
  if (id) {
    ({ error } = await admin.from('social_beitrag').update(felder).eq('id', id).eq('owner_user_id', uid));
  } else {
    const { data, error: insErr } = await admin
      .from('social_beitrag')
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
  const { error } = await admin.from('social_beitrag').delete().eq('id', id).eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
