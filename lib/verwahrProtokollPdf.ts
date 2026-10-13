// lib/verwahrProtokollPdf.ts
// Verwahrprotokoll für die Einlagerung (Reifenhotel u. a.). Client-seitig via
// jsPDF (A4 hoch). Dient der Beweissicherung: Fabrikat/Zustand/Alter (DOT)/
// Profiltiefe/Felgenzustand werden festgehalten.
// Paket 347 (A1 Vorlagen-Prinzip): Die Bedingungen (Laufzeit, Obhut, Vorgehen
// bei Nichtabholung …) kommen NUR noch aus „Meine Rechtstexte" des Betriebs
// (Schlüssel „verwahrung.bedingungen"). ARGONAUT liefert keinen Wortlaut mehr.
import { jsPDF } from 'jspdf';
import type { DokumentText } from '@/lib/rechtsTexte';
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
  /** Paket 347: Bedingungen aus „Meine Rechtstexte" (lib/rechtsTexte.dokumentText). */
  bedingungen?: DokumentText | null;
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
  y += 6; doc.text('Protokoll der Annahme zur Einlagerung', L, y);
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

  // Bedingungen: nur der eigene Text des Betriebs (Paket 347), nie ein Mustertext von ARGONAUT
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(dim);
  doc.text('Bedingungen der Einlagerung', L, y);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(navy);
  y += 6;
  const b = d.bedingungen;
  if (b && b.eigen) {
    doc.setFontSize(9);
    for (const zeile of doc.splitTextToSize(b.text, W) as string[]) {
      if (y > 272) { doc.addPage(); y = 20; }
      doc.text(zeile, L, y); y += 4.4;
    }
    doc.setFontSize(8); doc.setTextColor(dim);
    if (y > 272) { doc.addPage(); y = 20; }
    y += 1; doc.text(`Bedingungen des Betriebs, ${b.stand}`, L, y); y += 4;
    doc.setTextColor(navy);
  } else {
    doc.setFontSize(9); doc.setTextColor(dim);
    doc.text(doc.splitTextToSize('Es sind keine eigenen Bedingungen des Betriebs hinterlegt. Dieses Protokoll hält nur die Annahme und den Zustand fest.', W), L, y);
    y += 10; doc.setTextColor(navy);
  }

  // Unterschriften
  if (y > 236) { doc.addPage(); y = 40; }
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
