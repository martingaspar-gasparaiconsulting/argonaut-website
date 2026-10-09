// ARGONAUT OS · Paket 296 · gemeinsame Typen und Helfer der Motorsport-Seiten
import { createBrowserClient } from '@supabase/ssr';
import type { EventKurz, TnVoll } from '@/lib/motorsport';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export type Ev = EventKurz & { owner_user_id: string; notiz: string | null; verzicht_fest: boolean };
export type Gr = { id: string; event_id: string; name: string; startplaetze: number; startgeld_netto_cent: number; reihenfolge: number };
export type Tn = TnVoll & {
  event_id: string; owner_user_id: string; telefon: string | null; kontakt_id: string | null; notiz: string | null;
  verzicht_gesendet_am: string | null; freigabe_am: string | null; erstellt_am: string;
};
export type Gast = {
  id: string; event_id: string; art: string; name: string; firma: string | null; email: string | null; personen: number; bereich: string;
  leistung: string | null; betrag_netto_cent: number | null; verzicht_token: string | null; akkreditiert_am: string | null; notiz: string | null;
};
export type MietFz = { id: string; bezeichnung: string; kennzeichen: string | null; art: string; tagessatz_cent: number; aktiv: boolean };
export type Einsatz = { id: string; miet_fahrzeug_id: string; event_id: string | null; datum: string; stunden: number | string; runden: number | string; notiz: string | null };
export type SigStatus = Record<string, string>;

/** Fehlermeldung der Datenbank lesbar machen (deutsche Wächter-Texte durchreichen). */
export function fehlerText(error: { message?: string; code?: string } | null, standard: string): string {
  const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/row-level|permission/i.test(m)) return 'Dafür braucht es das Schreibrecht „Veranstaltungen".';
  if (/ms_teilnehmer_startnr_uq/.test(m)) return 'Diese Startnummer ist in diesem Event schon vergeben.';
  if (/ms_teilnehmer_leih_uq/.test(m)) return 'Das Leihfahrzeug ist in diesem Event schon vergeben.';
  if (/duplicate key.*\(event_id, name\)|ms_gruppe_event_id_name_key/.test(m)) return 'Eine Gruppe mit diesem Namen gibt es schon.';
  if (error?.message && /[äöüÄÖÜß„]|Event|Gruppe|Teilnehmer|Verzicht|Fahrzeug|Rechnung/.test(error.message)) return error.message;
  return standard;
}

export function fzName(f: MietFz | undefined | null): string {
  if (!f) return '—';
  return f.kennzeichen ? `${f.bezeichnung} (${f.kennzeichen})` : f.bezeichnung;
}
