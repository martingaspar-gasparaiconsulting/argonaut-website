// ============================================================================
// ARGONAUT OS · lib/shopB2bServer.ts — Paket 317 (11.10.2026) · S3a
// Server-Teil des Geschäftskunden-Shops: Kunde aus dem Link-Token finden,
// Preisliste und Preis-Basis laden. Nur mit Service-Role-Client aufrufen und
// IMMER mit dem Betrieb der veröffentlichten Seite (nie vom Browser).
// ============================================================================

import { createHash } from 'node:crypto';
import { SHOP_B2B_MODUL, besuchMerken, preisBasis, tokenGueltig, type PreisBasis, type Preisliste } from './shopB2b';
import { nurGewerbeAktiv } from './shopGewerbe';
import { startFreiServer } from './freigabeServer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type ShopKundeServer = {
  id: string; kontakt_id: string; preisliste_id: string | null; auf_rechnung: boolean;
  zahlungsziel_tage: number; kreditrahmen_cent: number | null; zuletzt_da_am: string | null;
  name: string; liste: Preisliste | null;
  /** Paket 327: Gewerbe geprüft (false, solange SQL p327 fehlt). */
  nachweis_ok: boolean;
};

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Token aus Kopfzeile „x-shop-konto" oder Feld `konto`. */
export function tokenAus(req: Request, feld?: unknown): string | null {
  const t = (req.headers.get('x-shop-konto') || (typeof feld === 'string' ? feld : '') || '').trim();
  return tokenGueltig(t) ? t : null;
}

export async function ladePreisBasis(db: Db, betrieb: string): Promise<PreisBasis> {
  try {
    const { data } = await db.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', SHOP_B2B_MODUL).maybeSingle();
    return preisBasis((data as { einstellung?: { preisbasis?: unknown } } | null)?.einstellung?.preisbasis);
  } catch { return 'brutto'; }
}

/**
 * Paket 327 (S3b): Verkauft der Shop nur an geprüfte Geschäftskunden?
 * Nur mit Einstellung des Betriebs UND Start-Freigabe „gewerbeNachweis" (R49).
 * Fehler beim Lesen bei eingeschaltetem Start-Schalter: lieber sperren (fail-closed).
 */
export async function ladeNurGewerbe(db: Db, betrieb: string, freiVorgabe?: boolean): Promise<boolean> {
  // Paket 346: wirksamer Stand = Code ODER Freigabe-Zentrale (Fehler = gesperrt)
  const frei = freiVorgabe ?? (await startFreiServer('gewerbeNachweis'));
  if (!frei) return false;
  try {
    const { data, error } = await db.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', SHOP_B2B_MODUL).maybeSingle();
    if (error) return true;
    return nurGewerbeAktiv((data as { einstellung?: unknown } | null)?.einstellung, frei);
  } catch { return true; }
}

/**
 * Geschäftskunden zum Token laden — nur aktiv und nur beim Betrieb der Seite.
 * null = kein gültiger Kunde (Link falsch, gesperrt, pausiert oder SQL p316 fehlt).
 */
export async function kundeAusToken(db: Db, betrieb: string, token: string | null, artikelIds?: string[]): Promise<ShopKundeServer | null> {
  if (!token) return null;
  try {
    // Paket 327: nachweis_ok mitlesen; fehlt die Spalte (SQL p327 offen), ohne sie — der B2B-Shop läuft weiter.
    const lies = (felder: string) => db.from('shop_kunde').select(felder)
      .eq('owner_user_id', betrieb).eq('token_hash', tokenHash(token)).maybeSingle();
    const basisFelder = 'id, kontakt_id, preisliste_id, auf_rechnung, zahlungsziel_tage, kreditrahmen_cent, zuletzt_da_am, aktiv';
    let antwort = await lies(basisFelder + ', nachweis_ok');
    if (antwort.error) antwort = await lies(basisFelder);
    const { data, error } = antwort;
    const k = data as (Omit<ShopKundeServer, 'name' | 'liste' | 'nachweis_ok'> & { aktiv: boolean; nachweis_ok?: boolean | null }) | null;
    if (error || !k || !k.aktiv) return null;

    const { data: kt } = await db.from('kontakte').select('firma, vorname, nachname').eq('id', k.kontakt_id).eq('owner_user_id', betrieb).maybeSingle();
    const ko = kt as { firma?: string | null; vorname?: string | null; nachname?: string | null } | null;
    const name = (String(ko?.firma ?? '').trim() || [ko?.vorname, ko?.nachname].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ') || 'Ihr Firmenkonto').slice(0, 120);

    let liste: Preisliste | null = null;
    if (k.preisliste_id) {
      const { data: l } = await db.from('shop_preisliste').select('id, name, rabatt_prozent').eq('id', k.preisliste_id).eq('owner_user_id', betrieb).maybeSingle();
      if (l) {
        let q = db.from('shop_preis').select('artikel_id, ab_menge, netto_cent').eq('preisliste_id', k.preisliste_id).eq('owner_user_id', betrieb);
        if (artikelIds && artikelIds.length) q = q.in('artikel_id', artikelIds.slice(0, 500));
        const { data: p } = await q.limit(5000);
        const li = l as { id: string; name: string; rabatt_prozent: number };
        liste = { id: li.id, name: li.name, rabatt_prozent: Number(li.rabatt_prozent) || 0, preise: (p as Preisliste['preise']) ?? [] };
      }
    }

    if (besuchMerken(k.zuletzt_da_am, Date.now())) {
      await db.from('shop_kunde').update({ zuletzt_da_am: new Date().toISOString() }).eq('id', k.id).eq('owner_user_id', betrieb);
    }
    return {
      id: k.id, kontakt_id: k.kontakt_id, preisliste_id: k.preisliste_id, auf_rechnung: !!k.auf_rechnung,
      zahlungsziel_tage: Number(k.zahlungsziel_tage) || 0, kreditrahmen_cent: k.kreditrahmen_cent == null ? null : Number(k.kreditrahmen_cent),
      zuletzt_da_am: k.zuletzt_da_am, name, liste, nachweis_ok: k.nachweis_ok === true,
    };
  } catch {
    return null;
  }
}
