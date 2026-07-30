import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { entschluessele, encKeyBereit } from '@/lib/crypto';
import { posteBeitrag, type BeitragLite, type MetaZugang } from '@/lib/socialVersand';

// ============================================================================
// ARGONAUT OS · app/api/marketing/social-senden/route.ts  (Social P3)
//
// POST { beitrag_id } -> postet den Beitrag SOFORT auf die verbundenen
// Meta-Kanaele (Facebook/Instagram) und protokolliert in social_versand.
// Bei Erfolg wird der Beitrag auf status='gesendet' gesetzt.
//
// Demo-Konten posten NICHT. Token wird serverseitig entschluesselt; er verlaesst
// den Server nie. Weitere Kanaele (Google Business, LinkedIn ...) folgen einzeln.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Baut die verbundenen Meta-Zugaenge eines Betriebs (Token entschluesselt). */
async function metaZugaenge(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<Record<string, MetaZugang>> {
  const { data } = await admin
    .from('social_zugang')
    .select('plattform, ziel_id, token_verschluesselt, verbunden')
    .eq('owner_user_id', uid)
    .in('plattform', ['facebook', 'instagram']);
  const map: Record<string, MetaZugang> = {};
  for (const r of (data ?? []) as { plattform: string; ziel_id: string | null; token_verschluesselt: string | null; verbunden: boolean | null }[]) {
    if (r.verbunden !== true || !r.token_verschluesselt || !r.ziel_id) continue;
    try {
      const token = entschluessele(r.token_verschluesselt);
      if (token) map[r.plattform] = { plattform: r.plattform, ziel_id: r.ziel_id, token };
    } catch { /* defekter Zugang -> Kanal ueberspringen */ }
  }
  return map;
}

export async function POST(req: Request) {
  const uid = await userId();
  if (!uid) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const beitragId = (body?.beitrag_id || '').toString().trim();
  if (!beitragId) return NextResponse.json({ ok: false, error: 'Kein Beitrag angegeben.' }, { status: 400 });

  const admin = createAdminClient();

  const { data: prof } = await admin.from('profiles').select('demo').eq('id', uid).maybeSingle();
  if ((prof as { demo?: boolean | null } | null)?.demo) {
    return NextResponse.json({ ok: false, error: 'Im Demo-Konto ist das Posten deaktiviert.' }, { status: 400 });
  }

  const { data: bt } = await admin
    .from('social_beitrag')
    .select('id, text, medien_urls, kanaele')
    .eq('id', beitragId)
    .eq('owner_user_id', uid)
    .maybeSingle();
  const beitrag = bt as BeitragLite | null;
  if (!beitrag) return NextResponse.json({ ok: false, error: 'Beitrag nicht gefunden.' }, { status: 404 });

  const metaKanaele = (beitrag.kanaele || []).filter((k) => k === 'facebook' || k === 'instagram');
  if (metaKanaele.length === 0) {
    return NextResponse.json({ ok: false, error: 'Für das automatische Posten sind aktuell Facebook und Instagram möglich. Weitere Kanäle folgen einzeln.' }, { status: 400 });
  }
  if (!encKeyBereit()) return NextResponse.json({ ok: false, error: 'Sicherheits-Schlüssel (APP_ENC_KEY) fehlt.' }, { status: 400 });

  const zugaenge = await metaZugaenge(admin, uid);
  if (Object.keys(zugaenge).length === 0) {
    return NextResponse.json({ ok: false, error: 'Kein verbundener Meta-Kanal. Bitte oben Facebook/Instagram verbinden.' }, { status: 400 });
  }

  const { ergebnisse, gesendet, fehler } = await posteBeitrag(admin, { ownerId: uid, beitrag, zugaenge });

  if (gesendet > 0) {
    await admin.from('social_beitrag').update({ status: 'gesendet' }).eq('id', beitrag.id).eq('owner_user_id', uid);
  }

  return NextResponse.json({ ok: true, gesendet, fehler, ergebnisse });
}
