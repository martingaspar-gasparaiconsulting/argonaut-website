// ============================================================================
// ARGONAUT OS · lib/kfzVerkaufPdf.ts — Paket 266 · Verkaufsunterlagen als PDF (K6)
//
// Clientseitig mit jsPDF (wie lib/kfzAnkaufPdf.ts). A4 hoch. Der Inhalt kommt
// fertig aus dokumentInhalt() (lib/kfzVerkauf.ts) — hier wird nur gezeichnet.
// Ein Abschnitt mit eigener Unterschrift (gesonderte Vereinbarung) bekommt
// sein eigenes Unterschriftsfeld direkt darunter.
// ============================================================================

import { jsPDF } from 'jspdf';
import type { DokInhalt } from './kfzVerkauf';

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

/** Nur Zeichen, die die Standardschrift im PDF kennt. */
export function pdfText(t: string): string {
  return String(t ?? '')
    .replace(/[−–]/g, '-')
    .replace(/[→]/g, '->')
    .replace(/[„“”]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[≤]/g, '<=').replace(/[≥]/g, '>=')
    .replace(/[^\u0000-ÿ€—…]/g, '');
}

export function verkaufPdf(d: DokInhalt, dateiname: string): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const L = 18, R = 192, UNTEN = 275;
  let y = 20;
  const P = (t: string) => pdfText(t);
  const neueSeiteWennNoetig = (hoehe: number) => { if (y + hoehe > UNTEN) { doc.addPage(); y = 20; } };
  const unterschrift = (labels: string[]) => {
    neueSeiteWennNoetig(26);
    y += 16;
    const breite = labels.length > 1 ? (R - L - 10) / 2 : 90;
    doc.setDrawColor(NAVY); doc.setLineWidth(0.3); doc.setFontSize(8.5); doc.setTextColor(GREY);
    labels.slice(0, 2).forEach((lab, i) => {
      const x = L + i * (breite + 10);
      doc.line(x, y, x + breite, y);
      doc.text(P(lab), x, y + 4.5);
    });
    y += 10;
  };

  // Kopf
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(d.titel.length > 30 ? 15 : 20);
  doc.text(P(d.titel), L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
  doc.text(P(`Nr. ${d.nr} · ${d.datum}`), R, y, { align: 'right' });
  doc.setDrawColor(GOLD); doc.setLineWidth(0.7); doc.line(L, y + 3, R, y + 3);
  y += 11;

  // Parteien
  const mitte = (L + R) / 2 + 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text(P(d.links.titel), L, y); doc.text(P(d.rechts.titel), mitte, y);
  y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  const links = d.links.zeilen.flatMap((z) => doc.splitTextToSize(P(z), mitte - L - 6) as string[]);
  const rechts = d.rechts.zeilen.flatMap((z) => doc.splitTextToSize(P(z), R - mitte) as string[]);
  doc.text(links, L, y); doc.text(rechts, mitte, y);
  y += Math.max(links.length, rechts.length) * 5 + 6;

  for (const a of d.abschnitte) {
    neueSeiteWennNoetig(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
    doc.text(P(a.titel), L, y);
    doc.setDrawColor('#DDDDDD'); doc.setLineWidth(0.2); doc.line(L, y + 1.6, R, y + 1.6);
    y += 7;
    doc.setFontSize(10);
    for (const [k, v] of a.zeilen ?? []) {
      const kt = doc.splitTextToSize(P(k), 88) as string[];
      const vt = doc.splitTextToSize(P(v), R - L - 94) as string[];
      const h = Math.max(kt.length, vt.length) * 5;
      neueSeiteWennNoetig(h + 1);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(GREY); doc.text(kt, L, y);
      doc.setTextColor(NAVY); doc.text(vt, R, y, { align: 'right' });
      y += h + 0.8;
    }
    if (a.zeilen?.length) y += 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.8); doc.setTextColor(NAVY);
    for (const t of a.text ?? []) {
      const teile = doc.splitTextToSize(P(t), R - L) as string[];
      neueSeiteWennNoetig(teile.length * 4.7);
      doc.text(teile, L, y); y += teile.length * 4.7 + 0.8;
    }
    if (a.eigeneUnterschrift) unterschrift([a.eigeneUnterschrift]);
    y += 3;
  }

  unterschrift(d.unterschriften);
  doc.save(dateiname);
}
