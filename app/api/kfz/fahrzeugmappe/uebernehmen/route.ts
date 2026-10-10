import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { MAPPE_BUCKET, istUuid } from '@/lib/fahrzeugMappe';
import { MEDIEN_BUCKET } from '@/lib/kfzMedien';
import { ergebnisText, mappeIdAusPfad, schabloneOhneDoppel, standardAuswahl, uebernahmePlan, type MappeDateiKurz } from '@/lib/fahrzeugMappeBestand';

// ============================================================================
// ARGONAUT OS · /api/kfz/fahrzeugmappe/uebernehmen — Paket 307 · FM3
//
// NUR MIT LOGIN. Kopiert Fotos (und auf Wunsch Schäden/Videos) aus der
// Fahrzeugmappe eines Ankaufs in die Medien des Bestandsfahrzeugs.
//   POST { ankauf, ids? }  ids fehlt -> Standard-Auswahl (alle Fahrzeugfotos)
// Ankauf, Mappe, Dateien und vorhandene Medien liest der Server mit dem Login
// der Person (die Datenbank entscheidet, wer sehen darf). Kopiert wird mit der
// Dienst-Rolle (Mappen-Ordner hat keine Nutzer-Regeln); die Medien-Einträge
// schreibt wieder der Login — fehlt das Schreibrecht „KFZ", werden die Kopien
// sofort wieder entfernt. Fahrzeugschein, Unterlagen und Videobotschaft gehen nie
// mit (lib/fahrzeugMappeBestand). Mehrfach aufrufen ist ungefährlich.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || !istUuid(b.ankauf)) return KEIN(400, 'Ungültiger Ankauf.');

    const { data: an } = await supabase.from('kfz_ankauf').select('id, owner_user_id, bestand_id').eq('id', b.ankauf).maybeSingle();
    const ankauf = an as { id: string; owner_user_id: string; bestand_id: string | null } | null;
    if (!ankauf) return KEIN(404, 'Ankauf nicht gefunden.');
    if (!ankauf.bestand_id) return KEIN(409, 'Das Fahrzeug ist noch nicht im Bestand. Bitte zuerst ankaufen.');

    const { data: m } = await supabase.from('kfz_mappe').select('id, owner_user_id').eq('ankauf_id', ankauf.id).maybeSingle();
    const mappe = m as { id: string; owner_user_id: string } | null;
    if (!mappe || mappe.owner_user_id !== ankauf.owner_user_id) return KEIN(404, 'Zu diesem Ankauf gibt es keine Fahrzeugmappe.');

    const [{ data: d }, { data: med }] = await Promise.all([
      supabase.from('kfz_mappe_datei').select('id, fach, mime, pfad, bytes, erstellt_am').eq('mappe_id', mappe.id).eq('status', 'fertig').limit(100),
      supabase.from('kfz_bestand_medien').select('pfad, schablone, position').eq('bestand_id', ankauf.bestand_id).limit(500),
    ]);
    const dateien = ((d as unknown) as MappeDateiKurz[]) ?? [];
    const medien = ((med as unknown) as { pfad: string; schablone: string | null; position: number }[]) ?? [];
    const auswahl = Array.isArray(b.ids) ? (b.ids as unknown[]).filter(istUuid) : standardAuswahl(dateien);
    const plan = uebernahmePlan({
      betrieb: ankauf.owner_user_id, mappe: mappe.id, bestand: ankauf.bestand_id, dateien, auswahl,
      schonDa: medien.map((x) => mappeIdAusPfad(x.pfad)).filter((x): x is string => !!x),
      startPosition: medien.reduce((mx, x) => Math.max(mx, Number(x.position) || 0), 0),
    });
    const schritte = schabloneOhneDoppel(plan.schritte, medien.map((x) => x.schablone).filter((x): x is string => !!x));
    if (!schritte.length) return NextResponse.json({ ok: true, fotos: 0, videos: 0, text: ergebnisText(0, 0) }, { headers: { 'Cache-Control': 'no-store' } });

    // Kopieren (Dienst-Rolle) — schon vorhandene Ziel-Dateien (früherer Abbruch) zählen als kopiert.
    const admin = createAdminClient();
    const kopiert: typeof schritte = [];
    for (const s of schritte) {
      const { error } = await admin.storage.from(MAPPE_BUCKET).copy(s.von, s.nach, { destinationBucket: MEDIEN_BUCKET });
      if (!error || /exist|duplicate/i.test(error.message)) kopiert.push(s);
      else console.error('fahrzeugmappe/uebernehmen Kopie:', error.message);
    }
    if (!kopiert.length) return KEIN(500, 'Die Dateien konnten gerade nicht kopiert werden. Bitte später noch einmal versuchen.');

    // Einträge mit dem Login — die Regeln der Datenbank prüfen das Schreibrecht.
    const { error: insErr } = await supabase.from('kfz_bestand_medien').insert(kopiert.map((s) => ({
      owner_user_id: ankauf.owner_user_id, bestand_id: ankauf.bestand_id, art: s.art, pfad: s.nach, schablone: s.schablone,
      position: s.position, dateiname: 'Fahrzeugmappe', bytes: s.bytes,
    })));
    if (insErr) {
      await admin.storage.from(MEDIEN_BUCKET).remove(kopiert.map((s) => s.nach));
      return KEIN(403, 'Übernehmen darf, wer das Schreibrecht für „KFZ" hat.');
    }
    const fotos = kopiert.filter((s) => s.art === 'foto').length;
    const videos = kopiert.length - fotos;
    return NextResponse.json({ ok: true, fotos, videos, fehlgeschlagen: schritte.length - kopiert.length, text: ergebnisText(fotos, videos) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('kfz/fahrzeugmappe/uebernehmen:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Die Fotos konnten nicht übernommen werden.');
  }
}
