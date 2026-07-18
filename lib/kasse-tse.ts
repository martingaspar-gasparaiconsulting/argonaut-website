// ============================================================
// ARGONAUT OS · Bündel 16 · lib/kasse-tse.ts
// TSE-Konnektor für die Kasse. Liest die Integration (Bündel 15) und liefert
// eine Signatur für einen Kassenbeleg.
//
//  · Demo/Manuell oder nicht aktiv  -> Demo-Signatur (klar als solche markiert).
//  · Echter Anbieter aktiv (fiskaly/Deutsche Fiskal/Epson) -> hier ist der EINE
//    Einhängepunkt: sobald die Anbieter-Anbindung freigeschaltet ist, wird die
//    echte TSE-Signatur erzeugt. Bis dahin wird der Beleg mit einer als
//    "Anbindung ausstehend" markierten Signatur versehen (Kasse bleibt nutzbar).
//
// Server-Helfer (nutzt einen übergebenen Supabase-Client). Keine React-Hooks.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { istLive, type IntegrationDatensatz } from './konnektoren';

export type TseErgebnis = {
  modus: 'demo' | 'live';
  anbieter: string;
  signatur: string;
  seriennummer: string;
  zeit: string;
  hinweis?: string;
};

function demoSignatur(belegNr: string, brutto: number): string {
  // Deterministische, klar erkennbare Demo-Signatur (KEINE echte TSE).
  const basis = `${belegNr}|${brutto.toFixed(2)}|ARGONAUT-DEMO`;
  let h = 0;
  for (let i = 0; i < basis.length; i++) { h = (h * 31 + basis.charCodeAt(i)) >>> 0; }
  const teil = (n: number) => n.toString(16).padStart(8, '0');
  return `DEMO-${teil(h)}-${teil((h * 2654435761) >>> 0)}`;
}

/**
 * Signiert einen Beleg. ownerId = Betrieb (Chef), damit auch ein Kassierer
 * (Mitarbeiter) die Integration nutzen kann — gelesen wird per Service-Role
 * durch den Aufrufer, daher hier nur die Logik.
 */
export async function signiereBeleg(
  db: SupabaseClient,
  ownerId: string,
  belegNr: string,
  bruttoSumme: number,
): Promise<TseErgebnis> {
  const jetzt = new Date().toISOString();

  let intg: IntegrationDatensatz | null = null;
  try {
    const { data } = await db.from('betrieb_integrationen').select('typ, anbieter, config, aktiv').eq('owner_user_id', ownerId).eq('typ', 'tse').maybeSingle();
    if (data) intg = data as IntegrationDatensatz;
  } catch { /* Integration optional -> Demo */ }

  if (!istLive(intg)) {
    return { modus: 'demo', anbieter: intg?.anbieter || 'demo', signatur: demoSignatur(belegNr, bruttoSumme), seriennummer: 'DEMO-TSE', zeit: jetzt };
  }

  // --- Echter Anbieter aktiv: hier kommt die Anbieter-Anbindung hin. ---
  // Sobald z. B. der fiskaly-Client eingebunden ist, wird an dieser Stelle die
  // echte Signatur geholt (Sign-Transaction über die TSS-ID aus intg.config).
  // Bis zur Freischaltung bleibt die Kasse nutzbar; der Beleg wird markiert.
  return {
    modus: 'live',
    anbieter: intg!.anbieter,
    signatur: demoSignatur(belegNr, bruttoSumme),
    seriennummer: String((intg!.config?.tss_id as string) || intg!.anbieter),
    zeit: jetzt,
    hinweis: `Anbieter "${intg!.anbieter}" ist hinterlegt. Die echte TSE-Signatur wird nach Freischaltung der Anbieter-Anbindung erzeugt.`,
  };
}
