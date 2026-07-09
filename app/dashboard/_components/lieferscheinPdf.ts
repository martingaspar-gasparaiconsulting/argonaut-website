// ============================================================
// ARGONAUT OS · Block 1 · F1-1 · Lieferschein als PDF
//
// BRANCHENNEUTRAL. Kein Wort über Holz.
//   Der Fleischer liefert Hälften, der Getränkehändler Kisten, Schäfer Ster.
//   Diese Datei sieht Zeilen mit Menge, Einheit und Bezeichnung.
//
// ⚠️ EIN LIEFERSCHEIN ZEIGT KEINE PREISE.
//   Er belegt, WAS geliefert wurde — nicht, was es kostet. Der Kunde
//   unterschreibt die Ware, nicht den Betrag. Wer Preise darauf druckt,
//   verwirrt den Empfänger und liefert dem Nachbarn eine Preisauskunft.
//
//   `mitPreise` gibt es trotzdem — manche Branchen wollen es. Standard: aus.
//
// ZWEI AUSGÄNGE, EIN LAYOUT:
//   lieferscheinPdf()        -> lädt herunter (Browser)
//   lieferscheinPdfBase64()  -> liefert den Anhang (Server, n8n)
//
// Kein Gotenberg, keine autotable-Abhängigkeit — nur jsPDF, wie bei
// werkstattAuftragPdf. Die Tabelle wird von Hand gezeichnet.
//
// Branding: Navy #0A1628, Gold #C9A84C.
// Pfad: app/dashboard/_components/lieferscheinPdf.ts
// ============================================================

import { jsPDF } from 'jspdf';
import { eur, formatZahl, mengeText } from './positionsLogik';

// ----------------------------------------------------------------------------

export interface LieferscheinPosition {
  position_nr?: number | null;
  bezeichnung: string;
  detail?: string | null;
  menge: number;
  einheit: string;
  /** Nur relevant, wenn mitPreise = true. */
  einzelpreis_netto?: number | null;
}

export interface LieferscheinFirma {
  name?: string | null;
  strasse?: string | null;
  plz_ort?: string | null;
  telefon?: string | null;
  email?: string | null;
  website?: string | null;
  rechtsform?: string | null;
  registergericht?: string | null;
  hrb?: string | null;
}

export interface LieferscheinDaten {
  nummer?: string | null;
  /** Auftragsnummer, falls abweichend. */
  auftragsnummer?: string | null;
  lieferdatum?: string | null;

  /** Anschriftenblock, z. B. aus empfaengerLogik.anschriftBlock(). */
  empfaengerZeilen?: string[] | null;
  /** Abweichende Lieferanschrift. */
  lieferanschrift?: string[] | null;

  positionen: LieferscheinPosition[];

  /**
   * Zusatzzeilen unter der Tabelle — z. B. Messprotokolle.
   * Beim Brennholz: "Restfeuchte bei Lieferung gemessen am …: 18,5 %"
   */
  protokoll?: string[] | null;
  notiz?: string | null;

  firma?: LieferscheinFirma | null;
  mitPreise?: boolean;
  dateiname?: string | null;
}

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
function heute(): string {
  return datum(new Date().toISOString());
}

// ----------------------------------------------------------------------------

