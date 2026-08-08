// ============================================================================
// ARGONAUT OS · /api/oeffentlich/bewertungen  (Website-Bauer · Live-Bewertungen)
// ÖFFENTLICH (login-frei). Liefert die echten, freigegebenen Bewertungen des
// Seiten-Inhabers für den Live-Bewertungen-Baustein. Inhaber wird sicher über
// die oeffentlich_id aus web_seiten (nur status=live) bestimmt — NIE vom Client.
// Es gehen nur die minimal nötigen Felder nach außen (Name/Sterne/Text/Monat),
// keine E-Mail, kein Token. Service-Role umgeht RLS wie bei web-anfrage.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

// Nur Monat + Jahr nach außen (z. B. „März 2026") — kein exakter Tag nötig.
function monatJahr(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }); }
  catch { return ''; }
}

type BewRow = { kunde_name: string | null; sterne: number | null; text: string | null; abgegeben_am: string | null };

export async function GET(req: Request) {
  try {
    const seite = (new URL(req.url).searchParams.get('seite') || '').trim();
    if (!seite) return NextResponse.json({ bewertungen: [], schnitt: null, anzahl: 0 });

    const db = admin();

    // Seiten-Inhaber sicher bestimmen — nur veröffentlichte Seiten.
    const { data: s } = await db
      .from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ bewertungen: [], schnitt: null, anzahl: 0 });
    }

    const { data } = await db
      .from('bewertungsanfragen')
      .select('kunde_name, sterne, text, abgegeben_am')
      .eq('owner_user_id', inh.owner_user_id)
      .eq('status', 'abgegeben')
      .eq('veroeffentlicht', true)
      .order('abgegeben_am', { ascending: false })
      .limit(12);

    const rows = (data as BewRow[]) ?? [];
    const bewertungen = rows.map((r) => ({
      name: (r.kunde_name || 'Kunde').toString(),
      sterne: Math.max(0, Math.min(5, Number(r.sterne) || 0)),
      text: (r.text || '').toString().slice(0, 2000),
      datum: monatJahr(r.abgegeben_am),
    }));
    const mitStern = bewertungen.filter((b) => b.sterne > 0);
    const schnitt = mitStern.length ? mitStern.reduce((a, b) => a + b.sterne, 0) / mitStern.length : null;

    return NextResponse.json({ bewertungen, schnitt, anzahl: bewertungen.length });
  } catch (e: unknown) {
    console.error('oeffentlich/bewertungen:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ bewertungen: [], schnitt: null, anzahl: 0 });
  }
}
