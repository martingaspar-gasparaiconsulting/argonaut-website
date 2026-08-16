// ============================================================================
// ARGONAUT OS · lib/provisionGutschriftPdf.ts
//
// Die Provisionsgutschrift als druckfertiger Beleg (A4 hoch, jsPDF, Client).
//
// WARUM WEISS UND NICHT NAVY
// Die uebrigen PDFs im System sind Schaustuecke — Gutschein, Exposé. Das hier
// ist ein Buchhaltungsbeleg: er geht zum Steuerberater, wird ausgedruckt und
// abgeheftet. Ein vollflaechig dunkler Beleg frisst eine Patrone und ist auf
// Papier schlecht lesbar. Navy und Gold bleiben als Akzent.
//
// WARUM DAS WORT "GUTSCHRIFT" GROSS OBEN STEHT
// § 14 Abs. 4 Nr. 10 UStG verlangt woertlich die Angabe "Gutschrift", wenn
// der Leistungsempfaenger abrechnet. Fehlt das Wort, ist der Beleg formal
// falsch — auch wenn inhaltlich alles stimmt.
//
// PFLICHTANGABEN NACH § 14 Abs. 4 UStG, hier alle enthalten:
//   1. Name + Anschrift des LEISTENDEN  -> der Partner
//   2. Name + Anschrift des EMPFAENGERS -> Ihr Betrieb
//   3. Steuernummer oder USt-IdNr des Leistenden -> der Partner
//   4. Ausstellungsdatum
//   5. Fortlaufende Nummer
//   6. Menge und Art der Leistung
//   7. Zeitpunkt der Leistung
//   8. Entgelt, aufgeschluesselt nach Steuersaetzen
//   9. Steuersatz und Steuerbetrag — oder Hinweis auf die Befreiung
//  10. Das Wort "Gutschrift"
//
// FEHLT ETWAS, WIRD ES NICHT VERSCHWIEGEN: unvollstaendige Pflichtangaben
// erscheinen als sichtbarer Hinweis auf dem Beleg. Ein still gedruckter
// Beleg mit Luecke ist schlimmer als einer, der die Luecke benennt.
// ============================================================================

import { jsPDF } from 'jspdf';

export interface GutschriftAussteller {
  firma_name?: string | null;
  firma_strasse?: string | null;
  firma_plz?: string | null;
  firma_ort?: string | null;
  firma_steuernummer?: string | null;
  firma_ust_id?: string | null;
  firma_email?: string | null;
  firma_telefon?: string | null;
  firma_iban?: string | null;
}

export interface GutschriftEmpfaenger {
  name?: string | null;
  firma?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  steuernummer?: string | null;
  ust_id?: string | null;
  iban?: string | null;
  kontoinhaber?: string | null;
}

export interface GutschriftPosition {
  text: string;
  betrag: number;
}

export interface GutschriftDaten {
  nummer: string;
  datum: string;               // bereits formatiert, z. B. "16.08.2026"
  leistungszeitraum: string;   // z. B. "August 2026" oder "16.08.2026"
  aussteller: GutschriftAussteller;
  empfaenger: GutschriftEmpfaenger;
  positionen: GutschriftPosition[];
  netto: number;
  ustSatz: number;
  ust: number;
  brutto: number;
  hinweis: string;
}

const NAVY: [number, number, number] = [10, 22, 40];
const GOLD: [number, number, number] = [201, 168, 76];
const GRAU: [number, number, number] = [110, 122, 138];
const ROT: [number, number, number] = [190, 60, 60];

