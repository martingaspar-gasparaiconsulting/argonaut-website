// ============================================================================
// ARGONAUT OS · lib/rechnungAusAuftrag.ts — HW-7 (15.10.2026)
//
// Auftragspositionen -> Rechnungspositionen und Kopfsummen.
//
// Befund HW-7 (rechnung-aus-auftrag):
//   - Summen kamen ungeprueft aus dem Auftragskopf. Der Auftrag rechnete die
//     Steuer ueber ALLE Zeilen ungerundet und rundete erst am Ende — nicht je
//     Steuersatz (§ 14 Abs. 4 Nr. 8 UStG). Kopf und Positionen der Rechnung
//     konnten so um Cents auseinanderliegen.
//   - Leerer Steuersatz wurde 19, 0 % blieb 0 (ok) — jetzt einheitlich ueber
//     lib/steuersatz.ts.
// Regel: Zeilen-Netto = gespeichertes gesamt_netto, sonst Menge x Preis,
// je Zeile auf Cent gerundet; Summen ueber kopfSummen (je Steuersatz).
//
// Reine Logik, node-testbar.
// ============================================================================

import { leseZahl, leseZahlOder, centRunden } from './zahlen';
import { steuersatz } from './steuersatz';
import { kopfSummen, type KopfSummen } from './rechnungKopf';

export interface AuftragPosition {
  position?: unknown;
  bezeichnung?: string | null;
  beschreibung?: string | null;
  menge?: unknown;
  einheit?: string | null;
  einzelpreis?: unknown;
  mwst_satz?: unknown;
  gesamt_netto?: unknown;
}

export interface RechnungsPosten {
  position: number;
  bezeichnung: string;
  beschreibung: string | null;
  menge: number;
  einheit: string;
  einzelpreis: number;
  mwst_satz: number;
  gesamt_netto: number;
}

export function zeilenNetto(p: AuftragPosition): number {
  const gespeichert = leseZahl(p?.gesamt_netto);
  if (gespeichert !== null) return centRunden(gespeichert);
  return centRunden(leseZahlOder(p?.menge, 0) * leseZahlOder(p?.einzelpreis, 0));
}

export function auftragZuRechnung(
  positionen: readonly AuftragPosition[],
  opt: { kleinunternehmer?: boolean } = {},
): { posten: RechnungsPosten[]; summen: KopfSummen } {
  const posten = (Array.isArray(positionen) ? positionen : []).map((p, i) => {
    const pos = leseZahl(p?.position);
    return {
      position: pos !== null && pos > 0 ? Math.trunc(pos) : i + 1,
      bezeichnung: (p?.bezeichnung || '').trim() || '(ohne Bezeichnung)',
      beschreibung: p?.beschreibung ?? null,
      menge: leseZahlOder(p?.menge, 1),
      einheit: (p?.einheit || '').trim() || 'Stk',
      einzelpreis: leseZahlOder(p?.einzelpreis, 0),
      mwst_satz: opt.kleinunternehmer ? 0 : steuersatz(p?.mwst_satz),
      gesamt_netto: zeilenNetto(p),
    };
  });
  const summen = kopfSummen(
    posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })),
    { kleinunternehmer: opt.kleinunternehmer },
  );
  return { posten, summen };
}
