import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { MEDIEN_MAX_MB, istErlaubtesBild, bildEndungFuer } from '@/lib/landingpages';

// ============================================================================
// ARGONAUT OS · app/api/marketing/lp-medien/route.ts  (LP Paket 2 · Medien)
//
// Bild-Upload für den Landingpage-Bauer (Hero-Bild).
//   POST (multipart/form-data, Feld "datei") -> lädt das Bild in den ÖFFENTLICHEN
//        Storage-Bucket "lp-medien" und liefert { ok, url } mit der öffentlichen URL.
//
// Nur eingeloggte Betriebe. Ablage unter <user.id>/<uuid>.<endung> (owner-getrennt).
// Videos werden NICHT hochgeladen (Bandbreiten-/Kostenfalle) — dafür Embed-Link.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'lp-medien';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Keine Datei empfangen.' }, { status: 400 });
  }

  const datei = form.get('datei');
  if (!(datei instanceof File)) {
    return NextResponse.json({ ok: false, error: 'Bitte eine Bild-Datei auswählen.' }, { status: 400 });
  }

  const typ = (datei.type || '').toLowerCase();
  if (!istErlaubtesBild(typ)) {
    return NextResponse.json(
      { ok: false, error: 'Nur Bilder erlaubt (JPG, PNG, WebP oder GIF).' },
      { status: 400 },
    );
  }
  if (datei.size > MEDIEN_MAX_MB * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: `Das Bild ist zu groß (max. ${MEDIEN_MAX_MB} MB).` },
      { status: 400 },
    );
  }
  if (datei.size === 0) {
    return NextResponse.json({ ok: false, error: 'Die Datei ist leer.' }, { status: 400 });
  }

  const buffer = Buffer.from(await datei.arrayBuffer());
  const pfad = `${uid}/${randomUUID()}.${bildEndungFuer(typ)}`;

  const admin = createAdminClient();
  const { error: uploadFehler } = await admin.storage
    .from(BUCKET)
    .upload(pfad, new Uint8Array(buffer), { contentType: typ, upsert: false });

  if (uploadFehler) {
    const msg = /bucket/i.test(uploadFehler.message || '')
      ? 'Speicher-Bereich fehlt noch (Bucket „lp-medien"). Bitte den SQL-Block aus Paket 2 ausführen.'
      : 'Upload fehlgeschlagen. Bitte erneut versuchen.';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(pfad);
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}
