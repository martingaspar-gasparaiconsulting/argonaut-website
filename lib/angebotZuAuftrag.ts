// ============================================================================
// ARGONAUT OS · lib/angebotZuAuftrag.ts — HW-10 (15.10.2026)
//
// Angebotspositionen -> Auftragspositionen und Summen.
//
// Befund HW-10: Ein angenommenes Angebot wurde nirgends zum Auftrag — weder
// per Knopf noch bei der Annahme durch den Kunden. Die Kette Angebot ->
// Auftrag -> Einsatz/Abschlag/Schluss -> Rechnung brach an der ersten Stelle.
//
// Regel (gleich wie Rechnung aus Angebot): Rabatt je Position mit derselben
// Rundung wie lib/angebotRabatt (positionsNetto); der Einzelpreis wird auf den
// rabattierten Netto-Preis gerechnet, damit Menge x Preis = Zeile bleibt;
// Steuersatz ueber lib/steuersatz (0 bleibt 0); Summen je Satz (kopfSummen).
//
// Reine Logik, node-testbar.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';
import { steuersatz } from './steuersatz';
import { positionsNetto } from './angebotRabatt';
import { kopfSummen, type KopfSummen } from './rechnungKopf';

export interface AngebotPosition {
  bezeichnung?: string | null;
  menge?: unknown;
  einheit?: string | null;
  einzelpreis?: unknown;
  mwst_satz?: unknown;
  rabatt_prozent?: unknown;
}

export interface AuftragPositionNeu {
  position: number;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
  gesamt_netto: number;
}

export function angebotZuAuftrag(positionen: readonly AngebotPosition[]): { posten: AuftragPositionNeu[]; summen: KopfSummen } {
  const posten = (Array.isArray(positionen) ? positionen : []).map((p, i) => {
    const menge = leseZahlOder(p?.menge, 0);
    const einzel = leseZahlOder(p?.einzelpreis, 0);
    const rabatt = leseZahlOder(p?.rabatt_prozent, 0);
    const netto = centRunden(positionsNetto(menge, einzel, rabatt));
    return {
      position: i + 1,
      bezeichnung: (p?.bezeichnung || '').trim() || '(ohne Bezeichnung)',
      menge: centRunden(menge),
      einheit: (p?.einheit || '').trim() || 'Stk',
      einzelpreis: menge > 0 ? centRunden(netto / menge) : centRunden(einzel),
      mwst_satz: steuersatz(p?.mwst_satz),
      gesamt_netto: netto,
    };
  });
  const summen = kopfSummen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })), {});
  return { posten, summen };
}
