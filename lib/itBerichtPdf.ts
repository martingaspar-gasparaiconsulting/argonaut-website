// lib/itBerichtPdf.ts
// IT-Bestands- & Compliance-Bericht (A4 quer) via jsPDF: Assets, Lizenzen
// (Plätze/Ablauf/Kosten) und SLA in drei Tabellen, mit Ablauf-Ampel. Keine Supabase.
import { jsPDF } from 'jspdf';

export type Ampel = 'ok' | 'bald' | 'abgelaufen' | 'kein' | 'ueberbucht';
export interface ItPdfAsset { bezeichnung: string; kunde: string; typ: string; hersteller: string; seriennr: string; status: string; garantie: string; ampel: Ampel }
export interface ItPdfLizenz { bezeichnung: string; kunde: string; typ: string; plaetze: string; ablauf: string; kostenJahr: string; ampel: Ampel }
export interface ItPdfSla { bezeichnung: string; kunde: string; reaktion: string; wiederherstell: string; verfuegbarkeit: string; gueltigBis: string; ampel: Ampel }
export interface ItBerichtPdfDaten { aussteller: string; titel: string; datum: string; assets: ItPdfAsset[]; lizenzen: ItPdfLizenz[]; sla: ItPdfSla[] }

const FARBE: Record<Ampel, [number, number, number]> = {
  ok: [42, 120, 80], bald: [200, 150, 40], abgelaufen: [190, 60, 60], kein: [120, 120, 120], ueberbucht: [190, 60, 60],
};

export function itBerichtPdf(d: ItBerichtPdfDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const L = 15, R = 282, PW = 297, PH = 210;
  const navy = 10, gold: [number, number, number] = [201, 168, 76], dim = 115;
  let y = 16;
  function seite(h: number) { if (y + h > PH - 12) { doc.addPage(); y = 16; } }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text((d.aussteller || '').toUpperCase(), L, y);
  doc.setTextColor(navy); doc.setFontSize(16);
  y += 7; doc.text(d.titel || 'IT-Bestands- & Compliance-Bericht', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(dim);
  y += 5.5; doc.text(`Stand ${d.datum}`, L, y);
  doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.6);
  y += 2.5; doc.line(L, y, R, y); y += 8;

  function sektion(titel: string) {
    seite(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(navy);
    doc.text(titel, L, y); y += 5.5;
  }
  function kopfzeile(spalten: [string, number, ('l' | 'r')?][]) {
    doc.setFillColor(240, 237, 228); doc.rect(L, y - 4, R - L, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(navy);
    for (const [t, x, al] of spalten) doc.text(t, x, y + 1, al === 'r' ? { align: 'right' } : undefined);
    y += 8;
  }

  // Assets
  sektion(`Assets (${d.assets.length})`);
  if (d.assets.length === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(dim); doc.text('— keine —', L, y); y += 7; }
  else {
    kopfzeile([['Bezeichnung', L + 1], ['Kunde', 80], ['Typ', 135], ['Hersteller', 165], ['Serien-Nr.', 205], ['Status', 240], ['Garantie', R - 1, 'r']]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
    for (const a of d.assets) {
      seite(6.5); doc.setTextColor(navy); doc.text(clip(doc, a.bezeichnung, 62), L + 1, y);
      doc.setTextColor(dim);
      doc.text(clip(doc, a.kunde, 50), 80, y); doc.text(a.typ, 135, y); doc.text(clip(doc, a.hersteller, 36), 165, y);
      doc.text(clip(doc, a.seriennr, 32), 205, y); doc.text(a.status, 240, y);
      const f = FARBE[a.ampel]; doc.setTextColor(f[0], f[1], f[2]); doc.text(a.garantie || '—', R - 1, y, { align: 'right' });
      y += 6; doc.setDrawColor(234); doc.line(L, y - 2, R, y - 2);
    }
  }
  y += 5;

  // Lizenzen
  sektion(`Lizenzen (${d.lizenzen.length})`);
  if (d.lizenzen.length === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(dim); doc.text('— keine —', L, y); y += 7; }
  else {
    kopfzeile([['Lizenz', L + 1], ['Kunde', 90], ['Typ', 150], ['Plätze (belegt)', 200, 'r'], ['Kosten/Jahr', 245, 'r'], ['Ablauf', R - 1, 'r']]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
    for (const l of d.lizenzen) {
      seite(6.5); doc.setTextColor(navy); doc.text(clip(doc, l.bezeichnung, 70), L + 1, y);
      doc.setTextColor(dim); doc.text(clip(doc, l.kunde, 56), 90, y); doc.text(l.typ, 150, y);
      const fp = FARBE[l.ampel === 'ueberbucht' ? 'ueberbucht' : 'ok'];
      doc.setTextColor(l.ampel === 'ueberbucht' ? fp[0] : 115, l.ampel === 'ueberbucht' ? fp[1] : 115, l.ampel === 'ueberbucht' ? fp[2] : 115);
      doc.text(l.plaetze, 200, y, { align: 'right' });
      doc.setTextColor(dim); doc.text(l.kostenJahr, 245, y, { align: 'right' });
      const f = FARBE[l.ampel]; doc.setTextColor(f[0], f[1], f[2]); doc.text(l.ablauf || '—', R - 1, y, { align: 'right' });
      y += 6; doc.setDrawColor(234); doc.line(L, y - 2, R, y - 2);
    }
  }
  y += 5;

  // SLA
  sektion(`Service-Level-Agreements (${d.sla.length})`);
  if (d.sla.length === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(dim); doc.text('— keine —', L, y); y += 7; }
  else {
    kopfzeile([['SLA', L + 1], ['Kunde', 95], ['Reaktion', 165, 'r'], ['Wiederherstellung', 215, 'r'], ['Verfügbark.', 250, 'r'], ['Gültig bis', R - 1, 'r']]);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
    for (const s of d.sla) {
      seite(6.5); doc.setTextColor(navy); doc.text(clip(doc, s.bezeichnung, 62), L + 1, y);
      doc.setTextColor(dim); doc.text(clip(doc, s.kunde, 62), 95, y);
      doc.text(s.reaktion, 165, y, { align: 'right' }); doc.text(s.wiederherstell, 215, y, { align: 'right' });
      doc.text(s.verfuegbarkeit, 250, y, { align: 'right' });
      const f = FARBE[s.ampel]; doc.setTextColor(f[0], f[1], f[2]); doc.text(s.gueltigBis || '—', R - 1, y, { align: 'right' });
      y += 6; doc.setDrawColor(234); doc.line(L, y - 2, R, y - 2);
    }
  }

  // Fußzeile
  seite(12);
  y += 5; doc.setDrawColor(220); doc.line(L, y, R, y); y += 5;
  doc.setFontSize(7.5); doc.setTextColor(dim);
  doc.text('IT-Bestands- & Compliance-Übersicht. Rot = abgelaufen/überbucht, Gelb = läuft bald aus. Erstellt mit ARGONAUT OS.', L, y);

  const name = (d.titel || 'IT-Bericht').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30);
  doc.save(`IT-Bericht_${name}.pdf`);
}

function clip(doc: jsPDF, s: string, maxW: number): string {
  let t = String(s || '');
  if (doc.getTextWidth(t) <= maxW) return t;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
}
