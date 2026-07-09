// ============================================================
// ARGONAUT OS · Block 2 · Welle 1 · C4-4 · Preisauskunft als PDF
//
// EIN LAYOUT, ZWEI AUSGÄNGE:
//   preisauskunftPdf()        -> lädt herunter (Browser)
//   preisauskunftPdfBase64()  -> liefert den Anhang (Server, für n8n)
//
// Kein Gotenberg, kein API-Call, keine jspdf-autotable-Abhängigkeit — nur
// jsPDF, wie bei werkstattAuftragPdf. Die Tabelle wird von Hand gezeichnet.
//
// DIE PREISE SIND IMMER FRISCH.
//   Das PDF wird bei jedem Versand neu erzeugt, direkt aus der berechneten
//   Auskunft. Es gibt keine gespeicherte Preisliste, die veralten könnte.
//   Ändert der Betrieb morgens den Buchenpreis, steht mittags der neue drin.
//
// KEINE ABHÄNGIGKEIT ZU empfaengerLogik.
//   Die Anschrift kommt als fertige Zeilenliste herein. So bleibt der Erzeuger
//   branchenneutral und läuft auch serverseitig, ohne Client-Module zu ziehen.
//
// ⚠️ DIES IST KEINE RECHNUNG.
//   Kein §14-UStG-Pflichtinhalt, keine fortlaufende Nummer. Es ist ein
//   unverbindliches Angebot — der Vorbehalt steht im Dokument.
//
// Branding: Navy #0A1628, Gold #C9A84C.
// Pfad: app/dashboard/_components/preisauskunftPdf.ts
// ============================================================

import { jsPDF } from 'jspdf';
import { formatZahl, einheitKurz } from './holzLogik';
import { sortimentBezeichnungPdf, type Sortiment } from './sortimentLogik';
import { eur } from './preisLogik';
import { auskunftZeilen, type Preisauskunft } from './preisauskunftLogik';

// ----------------------------------------------------------------------------

export interface PdfFirma {
  name?: string | null;
  strasse?: string | null;
  plz_ort?: string | null;
  telefon?: string | null;
  email?: string | null;
  website?: string | null;
  ust_id?: string | null;
  steuernummer?: string | null;
  rechtsform?: string | null;
  registergericht?: string | null;
  hrb?: string | null;
}

export interface PdfOptionen {
  firma?: PdfFirma | null;
  /** Anschriftenblock des Empfängers, z. B. aus empfaengerLogik.anschriftBlock(). */
  empfaengerZeilen?: string[] | null;
  /** Bis wann gilt die Auskunft? Nur Anzeige — bindend ist sie ohnehin nicht. */
  gueltigBis?: string | null;
  /** Eigener Dateiname ohne Endung. */
  dateiname?: string | null;
}

const NAVY: [number, number, number] = [10, 22, 40];
const GOLD: [number, number, number] = [201, 168, 76];
const GRAU: [number, number, number] = [143, 163, 190];
const HELL: [number, number, number] = [243, 245, 248];
const LINIE: [number, number, number] = [225, 225, 225];
const WARN: [number, number, number] = [224, 162, 76];

