import { NextResponse } from 'next/server';
import { buildDocx, docxToPdf } from '@/lib/document-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const docxBuffer = await buildDocx('ARGONAUT Test-Dokument', [
      { text: 'Block 2 funktioniert', heading: true },
      { text: 'Dieses Dokument wurde als Word erzeugt und ueber Gotenberg in PDF umgewandelt.' },
      { text: 'Erstellt am: ' + new Date().toLocaleString('de-DE') },
    ]);
    const pdfBuffer = await docxToPdf(docxBuffer, 'argonaut-test.docx');
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="argonaut-test.pdf"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
