// ============================================================================
// ARGONAUT OS · lib/ausfallstunden.ts — HW-4 (16.10.2026)
//
// Ausfallstunden für die Lohnvorbereitung (Anbau an LK5):
//   schlechtwetter  witterungsbedingter Arbeitsausfall (Bau: Schlechtwetterzeit
//                   01.12.–31.03., Saison-Kurzarbeitergeld)
//   arbeitsmangel   wirtschaftlich bedingter Ausfall
// ARGONAUT rechnet KEIN Saison-Kurzarbeitergeld und keine Umlage aus. Die
// Stunden gehen als Liste ans Steuerbüro / Lohnprogramm; Anzeige und
// Abrechnung bei der Agentur für Arbeit macht der Betrieb bzw. das Büro.
// Vorrang von Arbeitszeitkonto/Urlaub vor Saison-KUG prüft das Lohnbüro.
//
// Rein, getestet in tests/ausfallstundenHW4.test.mjs.
// SQL: supabase-sql/p394-ausfallstunden.sql (Seite läuft auch vorher).
// ============================================================================

import { leseZahl, rundeStellen } from './zahlen';
import { istIsoDatum } from './nachweisMotor';

export type AusfallGrund = 'schlechtwetter' | 'arbeitsmangel';
export const AUSFALL_GRUENDE: { key: AusfallGrund; label: string }[] = [
  { key: 'schlechtwetter', label: 'Schlechtwetter (witterungsbedingt)' },
  { key: 'arbeitsmangel', label: 'Arbeitsmangel (wirtschaftlich)' },
];

export type Ausfall = { mitarbeiter_id: string; datum: string; stunden: number | string; grund: string };

/** Schlechtwetterzeit 1. Dezember bis 31. März. */
export function istSchlechtwetterzeit(datum: string): boolean {
  if (!istIsoDatum(datum)) return false;
  const m = Number(datum.slice(5, 7));
  return m === 12 || m <= 3;
}

export function pruefeAusfall(e: { mitarbeiter_id?: string; datum?: string; stunden?: string; grund?: string }, heute: string): { stunden: number | null; fehler: string | null; hinweis: string | null } {
  if (!e.mitarbeiter_id) return { stunden: null, fehler: 'Bitte einen Mitarbeiter wählen.', hinweis: null };
  if (!istIsoDatum(e.datum)) return { stunden: null, fehler: 'Bitte das Datum eintragen.', hinweis: null };
  if ((e.datum as string) > heute) return { stunden: null, fehler: 'Ausfallstunden werden erst nach dem Tag eingetragen.', hinweis: null };
  if (!AUSFALL_GRUENDE.some((g) => g.key === e.grund)) return { stunden: null, fehler: 'Bitte den Grund wählen.', hinweis: null };
  const n = leseZahl(e.stunden);
  if (n == null || n <= 0 || n > 12) return { stunden: null, fehler: 'Stunden zwischen 0,25 und 12 eintragen.', hinweis: null };
  const st = rundeStellen(n, 2);
  const hinweis = e.grund === 'schlechtwetter' && !istSchlechtwetterzeit(e.datum as string)
    ? 'Außerhalb der Schlechtwetterzeit (01.12.–31.03.) — für Saison-Kurzarbeitergeld meist nicht berücksichtigt. Bitte mit dem Lohnbüro klären.'
    : null;
  return { stunden: st, fehler: null, hinweis };
}

/** Summe je Mitarbeiter im Monat (Minuten). */
export function ausfallImMonat(rows: Ausfall[], mitarbeiterId: string, von: string, bis: string): { schlechtwetter: number; arbeitsmangel: number } {
  const out = { schlechtwetter: 0, arbeitsmangel: 0 };
  for (const r of rows ?? []) {
    if (r.mitarbeiter_id !== mitarbeiterId || !istIsoDatum(r.datum) || r.datum < von || r.datum > bis) continue;
    const h = leseZahl(r.stunden);
    if (h == null || h <= 0) continue;
    if (r.grund === 'schlechtwetter') out.schlechtwetter = rundeStellen(out.schlechtwetter + h * 60, 2);
    else if (r.grund === 'arbeitsmangel') out.arbeitsmangel = rundeStellen(out.arbeitsmangel + h * 60, 2);
  }
  return out;
}
