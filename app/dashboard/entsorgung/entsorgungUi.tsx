'use client';

// ARGONAUT OS · Paket 355 (13.10.2026) — gemeinsame Teile der Entsorgungs-Seite:
// Farben und Stile (wie Bestattung/Bewachung), Typen, Speicher-Helfer, Druckfenster.

import type { SupabaseClient } from '@supabase/supabase-js';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';

export { C, STUFE_FARBE, heute, Feld, s } from '../bestattung/bestattungUi';
export { firmaLaden, zeige } from '../bewachung/bewachungUi';

export type Melde = (fehler: string | null, ok?: string | null) => void;
export type Db = SupabaseClient;
export type Kontakt = { id: string; anzeige: string; telefon: string | null; adresse: string };

/** Meldungen der Datenbank-Wächter (deutsch, verständlich) durchreichen, sonst eine Rechte-Meldung. */
const WAECHTER = /Container|Auftrag|Kontakt|Abfallschlüssel|Wiegeschein|Tara|Brutto|Abschließen|Storno|Geschäftsleitung|Betrieb|Kunde|bleibt/;
export function fehlerText(msg: string | undefined, sonst: string): string {
  if (!msg) return sonst;
  if (/container_bestand_nummer_eindeutig/.test(msg)) return 'Diese Container-Nummer ist schon vergeben.';
  if (/abfall_schluessel_eindeutig/.test(msg)) return 'Diesen Abfallschlüssel gibt es in Ihrer Liste schon.';
  if (/foreign key|violates foreign key/.test(msg)) return 'Das wird noch von Aufträgen oder Wiegescheinen gebraucht und bleibt deshalb erhalten — blenden Sie es stattdessen aus.';
  return WAECHTER.test(msg) ? msg : sonst;
}

/** Schreiben mit Prüfung „wirklich gespeichert" (0 Zeilen = Fehler). */
export async function schreiben(
  q: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  sonst = 'Nicht gespeichert — dafür ist das Schreibrecht „Entsorgung" nötig (und SQL Paket 355).',
): Promise<{ ok: true; data: unknown } | { ok: false; fehler: string }> {
  const { data, error } = await q;
  if (error) return { ok: false, fehler: fehlerText(error.message, sonst) };
  if (nichtsGeschrieben(data)) return { ok: false, fehler: sonst };
  return { ok: true, data };
}
