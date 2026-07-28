// lib/variantenMatrixPdf.ts
// Varianten- & Preisliste einer Matrix (A4 hoch) via jsPDF: Kopf, Matrix-Info,
// Tabelle je Variante (SKU · Achse1 · Achse2 · Aufpreis · VK · Bestand) und
// Summenzeile. Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface VariantenPdfZeile {
  sku: string;
  a1: string;
  a2: string;
  aufpreis: string;
  vk: string;
  bestand: string;
}
export interface VariantenPdfDaten {
  aussteller: string;
  titel: string;         // Gruppen-Bezeichnung
  datum: string;
  achse1Name: string;
  achse2Name: string;    // leer bei eindimensionaler Matrix
  basisVk: string;
  zeilen: VariantenPdfZeile[];
  summeBestand: string;
}

export function variantenMatrixPdf(d: VariantenPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  const zweiAchsen = (d.achse2Name || '').trim().length > 0;

  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; kopfTabelle(); } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Varianten- & Preisliste', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.titel || '—'}  ·  Stand ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Matrix-Info
  doc.setTextColor(dim); doc.setFontSize(9.5);
  const info = [
    `Basis-VK: ${d.basisVk}`,
    `Achse 1: ${d.achse1Name || '—'}`,
    zweiAchsen ? `Achse 2: ${d.achse2Name}` : 'Achse 2: —',
    `Varianten: ${d.zeilen.length}`,
  ].join('     ');
  doc.text(info, L, y); y += 9;

  // Tabelle
  function kopfTabelle() {
    doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('SKU', L + 2, y + 5.5);
    doc.text(d.achse1Name || 'Achse 1', 66, y + 5.5);
    doc.text(zweiAchsen ? d.achse2Name : '', 100, y + 5.5);
    doc.text('Aufpreis', 150, y + 5.5, { align: 'right' });
    doc.text('VK', 172, y + 5.5, { align: 'right' });
    doc.text('Bestand', R - 2, y + 5.5, { align: 'right' });
    y += 10;
  }
  kopfTabelle();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  for (const z of d.zeilen) {
    seite(7);
    doc.setTextColor(navy); doc.text(doc.splitTextToSize(z.sku || '—', 44), L + 2, y);
    doc.setTextColor(dim);
    doc.text(doc.splitTextToSize(z.a1 || '—', 32), 66, y);
    if (zweiAchsen) doc.text(doc.splitTextToSize(z.a2 || '—', 46), 100, y);
    doc.text(z.aufpreis, 150, y, { align: 'right' });
    doc.setTextColor(navy); doc.text(z.vk, 172, y, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.text(z.bestand, R - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  }

  // Summe
  seite(16);
  y += 2; doc.setDrawColor(200); doc.line(120, y, R, y); y += 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(navy);
  doc.text('Bestand gesamt', 120, y); doc.text(d.summeBestand, R - 2, y, { align: 'right' }); y += 6;

  // Fußzeile
  seite(14);
  y += 8; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Interne Varianten- & Preisliste. VK netto zzgl. USt. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.titel || 'Varianten').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Varianten_${name}.pdf`);
}
