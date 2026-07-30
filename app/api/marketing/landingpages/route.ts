import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { slugNormalisieren, impressumVollstaendig, vorlageFuer, sichereMedienUrl } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/marketing/landingpages/route.ts  (LP Paket 1 + 2)
//
// Verwaltung der Landingpages durch den Betrieb selbst.
//   GET            -> { liste, impressum:{ok,fehlend} }
//   POST {..}      -> anlegen/aktualisieren (Aktivschalten nur bei vollstaendigem Impressum)
//   DELETE ?id=..  -> loeschen
//
// Schreibt ueber den Admin-Client, aber IMMER hart auf owner_user_id = user.id
// beschraenkt. Slug wird normalisiert; Doppel-Slug -> 409.
// Paket 2: hero_bild_url + video_url werden mitgelesen und -gespeichert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IMPRESSUM_FELDER = 'firma_name, firma_strasse, firma_plz, firma_ort, firma_email, firma_telefon';

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
    .from('landingpages')
    .select('id, slug, typ, titel, untertitel, nutzen, cta_text, hero_bild_url, video_url, aktiv, ab_aktiv, titel_b, untertitel_b, nutzen_b, cta_text_b, hero_bild_b_url, created_at')
    .eq('owner_user_id', uid)
    .order('created_at', { ascending: false });
  const { data: prof } = await admin.from('profiles').select(IMPRESSUM_FELDER).eq('id', uid).maybeSingle();

  return NextResponse.json({
    ok: true,
    liste: liste ?? [],
    impressum: impressumVollstaendig(prof as Parameters<typeof impressumVollstaendig>[0]),
  });
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ ok: false, error: 'Ungültige Daten.' }, { status: 400 });

  const id = (body.id || '').toString().trim() || null;
  const typ = vorlageFuer(body.typ).id; // validiert gegen bekannte Typen
  const titel = (body.titel || '').toString().trim().slice(0, 140);
  const untertitel = (body.untertitel || '').toString().trim().slice(0, 300) || null;
  const cta_text = (body.cta_text || '').toString().trim().slice(0, 60) || null;
  const slug = slugNormalisieren((body.slug || '').toString());
  const aktiv = body.aktiv === true || body.aktiv === 'true';
  const hero_bild_url = sichereMedienUrl(body.hero_bild_url) || null;
  const video_url = sichereMedienUrl(body.video_url) || null;
  const nutzen = Array.isArray(body.nutzen)
    ? (body.nutzen as unknown[]).map((n) => String(n).trim()).filter(Boolean).slice(0, 12)
    : [];

  // A-B: Variante B (optional). Aktiv nur, wenn ab_aktiv gesetzt ist.
  const ab_aktiv = body.ab_aktiv === true || body.ab_aktiv === 'true';
  const titel_b = (body.titel_b || '').toString().trim().slice(0, 140) || null;
  const untertitel_b = (body.untertitel_b || '').toString().trim().slice(0, 300) || null;
  const cta_text_b = (body.cta_text_b || '').toString().trim().slice(0, 60) || null;
  const hero_bild_b_url = sichereMedienUrl(body.hero_bild_b_url) || null;
  const nutzen_b = Array.isArray(body.nutzen_b)
    ? (body.nutzen_b as unknown[]).map((n) => String(n).trim()).filter(Boolean).slice(0, 12)
    : [];

  if (!titel) return NextResponse.json({ ok: false, error: 'Bitte eine Überschrift eingeben.' }, { status: 400 });
  if (slug.length < 3) return NextResponse.json({ ok: false, error: 'Bitte einen Link-Namen mit mindestens 3 Zeichen vergeben.' }, { status: 400 });

  const admin = createAdminClient();

  // Aktivschalten nur mit vollstaendigem Impressum (Rechtssicherheit).
  if (aktiv) {
    const { data: prof } = await admin.from('profiles').select(IMPRESSUM_FELDER).eq('id', uid).maybeSingle();
    const imp = impressumVollstaendig(prof as Parameters<typeof impressumVollstaendig>[0]);
    if (!imp.ok) {
      return NextResponse.json(
        { ok: false, error: 'Impressum unvollständig — bitte zuerst ergänzen: ' + imp.fehlend.join(', '), fehlend: imp.fehlend },
        { status: 400 },
      );
    }
  }

  const felder = {
    slug, typ, titel, untertitel, cta_text, nutzen, hero_bild_url, video_url, aktiv,
    ab_aktiv, titel_b, untertitel_b, cta_text_b, hero_bild_b_url, nutzen_b,
  };

  let error;
  let neuId = id;
  if (id) {
    ({ error } = await admin.from('landingpages').update(felder).eq('id', id).eq('owner_user_id', uid));
  } else {
    const { data, error: insErr } = await admin
      .from('landingpages')
      .insert({ ...felder, owner_user_id: uid })
      .select('id')
      .single();
    error = insErr;
    neuId = (data as { id: string } | null)?.id ?? null;
  }

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: false, error: 'Dieser Link-Name ist schon vergeben. Bitte einen anderen wählen.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: neuId });
}

export async function DELETE(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });
  const id = (new URL(req.url).searchParams.get('id') || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Keine ID.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from('landingpages').delete().eq('id', id).eq('owner_user_id', uid);
  if (error) return NextResponse.json({ ok: false, error: 'Löschen fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
