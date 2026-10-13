// ============================================================================
// ARGONAUT OS · lib/rechtsTexteLaden.ts — Paket 347 (13.10.2026)
// Lädt den eigenen Rechtstext des Betriebs (Tabelle rechtstext, SQL p347) und
// macht daraus den Text fürs Dokument (lib/rechtsTexte.dokumentText).
// Geht im Browser (RLS: Chef und seine Mitarbeiter lesen nur den eigenen
// Betrieb) und am Server. Jeder Lesefehler = „kein eigener Text" — dann
// erscheint im Dokument der Hinweis, nie ein Mustertext.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { dokumentText, eintragFuer, type DokumentText, type GespeicherterText } from './rechtsTexte';

export async function ladeRechtstext(db: SupabaseClient, betrieb: string | null | undefined, schluessel: string): Promise<GespeicherterText | null> {
  if (!betrieb) return null;
  try {
    const { data, error } = await db.from('rechtstext')
      .select('text, fassung, geaendert_am, geprueft_vermerk')
      .eq('owner_user_id', betrieb).eq('schluessel', schluessel).maybeSingle();
    if (error || !data) return null;
    return data as GespeicherterText;
  } catch {
    return null;
  }
}

/** Fertiger Dokument-Text: eigener Text (Platzhalter gefüllt) oder Hinweis. */
export async function ladeDokumentText(
  db: SupabaseClient, betrieb: string | null | undefined, schluessel: string,
  werte: Readonly<Record<string, string | null | undefined>> = {},
): Promise<DokumentText> {
  const e = eintragFuer(schluessel);
  if (!e) return { eigen: false, hinweis: 'Unbekannter Rechtstext.' };
  return dokumentText(e, await ladeRechtstext(db, betrieb, schluessel), werte);
}
