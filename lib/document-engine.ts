import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export interface DocxParagraph {
  text: string;
  heading?: boolean;
  bold?: boolean;
}

export async function buildDocx(title: string, paragraphs: DocxParagraph[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: title, bold: true })],
          }),
          ...paragraphs.map(
            (pa) =>
              new Paragraph({
                heading: pa.heading ? HeadingLevel.HEADING_2 : undefined,
                children: [new TextRun({ text: pa.text, bold: pa.bold ?? false })],
              }),
          ),
        ],
      },
    ],
  });
  return await Packer.toBuffer(doc);
}

export async function docxToPdf(docxBuffer: Buffer, filename = 'document.docx'): Promise<Buffer> {
  const url = process.env.GOTENBERG_URL;
  const user = process.env.GOTENBERG_USER;
  const pass = process.env.GOTENBERG_PASSWORD;
  if (!url || !user || !pass) {
    throw new Error('Gotenberg ENV fehlt (GOTENBERG_URL / GOTENBERG_USER / GOTENBERG_PASSWORD)');
  }

  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docxBuffer)]), filename);

  const res = await fetch(url + '/forms/libreoffice/convert', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(user + ':' + pass).toString('base64'),
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error('Gotenberg Fehler ' + res.status + ': ' + (await res.text()));
  }
  return Buffer.from(await res.arrayBuffer());
}
