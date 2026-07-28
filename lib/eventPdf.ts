// lib/eventPdf.ts
// Teilnehmer-/Einlassliste für EINE Veranstaltung (A4 hoch) via jsPDF.
// Kopf, Auslastungs-/Einnahmen-Kachel und Anmeldungs-Tabelle. Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface EventPdfZeile { name: string; plaetze: string; status: string; bezahlt: string; betrag: string }
export interface EventPdfDaten {
  aussteller: string;
  titel: string;
  art: string;
  ort: string;
  zeitpunkt: string;
  kapazitaet: string;
  belegt: string;
  auslastung: string;
  einnahmenBezahlt: string;
  einnahmenOffen: string;
  zeilen: EventPdfZeile[];
}

export function eventPdf(d: EventPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; kopfTabelle(); } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Teilnehmerliste', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`${d.titel}${d.art ? ` · ${d.art}` : ''}`, L, y);
  y += 5; doc.text(`${d.zeitpunkt}${d.ort ? ` · ${d.ort}` : ''}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Kachel
  doc.setFillColor(240, 237, 228); doc.roundedRect(L, y, R - L, 24, 2, 2, 'F');
  const zellB = (R - L) / 4;
  const zelle = (i: number, label: string, wert: string, gross = false) => {
    const cx = L + zellB * i + zellB / 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(dim);
    doc.text(label, cx, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(gross ? 16 : 13);
    doc.setTextColor(gross ? gold[0] : navy, gross ? gold[1] : navy, gross ? gold[2] : navy);
    doc.text(wert, cx, y + 17, { align: 'center' });
  };
  zelle(0, 'Auslastung', d.auslastung, true);
  zelle(1, 'Belegt / Kapazität', `${d.belegt} / ${d.kapazitaet}`);
  zelle(2, 'Bezahlt', d.einnahmenBezahlt);
  zelle(3, 'Offen', d.einnahmenOffen);
  y += 30;

  // Tabelle
  function kopfTabelle() {
    doc.setFillColor(240, 237, 228); doc.rect(L, y, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('Name', L + 2, y + 5.5);
    doc.text('Plätze', 118, y + 5.5, { align: 'right' });
    doc.text('Status', 124, y + 5.5);
    doc.text('Bezahlt', 162, y + 5.5, { align: 'right' });
    doc.text('Betrag', R - 2, y + 5.5, { align: 'right' });
    y += 10;
  }
  kopfTabelle();
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  for (const z of d.zeilen) {
    seite(7);
    doc.setTextColor(navy); doc.text(doc.splitTextToSize(z.name, 60), L + 2, y);
    doc.setTextColor(dim);
    doc.text(z.plaetze, 118, y, { align: 'right' });
    doc.text(z.status, 124, y);
    doc.text(z.bezahlt, 162, y, { align: 'right' });
    doc.setTextColor(navy); doc.setFont('helvetica', 'bold');
    doc.text(z.betrag, R - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 7;
  }

  // Fußzeile
  seite(14);
  y += 4; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Teilnehmer-/Einlassliste. Warteliste- und stornierte Anmeldungen sind gekennzeichnet. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.titel || 'Veranstaltung').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Teilnehmerliste_${name}.pdf`);
}
