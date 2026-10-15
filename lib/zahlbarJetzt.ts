// ============================================================================
// ARGONAUT OS · lib/zahlbarJetzt.ts — HW-6 (15.10.2026)
//
// DIE eine Rechenstelle fuer „was ist an dieser Rechnung JETZT offen?".
// Genutzt von Mahnung (mahnwesen/[id]), Mahnliste (mahnwesen) und dem
// Ueberfaellig-Lauf (/api/rechnungen-ueberfaellig).
//
// Befund HW-6: Alle drei rechneten offen = brutto_summe − bezahlter_betrag.
//   - Schlussrechnung: brutto_summe ist die GESAMTE Leistung. Die schon mit
//     Abschlagsrechnungen berechneten Betraege (netto + Steuer, § 14 Abs. 5
//     UStG) wurden nicht abgezogen — die Mahnung forderte sie ein zweites Mal.
//   - Sicherheitseinbehalt (VOB/B § 17): erst nach Ablauf der Gewaehrleistung
//     faellig, wurde aber mit angemahnt.
// Regel (gleich wie das Rechnungs-PDF):
//   Rest = Brutto − abgesetzte Abschlaege (netto + Steuer; bei § 13b ohne Steuer)
//   Einbehalt = Satz vom Rest (Basis brutto oder netto laut Vertrag)
//   jetzt faellig = Rest − Einbehalt;  offen = jetzt faellig − bezahlt
// Skonto wird NICHT abgezogen: wer mahnt, ist ueber die Skontofrist hinaus.
//
// Reine Logik, keine Supabase-Aufrufe, node-testbar.
// ============================================================================

import { leseZahlOder, centRunden } from './zahlen';
import { rechneEinbehalt } from './sicherheitseinbehalt';

export interface ZahlbarRechnung {
  rechnungsart?: string | null;
  netto_summe?: unknown;
  brutto_summe?: unknown;
  bezahlter_betrag?: unknown;
  einbehalt_prozent?: unknown;
  einbehalt_basis?: string | null;
  reverse_charge?: boolean | null;
  kleinunternehmer?: boolean | null;
}

export interface ZahlbarAbschlag {
  netto?: unknown;
  steuer?: unknown;
  storniert?: boolean | null;
}

export interface ZahlbarErgebnis {
  /** Was auf der Rechnung als Gesamtbetrag steht. */
  gesamt: number;
  /** Bereits mit Abschlagsrechnungen berechnet (nur Schlussrechnung). */
  abgesetzt: number;
  /** Gesamt minus Abschlaege. */
  rest: number;
  /** Sicherheitseinbehalt — spaeter faellig, nicht anmahnen. */
  einbehalt: number;
  /** Rest minus Einbehalt. */
  faelligJetzt: number;
  bezahlt: number;
  /** faelligJetzt minus bezahlt. Kann negativ sein (Ueberzahlung). */
  offen: number;
}

export function zahlbarJetzt(r: ZahlbarRechnung, abschlaege: readonly ZahlbarAbschlag[] = []): ZahlbarErgebnis {
  const rc = !!r?.reverse_charge && !r?.kleinunternehmer;
  const netto = centRunden(leseZahlOder(r?.netto_summe, 0));
  const bruttoRoh = r?.brutto_summe == null ? netto : centRunden(leseZahlOder(r?.brutto_summe, 0));
  // § 13b: Brutto = Netto, auch wenn eine alte Zeile Steuer im Brutto traegt
  const gesamt = rc ? netto : bruttoRoh;

  let abgesetztNetto = 0;
  let abgesetzt = 0;
  if (String(r?.rechnungsart ?? '') === 'schluss') {
    for (const a of Array.isArray(abschlaege) ? abschlaege : []) {
      if (a?.storniert) continue;
      const n = leseZahlOder(a?.netto, 0);
      const s = rc ? 0 : leseZahlOder(a?.steuer, 0);
      abgesetztNetto += n;
      abgesetzt += n + s;
    }
  }
  abgesetzt = centRunden(abgesetzt);
  const rest = centRunden(gesamt - abgesetzt);
  const restNetto = centRunden(netto - abgesetztNetto);

  const eb = rechneEinbehalt(
    rest,
    { prozent: r?.einbehalt_prozent, basis: r?.einbehalt_basis === 'netto' ? 'netto' : 'brutto' },
    restNetto,
  );
  const einbehalt = rest > 0 ? eb.einbehalt : 0;
  const faelligJetzt = centRunden(rest - einbehalt);
  const bezahlt = centRunden(leseZahlOder(r?.bezahlter_betrag, 0));
  return { gesamt, abgesetzt, rest, einbehalt, faelligJetzt, bezahlt, offen: centRunden(faelligJetzt - bezahlt) };
}

/** Braucht diese Rechnung die abgesetzten Abschlaege (Tabelle rechnung_abschlaege)? */
export function brauchtAbschlaege(r: ZahlbarRechnung): boolean {
  return String(r?.rechnungsart ?? '') === 'schluss';
}
