// lib/proofingPdf.ts
// Freigabe-Protokoll für EIN Asset (A4 hoch) via jsPDF: Kopf, Status,
// Versionshistorie und Feedback-/Freigabe-Log. Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface ProofVersionZeile { version: string; datum: string; status: string; beschreibung: string }
export interface ProofFeedbackZeile { datum: string; autor: string; typ: string; text: string }
export interface ProofPdfDaten {
  aussteller: string;
  titel: string;
  kunde: string;
  kategorie: string;
  status: string;
  versionen: ProofVersionZeile[];
  feedback: ProofFeedbackZeile[];
}

export function proofingPdf(d: ProofPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Freigabe-Protokoll', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.titel}${d.kategorie ? ` · ${d.kategorie}` : ''}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Kopfdaten
  doc.setFontSize(10);
  doc.setTextColor(dim); doc.text('Kunde', L, y);
  doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(d.kunde || '—', L, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(dim); doc.text('Aktueller Status', L + 100, y);
  doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(d.status || '—', L + 100, y + 5);
  doc.setFont('helvetica', 'normal');
  y += 14;

  // Versionshistorie
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
  doc.text('Versionshistorie', L, y); y += 6;
  doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
  doc.text('Version', L + 2, y + 5.5); doc.text('Datum', L + 34, y + 5.5); doc.text('Status', L + 70, y + 5.5); doc.text('Beschreibung', L + 110, y + 5.5);
  y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  for (const v of d.versionen) {
    seite(7);
    doc.setTextColor(navy); doc.text(v.version, L + 2, y);
    doc.setTextColor(dim); doc.text(v.datum, L + 34, y);
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(v.status, L + 70, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(dim);
    doc.text(doc.splitTextToSize(v.beschreibung || '—', 78), L + 110, y);
    y += 7;
  }
  y += 4;

  // Feedback-Log
  seite(14);
  doc.setDrawColor(220); doc.line(L, y, R, y); y += 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
  doc.text('Feedback & Freigaben', L, y); y += 7;
  if (!d.feedback.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
    doc.text('Noch kein Feedback erfasst.', L, y); y += 6;
  } else {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    for (const f of d.feedback) {
      seite(12);
      doc.setTextColor(navy); doc.setFont('helvetica', 'bold');
      doc.text(`${f.typ}${f.autor ? ` · ${f.autor}` : ''}`, L + 2, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(dim);
      doc.text(f.datum, R - 2, y, { align: 'right' });
      y += 5;
      if (f.text) { doc.setTextColor(navy); const lines = doc.splitTextToSize(f.text, R - L - 6); doc.text(lines, L + 2, y); y += lines.length * 5; }
      y += 2; doc.setDrawColor(235); doc.line(L, y, R, y); y += 4;
    }
  }

  // Fußzeile
  seite(14);
  y += 2; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Freigabe-Protokoll — dokumentiert Versionsstände und Kundenfreigaben. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.titel || 'Freigabe').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Freigabe-Protokoll_${name}.pdf`);
}
