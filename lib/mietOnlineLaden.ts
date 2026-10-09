// ============================================================================
// ARGONAUT OS · lib/mietOnlineLaden.ts — Paket 294 · V2b Online-Anfrage
//
// NUR SERVERSEITIG (Seite app/mieten und die Tür /api/oeffentlich/miet-anfrage).
// Liest mit der Service-Rolle, weil Besucher nicht angemeldet sind. Deshalb:
// - Betrieb AUSSCHLIESSLICH über die Kennung aus modul_einstellung (Chef
//   schaltet die Online-Anfrage ein) — nie aus der Anfrage übernommen.
// - Jede Abfrage hängt an owner_user_id = dieser Betrieb.
// - Aus miet_fahrzeug nur FLOTTE_OEFFENTLICH, gefiltert durch oeffentlich().
// - Buchungen nur als Zeiträume (für „frei / vergeben"), nie mit Mieter.
// ============================================================================

import { boerseDb, type BoerseDb } from './kfzBoerseLaden';
import { MIET_ONLINE_MODUL, FLOTTE_OEFFENTLICH, einstellungLesen, kennungGueltig, oeffentlich, type MietOnlineEinstellung, type MietFahrzeugOeffentlich } from './mietOnline';
import type { BuchungKurz } from './fahrzeugMiete';

export { boerseDb as mietDb, firmaZu, basisAdresse } from './kfzBoerseLaden';

/** Betrieb zur Kennung — nur, wenn die Online-Anfrage eingeschaltet ist. Doppelte Kennung → nie raten. */
export async function betriebZuMietKennung(db: BoerseDb, k: string): Promise<{ betrieb: string; einst: MietOnlineEinstellung } | null> {
  if (!kennungGueltig(k)) return null;
  const { data } = await db.from('modul_einstellung').select('owner_user_id, einstellung')
    .eq('modul', MIET_ONLINE_MODUL).eq('einstellung->>kennung', k).limit(2);
  const rows = ((data as unknown) as { owner_user_id: string; einstellung: unknown }[]) ?? [];
  if (rows.length !== 1) return null;
  const einst = einstellungLesen(rows[0].einstellung);
  return einst.aktiv && einst.kennung === k ? { betrieb: rows[0].owner_user_id, einst } : null;
}

/** Aktive Mietflotte (Positivliste). */
export async function oeffentlicheFlotte(db: BoerseDb, betrieb: string): Promise<MietFahrzeugOeffentlich[]> {
  const { data } = await db.from('miet_fahrzeug').select(FLOTTE_OEFFENTLICH).eq('owner_user_id', betrieb).eq('aktiv', true).order('bezeichnung').limit(300);
  return (((data as unknown) as unknown[]) ?? []).map(oeffentlich).filter((x): x is MietFahrzeugOeffentlich => x !== null);
}

/** Belegte Zeiträume eines Fahrzeugs (nur reserviert/unterwegs, ohne Mieter) — für die Frei-Prüfung. */
export async function belegteZeiten(db: BoerseDb, betrieb: string, fahrzeugId: string): Promise<BuchungKurz[]> {
  const { data } = await db.from('miet_buchung').select('id, fahrzeug_id, abholung, rueckgabe_plan, status')
    .eq('owner_user_id', betrieb).eq('fahrzeug_id', fahrzeugId).in('status', ['reserviert', 'uebergeben']).limit(1000);
  return ((data as unknown) as BuchungKurz[]) ?? [];
}

/** Ist der Betrieb Kleinunternehmer (§ 19 UStG)? Dann sind die Netto-Preise die Endpreise. */
export async function istKleinunternehmer(db: BoerseDb, betrieb: string): Promise<boolean> {
  const { data } = await db.from('profiles').select('kleinunternehmer').eq('id', betrieb).maybeSingle();
  return (data as { kleinunternehmer?: unknown } | null)?.kleinunternehmer === true;
}
