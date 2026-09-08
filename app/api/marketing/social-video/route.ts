import { NextResponse } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { pruefeVideo, pfadFuer, MAX_BYTES } from '@/lib/socialVideo';
import { limitBytes, passtNochRein, formatBytes } from '@/lib/speicher';

// ============================================================================
// ARGONAUT OS · /api/marketing/social-video   (C5)
//
// Eigene Videos fuer Social-Beitraege.
//
// WARUM SIGNIERTE ADRESSE STATT UPLOAD DURCH DIESE ROUTE:
// Eine Serverless-Funktion nimmt nur wenige Megabyte Nutzlast an — ein
// 150-MB-Video kaeme nie an. Die Route prueft deshalb NUR (Format, Groesse,
// Kontingent) und stellt danach eine signierte Adresse aus; die Datei geht
// direkt vom Browser in den Speicher. Ohne diese Route gibt es keine gueltige
// Adresse — es kann also niemand am Kontingent vorbei hochladen.
//
// POST { dateiname, typ, groesse }  -> { ok, pfad, token, url }
// DELETE ?id=<social_video.id>      -> { ok }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'social-videos';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

/** Oeffentliche Adresse der Datei — die Plattformen holen sie sich selbst ab. */
function oeffentlicheUrl(pfad: string): string {
  const basis = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return `${basis}/storage/v1/object/public/${BUCKET}/${pfad}`;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const dateiname = String(body?.dateiname ?? '');
    const typ = String(body?.typ ?? '');
    const groesse = Number(body?.groesse ?? 0);

    const pruefung = pruefeVideo(dateiname, typ, groesse);
    if (!pruefung.ok) return NextResponse.json({ ok: false, error: pruefung.fehler }, { status: 400 });

    const db = admin();

    // Kontingent: belegte Bytes dieses Kunden gegen sein Tarif-Limit.
    // Faellt die Messung aus, wird NICHT blockiert — ein kaputter Waechter
    // darf niemanden aussperren, aber die Grenze der Datei gilt trotzdem.
    try {
      const [{ data: belegt }, { data: profil }] = await Promise.all([
        db.rpc('speicher_bytes_fuer', { owner_key: user.id }),
        db.from('profiles').select('stufe, zusatz_speicher_gb').eq('id', user.id).maybeSingle(),
      ]);
      const p = (profil ?? {}) as { stufe?: string | null; zusatz_speicher_gb?: number | null };
      const limit = limitBytes(p.stufe, p.zusatz_speicher_gb);
      const genutzt = Number(belegt) || 0;
      if (!passtNochRein(genutzt, limit, groesse)) {
        return NextResponse.json({
          ok: false,
          error: `Ihr Speicher ist voll (${formatBytes(genutzt)} von ${formatBytes(limit)} belegt). `
            + 'Löschen Sie alte Videos oder buchen Sie Speicher dazu.',
        }, { status: 413 });
      }
    } catch { /* Waechter ausgefallen — Datei-Grenze greift weiterhin */ }

    const pfad = pfadFuer(user.id, dateiname);
    if (!pfad) return NextResponse.json({ ok: false, error: 'Dateiname nicht verwendbar.' }, { status: 400 });

    const { data: signiert, error } = await db.storage.from(BUCKET).createSignedUploadUrl(pfad);
    if (error || !signiert) {
      return NextResponse.json({ ok: false, error: 'Der Speicherplatz konnte nicht vorbereitet werden.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      pfad,
      // Die fertige Adresse zum Hochladen — der Browser legt die Datei per
      // PUT direkt dort ab. Sie gilt nur fuer genau diesen einen Pfad.
      signedUrl: signiert.signedUrl,
      token: signiert.token,
      url: oeffentlicheUrl(pfad),
      maxBytes: MAX_BYTES,
    });
  } catch (e: unknown) {
    console.error('social-video Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ ok: false, error: 'Kein Video angegeben.' }, { status: 400 });

    // Ueber den Sitzungs-Client lesen: RLS entscheidet, ob dieses Video
    // ueberhaupt zu diesem Betrieb gehoert. Erst danach faellt die Datei.
    const { data: video } = await supabase
      .from('social_video')
      .select('id, pfad')
      .eq('id', id)
      .maybeSingle();
    if (!video) return NextResponse.json({ ok: false, error: 'Video nicht gefunden.' }, { status: 404 });

    const db = admin();
    await db.storage.from(BUCKET).remove([String((video as { pfad: string }).pfad)]);
    await supabase.from('social_video').delete().eq('id', id);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('social-video Löschen fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
