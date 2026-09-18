// ============================================================================
// ARGONAUT OS · lib/ustvaExport.ts — Export der UStVA-Kennziffern (PDF/CSV)
//
// Reine, node-testbare Aufbereitung der von lib/ustva.baueUstva berechneten
// Kennziffern in Export-Zeilen + eine CSV. Die PDF-Erzeugung (jspdf) passiert
// clientseitig auf der ELSTER-Seite und nutzt dieselben Zeilen. KEINE Netzwerk-/
// React-Abhängigkeit. Zweck: fehlerfreies Abtippen in ELSTER-Online.
// ============================================================================

import type { UstvaErgebnis } from './ustva';
import { csvFeld } from './csvSchreiben';

import { leseZahlOder } from './zahlen';

/** Zahl lesen — über den gemeinsamen Leser aus lib/zahlen.ts (Punkt 24). */
function z(x: unknown): number {
  return leseZahlOder(x, 0);
}

/**
 * Euro-Text ohne geschütztes Leerzeichen (PDF-/CSV-sicher): „1.234,50 €".
 *
 * Punkt 17: Ein negativer Wert behält sein Minus. Kennziffer 83 trägt seit
 * dem 18.09. ihr Vorzeichen, und genau dieses Minus muss in ELSTER mit
 * abgetippt werden — sonst wird aus einer Erstattung eine Zahlung.
 */
export function euroText(n: unknown): string {
  return z(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export type UstvaZeile = { kz: string; position: string; betrag: string };

/** Kennziffern in flache Export-Zeilen (Kz · Position · Betrag). */
export function ustvaZeilen(erg: UstvaErgebnis): UstvaZeile[] {
  return (erg?.kennziffern || []).map((k) => ({
    kz: k.kz,
    position: k.label.trim(),
    betrag: euroText(k.wert),
  }));
}

// csvFeld stand bis 16.09.2026 als eigene Kopie hier. Sie quotete korrekt,
// neutralisierte aber keine Formeln. Die Positionstexte kommen zwar aus dem
// eigenen UStVA-Katalog, der Zeitraum-Kopf aber aus der Oberflaeche — und
// einheitlich ist einheitlich. Jetzt aus lib/csvSchreiben.

/** UStVA als CSV (UTF-8-BOM, CRLF) — Kopf, Kennziffern, Zahllast. */
export function ustvaCsv(erg: UstvaErgebnis, von: string, bis: string): string {
  const zeilen: string[] = [];
  zeilen.push(csvFeld(`Umsatzsteuer-Voranmeldung ${von} bis ${bis}`));
  zeilen.push('');
  zeilen.push(['Kz', 'Position', 'Betrag'].join(';'));
  for (const r of ustvaZeilen(erg)) zeilen.push([r.kz, r.position, r.betrag].map((x) => csvFeld(x)).join(';'));
  zeilen.push('');
  const zl = erg.zahllast >= 0 ? 'USt-Zahllast ans Finanzamt' : 'Erstattung vom Finanzamt';
  zeilen.push(['', zl, euroText(Math.abs(erg.zahllast))].map((x) => csvFeld(x)).join(';'));
  return '﻿' + zeilen.join('\r\n');
}
