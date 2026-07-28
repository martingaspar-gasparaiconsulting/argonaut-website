// lib/speisekartePdf.ts
// Speise-/Menükarte (A4 hoch) via jsPDF: Gerichte nach Kategorie gruppiert, mit
// Preis, Beschreibung und Klartext-Kenntlichmachung von Allergenen & Zusatzstoffen
// direkt am Gericht (LMIV/ZZulV-konform). Keine Supabase-Aufrufe.
import { jsPDF } from 'jspdf';

export interface SpeisekartePdfGericht { name: string; preis: string; beschreibung: string; allergene: string[]; zusatz: string[]; hervorgehoben: boolean }
export interface SpeisekartePdfKategorie { kategorie: string; gerichte: SpeisekartePdfGericht[] }
export interface SpeisekartePdfDaten { aussteller: string; titel: string; datum: string; kategorien: SpeisekartePdfKategorie[] }

export function speisekartePdf(d: SpeisekartePdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 20, R = 190, PH = 297;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 120;
  let y = 22;
  function seite(h: number) { if (y + h > PH - 18) { doc.addPage(); y = 22; } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(22);
  y += 9; doc.text(d.titel || 'Speisekarte', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
  y += 6; doc.text(`Stand ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 3; doc.line(L, y, R, y); y += 9;

  for (const kat of d.kategorien) {
    if (kat.gerichte.length === 0) continue;
    seite(16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.text(kat.kategorie.toUpperCase(), L, y); y += 7;

    for (const g of kat.gerichte) {
      const beschr = g.beschreibung ? doc.splitTextToSize(g.beschreibung, R - L - 24) : [];
      const kennz = [...g.allergene, ...g.zusatz];
      const kennzZeilen = kennz.length ? doc.splitTextToSize('Kennzeichnung: ' + kennz.join(', '), R - L - 24) : [];
      seite(8 + beschr.length * 4.6 + kennzZeilen.length * 4.2);

      // Name + Preis (mit Führungspunkten)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(navy);
      const name = (g.hervorgehoben ? '★ ' : '') + g.name;
      doc.text(name, L, y);
      const nameW = doc.getTextWidth(name);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(navy);
      const preis = g.preis || '';
      const preisW = doc.getTextWidth(preis);
      doc.text(preis, R, y, { align: 'right' });
      // Führungspunkte
      doc.setTextColor(200); doc.setFont('helvetica', 'normal');
      const punkteStart = L + nameW + 2, punkteEnde = R - preisW - 2;
      if (punkteEnde > punkteStart) {
        const p = '.'.repeat(Math.max(0, Math.floor((punkteEnde - punkteStart) / doc.getTextWidth('.'))));
        doc.text(p, punkteStart, y);
      }
      y += 5;

      if (beschr.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim); doc.text(beschr, L, y); y += beschr.length * 4.6; }
      if (kennzZeilen.length) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(150); doc.text(kennzZeilen, L, y); y += kennzZeilen.length * 4.2; }
      y += 2.5;
    }
    y += 4;
  }

  // Fußzeile
  seite(14);
  y += 4; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('Allergene & Zusatzstoffe je Gericht gekennzeichnet (LMIV / ZZulV). Alle Preise in Euro inkl. MwSt. Erstellt mit ARGONAUT OS.', L, y, { maxWidth: R - L });

  const name = (d.titel || 'Speisekarte').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`Speisekarte_${name}.pdf`);
}
