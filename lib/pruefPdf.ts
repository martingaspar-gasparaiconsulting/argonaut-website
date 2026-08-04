// ============================================================================
// ARGONAUT OS · lib/pruefPdf.ts — Prüfprotokoll als PDF (A3/P3)
//
// Clientseitig mit jsPDF. A4 hoch: Kopf (Prüfart + Norm), Info-Block,
// Ergebnis, Prüfpunkt-Tabelle (mit Status), Bemerkung, Unterschriftfeld.
// ============================================================================

import { jsPDF } from 'jspdf';
import { unterschriftUeberLinie } from '@/lib/unterschriftPdf';
import { meineUnterschriftCache } from '@/lib/meineUnterschrift';

export interface PruefPunktPdf { punkt: string; status: string; hinweis?: string | null; }

export interface PruefPdfDaten {
  pruef_art: string;
  norm?: string | null;
  objekt?: string | null;
  datum: string;
  pruefer?: string | null;
  intervall_monate?: number | null;
  naechste_pruefung?: string | null;
  ergebnis: string;
  bemerkung?: string | null;
  punkte: PruefPunktPdf[];
  aussteller?: string | null;
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREEN = '#3B8C63', RED = '#C0392B', GREY = '#5A6B82';

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
const STATUS_TXT: Record<string, string> = { ok: 'ok', mangel: 'MANGEL', na: 'n. z.' };
const ERG_TXT: Record<string, string> = { bestanden: 'BESTANDEN', maengel: 'MÄNGEL FESTGESTELLT', durchgefallen: 'DURCHGEFALLEN' };

export function pruefprotokollPdf(dn: PruefPdfDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 18; const R = W - 18;
  let y = 22;

  // Kopf
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Prüfprotokoll', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  doc.text(dn.pruef_art + (dn.norm ? `  ·  ${dn.norm}` : ''), L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 20;

  // Info-Block (zwei Spalten)
  const zeile = (label: string, wert: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text(wert || '—', x, yy + 5);
  };
  const midX = L + 90;
  zeile('Objekt', dn.objekt || '—', L, y);
  zeile('Prüfdatum', deDatum(dn.datum), midX, y);
  y += 13;
  zeile('Prüfer / befähigte Person', dn.pruefer || '—', L, y);
  zeile('Nächste Prüfung', `${deDatum(dn.naechste_pruefung)}${dn.intervall_monate ? ` (Intervall ${dn.intervall_monate} Mon.)` : ''}`, midX, y);
  y += 16;

  // Ergebnis
  const ergColor = dn.ergebnis === 'bestanden' ? GREEN : dn.ergebnis === 'maengel' ? GOLD : RED;
  doc.setFillColor(ergColor); doc.roundedRect(L, y, R - L, 11, 2, 2, 'F');
  doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`Ergebnis: ${ERG_TXT[dn.ergebnis] || dn.ergebnis.toUpperCase()}`, L + 4, y + 7.5);
  y += 18;

  // Tabellenkopf
  const cNr = L, cPunkt = L + 12, cStatus = R - 55, cHinweis = R - 38;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text('Nr.', cNr, y); doc.text('Prüfpunkt', cPunkt, y); doc.text('Status', cStatus, y); doc.text('Hinweis', cHinweis, y);
  doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.2); doc.line(L, y + 2, R, y + 2);
  y += 7;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  dn.punkte.forEach((p, i) => {
    if (y > 265) { doc.addPage(); y = 22; }
    doc.setTextColor(GREY); doc.text(String(i + 1), cNr, y);
    doc.setTextColor(NAVY);
    const punktLines = doc.splitTextToSize(p.punkt || '', cStatus - cPunkt - 3);
    doc.text(punktLines, cPunkt, y);
    doc.setTextColor(p.status === 'mangel' ? RED : p.status === 'ok' ? GREEN : GREY);
    doc.setFont('helvetica', 'bold'); doc.text(STATUS_TXT[p.status] || p.status, cStatus, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(GREY);
    const hinLines = doc.splitTextToSize(p.hinweis || '', R - cHinweis);
    doc.text(hinLines, cHinweis, y);
    const rows = Math.max(punktLines.length, hinLines.length, 1);
    y += 5.5 * rows + 1.5;
    doc.setDrawColor('#EEEEEE'); doc.line(L, y - 2.5, R, y - 2.5);
  });

  // Bemerkung
  if (dn.bemerkung) {
    if (y > 250) { doc.addPage(); y = 22; }
    y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text('Bemerkung', L, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
    const bem = doc.splitTextToSize(dn.bemerkung, R - L); doc.text(bem, L, y + 5); y += 5 + bem.length * 5;
  }

  // Unterschrift
  y = Math.max(y + 14, 262);
  doc.setDrawColor(GREY); doc.setLineWidth(0.3);
  doc.line(L, y, L + 70, y); doc.line(R - 70, y, R, y);
  unterschriftUeberLinie(doc, meineUnterschriftCache(), L, y, 55, 18);
  doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text(`${dn.objekt ? '' : ''}Datum, Unterschrift Prüfer`, L, y + 5);
  doc.text('Unterschrift / Stempel Betreiber', R - 70, y + 5);
  if (dn.aussteller) { doc.setFont('helvetica', 'bold'); doc.setTextColor(NAVY); doc.text(dn.aussteller, R - 70, y - 2); }

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
  doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });

  const safe = (dn.pruef_art || 'Pruefprotokoll').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Pruefprotokoll_${safe}_${deDatum(dn.datum).replace(/\./g, '-')}.pdf`);
}
