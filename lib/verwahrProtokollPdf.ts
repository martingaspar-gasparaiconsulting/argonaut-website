// lib/verwahrProtokollPdf.ts
// Verwahrprotokoll für die Einlagerung (Reifenhotel u. a.) — Verwahrungsvertrag
// nach § 688 BGB. Client-seitig via jsPDF (A4 hoch). Dient der Beweissicherung:
// Fabrikat/Zustand/Alter (DOT)/Profiltiefe/Felgenzustand werden festgehalten,
// dazu Obhut-, Laufzeit- und Verwertungshinweis (Verwertung erst nach Ablauf der
// Laufzeit + schriftlicher 14-Tage-Frist).
import { jsPDF } from 'jspdf';
import { unterschriftUeberLinie } from '@/lib/unterschriftPdf';
import { meineUnterschriftCache } from '@/lib/meineUnterschrift';

export interface VerwahrDaten {
  aussteller: string;
  kunde: string;
  telefon?: string;
  kennzeichen?: string;
  eingelagertAm: string;   // bereits formatiert (TT.MM.JJJJ)
  lagerplatz?: string;
  gegenstand?: string;     // Fabrikat, DOT-Alter, Profiltiefe, Felgenzustand …
}

export function verwahrProtokollPdf(d: VerwahrDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, W = R - L;
  let y = 20;

  const navy = 10, gold: [number, number, number] = [201, 168, 76];
  const dim = 110;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text('VERWAHRPROTOKOLL', L, y);
  doc.setTextColor(navy); doc.setFontSize(18);
  y += 8; doc.text('Einlagerung / Verwahrung', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(dim);
  y += 6; doc.text('Verwahrungsvertrag nach § 688 BGB', L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y);

  // Verwahrer / Kunde
  doc.setTextColor(navy); doc.setFontSize(10);
  y += 9;
  doc.setFont('helvetica', 'bold'); doc.text('Verwahrer (Betrieb)', L, y);
  doc.text('Hinterleger (Kunde)', L + W / 2, y);
  doc.setFont('helvetica', 'normal');
  y += 6; doc.text(doc.splitTextToSize(d.aussteller || '—', W / 2 - 6), L, y);
  doc.text(doc.splitTextToSize(d.kunde || '—', W / 2 - 6), L + W / 2, y);
  if (d.telefon) { y += 5; doc.setTextColor(dim); doc.text(`Telefon: ${d.telefon}`, L + W / 2, y); doc.setTextColor(navy); }

  // Eckdaten-Box
  y += 10;
  doc.setDrawColor(210); doc.setLineWidth(0.3);
  const rows: [string, string][] = [
    ['Eingelagert am', d.eingelagertAm || '—'],
    ['Kennzeichen', d.kennzeichen || '—'],
    ['Lagerplatz', d.lagerplatz || '—'],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(dim); doc.setFontSize(9);
    doc.text(k, L, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(navy); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(v, W - 45), L + 45, y);
    y += 7;
  });

  // Verwahrgegenstand / Zustand
  y += 3;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(navy); doc.setFontSize(10);
  doc.text('Verwahrgegenstand & Zustand bei Annahme', L, y);
  doc.setDrawColor(210); doc.rect(L, y + 3, W, 26);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const g = doc.splitTextToSize(d.gegenstand || '(Fabrikat, DOT-Alter, Profiltiefe, Felgenzustand …)', W - 6);
  doc.text(g, L + 3, y + 9);
  y += 34;

  // Hinweise
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(dim);
  doc.text('Vereinbarungen', L, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(navy);
  const hinweise = [
    '· Der Verwahrer bewahrt den Gegenstand sorgfältig auf (Obhutspflicht, § 688 BGB).',
    '· Vertragslaufzeit 12 Monate; ohne Abholung verlängert sie sich stillschweigend.',
    '· Eine Verwertung/Entsorgung ist erst nach Ablauf der Laufzeit und nach schriftlicher',
    '  Ankündigung mit einer Frist von 14 Tagen zulässig.',
    '· Der Zustand wird beidseitig bei Annahme bestätigt; spätere Beanstandungen bedürfen',
    '  des Nachweises. Empfehlung: separate Obhuts-/Inhaltsversicherung.',
  ];
  y += 6;
  hinweise.forEach((h) => { doc.text(doc.splitTextToSize(h, W), L, y); y += 5.2; });

  // Unterschriften
  y = Math.max(y + 12, 250);
  doc.setDrawColor(160); doc.setLineWidth(0.3);
  doc.line(L, y, L + 70, y);
  doc.line(R - 70, y, R, y);
  unterschriftUeberLinie(doc, meineUnterschriftCache(), R - 70, y, 55, 18);
  doc.setFontSize(8); doc.setTextColor(dim);
  y += 4;
  doc.text('Ort, Datum, Unterschrift Kunde', L, y);
  doc.text('Unterschrift / Stempel Betrieb', R - 70, y);

  const name = (d.kunde || 'Kunde').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  doc.save(`Verwahrprotokoll_${name}.pdf`);
}
