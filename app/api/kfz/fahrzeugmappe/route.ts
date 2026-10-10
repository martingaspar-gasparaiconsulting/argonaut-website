import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { MAPPE_BUCKET, istUuid, pruefungSauber } from '@/lib/fahrzeugMappe';

// ============================================================================
// ARGONAUT OS · /api/kfz/fahrzeugmappe — Paket 305 · FM1 (Händler-Seite)
//
// NUR MIT LOGIN. Die Dateien der Fahrzeugmappe liegen im privaten Ordner
// „fahrzeugmappe" ohne Nutzer-Regeln. Ob jemand die Mappe zu einem Ankauf sehen
// darf, entscheidet die DATENBANK (Regeln p305: Geschäftsleitung, Mitarbeiter
// mit Recht „KFZ") — gelesen wird mit dem Login der Person. Erst danach
// signiert der Server die Ansichts-Links (1 Stunde).
//   GET    ?ankauf=<id>  -> { mappe, dateien[] } oder { mappe: null }
//   DELETE ?ankauf=<id>  -> Mappe samt Dateien löschen (nur Geschäftsleitung,
//                           Regel p305_chef_delete) — vor „Ankauf löschen"
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

type MappeRoh = { id: string; status: string; wunsch: string | null; eingereicht_am: string | null; einwilligung_am: string | null; einwilligung_fassung: string | null };
type DateiRoh = { id: string; fach: string; art: string; pfad: string; mime: string; bytes: number | null; dateiname: string | null; beschreibung: string | null; pruefung: unknown; erstellt_am: string };

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const ankauf = new URL(req.url).searchParams.get('ankauf');
    if (!istUuid(ankauf)) return KEIN(400, 'Ungültiger Ankauf.');
    const { data: m, error } = await supabase.from('kfz_mappe')
      .select('id, status, wunsch, eingereicht_am, einwilligung_am, einwilligung_fassung').eq('ankauf_id', ankauf).maybeSingle();
    if (error) return NextResponse.json({ mappe: null, fehlt: true }, { headers: { 'Cache-Control': 'no-store' } });
    const mappe = m as MappeRoh | null;
    if (!mappe) return NextResponse.json({ mappe: null }, { headers: { 'Cache-Control': 'no-store' } });
    const { data: d } = await supabase.from('kfz_mappe_datei')
      .select('id, fach, art, pfad, mime, bytes, dateiname, beschreibung, pruefung, erstellt_am')
      .eq('mappe_id', mappe.id).eq('status', 'fertig').order('erstellt_am', { ascending: true }).limit(100);
    const dateien = ((d as unknown) as DateiRoh[]) ?? [];
    const links: Record<string, string> = {};
    if (dateien.length) {
      const { data: s } = await createAdminClient().storage.from(MAPPE_BUCKET).createSignedUrls(dateien.map((x) => x.pfad), 3600);
      for (const z of ((s as unknown) as { path: string | null; signedUrl: string | null }[]) ?? []) if (z.path && z.signedUrl) links[z.path] = z.signedUrl;
    }
    return NextResponse.json({
      mappe,
      dateien: dateien.map((x) => ({
        id: x.id, fach: x.fach, art: x.art, mime: x.mime, bytes: x.bytes, dateiname: x.dateiname, beschreibung: x.beschreibung,
        pruefung: pruefungSauber(x.pruefung), erstellt_am: x.erstellt_am, url: links[x.pfad] ?? null,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('kfz/fahrzeugmappe GET:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Fahrzeugmappe konnte nicht geladen werden.');
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const ankauf = new URL(req.url).searchParams.get('ankauf');
    if (!istUuid(ankauf)) return KEIN(400, 'Ungültiger Ankauf.');
    const { data: m, error } = await supabase.from('kfz_mappe').select('id').eq('ankauf_id', ankauf).maybeSingle();
    if (error || !m) return NextResponse.json({ ok: true, geloescht: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    const mappeId = (m as { id: string }).id;
    const { data: d } = await supabase.from('kfz_mappe_datei').select('pfad').eq('mappe_id', mappeId).limit(200);
    const pfade = (((d as unknown) as { pfad: string }[]) ?? []).map((x) => x.pfad);
    // Erst prüfen, ob die Person löschen DARF (Regel p305_chef_delete) — sonst bleiben die Dateien liegen.
    const { data: weg, error: delErr } = await supabase.from('kfz_mappe').delete().eq('id', mappeId).select('id');
    if (delErr || !weg || (weg as unknown[]).length !== 1) return KEIN(403, 'Löschen darf nur die Geschäftsleitung.');
    if (pfade.length) {
      const { error: sErr } = await createAdminClient().storage.from(MAPPE_BUCKET).remove(pfade);
      if (sErr) console.error('kfz/fahrzeugmappe Dateien löschen:', sErr.message);
    }
    return NextResponse.json({ ok: true, geloescht: pfade.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('kfz/fahrzeugmappe DELETE:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Fahrzeugmappe konnte nicht gelöscht werden.');
  }
}
