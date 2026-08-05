import { createClient } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · Website-Bauer · app/api/webseite-foto/route.ts
// Foto-Upload für den Website-Bauer. NUR eingeloggt. Der Chef lädt ein eigenes
// Bild hoch; es landet über die Service-Role im öffentlichen Bucket 'webseiten'
// unter <user.id>/<uuid>.<endung>. Zurück kommt die öffentliche URL, die der
// FotoPicker als Bild einsetzt. Kein Fremd-Dienst, kein n8n.
// POST multipart/form-data: feld "datei". Antwort: { ok, url } | { error }
// ============================================================

export const runtime = 'nodejs';

const BUCKET = 'webseiten';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ERLAUBT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: Request) {
  try {
    // 1. Nur eingeloggte Nutzer dürfen hochladen; owner sicher aus der Session.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    // 2. Datei aus dem Formular holen und prüfen.
    const form = await req.formData().catch(() => null);
    const datei = form?.get('datei');
    if (!(datei instanceof File)) {
      return NextResponse.json({ error: 'Keine Datei erhalten.' }, { status: 400 });
    }
    if (datei.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Das Bild ist zu groß (maximal 8 MB).' }, { status: 400 });
    }
    const endung = ERLAUBT[datei.type];
    if (!endung) {
      return NextResponse.json({ error: 'Nur JPG, PNG, WebP oder GIF sind erlaubt.' }, { status: 400 });
    }

    // 3. In den öffentlichen Bucket legen — Pfad nach owner getrennt.
    const bytes = Buffer.from(await datei.arrayBuffer());
    const pfad = `${user.id}/${randomUUID()}.${endung}`;
    const db = admin();
    const { error: upErr } = await db.storage.from(BUCKET).upload(pfad, bytes, {
      contentType: datei.type,
      upsert: false,
    });
    if (upErr) {
      console.error('webseite-foto Upload fehlgeschlagen:', upErr.message);
      return NextResponse.json({ error: 'Upload fehlgeschlagen. Bitte erneut versuchen.' }, { status: 500 });
    }

    // 4. Öffentliche URL zurückgeben.
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(pfad);
    return NextResponse.json({ ok: true, url: pub.publicUrl });
  } catch (e: unknown) {
    console.error('webseite-foto Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
