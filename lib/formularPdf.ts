// ============================================================================
// ARGONAUT OS · lib/formularPdf.ts — ausgefülltes Formular als PDF (Paket PL)
//
// Clientseitig mit jsPDF (wie lib/pruefPdf.ts). A4 hoch: Kopf, Bezug, Ergebnis
// der Prüfpunkte, alle Felder in Reihenfolge, Fotos als kleine Bilder,
// Unterschriften als Bild über einer Linie. Fotos kommen als DataURL herein
// (die Seite lädt sie vorher über kurzlebige Links) — hier wird nichts geladen.
// ============================================================================

import { jsPDF } from 'jspdf';
import { ergebnis, feldTyp, wertText, pdfDateiname, type Feld, type Werte } from '@/lib/formularBaukasten';

const NAVY = '#0A1628', GOLD = '#C9A84C', GREEN = '#3B8C63', RED = '#C0392B', GREY = '#5A6B82';

export type FormularPdfDaten = {
  titel: string;
  bezug?: string | null;
  firma?: string | null;
  erstellt_von?: string | null;
  datum: string; // ISO
  status: string;
  felder: Feld[];
  werte: Werte;
  /** Foto-Pfad -> DataURL (JPEG/PNG/WebP) */
  fotos: Record<string, string>;
};

function deDatum(iso: string): string {
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
function bildFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

export function formularPdf(d: FormularPdfDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 18; const R = W - 18;
  let y = 22;
  const platz = (h: number) => { if (y + h > 280) { doc.addPage(); y = 20; } };

  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(doc.splitTextToSize(d.titel, R - L), L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(GREY);
  const kopf = [d.bezug, deDatum(d.datum), d.erstellt_von ? `erstellt von ${d.erstellt_von}` : null, d.status === 'abgeschlossen' ? 'abgeschlossen' : 'ENTWURF'].filter(Boolean).join('  ·  ');
  doc.text(kopf, L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 19;

  const e = ergebnis(d.felder, d.werte);
  if (e.gesamt) {
    const farbe = e.gesamt === 'io' ? GREEN : e.gesamt === 'nio' ? RED : GOLD;
    doc.setFillColor(farbe); doc.roundedRect(L, y, R - L, 10, 2, 2, 'F');
    doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    const txt = e.gesamt === 'io' ? 'Alle Prüfpunkte in Ordnung' : e.gesamt === 'nio' ? `${e.nio} Prüfpunkt(e) NICHT in Ordnung` : `${e.offen} Prüfpunkt(e) offen`;
    doc.text(`${txt}  (${e.io} i. O., ${e.nio} n. i. O., ${e.entfaellt} entfällt)`, L + 4, y + 6.8);
    y += 16;
  }

  for (const f of d.felder) {
    const v = d.werte[f.id];
    if (f.typ === 'ueberschrift') {
      platz(12); y += 3;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(NAVY); doc.text(f.label, L, y);
      doc.setDrawColor('#DDDDDD'); doc.setLineWidth(0.2); doc.line(L, y + 1.8, R, y + 1.8);
      y += 8; continue;
    }
    if (f.typ === 'hinweis') {
      const z = doc.splitTextToSize(f.label, R - L);
      platz(z.length * 4.5 + 3);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(z, L, y);
      y += z.length * 4.5 + 3; continue;
    }
    if (!feldTyp(f.typ)?.eingabe) continue;

    if (f.typ === 'unterschrift') {
      platz(30);
      if (typeof v === 'string' && v.startsWith('data:image/png')) {
        try { doc.addImage(v, 'PNG', L, y, 60, 20); } catch { /* Bild kaputt -> nur Linie */ }
      }
      doc.setDrawColor(GREY); doc.setLineWidth(0.3); doc.line(L, y + 21, L + 70, y + 21);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(f.label, L, y + 25);
      y += 30; continue;
    }

    if (f.typ === 'foto') {
      const pfade = Array.isArray(v) ? (v as string[]) : [];
      platz(8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(f.label, L, y);
      y += 3;
      let x = L;
      for (const p of pfade) {
        const bild = d.fotos[p];
        if (!bild) continue;
        if (x + 40 > R) { x = L; y += 32; }
        platz(32);
        try { doc.addImage(bild, bildFormat(bild), x, y, 40, 30); } catch { /* ueberspringen */ }
        x += 43;
      }
      y += pfade.length ? 34 : 4;
      continue;
    }

    const wert = wertText(f, v);
    const labelZ = doc.splitTextToSize(f.label, 70);
    const wertZ = doc.splitTextToSize(wert, R - L - 75);
    const h = Math.max(labelZ.length, wertZ.length) * 5 + 2;
    platz(h);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(GREY); doc.text(labelZ, L, y);
    const farbe = f.typ === 'pruefpunkt' ? (v === 'io' ? GREEN : v === 'nio' ? RED : GREY) : NAVY;
    doc.setFont('helvetica', f.typ === 'pruefpunkt' ? 'bold' : 'normal'); doc.setFontSize(10.5); doc.setTextColor(farbe);
    doc.text(wertZ, L + 75, y);
    y += h;
    doc.setDrawColor('#F0F0F0'); doc.setLineWidth(0.2); doc.line(L, y - 2, R, y - 2);
  }

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    doc.text(`${d.firma ? d.firma + ' · ' : ''}Seite ${i} von ${seiten} · erstellt mit ARGONAUT OS`, W / 2, 290, { align: 'center' });
  }
  doc.save(pdfDateiname(d.titel, d.datum));
}
