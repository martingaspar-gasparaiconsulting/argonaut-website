import { NextResponse } from 'next/server';
import { cronGuard } from '@/lib/cronGuard';
import { createAdminClient } from '@/lib/supabase-admin';
import { MAPPE_BUCKET } from '@/lib/fahrzeugMappe';
import { loeschGrund, type LoeschZeile } from '@/lib/fahrzeugMappeAntwort';

// ============================================================================
// ARGONAUT OS · /api/cron/fahrzeugmappe-loeschen — Löschfrist (Paket 306, FM2)
//
// Täglich. Fahrzeugmappen samt Dateien im Speicher weg, wenn
//  - nie abgeschickt (Entwurf) und älter als 30 Tage,
//  - eingereicht, aber der Ankauf gelöscht wurde,
//  - eingereicht und der Ankauf seit mehr als 90 Tagen „Nicht angekauft“ ist.
// Angekaufte, laufende und angebotene Mappen bleiben. Der Ankauf selbst bleibt
// immer (Nummer, Angaben, Notiz) — nur Fotos, Videos und Unterlagen gehen.
// Erst die Dateien, dann der Eintrag (sonst blieben Dateien ohne Besitzer liegen).
// Auslösung: Vercel-Cron (Bearer CRON_SECRET). ?probe=1 = trocken.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const gesperrt = await cronGuard(req);
  if (gesperrt) return gesperrt;
  const probe = new URL(req.url).searchParams.get('probe') === '1';
  const admin = createAdminClient();
  const jetzt = Date.now();

  const zeilen: LoeschZeile[] = [];
  for (let von = 0; von < 20_000; von += 1000) {
    const { data, error } = await admin.from('kfz_mappe')
      .select('id, owner_user_id, status, erstellt_am, ankauf_id, kfz_ankauf(status, aktualisiert_am)')
      .order('erstellt_am').order('id').range(von, von + 999);
    if (error) return NextResponse.json({ ok: false, error: 'Mappen nicht lesbar (SQL zu Paket 305/306 eingespielt?).' }, { status: 500 });
    for (const z of ((data as unknown) as { id: string; status: string; erstellt_am: string; ankauf_id: string | null; kfz_ankauf: { status: string; aktualisiert_am: string } | null }[]) ?? []) {
      zeilen.push({ id: z.id, status: z.status, erstellt_am: z.erstellt_am, ankauf_id: z.ankauf_id, ankauf_status: z.kfz_ankauf?.status ?? null, ankauf_geaendert: z.kfz_ankauf?.aktualisiert_am ?? null });
    }
    if (!data || data.length < 1000) break;
  }

  const weg = zeilen.map((z) => ({ z, grund: loeschGrund(z, jetzt) })).filter((x) => x.grund).slice(0, 300);
  const zaehler: Record<string, number> = {};
  let dateien = 0, fehler = 0;
  for (const { z, grund } of weg) {
    zaehler[grund as string] = (zaehler[grund as string] ?? 0) + 1;
    if (probe) continue;
    const { data: d } = await admin.from('kfz_mappe_datei').select('pfad').eq('mappe_id', z.id).limit(200);
    const pfade = (((d as unknown) as { pfad: string }[]) ?? []).map((x) => x.pfad);
    if (pfade.length) {
      const { error: sErr } = await admin.storage.from(MAPPE_BUCKET).remove(pfade);
      if (sErr) { fehler++; continue; }   // Eintrag bleibt, nächster Lauf versucht es erneut
      dateien += pfade.length;
    }
    const { error: dErr } = await admin.from('kfz_mappe').delete().eq('id', z.id);
    if (dErr) fehler++;
  }
  return NextResponse.json({ ok: true, probe, mappen: weg.length, gruende: zaehler, dateien, fehler });
}
