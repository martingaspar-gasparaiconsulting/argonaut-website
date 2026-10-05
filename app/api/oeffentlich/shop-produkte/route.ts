// ============================================================================
// ARGONAUT OS · /api/oeffentlich/shop-produkte  (Webshop · Produkt-Baustein)
// ÖFFENTLICH (login-frei). Liefert die im Shop freigeschalteten Artikel des
// Seiten-Inhabers für den Produkt-Baustein auf der veröffentlichten Seite.
// Inhaber sicher über oeffentlich_id aus web_seiten (status=live) — NIE vom
// Client. artikel ist RLS-geschützt; hier über Service-Role, aber HART auf
// owner_user_id + im_shop=true gefiltert (fail-closed). Nur Schaufenster-Felder.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { oeffentlichBestellbar, shopMwst } from '@/lib/shopUebernahme';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

type ArtikelRow = {
  id: string; bezeichnung: string | null; verkaufspreis: number | null;
  einheit: string | null; kategorie: string | null;
  shop_beschreibung: string | null; shop_bild_url: string | null;
  aktueller_bestand: number | null;
  aktiv?: boolean | null;
  shop_mwst?: number | null;
};

// Paket 204: aktiv + shop_mwst mitlesen. Fehlt die Spalte shop_mwst noch
// (SQL p204 nicht gelaufen), ohne sie erneut lesen — der Shop bleibt sichtbar.
const FELDER = 'id, bezeichnung, verkaufspreis, einheit, kategorie, shop_beschreibung, shop_bild_url, aktueller_bestand, aktiv';

export async function GET(req: Request) {
  try {
    const seite = (new URL(req.url).searchParams.get('seite') || '').trim();
    if (!seite) return NextResponse.json({ produkte: [] });

    const db = admin();

    const { data: s } = await db
      .from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ produkte: [] });
    }

    const lies = (felder: string) => db
      .from('artikel')
      .select(felder)
      .eq('owner_user_id', inh.owner_user_id as string)
      .eq('im_shop', true)
      .order('shop_sortierung', { ascending: true, nullsFirst: false })
      .order('bezeichnung', { ascending: true })
      .limit(200);
    let antwort = await lies(FELDER + ', shop_mwst');
    if (antwort.error) antwort = await lies(FELDER);

    // Paket 204: nur aktive Artikel mit Preis über 0 (vorher auch 0,00 € und ausgelistete).
    const rows = ((antwort.data as unknown as ArtikelRow[]) ?? []).filter(oeffentlichBestellbar);
    const produkte = rows.map((r) => ({
      id: r.id,
      name: (r.bezeichnung || 'Produkt').toString(),
      preis: Number(r.verkaufspreis) || 0,
      einheit: (r.einheit || '').toString(),
      kategorie: (r.kategorie || '').toString(),
      beschreibung: (r.shop_beschreibung || '').toString().slice(0, 600),
      bild: (r.shop_bild_url || '').toString(),
      bestand: r.aktueller_bestand == null ? null : Number(r.aktueller_bestand),
      mwst: shopMwst(r.shop_mwst),
    }));

    return NextResponse.json({ produkte, anzahl: produkte.length });
  } catch (e: unknown) {
    console.error('oeffentlich/shop-produkte:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ produkte: [] });
  }
}
