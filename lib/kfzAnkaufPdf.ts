// ============================================================================
// ARGONAUT OS · lib/kfzAnkaufPdf.ts — Paket 264 · Ankaufschein als PDF (K4 Teil 2)
//
// Clientseitig mit jsPDF (wie lib/kfzBestandPdf.ts). A4 hoch. Der Inhalt kommt
// fertig aus ankaufscheinInhalt() (lib/kfzAnkauf.ts) — hier wird nur gezeichnet.
// Zwei Unterschriftsfelder (Verkäufer, Ankäufer). Schäden ohne Beträge.
// ============================================================================

import { jsPDF } from 'jspdf';
import type { ScheinInhalt } from './kfzAnkauf';

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

export function ankaufscheinPdf(d: ScheinInhalt, dateiname: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = 18, R = 192, UNTEN = 275;
  let y = 20;

  const neueSeiteWennNoetig = (hoehe: number) => {
    if (y + hoehe > UNTEN) { doc.addPage(); y = 20; }
  };
  const ueberschrift = (t: string) => {
    neueSeiteWennNoetig(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
    doc.text(t, L, y);
    doc.setDrawColor('#DDDDDD'); doc.setLineWidth(0.2); doc.line(L, y + 1.6, R, y + 1.6);
    y += 7;
  };
  const tabelle = (zeilen: [string, string][]) => {
    doc.setFontSize(10);
    for (const [k, v] of zeilen) {
      const teile = doc.splitTextToSize(v, R - L - 62) as string[];
      neueSeiteWennNoetig(teile.length * 5 + 1);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(GREY); doc.text(k, L, y);
      doc.setTextColor(NAVY); doc.text(teile, L + 62, y);
      y += teile.length * 5 + 0.8;
    }
    y += 3;
  };

  // Kopf
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(d.titel, L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
  doc.text(`Nr. ${d.nr} · ${d.datum}`, R, y, { align: 'right' });
  doc.setDrawColor(GOLD); doc.setLineWidth(0.7); doc.line(L, y + 3, R, y + 3);
  y += 11;

  // Parteien nebeneinander
  const mitte = (L + R) / 2 + 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text('ANKÄUFER', L, y); doc.text('VERKÄUFER', mitte, y);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  const links = d.ankaeufer.flatMap((z) => doc.splitTextToSize(z, mitte - L - 6) as string[]);
  const rechts = d.verkaeufer.flatMap((z) => doc.splitTextToSize(z, R - mitte) as string[]);
  doc.text(links, L, y); doc.text(rechts, mitte, y);
  y += Math.max(links.length, rechts.length) * 5 + 6;

  ueberschrift('Fahrzeug');
  tabelle(d.fahrzeug);
  ueberschrift('Angaben des Verkäufers');
  tabelle(d.angaben);

  ueberschrift('Festgestellte Mängel und Schäden');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  if (!d.maengel.length) { doc.text('Keine festgestellt.', L, y); y += 8; }
  else {
    for (const m of d.maengel) {
      const teile = doc.splitTextToSize(`- ${m}`, R - L) as string[];
      neueSeiteWennNoetig(teile.length * 5);
      doc.text(teile, L, y); y += teile.length * 5;
    }
    y += 3;
  }

  ueberschrift('Kaufpreis');
  doc.setFontSize(11);
  d.preis.forEach((p, i) => {
    doc.setFont('helvetica', i === d.preis.length - 1 ? 'bold' : 'normal'); doc.setTextColor(NAVY);
    doc.text(p, L, y); y += 6;
  });
  y += 2;

  ueberschrift('Erklärungen');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(NAVY);
  for (const e of d.erklaerungen) {
    const teile = doc.splitTextToSize(`- ${e}`, R - L) as string[];
    neueSeiteWennNoetig(teile.length * 4.6);
    doc.text(teile, L, y); y += teile.length * 4.6 + 0.6;
  }

  // Unterschriften
  neueSeiteWennNoetig(34);
  y = Math.max(y + 18, Math.min(UNTEN - 14, y + 18));
  doc.setDrawColor(NAVY); doc.setLineWidth(0.3);
  doc.line(L, y, L + 76, y); doc.line(mitte, y, R, y);
  doc.setFontSize(8.5); doc.setTextColor(GREY);
  doc.text('Ort, Datum, Unterschrift Verkäufer', L, y + 4.5);
  doc.text('Ort, Datum, Unterschrift Ankäufer', mitte, y + 4.5);

  doc.save(dateiname);
}
