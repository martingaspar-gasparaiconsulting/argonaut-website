// lib/belegungsplanPdf.ts
// Belegungsplan (A4 hoch) via jsPDF: kommende Belegungen nach Tag gruppiert, je
// Eintrag Zeit, Ressource, Titel, Verantwortlich und Status. Keine Supabase.
import { jsPDF } from 'jspdf';

export interface BelegungsplanPos { zeit: string; ressource: string; titel: string; verantwortlich: string; status: string }
export interface BelegungsplanTag { datum: string; posten: BelegungsplanPos[] }
export interface BelegungsplanPdfDaten { aussteller: string; titel: string; datum: string; tage: BelegungsplanTag[] }

export function belegungsplanPdf(d: BelegungsplanPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; } }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text(d.titel || 'Belegungsplan', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`Stand ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 9;

  if (d.tage.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
    doc.text('Keine Belegungen im Zeitraum.', L, y);
  }

  for (const t of d.tage) {
    seite(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.text(t.datum, L, y); y += 2; doc.setDrawColor(230); doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 6;
    doc.setFontSize(9.5);
    for (const p of t.posten) {
      seite(7);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(navy); doc.text(p.zeit, L, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(navy);
      doc.text(doc.splitTextToSize(p.ressource, 34), L + 26, y);
      doc.text(doc.splitTextToSize(p.titel, 74), L + 66, y);
      doc.setTextColor(dim);
      doc.text(p.verantwortlich, 158, y);
      doc.text(p.status, R - 2, y, { align: 'right' });
      y += 6.4; doc.setDrawColor(238); doc.line(L, y - 2.1, R, y - 2.1);
    }
    y += 4;
  }

  seite(14);
  y += 6; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Belegungsplan — Zeiten inklusiv Beginn, exklusiv Ende. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.titel || 'Belegungsplan').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Belegungsplan_${name}.pdf`);
}
