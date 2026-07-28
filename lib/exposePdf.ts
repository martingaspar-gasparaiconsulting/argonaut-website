// lib/exposePdf.ts
// Druckfertiges Immobilien-Exposé (A4 hoch) via jsPDF. Enthält die GEG-§87-
// Pflichtangaben (Ausweis-Art, Endenergiewert, Energieträger, Baujahr, Klasse)
// als eigenen, hervorgehobenen Block.
import { jsPDF } from 'jspdf';

export interface ExposePdfDaten {
  aussteller: string;
  bezeichnung: string;
  objektArt: string;
  vermarktungArt: string;
  preisLabel: string;
  ort: string;
  adresse: string;
  preis: string;
  nebenkosten: string;
  wohnflaeche: string;
  grundstueck: string;
  zimmer: string;
  baujahr: string;
  etage: string;
  verfuegbar: string;
  preisProM2: string;
  energieausweisVorhanden: boolean;
  energieTyp: string;
  energiekennwert: string;
  energieklasse: string;
  energietraeger: string;
  lageText: string;
  ausstattungText: string;
  objektText: string;
}

export function exposePdf(d: ExposePdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18, R = 192, W = R - L, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 20;

  function seiteWennNoetig(h: number) {
    if (y + h > PH - 18) { doc.addPage(); y = 20; }
  }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || 'EXPOSÉ').toUpperCase(), L, y);
  doc.text('EXPOSÉ', R, y, { align: 'right' });
  y += 8;
  doc.setTextColor(navy); doc.setFontSize(19);
  doc.text(doc.splitTextToSize(d.bezeichnung, W), L, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(dim);
  doc.text([d.objektArt, d.vermarktungArt, d.ort].filter(Boolean).join(' · '), L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 9;

  // Preisblock
  doc.setFillColor(245, 241, 230); doc.rect(L, y - 5, W, 16, 'F');
  doc.setTextColor(navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text(`${d.preisLabel}:`, L + 3, y + 4);
  doc.setFontSize(15); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text(d.preis, L + 55, y + 4.5);
  doc.setFontSize(9); doc.setTextColor(dim); doc.setFont('helvetica', 'normal');
  const extra = [d.preisProM2, d.nebenkosten ? `Nebenkosten ${d.nebenkosten}` : ''].filter(Boolean).join('  ·  ');
  if (extra) doc.text(extra, R - 3, y + 4, { align: 'right' });
  y += 18;

  // Eckdaten
  const eck: [string, string][] = [
    ['Wohnfläche', d.wohnflaeche], ['Grundstück', d.grundstueck], ['Zimmer', d.zimmer],
    ['Baujahr', d.baujahr], ['Etage', d.etage], ['Verfügbar ab', d.verfuegbar], ['Adresse', d.adresse],
  ];
  const gefuellt = eck.filter(([, v]) => v && v.trim());
  if (gefuellt.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
    doc.text('Eckdaten', L, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const colW = W / 2;
    gefuellt.forEach(([k, v], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = L + col * colW, yy = y + row * 7;
      doc.setTextColor(dim); doc.text(k, x, yy);
      doc.setTextColor(navy); doc.text(doc.splitTextToSize(v, colW - 38), x + 34, yy);
    });
    y += Math.ceil(gefuellt.length / 2) * 7 + 6;
  }

  // Energie / GEG
  seiteWennNoetig(34);
  doc.setDrawColor(210); doc.setFillColor(250, 250, 252);
  const eH = d.energieausweisVorhanden ? 30 : 16;
  doc.rect(L, y, W, eH, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(navy);
  doc.text('Energieausweis (GEG § 87)', L + 3, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(navy);
  if (d.energieausweisVorhanden) {
    const rows: [string, string][] = [
      ['Art des Ausweises', d.energieTyp || '—'],
      ['Endenergie', d.energiekennwert || '—'],
      ['Energieeffizienzklasse', d.energieklasse || '—'],
      ['Wesentl. Energieträger', d.energietraeger || '—'],
      ['Baujahr', d.baujahr || '—'],
    ];
    rows.forEach((r, i) => {
      const yy = y + 12 + i * 4.2;
      doc.setTextColor(dim); doc.text(r[0], L + 3, yy);
      doc.setTextColor(navy); doc.text(r[1], L + 60, yy);
    });
  } else {
    doc.setTextColor(dim);
    doc.text('Energieausweis liegt zum Zeitpunkt der Anzeige noch nicht vor (Ausnahme n. GEG § 87).', L + 3, y + 12);
  }
  y += eH + 8;

  // Beschreibungen
  const abschnitte: [string, string][] = [
    ['Lage', d.lageText], ['Ausstattung', d.ausstattungText], ['Objektbeschreibung', d.objektText],
  ];
  for (const [titel, text] of abschnitte) {
    if (!text || !text.trim()) continue;
    seiteWennNoetig(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
    doc.text(titel, L, y); y += 5.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const zeilen = doc.splitTextToSize(text, W);
    for (const z of zeilen) { seiteWennNoetig(6); doc.text(z, L, y); y += 5; }
    y += 5;
  }

  // Fußzeile
  seiteWennNoetig(14);
  doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Alle Angaben ohne Gewähr, Irrtümer und Zwischenverkauf/-vermietung vorbehalten. Kein Kaufvertrag/Mietvertrag.', L, y);

  const name = (d.bezeichnung || 'Expose').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  doc.save(`Expose_${name}.pdf`);
}
