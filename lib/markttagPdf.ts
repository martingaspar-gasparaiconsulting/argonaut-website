// lib/markttagPdf.ts
// Markttag-Abrechnung (A4 hoch) via jsPDF: verkaufte Positionen eines Markttags
// (Produkt, Menge, Einzelpreis, Brutto) mit Netto-/MwSt-/Brutto-Summe. Keine Supabase.
import { jsPDF } from 'jspdf';

export interface MarkttagPdfPos { produkt: string; menge: string; einzelpreis: string; brutto: string }
export interface MarkttagPdfDaten {
  aussteller: string; ort: string; datum: string;
  posten: MarkttagPdfPos[];
  summeNetto: string; summeMwst: string; summeBrutto: string;
}

export function markttagPdf(d: MarkttagPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; kopfTabelle(); } }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Markttag-Abrechnung', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.ort || 'Markt'}  ·  ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 9;

  function kopfTabelle() {
    doc.setFillColor(240, 237, 228); doc.rect(L, y - 4, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('Produkt', L + 2, y + 1);
    doc.text('Menge', 118, y + 1, { align: 'right' });
    doc.text('Einzelpreis', 158, y + 1, { align: 'right' });
    doc.text('Brutto', R - 2, y + 1, { align: 'right' });
    y += 8;
  }
  kopfTabelle();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  for (const p of d.posten) {
    seite(7);
    doc.setTextColor(navy); doc.text(doc.splitTextToSize(p.produkt, 90), L + 2, y);
    doc.setTextColor(dim);
    doc.text(p.menge, 118, y, { align: 'right' });
    doc.text(p.einzelpreis, 158, y, { align: 'right' });
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold');
    doc.text(p.brutto, R - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 6.6; doc.setDrawColor(232); doc.line(L, y - 2.2, R, y - 2.2);
  }

  seite(24);
  y += 3; doc.setDrawColor(200); doc.line(120, y, R, y); y += 6;
  const zeile = (label: string, wert: string, fett = false) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(navy);
    doc.text(label, 120, y); doc.text(wert, R - 2, y, { align: 'right' }); y += 6;
  };
  zeile('Summe netto', d.summeNetto);
  zeile('MwSt', d.summeMwst);
  zeile('Tageserlös (brutto)', d.summeBrutto, true);

  seite(14);
  y += 8; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Interne Markttag-Abrechnung. Preise inkl. MwSt. §24-Pauschalierer setzen ihren Durchschnittssatz. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = `${d.ort || 'Markt'}_${d.datum}`.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Markttag_${name}.pdf`);
}
