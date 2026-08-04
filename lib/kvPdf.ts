// ============================================================================
// ARGONAUT OS · lib/kvPdf.ts — Kostenvoranschlag Hilfsmittel als PDF (A12/B3)
//
// Clientseitig mit jsPDF. A4 hoch: Aussteller (Sanitätshaus) + Empfänger
// (Krankenkasse), Versicherten-/Verordnungsdaten, HMV-Positionen mit
// Kassenanteil und Mehrkosten, Summen.
// ============================================================================

import { jsPDF } from 'jspdf';
import { kvSumme, mehrkostenSumme, gesamtSumme } from '@/lib/hilfsmittel';
import { unterschriftUeberLinie } from '@/lib/unterschriftPdf';
import { meineUnterschriftCache } from '@/lib/meineUnterschrift';

export interface KvAussteller { name?: string | null; anschrift?: string | null; ort?: string | null }
export interface KvVersorgung {
  versicherter: string; versicherten_nr?: string | null; krankenkasse?: string | null; arzt?: string | null;
  verordnung_datum?: string | null; diagnose?: string | null; kv_nummer?: string | null;
}
export interface KvPos { position: number; hmv_nummer?: string | null; bezeichnung?: string | null; menge: number; einzelpreis: number; mehrkosten: number }

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
function eur(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export function kvPdf(aussteller: KvAussteller, v: KvVersorgung, positionen: KvPos[]): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, L = 20, R = W - 20;
  let y = 20;

  // Aussteller
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
  doc.text(aussteller.name || '__________', L, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(GREY);
  if (aussteller.anschrift) { doc.text(aussteller.anschrift, L, y); y += 5; }
  y += 4;

  // Empfänger
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text('An die Krankenkasse:', L, y); y += 5;
  doc.setFont('helvetica', 'bold'); doc.text(v.krankenkasse || '__________', L, y); y += 10;

  // Titel
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(NAVY);
  doc.text('Kostenvoranschlag', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
  doc.text(`Hilfsmittel-Versorgung${v.kv_nummer ? ` · Nr. ${v.kv_nummer}` : ''}`, L, y + 6);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 10, R, y + 10); y += 18;

  // Versicherten-/Verordnungsdaten
  const zeile = (label: string, wert: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text(wert || '—', x, yy + 5);
  };
  const midX = L + 90;
  zeile('Versicherter', v.versicherter, L, y);
  zeile('Versicherten-Nr.', v.versicherten_nr || '—', midX, y); y += 13;
  zeile('Verordnender Arzt', v.arzt || '—', L, y);
  zeile('Verordnung vom', deDatum(v.verordnung_datum), midX, y); y += 13;
  zeile('Diagnose', v.diagnose || '—', L, y); y += 16;

  // Positions-Tabelle
  const cNr = L, cBez = L + 32, cMg = R - 66, cKa = R - 40, cMk = R;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text('HMV-Nr.', cNr, y); doc.text('Bezeichnung', cBez, y);
  doc.text('Menge', cMg, y, { align: 'right' }); doc.text('Kasse', cKa, y, { align: 'right' }); doc.text('Mehrk.', cMk, y, { align: 'right' });
  doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.2); doc.line(L, y + 2, R, y + 2); y += 7;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  positionen.forEach((p) => {
    if (y > 250) { doc.addPage(); y = 22; }
    doc.text(p.hmv_nummer || '—', cNr, y);
    const bl = doc.splitTextToSize(p.bezeichnung || '—', cMg - cBez - 4); doc.text(bl, cBez, y);
    doc.text(String(p.menge), cMg, y, { align: 'right' });
    doc.text(eur(p.einzelpreis), cKa, y, { align: 'right' });
    doc.text(eur(p.mehrkosten), cMk, y, { align: 'right' });
    y += Math.max(bl.length * 5, 5) + 1.5;
    doc.setDrawColor('#EEEEEE'); doc.line(L, y - 2, R, y - 2);
  });
  y += 4;

  // Summen
  if (y > 255) { doc.addPage(); y = 22; }
  const summeZeile = (label: string, wert: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 10.5); doc.setTextColor(NAVY);
    doc.text(label, cMg - 30, y, { align: 'right' }); doc.text(wert, R, y, { align: 'right' }); y += bold ? 8 : 6;
  };
  summeZeile('Summe Kassenanteil:', eur(kvSumme(positionen)));
  summeZeile('Summe Mehrkosten (Versicherter):', eur(mehrkostenSumme(positionen)));
  summeZeile('Gesamt:', eur(gesamtSumme(positionen)), true);

  // Unterschrift
  y = Math.max(y + 10, 262);
  if (y > 278) { doc.addPage(); y = 262; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text(`${aussteller.ort || '__________'}, den ${deDatum(new Date().toISOString())}`, L, y); y += 14;
  doc.setDrawColor(GREY); doc.setLineWidth(0.3); doc.line(L, y, L + 80, y);
  unterschriftUeberLinie(doc, meineUnterschriftCache(), L, y, 55, 18);
  doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text('Unterschrift / Stempel Leistungserbringer', L, y + 5);

  doc.setFontSize(8); doc.setTextColor(GREY);
  doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });

  const safe = (v.versicherter || 'KV').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Kostenvoranschlag_${safe}.pdf`);
}
