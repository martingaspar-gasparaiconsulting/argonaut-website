// ============================================================================
// ARGONAUT OS · lib/kfzBestandPdf.ts — Paket 260 · Bestandsliste als PDF (K1 Teil 2)
//
// Clientseitig mit jsPDF (wie lib/fristenlistePdf.ts). A4 quer: genau die
// Fahrzeuge, die gerade gefiltert am Bildschirm stehen. Einkaufspreise nur,
// wenn die Spalte „Einkaufspreis" eingeblendet ist (Liste geht oft an den Hof).
// ============================================================================

import { jsPDF } from 'jspdf';
import type { ListenZeile } from './kfzBestand';

export type BestandslisteDaten = {
  titel: string;            // „Fahrzeugbestand" / „Bootsbestand"
  betrieb?: string | null;
  standIso: string;
  filterText: string;       // „Alle im Bestand · Sparte Pkw"
  mitEk: boolean;
  zeilen: ListenZeile[];
  summeVk: string;
  summeEk: string | null;
};

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

function deDatum(iso: string): string {
  const p = iso.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

export function bestandslistePdf(d: BestandslisteDaten): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, L = 14, R = W - 14;
  let y = 18;

  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(d.titel, L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
  doc.text(`${d.betrieb ? d.betrieb + ' · ' : ''}Stand ${deDatum(d.standIso)} · ${d.filterText} · ${d.zeilen.length} Einträge`, L, y + 6);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 9, R, y + 9);
  y += 16;

  const spalten: { k: keyof ListenZeile; t: string; x: number; b: number; rechts?: boolean }[] = [
    { k: 'nr', t: 'Nr.', x: L, b: 16 },
    { k: 'fahrzeug', t: 'Fahrzeug', x: L + 18, b: 70 },
    { k: 'ezKm', t: 'EZ · km', x: L + 90, b: 36 },
    { k: 'kennzeichen', t: 'Kennzeichen', x: L + 128, b: 26 },
    { k: 'standort', t: 'Standort', x: L + 156, b: 30 },
    { k: 'status', t: 'Status', x: L + 188, b: 24 },
    { k: 'standtage', t: 'Tage', x: L + 222, b: 10, rechts: true },
    ...(d.mitEk ? [{ k: 'ek' as const, t: 'EK netto', x: L + 247, b: 22, rechts: true }] : []),
    { k: 'vk', t: 'VK brutto', x: R, b: 24, rechts: true },
  ];

  const kopf = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(GREY);
    for (const s of spalten) doc.text(s.t, s.x, y, s.rechts ? { align: 'right' } : undefined);
    doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.2); doc.line(L, y + 2, R, y + 2);
    y += 7;
  };
  kopf();

  doc.setFontSize(9.5);
  if (d.zeilen.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setTextColor(GREY);
    doc.text('Keine Fahrzeuge in dieser Auswahl.', L, y);
    y += 8;
  }
  for (const z of d.zeilen) {
    if (y > 190) { doc.addPage(); y = 18; kopf(); doc.setFontSize(9.5); }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(NAVY);
    let zeilen = 1;
    for (const s of spalten) {
      const txt = doc.splitTextToSize(String(z[s.k] ?? '—'), s.b) as string[];
      zeilen = Math.max(zeilen, txt.length);
      if (s.k === 'vk') doc.setFont('helvetica', 'bold');
      doc.text(txt, s.x, y, s.rechts ? { align: 'right' } : undefined);
      doc.setFont('helvetica', 'normal');
    }
    y += 4.6 * zeilen + 1.6;
    doc.setDrawColor('#EEEEEE'); doc.setLineWidth(0.2); doc.line(L, y - 3, R, y - 3);
  }

  y += 2;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text(`Summe Verkaufspreise: ${d.summeVk}${d.mitEk && d.summeEk ? ` · Summe Einkauf netto: ${d.summeEk}` : ''}`, L, y);

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    doc.text('Interne Bestandsliste · Erstellt mit ARGONAUT OS', W / 2, 203, { align: 'center' });
    doc.text(`Seite ${i}/${seiten}`, R, 203, { align: 'right' });
  }
  doc.save(`${d.titel.replace(/\s+/g, '_')}_${deDatum(d.standIso).replace(/\./g, '-')}.pdf`);
}
