import { NextResponse } from 'next/server';
import { cronGuard } from '@/lib/cronGuard';
import { createAdminClient } from '@/lib/supabase-admin';
import { erinnerungen, erinnerungText, BALD_TAGE, type ErinnerungZeile } from '@/lib/rechtsFreigaben';

// ============================================================================
// ARGONAUT OS · /api/cron/rechts-freigaben — Erinnerung vor Ablauf (Paket 288, RF1b)
//
// Täglich: Freigaben, die in höchstens 30 Tagen ablaufen, bekommen eine Glocke
// an die Geschäftsleitung des Betriebs (owner_user_id = Konto des Chefs).
// Höchstens eine Glocke je Betrieb und Woche (Dedup 7 Tage in der Datenbank).
// Nur lesen + Glocke, nichts wird geändert. Service-Rolle: jede Glocke geht an
// genau den Betrieb, dem die Zeile gehört.
// Auslösung: Vercel-Cron (Bearer CRON_SECRET). ?probe=1 = trocken.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const gesperrt = await cronGuard(req);
  if (gesperrt) return gesperrt;
  const probe = new URL(req.url).searchParams.get('probe') === '1';
  const admin = createAdminClient();
  const jetzt = new Date();
  const bis = new Date(jetzt.getTime() + BALD_TAGE * 86_400_000).toISOString();

  const zeilen: ErinnerungZeile[] = [];
  for (let von = 0; von < 10_000; von += 1000) {
    const { data, error } = await admin.from('rechts_freigabe')
      .select('owner_user_id, funktion, fassung, bestaetigt_am, gueltig_bis, widerrufen_am')
      .is('widerrufen_am', null).gt('gueltig_bis', jetzt.toISOString()).lte('gueltig_bis', bis)
      .order('owner_user_id').order('funktion').range(von, von + 999);
    if (error) return NextResponse.json({ ok: false, error: 'Freigaben nicht lesbar (SQL zu Paket 287 eingespielt?).' }, { status: 500 });
    zeilen.push(...((data ?? []) as ErinnerungZeile[]));
    if (!data || data.length < 1000) break;
  }

  const liste = erinnerungen(zeilen, jetzt);
  let gesendet = 0;
  if (!probe) {
    for (const e of liste) {
      const t = erinnerungText(e);
      const { error } = await admin.rpc('benachrichtigung_erstellen', {
        p_owner: e.betrieb, p_typ: 'rechts_freigabe', p_titel: t.titel, p_nachricht: t.nachricht,
        p_link: '/dashboard/rechtliche-freigaben', p_ref_tabelle: 'rechts_freigabe', p_ref_id: e.betrieb, p_dedup_stunden: 168,
      });
      if (!error) gesendet++;
    }
  }
  return NextResponse.json({ ok: true, probe, betriebe: liste.length, gesendet });
}
