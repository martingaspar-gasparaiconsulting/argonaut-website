// ============================================================================
// ARGONAUT OS · lib/betriebSperreServer.ts — ist der Betrieb gesperrt? (Paket 177)
//
// EINE Pruefung fuer Dashboard-Layout, Anmelde-Callback und alle Schnittstellen
// mit nurAngemeldet(). Zuerst die Datenbank-Funktion betrieb_gesperrt() (SQL
// p177, gilt fuer Chef UND Mitarbeiter). Gibt es sie noch nicht, die alte
// Pruefung ueber churned_customers — wie bisher.
// Bei Stoerung wird NICHT gesperrt (lib/churnSperre.ts: eine Stoerung soll nie
// alle zahlenden Kunden gleichzeitig aussperren), aber laut protokolliert.
// ============================================================================

import { churnEntscheidung, sperrAusRpc, type ChurnEntscheidung } from './churnSperre';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sitzung = { rpc: (fn: string, args?: any) => PromiseLike<{ data: unknown; error: any }>; from: (t: string) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function betriebSperrePruefen(sitzung: unknown): Promise<ChurnEntscheidung> {
  const sb = sitzung as Sitzung;
  try {
    const r = await sb.rpc('betrieb_gesperrt');
    const ja = sperrAusRpc(r.data, r.error);
    if (ja !== null) return { gesperrt: ja, protokoll: null };
  } catch { /* Funktion (noch) nicht da -> alte Pruefung */ }
  try {
    const { data, error } = await sb.from('churned_customers').select('id').limit(1);
    return churnEntscheidung(data, error);
  } catch (e) {
    return { gesperrt: false, protokoll: '[churn-lock] Pruefung fehlgeschlagen: ' + (e instanceof Error ? e.message : 'unbekannt') };
  }
}
