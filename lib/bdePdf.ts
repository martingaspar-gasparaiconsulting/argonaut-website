// lib/bdePdf.ts
// BDE/MDE Schichtbericht für EINE Buchung (A4 hoch) via jsPDF.
// OEE-Kachel (Verfügbarkeit × Leistung × Qualität), Zeit-/Mengengerüst und
// Störgrund-Liste. Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface BdeStoerPos { kategorie: string; grund: string; dauer: string }
export interface BdePdfDaten {
  aussteller: string;
  maschine: string;
  maschinenNr: string;
  auftrag: string;
  datum: string;
  schicht: string;
  bediener: string;
  planbelegung: string;   // z. B. "480 min (8,0 h)"
  stoerzeit: string;
  laufzeit: string;
  mengeGesamt: string;
  mengeGut: string;
  ausschuss: string;
  verfuegbarkeit: string; // "87,5 %"
  leistung: string;
  qualitaet: string;
  oee: string;
  leistungHinweis?: string; // z. B. Roh-Leistung >100 %
  stoerungen: BdeStoerPos[];
}

export function bdePdf(d: BdePdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('BDE-Schichtbericht', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.maschine}${d.maschinenNr ? ` · Nr. ${d.maschinenNr}` : ''}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Kopfdaten
  doc.setFontSize(10);
  const kv = (label: string, wert: string, x: number) => {
    doc.setTextColor(dim); doc.text(label, x, y);
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(wert || '—', x, y + 5);
    doc.setFont('helvetica', 'normal');
  };
  kv('Auftrag', d.auftrag, L); kv('Datum', d.datum, L + 60); kv('Schicht', d.schicht, L + 110); kv('Bediener', d.bediener, L + 150);
  y += 14;

  // OEE-Kachel
  seite(30);
  doc.setFillColor(240, 237, 228); doc.roundedRect(L, y, R - L, 24, 2, 2, 'F');
  const zellB = (R - L) / 4;
  const zelle = (i: number, label: string, wert: string, gross = false) => {
    const cx = L + zellB * i + zellB / 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(dim);
    doc.text(label, cx, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(gross ? 17 : 13);
    doc.setTextColor(gross ? gold[0] : navy, gross ? gold[1] : navy, gross ? gold[2] : navy);
    doc.text(wert, cx, y + 17, { align: 'center' });
  };
  zelle(0, 'Verfügbarkeit', d.verfuegbarkeit);
  zelle(1, 'Leistung', d.leistung);
  zelle(2, 'Qualität', d.qualitaet);
  zelle(3, 'OEE', d.oee, true);
  y += 28;
  if (d.leistungHinweis) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(dim);
    doc.text(d.leistungHinweis, L, y); y += 5;
  }

  // Zeit- & Mengengerüst
  seite(26);
  doc.setDrawColor(220); doc.line(L, y, R, y); y += 6;
  doc.setFontSize(10);
  const zeile2 = (l1: string, w1: string, l2: string, w2: string) => {
    doc.setTextColor(dim); doc.setFont('helvetica', 'normal'); doc.text(l1, L, y);
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(w1, 92, y, { align: 'right' });
    doc.setTextColor(dim); doc.setFont('helvetica', 'normal'); doc.text(l2, L + 100, y);
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(w2, R, y, { align: 'right' });
    y += 6.5;
  };
  zeile2('Planbelegungszeit', d.planbelegung, 'Produzierte Menge', d.mengeGesamt);
  zeile2('Störzeit gesamt', d.stoerzeit, 'davon Gutmenge', d.mengeGut);
  zeile2('Laufzeit', d.laufzeit, 'Ausschuss', d.ausschuss);
  y += 2;

  // Störgründe
  seite(20);
  doc.setDrawColor(220); doc.line(L, y, R, y); y += 7;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
  doc.text('Störgründe', L, y); y += 7;
  if (!d.stoerungen.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
    doc.text('Keine Störungen erfasst.', L, y); y += 6;
  } else {
    doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('Kategorie', L + 2, y + 5.5); doc.text('Grund', L + 60, y + 5.5); doc.text('Dauer', R - 2, y + 5.5, { align: 'right' });
    y += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    for (const s of d.stoerungen) {
      seite(7);
      doc.setTextColor(navy); doc.text(doc.splitTextToSize(s.kategorie, 55), L + 2, y);
      doc.setTextColor(dim); doc.text(doc.splitTextToSize(s.grund || '—', 90), L + 60, y);
      doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(s.dauer, R - 2, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 7;
    }
  }

  // Fußzeile
  seite(16);
  y += 4; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Kennzahlen nach VDMA-Einheitsblatt 66412-1: OEE = Verfügbarkeit × Leistung × Qualität. Leistung auf 100 % begrenzt. Angaben ohne Gewähr.', L, y, { maxWidth: R - L });

  const name = (d.maschine || 'BDE').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  const tag = (d.datum || '').replace(/[^0-9]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`BDE-Schichtbericht_${name}${tag ? '_' + tag : ''}.pdf`);
}
