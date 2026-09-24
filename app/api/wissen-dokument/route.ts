// ============================================================================
// ARGONAUT OS · app/api/wissen-dokument/route.ts — Beleg-Dokument öffnen (Paket PG · B14)
//
//   GET ?id=<document_id>  -> Weiterleitung auf einen kurzlebigen Download-Link
//
// ERST prüft die Datenbank mit den Rechten des ANGEMELDETEN Nutzers (RLS),
// ob er das Dokument sehen darf: eigenes Dokument, oder vom Chef ausdrücklich
// fürs Team freigegeben (documents.fuer_team). Nur dann wird mit dem
// Dienstschlüssel ein Link erzeugt, der 5 Minuten gilt. Kommt beim ersten
// Schritt nichts zurück, gibt es keinen Link — auch nicht mit geratener ID.
// ============================================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

const BUCKET = 'customer-documents';
const GUELTIG_SEKUNDEN = 300;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: 'Ungültiges Dokument.' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  // Schritt 1: darf DIESER Nutzer das Dokument sehen? (RLS entscheidet)
  const { data: doc } = await supabase.from('documents').select('id, storage_path, file_name').eq('id', id).maybeSingle();
  const d = doc as { storage_path?: string; file_name?: string } | null;
  if (!d?.storage_path) return NextResponse.json({ ok: false, error: 'Dokument nicht gefunden oder nicht freigegeben.' }, { status: 404 });

  // Schritt 2: kurzlebiger Link
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(d.storage_path, GUELTIG_SEKUNDEN);
    if (error || !data?.signedUrl) throw error ?? new Error('kein Link');
    return NextResponse.redirect(data.signedUrl, 302);
  } catch {
    return NextResponse.json({ ok: false, error: 'Das Dokument kann gerade nicht geöffnet werden.' }, { status: 502 });
  }
}
