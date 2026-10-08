import { NextResponse } from 'next/server';
import { MEDIEN_BUCKET } from '@/lib/kfzMedien';
import { idGueltig, kennungGueltig, sichtbar } from '@/lib/kfzBoerse';
import { betriebZuKennung, boerseDb } from '@/lib/kfzBoerseLaden';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/kfz-boerse-bild — Paket 272 · K11a Fahrzeugbörse
// ÖFFENTLICH, NUR LESEN. Liefert ein Foto eines öffentlich inserierten
// Fahrzeugs: GET ?k=<kennung>&m=<medien-id> -> Weiterleitung auf einen
// signierten Link (1 Stunde gültig) im privaten Speicherordner.
// Geprüft wird bei JEDEM Abruf: Börse eingeschaltet (Kennung), Foto gehört
// diesem Betrieb, ist ein Foto (kein Video), Fahrzeug ist inseriert und im
// Bestand/Zulauf/Aufbereitung. Sonst 404 — ohne Auskunft, warum.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NICHT_DA = () => new NextResponse('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const k = (u.searchParams.get('k') || '').trim();
    const m = (u.searchParams.get('m') || '').trim();
    if (!kennungGueltig(k) || !idGueltig(m)) return NICHT_DA();
    const db = boerseDb();
    const b = await betriebZuKennung(db, k);
    if (!b) return NICHT_DA();
    const { data: med } = await db.from('kfz_bestand_medien').select('pfad, art, bestand_id')
      .eq('owner_user_id', b.betrieb).eq('id', m).maybeSingle();
    const medium = med as { pfad: string; art: string; bestand_id: string } | null;
    if (!medium || medium.art !== 'foto' || !medium.pfad.startsWith(`${b.betrieb}/`)) return NICHT_DA();
    const { data: fz } = await db.from('kfz_bestand').select('status, inseriert')
      .eq('owner_user_id', b.betrieb).eq('id', medium.bestand_id).maybeSingle();
    if (!fz || !sichtbar(fz as { status: unknown; inseriert: unknown })) return NICHT_DA();
    const { data: sig } = await db.storage.from(MEDIEN_BUCKET).createSignedUrl(medium.pfad, 3600);
    if (!sig?.signedUrl) return NICHT_DA();
    return NextResponse.redirect(sig.signedUrl, { status: 302, headers: { 'Cache-Control': 'public, max-age=900' } });
  } catch (e) {
    console.error('kfz-boerse-bild Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NICHT_DA();
  }
}
