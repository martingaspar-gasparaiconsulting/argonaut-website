'use client';

// ARGONAUT OS · Paket 353 (13.10.2026) — gemeinsame Teile der Bewachungs-Seite:
// Farben und Stile (wie Bestattung), Typen, Speicher-Helfer, Firmenkopf, Druckfenster.

import type { SupabaseClient } from '@supabase/supabase-js';
import { nichtsGeschrieben } from '@/lib/speichernPruefen';
import type { Firmenkopf } from '@/lib/bewachung';

export { C, STUFE_FARBE, heute, Feld, s } from '../bestattung/bestattungUi';

export type Objekt = { id: string; bezeichnung: string | null; adresse: string | null; kennung: string | null };
export type Melde = (fehler: string | null, ok?: string | null) => void;
export type Db = SupabaseClient;

/** Meldungen der Datenbank-Wächter (deutsch, verständlich) durchreichen, sonst eine Rechte-Meldung. */
const WAECHTER = /Objekt|Rundgang|Kontrollpunkt|Nachtrag|Eintrag|Zukunft|Betrieb|ausgeblendet|Scannen|beendet|Geschäftsleitung|Wachperson|abgesagt|Vorgabe/;
export function fehlerText(msg: string | undefined, sonst: string): string {
  if (!msg) return sonst;
  if (/exclusion constraint|keine_ueberschneidung/.test(msg)) return 'Diese Person ist zu der Zeit schon eingeplant.';
  if (/wach_rundgang_einer_laeuft/.test(msg)) return 'Es läuft schon ein eigener Rundgang — bitte erst diesen beenden.';
  if (/foreign key|violates foreign key/.test(msg)) return 'Dieser Kontrollpunkt hat schon Scans und bleibt deshalb erhalten — blenden Sie ihn stattdessen aus.';
  return WAECHTER.test(msg) ? msg : sonst;
}

/** Schreiben mit Prüfung „wirklich gespeichert" (0 Zeilen = Fehler). */
export async function schreiben(
  q: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  sonst = 'Nicht gespeichert — dafür ist das Schreibrecht „Bewachung" nötig (und SQL Paket 353).',
): Promise<{ ok: true; data: unknown } | { ok: false; fehler: string }> {
  const { data, error } = await q;
  if (error) return { ok: false, fehler: fehlerText(error.message, sonst) };
  if (nichtsGeschrieben(data)) return { ok: false, fehler: sonst };
  return { ok: true, data };
}

export async function firmaLaden(): Promise<Firmenkopf | null> {
  try {
    const r = await fetch('/api/betrieb-firmendaten', { cache: 'no-store' });
    if (!r.ok) return null;
    const x = ((await r.json()) as { firma?: Record<string, string | null> }).firma ?? {};
    return { name: x.firma_name ?? null, strasse: x.firma_strasse ?? null, plz: x.firma_plz ?? null, ort: x.firma_ort ?? null, telefon: x.firma_telefon ?? null, email: x.firma_email ?? null };
  } catch { return null; }
}

/** Druckansicht in neuem Fenster. false = vom Browser blockiert. */
export function zeige(html: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

/** Abfrage in Stücken (lange id-Listen). */
export async function inStuecken<T>(ids: string[], f: (teil: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[] | null> {
  const aus: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await f(ids.slice(i, i + 100));
    if (error) return null;
    aus.push(...(((data as unknown) as T[]) ?? []));
  }
  return aus;
}
