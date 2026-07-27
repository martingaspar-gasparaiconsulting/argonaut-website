// ============================================================================
// ARGONAUT OS · lib/fristenlistePdf.ts — Fristenkontrolle als PDF (A7/B3)
//
// Clientseitig mit jsPDF. A4 hoch: alle offenen Fristen — überfällige und
// Vorfrist zuerst — als Fristenkontroll-Liste zum Abarbeiten.
// ============================================================================

import { jsPDF } from 'jspdf';

export interface FristEintrag {
  frist_datum: string;
  akte: string;
  bezeichnung: string;
  art: string;
  verantwortlich?: string | null;
  restTage: number;      // Tage bis Frist (negativ = überfällig)
}

export interface FristenlisteDaten {
  stand: string;
  aussteller?: string | null;
  eintraege: FristEintrag[];
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82', RED = '#C0392B', WARN = '#B7791F', GREEN = '#3B8C63';

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export function fristenlistePdf(dn: FristenlisteDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 18; const R = W - 18;
  let y = 22;

  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Fristenkontrolle', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  doc.text(`Offene Fristen · Stand ${deDatum(dn.stand)}`, L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 20;

  if (dn.aussteller) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
    doc.text(dn.aussteller, L, y); y += 8;
  }

  const cDatum = L, cAkte = L + 26, cBez = L + 80, cStatus = R;
  const kopf = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY);
    doc.text('Frist', cDatum, y); doc.text('Akte', cAkte, y); doc.text('Bezeichnung / Art', cBez, y);
    doc.text('Rest', cStatus, y, { align: 'right' });
    doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.2); doc.line(L, y + 2, R, y + 2);
    y += 7;
  };
  kopf();

  if (!dn.eintraege.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(11); doc.setTextColor(GREY);
    doc.text('Keine offenen Fristen — alles erledigt.', L, y + 4);
    y += 10;
  } else {
    doc.setFontSize(10);
    dn.eintraege.forEach((e) => {
      if (y > 268) { doc.addPage(); y = 22; kopf(); }
      const ueber = e.restTage < 0;
      const heute = e.restTage === 0;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(NAVY);
      doc.text(deDatum(e.frist_datum), cDatum, y);
      const aLines = doc.splitTextToSize(e.akte || '—', cBez - cAkte - 3);
      doc.text(aLines, cAkte, y);
      const bLines = doc.splitTextToSize(`${e.bezeichnung} · ${e.art}${e.verantwortlich ? ` · ${e.verantwortlich}` : ''}`, cStatus - cBez - 16);
      doc.text(bLines, cBez, y);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(ueber ? RED : heute ? RED : e.restTage <= 7 ? WARN : GREEN);
      doc.text(ueber ? `${Math.abs(e.restTage)} T über` : heute ? 'heute' : `${e.restTage} T`, cStatus, y, { align: 'right' });
      const rows = Math.max(aLines.length, bLines.length, 1);
      y += 5.5 * rows + 1.5;
      doc.setDrawColor('#EEEEEE'); doc.setLineWidth(0.2); doc.line(L, y - 2.5, R, y - 2.5);
    });
  }

  y += 4;
  if (y > 272) { doc.addPage(); y = 22; }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(GREY);
  doc.text('Fristenkontroll-Liste zur internen Bearbeitung. Bitte Erledigung im System dokumentieren.', L, y, { maxWidth: R - L });

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });
    doc.text(`Seite ${i}/${seiten}`, R, 288, { align: 'right' });
  }

  doc.save(`Fristenkontrolle_${deDatum(dn.stand).replace(/\./g, '-')}.pdf`);
}
