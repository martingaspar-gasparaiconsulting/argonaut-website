// lib/chargenPdf.ts
// Chargen- & Prüfnachweis (A4 hoch) via jsPDF: Chargen-Kopfdaten,
// Rückverfolgbarkeit (Eingänge/Ausgänge — one up / one down) und Prüfungen mit
// Merkmalstabelle (Soll ± Toleranz, Ist, io/nio). Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface ChargenPdfMerkmal { merkmal: string; soll: string; tol: string; ist: string; einheit: string; status: string }
export interface ChargenPdfPruefung { art: string; datum: string; pruefer: string; ergebnis: string; merkmale: ChargenPdfMerkmal[] }
export interface ChargenPdfLink { referenz: string; menge: string; datum: string }
export interface ChargenPdfDaten {
  aussteller: string;
  chargeNr: string;
  bezeichnung: string;
  typ: string;
  artikel: string;
  datum: string;
  status: string;
  menge: string;
  herstellDatum: string;
  mhd: string;
  herkunft: string;
  eingaenge: ChargenPdfLink[];
  ausgaenge: ChargenPdfLink[];
  pruefungen: ChargenPdfPruefung[];
}

export function chargenPdf(d: ChargenPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  const green: [number, number, number] = [42, 120, 80], red: [number, number, number] = [190, 60, 60];
  let y = 20;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 20; } }
  function abschnitt(titel: string) {
    seite(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
    doc.text(titel, L, y); y += 2; doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.4);
    doc.line(L, y, R, y); y += 6;
  }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(17);
  y += 8; doc.text('Chargen- & Prüfnachweis', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim);
  y += 6; doc.text(`Charge ${d.chargeNr || '—'}  ·  Stand ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 8;

  // Chargen-Kopfdaten
  const infos: [string, string][] = [
    ['Bezeichnung', d.bezeichnung || '—'],
    ['Artikel', d.artikel || '—'],
    ['Typ', d.typ === 'serie' ? 'Seriennummer' : 'Charge'],
    ['Menge', d.menge || '—'],
    ['Herstelldatum', d.herstellDatum || '—'],
    ['MHD / Verfall', d.mhd || '—'],
    ['Status', d.status || '—'],
    ['Herkunft', d.herkunft || '—'],
  ];
  doc.setFontSize(10);
  for (let i = 0; i < infos.length; i += 2) {
    seite(7);
    const paar = [infos[i], infos[i + 1]].filter(Boolean) as [string, string][];
    let x = L;
    for (const [label, wert] of paar) {
      doc.setTextColor(dim); doc.setFont('helvetica', 'normal'); doc.text(label, x, y);
      doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.text(String(wert), x + 32, y);
      x += 87;
    }
    y += 6.5;
  }
  y += 3;

  // Rückverfolgbarkeit
  function linkTabelle(titel: string, rows: ChargenPdfLink[]) {
    abschnitt(titel);
    if (rows.length === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim); doc.text('— keine Einträge —', L, y); y += 7; return; }
    doc.setFillColor(240, 237, 228); doc.rect(L, y - 4, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(navy);
    doc.text('Referenz (Auftrag / Lieferung / Rohstoff)', L + 2, y + 1);
    doc.text('Menge', 150, y + 1, { align: 'right' });
    doc.text('Datum', R - 2, y + 1, { align: 'right' }); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    for (const r of rows) {
      seite(7); doc.setTextColor(navy); doc.text(doc.splitTextToSize(r.referenz || '—', 118), L + 2, y);
      doc.setTextColor(dim); doc.text(r.menge || '', 150, y, { align: 'right' }); doc.text(r.datum || '', R - 2, y, { align: 'right' });
      y += 6.5;
    }
    y += 2;
  }
  linkTabelle('Eingänge (Rohstoffe / Vor-Chargen)', d.eingaenge);
  linkTabelle('Ausgänge (Aufträge / Lieferungen)', d.ausgaenge);

  // Prüfungen
  for (const p of d.pruefungen) {
    abschnitt(`Prüfung — ${p.art}`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
    doc.text(`Datum ${p.datum || '—'}   ·   Prüfer ${p.pruefer || '—'}   ·   Ergebnis: `, L, y);
    const io = p.ergebnis === 'io';
    doc.setFont('helvetica', 'bold'); doc.setTextColor(io ? green[0] : red[0], io ? green[1] : red[1], io ? green[2] : red[2]);
    doc.text(p.ergebnis === 'io' ? 'BESTANDEN (i.O.)' : p.ergebnis === 'nio' ? 'NICHT BESTANDEN (n.i.O.)' : 'OFFEN', L + 92, y);
    y += 7;
    // Merkmalstabelle
    doc.setFillColor(240, 237, 228); doc.rect(L, y - 4, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(navy);
    doc.text('Merkmal', L + 2, y + 1); doc.text('Soll', 96, y + 1, { align: 'right' });
    doc.text('Toleranz', 120, y + 1, { align: 'right' }); doc.text('Ist', 150, y + 1, { align: 'right' });
    doc.text('Bewertung', R - 2, y + 1, { align: 'right' }); y += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    for (const m of p.merkmale) {
      seite(7); doc.setTextColor(navy); doc.text(doc.splitTextToSize(m.merkmal || '—', 60), L + 2, y);
      doc.setTextColor(dim);
      doc.text(m.soll, 96, y, { align: 'right' }); doc.text(m.tol, 120, y, { align: 'right' });
      doc.text(`${m.ist}${m.einheit ? ' ' + m.einheit : ''}`, 150, y, { align: 'right' });
      const st = m.status;
      doc.setFont('helvetica', 'bold');
      if (st === 'io') doc.setTextColor(green[0], green[1], green[2]);
      else if (st === 'nio') doc.setTextColor(red[0], red[1], red[2]);
      else doc.setTextColor(dim);
      doc.text(st === 'io' ? 'i.O.' : st === 'nio' ? 'n.i.O.' : '–', R - 2, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 6.2; doc.setDrawColor(232); doc.line(L, y - 2.2, R, y - 2.2);
    }
    y += 3;
  }
  if (d.pruefungen.length === 0) { abschnitt('Prüfungen'); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim); doc.text('— noch keine Prüfung erfasst —', L, y); y += 7; }

  // Fußzeile
  seite(14);
  y += 6; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Rückverfolgbarkeit nach ISO 9001:2015 (8.5.2). Prüfnachweis ohne Gewähr — bitte fachlich prüfen. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.chargeNr || 'Charge').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Charge_${name}.pdf`);
}
