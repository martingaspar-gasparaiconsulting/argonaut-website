// ============================================================================
// ARGONAUT OS · Baustein "inventurProtokollPdf" (Etappe 3 · Inventur-Vollausbau)
// Erzeugt ein druckreifes Inventur-Protokoll als PDF mit dem Firmen-Briefkopf
// (aus profiles) — im selben Stil wie umsatzReportPdf. Reines Client-Rendering
// via jsPDF, Layout selbst gezeichnet. Mit automatischem Seitenumbruch fuer
// lange Artikellisten und Unterschriftszeile.
// ============================================================================

import { jsPDF } from 'jspdf';

export type PdfFirma = {
  name?: string | null;
  rechtsform?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  telefon?: string | null;
  email?: string | null;
  website?: string | null;
  ustId?: string | null;
  steuernummer?: string | null;
  geschaeftsfuehrer?: string | null;
  akzentfarbe?: string | null;
};

export type InventurPosition = {
  bezeichnung: string;
  artikelnummer?: string | null;
  einheit?: string | null;
  soll: number;
  ist: number | null;      // null = noch nicht gezaehlt
  wertDiff: number | null; // (ist - soll) * einkaufspreis
};

export type InventurPdfDaten = {
  firma: PdfFirma;
  stichtag: string;
  kpi: { gesamt: number; gezaehlt: number; abweichungen: number; wertDiff: number };
  positionen: InventurPosition[];
  kiText?: string | null;
  kiAktion?: string | null;
};

// ── Helfer ────────────────────────────────────────────────────────────────
function hexRgb(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!hex) return fallback;
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return fallback;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return fallback;
  return [r, g, b];
}
function euro(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC';
}
function zahl(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}
function heuteLang(): string {
  return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}
function kuerze(doc: jsPDF, txt: string, maxB: number): string {
  if (doc.getTextWidth(txt) <= maxB) return txt;
  let t = txt;
  while (t.length > 1 && doc.getTextWidth(t + '\u2026') > maxB) t = t.slice(0, -1);
  return t + '\u2026';
}

// Spalten (A4, Rand 20/190)
const randL = 20;
const randR = 190;
const COL = {
  nr: randL + 2,       // links
  bez: randL + 24,     // links
  sollR: 118,          // rechtsbuendig
  istR: 140,           // rechtsbuendig
  diffR: 162,          // rechtsbuendig
  wertR: randR - 2,    // rechtsbuendig
};
const bezMaxB = COL.sollR - COL.bez - 16; // Breite fuer Bezeichnung

