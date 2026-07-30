import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { entschluessele, encKeyBereit } from '../../../../lib/crypto';
import { posteBeitrag, type BeitragLite, type MetaZugang } from '../../../../lib/socialVersand';

// ============================================================================
// ARGONAUT OS · app/api/cron/social-posten/route.ts  (Social P3 · Auto-Posten)
//
// Der Takt-MOTOR der Postingzentrale. Holt alle FAELLIGEN geplanten Beitraege
// (status='geplant', geplant_am <= jetzt) und postet sie automatisch auf die
// verbundenen Meta-Kanaele des jeweiligen Betriebs. Protokoll in social_versand.
//
// Ausloesung: Vercel Cron (Bearer CRON_SECRET) ODER eingeloggter Admin (Test).
// Service-Role umgeht RLS. Demo-Konten posten NICHT. Token wird serverseitig
// entschluesselt; er verlaesst den Server nie.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PRO_DURCHGANG = 100;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function erlaubt(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization') || '';
    const url = new URL(req.url);
    if (auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return p?.role === 'admin';
}

/** Verbundene Meta-Zugaenge eines Betriebs (Token entschluesselt). */
async function metaZugaenge(admin: ReturnType<typeof service>, uid: string): Promise<Record<string, MetaZugang>> {
  const { data } = await admin
    .from('social_zugang')
    .select('plattform, ziel_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .in('plattform', ['facebook', 'instagram', 'google_business', 'linkedin']);
  const map: Record<string, MetaZugang> = {};
  for (const r of (data ?? []) as { plattform: string; ziel_id: string | null; token_verschluesselt: string | null; verbunden: boolean | null }[]) {
    if (r.verbunden !== true || !r.token_verschluesselt || !r.ziel_id) continue;
    try {
      const token = entschluessele(r.token_verschluesselt);
      if (token) map[r.plattform] = { plattform: r.plattform, ziel_id: r.ziel_id, token };
    } catch { /* defekt -> ueberspringen */ }
  }
  return map;
}

async function lauf(req: Request) {
  if (!(await erlaubt(req))) return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'APP_ENC_KEY fehlt' }, { status: 400 });

  const admin = service();
  const jetzt = new Date().toISOString();

  const { data: faelligD, error } = await admin
    .from('social_beitrag')
    .select('id, owner_user_id, text, medien_urls, kanaele')
    .eq('status', 'geplant')
    .lte('geplant_am', jetzt)
    .order('geplant_am', { ascending: true })
    .limit(MAX_PRO_DURCHGANG);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const faellig = (faelligD ?? []) as (BeitragLite & { owner_user_id: string })[];
  if (faellig.length === 0) return NextResponse.json({ ok: true, geprueft: 0, gepostet: 0, fehlgeschlagen: 0 });

  // Demo-Konten unter den betroffenen Ownern herausfiltern.
  const ownerIds = Array.from(new Set(faellig.map((b) => b.owner_user_id)));
  const { data: demoD } = await admin.from('profiles').select('id, demo').in('id', ownerIds);
  const demoSet = new Set(((demoD ?? []) as { id: string; demo?: boolean | null }[]).filter((p) => p.demo).map((p) => p.id));

  const zugangCache: Record<string, Record<string, MetaZugang>> = {};
  let gepostet = 0, fehlgeschlagen = 0, uebersprungen = 0;

  for (const b of faellig) {
    if (demoSet.has(b.owner_user_id)) { uebersprungen++; continue; }
    if (!(b.owner_user_id in zugangCache)) zugangCache[b.owner_user_id] = await metaZugaenge(admin, b.owner_user_id);
    const zugaenge = zugangCache[b.owner_user_id];

    const { gesendet, fehler } = await posteBeitrag(admin, {
      ownerId: b.owner_user_id,
      beitrag: { id: b.id, text: b.text, medien_urls: b.medien_urls, kanaele: b.kanaele },
      zugaenge,
    });

    // Statuswechsel: bei mind. einem Erfolg 'gesendet', sonst 'fehler'
    // (verhindert endloses Wiederholen fälliger Beiträge in jedem Durchgang).
    const neuStatus = gesendet > 0 ? 'gesendet' : 'fehler';
    await admin.from('social_beitrag').update({ status: neuStatus }).eq('id', b.id).eq('owner_user_id', b.owner_user_id);
    if (gesendet > 0) gepostet++; if (gesendet === 0 && fehler > 0) fehlgeschlagen++;
  }

  return NextResponse.json({
    ok: true,
    geprueft: faellig.length,
    gepostet,
    fehlgeschlagen,
    uebersprungen,
    gedeckelt: faellig.length >= MAX_PRO_DURCHGANG,
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
