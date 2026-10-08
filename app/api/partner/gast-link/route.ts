import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { istUuid } from '@/lib/partnerNetzwerk';
import { gastTageLesen } from '@/lib/partnerRechnung';

// ============================================================================
// ARGONAUT OS · /api/partner/gast-link — Paket 279 · K18b Gast-Link
//
// NUR MIT LOGIN. Erzeugt für einen Gast-Auftrag (Partner ohne ARGONAUT) einen
// neuen Link: 24 Zufallsbytes, in der Datenbank steht NUR der SHA-256-Prüfwert
// (rpc p279_gast_link prüft Besitzer, Schreibrecht „Kfz", Gast-Auftrag, Laufzeit
// 1–60 Tage). Der Link wird genau einmal angezeigt; ein neuer Link macht den
// alten ungültig.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auftrag = String(body?.auftrag || '').trim();
    if (!istUuid(auftrag)) return NextResponse.json({ error: 'Kein gültiger Auftrag.' }, { status: 400 });
    const tage = gastTageLesen(body?.tage);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const token = randomBytes(24).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const { data, error } = await supabase.rpc('p279_gast_link', { p_auftrag: auftrag, p_hash: hash, p_tage: tage });
    if (error) return NextResponse.json({ error: String(error.message || 'Link konnte nicht erstellt werden.').slice(0, 300) }, { status: 400 });
    const basis = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/+$/, '');
    return NextResponse.json({ link: `${basis}/partner-gast/${token}`, bis: (data as { bis?: string } | null)?.bis ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('gast-link Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Link konnte nicht erstellt werden.' }, { status: 500 });
  }
}
