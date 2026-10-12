// ============================================================================
// ARGONAUT OS · /api/oeffentlich/shop-produkte  (Webshop · Produkt-Baustein)
// ÖFFENTLICH (login-frei). Liefert die im Shop freigeschalteten Artikel des
// Seiten-Inhabers für den Produkt-Baustein auf der veröffentlichten Seite.
// Inhaber sicher über oeffentlich_id aus web_seiten (status=live) — NIE vom
// Client. artikel ist RLS-geschützt; hier über Service-Role, aber HART auf
// owner_user_id + im_shop=true gefiltert (fail-closed). Nur Schaufenster-Felder.
//
// Paket 324 (S4): ?sprache=<code>&hl=<Browser-Sprachen>. Angeboten wird nur, was
// die Geschäftsleitung eingeschaltet hat (shop_sprache); Produkt-Texte nur
// freigegeben und passend zum aktuellen Deutsch (Prüfsumme), sonst Deutsch.
// Preise bleiben unberührt — die Sprache ändert nur Texte und Zahlformat.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { oeffentlichBestellbar, shopMwst } from '@/lib/shopUebernahme';
import { shopDokumente, type Dok } from '@/lib/produktDokumente';
import { basisNettoCent, endkundenPreis, euro, mengenRegel, schaufensterStaffeln } from '@/lib/shopB2b';
import { kundeAusToken, ladePreisBasis, tokenAus } from '@/lib/shopB2bServer';
import { spracheFuer } from '@/lib/mehrsprachig';
import {
  TEXT_DE, angeboteneSprachen, oberflaecheFuer, produktText, waehleSprache,
  type SpracheZeile, type UebersetzungZeile,
} from '@/lib/shopSprachen';

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
  shop_gebinde?: number | null;
  shop_mindestmenge?: number | null;
};