function baue(d: LieferscheinDaten): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const seiteB = doc.internal.pageSize.getWidth();
  const seiteH = doc.internal.pageSize.getHeight();
  const rand = 15;
  const rechts = seiteB - rand;
  let y = 0;

  const neueSeiteWennNoetig = (platz = 45) => {
    if (y > seiteH - platz) { doc.addPage(); y = 20; }
  };

  // ---- Kopfbalken ------------------------------------------------------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, seiteB, 34, 'F');
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('ARGONAUT', rand, 15);
  doc.setTextColor(255, 255, 255); doc.setFontSize(14);
  doc.text('Lieferschein', rand, 25);
  doc.setFontSize(9); doc.setTextColor(...GRAU);
  doc.text(`Lieferschein: ${d.nummer || '—'}`, rechts, 13, { align: 'right' });
  doc.text(`Lieferdatum: ${datum(d.lieferdatum) === '—' ? heute() : datum(d.lieferdatum)}`, rechts, 19, { align: 'right' });
  if (d.auftragsnummer) doc.text(`Auftrag: ${d.auftragsnummer}`, rechts, 25, { align: 'right' });

  y = 44;

  // ---- Absender --------------------------------------------------------
  const f = d.firma;
  if (f?.name) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(f.name, rand, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    const zeile = [f.strasse, f.plz_ort, f.telefon, f.email].filter(Boolean).join(' · ');
    if (zeile) doc.text(zeile, rand, y + 4.5);
    y += 12;
  }

  // ---- Empfänger + Lieferanschrift ------------------------------------
  const empf = (d.empfaengerZeilen ?? []).filter(Boolean);
  const liefer = (d.lieferanschrift ?? []).filter(Boolean);
  const zweiKaesten = liefer.length > 0;
  const boxB = zweiKaesten ? (seiteB - rand * 2 - 6) / 2 : seiteB - rand * 2;
  const boxH = 32;

  if (empf.length > 0) {
    doc.setDrawColor(...LINIE); doc.setFillColor(...HELL);
    doc.roundedRect(rand, y, boxB, boxH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('EMPFÄNGER', rand + 4, y + 6);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
    empf.slice(0, 5).forEach((z, i) => doc.text(z, rand + 4, y + 12.5 + i * 4.4));

    if (zweiKaesten) {
      const lx = rand + boxB + 6;
      doc.setDrawColor(...LINIE); doc.setFillColor(...HELL);
      doc.roundedRect(lx, y, boxB, boxH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
      doc.text('LIEFERANSCHRIFT', lx + 4, y + 6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
      liefer.slice(0, 5).forEach((z, i) => doc.text(z, lx + 4, y + 12.5 + i * 4.4));
    }
    y += boxH + 10;
  }

  // ---- Positionstabelle -------------------------------------------------
  const mitPreise = d.mitPreise === true;
  const colBetrag = rechts;
  const colEinzel = mitPreise ? colBetrag - 30 : colBetrag;
  const colEinheit = mitPreise ? colEinzel - 28 : colBetrag - 26;
  const colMenge = colEinheit - 24;
  const colPos = rand;
  const posBreite = colMenge - colPos - 4;

  const kopfH = 8;
  doc.setFillColor(...NAVY);
  doc.rect(rand, y, seiteB - rand * 2, kopfH, 'F');
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Position', colPos + 2, y + 5.5);
  doc.text('Menge', colMenge + 20, y + 5.5, { align: 'right' });
  doc.text('Einheit', colEinheit + 22, y + 5.5, { align: 'right' });
  if (mitPreise) {
    doc.text('Einzel', colEinzel + 26, y + 5.5, { align: 'right' });
    doc.text('Betrag', colBetrag - 2, y + 5.5, { align: 'right' });
  }
  y += kopfH;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let wechsel = false;

  if (d.positionen.length === 0) {
    doc.setTextColor(...GRAU);
    doc.text('Keine Positionen.', colPos + 2, y + 5);
    y += 8;
  }

  d.positionen.forEach((p, i) => {
    neueSeiteWennNoetig(60);
    const bezZeilen = doc.splitTextToSize(p.bezeichnung, posBreite) as string[];
    const detailH = p.detail ? 4 : 0;
    const zeilenHoehe = Math.max(7.5, bezZeilen.length * 4.5 + 3 + detailH);

    if (wechsel) { doc.setFillColor(...HELL); doc.rect(rand, y, seiteB - rand * 2, zeilenHoehe, 'F'); }
    wechsel = !wechsel;

    doc.setTextColor(...NAVY); doc.setFontSize(9);
    doc.text(bezZeilen, colPos + 2, y + 5);
    if (p.detail) {
      doc.setFontSize(7.5); doc.setTextColor(...GRAU);
      doc.text(p.detail, colPos + 2, y + 5 + bezZeilen.length * 4.5);
    }

    const mitte = y + 5;
    doc.setFontSize(9); doc.setTextColor(...NAVY);
    doc.text(formatZahl(p.menge, 2), colMenge + 20, mitte, { align: 'right' });
    doc.setTextColor(...GRAU);
    doc.text(p.einheit, colEinheit + 22, mitte, { align: 'right' });

    if (mitPreise) {
      const einzel = p.einzelpreis_netto ?? 0;
      doc.text(eur(einzel), colEinzel + 26, mitte, { align: 'right' });
      doc.setTextColor(...NAVY);
      doc.text(eur(Math.round(p.menge * einzel * 100) / 100), colBetrag - 2, mitte, { align: 'right' });
    }

    y += zeilenHoehe;
    doc.setDrawColor(...LINIE); doc.line(rand, y, rechts, y);
    if (i === d.positionen.length - 1) y += 4;
  });

  // ---- Protokoll (Restfeuchte usw.) -------------------------------------
  const protokoll = (d.protokoll ?? []).filter(Boolean);
  if (protokoll.length > 0) {
    y += 6; neueSeiteWennNoetig(50);
    doc.setDrawColor(...GOLD); doc.setFillColor(255, 252, 242);
    const h = 9 + protokoll.length * 4.6;
    doc.roundedRect(rand, y, seiteB - rand * 2, h, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('PROTOKOLL', rand + 4, y + 5.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    protokoll.forEach((z, i) => doc.text(z, rand + 4, y + 11 + i * 4.6));
    y += h + 6;
  }

  // ---- Notiz -------------------------------------------------------------
  if (d.notiz?.trim()) {
    y += 2; neueSeiteWennNoetig(50);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('ANMERKUNGEN', rand, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...NAVY);
    const t = doc.splitTextToSize(d.notiz.trim(), seiteB - rand * 2) as string[];
    doc.text(t, rand, y);
    y += t.length * 4.5 + 2;
  }

  // ---- Unterschriftenzeile ----------------------------------------------
  y += 16;
  if (y > seiteH - 42) { doc.addPage(); y = 32; }

  const unterB = (seiteB - rand * 2 - 14) / 2;
  doc.setDrawColor(...GRAU);
  doc.line(rand, y, rand + unterB, y);
  doc.line(rand + unterB + 14, y, rechts, y);
  doc.setFontSize(8); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'normal');
  doc.text('Datum, Unterschrift Empfänger', rand, y + 4.5);
  doc.text('Datum, Unterschrift Lieferant', rand + unterB + 14, y + 4.5);
  doc.setFontSize(7);
  doc.text(
    'Mit der Unterschrift bestätigt der Empfänger den Erhalt der oben aufgeführten Ware in einwandfreiem Zustand.',
    rand, y + 10,
  );

  // ---- Fußzeile -----------------------------------------------------------
  const fussY = seiteH - 14;
  doc.setDrawColor(230); doc.line(rand, fussY - 6, rechts, fussY - 6);
  doc.setFontSize(7); doc.setTextColor(...GRAU);

  const links = [
    f?.name ? `${f.name}${f.rechtsform ? ' · ' + f.rechtsform : ''}` : null,
    [f?.strasse, f?.plz_ort].filter(Boolean).join(', ') || null,
  ].filter(Boolean) as string[];
  const rechtsF = [
    f?.registergericht && f?.hrb ? `${f.registergericht} ${f.hrb}` : null,
    f?.website ?? null,
  ].filter(Boolean) as string[];

  links.forEach((z, i) => doc.text(z, rand, fussY - 3 + i * 3.4));
  rechtsF.forEach((z, i) => doc.text(z, rechts, fussY - 3 + i * 3.4, { align: 'right' }));

  doc.setFontSize(6.5);
  doc.text('Erstellt mit ARGONAUT OS', rand, seiteH - 5);
  doc.text(heute(), rechts, seiteH - 5, { align: 'right' });

  return doc;
}

// ----------------------------------------------------------------------------

export function lieferscheinDateiname(d: LieferscheinDaten): string {
  const roh = d.dateiname ?? `Lieferschein_${d.nummer ?? heute()}`;
  return `${roh.replace(/[^\w.\-]+/g, '_')}.pdf`;
}

/** Ausgang 1 — Herunterladen (Browser). */
export function lieferscheinPdf(d: LieferscheinDaten): void {
  baue(d).save(lieferscheinDateiname(d));
}

/** Ausgang 2 — Als Anhang (Server, n8n). Läuft auch in Node. */
export function lieferscheinPdfBase64(d: LieferscheinDaten): string {
  return baue(d).output('datauristring').split(',')[1] ?? '';
}
