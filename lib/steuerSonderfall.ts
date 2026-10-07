// ============================================================================
// ARGONAUT OS · lib/steuerSonderfall.ts — Paket 268 (07.10.2026)
//
// Steuerliche Sonderfälle einer Rechnung (Spalte rechnungen.steuer_sonderfall)
// an EINER Stelle: was auf dem PDF steht, welche Kategorie die E-Rechnung
// trägt und wie ein vorab verrechneter Betrag (Anzahlung, Inzahlungnahme)
// den Zahlbetrag mindert. Genutzt von der PDF-Route, lib/zugferd.ts und der
// Fahrzeug-Rechnung (lib/kfzRechnung.ts).
//
//   diff25a  Differenzbesteuerung (§ 25a UStG). Positionen mit 0 % sind die
//            differenzbesteuerten Gegenstände: Betrag OHNE Steuerausweis,
//            Pflichthinweis „Gebrauchtgegenstände/Sonderregelung"
//            (§ 14a Abs. 6 UStG). Positionen mit Steuersatz (z. B. Zulassung)
//            laufen normal mit Steuerausweis.
//   eu_ig    steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1 Buchst. b
//            i. V. m. § 6a UStG) — USt-IdNr. beider Seiten auf die Rechnung
//            (§ 14a Abs. 3 UStG).
//   ausfuhr  steuerfreie Ausfuhrlieferung (§ 4 Nr. 1 Buchst. a i. V. m. § 6 UStG).
//
// E-Rechnung (EN 16931): diff25a -> Kategorie E mit VATEX-EU-F (Gebraucht-
// gegenstände), eu_ig -> K mit VATEX-EU-IC, ausfuhr -> G mit VATEX-EU-G.
//
// Ohne Sonderfall (null) ändert sich NICHTS an bestehenden Rechnungen.
// Reine Logik, keine Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden, leseZahlOder } from './zahlen';

export type SteuerSonderfall = 'diff25a' | 'eu_ig' | 'ausfuhr';

export const SONDERFAELLE: { key: SteuerSonderfall; label: string }[] = [
  { key: 'diff25a', label: 'Differenzbesteuerung (§ 25a UStG)' },
  { key: 'eu_ig', label: 'Steuerfreie innergemeinschaftliche Lieferung' },
  { key: 'ausfuhr', label: 'Steuerfreie Ausfuhrlieferung' },
];

/** Liest den Wert der Spalte; alles Unbekannte -> null (= normale Rechnung). */
export function sonderfallLesen(roh: unknown): SteuerSonderfall | null {
  return roh === 'diff25a' || roh === 'eu_ig' || roh === 'ausfuhr' ? roh : null;
}

export function sonderfallLabel(s: SteuerSonderfall | null): string {
  return SONDERFAELLE.find((x) => x.key === s)?.label ?? '';
}

/** Text in der Spalte „MwSt" für eine Position mit 0 %. */
export function spaltenText(s: SteuerSonderfall | null, satz: number): string | null {
  if (!s || satz !== 0) return null;
  if (s === 'diff25a') return '§ 25a';
  return 'steuerfrei';
}

/** Bezeichnung der 0-%-Gruppe im Summenblock. */
export function gruppenLabel(s: SteuerSonderfall): string {
  if (s === 'diff25a') return 'Differenzbesteuert nach § 25a UStG (ohne gesonderten Steuerausweis)';
  if (s === 'eu_ig') return 'Steuerfreie innergemeinschaftliche Lieferung';
  return 'Steuerfreie Ausfuhrlieferung';
}

/**
 * Pflichthinweis auf der Rechnung. eigeneUstId/kundeUstId nur für eu_ig.
 * Fehlt dort eine USt-IdNr., steht das sichtbar als Lücke im Text.
 */
export function pflichtHinweis(s: SteuerSonderfall, eigeneUstId?: string | null, kundeUstId?: string | null): string {
  if (s === 'diff25a') {
    return 'Gebrauchtgegenstände/Sonderregelung (§ 25a UStG, § 14a Abs. 6 UStG). Für differenzbesteuerte Positionen wird die Umsatzsteuer nicht gesondert ausgewiesen; ein Vorsteuerabzug ist daraus nicht möglich.';
  }
  if (s === 'eu_ig') {
    const k = (kundeUstId ?? '').trim() || '— fehlt —';
    const e = (eigeneUstId ?? '').trim() || '— fehlt —';
    return `Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1 Buchst. b i. V. m. § 6a UStG). USt-IdNr. des Leistungsempfängers: ${k} · unsere USt-IdNr.: ${e}.`;
  }
  return 'Steuerfreie Ausfuhrlieferung (§ 4 Nr. 1 Buchst. a i. V. m. § 6 UStG).';
}

/** Kategorie und Befreiungsgrund für die E-Rechnung (Positionen mit 0 % unter dem Sonderfall). */
export function xmlKategorie(s: SteuerSonderfall): { kategorie: 'E' | 'K' | 'G'; code: string; grund: string } {
  if (s === 'diff25a') return { kategorie: 'E', code: 'VATEX-EU-F', grund: 'Differenzbesteuerung — Gebrauchtgegenstände/Sonderregelung (§ 25a UStG)' };
  if (s === 'eu_ig') return { kategorie: 'K', code: 'VATEX-EU-IC', grund: 'Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1b UStG)' };
  return { kategorie: 'G', code: 'VATEX-EU-G', grund: 'Steuerfreie Ausfuhrlieferung (§ 4 Nr. 1a UStG)' };
}

/** Vorab verrechneter Betrag (Anzahlung, Inzahlungnahme) -> was noch zu zahlen ist. */
export function zahlNachVorab(gesamt: number, vorab: unknown): { vorab: number; rest: number } {
  const roh = leseZahlOder(vorab, 0);
  const v = roh > 0 ? centRunden(roh) : 0;
  const g = Number.isFinite(gesamt) ? centRunden(gesamt) : 0;
  const vorabWirksam = Math.min(v, Math.max(0, g));
  return { vorab: vorabWirksam, rest: centRunden(g - vorabWirksam) };
}
