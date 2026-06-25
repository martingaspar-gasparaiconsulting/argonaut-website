// lib/angebot-pdf.ts
// ARGONAUT OS — Angebots-PDF: Briefkopf (Firmenprofil) + Empfaenger (Lead)
// + freigegebener Angebotstext (Markdown -> sauber formatiert) + Akzentfarbe.
// Nutzt die bestehende Pipeline: eigenes DOCX -> docxToPdf (Gotenberg) -> saveToStorage.
// -----------------------------------------------------------------------------
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
import { docxToPdf, saveToStorage, type SavedDocument } from '@/lib/document-engine';

export interface FirmaDaten {
  firma_name?: string | null;
  firma_strasse?: string | null;
  firma_plz?: string | null;
  firma_ort?: string | null;
  firma_telefon?: string | null;
  firma_email?: string | null;
  firma_website?: string | null;
  firma_rechtsform?: string | null;
  firma_registergericht?: string | null;
  firma_hrb?: string | null;
  firma_geschaeftsfuehrer?: string | null;
  firma_ust_id?: string | null;
  firma_steuernummer?: string | null;
  firma_iban?: string | null;
  firma_bank?: string | null;
  firma_bic?: string | null;
  firma_akzentfarbe?: string | null;
}

export interface LeadDaten {
  name?: string | null;
  email?: string | null;
  telefon?: string | null;
}

// HEX normalisieren (ohne #, 6-stellig). Fallback: ARGONAUT Navy.
function normHex(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  let h = String(input).trim().replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9A-F]{6}$/.test(h) ? h : fallback;
}

const SCHWARZ = '1A1A2E';
const GRAU = '6B6B72';

// Inline-Parsing: **fett** innerhalb einer Zeile in TextRuns aufloesen.
function inlineRuns(text: string, farbe: string): TextRun[] {
  const runs: TextRun[] = [];
  const teile = text.split(/(\*\*[^*]+\*\*)/g);
  for (const teil of teile) {
    if (!teil) continue;
    const m = teil.match(/^\*\*([^*]+)\*\*$/);
    if (m) runs.push(new TextRun({ text: m[1], bold: true, color: farbe, font: 'Calibri', size: 22 }));
    else runs.push(new TextRun({ text: teil, color: farbe, font: 'Calibri', size: 22 }));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: '', font: 'Calibri', size: 22 }));
  return runs;
}

// Trennlinie in Akzentfarbe.
function trennlinie(akzent: string): Paragraph {
  return new Paragraph({
    spacing: { before: 120, after: 160 },
    border: { bottom: { color: akzent, space: 1, style: BorderStyle.SINGLE, size: 8 } },
  });
}

// Eine Zeile Angebotstext in einen oder mehrere Paragraphen umwandeln.
function zeileZuParagraph(zeile: string, akzent: string): Paragraph {
  const t = zeile.trim();

  // Leere Zeile -> kleiner Abstand
  if (t === '') return new Paragraph({ spacing: { after: 80 }, children: [] });

  // Trennstrich (--- oder mehr)
  if (/^-{3,}$/.test(t)) return trennlinie(akzent);

  // Ganze Zeile fett -> Ueberschrift in Akzentfarbe
  const heading = t.match(/^\*\*([^*]+)\*\*$/);
  if (heading) {
    return new Paragraph({
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: heading[1], bold: true, color: akzent, font: 'Calibri', size: 26 })],
    });
  }

  // Aufzaehlung (- ...)
  if (/^[-*]\s+/.test(t)) {
    const rest = t.replace(/^[-*]\s+/, '');
    return new Paragraph({
      indent: { left: 360 },
      spacing: { after: 40 },
      children: [new TextRun({ text: '\u2022  ', color: akzent, font: 'Calibri', size: 22 }), ...inlineRuns(rest, SCHWARZ)],
    });
  }

  // Normaler Absatz (mit evtl. inline-fett)
  return new Paragraph({ spacing: { after: 80 }, children: inlineRuns(t, SCHWARZ) });
}

