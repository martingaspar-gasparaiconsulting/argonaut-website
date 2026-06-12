import { NextResponse } from 'next/server';
import { buildXlsx } from '@/lib/document-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const xlsxBuffer = await buildXlsx(
      'Lieferanten',
      [
        { header: 'Lieferant', key: 'name', width: 30 },
        { header: 'Ort', key: 'ort', width: 20 },
        { header: 'Umsatz (EUR)', key: 'umsatz', width: 18 },
      ],
      [
        { name: 'Mueller GmbH', ort: 'Stuttgart', umsatz: 12500 },
        { name: 'Schaefer Holz', ort: 'Boeblingen', umsatz: 8400 },
        { name: 'Kunz AG', ort: 'Sindelfingen', umsatz: 21900 },
      ],
    );
    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="argonaut-lieferanten.xlsx"',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
