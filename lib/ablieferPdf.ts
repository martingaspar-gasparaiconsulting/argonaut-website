// ============================================================================
// ARGONAUT OS · lib/ablieferPdf.ts — Abliefernachweis (ePOD) als PDF (A10/B3)
//
// Clientseitig mit jsPDF. A4 hoch: Tour-Kopf, Stopp-Daten, Zustell-Status +
// Zeitstempel und die erfasste Empfänger-Unterschrift (aus Canvas-Data-URL).
// ============================================================================

import { jsPDF } from 'jspdf';

export interface AblieferDaten {
  tour: string;
  datum: string;
  fahrer?: string | null;
  fahrzeug?: string | null;
  empfaenger?: string | null;
  adresse?: string | null;
  kolli: number;
  status: string;
  zugestellt_am?: string | null;
  empfaenger_name?: string | null;
  unterschrift_data?: string | null;
  aussteller?: string | null;
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82', GREEN = '#3B8C63', RED = '#C0392B', WARN = '#B7791F';
const STATUS_TXT: Record<string, string> = { offen: 'OFFEN', zugestellt: 'ZUGESTELLT', nicht_angetroffen: 'NICHT ANGETROFFEN', verweigert: 'ANNAHME VERWEIGERT' };

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
function deZeit(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${deDatum(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
}

export function ablieferPdf(dn: AblieferDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, L = 20, R = W - 20;
  let y = 22;

  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Abliefernachweis', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  doc.text(`${dn.tour} · ${deDatum(dn.datum)}`, L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 20;

  const zeile = (label: string, wert: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text(wert || '—', x, yy + 5);
  };
  const midX = L + 90;
  zeile('Empfänger', dn.empfaenger || '—', L, y);
  zeile('Kolli', String(dn.kolli), midX, y);
  y += 13;
  zeile('Lieferadresse', dn.adresse || '—', L, y);
  y += 13;
  zeile('Fahrer', dn.fahrer || '—', L, y);
  zeile('Fahrzeug', dn.fahrzeug || '—', midX, y);
  y += 16;

  // Status-Balken
  const col = dn.status === 'zugestellt' ? GREEN : dn.status === 'verweigert' ? RED : WARN;
  doc.setFillColor(col); doc.roundedRect(L, y, R - L, 11, 2, 2, 'F');
  doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`${STATUS_TXT[dn.status] || dn.status.toUpperCase()}   ·   ${deZeit(dn.zugestellt_am)}`, L + 4, y + 7.5);
  y += 18;

  // Empfänger-Bestätigung + Unterschrift
  zeile('Angenommen von', dn.empfaenger_name || '—', L, y);
  y += 12;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text('Unterschrift des Empfängers:', L, y); y += 3;
  if (dn.unterschrift_data && dn.unterschrift_data.startsWith('data:image')) {
    try { doc.addImage(dn.unterschrift_data, 'PNG', L, y, 80, 30); } catch { /* ignore */ }
  }
  doc.setDrawColor(GREY); doc.setLineWidth(0.3); doc.line(L, y + 32, L + 80, y + 32);
  y += 40;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
  if (dn.aussteller) doc.text(dn.aussteller, L, 288);
  doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });

  const safe = (dn.empfaenger || 'Ablieferung').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Abliefernachweis_${safe}_${deDatum(dn.datum).replace(/\./g, '-')}.pdf`);
}
