// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · ZUGFeRD-PDF XML-EXTRAKTION
// ------------------------------------------------------------
// Zieht die eingebettete factur-x.xml (bzw. ZUGFeRD-invoice.xml)
// aus einem ZUGFeRD-PDF — auch wenn der Anhang FlateDecode-
// komprimiert ist (der Normalfall). Nutzt pdf-lib zum Auslesen
// und Dekomprimieren der EmbeddedFiles-Struktur.
//
// Wird in der Empfangs-/Auslese-Route (P35) genutzt, damit auch
// echte ZUGFeRD-PDFs von fremden Absendern gelesen werden können.
// Kostenlos (pdf-lib, MIT).
// ============================================================

import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, PDFArray, PDFDict } from 'pdf-lib';

/** Typische Dateinamen eingebetteter E-Rechnungs-XML. */
const XML_NAMEN = ['factur-x.xml', 'zugferd-invoice.xml', 'xrechnung.xml', 'order-x.xml'];

/**
 * Extrahiert die eingebettete E-Rechnungs-XML aus einem PDF-Buffer.
 * Gibt den XML-Text zurück oder '' wenn keine gefunden wurde.
 * Wirft nicht.
 */
export async function extrahiereXmlAusPdfBytes(pdfBytes: Uint8Array | ArrayBuffer): Promise<string> {
  try {
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, throwOnInvalidObject: false } as any);
    const catalog = doc.catalog;

    const names = catalog.lookup(PDFName.of('Names')) as PDFDict | undefined;
    if (!names) return '';
    const embFiles = names.lookup(PDFName.of('EmbeddedFiles')) as PDFDict | undefined;
    if (!embFiles) return '';
    const arr = embFiles.lookup(PDFName.of('Names')) as PDFArray | undefined;
    if (!arr) return '';

    // arr = [name1, fileSpec1, name2, fileSpec2, ...]
    let ersterTreffer = '';
    for (let i = 0; i + 1 < arr.size(); i += 2) {
      const nameObj: any = arr.lookup(i);
      const dateiName = nameObj?.decodeText ? nameObj.decodeText() : String(nameObj?.asString?.() || '');
      const fileSpec = arr.lookup(i + 1) as PDFDict | undefined;
      if (!fileSpec) continue;
      const ef = fileSpec.lookup(PDFName.of('EF')) as PDFDict | undefined;
      if (!ef) continue;
      const stream = ef.lookup(PDFName.of('F')) || ef.lookup(PDFName.of('UF'));
      if (stream && stream instanceof PDFRawStream) {
        const bytes = decodePDFRawStream(stream).decode();
        const text = Buffer.from(bytes).toString('utf8');
        // Bevorzugt bekannte XML-Dateinamen; sonst ersten XML-artigen nehmen
        const nameLc = dateiName.toLowerCase();
        if (XML_NAMEN.some((n) => nameLc.includes(n.replace('.xml', '')))) {
          return text;
        }
        if (!ersterTreffer && (text.includes('CrossIndustryInvoice') || text.includes('<Invoice'))) {
          ersterTreffer = text;
        }
      }
    }
    return ersterTreffer;
  } catch {
    return '';
  }
}
