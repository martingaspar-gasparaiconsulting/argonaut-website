import { NextResponse } from 'next/server';
import { buildXlsx, saveToStorage } from '@/lib/document-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000000';

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
      ],
    );

    const saved = await saveToStorage(xlsxBuffer, {
      userId: TEST_USER_ID,
      name: 'Lieferantenliste_Test.xlsx',
      typ: 'xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      status: 'entwurf',
      herkunft: 'aus Test-Route',
      agent: 'Der Einkaeufer',
    });

    return NextResponse.json({
      ok: true,
      gespeichert: saved,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
