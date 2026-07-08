// ============================================================
// ARGONAUT OS · Phase 2 · Modul E · Block E.4 · Aufmaßblatt-PDF (jsPDF, client)
// Erzeugt ein Aufmaßblatt als PDF und lädt es herunter.
// Kein API-Call, KEINE jspdf-autotable-Abhängigkeit — Tabelle manuell gezeichnet.
// Branding: Navy #0A1628, Gold #C9A84C.
// Pfad: app/dashboard/_components/aufmassPdf.ts
// ============================================================

import { jsPDF } from 'jspdf';
import {
  aufmassSumme, positionsBetrag, mengeText, eur, mitMwSt,
  type PositionBasis,
} from './aufmassLogik';

export interface PdfAufmass {
  nummer?: string | null; titel: string; status?: string | null;
  kunde_name?: string | null; projekt?: string | null; ort?: string | null;
  aufmass_datum?: string | null; bearbeiter?: string | null; notiz?: string | null;
}
export interface PdfPosition extends PositionBasis { position_nr?: number | null }
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
  const m: Record<string, string> = { entwurf: 'Entwurf', fertig: 'Fertig', abgerechnet: 'Abgerechnet' };
  return (s && m[s]) || s || '—';
}

export function aufmassPdf(aufmass: PdfAufmass, positionen: PdfPosition[], firma?: PdfFirma) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const seiteB = doc.internal.pageSize.getWidth();
  const seiteH = doc.internal.pageSize.getHeight();
  const rand = 15;
  let y = 0;

  // ---- Kopfbalken ----
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, seiteB, 34, 'F');
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('ARGONAUT', rand, 15);
  doc.setTextColor(255, 255, 255); doc.setFontSize(14);
  doc.text('Aufmaßblatt', rand, 25);
  doc.setFontSize(9); doc.setTextColor(...GRAU);
  const rechts = seiteB - rand;
  doc.text(`Aufmaß: ${aufmass.nummer || '—'}`, rechts, 13, { align: 'right' });
  doc.text(`Datum: ${datum(aufmass.aufmass_datum)}`, rechts, 19, { align: 'right' });
  doc.text(`Status: ${statusText(aufmass.status)}`, rechts, 25, { align: 'right' });

  y = 44;

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
  doc.text(aufmass.titel || 'Aufmaß', rand, y);
  y += 8;

  // ---- Info-Kasten: Kunde/Projekt/Ort ----
  const boxY = y; const boxH = 24;
  doc.setDrawColor(...LINIE); doc.setFillColor(...HELL);
  doc.roundedRect(rand, boxY, seiteB - rand * 2, boxH, 2, 2, 'FD');
  doc.setFontSize(8); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'bold');
  const sp = (seiteB - rand * 2) / 3;
  doc.text('KUNDE', rand + 4, boxY + 6);
  doc.text('PROJEKT / OBJEKT', rand + 4 + sp, boxY + 6);
  doc.text('ORT', rand + 4 + sp * 2, boxY + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text(aufmass.kunde_name || '—', rand + 4, boxY + 13, { maxWidth: sp - 6 });
  doc.text(aufmass.projekt || '—', rand + 4 + sp, boxY + 13, { maxWidth: sp - 6 });
  doc.text(aufmass.ort || '—', rand + 4 + sp * 2, boxY + 13, { maxWidth: sp - 6 });
  if (aufmass.bearbeiter) {
    doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text(`Aufgemessen von: ${aufmass.bearbeiter}`, rand + 4, boxY + 20);
  }
  y = boxY + boxH + 10;

  // ---- Positionstabelle (manuell) ----
  const colBetrag = seiteB - rand;
  const colEinzel = colBetrag - 28;
  const colEinheit = colEinzel - 22;
  const colMenge = colEinheit - 24;
  const colNr = rand;
  const colBez = rand + 10;
  const bezBreite = colMenge - colBez - 3;

  const kopfH = 8;
  doc.setFillColor(...NAVY);
  doc.rect(rand, y, seiteB - rand * 2, kopfH, 'F');
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('#', colNr + 1, y + 5.5);
  doc.text('Bezeichnung', colBez, y + 5.5);
  doc.text('Menge', colMenge + 20, y + 5.5, { align: 'right' });
  doc.text('Einh.', colEinheit + 18, y + 5.5, { align: 'right' });
  doc.text('Einzel', colEinzel + 24, y + 5.5, { align: 'right' });
  doc.text('Betrag', colBetrag, y + 5.5, { align: 'right' });
  y += kopfH;

  const summe = aufmassSumme(positionen);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let wechsel = false;

  const neueSeiteWennNoetig = () => { if (y > seiteH - 45) { doc.addPage(); y = 20; } };

  if (positionen.length > 0) {
    positionen.forEach((p, i) => {
      neueSeiteWennNoetig();
      const betrag = positionsBetrag(p);
      const bezZeilen = doc.splitTextToSize(p.bezeichnung || '(ohne Bezeichnung)', bezBreite) as string[];
      const zeilenHoehe = Math.max(7, bezZeilen.length * 4.5 + 2.5);

      if (wechsel) { doc.setFillColor(...HELL); doc.rect(rand, y, seiteB - rand * 2, zeilenHoehe, 'F'); }
      wechsel = !wechsel;

      const mitte = y + 5;
      doc.setTextColor(...GRAU); doc.text(String(p.position_nr ?? i + 1), colNr + 1, mitte);
      doc.setTextColor(...NAVY); doc.text(bezZeilen, colBez, mitte);
      doc.text(mengeText(p.menge), colMenge + 20, mitte, { align: 'right' });
      doc.setTextColor(...GRAU); doc.text(p.einheit || '—', colEinheit + 18, mitte, { align: 'right' });
      doc.text(p.einzelpreis_netto != null ? eur(p.einzelpreis_netto) : '—', colEinzel + 24, mitte, { align: 'right' });
      doc.setTextColor(...NAVY); doc.text(betrag != null ? eur(betrag) : '—', colBetrag, mitte, { align: 'right' });

      y += zeilenHoehe;
      doc.setDrawColor(...LINIE); doc.line(rand, y, seiteB - rand, y);
    });
  } else {
    doc.setTextColor(...GRAU); doc.text('Keine Positionen erfasst.', colBez, y + 5); y += 7;
  }

  y += 8;
  neueSeiteWennNoetig();

  // ---- Mengen-Zusammenfassung je Einheit ----
  if (summe.mengenJeEinheit.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('MENGEN JE EINHEIT', rand, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    const zusammen = summe.mengenJeEinheit.map((m) => mengeText(m.menge, m.einheit)).join('   ·   ');
    doc.text(zusammen, rand, y); y += 8;
  }

  // ---- Summen (rechts) ----
  const mw = mitMwSt(summe.gesamtBetrag);
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
  if (mw) {
    sumZeile('Netto', eur(mw.netto));
    sumZeile('zzgl. 19% MwSt', eur(mw.mwst));
    doc.setDrawColor(...GOLD); doc.line(sumX, y - 2, seiteB - rand, y - 2); y += 2;
    sumZeile('Gesamt (brutto)', eur(mw.brutto), true);
  } else {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('Betrag unvollständig — bei einzelnen Positionen fehlt der Preis.', sumX, y);
    y += 6;
  }

  // ---- Notiz ----
  if (aufmass.notiz) {
    y += 4; neueSeiteWennNoetig();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('ANMERKUNGEN', rand, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    const t = doc.splitTextToSize(aufmass.notiz, seiteB - rand * 2) as string[];
    doc.text(t, rand, y);
  }

  // ---- Unterschriften-Zeile ----
  const unterY = seiteH - 30;
  doc.setDrawColor(...GRAU);
  doc.line(rand, unterY, rand + 60, unterY);
  doc.line(seiteB - rand - 60, unterY, seiteB - rand, unterY);
  doc.setFontSize(7.5); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'normal');
  doc.text('Aufgemessen', rand, unterY + 4);
  doc.text('Kunde / Bestätigung', seiteB - rand - 60, unterY + 4);

  // ---- Fußzeile ----
  const fussY = seiteH - 12;
  doc.setDrawColor(230); doc.line(rand, fussY - 4, seiteB - rand, fussY - 4);
  doc.setFontSize(7.5); doc.setTextColor(...GRAU);
  doc.text('Erstellt mit ARGONAUT OS', rand, fussY);
  doc.text(`Ausgedruckt am ${datum(new Date().toISOString())}`, seiteB - rand, fussY, { align: 'right' });

  const name = `Aufmass_${(aufmass.nummer || aufmass.titel || 'Aufmass').replace(/[^\w.\-]+/g, '_')}.pdf`;
  doc.save(name);
}
