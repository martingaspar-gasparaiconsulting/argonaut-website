// ============================================================================
// ARGONAUT OS · lib/zuschnittplanPdf.ts — Zuschnittplan als PDF (A8/B3)
//
// Clientseitig mit jsPDF. A4 hoch: Projekt-Kopf, Kennzahlen (Stangen,
// Verschnitt), dann je Stange die Schnittliste + Reststück — für die Werkstatt.
// ============================================================================

import { jsPDF } from 'jspdf';

export interface ZuschnittplanDaten {
  projekt: string;
  material?: string | null;
  stangenlaenge: number;
  saegeblatt: number;
  stangen: number;
  verschnittProzent: number;
  gesamtLaenge: number;
  teileLaenge: number;
  gewichtGesamt?: number | null;
  plan: { schnitte: number[]; rest: number }[];
  aussteller?: string | null;
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

function mm(n: number): string { return `${(Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })} mm`; }

export function zuschnittplanPdf(dn: ZuschnittplanDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 18; const R = W - 18;
  let y = 22;

  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Zuschnittplan', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  doc.text(dn.projekt + (dn.material ? `  ·  ${dn.material}` : ''), L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 20;

  // Kennzahlen
  const zeile = (label: string, wert: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text(wert, x, yy + 5);
  };
  const c2 = L + 60, c3 = L + 120;
  zeile('Stangenlänge', mm(dn.stangenlaenge), L, y);
  zeile('Schnittfuge', mm(dn.saegeblatt), c2, y);
  zeile('Stangen nötig', String(dn.stangen), c3, y);
  y += 13;
  zeile('Materiallänge', mm(dn.gesamtLaenge), L, y);
  zeile('Verschnitt', `${dn.verschnittProzent} %`, c2, y);
  if (dn.gewichtGesamt != null) zeile('Gewicht gesamt', `${(Number(dn.gewichtGesamt) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`, c3, y);
  y += 16;

  doc.setFillColor(NAVY); doc.roundedRect(L, y, R - L, 8, 1.5, 1.5, 'F');
  doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('Schnittplan je Stange', L + 3, y + 5.6);
  y += 12;

  doc.setFontSize(10);
  dn.plan.forEach((s, i) => {
    if (y > 270) { doc.addPage(); y = 22; }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(NAVY);
    doc.text(`Stange ${i + 1}`, L, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(NAVY);
    const txt = s.schnitte.join('  +  ') + ' mm';
    const lines = doc.splitTextToSize(txt, R - L - 40);
    doc.text(lines, L + 28, y);
    doc.setTextColor(GREY);
    doc.text(`Rest ${mm(s.rest)}`, R, y, { align: 'right' });
    y += Math.max(lines.length * 5, 5) + 2.5;
    doc.setDrawColor('#EEEEEE'); doc.setLineWidth(0.2); doc.line(L, y - 3, R, y - 3);
  });

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    if (dn.aussteller) doc.text(dn.aussteller, L, 288);
    doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });
    doc.text(`Seite ${i}/${seiten}`, R, 288, { align: 'right' });
  }

  const safe = (dn.projekt || 'Zuschnittplan').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Zuschnittplan_${safe}.pdf`);
}
