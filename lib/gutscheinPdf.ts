// lib/gutscheinPdf.ts
// Druckfertiger Gutschein (A4 quer) zum Aushändigen/Versenden. Client-seitig via
// jsPDF. Neutral gehalten, on-brand Navy/Gold. Zeigt Code, Wert/Inhalt, Empfänger,
// Anlass, Gültigkeit (§195 BGB) und Restwert.
import { jsPDF } from 'jspdf';

export interface GutscheinPdfDaten {
  aussteller: string;
  code: string;
  artLabel: string;
  wertText: string;      // z. B. "50,00 €" oder "10 Nutzungen"
  leistung?: string;
  empfaenger?: string;
  anlass?: string;
  ausgestelltAm: string; // formatiert
  gueltigBis: string;    // formatiert
  restText?: string;
}

export function gutscheinPdf(d: GutscheinPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const navy: [number, number, number] = [10, 22, 40];
  const gold: [number, number, number] = [201, 168, 76];
  const dim = 120;
  const PW = 297, PH = 210;

  // Rahmen
  doc.setFillColor(navy[0], navy[1], navy[2]);
  doc.rect(0, 0, PW, PH, 'F');
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(1.2);
  doc.rect(12, 12, PW - 24, PH - 24);

  // Kopf
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text((d.aussteller || 'GUTSCHEIN').toUpperCase(), PW / 2, 34, { align: 'center' });

  doc.setTextColor(255, 255, 255); doc.setFontSize(46);
  doc.text('GUTSCHEIN', PW / 2, 62, { align: 'center' });

  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.5);
  doc.line(PW / 2 - 40, 70, PW / 2 + 40, 70);

  // Wert (groß)
  doc.setTextColor(gold[0], gold[1], gold[2]); doc.setFontSize(40);
  doc.text(d.wertText || '', PW / 2, 96, { align: 'center' });

  // Inhalt / Leistung
  doc.setTextColor(230, 235, 244); doc.setFont('helvetica', 'normal'); doc.setFontSize(14);
  let y = 110;
  if (d.leistung) { doc.text(doc.splitTextToSize(d.leistung, PW - 80), PW / 2, y, { align: 'center' }); y += 9; }
  if (d.empfaenger) { doc.setFontSize(13); doc.setTextColor(200, 208, 220); doc.text(`Für: ${d.empfaenger}${d.anlass ? '  ·  ' + d.anlass : ''}`, PW / 2, y, { align: 'center' }); y += 8; }

  // Fußzeile: Code + Gültigkeit
  doc.setTextColor(dim); doc.setFontSize(11);
  doc.text(`Code: ${d.code}`, 24, PH - 24);
  doc.text(`${d.artLabel}`, 24, PH - 17);
  const rechts = [`Ausgestellt: ${d.ausgestelltAm}`, `Gültig bis: ${d.gueltigBis}`];
  if (d.restText) rechts.push(`Restwert: ${d.restText}`);
  rechts.forEach((t, i) => doc.text(t, PW - 24, PH - 24 + i * 6, { align: 'right' }));

  doc.setFontSize(8); doc.setTextColor(dim);
  doc.text('Gültigkeit gem. § 195/§ 199 BGB (3 Jahre ab Jahresende). Keine Barauszahlung des Restbetrags.', PW / 2, PH - 15, { align: 'center' });

  const name = (d.code || 'Gutschein').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  doc.save(`Gutschein_${name}.pdf`);
}