// Paket 204: aktiv + shop_mwst mitlesen. Fehlt die Spalte shop_mwst noch
// (SQL p204 nicht gelaufen), ohne sie erneut lesen — der Shop bleibt sichtbar.
const FELDER = 'id, bezeichnung, verkaufspreis, einheit, kategorie, shop_beschreibung, shop_bild_url, aktueller_bestand, aktiv';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seite = (url.searchParams.get('seite') || '').trim();
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
    // Paket 316: Gebinde und Mindestmenge mitlesen; fehlen die Spalten (SQL p316 offen), ohne sie.
    let antwort = await lies(FELDER + ', shop_mwst, shop_gebinde, shop_mindestmenge');
    if (antwort.error) antwort = await lies(FELDER + ', shop_mwst');
    if (antwort.error) antwort = await lies(FELDER);

    // Paket 204: nur aktive Artikel mit Preis über 0 (vorher auch 0,00 € und ausgelistete).
    const rows = ((antwort.data as unknown as ArtikelRow[]) ?? []).filter(oeffentlichBestellbar);

    // Paket 315 (S1): Produkt-Dokumente zum Herunterladen — nur „im Shop", aktuell, nicht abgelaufen.
    // Fehlt die Tabelle noch (SQL p315 nicht gelaufen), bleibt der Shop ohne Dokumente sichtbar.
    const dokJe: Record<string, Dok[]> = {};
    if (rows.length) {
      const { data: doks, error: dokFehler } = await db.from('produkt_dokument')
        .select('id, artikel_id, art, titel, sprache, version, gueltig_bis, im_shop, aktuell')
        .eq('owner_user_id', inh.owner_user_id as string)
        .eq('im_shop', true).eq('aktuell', true)
        .in('artikel_id', rows.map((r) => r.id))
        .limit(1000);
      if (!dokFehler) for (const d of (doks as Dok[]) ?? []) (dokJe[String(d.artikel_id)] ??= []).push(d);
    }
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

    // Paket 324 (S4): Sprache des Besuchers. Fehlt die Tabelle (SQL p323 offen), bleibt alles Deutsch.
    let sprachZeilen: SpracheZeile[] = [];
    {
      const { data: sz, error: szFehler } = await db.from('shop_sprache')
        .select('sprache, aktiv, texte, status').eq('owner_user_id', inh.owner_user_id as string).limit(50);
      if (!szFehler) sprachZeilen = (sz as SpracheZeile[]) ?? [];
    }
    const angeboten = angeboteneSprachen(sprachZeilen);
    const hl = (url.searchParams.get('hl') || req.headers.get('accept-language') || '').slice(0, 300);
    const sprache = waehleSprache(url.searchParams.get('sprache'), hl, angeboten);
    const texte = oberflaecheFuer(sprache, sprachZeilen.find((z) => z.sprache === sprache)) ?? { ...TEXT_DE };
    const ueJe: Record<string, UebersetzungZeile> = {};
    if (sprache !== 'de' && rows.length) {
      const { data: ue, error: ueFehler } = await db.from('shop_uebersetzung')
        .select('artikel_id, sprache, name, beschreibung, quelle_hash, status')
        .eq('owner_user_id', inh.owner_user_id as string).eq('sprache', sprache).eq('status', 'freigegeben')
        .in('artikel_id', rows.map((r) => r.id)).limit(1000);
      if (!ueFehler) for (const u of (ue as UebersetzungZeile[]) ?? []) ueJe[String(u.artikel_id)] = u;
    }
    const info = spracheFuer(sprache)!;

    // Paket 317 (S3a): Preis-Basis des Betriebs und Geschäftskunde aus dem Link (Kopfzeile x-shop-konto).
    const betrieb = inh.owner_user_id as string;
    const basis = await ladePreisBasis(db, betrieb);
    const token = tokenAus(req);
    const kunde = token ? await kundeAusToken(db, betrieb, token, rows.map((r) => r.id)) : null;

    const produkte = rows.map((r) => ({
      id: r.id,
      ...text(r),
      preis: endkundenPreis(r.verkaufspreis, r.shop_mwst, basis),
      ...gewerbe(r),
      einheit: (r.einheit || '').toString(),
      kategorie: (r.kategorie || '').toString(),
      bild: (r.shop_bild_url || '').toString(),
      bestand: r.aktueller_bestand == null ? null : Number(r.aktueller_bestand),
      mwst: shopMwst(r.shop_mwst),
      dokumente: shopDokumente(dokJe[r.id] ?? [], heute, sprache),
    }));

    return NextResponse.json({
      produkte,
      anzahl: produkte.length,
      sprache,
      bcp: info.bcp,
      rtl: !!info.rtl,
      sprachen: angeboten.map((c) => { const s = spracheFuer(c)!; return { code: s.code, name: s.eigen, rtl: !!s.rtl }; }),
      texte,
      ...(kunde ? { konto: { name: kunde.name, netto: true, auf_rechnung: kunde.auf_rechnung, zahlungsziel: kunde.zahlungsziel_tage } } : {}),
      ...(token && !kunde ? { konto_ungueltig: true } : {}),
    }, { headers: { 'Cache-Control': 'no-store' } });

    /** Paket 324: Name und Beschreibung — freigegebene, aktuelle Übersetzung oder vollständig Deutsch. */
    function text(r: ArtikelRow) {
      const t = produktText({ name: r.bezeichnung, beschreibung: r.shop_beschreibung }, ueJe[r.id]);
      return {
        name: t.name || 'Produkt',
        beschreibung: t.beschreibung.slice(0, t.uebersetzt ? 900 : 600),
        ...(t.uebersetzt ? { uebersetzt: true } : {}),
      };
    }

    /** Gebinde, Mindestmenge und — nur für den Geschäftskunden — Netto-Preis mit Staffeln. */
    function gewerbe(r: ArtikelRow) {
      const regel = mengenRegel(r.shop_gebinde, r.shop_mindestmenge);
      if (!kunde) return { gebinde: regel.gebinde, mindest: regel.mindest };
      const satz = shopMwst(r.shop_mwst);
      const st = schaufensterStaffeln(r.id, basisNettoCent(r.verkaufspreis, satz, basis), regel.mindest, kunde.liste);
      return {
        gebinde: regel.gebinde,
        mindest: regel.mindest,
        preis_netto: st.length ? euro(st[0].netto_cent) : null,
        staffeln: st.map((x) => ({ ab: x.ab, netto: euro(x.netto_cent) })),
      };
    }
  } catch (e: unknown) {
    console.error('oeffentlich/shop-produkte:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ produkte: [] });
  }
}
