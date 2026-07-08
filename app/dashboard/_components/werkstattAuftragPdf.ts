// ============================================================
// ARGONAUT OS · Modul D+ · Block D+.7 · Werkstattauftrag-PDF (jsPDF, client)
// Erzeugt einen Werkstattauftrag/Arbeitsnachweis als PDF und lädt ihn herunter.
// Kein API-Call, kein Gotenberg, KEINE jspdf-autotable-Abhängigkeit — nur jsPDF
// (bereits im Projekt). Tabelle wird manuell gezeichnet -> läuft garantiert.
// Branding: Navy #0A1628, Gold #C9A84C.
// Pfad: app/dashboard/_components/werkstattAuftragPdf.ts
// ============================================================

import { jsPDF } from 'jspdf';
import {
  positionsMinuten, positionsBetrag, auftragsSumme, zeitText, eur,
  type PositionBasis,
} from './leistungLogik';

export interface PdfAuftrag {
  nummer?: string | null; titel: string; status?: string | null;
  kunde_name?: string | null; kennzeichen?: string | null;
  angenommen_am?: string | null; fertig_am?: string | null;
  zugesagt_am?: string | null; beschreibung?: string | null;
}
export interface PdfFahrzeug {
  fin?: string | null; kennzeichen?: string | null;
  hersteller?: string | null; modell?: string | null; halter_name?: string | null;
}
export interface PdfPosition extends PositionBasis { extern_firma?: string | null }
export interface PdfFirma { name?: string; strasse?: string; plz_ort?: string; telefon?: string; email?: string }

const NAVY: [number, number, number] = [10, 22, 40];
const GOLD: [number, number, number] = [201, 168, 76];
const GRAU: [number, number, number] = [143, 163, 190];
const HELL: [number, number, number] = [243, 245, 248];
const LINIE: [number, number, number] = [225, 225, 225];

function datum(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}
function statusText(s: string | null | undefined): string {
  const m: Record<string, string> = { angenommen: 'Angenommen', in_arbeit: 'In Arbeit', wartet: 'Wartet', fertig: 'Fertig', abgeholt: 'Abgeholt' };
  return (s && m[s]) || s || '—';
}
function einheitText(art: string | null | undefined): string {
  const m: Record<string, string> = { minuten: 'Min', stunden: 'Std', aw: 'AW', stueck: 'Stk' };
  return (art && m[art]) || '';
}

