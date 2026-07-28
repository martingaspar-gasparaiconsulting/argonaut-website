// lib/etikettPdf.ts
// Lebensmittel-Etikett nach LMIV (A4 hoch) via jsPDF: Verkehrsbezeichnung,
// Zutatenverzeichnis mit fett hervorgehobenen Allergenen (Art. 21),
// „Enthält"-Allergenzeile, Nährwertdeklaration je 100 g/ml und Pflichtangaben
// (Nettomenge, MHD, Aufbewahrung, Verantwortlicher, Ursprung). Keine Supabase.
import { jsPDF } from 'jspdf';

export interface EtikettPdfSegment { t: string; bold: boolean }
export interface EtikettPdfNaehrwert { label: string; wert: string; einheit: string; unter?: boolean }
export interface EtikettPdfDaten {
  aussteller: string;
  bezeichnung: string;
  art: string; // 'verpackt' | 'lose'
  datum: string;
  zutatenSegmente: EtikettPdfSegment[];
  allergene: string[];   // Namen der enthaltenen Allergene
  spuren?: string;
  nettomenge?: string;
  mhd?: string;
  aufbewahrung?: string;
  verantwortlicher?: string;
  ursprung?: string;
  alkohol?: string;
  charge?: string;
  naehrwertBasis?: string; // '100 g' | '100 ml'
  naehrwert: EtikettPdfNaehrwert[];
}

export function etikettPdf(d: EtikettPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Lebensmittel-Kennzeichnung', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.art === 'lose' ? 'Lose Ware (Allergeninfo)' : 'Fertigverpackung (LMIV)'}  ·  Stand ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 9;

  // Verkehrsbezeichnung
  doc.setTextColor(dim); doc.setFontSize(9); doc.text('Bezeichnung des Lebensmittels', L, y);
  doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  y += 6; doc.text(doc.splitTextToSize(d.bezeichnung || '—', R - L), L, y);
  y += 9;

  // Zutatenverzeichnis (mit fett hervorgehobenen Allergenen)
  if (d.zutatenSegmente.length > 0) {
    doc.setTextColor(dim); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('Zutaten', L, y); y += 5;
    doc.setFontSize(10.5);
    y = flowSegmente(doc, d.zutatenSegmente, L, R, y, 5.2, navy, seite);
    y += 4;
  }

  // Enthält-Allergenzeile
  if (d.allergene.length > 0) {
    seite(10);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(navy);
    const txt = 'Enthält: ' + d.allergene.join(', ');
    const zeilen = doc.splitTextToSize(txt, R - L);
    doc.text(zeilen, L, y); y += zeilen.length * 5.2 + 3;
  }
  if (d.spuren && d.spuren.trim()) {
    seite(8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
    const zeilen = doc.splitTextToSize('Kann Spuren enthalten von: ' + d.spuren, R - L);
    doc.text(zeilen, L, y); y += zeilen.length * 5 + 3;
  }

  // Nährwertdeklaration
  if (d.naehrwert.length > 0) {
    seite(14 + d.naehrwert.length * 6);
    y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(navy);
    doc.text(`Nährwertdeklaration je ${d.naehrwertBasis || '100 g'}`, L, y); y += 6;
    doc.setFillColor(240, 237, 228); doc.rect(L, y - 4, R - L, 0.3, 'F');
    for (const nw of d.naehrwert) {
      seite(7);
      doc.setFont('helvetica', nw.unter ? 'normal' : 'bold'); doc.setFontSize(10); doc.setTextColor(nw.unter ? dim : navy);
      doc.text((nw.unter ? '   ' : '') + nw.label, L, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(navy);
      doc.text(`${nw.wert} ${nw.einheit}`, R - 2, y, { align: 'right' });
      y += 5.8;
      doc.setDrawColor(230); doc.line(L, y - 2.2, R, y - 2.2);
    }
    y += 4;
  }

  // Pflicht-Infos
  const infos: [string, string | undefined][] = [
    ['Nettofüllmenge', d.nettomenge],
    ['Mindestens haltbar bis', d.mhd],
    ['Aufbewahrung', d.aufbewahrung],
    ['Ursprungsland', d.ursprung],
    ['Alkoholgehalt', d.alkohol],
    ['Los-/Chargennummer', d.charge],
  ];
  for (const [label, wert] of infos) {
    if (!wert || !String(wert).trim()) continue;
    seite(7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
    doc.text(label, L, y);
    doc.setTextColor(navy);
    doc.text(doc.splitTextToSize(String(wert), R - L - 55), L + 55, y);
    y += 6;
  }

  // Verantwortlicher
  if (d.verantwortlicher && d.verantwortlicher.trim()) {
    seite(12);
    y += 2; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(dim);
    doc.text('Verantwortlicher Lebensmittelunternehmer', L, y); y += 5;
    doc.setTextColor(navy); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(d.verantwortlicher, R - L), L, y);
    y += 8;
  }

  // Fußzeile
  seite(14);
  y += 6; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Kennzeichnung nach LMIV (EU) 1169/2011. Allergene fett hervorgehoben. Angaben ohne Gewähr — bitte vor Druck fachlich prüfen. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.bezeichnung || 'Etikett').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Etikett_${name}.pdf`);
}

// Fließtext mit gemischt fett/normal markierten Segmenten, mit Umbruch.
function flowSegmente(
  doc: jsPDF,
  segs: EtikettPdfSegment[],
  x0: number,
  xMax: number,
  y: number,
  lineH: number,
  color: number,
  seite: (h: number) => void,
): number {
  let x = x0;
  doc.setTextColor(color);
  for (const seg of segs) {
    doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
    const tokens = seg.t.split(/(\s+)/);
    for (const tok of tokens) {
      if (tok === '') continue;
      const w = doc.getTextWidth(tok);
      if (x + w > xMax && x > x0) {
        y += lineH; x = x0;
        seite(lineH);
        if (/^\s+$/.test(tok)) continue; // führende Leerzeichen am Zeilenanfang schlucken
      }
      doc.text(tok, x, y);
      x += w;
    }
  }
  return y;
}
