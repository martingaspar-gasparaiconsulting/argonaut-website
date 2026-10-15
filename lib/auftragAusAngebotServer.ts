// ============================================================================
// ARGONAUT OS · lib/auftragAusAngebotServer.ts — HW-10 (15.10.2026)
//
// Legt aus einem ANGENOMMENEN Angebot einen Auftrag an. Genutzt von
//   - /api/auftrag-aus-angebot (Knopf „→ Auftrag" auf der Angebotsseite)
//   - /api/oeffentlich/angebot (Kunde nimmt per Link an -> Auftrag entsteht sofort)
// Doppel-Schutz: hat das Angebot schon einen Auftrag (angebote.auftrag_id), wird
// dieser zurueckgegeben. Scheitern die Positionen, wird der Auftrag wieder
// entfernt (er war noch nirgends verwendet).
// Spalten angebote.auftrag_id / auftraege.angebot_id: SQL p373.
// ============================================================================

import { angebotZuAuftrag } from './angebotZuAuftrag';

type Db = any; // Supabase-Client (Nutzer oder Service) — beide haben dieselbe API

export type AuftragAusAngebotErgebnis =
  | { ok: true; auftragId: string; bereitsVorhanden: boolean }
  | { ok: false; fehler: string; code: number };

export async function auftragAusAngebot(
  db: Db,
  angebotId: string,
  opt: { betrieb: string; standortId?: string | null },
): Promise<AuftragAusAngebotErgebnis> {
  const { data: ang, error: aErr } = await db.from('angebote')
    .select('id, owner_user_id, titel, kunde_name, kontakt_id, status, auftrag_id, standort_id, angenommen_am')
    .eq('id', angebotId).eq('owner_user_id', opt.betrieb).maybeSingle();
  if (aErr) return { ok: false, fehler: 'Angebot konnte nicht geladen werden.', code: 500 };
  if (!ang) return { ok: false, fehler: 'Angebot nicht gefunden.', code: 404 };

  if (ang.auftrag_id) {
    const { data: vorhanden } = await db.from('auftraege').select('id').eq('id', ang.auftrag_id).maybeSingle();
    if (vorhanden?.id) return { ok: true, auftragId: vorhanden.id, bereitsVorhanden: true };
  }
  if (ang.status !== 'angenommen') {
    return { ok: false, fehler: 'Nur angenommene Angebote werden zum Auftrag.', code: 400 };
  }

  const { data: posRaw, error: pErr } = await db.from('angebot_positionen')
    .select('bezeichnung, menge, einheit, einzelpreis, mwst_satz, rabatt_prozent')
    .eq('angebot_id', angebotId).order('position', { ascending: true });
  if (pErr) return { ok: false, fehler: 'Angebotspositionen konnten nicht geladen werden.', code: 500 };
  if (!posRaw || posRaw.length === 0) return { ok: false, fehler: 'Das Angebot hat keine Positionen.', code: 400 };

  const { posten, summen } = angebotZuAuftrag(posRaw);
  const datum = String(ang.angenommen_am || new Date().toISOString()).slice(0, 10);

  const { data: auftrag, error: insErr } = await db.from('auftraege').insert({
    owner_user_id: opt.betrieb,
    standort_id: ang.standort_id ?? opt.standortId ?? null,
    titel: ang.titel || 'Auftrag aus Angebot',
    status: 'beauftragt',
    auftragsdatum: datum,
    kontakt_id: ang.kontakt_id ?? null,
    angebot_id: ang.id,
    waehrung: 'EUR',
    notizen: ang.kunde_name ? `Kunde laut Angebot: ${ang.kunde_name}` : null,
    netto_summe: summen.netto,
    mwst_summe: summen.mwst,
    brutto_summe: summen.brutto,
  }).select('id').single();
  if (insErr || !auftrag) return { ok: false, fehler: 'Auftrag konnte nicht angelegt werden: ' + (insErr?.message || 'unbekannt'), code: 500 };

  const { error: posErr } = await db.from('auftrag_positionen')
    .insert(posten.map((p) => ({ ...p, owner_user_id: opt.betrieb, auftrag_id: auftrag.id })));
  if (posErr) {
    await db.from('auftraege').delete().eq('id', auftrag.id).eq('owner_user_id', opt.betrieb);
    return { ok: false, fehler: 'Positionen konnten nicht übernommen werden — es wurde kein Auftrag angelegt.', code: 500 };
  }

  await db.from('angebote').update({ auftrag_id: auftrag.id, aktualisiert_am: new Date().toISOString() })
    .eq('id', ang.id).eq('owner_user_id', opt.betrieb);

  return { ok: true, auftragId: auftrag.id, bereitsVorhanden: false };
}