function eur(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function zeilenAdresse(name: string, firma: string, strasse: string, plzOrt: string): string[] {
  return [name, firma, strasse, plzOrt].map((x) => (x || '').trim()).filter(Boolean);
}

/**
 * Was auf dem Beleg fehlt. Wird oben sichtbar ausgegeben, damit niemand
 * einen unvollstaendigen Beleg fuer bare Muenze nimmt.
 */
export function fehlendeAngaben(d: GutschriftDaten): string[] {
  const fehlt: string[] = [];
  const a = d.aussteller || {};
  const e = d.empfaenger || {};

  if (!String(a.firma_name ?? '').trim()) fehlt.push('Ihr Firmenname');
  if (!String(a.firma_strasse ?? '').trim() || !String(a.firma_ort ?? '').trim()) fehlt.push('Ihre Anschrift');
  if (!String(e.name ?? '').trim() && !String(e.firma ?? '').trim()) fehlt.push('Name des Partners');
  if (!String(e.strasse ?? '').trim() || !String(e.ort ?? '').trim()) fehlt.push('Anschrift des Partners');
  if (!String(e.steuernummer ?? '').trim() && !String(e.ust_id ?? '').trim()) {
    fehlt.push('Steuernummer oder USt-IdNr des Partners');
  }
  return fehlt;
}

export function provisionGutschriftPdf(d: GutschriftDaten): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PW = 210;
  const L = 20;              // linker Rand
  const R = PW - 20;         // rechter Rand
  const a = d.aussteller || {};
  const e = d.empfaenger || {};

  // ---------------- Kopfbalken ----------------
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, PW, 26, 'F');
  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(String(a.firma_name ?? 'Ihr Betrieb').toUpperCase(), L, 16);

  doc.setTextColor(230, 235, 244); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const kopfRechts = [
    [a.firma_strasse, `${a.firma_plz ?? ''} ${a.firma_ort ?? ''}`.trim()].filter(Boolean).join(' · '),
    [a.firma_telefon, a.firma_email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  kopfRechts.forEach((t, i) => doc.text(String(t), R, 12 + i * 4.5, { align: 'right' }));

  // ---------------- Anschriftenfeld ----------------
  let y = 44;
  doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]); doc.setFontSize(7.5);
  doc.text('Gutschriftsempfänger (leistender Unternehmer)', L, y);
  y += 5;
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  const anschrift = zeilenAdresse(
    String(e.name ?? ''), String(e.firma ?? ''),
    String(e.strasse ?? ''), `${e.plz ?? ''} ${e.ort ?? ''}`.trim(),
  );
  if (anschrift.length === 0) anschrift.push('—');
  anschrift.forEach((t, i) => doc.text(t, L, y + i * 5));

  // Steuernummer des Leistenden — Pflichtangabe
  const steuerZeile = String(e.ust_id ?? '').trim()
    ? `USt-IdNr: ${e.ust_id}`
    : String(e.steuernummer ?? '').trim()
      ? `Steuernummer: ${e.steuernummer}`
      : '';
  if (steuerZeile) {
    doc.setFontSize(9); doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]);
    doc.text(steuerZeile, L, y + anschrift.length * 5 + 2);
  }

  // Rechter Block: Nummer, Datum, Zeitraum
  doc.setFontSize(9); doc.setTextColor(20, 20, 20);
  const meta: Array<[string, string]> = [
    ['Gutschrift-Nr.', d.nummer || '—'],
    ['Datum', d.datum || '—'],
    ['Leistungszeitraum', d.leistungszeitraum || d.datum || '—'],
  ];
  meta.forEach(([k, v], i) => {
    doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]);
    doc.text(k, R - 42, 49 + i * 6, { align: 'right' });
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.text(v, R, 49 + i * 6, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  });

  // ---------------- Titel ----------------
  y = Math.max(y + anschrift.length * 5 + 14, 82);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('GUTSCHRIFT', L, y);   // § 14 Abs. 4 Nr. 10 UStG — das Wort ist Pflicht
  doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]); doc.setLineWidth(0.8);
  doc.line(L, y + 2.5, L + 46, y + 2.5);

  y += 9;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]);
  doc.text(
    doc.splitTextToSize('Wir rechnen die von Ihnen erbrachten Vermittlungsleistungen wie folgt ab. Eine gesonderte Rechnung Ihrerseits ist nicht erforderlich.', R - L),
    L, y,
  );
  y += 12;

  // ---------------- Warnung bei fehlenden Pflichtangaben ----------------
  const fehlt = fehlendeAngaben(d);
  if (fehlt.length > 0) {
    doc.setFillColor(255, 238, 238);
    doc.setDrawColor(ROT[0], ROT[1], ROT[2]); doc.setLineWidth(0.3);
    const hoehe = 8 + Math.ceil(fehlt.join(', ').length / 90) * 4.5;
    doc.rect(L, y - 4, R - L, hoehe, 'FD');
    doc.setTextColor(ROT[0], ROT[1], ROT[2]); doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Unvollständige Pflichtangaben:', L + 3, y + 1);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(fehlt.join(' · '), R - L - 6), L + 3, y + 5);
    y += hoehe + 4;
  }

  // ---------------- Positionen ----------------
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(L, y, R - L, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text('Vermittlung', L + 3, y + 5.5);
  doc.text('Betrag', R - 3, y + 5.5, { align: 'right' });
  y += 8;

  doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20); doc.setFontSize(9);
  const positionen = d.positionen && d.positionen.length > 0
    ? d.positionen
    : [{ text: 'Keine Positionen', betrag: 0 }];

  positionen.forEach((p, i) => {
    if (y > 250) { doc.addPage(); y = 25; }
    if (i % 2 === 1) {
      doc.setFillColor(246, 248, 251);
      doc.rect(L, y, R - L, 7, 'F');
    }
    const text = doc.splitTextToSize(String(p.text || ''), R - L - 40) as string[];
    doc.text(text[0] ?? '', L + 3, y + 5);
    doc.text(eur(p.betrag), R - 3, y + 5, { align: 'right' });
    y += 7;
    // Zweite Zeile eines langen Positionstexts nicht verschlucken.
    for (let k = 1; k < text.length; k++) {
      doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]);
      doc.text(text[k] ?? '', L + 3, y + 4);
      doc.setTextColor(20, 20, 20);
      y += 5;
    }
  });

  // ---------------- Summen ----------------
  y += 4;
  doc.setDrawColor(200, 206, 214); doc.setLineWidth(0.3);
  doc.line(L + (R - L) * 0.45, y, R, y);
  y += 6;

  const summen: Array<[string, string, boolean]> = [
    ['Nettobetrag', eur(d.netto), false],
  ];
  if (d.ustSatz > 0) {
    summen.push([`zzgl. Umsatzsteuer ${d.ustSatz} %`, eur(d.ust), false]);
  }
  summen.push([d.ustSatz > 0 ? 'Auszahlungsbetrag (brutto)' : 'Auszahlungsbetrag', eur(d.brutto), true]);

  summen.forEach(([k, v, fett]) => {
    doc.setFont('helvetica', fett ? 'bold' : 'normal');
    doc.setFontSize(fett ? 11 : 9.5);
    doc.setTextColor(fett ? NAVY[0] : 60, fett ? NAVY[1] : 60, fett ? NAVY[2] : 60);
    doc.text(k, R - 42, y, { align: 'right' });
    doc.text(v, R, y, { align: 'right' });
    y += fett ? 8 : 6;
  });

  // ---------------- Hinweise ----------------
  y += 4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]);
  doc.text(doc.splitTextToSize(String(d.hinweis || ''), R - L), L, y);
  y += 10;

  const konto = String(e.iban ?? '').trim();
  if (konto) {
    doc.setTextColor(20, 20, 20); doc.setFontSize(9);
    const inhaber = String(e.kontoinhaber ?? '').trim() || String(e.name ?? '').trim();
    doc.text(`Auszahlung auf: ${konto}${inhaber ? ` · ${inhaber}` : ''}`, L, y);
    y += 6;
  }

  // ---------------- Fusszeile ----------------
  const fuss: string[] = [];
  if (a.firma_name) fuss.push(String(a.firma_name));
  const anschriftAussteller = [a.firma_strasse, `${a.firma_plz ?? ''} ${a.firma_ort ?? ''}`.trim()].filter(Boolean).join(', ');
  if (anschriftAussteller) fuss.push(anschriftAussteller);
  if (a.firma_steuernummer) fuss.push(`St.-Nr. ${a.firma_steuernummer}`);
  if (a.firma_ust_id) fuss.push(`USt-IdNr. ${a.firma_ust_id}`);

  doc.setFontSize(7.5); doc.setTextColor(GRAU[0], GRAU[1], GRAU[2]);
  doc.text(doc.splitTextToSize(fuss.join(' · '), R - L), L, 285);

  const datei = `Gutschrift_${String(d.nummer || 'Provision').replace(/[^a-zA-Z0-9-]+/g, '_').slice(0, 40)}.pdf`;
  doc.save(datei);
}
