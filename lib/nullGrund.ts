// ============================================================================
// ARGONAUT OS · lib/nullGrund.ts — HW-17 (15.10.2026)
//
// Grund fuer Positionen mit 0 % Umsatzsteuer, wenn KEIN anderer Fall greift
// (nicht Kleinunternehmer § 19, nicht § 13b, kein Sonderfall § 25a / EU /
// Ausfuhr aus Paket 268).
//
// Befund HW-17: Eine solche Position druckte „zzgl. 0 % Umsatzsteuer" ohne
// Grund. § 14 Abs. 4 Nr. 8 UStG verlangt bei einer Steuerbefreiung einen
// Hinweis darauf; und die E-Rechnung schrieb Kategorie S (Normalsatz) mit 0 %
// — das verletzt BR-S-05 und faellt bei jeder XRechnung-Pruefung durch.
//
// Zwei Gruende (Spalte rechnungen.null_grund, SQL p372):
//   pv_null     Nullsteuersatz fuer Photovoltaik (§ 12 Abs. 3 UStG)
//               -> E-Rechnung Kategorie Z (Nullsatz), kein Befreiungsgrund
//   steuerfrei  Steuerbefreiung nach einer Vorschrift, die der Betrieb nennt
//               (Spalte null_grund_text, z. B. „§ 4 Nr. 11 UStG")
//               -> E-Rechnung Kategorie E mit Befreiungsgrund (Pflicht BR-E-10)
// Wortlaute: an den Anwalt / Steuerberater (Anwalt-Checkliste R63).
//
// Reine Logik, node-testbar.
// ============================================================================

import { leseZahl } from './zahlen';

export type NullGrund = 'pv_null' | 'steuerfrei';

export const NULL_GRUENDE: { key: NullGrund; label: string }[] = [
  { key: 'pv_null', label: 'Nullsteuersatz Photovoltaik (§ 12 Abs. 3 UStG)' },
  { key: 'steuerfrei', label: 'Steuerfrei nach einer Vorschrift (bitte nennen)' },
];

export function nullGrundLesen(roh: unknown): NullGrund | null {
  return roh === 'pv_null' || roh === 'steuerfrei' ? roh : null;
}

/** Vorschrift fuer „steuerfrei", gekuerzt und ohne Zeilenumbrueche. */
export function vorschriftText(roh: unknown): string {
  return String(roh ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** Ist der Grund vollstaendig? („steuerfrei" braucht die Vorschrift.) */
export function nullGrundVollstaendig(grund: NullGrund | null, text: unknown): boolean {
  if (grund === 'pv_null') return true;
  if (grund === 'steuerfrei') return vorschriftText(text).length >= 3;
  return false;
}

/** Hinweis auf der Rechnung. */
export function nullGrundHinweis(grund: NullGrund, text?: unknown): string {
  if (grund === 'pv_null') {
    return 'Für die mit 0 % ausgewiesenen Positionen gilt der Nullsteuersatz nach § 12 Abs. 3 UStG (Lieferung und Installation von Photovoltaikanlagen).';
  }
  const v = vorschriftText(text) || '— Vorschrift fehlt —';
  return `Die mit 0 % ausgewiesenen Positionen sind steuerfrei nach ${v}.`;
}

/** Kategorie fuer die E-Rechnung (Positionen mit 0 %). */
export function nullGrundXml(grund: NullGrund, text?: unknown): { kategorie: 'Z' | 'E'; grund: string | null } {
  if (grund === 'pv_null') return { kategorie: 'Z', grund: null };
  return { kategorie: 'E', grund: `Steuerfrei nach ${vorschriftText(text) || 'nicht genannter Vorschrift'}` };
}

/**
 * Braucht diese Rechnung einen Grund? Ja, wenn mindestens eine Position 0 %
 * traegt und weder § 19 noch § 13b noch ein Sonderfall (Paket 268) gilt.
 */
export function brauchtNullGrund(
  saetze: readonly unknown[],
  opt: { kleinunternehmer?: boolean; reverseCharge?: boolean; sonderfall?: unknown },
): boolean {
  if (opt.kleinunternehmer || opt.reverseCharge) return false;
  if (opt.sonderfall === 'diff25a' || opt.sonderfall === 'eu_ig' || opt.sonderfall === 'ausfuhr') return false;
  return (Array.isArray(saetze) ? saetze : []).some((s) => String(s ?? '').trim() !== '' && leseZahl(s) === 0);
}
