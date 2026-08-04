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
    faksimileHinweis(doc);
  } catch {
    /* Unterschrift optional — bei fehlerhaftem Bild bleibt die Linie leer. */
  }
}

/**
 * Q3: Einmaliger Gültigkeits-Hinweis am Seitenfuß. Wird ausschließlich aus
 * unterschriftUeberLinie aufgerufen — also nur, wenn tatsächlich eine
 * Faksimile-Unterschrift ins PDF gesetzt wurde. Der Hinweis sitzt ganz unten
 * im Seitensteg, unterhalb der üblichen „Erstellt mit ARGONAUT OS"-Zeile.
 */
export function faksimileHinweis(doc: jsPDF): void {
  try {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const txt =
      'Die verwendete Unterschrift ist ein elektronisches Faksimile (einfache elektronische Signatur). ' +
      'Sie ist ohne gesetzliche Formvorschrift wirksam, ersetzt aber keine eigenhändige oder qualifizierte ' +
      'Signatur, wo Schriftform verlangt wird.';
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.setTextColor(150, 160, 175);
    const lines = doc.splitTextToSize(txt, pw - 28) as string[];
    const lh = 2.3;
    const yStart = ph - 2.2 - (lines.length - 1) * lh;
    doc.text(lines, 14, yStart);
  } catch {
    /* Hinweis ist optional. */
  }
}
