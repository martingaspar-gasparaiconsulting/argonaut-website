// ============================================================================
// ARGONAUT OS · lib/gutachtenPdf.ts — Gutachten als PDF (A11/B3)
//
// Clientseitig mit jsPDF. A4 hoch: Kopf, Info-Block, Positionen gegliedert nach
// Befund / Bewertung / Mangel / Empfehlung, Positions-Summe, Zusammenfassung,
// JVEG-Honorar, Ort/Unterschrift.
// ============================================================================

import { jsPDF } from 'jspdf';
import { honorar, honorarsatz, summePositionen } from '@/lib/gutachten';
import { unterschriftUeberLinie } from '@/lib/unterschriftPdf';

export interface GutachtenKopf {
  titel: string; auftraggeber?: string | null; objekt?: string | null; art?: string | null;
  aktenzeichen?: string | null; datum: string; gutachter?: string | null;
  honorargruppe?: string | null; stunden?: number | null; zusammenfassung?: string | null; aussteller_ort?: string | null;
  unterschriftPng?: string | null;
}
export interface GutachtenPos { position: number; kategorie: string; titel?: string | null; text?: string | null; betrag?: number | null }

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';
const KAT_TITEL: Record<string, string> = { befund: 'Befund', bewertung: 'Bewertung', mangel: 'Mängel', empfehlung: 'Empfehlung' };
const KAT_ORDER = ['befund', 'bewertung', 'mangel', 'empfehlung'];

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
function eur(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export function gutachtenPdf(g: GutachtenKopf, positionen: GutachtenPos[]): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, L = 20, R = W - 20, BREITE = R - L;
  let y = 22;

  const seiteWenn = (grenze: number) => { if (y > grenze) { doc.addPage(); y = 22; } };

  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Gutachten', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  const tl = doc.splitTextToSize(g.titel, BREITE); doc.text(tl, L, y + 7);
  y += 7 + tl.length * 5;
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y, R, y); y += 8;

  // Info-Block
  const zeile = (label: string, wert: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text(wert || '—', x, yy + 5);
  };
  const midX = L + 90;
  zeile('Auftraggeber', g.auftraggeber || '—', L, y);
  zeile('Datum', deDatum(g.datum), midX, y); y += 13;
  zeile('Objekt', g.objekt || '—', L, y);
  zeile('Art', g.art || '—', midX, y); y += 13;
  zeile('Aktenzeichen', g.aktenzeichen || '—', L, y);
  zeile('Gutachter', g.gutachter || '—', midX, y); y += 16;

  // Positionen gegliedert
  for (const kat of KAT_ORDER) {
    const liste = positionen.filter((p) => p.kategorie === kat);
    if (!liste.length) continue;
    seiteWenn(255);
    doc.setFillColor(NAVY); doc.roundedRect(L, y, BREITE, 8, 1.5, 1.5, 'F');
    doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(KAT_TITEL[kat] || kat, L + 3, y + 5.6); y += 12;
    liste.forEach((p) => {
      seiteWenn(268);
      if (p.titel) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(NAVY);
        const hl = doc.splitTextToSize(p.titel + (p.betrag != null ? `   —   ${eur(p.betrag)}` : ''), BREITE); doc.text(hl, L, y); y += hl.length * 5; }
      if (p.text) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
        const tl2 = doc.splitTextToSize(p.text, BREITE); if (y + tl2.length * 4.8 > 280) { doc.addPage(); y = 22; }
        doc.text(tl2, L, y); y += tl2.length * 4.8; }
      y += 3;
    });
    y += 2;
  }

  // Positions-Summe
  const summe = summePositionen(positionen);
  if (summe > 0) {
    seiteWenn(270);
    doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.3); doc.line(L, y, R, y); y += 6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
    doc.text('Summe der bewerteten Positionen:', L, y);
    doc.setTextColor(GOLD); doc.text(eur(summe), R, y, { align: 'right' }); y += 8;
  }

  // Zusammenfassung
  if (g.zusammenfassung) {
    seiteWenn(255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text('Zusammenfassung / Fazit', L, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const zl = doc.splitTextToSize(g.zusammenfassung, BREITE); doc.text(zl, L, y); y += zl.length * 4.8 + 4;
  }

  // Honorar
  if (g.honorargruppe && g.stunden) {
    seiteWenn(272);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(GREY);
    doc.text(`Honorar nach JVEG: Gruppe ${g.honorargruppe} (${honorarsatz(g.honorargruppe)} €/h) × ${g.stunden} h = ${eur(honorar(g.honorargruppe, g.stunden))} (zzgl. Nebenkosten/USt).`, L, y, { maxWidth: BREITE }); y += 8;
  }

  // Unterschrift
  y = Math.max(y + 8, 258);
  if (y > 275) { doc.addPage(); y = 258; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text(`${g.aussteller_ort || '__________'}, den ${deDatum(g.datum)}`, L, y); y += 16;
  unterschriftUeberLinie(doc, g.unterschriftPng, L, y);
  doc.setDrawColor(GREY); doc.setLineWidth(0.3); doc.line(L, y, L + 80, y);
  doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text(`${g.gutachter || 'Gutachter'} · Unterschrift`, L, y + 5);

  doc.setFontSize(8); doc.setTextColor(GREY);
  doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });

  const safe = (g.titel || 'Gutachten').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
  doc.save(`Gutachten_${safe}.pdf`);
}
