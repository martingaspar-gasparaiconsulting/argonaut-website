// ============================================================================
// ARGONAUT OS · lib/vorbestellShopServer.ts — Paket 343 (12.10.2026)
// Server-Teil der Vorbestellung im Shop: Aktionen eines Betriebs mit Stand,
// Artikel und Etikett laden. Nur mit Service-Role-Client aufrufen und IMMER
// mit dem Betrieb der veröffentlichten Seite (nie vom Browser) — jede Abfrage
// ist hart auf owner_user_id gefiltert.
// Fehlt eine Tabelle oder Spalte (SQL p342/p343 offen), kommt eine leere Liste
// zurück: der Shop bleibt sichtbar, nur ohne Vorbestellung.
// ============================================================================

import { endkundenPreis, type PreisBasis } from './shopB2b';
import { leseZahl, leseZahlOder } from './zahlen';
import { shopMwst } from './shopUebernahme';
import { aktionStand, type AktionStand, type Posten } from './vorbestellAktion';
import {
  etikettZumArtikel, shopAktion, type EtikettZeile, type ShopAktion, type ShopAktionZeile, type ShopArtikel,
} from './vorbestellShop';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const AKTION_FELDER = 'id, titel, artikel_id, menge_gesamt, einheit, max_je_kunde, abhol_von, abhol_bis, bestell_schluss, status, im_shop';
const ARTIKEL_FELDER = 'id, bezeichnung, verkaufspreis, einheit, aktiv, shop_mwst, shop_beschreibung, shop_bild_url';
const ETIKETT_FELDER = 'id, artikel_id, status, art, bezeichnung, zutaten, allergene, spuren, nettomenge, mhd, aufbewahrung, verantwortlicher, energie_kj, energie_kcal, fett, gesaettigt, kohlenhydrate, zucker, eiweiss, salz, naehrwert_basis';

export type GeladeneAktion = {
  aktion: ShopAktionZeile; stand: AktionStand; posten: (Posten & { kunde_mail: string | null; kunde_tel: string | null })[];
  artikel: ShopArtikel | null; etikett: EtikettZeile | null; preis: number; mwst: number;
};

/**
 * Aktionen des Betriebs mit „im Shop zeigen“ und Status offen — nur eine, wenn
 * `nurId` gesetzt ist. Posten werden nur mit Menge/Status/Kontakt gelesen
 * (der Kontakt nur für die Höchstmenge je Kunde, er verlässt den Server nie).
 */
export async function ladeAktionen(db: Db, betrieb: string, heute: string, basis: PreisBasis, nurId?: string): Promise<GeladeneAktion[]> {
  try {
    let q = db.from('vorbestell_aktion').select(AKTION_FELDER)
      .eq('owner_user_id', betrieb).eq('im_shop', true).eq('status', 'offen');
    if (nurId) q = q.eq('id', nurId);
    const { data: az, error: aFehler } = await q.order('abhol_von', { ascending: true }).limit(nurId ? 1 : 30);
    if (aFehler || !az?.length) return [];
    const aktionen = (az as ShopAktionZeile[]).map((a) => ({ ...a, menge_gesamt: leseZahlOder(a.menge_gesamt, 0), max_je_kunde: leseZahl(a.max_je_kunde) }));
    const ids = aktionen.map((a) => a.id);
    const artIds = [...new Set(aktionen.map((a) => a.artikel_id).filter((x): x is string => !!x))];
    const [pz, arz, ez] = await Promise.all([
      db.from('vorbestell_posten').select('aktion_id, menge, status, kunde_mail, kunde_tel')
        .eq('owner_user_id', betrieb).in('aktion_id', ids).limit(20000),
      artIds.length ? db.from('artikel').select(ARTIKEL_FELDER).eq('owner_user_id', betrieb).in('id', artIds).limit(200) : Promise.resolve({ data: [], error: null }),
      artIds.length ? db.from('etikett_produkt').select(ETIKETT_FELDER).eq('owner_user_id', betrieb).in('artikel_id', artIds).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    if (pz.error) return []; // ohne Posten keine sichere Restmenge -> nichts zeigen
    const postenJe: Record<string, GeladeneAktion['posten']> = {};
    for (const p of (pz.data as (Posten & { aktion_id: string; kunde_mail: string | null; kunde_tel: string | null })[]) ?? []) {
      (postenJe[p.aktion_id] ??= []).push({ ...p, menge: leseZahlOder(p.menge, 0), kunde_name: '', abhol_tag: '' });
    }
    const artikel = arz.error ? [] : ((arz.data as ShopArtikel[]) ?? []);
    const etiketten = ez.error ? [] : ((ez.data as EtikettZeile[]) ?? []);
    return aktionen.map((a) => {
      const ps = postenJe[a.id] ?? [];
      const art = artikel.find((x) => x.id === a.artikel_id) ?? null;
      const mwst = shopMwst(art?.shop_mwst);
      return {
        aktion: a, stand: aktionStand(a, ps, heute), posten: ps, artikel: art,
        etikett: etikettZumArtikel(etiketten, a.artikel_id),
        preis: art ? endkundenPreis(art.verkaufspreis, art.shop_mwst, basis) : 0, mwst,
      };
    });
  } catch (e) {
    console.error('vorbestellShop laden:', e instanceof Error ? e.message : 'unbekannt');
    return [];
  }
}

/** Öffentliche Ansicht aller zeigbaren Aktionen (Positivliste aus lib/vorbestellShop). */
export function fuerSchaufenster(liste: GeladeneAktion[]): ShopAktion[] {
  const aus: ShopAktion[] = [];
  for (const g of liste) {
    const s = shopAktion(g.aktion, g.stand, g.artikel, g.etikett, g.preis, g.mwst);
    if (s) aus.push(s);
  }
  return aus;
}
