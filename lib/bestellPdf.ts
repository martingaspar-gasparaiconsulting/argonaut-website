// lib/bestellPdf.ts
// Bestellung an Lieferant (A4 hoch) via jsPDF: Kopf, Lieferant, Positions-
// Tabelle (Menge × EK) und Netto-/Brutto-Summe. Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface BestellPdfPos { artikel: string; menge: string; einheit: string; ekPreis: string; netto: string }
export interface BestellPdfDaten {
  aussteller: string;
  bestellNr: string;
  datum: string;
  lieferant: string;
  ansprechpartner: string;
  kundennummer: string;
  notiz: string;
  positionen: BestellPdfPos[];
  summeNetto: string;
  summeBrutto: string;
}

export function bestellPdf(d: BestellPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; kopfTabelle(); } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Bestellung', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`Bestell-Nr. ${d.bestellNr || '—'}  ·  Datum ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Lieferant
  doc.setTextColor(dim); doc.setFontSize(9); doc.text('Lieferant', L, y);
  doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  y += 5; doc.text(d.lieferant || '—', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
  const zeilen = [d.ansprechpartner && `z. Hd. ${d.ansprechpartner}`, d.kundennummer && `Unsere Kundennr.: ${d.kundennummer}`].filter(Boolean) as string[];
  for (const z of zeilen) { y += 5; doc.text(z, L, y); }
  y += 9;

  // Tabelle
  function kopfTabelle() {
    doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('Artikel', L + 2, y + 5.5);
    doc.text('Menge', 118, y + 5.5, { align: 'right' });
    doc.text('Einheit', 124, y + 5.5);
    doc.text('EK netto', 158, y + 5.5, { align: 'right' });
    doc.text('Netto', R - 2, y + 5.5, { align: 'right' });
    y += 10;
  }
  kopfTabelle();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  for (const p of d.positionen) {
    seite(7);
    doc.setTextColor(navy); doc.text(doc.splitTextToSize(p.artikel, 62), L + 2, y);
    doc.setTextColor(dim);
    doc.text(p.menge, 118, y, { align: 'right' });
    doc.text(p.einheit, 124, y);
    doc.text(p.ekPreis, 158, y, { align: 'right' });
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold');
    doc.text(p.netto, R - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  }

  // Summen
  seite(22);
  y += 2; doc.setDrawColor(200); doc.line(120, y, R, y); y += 6;
  const zeile = (label: string, wert: string, fett = false) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal'); doc.setFontSize(10); doc.setTextColor(navy);
    doc.text(label, 120, y); doc.text(wert, R - 2, y, { align: 'right' }); y += 6;
  };
  zeile('Summe netto', d.summeNetto, true);
  zeile('Summe brutto (inkl. MwSt)', d.summeBrutto);

  // Notiz
  if (d.notiz) {
    seite(16);
    y += 4; doc.setTextColor(dim); doc.setFontSize(9.5); doc.setFont('helvetica', 'bold');
    doc.text('Anmerkung', L, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(navy);
    doc.text(doc.splitTextToSize(d.notiz, R - L), L, y);
  }

  // Fußzeile
  seite(14);
  y += 8; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Bestellung ohne Unterschrift gültig. Bitte Bestell-Nr. bei Lieferung und Rechnung angeben. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.bestellNr || 'Bestellung').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Bestellung_${name}.pdf`);
}
