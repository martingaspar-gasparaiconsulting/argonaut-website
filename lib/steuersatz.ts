// ============================================================================
// ARGONAUT OS · lib/steuersatz.ts — DER eine Leser fuer Umsatzsteuer-Saetze
//
// Reine Logik: keine Supabase-Aufrufe, keine React-Hooks. Von Client-Seiten
// UND Server-Routen nutzbar.
//
// Befund HW-0 (P352, 15.10.2026): Die Rechnungs-Routen schrieben
//   mwst_satz: Number(p.mwst_satz) || 19
// Number(0) ist 0, und 0 || 19 ergibt 19. Eine steuerfreie Leistung (0 %,
// z. B. Kleinunternehmer-Position, innergemeinschaftlich, Photovoltaik nach
// § 12 Abs. 3 UStG) wurde beim Weiterreichen Angebot -> Rechnung still zu
// 19 % — der Kunde bekam 19 % Umsatzsteuer zu viel in Rechnung gestellt.
//
// Regel:
//   - FEHLT der Satz (null, undefined, leerer Text, unlesbar) -> Standard 19 %
//   - ein ausdrueckliches 0 bleibt 0 (steuerfreie Leistungen gibt es wirklich)
//   - 7, 19 und jeder andere lesbare Satz >= 0 bleibt, wie er ist
//   - negative Saetze gibt es nicht -> Standard
// ============================================================================

import { leseZahl } from './zahlen';

export const MWST_STANDARD = 19;

export function steuersatz(wert: unknown, standard: number = MWST_STANDARD): number {
  if (wert === null || wert === undefined) return standard;
  if (typeof wert === 'string' && wert.trim() === '') return standard;
  const n = leseZahl(wert);
  if (n === null || !Number.isFinite(n) || n < 0) return standard;
  return n;
}
