// ============================================================================
// ARGONAUT OS · /api/oeffentlich/produkt-dokument — Paket 315 · S1
// ÖFFENTLICH (login-frei). Download eines Produkt-Dokuments (PDF) aus dem Shop.
//   GET ?seite=<oeffentlich_id>&id=<dokument>
//   -> 302 auf einen 60 Sekunden gültigen Link direkt aus dem Speicher
//      (nicht über Vercel durchgereicht).
// Ausgeliefert wird NUR, wenn alles zusammenpasst (fail-closed):
//   · Seite ist live, Betrieb kommt aus web_seiten — nie vom Besucher
//   · Dokument gehört diesem Betrieb, ist „im Shop", aktuell, nicht abgelaufen
//   · der Artikel gehört diesem Betrieb, steht im Shop und ist aktiv
//   · der Speicher-Pfad liegt im Ordner <Betrieb>/<Artikel>/
// Mengen-Deckel lib/drossel.ts (je IP).
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { pfadPasst, istIsoTag } from '@/lib/produktDokumente';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nichtDa(status = 404) {
  return new NextResponse('Dieses Dokument ist nicht verfügbar.', {
    status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seite = (url.searchParams.get('seite') || '').trim();
    const id = (url.searchParams.get('id') || '').trim();
    if (!seite || seite.length > 100 || !UUID.test(id)) return nichtDa(400);

    const db = admin();
    const zuViel = await drossel(db, 'oeffentlich/produkt-dokument', { ip: drosselIp(req.headers) });
    if (zuViel) return new NextResponse(drosselText(zuViel), { status: 429, headers: { 'content-type': 'text/plain; charset=utf-8' } });

    const { data: s } = await db.from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) return nichtDa();
    const betrieb = inh.owner_user_id;

    const { data: d } = await db.from('produkt_dokument')
      .select('artikel_id, datei_pfad, im_shop, aktuell, gueltig_bis')
      .eq('id', id).eq('owner_user_id', betrieb).maybeSingle();
    const dok = d as { artikel_id?: string; datei_pfad?: string; im_shop?: boolean; aktuell?: boolean; gueltig_bis?: string | null } | null;
    if (!dok || dok.im_shop !== true || dok.aktuell !== true || !dok.artikel_id) return nichtDa();
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    if (istIsoTag(dok.gueltig_bis) && dok.gueltig_bis < heute) return nichtDa();

    const { data: a } = await db.from('artikel').select('id, im_shop, aktiv')
      .eq('id', dok.artikel_id).eq('owner_user_id', betrieb).maybeSingle();
    const art = a as { id?: string; im_shop?: boolean; aktiv?: boolean | null } | null;
    if (!art || art.im_shop !== true || art.aktiv === false) return nichtDa();

    if (!pfadPasst(dok.datei_pfad, betrieb, dok.artikel_id)) return nichtDa();

    const { data: link, error } = await db.storage.from('produkt-dokumente')
      .createSignedUrl(dok.datei_pfad as string, 60);
    if (error || !link?.signedUrl) return nichtDa(502);

    return NextResponse.redirect(link.signedUrl, { status: 302, headers: { 'cache-control': 'no-store' } });
  } catch (e: unknown) {
    console.error('oeffentlich/produkt-dokument:', e instanceof Error ? e.message : 'unbekannt');
    return nichtDa(500);
  }
}
