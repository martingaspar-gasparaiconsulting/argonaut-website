import { NextResponse } from 'next/server';
import { kiFetch } from '@/lib/ki';
import { modellFuer } from '@/lib/kiModelle';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { kennungGueltig } from '@/lib/kfzAnkauf';
import { MAPPE_BUCKET, istUuid, tokenGueltig } from '@/lib/fahrzeugMappe';
import { betriebZuKennung, mappeDb, mappeZuToken } from '@/lib/fahrzeugMappeServer';
import { SCHEIN_FRAGE, SCHEIN_SYSTEM, erkanntSauber, jsonAusText, lesbar } from '@/lib/fahrzeugMappeAuslesen';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/fahrzeugmappe/schein — Paket 307 · FM3
//
// ÖFFENTLICH, nur mit dem Link-Schlüssel des Verkäufers und nur im Entwurf.
// Liest die Datei im Fach „Fahrzeugschein" DIESER Mappe aus dem privaten
// Ordner (nie eine Datei aus der Anfrage) und lässt die KI sechs Fahrzeugfelder
// lesen. Antwort: nur Vorschläge — gespeichert wird hier NICHTS; der Verkäufer
// hakt an, was er übernimmt (lib/fahrzeugMappeAuslesen).
// Kosten: kleines Modell, Protokoll und Firmen-Topf beim BETRIEB (kiFetch mit
// Betriebs-Kennung), Deckel 3 Versuche je Mappe und 10 je Absender und Stunde.
// Keine Personendaten: Die KI wird angewiesen, Feld C nicht zu lesen, und
// alles außer den sechs Feldern wird verworfen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b) return KEIN(400, 'Ungültige Anfrage.');
    const k = typeof b.k === 'string' ? b.k.trim() : '';
    const token = b.token;
    if (!kennungGueltig(k) || !tokenGueltig(token)) return KEIN(404, 'Diese Mappe gibt es nicht.');
    if (!istUuid(b.id)) return KEIN(400, 'Bitte zuerst den Fahrzeugschein fotografieren.');
    const db = mappeDb();
    const betrieb = await betriebZuKennung(db, k);
    if (!betrieb) return KEIN(404, 'Das Autohaus nimmt gerade keine Fahrzeugmappen an.');
    const mappe = await mappeZuToken(db, betrieb, token);
    if (!mappe) return KEIN(404, 'Diese Mappe gibt es nicht (mehr).');
    if (mappe.status !== 'entwurf') return KEIN(409, 'Diese Mappe ist schon beim Autohaus.');

    const { data } = await db.from('kfz_mappe_datei').select('id, pfad, mime, bytes, status, fach')
      .eq('id', b.id).eq('mappe_id', mappe.id).eq('owner_user_id', betrieb).maybeSingle();
    const d = data as { id: string; pfad: string; mime: string; bytes: number | null; status: string; fach: string } | null;
    if (!d || d.fach !== 'schein' || d.status !== 'fertig') return KEIN(404, 'Bitte zuerst den Fahrzeugschein fotografieren.');
    const l = lesbar(d.mime, d.bytes);
    if (!l.ok) return KEIN(415, l.fehler);

    // Deckel erst NACH allen Prüfungen — Tippfehler kosten keinen Versuch.
    const zuViel = await drossel(db, 'oeffentlich/fahrzeugmappe/schein', { ip: drosselIp(req.headers), ziel: mappe.id });
    if (zuViel) {
      return NextResponse.json({ error: zuViel === 'ziel' ? 'Der Fahrzeugschein wurde schon mehrmals gelesen. Bitte tragen Sie die Angaben selbst ein.' : drosselText(zuViel) },
        { status: 429, headers: { 'Cache-Control': 'no-store' } });
    }

    const { data: blob, error: dlErr } = await db.storage.from(MAPPE_BUCKET).download(d.pfad);
    if (dlErr || !blob) return KEIN(500, 'Der Fahrzeugschein konnte gerade nicht gelesen werden.');
    const puffer = Buffer.from(await blob.arrayBuffer());
    const l2 = lesbar(d.mime, puffer.length);
    if (!l2.ok) return KEIN(415, l2.fehler);
    const base64 = puffer.toString('base64');
    const pdf = d.mime === 'application/pdf';

    const res = await kiFetch('fahrzeugmappe-schein', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modellFuer('kfz.schein.lesen'),
        max_tokens: 400,
        system: SCHEIN_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            pdf
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
              : { type: 'image', source: { type: 'base64', media_type: d.mime, data: base64 } },
            { type: 'text', text: SCHEIN_FRAGE },
          ],
        }],
      }),
    }, betrieb);
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) return KEIN(429, 'Automatisches Lesen ist gerade nicht möglich. Bitte tragen Sie die Angaben selbst ein.');
      console.error('fahrzeugmappe/schein KI:', res.status);
      return KEIN(502, 'Automatisches Lesen hat nicht geklappt. Bitte tragen Sie die Angaben selbst ein.');
    }
    const j = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
    const text = (j?.content ?? []).filter((x) => x.type === 'text').map((x) => x.text ?? '').join('');
    const erkannt = erkanntSauber(jsonAusText(text), new Date().getUTCFullYear());
    return NextResponse.json({ erkannt, leer: Object.keys(erkannt).length === 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('fahrzeugmappe/schein Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
