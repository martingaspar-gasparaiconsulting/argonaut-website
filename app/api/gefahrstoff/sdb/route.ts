// ============================================================================
// ARGONAUT OS · Paket 318 (G2a) · /api/gefahrstoff/sdb — Sicherheitsdatenblatt öffnen
//
// MIT Login. Für die Geschäftsleitung UND alle Mitarbeiter des Betriebs:
// § 6 und § 14 GefStoffV verlangen, dass Beschäftigte das Sicherheitsdatenblatt
// einsehen können — unabhängig von ihren Modul-Rechten.
//
//   GET ?id=<gefahrstoff>  -> 302 auf einen 60 Sekunden gültigen Link
//
// Fail-closed:
//   · der Stoff wird mit der Anmeldung des Nutzers gelesen (Datenbank-Regeln
//     gelten) und muss zum Betrieb des Nutzers gehören
//   · eigene Datei: Pfad muss im Ordner <Betrieb>/<Stoff>/ liegen
//   · sonst das aktuelle SDB des verknüpften Artikels (Produkt-Dokumente),
//     Artikel und Dokument müssen zum Betrieb gehören, Pfad <Betrieb>/<Artikel>/
// Erst danach liest der Server mit dem Dienst-Schlüssel aus dem privaten Speicher.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient as dienst } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { sdbPfadPasst, besteArtikelSdb } from '@/lib/gefahrstoffLager';
import { pfadPasst } from '@/lib/produktDokumente';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function admin() {
  return dienst(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function nichtDa(status: number, text = 'Für diesen Stoff ist kein Sicherheitsdatenblatt hinterlegt.') {
  return new NextResponse(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function GET(req: Request) {
  try {
    const id = (new URL(req.url).searchParams.get('id') || '').trim();
    if (!UUID.test(id)) return nichtDa(400, 'Stoff nicht erkannt.');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return nichtDa(401, 'Bitte melden Sie sich an.');
    const { data: chef } = await supabase.rpc('mein_chef_id');
    const betrieb = (typeof chef === 'string' && chef) ? chef : user.id;

    const { data: g } = await supabase.from('gefahrstoff')
      .select('id, owner_user_id, artikel_id, sdb_pfad')
      .eq('id', id).eq('owner_user_id', betrieb).maybeSingle();
    const stoff = g as { id: string; owner_user_id: string; artikel_id: string | null; sdb_pfad: string | null } | null;
    if (!stoff) return nichtDa(404, 'Stoff nicht gefunden.');

    const db = admin();
    let bucket = '';
    let pfad = '';
    if (stoff.sdb_pfad) {
      if (!sdbPfadPasst(stoff.sdb_pfad, betrieb, stoff.id)) return nichtDa(404);
      bucket = 'gefahrstoff-sdb';
      pfad = stoff.sdb_pfad;
    } else if (stoff.artikel_id) {
      const { data: a } = await db.from('artikel').select('id').eq('id', stoff.artikel_id).eq('owner_user_id', betrieb).maybeSingle();
      if (!a) return nichtDa(404);
      const { data: docs } = await db.from('produkt_dokument')
        .select('id, art, sprache, ausgabe_am, aktuell, datei_pfad')
        .eq('artikel_id', stoff.artikel_id).eq('owner_user_id', betrieb).eq('art', 'sdb').eq('aktuell', true)
        .limit(50);
      const d = besteArtikelSdb((docs as { id: string; art: string; sprache: string; ausgabe_am: string | null; aktuell: boolean; datei_pfad: string }[]) ?? []);
      if (!d || !pfadPasst(d.datei_pfad, betrieb, stoff.artikel_id)) return nichtDa(404);
      bucket = 'produkt-dokumente';
      pfad = d.datei_pfad;
    } else {
      return nichtDa(404);
    }

    const { data: link, error } = await db.storage.from(bucket).createSignedUrl(pfad, 60);
    if (error || !link?.signedUrl) return nichtDa(502, 'Die Datei konnte gerade nicht geöffnet werden.');
    return NextResponse.redirect(link.signedUrl, { status: 302, headers: { 'cache-control': 'no-store' } });
  } catch (e: unknown) {
    console.error('gefahrstoff/sdb:', e instanceof Error ? e.message : 'unbekannt');
    return nichtDa(500, 'Die Datei konnte gerade nicht geöffnet werden.');
  }
}
