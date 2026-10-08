import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { ABLAGE_BUCKET, FOTO_MAX_BYTES, MIME, ablagePfad, bildArt, eintragPruefen } from '@/lib/partnerNetzwerk';
import { DATEI_MIME, RECHNUNG_MAX_BYTES, dateiArt, rechnungPfad, rechnungPruefen, tokenGueltig } from '@/lib/partnerRechnung';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/partner-gast — Paket 279 · K18b Gast-Link
//
// ÖFFENTLICH, SCHUTZ: TOKEN. Partner ohne ARGONAUT arbeiten über einen Link,
// den der Auftraggeber erzeugt hat. Der Link wird hier gehasht (SHA-256); alle
// Prüfungen (Prüfwert, Ablauf, Sperre, Status, Pfade) macht die Datenbank in
// den Funktionen p279_gast_*, die NUR die Dienst-Rolle aufrufen darf.
// Der Gast sieht nur den einen Auftrag mit der Positivliste des Fahrzeugs.
// Mengen-Deckel je IP und je Link (lib/drossel.ts).
//
// GET  ?t=<link>                       -> Auftrag (oder 404)
// POST JSON { t, aktion: 'status', neu, grund }  |  { t, aktion: 'eintrag', text, fotos[] }
// POST form-data { t, aktion: 'foto', datei }    -> { pfad }
// POST form-data { t, aktion: 'rechnung', datei, nummer, datum, netto, satz }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TUER = 'oeffentlich/partner-gast';
const NICHT_DA = () => NextResponse.json({ error: 'Der Link ist ungültig oder abgelaufen.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
const FEHLER = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });
const ZU_VIEL = (art: Parameters<typeof drosselText>[0]) => NextResponse.json({ error: drosselText(art) }, { status: 429, headers: { 'Cache-Control': 'no-store' } });
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const meldung = (e: { message?: string } | null) => String(e?.message || 'Das hat nicht geklappt.').replace(/^.*?ERROR:\s*/, '').slice(0, 300);

export async function GET(req: Request) {
  try {
    const t = new URL(req.url).searchParams.get('t') || '';
    if (!tokenGueltig(t)) return NICHT_DA();
    const db = createAdminClient();
    const zuViel = await drossel(db, TUER, { ip: drosselIp(req.headers), ziel: t });
    if (zuViel) return ZU_VIEL(zuViel);
    const { data, error } = await db.rpc('p279_gast_auftrag', { p_hash: hash(t) });
    if (error || !data) return NICHT_DA();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('partner-gast GET:', e instanceof Error ? e.message : 'unbekannt');
    return NICHT_DA();
  }
}

export async function POST(req: Request) {
  try {
    const db = createAdminClient();
    const art = req.headers.get('content-type') || '';
    if (art.includes('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      const t = String(form?.get('t') || '');
      const aktion = String(form?.get('aktion') || '');
      const datei = form?.get('datei');
      if (!tokenGueltig(t)) return NICHT_DA();
      const zuViel = await drossel(db, TUER, { ip: drosselIp(req.headers), ziel: t });
      if (zuViel) return ZU_VIEL(zuViel);
      if (!datei || typeof datei === 'string') return FEHLER(400, 'Keine Datei übergeben.');
      const bytes = new Uint8Array(await datei.arrayBuffer());

      if (aktion === 'foto') {
        if (datei.size > FOTO_MAX_BYTES) return FEHLER(413, 'Das Foto ist zu groß (höchstens 4 MB).');
        const b = bildArt(bytes);
        if (!b) return FEHLER(415, 'Nur Fotos (JPEG, PNG oder WebP).');
        const { data: ziel } = await db.rpc('p279_gast_ziel', { p_hash: hash(t), p_rechnung: false });
        const pfad = ablagePfad(ziel, crypto.randomUUID(), b);
        if (!pfad) return FEHLER(403, 'Hier können Sie (nicht mehr) Fotos hochladen.');
        const { error } = await db.storage.from(ABLAGE_BUCKET).upload(pfad, bytes, { contentType: MIME[b], upsert: false });
        if (error) return FEHLER(500, 'Das Foto konnte nicht gespeichert werden.');
        return NextResponse.json({ pfad }, { headers: { 'Cache-Control': 'no-store' } });
      }

      if (aktion === 'rechnung') {
        const p = rechnungPruefen({ nummer: form?.get('nummer'), datum: form?.get('datum'), netto: form?.get('netto'), satz: form?.get('satz') }, new Date().toISOString().slice(0, 10));
        if (!p.ok) return FEHLER(400, p.fehler);
        if (datei.size > RECHNUNG_MAX_BYTES) return FEHLER(413, 'Die Datei ist zu groß (höchstens 4 MB).');
        const d = dateiArt(bytes);
        if (!d) return FEHLER(415, 'Nur PDF, JPEG, PNG oder WebP.');
        const { data: ziel } = await db.rpc('p279_gast_ziel', { p_hash: hash(t), p_rechnung: true });
        const pfad = rechnungPfad(ziel, crypto.randomUUID(), d);
        if (!pfad) return FEHLER(403, 'Zu diesem Auftrag kann keine Rechnung (mehr) eingereicht werden.');
        const { error: upErr } = await db.storage.from(ABLAGE_BUCKET).upload(pfad, bytes, { contentType: DATEI_MIME[d], upsert: false });
        if (upErr) return FEHLER(500, 'Die Rechnung konnte nicht gespeichert werden.');
        const f = p.felder;
        const { data: id, error } = await db.rpc('p279_gast_rechnung', { p_hash: hash(t), p_nr: f.nummer, p_datum: f.datum, p_netto: f.netto, p_satz: f.satz, p_pfad: pfad });
        if (error) return FEHLER(400, meldung(error));
        return NextResponse.json({ id, brutto: f.brutto }, { headers: { 'Cache-Control': 'no-store' } });
      }
      return FEHLER(400, 'Unbekannte Aktion.');
    }

    const body = await req.json().catch(() => ({}));
    const t = String(body?.t || '');
    if (!tokenGueltig(t)) return NICHT_DA();
    const zuViel = await drossel(db, TUER, { ip: drosselIp(req.headers), ziel: t });
    if (zuViel) return ZU_VIEL(zuViel);
    if (body?.aktion === 'status') {
      const neu = String(body?.neu || '');
      if (!['angenommen', 'abgelehnt', 'fertig'].includes(neu)) return FEHLER(400, 'Unbekannter Status.');
      const grund = typeof body?.grund === 'string' ? body.grund.slice(0, 300) : null;
      const { data, error } = await db.rpc('p279_gast_status', { p_hash: hash(t), p_neu: neu, p_grund: grund });
      if (error) return FEHLER(400, meldung(error));
      return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (body?.aktion === 'eintrag') {
      const fotos: unknown[] = Array.isArray(body?.fotos) ? body.fotos : [];
      const p = eintragPruefen(body?.text, fotos);
      if (!p.ok) return FEHLER(400, p.fehler);
      if (!fotos.every((x) => typeof x === 'string' && x.length <= 200)) return FEHLER(400, 'Ungültige Fotos.');
      const { data, error } = await db.rpc('p279_gast_eintrag', { p_hash: hash(t), p_text: p.text, p_fotos: fotos });
      if (error) return FEHLER(400, meldung(error));
      return NextResponse.json({ id: data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return FEHLER(400, 'Unbekannte Aktion.');
  } catch (e) {
    console.error('partner-gast POST:', e instanceof Error ? e.message : 'unbekannt');
    return FEHLER(500, 'Das hat nicht geklappt.');
  }
}