function heute(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function datum(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = iso.split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
}

// ----------------------------------------------------------------------------
// DER ERZEUGER
// ----------------------------------------------------------------------------

/**
 * Baut das Dokument. Speichert nichts, lädt nichts herunter — die beiden
 * Ausgänge unten entscheiden, was damit geschieht.
 */
function baue(a: Preisauskunft, s: Sortiment, opt: PdfOptionen): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const seiteB = doc.internal.pageSize.getWidth();
  const seiteH = doc.internal.pageSize.getHeight();
  const rand = 15;
  const rechts = seiteB - rand;
  let y = 0;

  const neueSeiteWennNoetig = (platz = 40) => {
    if (y > seiteH - platz) { doc.addPage(); y = 20; }
  };

  // ---- Kopfbalken -----------------------------------------------------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, seiteB, 34, 'F');
  doc.setTextColor(...GOLD);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('ARGONAUT', rand, 15);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('Preisauskunft', rand, 25);
  doc.setFontSize(9);
  doc.setTextColor(...GRAU);
  doc.text(`Datum: ${heute()}`, rechts, 13, { align: 'right' });
  doc.text('Unverbindliches Angebot', rechts, 19, { align: 'right' });
  if (opt.gueltigBis) doc.text(`Gültig bis: ${datum(opt.gueltigBis)}`, rechts, 25, { align: 'right' });

  y = 44;

  // ---- Absender -------------------------------------------------------
  const f = opt.firma;
  if (f?.name) {
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(f.name, rand, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    const zeile = [f.strasse, f.plz_ort, f.telefon, f.email].filter(Boolean).join(' · ');
    if (zeile) doc.text(zeile, rand, y + 4.5);
    y += 12;
  }

  // ---- Empfänger ------------------------------------------------------
  const empf = (opt.empfaengerZeilen ?? []).filter(Boolean);
  if (empf.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text('ANGEBOT FÜR', rand, y);
    y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...NAVY);
    for (const z of empf) { doc.text(z, rand, y); y += 4.8; }
    y += 6;
  }

  // ---- Ware im Kasten -------------------------------------------------
  const ware = sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad);
  doc.setDrawColor(...LINIE); doc.setFillColor(...HELL);
  doc.roundedRect(rand, y, seiteB - rand * 2, 22, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
  doc.text('IHRE ANFRAGE', rand + 4, y + 6);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text(`${formatZahl(a.ware.menge, 2)} ${einheitKurz(a.ware.einheit)} ${ware}`, rand + 4, y + 14);
  if (s.restfeuchte_prozent != null) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRAU);
    doc.text(`Gemessene Restfeuchte: ${formatZahl(s.restfeuchte_prozent, 1)} %`, rand + 4, y + 19);
  }
  y += 30;

  // ---- Positionstabelle -----------------------------------------------
  const colBetrag = rechts;
  const colPos = rand;
  const posBreite = colBetrag - colPos - 34;

  const kopfH = 8;
  doc.setFillColor(...NAVY);
  doc.rect(rand, y, seiteB - rand * 2, kopfH, 'F');
  doc.setTextColor(...GOLD); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Position', colPos + 2, y + 5.5);
  doc.text('Netto', colBetrag - 2, y + 5.5, { align: 'right' });
  y += kopfH;

  const zeilen = auskunftZeilen(a, s);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  let wechsel = false;

  for (const z of zeilen) {
    neueSeiteWennNoetig(60);
    const bezZeilen = doc.splitTextToSize(z.bezeichnung, posBreite) as string[];
    const detailH = z.detail ? 4 : 0;
    const zeilenHoehe = Math.max(7, bezZeilen.length * 4.5 + 2.5 + detailH);

    if (wechsel) { doc.setFillColor(...HELL); doc.rect(rand, y, seiteB - rand * 2, zeilenHoehe, 'F'); }
    wechsel = !wechsel;

    doc.setTextColor(...NAVY); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(bezZeilen, colPos + 2, y + 5);
    if (z.detail) {
      doc.setFontSize(7.5); doc.setTextColor(...GRAU);
      doc.text(z.detail, colPos + 2, y + 5 + bezZeilen.length * 4.5);
    }
    doc.setFontSize(9);
    doc.setTextColor(...(z.istRabatt ? GRAU : NAVY));
    doc.text(z.nettoText, colBetrag - 2, y + 5, { align: 'right' });

    y += zeilenHoehe;
    doc.setDrawColor(...LINIE); doc.line(rand, y, rechts, y);
  }

  y += 8;
  neueSeiteWennNoetig(60);

  // ---- Summen ---------------------------------------------------------
  const sumX = rechts - 70;
  doc.setFontSize(9);

  const sumZeile = (label: string, wert: string, fett = false) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal');
    doc.setTextColor(...(fett ? NAVY : GRAU));
    doc.text(label, sumX, y);
    doc.setTextColor(...NAVY);
    doc.text(wert, rechts, y, { align: 'right' });
    y += 6;
  };

  sumZeile('Summe netto', eur(a.gesamt.netto));

  // Getrennter Steuerausweis: 7 % Holz, 19 % Anfahrt. Nie gemittelt.
  for (const g of a.gesamt.gruppen) {
    sumZeile(`zzgl. ${formatZahl(g.steuersatzProzent, 0)} % USt.`, eur(g.steuerBetrag));
  }

  doc.setDrawColor(...GOLD); doc.line(sumX, y - 2, rechts, y - 2); y += 2;
  sumZeile('Gesamtbetrag (brutto)', eur(a.gesamt.brutto), true);

  y += 6;

  // ---- Schätzhinweis --------------------------------------------------
  if (a.geschaetzt) {
    neueSeiteWennNoetig(50);
    const t = 'Die Entfernung ist ein Schätzwert. Der endgültige Anfahrtsbetrag kann geringfügig abweichen.';
    const tz = doc.splitTextToSize(t, seiteB - rand * 2 - 8) as string[];
    const h = 8 + tz.length * 4.5;
    doc.setDrawColor(...WARN); doc.setFillColor(255, 250, 240);
    doc.roundedRect(rand, y, seiteB - rand * 2, h, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
    doc.text(tz, rand + 4, y + 6);
    y += h + 6;
  }

  // ---- Vorbehalt ------------------------------------------------------
  neueSeiteWennNoetig(40);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...GRAU);
  doc.text('HINWEIS', rand, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...NAVY);
  const vorbehalt = doc.splitTextToSize(
    'Dieses Angebot ist freibleibend und unverbindlich. Verfügbarkeit und Liefertermin stimmen wir gern telefonisch ab. ' +
    'Alle Beträge verstehen sich in Euro. Der Steuerausweis erfolgt getrennt nach Steuersätzen.',
    seiteB - rand * 2,
  ) as string[];
  doc.text(vorbehalt, rand, y);
  y += vorbehalt.length * 4.2 + 4;

  // ---- Fußzeile -------------------------------------------------------
  const fussY = seiteH - 14;
  doc.setDrawColor(230); doc.line(rand, fussY - 6, rechts, fussY - 6);
  doc.setFontSize(7); doc.setTextColor(...GRAU); doc.setFont('helvetica', 'normal');

  const fussLinks = [
    f?.name ? `${f.name}${f.rechtsform ? ' · ' + f.rechtsform : ''}` : null,
    [f?.strasse, f?.plz_ort].filter(Boolean).join(', ') || null,
  ].filter(Boolean) as string[];

  const fussRechts = [
    f?.ust_id ? `USt-IdNr.: ${f.ust_id}` : (f?.steuernummer ? `Steuernummer: ${f.steuernummer}` : null),
    f?.registergericht && f?.hrb ? `${f.registergericht} ${f.hrb}` : null,
    f?.website ?? null,
  ].filter(Boolean) as string[];

  fussLinks.forEach((z, i) => doc.text(z, rand, fussY - 3 + i * 3.4));
  fussRechts.forEach((z, i) => doc.text(z, rechts, fussY - 3 + i * 3.4, { align: 'right' }));

  doc.setFontSize(6.5);
  doc.text('Erstellt mit ARGONAUT OS', rand, seiteH - 5);
  doc.text(heute(), rechts, seiteH - 5, { align: 'right' });

  return doc;
}