// ── Dokument bauen (testbar, ohne Speichern) ────────────────────────────────
export function baueInventurDoc(d: InventurPdfDaten): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const akzent = hexRgb(d.firma.akzentfarbe, [201, 168, 76]);
  const dunkel: [number, number, number] = [26, 35, 50];
  const grau: [number, number, number] = [100, 116, 139];
  const gruen: [number, number, number] = [34, 197, 94];
  const rot: [number, number, number] = [220, 38, 38];
  const fussY = 287;

  let seiteNr = 1;
  const fussZeile = () => {
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.3);
    doc.line(randL, fussY - 4, randR, fussY - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(`Erstellt mit ARGONAUT OS \u00B7 ${heuteLang()}`, randL, fussY);
    doc.text(`Seite ${seiteNr}`, randR, fussY, { align: 'right' });
  };

  const tabellenKopf = (yy: number): number => {
    doc.setFillColor(akzent[0], akzent[1], akzent[2]);
    doc.rect(randL, yy, randR - randL, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Nr.', COL.nr, yy + 4.8);
    doc.text('Artikel', COL.bez, yy + 4.8);
    doc.text('Soll', COL.sollR, yy + 4.8, { align: 'right' });
    doc.text('Ist', COL.istR, yy + 4.8, { align: 'right' });
    doc.text('Diff.', COL.diffR, yy + 4.8, { align: 'right' });
    doc.text('Wert-Diff.', COL.wertR, yy + 4.8, { align: 'right' });
    return yy + 7;
  };

  let y = 18;

  // ── Briefkopf ──
  const firmenName = d.firma.name?.trim() || 'Mein Unternehmen';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(akzent[0], akzent[1], akzent[2]);
  doc.text(firmenName, randL, y);
  if (d.firma.rechtsform?.trim()) {
    const nameBreite = doc.getTextWidth(firmenName);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(d.firma.rechtsform.trim(), randL + nameBreite + 3, y);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  let yR = 14;
  const rechtsZeile = (txt: string) => {
    if (!txt) return;
    doc.text(txt, randR, yR, { align: 'right' });
    yR += 4.2;
  };
  if (d.firma.ustId?.trim()) rechtsZeile(`USt-IdNr.: ${d.firma.ustId.trim()}`);
  if (d.firma.steuernummer?.trim()) rechtsZeile(`Steuer-Nr.: ${d.firma.steuernummer.trim()}`);
  if (d.firma.geschaeftsfuehrer?.trim()) rechtsZeile(`GF: ${d.firma.geschaeftsfuehrer.trim()}`);

  y += 6.5;
  doc.setFontSize(9.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  const adresse = [d.firma.strasse?.trim(), [d.firma.plz?.trim(), d.firma.ort?.trim()].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  if (adresse) { doc.text(adresse, randL, y); y += 4.5; }
  const kontakt = [d.firma.telefon?.trim(), d.firma.email?.trim(), d.firma.website?.trim()]
    .filter(Boolean)
    .join('  \u00B7  ');
  if (kontakt) { doc.text(kontakt, randL, y); y += 4.5; }

  y += 2;
  doc.setDrawColor(akzent[0], akzent[1], akzent[2]);
  doc.setLineWidth(0.6);
  doc.line(randL, y, randR, y);
  y += 9;

  // ── Titel ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text('Inventur-Protokoll', randL, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  doc.text(`Stichtag: ${d.stichtag}`, randL, y);
  doc.text(`Erstellt am ${heuteLang()}`, randR, y, { align: 'right' });
  y += 10;

  // ── KPI-Block ──
  const kpis: { titel: string; wert: string; farbe: [number, number, number] }[] = [
    { titel: 'Artikel gesamt', wert: String(d.kpi.gesamt), farbe: akzent },
    { titel: 'Gez\u00E4hlt', wert: `${d.kpi.gezaehlt} / ${d.kpi.gesamt}`, farbe: [0, 150, 190] },
    { titel: 'Mit Abweichung', wert: String(d.kpi.abweichungen), farbe: d.kpi.abweichungen > 0 ? rot : gruen },
    { titel: 'Wert-Differenz', wert: euro(d.kpi.wertDiff), farbe: d.kpi.wertDiff < 0 ? rot : gruen },
  ];
  const boxB = (randR - randL - 3 * 4) / 4;
  const boxH = 22;
  kpis.forEach((k, i) => {
    const x = randL + i * (boxB + 4);
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.3);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, y, boxB, boxH, 2, 2, 'FD');
    doc.setFillColor(k.farbe[0], k.farbe[1], k.farbe[2]);
    doc.rect(x, y, boxB, 1.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(k.titel, x + 3, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
    doc.text(k.wert, x + 3, y + 15);
  });
  y += boxH + 8;

  // ── Artikel-Tabelle mit Seitenumbruch ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text('Z\u00E4hlliste', randL, y);
  y += 6;
  y = tabellenKopf(y);

  let sumSoll = 0;
  let sumIst = 0;
  let sumWert = 0;
  const pos = d.positionen ?? [];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  pos.forEach((p, i) => {
    // Seitenumbruch, wenn kein Platz mehr
    if (y + 6 > fussY - 8) {
      fussZeile();
      doc.addPage();
      seiteNr += 1;
      y = 20;
      y = tabellenKopf(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }
    if (i % 2 === 1) {
      doc.setFillColor(246, 247, 249);
      doc.rect(randL, y, randR - randL, 6, 'F');
    }
    const soll = Number(p.soll) || 0;
    const ist = p.ist;
    const diff = ist === null ? null : (Number(ist) || 0) - soll;
    sumSoll += soll;
    if (ist !== null) sumIst += Number(ist) || 0;
    if (p.wertDiff !== null && p.wertDiff !== undefined) sumWert += Number(p.wertDiff) || 0;

    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.setFontSize(8);
    doc.text(kuerze(doc, p.artikelnummer?.trim() || '\u2014', 18), COL.nr, y + 4);

    doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
    doc.setFontSize(9);
    const einheit = p.einheit?.trim() ? ` ${p.einheit.trim()}` : '';
    doc.text(kuerze(doc, p.bezeichnung || '\u2014', bezMaxB), COL.bez, y + 4);
    doc.text(zahl(soll) + einheit, COL.sollR, y + 4, { align: 'right' });
    doc.text(ist === null ? '\u2014' : zahl(Number(ist)) + einheit, COL.istR, y + 4, { align: 'right' });

    if (diff === null) {
      doc.setTextColor(grau[0], grau[1], grau[2]);
      doc.text('\u2014', COL.diffR, y + 4, { align: 'right' });
      doc.text('\u2014', COL.wertR, y + 4, { align: 'right' });
    } else {
      const c = diff === 0 ? gruen : rot;
      doc.setTextColor(c[0], c[1], c[2]);
      doc.text((diff > 0 ? '+' : '') + zahl(diff), COL.diffR, y + 4, { align: 'right' });
      const w = p.wertDiff ?? 0;
      if (w === 0) {
        doc.setTextColor(grau[0], grau[1], grau[2]);
        doc.text('\u2014', COL.wertR, y + 4, { align: 'right' });
      } else {
        doc.setTextColor(rot[0], rot[1], rot[2]);
        doc.text((w > 0 ? '+' : '') + euro(w), COL.wertR, y + 4, { align: 'right' });
      }
    }
    y += 6;
  });

  if (pos.length === 0) {
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text('Keine Artikel vorhanden.', COL.bez, y + 4);
    y += 6;
  }

  // Summenzeile
  if (y + 8 > fussY - 8) { fussZeile(); doc.addPage(); seiteNr += 1; y = 20; }
  doc.setDrawColor(akzent[0], akzent[1], akzent[2]);
  doc.setLineWidth(0.4);
  doc.line(randL, y, randR, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text('Summe', COL.bez, y + 5);
  doc.text(zahl(sumSoll), COL.sollR, y + 5, { align: 'right' });
  doc.text(zahl(sumIst), COL.istR, y + 5, { align: 'right' });
  const wc = sumWert < 0 ? rot : sumWert > 0 ? gruen : dunkel;
  doc.setTextColor(wc[0], wc[1], wc[2]);
  doc.text(euro(sumWert), COL.wertR, y + 5, { align: 'right' });
  y += 14;

  // ── KI-Einschaetzung ──
  if (d.kiText?.trim()) {
    if (y + 30 > fussY - 8) { fussZeile(); doc.addPage(); seiteNr += 1; y = 20; }
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(akzent[0], akzent[1], akzent[2]);
    doc.setLineWidth(0.3);
    const textBreite = randR - randL - 8;
    const zeilen = doc.splitTextToSize(d.kiText.trim(), textBreite);
    const aktionZeilen = d.kiAktion?.trim() ? doc.splitTextToSize('Empfehlung: ' + d.kiAktion.trim(), textBreite) : [];
    const blockH = 10 + zeilen.length * 5 + (aktionZeilen.length ? aktionZeilen.length * 5 + 2 : 0) + 4;
    doc.roundedRect(randL, y, randR - randL, blockH, 2, 2, 'FD');
    doc.setFillColor(akzent[0], akzent[1], akzent[2]);
    doc.rect(randL, y, 1.5, blockH, 'F');
    let yk = y + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(akzent[0], akzent[1], akzent[2]);
    doc.text('ARGONAUT \u00B7 Einsch\u00E4tzung', randL + 5, yk);
    yk += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
    zeilen.forEach((z: string) => { doc.text(z, randL + 5, yk); yk += 5; });
    if (aktionZeilen.length) {
      yk += 2;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(akzent[0], akzent[1], akzent[2]);
      aktionZeilen.forEach((z: string) => { doc.text(z, randL + 5, yk); yk += 5; });
    }
    y += blockH + 10;
  }

  // ── Unterschriftszeile ──
  if (y + 24 > fussY - 8) { fussZeile(); doc.addPage(); seiteNr += 1; y = 20; }
  y += 6;
  doc.setDrawColor(150, 160, 175);
  doc.setLineWidth(0.3);
  const sigB = (randR - randL - 10) / 2;
  doc.line(randL, y + 8, randL + sigB, y + 8);
  doc.line(randR - sigB, y + 8, randR, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  doc.text('Gez\u00E4hlt von (Name, Datum)', randL, y + 12);
  doc.text('Freigabe / Unterschrift', randR - sigB, y + 12);

  // Fusszeile letzte Seite
  fussZeile();
  return doc;
}

// ── Bauen + Speichern (fuer den Button in der App) ──────────────────────────
export function erstelleInventurProtokollPdf(d: InventurPdfDaten): void {
  const doc = baueInventurDoc(d);
  const datumDatei = new Date().toISOString().slice(0, 10);
  const nameDatei = (d.firma.name || 'Firma').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  doc.save(`Inventur-Protokoll_${nameDatei}_${datumDatei}.pdf`);
}
