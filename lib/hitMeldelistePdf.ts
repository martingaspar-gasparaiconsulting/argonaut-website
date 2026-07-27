// ============================================================================
// ARGONAUT OS · lib/hitMeldelistePdf.ts — HIT-Meldeliste als PDF (A6/B3)
//
// Clientseitig mit jsPDF. A4 hoch: alle NOCH NICHT gemeldeten Bewegungen als
// Checkliste — überfällige zuerst — zum Abarbeiten an HI-Tier.
// ============================================================================

import { jsPDF } from 'jspdf';

export interface HitMeldeEintrag {
  datum: string;
  gruppe: string;
  tierart: string;
  vvvo?: string | null;
  art: string;
  anzahl: number;
  ohrmarke?: string | null;
  status: string;        // 'überfällig' | 'offen'
  fristRest: number;     // Tage bis Frist (negativ = überfällig)
}

export interface HitMeldelisteDaten {
  stand: string;         // Datum ISO
  aussteller?: string | null;
  eintraege: HitMeldeEintrag[];
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82', RED = '#C0392B', WARN = '#B7791F';

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export function hitMeldelistePdf(dn: HitMeldelisteDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 18; const R = W - 18;
  let y = 22;

  // Kopf
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('HIT-Meldeliste', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  doc.text(`Offene Meldungen · Stand ${deDatum(dn.stand)}`, L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 20;

  if (dn.aussteller) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
    doc.text(dn.aussteller, L, y); y += 8;
  }

  // Spalten
  const cDatum = L, cGruppe = L + 24, cArt = L + 92, cAnz = R - 46, cStatus = R;
  const kopf = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(GREY);
    doc.text('Datum', cDatum, y); doc.text('Gruppe / VVVO', cGruppe, y);
    doc.text('Ereignis', cArt, y); doc.text('Anz.', cAnz, y, { align: 'right' }); doc.text('Frist', cStatus, y, { align: 'right' });
    doc.setDrawColor('#CCCCCC'); doc.setLineWidth(0.2); doc.line(L, y + 2, R, y + 2);
    y += 7;
  };
  kopf();

  if (!dn.eintraege.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(11); doc.setTextColor(GREY);
    doc.text('Keine offenen Meldungen — alle Bewegungen sind an HIT gemeldet.', L, y + 4);
    y += 10;
  } else {
    doc.setFontSize(10);
    dn.eintraege.forEach((e) => {
      if (y > 268) { doc.addPage(); y = 22; kopf(); }
      const ueber = e.fristRest < 0;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(NAVY);
      doc.text(deDatum(e.datum), cDatum, y);
      const gLines = doc.splitTextToSize(`${e.gruppe} (${e.tierart})${e.vvvo ? ` · ${e.vvvo}` : ''}`, cArt - cGruppe - 3);
      doc.text(gLines, cGruppe, y);
      const aLines = doc.splitTextToSize(`${e.art}${e.ohrmarke ? ` · ${e.ohrmarke}` : ''}`, cAnz - cArt - 6);
      doc.text(aLines, cArt, y);
      doc.text(String(e.anzahl), cAnz, y, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(ueber ? RED : WARN);
      doc.text(ueber ? `${Math.abs(e.fristRest)} T über` : `${e.fristRest} T`, cStatus, y, { align: 'right' });
      const rows = Math.max(gLines.length, aLines.length, 1);
      y += 5.5 * rows + 1.5;
      doc.setDrawColor('#EEEEEE'); doc.setLineWidth(0.2); doc.line(L, y - 2.5, R, y - 2.5);
    });
  }

  // Hinweis
  y += 4;
  if (y > 270) { doc.addPage(); y = 22; }
  doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(GREY);
  doc.text('Bewegungen sind binnen 7 Tagen an HI-Tier zu melden. Diese Liste dient der Vorbereitung/Kontrolle, sie ersetzt nicht die Meldung an HIT.', L, y, { maxWidth: R - L });

  // Fußzeile
  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });
    doc.text(`Seite ${i}/${seiten}`, R, 288, { align: 'right' });
  }

  doc.save(`HIT-Meldeliste_${deDatum(dn.stand).replace(/\./g, '-')}.pdf`);
}
