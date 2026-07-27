// ============================================================================
// ARGONAUT OS · lib/schlagNachweisPdf.ts — Schlag-Nachweis als PDF (A5/B3)
//
// Clientseitig mit jsPDF. A4 hoch: Kopf (Schlag), Info-Block, dann drei
// Abschnitte — Düngebedarfsermittlung, Düngung (DüV §10) und Pflanzenschutz
// (Pflichtfelder ab 2026) — lückenlos für Kontrolle/Behörde.
// Hinweis: Standard-Font (WinAnsi) → "P2O5" statt "P₂O₅" (Subscript nicht kodierbar).
// ============================================================================

import { jsPDF } from 'jspdf';

export interface SchlagNachweisDaten {
  schlag: { bezeichnung: string; flurstueck?: string | null; flaeche_ha: number; kultur?: string | null; standort?: string | null };
  jahr?: number | null;
  bedarfe: { jahr: number; kultur?: string | null; ertragserwartung?: number | null; n_bedarf: number; p_bedarf: number }[];
  duengungen: { datum: string; duengemittel?: string | null; art: string; menge: number; einheit: string; n_gesamt: number; n_verfuegbar?: number | null; p2o5: number; anwender?: string | null }[];
  psm: { datum: string; startzeit?: string | null; mittel_name?: string | null; zulassungsnr?: string | null; verwendungsart: string; aufwandmenge: number; aufwand_einheit: string; kultur?: string | null; flaeche_ha: number; eppo_code?: string | null; bbch_stadium?: string | null; anwendungsgebiet?: string | null; wartezeit_tage?: number | null; anwender?: string | null }[];
  aussteller?: string | null;
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

function deDatum(iso?: string | null): string {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}

export function schlagNachweisPdf(dn: SchlagNachweisDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const L = 18; const R = W - 18;
  let y = 22;

  const seiteWenn = (grenze: number) => { if (y > grenze) { doc.addPage(); y = 22; } };

  // Kopf
  doc.setTextColor(NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Schlag-Nachweis', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(GREY);
  doc.text(dn.schlag.bezeichnung + (dn.jahr ? `  ·  ${dn.jahr}` : ''), L, y + 7);
  doc.setDrawColor(GOLD); doc.setLineWidth(0.6); doc.line(L, y + 11, R, y + 11);
  y += 20;

  // Info-Block (zwei Spalten)
  const zeile = (label: string, wert: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(GREY); doc.text(label, x, yy);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY); doc.text(wert || '—', x, yy + 5);
  };
  const midX = L + 90;
  zeile('Flurstück / FID', dn.schlag.flurstueck || '—', L, y);
  zeile('Fläche', `${(Number(dn.schlag.flaeche_ha) || 0).toLocaleString('de-DE', { maximumFractionDigits: 4 })} ha`, midX, y);
  y += 13;
  zeile('Kultur', dn.schlag.kultur || '—', L, y);
  zeile('Standort / GPS', dn.schlag.standort || '—', midX, y);
  y += 16;

  // Abschnitts-Überschrift
  const abschnitt = (titel: string) => {
    seiteWenn(255);
    doc.setFillColor(NAVY); doc.roundedRect(L, y, R - L, 8, 1.5, 1.5, 'F');
    doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(titel, L + 3, y + 5.6);
    y += 12;
  };
  // Eine gewrappte Textzeile ausgeben
  const textZeile = (txt: string, bold = false) => {
    seiteWenn(272);
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9.5); doc.setTextColor(NAVY);
    const lines = doc.splitTextToSize(txt, R - L);
    doc.text(lines, L, y);
    y += lines.length * 4.8 + 1.2;
    doc.setDrawColor('#EEEEEE'); doc.setLineWidth(0.2); doc.line(L, y - 1.5, R, y - 1.5);
  };
  const leer = () => { doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(GREY); doc.text('— keine Einträge —', L, y); y += 7; };

  // 1) Düngebedarf
  abschnitt('Düngebedarfsermittlung');
  if (!dn.bedarfe.length) leer();
  else dn.bedarfe.forEach((b) => textZeile(
    `${b.jahr}  ·  ${b.kultur || '—'}  ·  N-Bedarf ${b.n_bedarf} kg/ha  ·  P2O5-Bedarf ${b.p_bedarf} kg/ha${b.ertragserwartung != null ? `  ·  Ertragserw. ${b.ertragserwartung} dt/ha` : ''}`
  ));
  y += 4;

  // 2) Düngung
  abschnitt('Düngung (DüV §10)');
  if (!dn.duengungen.length) leer();
  else dn.duengungen.forEach((d) => textZeile(
    `${deDatum(d.datum)}  ·  ${d.duengemittel || '—'} (${d.art})  ·  ${d.menge} ${d.einheit}  ·  N ges. ${d.n_gesamt}${d.n_verfuegbar != null ? ` / verf. ${d.n_verfuegbar}` : ''} kg/ha  ·  P2O5 ${d.p2o5} kg/ha${d.anwender ? `  ·  ${d.anwender}` : ''}`
  ));
  y += 4;

  // 3) Pflanzenschutz
  abschnitt('Pflanzenschutz (Anwendungen)');
  if (!dn.psm.length) leer();
  else dn.psm.forEach((p) => textZeile(
    `${deDatum(p.datum)}${p.startzeit ? ` ${p.startzeit}` : ''}  ·  ${p.mittel_name || '—'} (Zul. ${p.zulassungsnr || '—'})  ·  ${p.verwendungsart}  ·  ${p.aufwandmenge} ${p.aufwand_einheit} auf ${(Number(p.flaeche_ha) || 0).toLocaleString('de-DE', { maximumFractionDigits: 4 })} ha` +
    `\n     Kultur ${p.kultur || '—'}${p.eppo_code ? `  ·  EPPO ${p.eppo_code}` : ''}${p.bbch_stadium ? `  ·  BBCH ${p.bbch_stadium}` : ''}${p.wartezeit_tage != null ? `  ·  Wartezeit ${p.wartezeit_tage} T` : ''}${p.anwendungsgebiet ? `  ·  ${p.anwendungsgebiet}` : ''}${p.anwender ? `  ·  ${p.anwender}` : ''}`
  ));

  // Fußzeile mit Aussteller + Erstellungshinweis auf jeder Seite
  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(GREY);
    if (dn.aussteller) doc.text(dn.aussteller, L, 288);
    doc.text('Erstellt mit ARGONAUT OS', W / 2, 288, { align: 'center' });
    doc.text(`Seite ${i}/${seiten}`, R, 288, { align: 'right' });
  }

  const safe = (dn.schlag.bezeichnung || 'Schlag').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Schlagnachweis_${safe}${dn.jahr ? `_${dn.jahr}` : ''}.pdf`);
}