export function werkstattAuftragPdf(
  auftrag: PdfAuftrag,
  fahrzeug: PdfFahrzeug | null,
  positionen: PdfPosition[],
  firma?: PdfFirma,
) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const seiteB = doc.internal.pageSize.getWidth();
  const seiteH = doc.internal.pageSize.getHeight();
  const rand = 15;
  let y = 0;

  // ---- Kopfbalken (Navy) ----
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, seiteB, 34, 'F');
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('ARGONAUT', rand, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Werkstattauftrag', rand, 25);
  doc.setFontSize(9);
  doc.setTextColor(...GRAU);
  const rechts = seiteB - rand;
  doc.text(`Auftrag: ${auftrag.nummer || '—'}`, rechts, 13, { align: 'right' });
  doc.text(`Datum: ${datum(auftrag.angenommen_am)}`, rechts, 19, { align: 'right' });
  doc.text(`Status: ${statusText(auftrag.status)}`, rechts, 25, { align: 'right' });

  y = 44;

  // ---- Firma ----
  if (firma?.name) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(firma.name, rand, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    const zeile = [firma.strasse, firma.plz_ort, firma.telefon, firma.email].filter(Boolean).join(' · ');
    if (zeile) doc.text(zeile, rand, y + 4.5);
    y += 12;
  }

  // ---- Titel ----
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(auftrag.titel || 'Werkstattauftrag', rand, y);
  y += 8;

  // ---- Info-Kästen: Kunde + Fahrzeug ----
  const boxB = (seiteB - rand * 2 - 6) / 2;
  const boxY = y; const boxH = 30;

  doc.setDrawColor(...LINIE); doc.setFillColor(...HELL);
  doc.roundedRect(rand, boxY, boxB, boxH, 2, 2, 'FD');
  doc.setFontSize(8); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'bold');
  doc.text('KUNDE', rand + 4, boxY + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text(auftrag.kunde_name || '—', rand + 4, boxY + 13);
  doc.setFontSize(8); doc.setTextColor(...GRAU);
  if (auftrag.zugesagt_am) doc.text(`Zugesagt bis: ${datum(auftrag.zugesagt_am)}`, rand + 4, boxY + 20);

  const fzX = rand + boxB + 6;
  doc.setDrawColor(...LINIE); doc.setFillColor(...HELL);
  doc.roundedRect(fzX, boxY, boxB, boxH, 2, 2, 'FD');
  doc.setFontSize(8); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'bold');
  doc.text('FAHRZEUG', fzX + 4, boxY + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY);
  if (fahrzeug) {
    doc.text([fahrzeug.hersteller, fahrzeug.modell].filter(Boolean).join(' ') || '—', fzX + 4, boxY + 13);
    doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text(`FIN: ${fahrzeug.fin || '—'}`, fzX + 4, boxY + 19);
    doc.text(`Kennz.: ${fahrzeug.kennzeichen || auftrag.kennzeichen || '—'}`, fzX + 4, boxY + 24);
  } else {
    doc.setFontSize(9); doc.setTextColor(...GRAU);
    doc.text(auftrag.kennzeichen || 'Kein Fahrzeug gekoppelt', fzX + 4, boxY + 13);
  }

  y = boxY + boxH + 10;

  // ---- Positionstabelle (manuell gezeichnet) ----
  // Spalten: Position(auto) | Menge | Zeit | Einzel | Betrag
  const colBetrag = seiteB - rand;
  const colEinzel = colBetrag - 28;
  const colZeit = colEinzel - 26;
  const colMenge = colZeit - 24;
  const colPos = rand;
  const posBreite = colMenge - colPos - 3;

  // Kopfzeile
  const kopfH = 8;
  doc.setFillColor(...NAVY);
  doc.rect(rand, y, seiteB - rand * 2, kopfH, 'F');
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Position', colPos + 2, y + 5.5);
  doc.text('Menge', colMenge + 20, y + 5.5, { align: 'right' });
  doc.text('Zeit', colZeit + 22, y + 5.5, { align: 'right' });
  doc.text('Einzel', colEinzel + 24, y + 5.5, { align: 'right' });
  doc.text('Betrag', colBetrag, y + 5.5, { align: 'right' });
  y += kopfH;

  const summe = auftragsSumme(positionen);
  const zeilen = positionen.length > 0 ? positionen : null;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let wechsel = false;
  const zeilenAbstand = 7;

  const neueSeiteWennNoetig = () => {
    if (y > seiteH - 40) { doc.addPage(); y = 20; }
  };

  if (zeilen) {
    for (const p of zeilen) {
      neueSeiteWennNoetig();
      const min = positionsMinuten(p);
      const betrag = positionsBetrag(p);
      const bez = (p.bezeichnung || '(ohne Bezeichnung)') + (p.extern ? `  (extern${p.extern_firma ? ' · ' + p.extern_firma : ''})` : '');
      const bezZeilen = doc.splitTextToSize(bez, posBreite) as string[];
      const zeilenHoehe = Math.max(zeilenAbstand, bezZeilen.length * 4.5 + 2.5);

      if (wechsel) { doc.setFillColor(...HELL); doc.rect(rand, y, seiteB - rand * 2, zeilenHoehe, 'F'); }
      wechsel = !wechsel;

      doc.setTextColor(...NAVY);
      doc.text(bezZeilen, colPos + 2, y + 5);
      const mitte = y + 5;
      doc.text(`${p.menge ?? ''} ${einheitText(p.erfassungsart)}`.trim(), colMenge + 20, mitte, { align: 'right' });
      doc.setTextColor(...GRAU);
      doc.text(min > 0 ? zeitText(min) : '—', colZeit + 22, mitte, { align: 'right' });
      doc.text(p.einzelpreis_netto != null ? eur(p.einzelpreis_netto) : '—', colEinzel + 24, mitte, { align: 'right' });
      doc.setTextColor(...NAVY);
      doc.text(betrag != null ? eur(betrag) : '—', colBetrag, mitte, { align: 'right' });

      y += zeilenHoehe;
      doc.setDrawColor(...LINIE); doc.line(rand, y, seiteB - rand, y);
    }
  } else {
    doc.setTextColor(...GRAU);
    doc.text('Keine Positionen erfasst.', colPos + 2, y + 5);
    y += zeilenAbstand;
  }

  y += 8;
  neueSeiteWennNoetig();

  // ---- Summen (rechts) ----
  const netto = summe.gesamtBetrag;
  const mwst = netto != null ? Math.round(netto * 0.19 * 100) / 100 : null;
  const brutto = netto != null && mwst != null ? Math.round((netto + mwst) * 100) / 100 : null;
  const sumX = seiteB - rand - 70;

  doc.setFontSize(9);
  const sumZeile = (label: string, wert: string, fett = false) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal');
    doc.setTextColor(...(fett ? NAVY : GRAU));
    doc.text(label, sumX, y);
    doc.setTextColor(...NAVY);
    doc.text(wert, seiteB - rand, y, { align: 'right' });
    y += 6;
  };
  sumZeile('Gesamtzeit', zeitText(summe.gesamtMinuten));
  if (netto != null) {
    sumZeile('Netto', eur(netto));
    sumZeile('zzgl. 19% MwSt', eur(mwst!));
    doc.setDrawColor(...GOLD); doc.line(sumX, y - 2, seiteB - rand, y - 2); y += 2;
    sumZeile('Gesamt (brutto)', eur(brutto!), true);
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('Betrag unvollständig — bei einzelnen Positionen fehlt der Preis.', sumX, y);
    y += 6;
  }

  // ---- Beschreibung ----
  if (auftrag.beschreibung) {
    y += 4; neueSeiteWennNoetig();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('ANMERKUNGEN', rand, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    const t = doc.splitTextToSize(auftrag.beschreibung, seiteB - rand * 2) as string[];
    doc.text(t, rand, y);
  }

  // ---- Fußzeile ----
  const fussY = seiteH - 12;
  doc.setDrawColor(230); doc.line(rand, fussY - 4, seiteB - rand, fussY - 4);
  doc.setFontSize(7.5); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'normal');
  doc.text('Erstellt mit ARGONAUT OS', rand, fussY);
  doc.text(`Ausgedruckt am ${datum(new Date().toISOString())}`, seiteB - rand, fussY, { align: 'right' });

  const name = `Werkstattauftrag_${(auftrag.nummer || auftrag.titel || 'Auftrag').replace(/[^\w.\-]+/g, '_')}.pdf`;
  doc.save(name);
}
