import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { drossel, drosselIp } from '@/lib/drossel';
import { istUuid } from '@/lib/partnerNetzwerk';
import { tokenGueltig } from '@/lib/partnerRechnung';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/partner-gast/bild — Paket 279 · K18b Gast-Link
// ÖFFENTLICH, SCHUTZ: TOKEN, NUR LESEN. Fotos für den Gast: Eintrags-Foto
// (?t=&e=&i=) oder freigegebenes Fahrzeugfoto (?t=&m=). Die Datenbank
// (p279_gast_bild_pfad, nur Dienst-Rolle) prüft Link, Ablauf, Sperre, laufenden
// Auftrag und Freigabe; dann signierter Link (5 Minuten).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NICHT_DA = () => new NextResponse('Nicht gefunden', { status: 404, headers: { 'Cache-Control': 'no-store' } });
const ERLAUBT = new Set(['partner-ablage', 'fahrzeug-medien']);

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const t = u.searchParams.get('t') || '';
    const e = (u.searchParams.get('e') || '').trim();
    const m = (u.searchParams.get('m') || '').trim();
    const i = Number(u.searchParams.get('i') || '');
    if (!tokenGueltig(t)) return NICHT_DA();
    if (!(istUuid(m) || (istUuid(e) && Number.isInteger(i) && i >= 1 && i <= 10))) return NICHT_DA();
    const db = createAdminClient();
    if (await drossel(db, 'oeffentlich/partner-gast/bild', { ip: drosselIp(req.headers), ziel: t })) return new NextResponse('Zu viele Anfragen', { status: 429 });
    const { data } = await db.rpc('p279_gast_bild_pfad', {
      p_hash: createHash('sha256').update(t).digest('hex'),
      p_eintrag: istUuid(m) ? null : e, p_nr: istUuid(m) ? null : i, p_medium: istUuid(m) ? m : null,
    });
    const b = data as { bucket?: string; pfad?: string } | null;
    if (!b?.bucket || !b?.pfad || !ERLAUBT.has(b.bucket)) return NICHT_DA();
    const { data: sig } = await db.storage.from(b.bucket).createSignedUrl(b.pfad, 300);
    if (!sig?.signedUrl) return NICHT_DA();
    return NextResponse.redirect(sig.signedUrl, { status: 302, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (err) {
    console.error('partner-gast/bild:', err instanceof Error ? err.message : 'unbekannt');
    return NICHT_DA();
  }
}
