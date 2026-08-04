// ============================================================================
// ARGONAUT OS · lib/unterschriftPdf.ts
// Setzt eine Unterschrift (PNG-DataURL) linksbündig ÜBER eine Signaturlinie
// in einem jsPDF-Dokument. Die Breite ist fix, die Höhe folgt dem Bild-
// Seitenverhältnis (keine Verzerrung, egal ob gezeichnet oder hochgeladen).
// Fehlt die Unterschrift oder ist das Bild fehlerhaft, passiert nichts —
// die Linie bleibt einfach leer.
// ============================================================================

import type { jsPDF } from 'jspdf';

/**
 * @param doc     jsPDF-Dokument
 * @param dataUrl Unterschrift als PNG-DataURL (oder null)
 * @param x       linke Kante (= Start der Signaturlinie), in mm
 * @param lineY   Y der Signaturlinie, in mm — die Unterschrift sitzt darüber
 */
export function unterschriftUeberLinie(
  doc: jsPDF,
  dataUrl: string | null | undefined,
  x: number,
  lineY: number,
  maxBreite = 55,
  maxHoehe = 20,
): void {
  if (!dataUrl) return;
  try {
    const p = doc.getImageProperties(dataUrl);
    let w = maxBreite;
    let h = (p.height / p.width) * w;
    if (h > maxHoehe) {
      h = maxHoehe;
      w = (p.width / p.height) * h;
    }
    doc.addImage(dataUrl, 'PNG', x, lineY - h - 1.5, w, h);
  } catch {
    /* Unterschrift optional — bei fehlerhaftem Bild bleibt die Linie leer. */
  }
}
