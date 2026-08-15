import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { leseCsv } from '@/lib/importParser';

// ============================================================================
// ARGONAUT OS · /api/import/lesen — Datei einlesen, nicht speichern
//
// Nimmt eine hochgeladene CSV- oder Excel-Datei entgegen und gibt sie als
// Kopfzeile + Zeilen zurueck. Die Datei wird NUR im Arbeitsspeicher verarbeitet
// und danach verworfen: kein Storage-Bucket, keine Datei auf der Platte, keine
// Altlast mit Kundendaten.
//
// Excel liest exceljs (bereits im Projekt fuer Exporte vorhanden), CSV der
// eigene Parser aus lib/importParser. Beides muendet in dieselbe Struktur.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 12 * 1024 * 1024;   // 12 MB — deutlich mehr als jede realistische Stammdatendatei
const MAX_ZEILEN = 5000;              // pro Durchgang; groessere Dateien in Teilen importieren

/** Eine Excel-Zelle in sauberen Text verwandeln — Formeln, Datumswerte, Links. */
function zelleAlsText(wert: unknown): string {
  if (wert === null || wert === undefined) return '';
  if (wert instanceof Date) {
    return `${wert.getUTCFullYear()}-${String(wert.getUTCMonth() + 1).padStart(2, '0')}-${String(wert.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof wert === 'object') {
    const o = wert as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;                        // Hyperlink-Zelle
    if (o.result !== undefined) return zelleAlsText(o.result);            // Formel-Zelle
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((t) => t.text ?? '').join('');
    }
    if (o.error !== undefined) return '';
    return '';
  }
  return String(wert);
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  let datei: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('datei');
    if (f instanceof File) datei = f;
  } catch {
    return NextResponse.json({ ok: false, error: 'Die Datei konnte nicht gelesen werden.' }, { status: 400 });
  }
  if (!datei) return NextResponse.json({ ok: false, error: 'Es wurde keine Datei mitgeschickt.' }, { status: 400 });
  if (datei.size === 0) return NextResponse.json({ ok: false, error: 'Die Datei ist leer.' }, { status: 400 });
  if (datei.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `Die Datei ist größer als ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Bitte in kleinere Teile aufteilen.` }, { status: 400 });
  }

  const name = datei.name || 'Import-Datei';
  const endung = name.toLowerCase().split('.').pop() ?? '';

  let kopf: string[] = [];
  let zeilen: string[][] = [];
  let trennzeichen = '';
  let blatt: string | null = null;

  try {
    if (endung === 'xlsx' || endung === 'xlsm' || endung === 'xls') {
      const ExcelJS = (await import('exceljs')).default;
      const mappe = new ExcelJS.Workbook();
      await mappe.xlsx.load(await datei.arrayBuffer());

      const tabelle = mappe.worksheets.find((w) => w.rowCount > 0) ?? mappe.worksheets[0];
      if (!tabelle) return NextResponse.json({ ok: false, error: 'In der Excel-Datei ist kein Tabellenblatt zu finden.' }, { status: 400 });
      blatt = tabelle.name;

      const alle: string[][] = [];
      tabelle.eachRow({ includeEmpty: false }, (row) => {
        const werte = Array.isArray(row.values) ? row.values.slice(1) : [];   // exceljs zaehlt ab 1
        alle.push(werte.map((v) => zelleAlsText(v).trim()));
      });

      const gefuellt = alle.filter((z) => z.some((f) => f !== ''));
      if (gefuellt.length === 0) return NextResponse.json({ ok: false, error: 'Das Tabellenblatt enthält keine Daten.' }, { status: 400 });

      kopf = (gefuellt[0] ?? []).map((h, i) => (h.trim() || `Spalte ${i + 1}`));
      zeilen = gefuellt.slice(1).map((z) => {
        const kopie = [...z];
        while (kopie.length < kopf.length) kopie.push('');
        return kopie;
      });
    } else {
      // CSV / TXT — Kodierung erraten: UTF-8, sonst Windows-1252 (Excel-Standard in Deutschland).
      const puffer = Buffer.from(await datei.arrayBuffer());
      let text = puffer.toString('utf8');
      if (text.includes('�')) text = puffer.toString('latin1');
      const tab = leseCsv(text);
      kopf = tab.kopf.map((h, i) => (h.trim() || `Spalte ${i + 1}`));
      zeilen = tab.zeilen;
      trennzeichen = tab.trennzeichen;
    }
  } catch (err: unknown) {
    return NextResponse.json({
      ok: false,
      error: 'Die Datei konnte nicht gelesen werden: ' + (err instanceof Error ? err.message : 'unbekannter Fehler'),
    }, { status: 400 });
  }

  if (kopf.length === 0) {
    return NextResponse.json({ ok: false, error: 'In der Datei ist keine Kopfzeile mit Spaltennamen zu erkennen.' }, { status: 400 });
  }

  const zuviel = Math.max(0, zeilen.length - MAX_ZEILEN);

  return NextResponse.json({
    ok: true,
    dateiname: name,
    blatt,
    trennzeichen,
    kopf,
    zeilen: zeilen.slice(0, MAX_ZEILEN),
    abgeschnitten: zuviel,
    max_zeilen: MAX_ZEILEN,
  });
}
