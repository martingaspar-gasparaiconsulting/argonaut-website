// ============================================================================
// ARGONAUT OS · app/api/documents/trigger-analysis/route.ts — Dokument auslesen (Paket PG3)
//
//   POST { document_id }  -> { ok, abschnitte } | { ok: false, error }
//
// Der Upload unter „Dokumente" ruft diese Adresse schon immer auf — die Route
// gab es aber nicht (früher erledigte das ein n8n-Ablauf, der nicht mehr läuft).
// Jetzt liest das System selbst:
//   1. Darf der Nutzer? Nur EIGENE Dokumente (RLS + user_id-Vergleich).
//   2. Datei aus dem Speicher holen (Dienstschlüssel, erst NACH Schritt 1).
//   3. Text lesen (PDF, Word, Excel, Text), in Abschnitte teilen.
//   4. Voyage-Embeddings (voyage-4-lite, wie die Suche) in Stapeln.
//   5. Alte Abschnitte dieses Dokuments ersetzen, Status auf „bereit".
// Erlaubte Status laut Pruefregel documents_status_check:
//   wartet · wird_analysiert · bereit · fehler
// Scheitert etwas, steht der Status auf „fehler" — nie still.
// ============================================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { leserFuer, teileInAbschnitte, stapel, MAX_BYTES } from '@/lib/dokumentAuslesen';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BUCKET = 'customer-documents';
const MODELL = 'voyage-4-lite';

function antwort(ok: boolean, daten: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ok, ...daten }, { status });
}

async function lies(buf: Buffer, leser: NonNullable<ReturnType<typeof leserFuer>>): Promise<string> {
  if (leser === 'pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const r = await extractText(pdf, { mergePages: true });
    return Array.isArray(r.text) ? r.text.join('\n\n') : r.text;
  }
  if (leser === 'docx') return (await mammoth.extractRawText({ buffer: buf })).value;
  if (leser === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const zeilen: string[] = [];
    wb.eachSheet((ws) => {
      zeilen.push(`Tabelle: ${ws.name}`);
      ws.eachRow({ includeEmpty: false }, (row) => {
        const werte: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => { werte.push(cell.value == null ? '' : String(cell.text ?? cell.value)); });
        zeilen.push(werte.join(' | '));
      });
      zeilen.push('');
    });
    return zeilen.join('\n');
  }
  return buf.toString('utf-8');
}

async function einbetten(texte: string[]): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.VOYAGE_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: texte, model: MODELL, input_type: 'document' }),
  });
  if (!res.ok) throw new Error(`Die Aufbereitung für die Suche ist fehlgeschlagen (${res.status}).`);
  const j = await res.json();
  const daten: { embedding: number[]; index: number }[] = Array.isArray(j?.data) ? j.data : [];
  if (daten.length !== texte.length) throw new Error('Die Aufbereitung für die Suche war unvollständig.');
  return daten.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return antwort(false, { error: 'Ungültige Anfrage.' }, 400); }
  const id = String(body.document_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return antwort(false, { error: 'Ungültiges Dokument.' }, 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return antwort(false, { error: 'Nicht eingeloggt.' }, 401);
  if (!process.env.VOYAGE_API_KEY) return antwort(false, { error: 'Die Suche ist derzeit nicht eingerichtet (VOYAGE_API_KEY fehlt).' }, 500);

  // 1. Nur eigene Dokumente
  const { data: doc } = await supabase.from('documents').select('id,user_id,file_name,file_type,file_size,storage_path').eq('id', id).maybeSingle();
  const d = doc as { user_id?: string; file_name?: string; file_type?: string; file_size?: number; storage_path?: string } | null;
  if (!d || d.user_id !== user.id || !d.storage_path) return antwort(false, { error: 'Dokument nicht gefunden.' }, 404);

  const fehlschlag = async (meldung: string, status = 422) => {
    try { await supabase.from('documents').update({ status: 'fehler' }).eq('id', id); } catch { /* Status best effort */ }
    return antwort(false, { error: meldung }, status);
  };

  const leser = leserFuer(d.file_name ?? '', d.file_type);
  if (!leser) return fehlschlag('Dieses Dateiformat wird nicht ausgelesen (möglich: PDF, Word .docx, Excel .xlsx, Text).', 415);
  if ((d.file_size ?? 0) > MAX_BYTES) return fehlschlag('Die Datei ist zu groß zum Auslesen (höchstens 25 MB). Bitte in kleinere Teile aufteilen.', 413);

  try {
    await supabase.from('documents').update({ status: 'wird_analysiert' }).eq('id', id);

    // 2. Datei holen
    const admin = createAdminClient();
    const { data: datei, error: dlFehler } = await admin.storage.from(BUCKET).download(d.storage_path);
    if (dlFehler || !datei) return fehlschlag('Die Datei konnte nicht aus dem Speicher geladen werden.', 502);
    const buf = Buffer.from(await datei.arrayBuffer());

    // 3. Text + Abschnitte
    let text = '';
    try { text = await lies(buf, leser); } catch { return fehlschlag('Die Datei ließ sich nicht lesen (beschädigt oder geschützt?).'); }
    const abschnitte = teileInAbschnitte(text);
    if (!abschnitte.length) return fehlschlag('In der Datei steht kein lesbarer Text. Eingescannte Bilder werden nicht erkannt — bitte eine Datei mit echtem Text hochladen.');

    // 4. Embeddings
    const vektoren: number[][] = [];
    for (const s of stapel(abschnitte)) vektoren.push(...(await einbetten(s)));

    // 5. Alte Abschnitte ersetzen (nur abgeleitete Daten dieses Dokuments)
    const { error: delFehler } = await supabase.from('document_chunks').delete().eq('document_id', id);
    if (delFehler) return fehlschlag(`Alte Abschnitte konnten nicht ersetzt werden: ${delFehler.message}`, 500);
    const zeilen = abschnitte.map((content, i) => ({
      document_id: id, user_id: user.id, content, chunk_index: i, embedding: JSON.stringify(vektoren[i]),
    }));
    for (const s of stapel(zeilen, 100)) {
      const { error } = await supabase.from('document_chunks').insert(s);
      if (error) return fehlschlag(`Abschnitte konnten nicht gespeichert werden: ${error.message}`, 500);
    }
    await supabase.from('documents').update({ status: 'bereit' }).eq('id', id);
    return antwort(true, { abschnitte: abschnitte.length });
  } catch (e) {
    return fehlschlag(e instanceof Error ? e.message : 'Auslesen fehlgeschlagen.', 500);
  }
}
