// ============================================================================
// ARGONAUT OS · /api/shop/gefahr-auslesen  (Paket 325 · S2)
//
//   POST { artikelId, dokumentId? } -> { erkannt, hinweise[], dokumentId, sprache }
//
// Liest die Kennzeichnung (Abschnitt 2.2 und 14.1) aus dem Sicherheitsdatenblatt
// eines Artikels als VORSCHLAG. Speichert nichts — die Seite legt den
// Vorschlag ab, ein Mensch vergleicht mit dem SDB und bestätigt.
//
// Wer darf: angemeldet, Geschäftsleitung oder Mitarbeiter mit „Shop ändern".
// Das SDB muss zum Betrieb und zum Artikel gehören (wie der Datenbank-Wächter
// p325), nur PDF, nur die aktuelle Fassung. Deutsch wird bevorzugt.
// KI über kiFetch (Firmen-Topf, Minuten-Bremse, Kosten-Protokoll beim Betrieb).
// ============================================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { kiFetch } from '@/lib/ki';
import { modellFuer } from '@/lib/kiModelle';
import { pfadPasst, MAX_BYTES } from '@/lib/produktDokumente';
import { SDB_FRAGE, SDB_SYSTEM, ausKi, jsonAus } from '@/lib/shopGefahr';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function KEIN(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

type DokZeile = { id: string; artikel_id: string; owner_user_id: string; art: string; sprache: string; datei_pfad: string; datei_bytes: number; aktuell: boolean };

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const artikelId = typeof b?.artikelId === 'string' && UUID.test(b.artikelId) ? b.artikelId : null;
    const dokumentId = typeof b?.dokumentId === 'string' && UUID.test(b.dokumentId) ? b.dokumentId : null;
    if (!artikelId) return KEIN(400, 'Artikel fehlt.');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Nicht angemeldet.');
    const { data: chef } = await supabase.rpc('mein_chef_id');
    if (chef) {
      const { data: darf } = await supabase.rpc('darf_ich_modul_aendern', { p_modul: 'shop' });
      if (darf !== true) return KEIN(403, 'Dafür brauchen Sie das Recht „Shop ändern".');
    }
    const betrieb = (chef as string | null) || user.id;
    if (!process.env.ANTHROPIC_API_KEY) return KEIN(500, 'Die KI ist derzeit nicht eingerichtet.');

    const db = createAdminClient();
    const { data: art } = await db.from('artikel').select('id').eq('id', artikelId).eq('owner_user_id', betrieb).maybeSingle();
    if (!art) return KEIN(404, 'Artikel nicht gefunden.');

    let q = db.from('produkt_dokument').select('id, artikel_id, owner_user_id, art, sprache, datei_pfad, datei_bytes, aktuell')
      .eq('owner_user_id', betrieb).eq('artikel_id', artikelId).eq('art', 'sdb').eq('aktuell', true);
    if (dokumentId) q = q.eq('id', dokumentId);
    const { data: doks } = await q.limit(20);
    const liste = ((doks as DokZeile[]) ?? []).sort((x, y) => (x.sprache === 'de' ? 0 : 1) - (y.sprache === 'de' ? 0 : 1));
    const d = liste[0];
    if (!d) return KEIN(404, 'Zu diesem Artikel ist kein aktuelles Sicherheitsdatenblatt hinterlegt. Bitte zuerst unter Produkt-Dokumente hochladen.');
    if (!pfadPasst(d.datei_pfad, betrieb, artikelId)) return KEIN(403, 'Die Datei gehört nicht zu diesem Artikel.');
    if (!(d.datei_bytes > 0) || d.datei_bytes > MAX_BYTES) return KEIN(415, 'Die Datei ist zu groß zum Auslesen.');

    const { data: blob, error: dlErr } = await db.storage.from('produkt-dokumente').download(d.datei_pfad);
    if (dlErr || !blob) return KEIN(500, 'Das Sicherheitsdatenblatt konnte gerade nicht gelesen werden.');
    const puffer = Buffer.from(await blob.arrayBuffer());
    if (puffer.length > MAX_BYTES || puffer.subarray(0, 5).toString('latin1') !== '%PDF-') return KEIN(415, 'Nur PDF-Dateien lassen sich auslesen.');

    const res = await kiFetch('shop-gefahr-auslesen', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modellFuer('chemie.sdb.lesen'),
        max_tokens: 2500,
        system: SDB_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: puffer.toString('base64') } },
            { type: 'text', text: SDB_FRAGE },
          ],
        }],
      }),
    }, betrieb);
    if (!res.ok) {
      if (res.status === 429 || res.status === 403) return KEIN(429, 'Automatisches Lesen ist gerade nicht möglich. Bitte tragen Sie die Angaben selbst ein.');
      console.error('shop/gefahr-auslesen KI:', res.status);
      return KEIN(502, 'Automatisches Lesen hat nicht geklappt. Bitte tragen Sie die Angaben selbst ein.');
    }
    const j = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[] } | null;
    const text = (j?.content ?? []).filter((x) => x.type === 'text').map((x) => x.text ?? '').join('');
    const roh = jsonAus(text);
    if (!roh) return KEIN(502, 'Die Antwort war nicht lesbar. Bitte erneut versuchen oder selbst eintragen.');
    const { angaben, hinweise, sprache } = ausKi(roh);
    return NextResponse.json({ erkannt: angaben, hinweise, dokumentId: d.id, sprache: sprache ?? d.sprache }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('shop/gefahr-auslesen Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
