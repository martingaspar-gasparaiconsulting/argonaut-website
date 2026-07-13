// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · KÖNIGSWEG — ECHTES ZUGFeRD
// ------------------------------------------------------------
// Bettet die ZUGFeRD-XML in ein (von Gotenberg erzeugtes) PDF/A-3
// ein und ergänzt die vorgeschriebenen XMP-Metadaten. Ergebnis:
// eine ECHTE ZUGFeRD-Datei (PDF/A-3 mit factur-x.xml als Anhang,
// AFRelationship=Alternative, ZUGFeRD-XMP-Extension-Schema).
//
// Kostenlos: nutzt ausschließlich pdf-lib (MIT-Lizenz), rein JS,
// läuft auf Vercel. Keine externen Dienste.
//
// WICHTIG: Das eingehende PDF sollte bereits PDF/A-3 sein (kommt
// so von Gotenberg mit pdfa=PDF/A-3b). Diese Funktion fügt den
// XML-Anhang + die ZUGFeRD-Kennzeichnung im XMP hinzu.
// ============================================================

import { PDFDocument, AFRelationship, PDFName, PDFString, PDFHexString } from 'pdf-lib';

export interface ZugferdPdfOptionen {
  /** Rechnungsnummer für die XMP-Metadaten (DocumentID). */
  rechnungsnummer?: string;
  /** ZUGFeRD-Profil-Level. 'EN 16931' ist der Standard (Comfort). */
  profilLevel?: 'MINIMUM' | 'BASIC WL' | 'BASIC' | 'EN 16931' | 'EXTENDED';
  /** Titel im PDF-Metadatensatz. */
  titel?: string;
  /** Autor/Aussteller im PDF-Metadatensatz. */
  autor?: string;
}

/**
 * Baut das ZUGFeRD-XMP-Metadaten-Paket (RDF/XML), das ZUGFeRD vorschreibt.
 * Es kennzeichnet die Datei als Factur-X/ZUGFeRD und nennt Profil + Version.
 */
function baueXmp(opt: ZugferdPdfOptionen): string {
  const level = opt.profilLevel || 'EN 16931';
  const titel = (opt.titel || 'Rechnung').replace(/[<>&]/g, '');
  const autor = (opt.autor || '').replace(/[<>&]/g, '');
  const jetzt = new Date().toISOString();
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${titel}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${autor}</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>ARGONAUT OS</xmp:CreatorTool>
      <xmp:CreateDate>${jetzt}</xmp:CreateDate>
      <xmp:ModifyDate>${jetzt}</xmp:ModifyDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${level}</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Name des eingebetteten XML</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Version des Factur-X-Schemas</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Konformitätslevel</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Nimmt ein PDF (idealerweise PDF/A-3 von Gotenberg) und die ZUGFeRD-XML,
 * bettet die XML als factur-x.xml ein, setzt AFRelationship + XMP.
 * Gibt die fertigen ZUGFeRD-PDF-Bytes zurück.
 */
export async function baueZugferdPdf(
  pdfBytes: Uint8Array | ArrayBuffer,
  xml: string,
  opt: ZugferdPdfOptionen = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);

  // PDF-Metadaten setzen (gehören zu einem sauberen ZUGFeRD)
  if (opt.titel) doc.setTitle(opt.titel);
  if (opt.autor) doc.setAuthor(opt.autor);
  doc.setProducer('ARGONAUT OS');
  doc.setCreator('ARGONAUT OS');

  // XML als factur-x.xml einbetten (ZUGFeRD-Standarddateiname).
  // AFRelationship 'Alternative' = die XML ist die maschinenlesbare
  // Entsprechung des sichtbaren PDF (ZUGFeRD-Vorgabe).
  const xmlBytes = new TextEncoder().encode(xml);
  await doc.attach(xmlBytes, 'factur-x.xml', {
    mimeType: 'application/xml',
    description: 'Factur-X/ZUGFeRD XML invoice',
    creationDate: new Date(),
    modificationDate: new Date(),
    afRelationship: AFRelationship.Alternative,
  });

  // XMP-Metadaten setzen (ZUGFeRD-Kennzeichnung + PDF/A-Konformität).
  const xmp = baueXmp(opt);
  setzeXmp(doc, xmp);

  return await doc.save();
}

/**
 * Setzt den XMP-Metadaten-Stream im PDF-Katalog.
 * pdf-lib hat keine High-Level-XMP-API, daher setzen wir den
 * Metadata-Stream direkt (Standard-PDF-Mechanismus).
 */
function setzeXmp(doc: PDFDocument, xmp: string): void {
  const xmpBytes = new TextEncoder().encode(xmp);
  const stream = doc.context.stream(xmpBytes, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  const ref = doc.context.register(stream);
  doc.catalog.set(PDFName.of('Metadata'), ref);
}
