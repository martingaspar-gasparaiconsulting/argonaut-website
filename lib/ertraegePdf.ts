// lib/ertraegePdf.ts
// Ertragsbericht für EINE Anlage (A4 hoch) via jsPDF: Kennzahlen-Kachel
// (Soll-Erreichung, Verfügbarkeit, Eigenverbrauch, Erlös) + Ablesungs-Tabelle.
import { jsPDF } from 'jspdf';

export interface ErtragPdfZeile { zeitraum: string; ertrag: string; spezifisch: string; soll: string; erreichung: string; verfuegbar: string }
export interface ErtragPdfDaten {
  aussteller: string;
  anlage: string;
  typ: string;
  leistung: string;   // z. B. "10 kWp"
  standort: string;
  zeitraum: string;   // Gesamtzeitraum
  sollErreichung: string;
  verfuegbarkeit: string;
  eigenverbrauch: string;
  erloes: string;
  ertragGesamt: string;
  zeilen: ErtragPdfZeile[];
}

export function ertraegePdf(d: ErtragPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; kopfTabelle(); } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Ertragsbericht', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.anlage} · ${d.typ}${d.leistung ? ` · ${d.leistung}` : ''}${d.standort ? ` · ${d.standort}` : ''}`, L, y);
  y += 5; doc.text(`Zeitraum ${d.zeitraum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Kennzahlen-Kachel
  doc.setFillColor(240, 237, 228); doc.roundedRect(L, y, R - L, 24, 2, 2, 'F');
  const zellB = (R - L) / 4;
  const zelle = (i: number, label: string, wert: string, gross = false) => {
    const cx = L + zellB * i + zellB / 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(dim);
    doc.text(label, cx, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(gross ? 16 : 13);
    doc.setTextColor(gross ? gold[0] : navy, gross ? gold[1] : navy, gross ? gold[2] : navy);
    doc.text(wert, cx, y + 17, { align: 'center' });
  };
  zelle(0, 'Soll-Erreichung', d.sollErreichung, true);
  zelle(1, 'Verfügbarkeit', d.verfuegbarkeit);
  zelle(2, 'Eigenverbrauch', d.eigenverbrauch);
  zelle(3, 'Erlös', d.erloes);
  y += 28;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(navy);
  doc.text(`Ertrag gesamt: ${d.ertragGesamt}`, L, y); y += 8;

  // Ablesungs-Tabelle
  function kopfTabelle() {
    doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(navy);
    doc.text('Zeitraum', L + 2, y + 5.5);
    doc.text('Ertrag', 92, y + 5.5, { align: 'right' });
    doc.text('spez.', 116, y + 5.5, { align: 'right' });
    doc.text('Soll', 140, y + 5.5, { align: 'right' });
    doc.text('Erreicht', 166, y + 5.5, { align: 'right' });
    doc.text('Verfügb.', R - 2, y + 5.5, { align: 'right' });
    y += 10;
  }
  kopfTabelle();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(navy);
  for (const z of d.zeilen) {
    seite(7);
    doc.setTextColor(navy); doc.text(z.zeitraum, L + 2, y);
    doc.setTextColor(dim);
    doc.text(z.ertrag, 92, y, { align: 'right' });
    doc.text(z.spezifisch, 116, y, { align: 'right' });
    doc.text(z.soll, 140, y, { align: 'right' });
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold');
    doc.text(z.erreichung, 166, y, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setTextColor(dim);
    doc.text(z.verfuegbar, R - 2, y, { align: 'right' });
    y += 7;
  }

  // Fußzeile
  seite(16);
  y += 4; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Spezifischer Ertrag = kWh je kWp. Soll-Erreichung = Ist gegen anteiligen Jahres-Sollertrag. Erlös = Einspeisevergütung + Eigenverbrauchs-Ersparnis. Angaben ohne Gewähr.', L, y, { maxWidth: R - L });

  const name = (d.anlage || 'Anlage').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Ertragsbericht_${name}.pdf`);
}
