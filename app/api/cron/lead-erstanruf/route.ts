import { NextResponse } from 'next/server';
import { cronGuard } from '@/lib/cronGuard';
import { createAdminClient } from '@/lib/supabase-admin';
import { erstanrufFaellig, glockeAn, glockeText, ERSTANRUF_FENSTER_STD, type LeadRoh } from '@/lib/anrufSitzung';

// ============================================================================
// ARGONAUT OS · /api/cron/lead-erstanruf — Paket 361 (VK4 Teil 2)
//
// Alle 5 Minuten: Neue Leads mit Telefonnummer, die seit 15 Minuten (höchstens
// 24 Stunden) auf den ersten Anruf warten, bekommen EINE Glocke — an den Setter
// des Leads, sonst an die Geschäftsleitung. Höchstens eine Glocke je Lead
// (Sperre 24 Std. in der Datenbank). Nur lesen + Glocke, nichts wird geändert.
// Service-Rolle: jede Glocke geht nur an eine Person desselben Betriebs
// (Setter ist per Wächter p358 Teil des Betriebs).
// Fehlen die Spalten aus SQL 360, wird nichts gesendet (Fehlermeldung im Ergebnis).
// Auslösung: Vercel-Cron (Bearer CRON_SECRET). ?probe=1 = trocken.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Zeile = LeadRoh & { owner_user_id: string };

export async function GET(req: Request) {
  const gesperrt = await cronGuard(req);
  if (gesperrt) return gesperrt;
  const probe = new URL(req.url).searchParams.get('probe') === '1';
  const admin = createAdminClient();
  const jetzt = new Date();
  const ab = new Date(jetzt.getTime() - ERSTANRUF_FENSTER_STD * 3_600_000).toISOString();

  const zeilen: Zeile[] = [];
  for (let von = 0; von < 20_000; von += 1000) {
    const { data, error } = await admin.from('leads')
      .select('id, owner_user_id, name, telefon, status, stufe, quelle, dienstleistung, created_at, setter_user_id, erster_anruf_am')
      .gte('created_at', ab).is('erster_anruf_am', null)
      .order('created_at').range(von, von + 999);
    if (error) return NextResponse.json({ ok: false, error: 'Leads nicht lesbar (SQL zu Paket 360 eingespielt?).' }, { status: 500 });
    zeilen.push(...((data ?? []) as Zeile[]));
    if (!data || data.length < 1000) break;
  }

  const faellig = erstanrufFaellig(zeilen, jetzt);
  let gesendet = 0;
  if (!probe) {
    for (const l of faellig) {
      const an = glockeAn(l);
      if (!an) continue;
      const t = glockeText(l, jetzt);
      const { error } = await admin.rpc('benachrichtigung_erstellen', {
        p_owner: an, p_typ: 'lead_erstanruf', p_titel: t.titel, p_nachricht: t.nachricht,
        p_link: t.link, p_ref_tabelle: 'leads', p_ref_id: l.id, p_dedup_stunden: 24,
      });
      if (!error) gesendet++;
    }
  }
  return NextResponse.json({ ok: true, probe, geprueft: zeilen.length, faellig: faellig.length, gesendet });
}
