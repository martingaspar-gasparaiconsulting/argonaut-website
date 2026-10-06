// ============================================================================
// ARGONAUT OS · lib/startSperre.ts — Paket 216 (06.10.2026)
// Start-Schalter: was bis zur Abnahme durch den Anwalt ABGESCHALTET bleibt
//
// Martins Entscheidung (05.10.2026, Fahrplan „Rechtlich starten mit kleinem
// Budget"): Zum Verkaufsstart wird nur geprüft, was eingeschaltet ist. Alles,
// dessen Rechtslage offen ist, ist TECHNISCH aus — ein Hinweisschild allein
// schützt nicht. Die Bereiche gehören zu den Anwalt-Paketen 2 und 3.
//
// So wird ein Bereich freigeschaltet: unten auf `true` setzen, pushen. Mehr
// nicht. Unbekannte Bereiche gelten als gesperrt (nie versehentlich frei).
//
// Gleiches Muster wie lib/anwaltFreigabe.ts (Importe, Paket 153).
// Keine Imports — node-testbar, von Client und Server nutzbar.
// ============================================================================

export type StartBereich =
  | 'shop'            // Webshop der Betriebe: Bestellungen auf Kunden-Websites (Anwalt-Paket 2)
  | 'kiBeraterFremd'  // KI-Berater auf FREMDEN Websites (eigene ARGONAUT-Seiten bleiben) (Paket 3)
  | 'fernhilfe'       // Bildschirm teilen mit ARGONAUT oder dem Chef (Paket 3)
  | 'whatsappWerbung'; // WhatsApp-Anmeldung und Kampagnen-Versand (Paket 3)

/** Der Schalter. false = abgeschaltet bis zur Freigabe durch den Anwalt. */
export const START_FREIGABE: Readonly<Record<StartBereich, boolean>> = Object.freeze({
  shop: false,
  kiBeraterFremd: false,
  fernhilfe: false,
  whatsappWerbung: false,
});

const GRUND: Record<StartBereich, string> = {
  shop: 'Der Online-Shop wird in Kürze freigeschaltet. Bestellungen nehmen wir bis dahin gern per Telefon oder E-Mail entgegen.',
  kiBeraterFremd: 'Der Berater auf Ihrer eigenen Website wird in Kürze freigeschaltet. Auf Ihrer ARGONAUT-Website läuft er bereits.',
  fernhilfe: 'Die Fernhilfe wird in Kürze freigeschaltet. Bis dahin helfen wir Ihnen gern per Telefon oder E-Mail.',
  whatsappWerbung: 'WhatsApp-Werbung wird in Kürze freigeschaltet. Bis dahin können Sie Newsletter per E-Mail versenden.',
};

/** true, wenn der Bereich freigeschaltet ist. `freigabe` nur für Tests. */
export function startFrei(
  bereich: StartBereich | string | null | undefined,
  freigabe: Readonly<Record<string, boolean>> = START_FREIGABE,
): boolean {
  if (!bereich || !(bereich in GRUND)) return false;
  return freigabe[bereich] === true;
}

/** Grund, warum ein Bereich (noch) gesperrt ist — oder null, wenn frei. */
export function startSperrGrund(
  bereich: StartBereich | string | null | undefined,
  freigabe: Readonly<Record<string, boolean>> = START_FREIGABE,
): string | null {
  if (startFrei(bereich, freigabe)) return null;
  return bereich && bereich in GRUND ? GRUND[bereich as StartBereich] : 'Diese Funktion wird in Kürze freigeschaltet.';
}

/**
 * Kommt ein Aufruf von einer FREMDEN Website? Gleiche Herkunft (unsere eigenen
 * /p/-Seiten) oder kein Origin zählt nicht als fremd.
 */
export function istFremdeHerkunft(origin: string | null | undefined, eigeneUrl: string | null | undefined): boolean {
  const o = String(origin ?? '').trim();
  if (!o || o === 'null') return false;
  let ho = '';
  let he = '';
  try { ho = new URL(o).host.toLowerCase(); } catch { return true; }
  try { he = new URL(String(eigeneUrl ?? '')).host.toLowerCase(); } catch { he = ''; }
  return !he || ho !== he;
}
