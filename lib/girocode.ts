// ============================================================================
// ARGONAUT OS · lib/girocode.ts — GiroCode / EPC-QR für Rechnungen
//
// Der Kunde scannt den QR mit seiner Banking-App → Empfänger, IBAN, Betrag und
// Verwendungszweck sind vorausgefüllt. KEIN externer Dienst, alles aus einer
// Hand: Zahlungstext nach EPC-Standard (BCD/002/1/SCT) + eigener QR-Encoder.
//
// baueEpcText() liefert null, wenn keine gültige Überweisung möglich ist
// (fehlende/ungültige IBAN, Betrag ≤ 0). Dann wird einfach KEIN QR gezeigt.
// ============================================================================

import { qrMatrix } from './qr';
import { ibanGueltig } from './sepa';

export interface GiroDaten {
  empfaenger: string;   // Name des Zahlungsempfängers (max 70)
  iban: string;
  bic?: string;
  betrag: number;       // in EUR, > 0
  verwendungszweck?: string; // z. B. "Rechnung 2026-0042" (max 140)
}

// Auf die im EPC-Zeichensatz erlaubten Zeichen reduzieren (UTF-8 Charset "1").
function clean(s: string, max: number): string {
  return (s ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Baut den EPC-Zahlungstext (SEPA Credit Transfer). Gibt null zurück, wenn keine
 * valide Überweisung möglich ist. Prüft die IBAN per ISO-Prüfsumme.
 */
export function baueEpcText(d: GiroDaten): string | null {
  const iban = (d.iban ?? '').replace(/\s+/g, '').toUpperCase();
  const empfaenger = clean(d.empfaenger, 70);
  const betrag = Number(d.betrag);

  if (!empfaenger) return null;
  if (!iban || !ibanGueltig(iban)) return null;
  if (!Number.isFinite(betrag) || betrag <= 0 || betrag > 999999999.99) return null;

  const bic = (d.bic ?? '').replace(/\s+/g, '').toUpperCase();
  const betragStr = 'EUR' + betrag.toFixed(2);
  const zweck = clean(d.verwendungszweck ?? '', 140);

  // EPC-Zeilen (v002). Reihenfolge ist fix; leere Pflicht-Trennzeilen bleiben leer.
  const zeilen = [
    'BCD',          // Service Tag
    '002',          // Version
    '1',            // Zeichensatz 1 = UTF-8
    'SCT',          // SEPA Credit Transfer
    bic,            // BIC (optional im SEPA-Raum)
    empfaenger,     // Name Empfänger
    iban,           // IBAN Empfänger
    betragStr,      // Betrag EUR#.##
    '',             // Zweck-Code (leer)
    '',             // strukturierte Referenz (leer)
    zweck,          // Verwendungszweck (unstrukturiert)
  ];
  const text = zeilen.join('\n');

  // EPC erlaubt max. 331 Bytes. Sicherheitsnetz: bei Überlänge Zweck kürzen.
  if (new TextEncoder().encode(text).length > 331) {
    const kurz = [...zeilen];
    kurz[10] = clean(zweck, 60);
    const t2 = kurz.join('\n');
    return new TextEncoder().encode(t2).length > 331 ? null : t2;
  }
  return text;
}

export interface SvgOpt {
  groesse?: number;   // Kantenlänge in px (Default 150)
  rand?: number;      // Ruhezone in Modulen (Default 4, Standard)
  dunkel?: string;    // Farbe der Module (Default #0A1628)
  hell?: string;      // Hintergrund (Default #ffffff)
}

/** Rendert einen EPC-Text als eigenständiges, scharfes SVG (für PDF geeignet). */
export function girocodeSvg(epcText: string, opt: SvgOpt = {}): string {
  const groesse = opt.groesse ?? 150;
  const rand = opt.rand ?? 4;
  const dunkel = opt.dunkel ?? '#0A1628';
  const hell = opt.hell ?? '#ffffff';

  const m = qrMatrix(epcText);
  const n = m.length;
  const total = n + rand * 2;

  // Module als ein einziger Pfad (kompakt, scharf).
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) {
    const x = c + rand, y = r + rand;
    d += `M${x} ${y}h1v1h-1z`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${groesse}" height="${groesse}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="GiroCode zum Bezahlen">`
    + `<rect width="${total}" height="${total}" fill="${hell}"/>`
    + `<path d="${d}" fill="${dunkel}"/>`
    + `</svg>`;
}

/** Bequemer Einzeiler: Daten rein → SVG-String oder null (kein QR möglich). */
export function girocodeVonDaten(d: GiroDaten, opt: SvgOpt = {}): string | null {
  const text = baueEpcText(d);
  return text ? girocodeSvg(text, opt) : null;
}