// ----------------------------------------------------------------------------
// AUSGANG 1 — Herunterladen (Browser)
// ----------------------------------------------------------------------------

export function preisauskunftPdf(a: Preisauskunft, s: Sortiment, opt: PdfOptionen = {}): void {
  const doc = baue(a, s, opt);
  const roh = opt.dateiname ?? `Preisauskunft_${sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad)}`;
  const name = `${roh.replace(/[^\w.\-]+/g, '_')}.pdf`;
  doc.save(name);
}

// ----------------------------------------------------------------------------
// AUSGANG 2 — Als Anhang (Server, n8n)
// ----------------------------------------------------------------------------

/**
 * Liefert das PDF als base64 — genau das Format, das ein Mailversand als
 * Anhang erwartet. Läuft auch in Node, weil jsPDF dort ebenfalls arbeitet.
 */
export function preisauskunftPdfBase64(a: Preisauskunft, s: Sortiment, opt: PdfOptionen = {}): string {
  const doc = baue(a, s, opt);
  return doc.output('datauristring').split(',')[1] ?? '';
}

/** Nur der Dateiname, damit Aufrufer und PDF nicht auseinanderlaufen. */
export function preisauskunftDateiname(s: Sortiment, dateiname?: string | null): string {
  const roh = dateiname ?? `Preisauskunft_${sortimentBezeichnungPdf(s.holzart, s.scheitlaenge_cm, s.trocknungsgrad)}`;
  return `${roh.replace(/[^\w.\-]+/g, '_')}.pdf`;
}
