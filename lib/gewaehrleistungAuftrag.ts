// ============================================================================
// ARGONAUT OS · lib/gewaehrleistungAuftrag.ts — LK2 (16.10.2026)
//
// Gewährleistung direkt am Auftrag:
//   - am Auftrag starten (Abnahmedatum + Regelwerk → Frist), Zeile in
//     bau_gewaehrleistung mit auftrag_id (Spalte ab SQL p392; vorher ohne)
//   - Begehung 3 Monate vor Fristende („Gewährleistungs-Begehung" als
//     Termin / Folgeauftrag), erledigt-Vermerk begehung_am (ab SQL p392)
//   - Mängel in der Frist direkt am Auftrag melden (bau_maengelruege)
//
// Fristen-Rechnung NICHT neu: gewaehrleistungsEnde/REGELWERKE aus
// lib/bauAblaeufe.ts, plusMonate/tageBis aus lib/nachweisMotor.ts.
// Rein, getestet in tests/gewaehrleistungAuftragLK2.test.mjs.
// ============================================================================

import { REGELWERKE, gewaehrleistungsEnde, regelwerk, type GewaehrleistungZeile } from './bauAblaeufe';
import { plusMonate, tageBis, istIsoDatum, datumDe } from './nachweisMotor';
import { leseZahlOder } from './zahlen';

export const BEGEHUNG_MONATE_VORHER = 3;

export type BegehungStatus = 'spaeter' | 'jetzt' | 'erledigt' | 'verpasst' | 'unbekannt';

export function begehungStatus(
  g: GewaehrleistungZeile & { begehung_am?: string | null },
  heute: string,
): { status: BegehungStatus; ab: string | null; ende: string | null; tage: number | null; text: string } {
  const ende = gewaehrleistungsEnde(g);
  if (!ende) return { status: 'unbekannt', ab: null, ende: null, tage: null, text: 'Fristende unbekannt — Abnahmedatum oder Frist fehlt.' };
  const ab = plusMonate(ende, -BEGEHUNG_MONATE_VORHER);
  if (g.begehung_am && istIsoDatum(g.begehung_am)) {
    return { status: 'erledigt', ab, ende, tage: tageBis(heute, ende), text: `Begehung erledigt am ${datumDe(g.begehung_am)}` };
  }
  const tage = tageBis(heute, ende);
  if (tage < 0) return { status: 'verpasst', ab, ende, tage, text: `Gewährleistung endete am ${datumDe(ende)} ohne Begehung` };
  if (ab && heute < ab) return { status: 'spaeter', ab, ende, tage, text: `Begehung ab ${datumDe(ab)} planen (Ende ${datumDe(ende)})` };
  return { status: 'jetzt', ab, ende, tage, text: `Begehung jetzt planen — Gewährleistung endet am ${datumDe(ende)} (in ${tage} Tagen)` };
}

/** Termin-Link mit Vorbelegung (gleiche Parameter wie lib/leadWeiter). */
export function begehungTerminUrl(g: { bezeichnung?: string | null; kunde_name?: string | null }, ende: string | null, kontaktId?: string | null): string {
  const q = new URLSearchParams({ neu: '1' });
  const name = String(g.bezeichnung ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'Auftrag';
  q.set('titel', `Gewährleistungs-Begehung: ${name}`.slice(0, 120));
  const notiz = [
    ende ? `Gewährleistung endet am ${datumDe(ende)}.` : '',
    'Mängel vor Fristende gemeinsam mit dem Kunden aufnehmen; Folgeauftrag/Wartung anbieten.',
    g.kunde_name ? `Kunde: ${String(g.kunde_name).trim().slice(0, 120)}` : '',
  ].filter(Boolean).join(' ');
  q.set('notiz', notiz.slice(0, 800));
  if (kontaktId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(kontaktId)) q.set('kontakt', kontaktId);
  return `/dashboard/termine?${q.toString()}`;
}

export type StartEingabe = { abnahme_am: string; regelwerk: string; monate?: string | number | null };

/** Prüft die Eingabe beim Start am Auftrag und liefert die Monate. */
export function pruefeStart(e: StartEingabe, heute: string): { monate: number | null; fehler: string | null } {
  if (!istIsoDatum(e.abnahme_am)) return { monate: null, fehler: 'Bitte das Abnahmedatum eintragen — ab da läuft die Gewährleistung.' };
  if (e.abnahme_am > heute) return { monate: null, fehler: 'Das Abnahmedatum liegt in der Zukunft.' };
  const r = regelwerk(e.regelwerk);
  if (!r) return { monate: null, fehler: 'Bitte die Art der Leistung wählen.' };
  const eigen = leseZahlOder(String(e.monate ?? '').trim(), NaN);
  const monate = r.monate ?? (Number.isInteger(eigen) ? eigen : NaN);
  if (!Number.isInteger(monate) || monate < 1 || monate > 360) return { monate: null, fehler: 'Bitte die Frist aus dem Vertrag in ganzen Monaten eintragen (1 bis 360).' };
  return { monate, fehler: null };
}

export type AuftragKurz = { id: string; titel?: string | null; auftragsnummer?: string | null; projekt_id?: string | null; kunde?: string | null };

/** Zeile für bau_gewaehrleistung — auftrag_id nur, wenn die Spalte da ist. */
export function gwAusAuftrag(a: AuftragKurz, e: StartEingabe, monate: number, mitAuftragSpalte: boolean): Record<string, unknown> {
  const bez = [a.auftragsnummer, a.titel].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ') || 'Auftrag';
  const zeile: Record<string, unknown> = {
    bezeichnung: bez.slice(0, 200),
    kunde_name: a.kunde ? String(a.kunde).trim().slice(0, 200) : null,
    abnahme_am: e.abnahme_am,
    regelwerk: e.regelwerk,
    monate,
    projekt_id: a.projekt_id || null,
  };
  if (mitAuftragSpalte) zeile.auftrag_id = a.id;
  return zeile;
}

/** Ohne Spalte auftrag_id: Zuordnung über die Bezeichnung (Auftragsnummer am Anfang). */
export function gehoertZuAuftrag(g: { auftrag_id?: string | null; bezeichnung?: string | null }, a: AuftragKurz): boolean {
  if (g.auftrag_id) return g.auftrag_id === a.id;
  const nr = String(a.auftragsnummer ?? '').trim();
  const bez = String(g.bezeichnung ?? '').trim();
  return !!nr && (bez === nr || bez.startsWith(`${nr} ·`));
}

export { REGELWERKE };
