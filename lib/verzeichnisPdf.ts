// ============================================================================
// ARGONAUT OS · lib/verzeichnisPdf.ts — das Verzeichnis als Ausdruck
//
// Art. 30 Abs. 4 DSGVO: Das Verzeichnis ist der Aufsichtsbehoerde auf Anfrage
// VORZULEGEN. Ohne Ausdruck mit Stand-Datum geht das nicht — deshalb diese
// Datei. Clientseitig mit jsPDF, Muster wie lib/fristenlistePdf.ts.
//
// Das Stand-Datum steht auf JEDEM Blatt, nicht nur auf dem ersten: ein
// nachgereichtes Einzelblatt ohne Datum ist fuer eine Behoerde wertlos.
//
// Die Daten kommen fertig aus lib/verarbeitungsverzeichnis.ts — diese Datei
// rechnet nichts, sie malt nur. So laesst sich der INHALT ohne PDF pruefen.
// ============================================================================

import { jsPDF } from 'jspdf';
import type { VerzeichnisDruckdaten } from './verarbeitungsverzeichnis';

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82', WARN = '#B7791F';

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export function verzeichnisPdf(dn: VerzeichnisDruckdaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297, L = 18, R = W - 18, BREITE = R - L;
  let y = 22;
  let blatt = 1;

  const fusszeile = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    doc.text(`Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO) · Stand ${deDatum(dn.stand)}`, L, H - 12);
    doc.text(`Seite ${blatt}`, R, H - 12, { align: 'right' });
  };

  const neuesBlatt = () => {
    fusszeile();
    doc.addPage();
    blatt++;
    y = 22;
  };

  /** Platz schaffen, bevor etwas geschrieben wird. */
  const platz = (mm: number) => { if (y + mm > H - 20) neuesBlatt(); };

  // --- Titel ---------------------------------------------------------------
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('Verzeichnis von Verarbeitungstätigkeiten', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
  doc.text(`nach Art. 30 Abs. 1 DSGVO · Stand ${deDatum(dn.stand)}`, L, y + 6);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 10, R, y + 10);
  y += 18;

  // --- Kopf: Verantwortlicher (Art. 30 Abs. 1 lit. a) ----------------------
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
  doc.text('Verantwortlicher', L, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const kopfZeilen: Array<[string, string]> = [
    ['Name', dn.kopf.verantwortlicher || '— nicht ausgefüllt —'],
    ['Anschrift', dn.kopf.anschrift || '— nicht ausgefüllt —'],
    ['Telefon', dn.kopf.telefon || '—'],
    ['E-Mail', dn.kopf.email || '—'],
    ['Datenschutzbeauftragter', dn.kopf.dsbName || '— nicht benannt —'],
    ['Kontakt Datenschutzbeauftragter', dn.kopf.dsbKontakt || '—'],
  ];
  for (const [label, wert] of kopfZeilen) {
    platz(7);
    doc.setTextColor(GREY); doc.text(label, L, y);
    doc.setTextColor(NAVY);
    const zeilen = doc.splitTextToSize(wert, BREITE - 62) as string[];
    doc.text(zeilen, L + 62, y);
    y += Math.max(5.5, zeilen.length * 5);
  }
  y += 6;

  // --- Luecken-Hinweis -----------------------------------------------------
  if (dn.luecken.length > 0) {
    platz(14);
    doc.setDrawColor(WARN); doc.setLineWidth(0.4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(WARN);
    doc.text(`Hinweis: ${dn.luecken.length} Angabe(n) fehlen noch.`, L, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    for (const l of dn.luecken.slice(0, 12)) {
      platz(5);
      doc.text('· ' + l, L + 2, y); y += 4.2;
    }
    if (dn.luecken.length > 12) {
      platz(5);
      doc.text(`· und ${dn.luecken.length - 12} weitere`, L + 2, y); y += 4.2;
    }
    y += 4;
  }

  // --- Die Verarbeitungstaetigkeiten ---------------------------------------
  dn.eintraege.forEach((e, i) => {
    platz(24);
    doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.2); doc.line(L, y, R, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(NAVY);
    doc.text(`${i + 1}. ${e.name}`, L, y); y += 7;

    doc.setFontSize(9.5);
    for (const z of e.zeilen) {
      const text = doc.splitTextToSize(z.wert, BREITE - 58) as string[];
      platz(Math.max(6, text.length * 4.6) + 2);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(GREY);
      doc.text(z.label, L, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(NAVY);
      doc.text(text, L + 58, y);
      y += Math.max(5.5, text.length * 4.6) + 1;
    }
    y += 4;
  });

  if (dn.eintraege.length === 0) {
    platz(10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
    doc.text('Es ist noch keine Verarbeitungstätigkeit erfasst.', L, y);
    y += 8;
  }

  fusszeile();
  doc.save(`Verarbeitungsverzeichnis_${String(dn.stand).slice(0, 10)}.pdf`);
}
