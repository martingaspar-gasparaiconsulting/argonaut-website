// lib/betriebskostenPdf.ts
// Betriebskostenabrechnung für EINE Einheit (A4 hoch) via jsPDF.
// Positionen mit Gesamtbetrag, Verteilerschlüssel und Mieter-Anteil, dazu
// Vorauszahlung und Saldo (Nachzahlung/Guthaben).
import { jsPDF } from 'jspdf';

export interface BkPosition { bezeichnung: string; gesamt: string; schluessel: string; anteil: string; }
export interface BkPdfDaten {
  aussteller: string;
  objekt: string;
  zeitraum: string;
  einheit: string;
  mieter: string;
  wohnflaeche: string;
  positionen: BkPosition[];
  summe: string;
  vorauszahlung: string;
  saldo: string;
  nachzahlung: boolean;
}

export function betriebskostenPdf(d: BkPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; kopfTabelle(); } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Betriebskostenabrechnung', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.objekt}  ·  Abrechnungszeitraum ${d.zeitraum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Mieter
  doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(`Einheit: ${d.einheit}`, L, y);
  if (d.mieter) doc.text(`Mieter: ${d.mieter}`, L + 90, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(dim);
  if (d.wohnflaeche) { y += 5; doc.text(`Wohnfläche: ${d.wohnflaeche}`, L, y); }
  y += 8;

  // Tabellenkopf
  function kopfTabelle() {
    doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('Kostenart', L + 2, y + 5.5);
    doc.text('Gesamt', 118, y + 5.5, { align: 'right' });
    doc.text('Schlüssel', 122, y + 5.5);
    doc.text('Ihr Anteil', R - 2, y + 5.5, { align: 'right' });
    y += 10;
  }
  kopfTabelle();

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  for (const p of d.positionen) {
    seite(7);
    doc.setTextColor(navy);
    doc.text(doc.splitTextToSize(p.bezeichnung, 60), L + 2, y);
    doc.setTextColor(dim);
    doc.text(p.gesamt, 118, y, { align: 'right' });
    doc.text(doc.splitTextToSize(p.schluessel, 45), 122, y);
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold');
    doc.text(p.anteil, R - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  }

  // Summen
  seite(30);
  y += 2; doc.setDrawColor(200); doc.line(L, y, R, y); y += 6;
  const zeile = (label: string, wert: string, fett = false, farbe?: [number, number, number]) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(10);
    if (farbe) doc.setTextColor(farbe[0], farbe[1], farbe[2]); else doc.setTextColor(navy);
    doc.text(label, 118, y); doc.text(wert, R - 2, y, { align: 'right' }); y += 6;
  };
  zeile('Summe Ihrer Betriebskosten', d.summe, true);
  zeile('abzüglich Vorauszahlungen', d.vorauszahlung);
  y += 1; doc.setDrawColor(200); doc.line(118, y, R, y); y += 6;
  zeile(d.nachzahlung ? 'Nachzahlung' : 'Guthaben', d.saldo, true, d.nachzahlung ? [200, 90, 60] : [60, 140, 90]);

  // Fußzeile
  seite(16);
  y += 6; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Umlage nach § 2 BetrKV; Heiz-/Warmwasserkosten nach HeizkostenV. Einwendungen bis 12 Monate nach Zugang (§ 556 Abs. 3 BGB). Angaben ohne Gewähr.', L, y, { maxWidth: R - L });

  const name = (d.einheit || 'Abrechnung').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  doc.save(`Betriebskostenabrechnung_${name}.pdf`);
}
