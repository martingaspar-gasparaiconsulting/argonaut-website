// ============================================================================
// ARGONAUT OS · Welle 3 · lib/bezahllink.ts — „Jetzt online bezahlen"-Link
//
// Baut aus der vom Betrieb hinterlegten Zahlungsanbieter-Integration (Bündel 15)
// einen Bezahllink für eine Rechnung. WICHTIG: ARGONAUT wickelt KEIN Geld ab —
// wir verlinken nur zum eigenen Anbieter-Account des Betriebs.
//
//  · Kein/inaktiver/Demo-Anbieter  -> null (kein Knopf, nur Überweisung + GiroCode).
//  · PayPal.Me                     -> Betrag wird an den Link angehängt (vorausgefüllt).
//  · Alle anderen (Stripe/Mollie/  -> der hinterlegte Bezahllink wird 1:1 genutzt.
//    SumUp/GoCardless/Eigener)
//
// Reine Logik, keine Supabase-Aufrufe / React-Hooks — server- & clientseitig nutzbar.
// ============================================================================

import { anbieterVon, istLive, type IntegrationDatensatz } from './konnektoren';

export type Bezahllink = { url: string; anbieter: string };

/**
 * Liefert { url, anbieter } für den „Jetzt bezahlen"-Knopf – oder null, wenn kein
 * (aktiver, gültiger) Anbieter hinterlegt ist.
 */
export function baueBezahllink(
  intg: IntegrationDatensatz | null | undefined,
  betrag: number,
): Bezahllink | null {
  if (!istLive(intg)) return null;
  const cfg = (intg!.config || {}) as Record<string, unknown>;
  const clean = (s: unknown) => String(s ?? '').trim();
  const katalogName = anbieterVon('zahlung', intg!.anbieter)?.name || intg!.anbieter;
  const b = Number(betrag);

  // PayPal.Me: Betrag direkt in den Link – die App füllt Summe + Währung vor.
  if (intg!.anbieter === 'paypalme') {
    const handle = clean(cfg.handle)
      .replace(/^https?:\/\/(www\.)?paypal\.me\//i, '')
      .replace(/^\/+/, '').replace(/\/+$/, '');
    if (!handle) return null;
    const betragTeil = Number.isFinite(b) && b > 0 ? `/${b.toFixed(2)}EUR` : '';
    return { url: `https://www.paypal.me/${handle}${betragTeil}`, anbieter: 'PayPal' };
  }

  // Alle anderen: hinterlegten Bezahllink 1:1 verwenden (muss http(s) sein).
  const link = clean(cfg.link);
  if (!/^https?:\/\//i.test(link)) return null;
  const anzeige = intg!.anbieter === 'eigener' ? (clean(cfg.name) || 'Online-Zahlung') : katalogName;
  return { url: link, anbieter: anzeige };
}
