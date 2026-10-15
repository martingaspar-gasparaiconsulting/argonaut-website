// ============================================================================
// ARGONAUT OS · lib/aufmassZuAngebot.ts — HW-11 (15.10.2026)
//
// Aufmass -> Angebot. Befund HW-11: Aus dem Aufmass ging nur GAEB oder direkt
// die Rechnung; der uebliche Handwerksweg „aufmessen -> anbieten -> beauftragen"
// fehlte, und das Aufmass hatte keinen Kunden-Datensatz (nur Freitext).
//
// Positionen wie bei Rechnung aus Aufmass (eine Regel):
//   - Pauschale: 1 Psch zum Festpreis (sonst „47,31 m² x 0,00 €")
//   - sonst Menge (auf Cent gerundet) x Einzelpreis, Rechenweg in die Bezeichnung
//   - Position ohne Preis -> KEIN Angebot (kein stiller 0,00-€-Posten)
// Steuersatz ueber positionsSteuersatz (0 bleibt 0), Summen je Satz.
//
// Kunde: kontakt_id am Aufmass; fuer alte Aufmasse wird der Freitext-Name nur
// bei GENAU einem passenden Kontakt verknuepft (mehrdeutig = nie verknuepfen).
//
// Reine Logik, node-testbar.
// ============================================================================

import { positionsBetrag, positionsSteuersatz, type PositionBasis } from '../app/dashboard/_components/aufmassLogik';
import { centRunden } from './zahlen';
import { kopfSummen, type KopfSummen } from './rechnungKopf';

export interface AngebotPostenNeu {
  position: number;
  bezeichnung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
  gesamt_netto: number;
}

export function aufmassZuPosten(positionen: readonly PositionBasis[]): { posten: AngebotPostenNeu[]; summen: KopfSummen; ohnePreis: string[] } {
  const liste = Array.isArray(positionen) ? positionen : [];
  const ohnePreis = liste.filter((p) => positionsBetrag(p) == null).map((p) => p.bezeichnung?.trim() || '(ohne Bezeichnung)');
  const posten = liste.map((p, i) => {
    const pauschal = p.festpreis_netto != null && p.festpreis_netto >= 0;
    const menge = pauschal ? 1 : centRunden(p.menge ?? 0);
    const einheit = pauschal ? 'Psch' : ((p.einheit || '').trim() || 'Stk');
    const einzelpreis = pauschal ? centRunden(p.festpreis_netto as number) : centRunden(p.einzelpreis_netto ?? 0);
    const weg = (p.rechenweg || '').trim();
    const bezeichnung = (p.bezeichnung?.trim() || '(ohne Bezeichnung)') + (weg && !pauschal ? ` (${weg})` : '');
    return {
      position: i + 1, bezeichnung, menge, einheit, einzelpreis,
      mwst_satz: positionsSteuersatz(p),
      gesamt_netto: centRunden(menge * einzelpreis),
    };
  });
  const summen = kopfSummen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })), {});
  return { posten, summen, ohnePreis };
}

export interface KontaktKurz {
  id: string;
  anzeigename?: string | null;
  firma?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  name?: string | null;
  email?: string | null;
}

/** Angezeigter Name eines Kontakts (wie in der Kontaktliste). */
export function kontaktLabel(k: KontaktKurz): string {
  const vn = [k?.vorname, k?.nachname].map((s) => (s || '').trim()).filter(Boolean).join(' ');
  return (k?.anzeigename || '').trim() || (k?.firma || '').trim() || vn || (k?.name || '').trim();
}

/** Kontakt zum Namen — nur bei genau EINEM Treffer, sonst null. */
export function kontaktZuName(name: unknown, kontakte: readonly KontaktKurz[] | null | undefined): string | null {
  const n = String(name ?? '').trim().toLowerCase();
  if (!n) return null;
  const treffer = (Array.isArray(kontakte) ? kontakte : []).filter((k) => kontaktLabel(k).toLowerCase() === n);
  return treffer.length === 1 ? treffer[0].id : null;
}
