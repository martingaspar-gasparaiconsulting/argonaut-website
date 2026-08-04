// ============================================================================
// ARGONAUT OS · lib/zuwendungPdf.ts — Zuwendungsbestätigung als PDF (A9/B3)
//
// Clientseitig mit jsPDF. Zuwendungsbestätigung nach amtlichem Muster
// (§10b EStG / §50 EStDV) für nach §5 Abs.1 Nr.9 KStG befreite Körperschaften.
// Betrag in Ziffern UND in Buchstaben (euroInWorten aus lib/spenden).
// Hinweis: Angaben des Vereins müssen mit dem Freistellungsbescheid übereinstimmen.
// ============================================================================

import { jsPDF } from 'jspdf';
import { euroInWorten } from '@/lib/spenden';
import { unterschriftUeberLinie } from '@/lib/unterschriftPdf';

export interface ZuwendungAussteller {
  org_name?: string | null; org_anschrift?: string | null; finanzamt?: string | null;
  steuernummer?: string | null; freistellung_datum?: string | null; freistellung_zeitraum?: string | null;
  koerperschaft_art?: string | null; zweck?: string | null; aussteller_ort?: string | null;
  unterschriftPng?: string | null;
}
export interface ZuwendungSpende {
  datum: string; spender_name: string; spender_anschrift?: string | null; betrag: number;
  art: string; sachwert_text?: string | null; verzicht_aufwand?: boolean; zweck?: string | null; bestaetigung_nr?: string | null;
}

const NAVY = '#0A1628', GOLD = '#C9A84C', GREY = '#5A6B82';

function deDatum(iso?: string | null): string {
  if (!iso) return '__________';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(iso);
}
function eur(n: number): string { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }

export function zuwendungPdf(aussteller: ZuwendungAussteller, s: ZuwendungSpende): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, L = 20, R = W - 20, BREITE = R - L;
  let y = 20;
  const sach = s.art === 'sachzuwendung';
  const zweck = aussteller.zweck || s.zweck || '__________';

  const absatz = (txt: string, size = 10, bold = false, gap = 2) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(NAVY);
    const lines = doc.splitTextToSize(txt, BREITE);
    if (y + lines.length * (size * 0.42) > 280) { doc.addPage(); y = 20; }
    doc.text(lines, L, y);
    y += lines.length * (size * 0.42) + gap;
  };

  // Aussteller-Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(NAVY);
  doc.text(aussteller.org_name || '__________', L, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(GREY);
  if (aussteller.org_anschrift) { doc.text(aussteller.org_anschrift, L, y); y += 5; }
  doc.setDrawColor(GOLD); doc.setLineWidth(0.5); doc.line(L, y + 1, R, y + 1); y += 9;

  // Titel
  absatz(
    `Bestätigung über ${sach ? 'Sachzuwendungen' : 'Geldzuwendungen'} im Sinne des § 10b des Einkommensteuergesetzes an eine der in § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes bezeichneten Körperschaften, Personenvereinigungen oder Vermögensmassen`,
    11, true, 5,
  );

  // Zuwendender
  absatz(`Name und Anschrift des Zuwendenden:`, 9, false, 1);
  absatz(`${s.spender_name}${s.spender_anschrift ? ', ' + s.spender_anschrift : ''}`, 11, true, 5);

  // Betrag / Art
  if (sach) {
    absatz(`Wert der Zuwendung – in Ziffern: ${eur(s.betrag)} – in Buchstaben: ${euroInWorten(s.betrag)}`, 10, false, 1);
    absatz(`Genaue Bezeichnung der Sachzuwendung: ${s.sachwert_text || '__________'}`, 10, false, 1);
  } else {
    absatz(`Betrag der Zuwendung – in Ziffern: ${eur(s.betrag)} – in Buchstaben: ${euroInWorten(s.betrag)}`, 10, false, 1);
  }
  absatz(`Tag der Zuwendung: ${deDatum(s.datum)}`, 10, false, 4);

  // Verzicht auf Aufwendungsersatz
  absatz(`Es handelt sich um den Verzicht auf Erstattung von Aufwendungen: ${s.verzicht_aufwand || s.art === 'aufwandsverzicht' ? 'Ja' : 'Nein'}`, 10, false, 4);

  // Freistellung
  absatz(
    `Wir sind wegen Förderung ${zweck} nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamts ${aussteller.finanzamt || '__________'}, Steuernummer ${aussteller.steuernummer || '__________'}, vom ${deDatum(aussteller.freistellung_datum)}${aussteller.freistellung_zeitraum ? ` für den letzten Veranlagungszeitraum ${aussteller.freistellung_zeitraum}` : ''} nach ${aussteller.koerperschaft_art || '§ 5 Abs. 1 Nr. 9 KStG'} von der Körperschaftsteuer befreit.`,
    10, false, 4,
  );

  absatz(`Es wird bestätigt, dass die Zuwendung nur zur Förderung ${zweck} verwendet wird.`, 10, false, 6);

  // Haftungshinweis
  absatz(
    `Hinweis: Wer vorsätzlich oder grob fahrlässig eine unrichtige Zuwendungsbestätigung erstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestätigung angegebenen steuerbegünstigten Zwecken verwendet werden, haftet für die entgangene Steuer (§ 10b Abs. 4 EStG).`,
    8.5, false, 8,
  );

  // Ort/Datum + Unterschrift
  if (y > 250) { doc.addPage(); y = 20; }
  y = Math.max(y, 250);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(NAVY);
  doc.text(`${aussteller.aussteller_ort || '__________'}, den ${deDatum(new Date().toISOString())}`, L, y);
  y += 16;
  unterschriftUeberLinie(doc, aussteller.unterschriftPng, L, y);
  doc.setDrawColor(GREY); doc.setLineWidth(0.3); doc.line(L, y, L + 80, y);
  doc.setFontSize(9); doc.setTextColor(GREY);
  doc.text('Unterschrift des Zuwendungsempfängers', L, y + 5);
  if (s.bestaetigung_nr) doc.text(`Beleg-Nr.: ${s.bestaetigung_nr}`, R, y + 5, { align: 'right' });

  doc.setFontSize(8); doc.setTextColor(GREY);
  doc.text('Erstellt mit ARGONAUT OS · Angaben nach amtlichem Muster', W / 2, 288, { align: 'center' });

  const safe = (s.spender_name || 'Zuwendung').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_');
  doc.save(`Zuwendungsbestaetigung_${safe}_${deDatum(s.datum).replace(/\./g, '-')}.pdf`);
}
