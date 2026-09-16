// ============================================================
// ARGONAUT OS · Bündel 16 · lib/kasse-tse.ts
// TSE-Konnektor für die Kasse. Liest die Integration (Bündel 15) und liefert
// eine Signatur für einen Kassenbeleg.
//
//  · Demo/Manuell oder nicht aktiv  -> Demo-Signatur (klar als solche markiert).
//  · Echter Anbieter hinterlegt (fiskaly/Deutsche Fiskal/Epson) -> hier ist der
//    EINE Einhängepunkt für die spätere Anbieter-Anbindung. Bis die gebaut ist,
//    bleibt der Beleg eine DEMO-Signatur und wird auch so gemeldet.
//
// ------------------------------------------------------------
// ABSCHALTUNG DES LIVE-ZWEIGS · 16.09.2026
// Bis heute gab dieser Zweig `modus: 'live'` zurück und signierte trotzdem mit
// demoSignatur(). Damit meldete die Kasse eine zertifizierte technische
// Sicherheitseinrichtung, die es nicht gibt:
//   · § 146a Abs. 1 AO — eine Kasse ohne zertifizierte TSE ist ein Mangel.
//   · § 5 UWG — sie als "live" zu kennzeichnen macht aus dem Mangel eine
//     unrichtige Angabe gegenüber dem Betrieb und seinen Kunden.
// Der Zweig gibt deshalb jetzt ehrlich `modus: 'demo'` zurück. Die Kasse bleibt
// voll nutzbar; die Kassenseite zeigt dann dauerhaft ihren Demo-Hinweis an.
// Sobald die echte Anbieter-Anbindung gebaut ist, kommt sie GENAU an die unten
// markierte Stelle und darf dort wieder `modus: 'live'` setzen.
// ------------------------------------------------------------
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
  /**
   * true, wenn der Betrieb einen echten Anbieter hinterlegt und aktiv geschaltet
   * hat, dessen Anbindung aber noch nicht gebaut ist. Der Beleg ist dann trotzdem
   * eine Demo — dieses Feld sagt nur, dass der Betrieb schon bereit wäre.
   */
  anbieterHinterlegt?: boolean;
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
 *
 * Gibt derzeit IMMER modus: 'demo' zurück — siehe Kopf der Datei.
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

  // ----------------------------------------------------------------
  // ANDOCKPUNKT: Echter Anbieter ist hinterlegt und aktiv geschaltet.
  // HIER kommt die Anbieter-Anbindung hin (z. B. fiskaly Sign-Transaction über
  // die TSS-ID aus intg.config). Erst wenn die echte Signatur von dort kommt,
  // darf modus: 'live' und die echte Seriennummer zurückgegeben werden.
  // Bis dahin: ehrliche Demo-Kennzeichnung, Kasse bleibt nutzbar.
  // ----------------------------------------------------------------
  return {
    modus: 'demo',
    anbieter: intg!.anbieter,
    signatur: demoSignatur(belegNr, bruttoSumme),
    seriennummer: 'DEMO-TSE',
    zeit: jetzt,
    anbieterHinterlegt: true,
    hinweis: `Anbieter "${intg!.anbieter}" ist hinterlegt, die Anbindung an dessen TSE ist aber noch nicht freigeschaltet. Dieser Beleg trägt KEINE gültige TSE-Signatur nach § 146a AO.`,
  };
}
