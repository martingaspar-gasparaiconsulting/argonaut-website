// ============================================================================
// ARGONAUT OS · lib/zertifikat.ts — Teilnahmebescheinigung als PDF (A2/K3)
//
// Clientseitig mit jsPDF. Neutrale Teilnahmebescheinigung (KEINE Behauptung
// einer amtlichen Zertifizierung) mit Unterschrift-/Stempelfeld des
// Veranstalters. Für §20-SGB-V-Präventions-Zertifikate (Krankenkassen-Zuschuss)
// wäre ein eigener, zertifizierter Vordruck nötig — hier NICHT abgebildet.
// ============================================================================

import { jsPDF } from 'jspdf';

export interface ZertifikatDaten {
  teilnehmer: string;
  kurstitel: string;
  start?: string | null;
  ende?: string | null;
  ort?: string | null;
  dozent?: string | null;
  termineGesamt?: number;
  termineAnwesend?: number;
  ausstellungsdatum: string; // ISO
  aussteller?: string | null;
}

const NAVY = '#0A1628';
const GOLD = '#C9A84C';
const GREY = '#5A6B82';

function deDatum(iso?: string | null): string {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

/** Baut die Teilnahmebescheinigung und löst den Download aus. */
export function teilnahmebescheinigungPdf(dn: ZertifikatDaten): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297, H = 210;

  // Rahmen
  doc.setDrawColor(GOLD); doc.setLineWidth(1.2); doc.rect(12, 12, W - 24, H - 24);
  doc.setLineWidth(0.3); doc.rect(15, 15, W - 30, H - 30);

  // Titel
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
  doc.text('Teilnahmebescheinigung', W / 2, 46, { align: 'center' });

  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(W / 2 - 30, 52, W / 2 + 30, 52);

  // Einleitung
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(GREY);
  doc.text('Hiermit wird bestätigt, dass', W / 2, 70, { align: 'center' });

  // Teilnehmer
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(NAVY);
  doc.text(dn.teilnehmer || '—', W / 2, 84, { align: 'center' });

  // Kurszeile
  doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.setTextColor(GREY);
  doc.text('an folgender Veranstaltung teilgenommen hat:', W / 2, 98, { align: 'center' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(NAVY);
  doc.text(dn.kurstitel || '—', W / 2, 110, { align: 'center' });

  // Detailzeilen
  const zeilen: string[] = [];
  const zeitraum = dn.start && dn.ende && dn.ende !== dn.start
    ? `Zeitraum: ${deDatum(dn.start)} – ${deDatum(dn.ende)}`
    : dn.start ? `Datum: ${deDatum(dn.start)}` : '';
  if (zeitraum) zeilen.push(zeitraum);
  if (dn.ort) zeilen.push(`Ort: ${dn.ort}`);
  if (dn.dozent) zeilen.push(`Dozent/in: ${dn.dozent}`);
  if ((dn.termineGesamt || 0) > 0) {
    const anw = dn.termineAnwesend || 0; const ges = dn.termineGesamt || 0;
    const quote = Math.round((anw / ges) * 100);
    zeilen.push(`Anwesenheit: ${anw} von ${ges} Terminen (${quote} %)`);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(GREY);
  let y = 124;
  for (const z of zeilen) { doc.text(z, W / 2, y, { align: 'center' }); y += 7; }

  // Unterschrift/Stempel-Block
  const sigY = 178;
  doc.setDrawColor(GREY); doc.setLineWidth(0.3);
  doc.line(35, sigY, 110, sigY);
  doc.line(W - 110, sigY, W - 35, sigY);
  doc.setFontSize(10); doc.setTextColor(GREY);
  const ausstellOrt = dn.ort ? `${dn.ort}, ${deDatum(dn.ausstellungsdatum)}` : deDatum(dn.ausstellungsdatum);
  doc.text(`Ort, Datum: ${ausstellOrt}`, 35, sigY + 6);
  doc.text('Unterschrift / Stempel des Veranstalters', W - 110, sigY + 6);
  if (dn.aussteller) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(NAVY);
    doc.text(dn.aussteller, W - 110, sigY - 3);
  }

  // Fußnote
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
  doc.text('Erstellt mit ARGONAUT OS', W / 2, H - 18, { align: 'center' });

  const safe = (dn.teilnehmer || 'Teilnehmer').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Teilnahmebescheinigung_${safe || 'Teilnehmer'}.pdf`);
}
