// ============================================================================
// ARGONAUT OS · lib/rechnungKopf.ts — HW-5 (15.10.2026)
//
// Die Summen im Rechnungskopf (netto_summe, mwst_summe, brutto_summe), die
// GESPEICHERT werden. Aus brutto_summe rechnen Mahnwesen, Ueberfaellig-Lauf,
// offene Posten und der Zahlungsstatus („bezahlt" erst, wenn die Zahlungen
// brutto_summe erreichen).
//
// Befund HW-5: Bei § 13b UStG (Steuerschuldnerschaft des Leistungsempfaengers,
// Spalte reverse_charge) zeigten PDF und E-Rechnung richtig nur Netto ohne
// Steuer — die Rechnungsseite speicherte aber Brutto MIT 19 %. Folge: Mahnung
// und offene Posten forderten 19 % zu viel, und eine korrekt (netto) bezahlte
// Rechnung blieb fuer immer „teilweise bezahlt".
//
// Regel (gleich wie PDF-Route und lib/zugferd.ts):
//   - Kleinunternehmer (§ 19): alle Saetze 0, keine Steuergruppen
//   - § 13b: Steuergruppen bleiben (fuer Schlussrechnung/Abschlaege),
//            aber Steuer 0 und Brutto = Netto
//   - sonst: Steuer je Satz gruppiert und gerundet (§ 14 Abs. 4 Nr. 8 UStG)
// Kleinunternehmer geht vor § 13b (ein Kleinunternehmer weist nie Steuer aus).
//
// Reine Logik, node-testbar.
// ============================================================================

import { steuerGruppen, type SteuerPosten, type SteuerGruppe } from '../app/dashboard/_components/steuerLogik';

export type OhneSteuerGrund = 'kleinunternehmer' | 'reverse_charge' | null;

export interface KopfSummen {
  netto: number;
  mwst: number;
  brutto: number;
  gruppen: SteuerGruppe[];
  ohneSteuer: OhneSteuerGrund;
}

export function kopfSummen(
  posten: readonly SteuerPosten[],
  opt: { kleinunternehmer?: boolean; reverseCharge?: boolean },
): KopfSummen {
  if (opt.kleinunternehmer) {
    const s = steuerGruppen(posten.map((p) => ({ ...p, satz: 0 })));
    return { netto: s.netto, mwst: 0, brutto: s.netto, gruppen: [], ohneSteuer: 'kleinunternehmer' };
  }
  const s = steuerGruppen(posten);
  if (opt.reverseCharge) {
    return { netto: s.netto, mwst: 0, brutto: s.netto, gruppen: s.gruppen, ohneSteuer: 'reverse_charge' };
  }
  return { netto: s.netto, mwst: s.steuer, brutto: s.brutto, gruppen: s.gruppen, ohneSteuer: null };
}
