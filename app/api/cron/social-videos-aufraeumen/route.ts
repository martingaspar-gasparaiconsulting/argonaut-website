import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { zumAufraeumen, aufraeumBericht, AUFRAEUM_TAGE } from '@/lib/socialVideo';

// ============================================================================
// ARGONAUT OS · /api/cron/social-videos-aufraeumen   (C5)
//
// Woechentlicher Cron: entfernt hochgeladene Videos, die aelter als 30 Tage
// sind UND in keinem Beitrag verwendet werden. Ohne dieses Programm fuellt ein
// einziger Kunde ueber die Zeit den Speicher fuer alle.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Diese Route liest mit der Service-Rolle und umgeht RLS. Die Pruefung
// „wird noch verwendet?" laeuft deshalb JE BETRIEB gegen dessen eigene
// Beitraege — wer hier ueber alle Betriebe hinweg vergleicht, loescht dem
// einen Kunden das Video, weil ein anderer es nicht benutzt. tsc faengt das
// NICHT. Gleiches Muster wie in /api/cron/reports-versand.
//
// Ausloesung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=.
// Mit ?probe=1 laeuft er trocken: er meldet nur, was er loeschen wuerde.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'social-videos';
const MAX_ZEILEN = 2000;

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function erlaubt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}

type VideoRow = { id: string; owner_user_id: string; pfad: string; url: string; erstellt_am: string };
type BeitragRow = { owner_user_id: string; medien_urls: string[] | null };

async function lauf(req: Request) {
  if (!erlaubt(req)) return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });
  const probe = new URL(req.url).searchParams.get('probe') === '1';

  const db = service();
  const jetztIso = new Date().toISOString();

  const [{ data: videoRoh, error }, { data: beitragRoh }] = await Promise.all([
    db.from('social_video').select('id, owner_user_id, pfad, url, erstellt_am').limit(MAX_ZEILEN),
    db.from('social_beitrag').select('owner_user_id, medien_urls').limit(MAX_ZEILEN * 5),
  ]);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const videos = (videoRoh ?? []) as VideoRow[];
  const beitraege = (beitragRoh ?? []) as BeitragRow[];

  // JE BETRIEB vergleichen — siehe Warnung oben.
  const beitraegeJeBetrieb = new Map<string, BeitragRow[]>();
  for (const b of beitraege) {
    const k = String(b?.owner_user_id ?? '');
    if (!k) continue;
    const liste = beitraegeJeBetrieb.get(k) ?? [];
    liste.push(b);
    beitraegeJeBetrieb.set(k, liste);
  }

  const weg: VideoRow[] = [];
  const jeBetrieb = new Map<string, VideoRow[]>();
  for (const v of videos) {
    const k = String(v?.owner_user_id ?? '');
    if (!k) continue;
    const liste = jeBetrieb.get(k) ?? [];
    liste.push(v);
    jeBetrieb.set(k, liste);
  }
  for (const [ownerId, eigene] of jeBetrieb) {
    const treffer = zumAufraeumen(eigene, beitraegeJeBetrieb.get(ownerId) ?? [], jetztIso) as VideoRow[];
    weg.push(...treffer);
  }

  if (probe) {
    return NextResponse.json({
      ok: true,
      probe: true,
      geprueft: videos.length,
      wuerdeLoeschen: weg.length,
      pfade: weg.slice(0, 20).map((v) => v.pfad),
      hinweis: aufraeumBericht(videos.length, weg.length, AUFRAEUM_TAGE),
    });
  }

  let geloescht = 0;
  for (const v of weg) {
    try {
      await db.storage.from(BUCKET).remove([v.pfad]);
      await db.from('social_video').delete().eq('id', v.id);
      geloescht++;
    } catch (e) {
      console.error('Video aufräumen fehlgeschlagen', v.id, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    ok: true,
    geprueft: videos.length,
    geloescht,
    hinweis: aufraeumBericht(videos.length, geloescht, AUFRAEUM_TAGE),
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
