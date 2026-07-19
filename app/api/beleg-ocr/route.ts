import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · Beleg-Inbox · app/api/beleg-ocr/route.ts
// Nimmt ein Beleg-Bild/PDF (base64) und liest per KI-Vision die Rechnungsfelder
// als JSON aus. Läuft über kiFetch (Kosten werden protokolliert). Nur eingeloggt.
// Body: { base64: string, mediaType: string }   ("data:"-Präfix bereits entfernt)
// ============================================================

export const runtime = 'nodejs';

const SYSTEM = `Du liest deutsche Eingangsrechnungen/Belege aus. Gib AUSSCHLIESSLICH ein JSON-Objekt zurück (keine Erklärung, kein Markdown) mit exakt diesen Feldern:
{"lieferant": string|null, "belegnummer": string|null, "belegdatum": "YYYY-MM-DD"|null, "netto": number|null, "ust_betrag": number|null, "ust_satz": number|null, "brutto": number|null, "kategorie": string|null}
Regeln: Beträge als Dezimalzahl mit Punkt (z. B. 119.00), keine Währungszeichen. belegdatum im Format YYYY-MM-DD. ust_satz als Prozentzahl (z. B. 19). kategorie kurz einschätzen (z. B. "Material", "Bürobedarf", "Kfz", "Bewirtung", "Software"). Unbekanntes Feld = null. Wenn mehrere Steuersätze vorkommen, nimm den höchsten für ust_satz und die Gesamtsummen für netto/ust_betrag/brutto.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const base64 = typeof body?.base64 === 'string' ? body.base64 : '';
    const mediaType = typeof body?.mediaType === 'string' ? body.mediaType : '';
    if (!base64 || !mediaType) return NextResponse.json({ error: 'Keine Datei übergeben.' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    const istPdf = mediaType === 'application/pdf';
    const medienBlock = istPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    const kiRes = await kiFetch('beleg-ocr', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: [medienBlock, { type: 'text', text: 'Lies diesen Beleg aus und gib nur das JSON zurück.' }] }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('Beleg-OCR KI-Fehler:', kiRes.status, t.slice(0, 300));
      return NextResponse.json({ error: 'Der Beleg konnte nicht gelesen werden. Bitte Foto/PDF prüfen oder Felder manuell erfassen.' }, { status: 502 });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    const roh = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    const m = roh.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ error: 'Antwort nicht lesbar.', roh }, { status: 200 });

    let felder: Record<string, unknown> = {};
    try { felder = JSON.parse(m[0]); } catch { return NextResponse.json({ error: 'Antwort nicht lesbar.', roh }, { status: 200 }); }

    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return NextResponse.json({
      lieferant: str(felder.lieferant), belegnummer: str(felder.belegnummer), belegdatum: str(felder.belegdatum),
      netto: num(felder.netto), ust_betrag: num(felder.ust_betrag), ust_satz: num(felder.ust_satz),
      brutto: num(felder.brutto), kategorie: str(felder.kategorie),
    });
  } catch (e: unknown) {
    console.error('Beleg-OCR Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
