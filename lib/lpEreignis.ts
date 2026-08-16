import type { SupabaseClient } from '@supabase/supabase-js';
import { besucherKennung, salzAusUmgebung } from './besucherKennung';

// ============================================================================
// ARGONAUT OS · lib/lpEreignis.ts — Server-Helfer: Landingpage-Ereignis loggen
// (Marketing-Autopilot · Funnel-Analytics P1 + A-B-Tests)
//
// Schreibt EINE Zeile in lp_ereignisse. Immer NICHT-BLOCKIEREND aufrufen:
// Analytics darf den oeffentlichen Ablauf (Seitenaufruf, Opt-in, Bestaetigung)
// niemals stoeren. Fehler werden geschluckt.
// Aufruf ausschliesslich mit Service-Role-Client (umgeht RLS).
// `variante` ('A'|'B') nur bei aktivem A-B-Test, sonst null.
//
// ENTDOPPELUNG (16.08.26): Zusaetzlich wird eine anonyme Tageskennung
// mitgeschrieben, damit derselbe Besucher nicht bei jedem Reload erneut als
// Aufruf zaehlt. Ohne sie blaeht sich die Fallzahl im A-B-Signifikanztest auf
// und der meldet zu frueh ein Ergebnis. Details und Datenschutzbegruendung
// stehen in lib/besucherKennung.ts.
//
// Die Kopfzeilen sind OPTIONAL: wo sie fehlen, wird wie bisher jede Zeile
// einzeln gezaehlt. Eine fehlende Entdoppelung ist harmloser als ein
// erfundener Wert, der echte Besucher zusammenwirft.
// ============================================================================

export type LpEreignisTyp = 'aufruf' | 'anmeldung' | 'bestaetigung';

export async function protokolliereLpEreignis(
  admin: SupabaseClient,
  ownerUserId: string | null | undefined,
  landingpageId: string | null | undefined,
  typ: LpEreignisTyp,
  variante?: 'A' | 'B' | null,
  kopfzeilen?: Headers | null,
): Promise<void> {
  if (!ownerUserId || !landingpageId) return;

  let besucher: string | null = null;
  try {
    besucher = kopfzeilen
      ? besucherKennung(kopfzeilen, salzAusUmgebung(process.env), new Date())
      : null;
  } catch {
    besucher = null;
  }

  try {
    await admin.from('lp_ereignisse').insert({
      owner_user_id: ownerUserId,
      landingpage_id: landingpageId,
      typ,
      variante: variante === 'A' || variante === 'B' ? variante : null,
      besucher_hash: besucher,
    });
  } catch {
    // bewusst geschluckt — Messung darf den Ablauf nie blockieren
  }
}
