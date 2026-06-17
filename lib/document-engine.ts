import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { createAdminClient } from '@/lib/supabase-admin';

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

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
}

export async function buildXlsx(
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, any>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ARGONAUT OS';
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export interface PptxSlide {
  title: string;
  bullets?: string[];
  subtitle?: string;
}

export interface PptxBranding {
  primary?: string;   // Hauptfarbe (Cover-Hintergrund + Titel auf Inhalts-Slides), HEX ohne #
  accent?: string;    // Akzentfarbe (Untertitel + Logo-Schriftzug), HEX ohne #
  logoText?: string;  // Schriftzug auf Cover (Default: ARGONAUT OS)
}

// Normalisiert eine Farbeingabe zu 6-stelligem HEX ohne #. Fallback bei Unsinn.
function normHex(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  let h = String(input).trim().replace(/^#/, '').toUpperCase();
  // 3-stelliges Kuerzel (z.B. F00) auf 6 expandieren
  if (/^[0-9A-F]{3}$/.test(h)) {
    h = h.split('').map((c) => c + c).join('');
  }
  return /^[0-9A-F]{6}$/.test(h) ? h : fallback;
}

export async function buildPptx(
  title: string,
  slides: PptxSlide[],
  branding?: PptxBranding,
): Promise<Buffer> {
  // ARGONAUT-Defaults (greifen, wenn der Kunde keine Farben angibt)
  const NAVY = normHex(branding?.primary, '0A1628');
  const GOLD = normHex(branding?.accent, 'C9A84C');
  const WHITE = 'FFFFFF';
  const LOGO_TEXT = (branding?.logoText && branding.logoText.trim()) || 'ARGONAUT OS';

  const pptx = new PptxGenJS();
  pptx.author = 'ARGONAUT OS';
  pptx.company = 'Gaspar AI Consulting';
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  // Titel-Slide (dunkel)
  const cover = pptx.addSlide();
  cover.background = { color: NAVY };
  cover.addText(title, {
    x: 0.8, y: 2.6, w: 11.7, h: 1.6,
    fontSize: 40, bold: true, color: WHITE, fontFace: 'Calibri', align: 'left',
  });
  cover.addText(LOGO_TEXT, {
    x: 0.8, y: 4.3, w: 11.7, h: 0.5,
    fontSize: 16, color: GOLD, fontFace: 'Calibri', align: 'left',
  });

  // Inhalts-Slides (hell)
  for (const slide of slides) {
    const s2 = pptx.addSlide();
    s2.background = { color: WHITE };
    s2.addText(slide.title, {
      x: 0.6, y: 0.5, w: 12.1, h: 0.9,
      fontSize: 30, bold: true, color: NAVY, fontFace: 'Calibri', align: 'left',
    });
    if (slide.subtitle) {
      s2.addText(slide.subtitle, {
        x: 0.6, y: 1.35, w: 12.1, h: 0.5,
        fontSize: 16, italic: true, color: GOLD, fontFace: 'Calibri', align: 'left',
      });
    }
    if (slide.bullets && slide.bullets.length) {
      s2.addText(
        slide.bullets.map((b) => ({ text: b, options: { bullet: true, color: NAVY, fontSize: 16 } })),
        { x: 0.8, y: 2.1, w: 11.7, h: 4.6, fontFace: 'Calibri', valign: 'top', lineSpacingMultiple: 1.2 }
      );
    }
  }

  const out = await pptx.write({ outputType: 'nodebuffer' });
  return out as Buffer;
}

const BUCKET = 'erstellte-dokumente';

export interface SaveOptions {
  userId: string;
  name: string;
  typ: 'pdf' | 'xlsx' | 'docx' | 'pptx';
  contentType: string;
  status?: string;
  herkunft?: string;
  agent?: string;
}

export interface SavedDocument {
  id: string;
  name: string;
  typ: string;
  status: string;
  storage_path: string;
  herkunft: string | null;
  agent: string | null;
  created_at: string;
}

export async function saveToStorage(fileBuffer: Buffer, opts: SaveOptions): Promise<SavedDocument> {
  const supabase = createAdminClient();
  const safeName = opts.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${opts.userId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, new Uint8Array(fileBuffer), {
      contentType: opts.contentType,
      upsert: false,
    });
  if (uploadError) {
    throw new Error('Storage-Upload fehlgeschlagen: ' + uploadError.message);
  }

  const { data, error: insertError } = await supabase
    .from('erstellte_dokumente')
    .insert({
      user_id: opts.userId,
      name: opts.name,
      typ: opts.typ,
      status: opts.status ?? 'entwurf',
      storage_path: storagePath,
      herkunft: opts.herkunft ?? null,
      agent: opts.agent ?? null,
    })
    .select()
    .single();
  if (insertError) {
    throw new Error('Tabellen-Eintrag fehlgeschlagen: ' + insertError.message);
  }

  return data as SavedDocument;
}
