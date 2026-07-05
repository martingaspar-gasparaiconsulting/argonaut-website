// ============================================================================
// ARGONAUT OS · Baustein "umsatzReportPdf" (Etappe 2, Analytics QW8)
// Erzeugt einen druckreifen Umsatz-Report als PDF mit dem Firmen-Briefkopf
// des Unternehmers (aus profiles). Reines Client-Rendering via jsPDF.
// Layout selbst gezeichnet (kein Screenshot) -> sauber, schnell, zuverlässig.
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

export type UmsatzPdfDaten = {
  firma: PdfFirma;
  zeitraumLabel: string;
  kpi: { gesamt: number; bezahlt: number; offen: number; ueberfaellig: number; anzahl: number };
  vorLabel?: string | null;
  trendGesamt?: number | null;
  trendBezahlt?: number | null;
  monate: { name: string; wert: number }[];
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
function heuteLang(): string {
  return new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}
function trendText(t: number | null | undefined, vorLabel: string | null | undefined): string {
  if (typeof t !== 'number' || !vorLabel) return '';
  const pfeil = t >= 0 ? '\u25B2' : '\u25BC';
  return `${pfeil} ${Math.abs(t)} % vs. ${vorLabel}`;
}

// ── Haupt-Funktion ──────────────────────────────────────────────────────────
export function erstelleUmsatzReportPdf(d: UmsatzPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const seiteB = 210;
  const randL = 20;
  const randR = 190; // 210 - 20
  const akzent = hexRgb(d.firma.akzentfarbe, [201, 168, 76]); // Fallback Gold
  const dunkel: [number, number, number] = [26, 35, 50];
  const grau: [number, number, number] = [100, 116, 139];
  const gruen: [number, number, number] = [34, 197, 94];
  const rot: [number, number, number] = [220, 38, 38];

  let y = 18;

  // ── Briefkopf: Firmenname + Rechtsform ──
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

  // Rechts oben: Steuerangaben + Geschäftsführer (rechtsbündig)
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

  // Adresse + Kontakt (links, unter dem Namen)
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

  // Trennlinie in Akzentfarbe
  y += 2;
  doc.setDrawColor(akzent[0], akzent[1], akzent[2]);
  doc.setLineWidth(0.6);
  doc.line(randL, y, randR, y);
  y += 9;

  // ── Titel-Block ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text('Umsatz-Report', randL, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  doc.text(`Zeitraum: ${d.zeitraumLabel}`, randL, y);
  doc.text(`Erstellt am ${heuteLang()}`, randR, y, { align: 'right' });
  y += 10;

  // ── KPI-Block (4 Boxen nebeneinander) ──
  const kpis: { titel: string; wert: string; trend?: string; farbe: [number, number, number] }[] = [
    { titel: 'Gesamtumsatz', wert: euro(d.kpi.gesamt), trend: trendText(d.trendGesamt, d.vorLabel), farbe: akzent },
    { titel: 'Bezahlt', wert: euro(d.kpi.bezahlt), trend: trendText(d.trendBezahlt, d.vorLabel), farbe: gruen },
    { titel: 'Offen', wert: euro(d.kpi.offen), farbe: [0, 150, 190] },
    { titel: '\u00DCberf\u00E4llig', wert: euro(d.kpi.ueberfaellig), farbe: rot },
  ];
  const boxB = (randR - randL - 3 * 4) / 4; // 4 Boxen, 3 Lücken à 4mm
  const boxH = 24;
  kpis.forEach((k, i) => {
    const x = randL + i * (boxB + 4);
    doc.setDrawColor(225, 228, 232);
    doc.setLineWidth(0.3);
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(x, y, boxB, boxH, 2, 2, 'FD');
    // Akzentbalken oben
    doc.setFillColor(k.farbe[0], k.farbe[1], k.farbe[2]);
    doc.rect(x, y, boxB, 1.2, 'F');
    // Titel
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text(k.titel, x + 3, y + 6.5);
    // Wert
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
    doc.text(k.wert, x + 3, y + 14);
    // Trend
    if (k.trend) {
      const positiv = k.trend.startsWith('\u25B2');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const tc = positiv ? gruen : rot;
      doc.setTextColor(tc[0], tc[1], tc[2]);
      doc.text(k.trend, x + 3, y + 20);
    }
  });
  y += boxH + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  doc.text(`Basis: ${d.kpi.anzahl} Rechnung${d.kpi.anzahl === 1 ? '' : 'en'} im Zeitraum`, randL, y);
  y += 9;

  // ── Monats-Tabelle ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text('Umsatz pro Monat (letzte 12 Monate)', randL, y);
  y += 6;

  // Kopfzeile
  doc.setFillColor(akzent[0], akzent[1], akzent[2]);
  doc.rect(randL, y, randR - randL, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('Monat', randL + 3, y + 4.8);
  doc.text('Umsatz', randR - 3, y + 4.8, { align: 'right' });
  y += 7;

  const monate = d.monate && d.monate.length > 0 ? d.monate : [];
  let summe = 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  monate.forEach((m, i) => {
    summe += Number(m.wert) || 0;
    if (i % 2 === 1) {
      doc.setFillColor(246, 247, 249);
      doc.rect(randL, y, randR - randL, 6, 'F');
    }
    doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
    doc.text(m.name, randL + 3, y + 4);
    doc.text(euro(m.wert), randR - 3, y + 4, { align: 'right' });
    y += 6;
  });
  if (monate.length === 0) {
    doc.setTextColor(grau[0], grau[1], grau[2]);
    doc.text('Keine Umsatzdaten im Zeitraum.', randL + 3, y + 4);
    y += 6;
  }
  // Summenzeile
  doc.setDrawColor(akzent[0], akzent[1], akzent[2]);
  doc.setLineWidth(0.4);
  doc.line(randL, y, randR, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(dunkel[0], dunkel[1], dunkel[2]);
  doc.text('Summe (12 Monate)', randL + 3, y + 5);
  doc.text(euro(summe), randR - 3, y + 5, { align: 'right' });
  y += 12;

  // ── KI-Einschätzung ──
  if (d.kiText?.trim()) {
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
    y += blockH + 8;
  }

  // ── Fußzeile ──
  const fussY = 287;
  doc.setDrawColor(225, 228, 232);
  doc.setLineWidth(0.3);
  doc.line(randL, fussY - 4, randR, fussY - 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(grau[0], grau[1], grau[2]);
  doc.text(`Erstellt mit ARGONAUT OS \u00B7 ${heuteLang()}`, randL, fussY);
  doc.text('Seite 1', randR, fussY, { align: 'right' });

  // ── Speichern ──
  const datumDatei = new Date().toISOString().slice(0, 10);
  const nameDatei = (d.firma.name || 'Firma').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  doc.save(`Umsatz-Report_${nameDatei}_${datumDatei}.pdf`);
}