function zeile(text: string, farbe: string, size: number, opts?: { bold?: boolean; rechts?: boolean; spacingAfter?: number }): Paragraph {
  return new Paragraph({
    alignment: opts?.rechts ? AlignmentType.RIGHT : undefined,
    spacing: { after: opts?.spacingAfter ?? 40 },
    children: [new TextRun({ text, color: farbe, font: 'Calibri', size, bold: opts?.bold })],
  });
}

export async function buildAngebotPdf(
  firma: FirmaDaten,
  lead: LeadDaten,
  angebotText: string,
  userId: string,
): Promise<SavedDocument> {
  const akzent = normHex(firma.firma_akzentfarbe, SCHWARZ);

  const kinder: Paragraph[] = [];

  // --- Absenderzeile (klein, grau, oben) ---
  const absenderTeile = [
    firma.firma_name,
    firma.firma_strasse,
    [firma.firma_plz, firma.firma_ort].filter(Boolean).join(' '),
  ].filter((x) => x && String(x).trim() !== '');
  if (absenderTeile.length > 0) {
    kinder.push(zeile(absenderTeile.join('  \u00B7  '), GRAU, 16, { spacingAfter: 40 }));
  }
  kinder.push(trennlinie(akzent));

  // --- Empfaenger ---
  kinder.push(zeile(lead.name || 'Interessent', SCHWARZ, 22, { bold: true, spacingAfter: 20 }));
  if (lead.email) kinder.push(zeile(lead.email, SCHWARZ, 20, { spacingAfter: 20 }));
  if (lead.telefon) kinder.push(zeile(lead.telefon, SCHWARZ, 20, { spacingAfter: 20 }));

  // --- Ort, Datum (rechtsbuendig) ---
  const datum = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const ortDatum = firma.firma_ort ? firma.firma_ort + ', ' + datum : datum;
  kinder.push(zeile(ortDatum, GRAU, 20, { rechts: true, spacingAfter: 200 }));

  // --- Angebotstext (geparst) ---
  for (const z of angebotText.split('\n')) {
    kinder.push(zeileZuParagraph(z, akzent));
  }

  // --- Fusszeile: Pflichtangaben Geschaeftsbrief ---
  const fuss: string[] = [];
  const reg = [firma.firma_rechtsform, firma.firma_geschaeftsfuehrer].filter(Boolean).join(' \u00B7 GF: ');
  if (firma.firma_rechtsform || firma.firma_geschaeftsfuehrer) fuss.push(reg);
  const gericht = [firma.firma_registergericht, firma.firma_hrb].filter(Boolean).join(' ');
  if (gericht) fuss.push(gericht);
  if (firma.firma_ust_id) fuss.push('USt-IdNr.: ' + firma.firma_ust_id);
  else if (firma.firma_steuernummer) fuss.push('Steuernr.: ' + firma.firma_steuernummer);
  const bank = [firma.firma_bank, firma.firma_iban, firma.firma_bic].filter(Boolean).join(' \u00B7 ');
  if (bank) fuss.push(bank);
  const kontakt = [firma.firma_telefon, firma.firma_email, firma.firma_website].filter(Boolean).join(' \u00B7 ');
  if (kontakt) fuss.push(kontakt);

  if (fuss.length > 0) {
    kinder.push(trennlinie(akzent));
    for (const f of fuss) kinder.push(zeile(f, GRAU, 14, { spacingAfter: 20 }));
  }

  // --- DOCX bauen ---
  const doc = new Document({ sections: [{ children: kinder }] });
  const docxBuffer = await Packer.toBuffer(doc);

  // --- DOCX -> PDF (Gotenberg) ---
  const pdfBuffer = await docxToPdf(docxBuffer, 'angebot.docx');

  // --- Speichern (Bucket + Tabelle erstellte_dokumente) ---
  const name = 'Angebot - ' + (lead.name || 'Interessent');
  return await saveToStorage(pdfBuffer, {
    userId,
    name,
    typ: 'pdf',
    contentType: 'application/pdf',
    status: 'entwurf',
    herkunft: 'Angebot',
    agent: 'Der Verkaeufer',
  });
}
