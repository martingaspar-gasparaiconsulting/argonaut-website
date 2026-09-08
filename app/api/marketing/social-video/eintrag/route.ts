import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

// ============================================================================
// ARGONAUT OS · /api/marketing/social-video/eintrag   (C5)
//
// Traegt ein fertig hochgeladenes Video in die Videothek ein. Bewusst eine
// eigene, winzige Route NACH dem Upload: Die Datei liegt zu diesem Zeitpunkt
// schon im Speicher — scheitert der Eintrag, ist das Video trotzdem nutzbar,
// es wird nur vom Aufraeum-Programm nicht erfasst.
//
// Geschrieben wird ueber den SITZUNGS-Client, nicht mit der Service-Rolle:
// so entscheidet RLS, in welchen Betrieb die Zeile gehoert. Der Pfad muss im
// eigenen Ordner liegen — sonst traegt jemand fremde Dateien ein.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const pfad = String(body?.pfad ?? '').trim();
    const url = String(body?.url ?? '').trim();
    const dateiname = String(body?.dateiname ?? '').trim() || null;
    const groesse = Number(body?.groesse ?? 0);

    if (!pfad || !url) {
      return NextResponse.json({ ok: false, error: 'Angaben unvollständig.' }, { status: 400 });
    }
    // Der Pfad MUSS im eigenen Ordner liegen — er kommt vom Browser.
    if (!pfad.startsWith(`${user.id}/`)) {
      return NextResponse.json({ ok: false, error: 'Pfad gehört nicht zu diesem Konto.' }, { status: 403 });
    }

    const { error } = await supabase.from('social_video').insert({
      owner_user_id: user.id,
      pfad,
      url,
      dateiname,
      groesse_bytes: Number.isFinite(groesse) && groesse > 0 ? Math.round(groesse) : 0,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('social-video Eintrag fehlgeschlagen:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
