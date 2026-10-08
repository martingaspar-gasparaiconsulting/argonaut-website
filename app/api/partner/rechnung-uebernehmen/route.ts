import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { ABLAGE_BUCKET, istUuid } from '@/lib/partnerNetzwerk';
import { kostenArtGueltig } from '@/lib/partnerRechnung';

// ============================================================================
// ARGONAUT OS · /api/partner/rechnung-uebernehmen — Paket 279 · K18b
//
// NUR MIT LOGIN. Der Auftraggeber übernimmt eine geprüfte Partner-Rechnung in
// Belegeingang (eingangsbelege, Kategorie „Fremdleistung") UND Fahrzeugkosten
// (kfz_bestand_kosten) — beides in EINER Datenbank-Funktion, nie doppelt.
// Recht (Geschäftsleitung oder „Darf abrechnen" + Schreibrecht „Kfz") prüft die
// Datenbank (p279_rechnung_info / p279_rechnung_uebernehmen).
// Ablauf: 1) Quelle/Ziel erfragen  2) Datei in den Belegordner („dokumente",
// <Betrieb>/eingangsbelege/partner_<id>.<art>) kopieren  3) übernehmen.
// Liegt die Kopie schon (zweiter Versuch), geht es weiter.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FEHLER = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rechnung = String(body?.rechnung || '').trim();
    const art = String(body?.art || 'fremd');
    if (!istUuid(rechnung)) return FEHLER(400, 'Keine gültige Rechnung.');
    if (!kostenArtGueltig(art)) return FEHLER(400, 'Unbekannte Kostenart.');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return FEHLER(401, 'Nicht eingeloggt.');

    const { data: info, error } = await supabase.rpc('p279_rechnung_info', { p_rechnung: rechnung });
    if (error) return FEHLER(500, 'Die Partner-Rechnung ist noch nicht eingerichtet (SQL Paket 279 fehlt).');
    const i = info as { quelle?: string; ziel?: string } | null;
    if (!i?.quelle || !i?.ziel) return FEHLER(403, 'Diese Rechnung können Sie nicht übernehmen (fehlendes Recht oder schon entschieden).');

    const admin = createAdminClient();
    const { data: blob, error: dErr } = await admin.storage.from(ABLAGE_BUCKET).download(i.quelle);
    if (dErr || !blob) return FEHLER(500, 'Die Rechnungsdatei ist nicht lesbar.');
    const { error: upErr } = await admin.storage.from('dokumente').upload(i.ziel, blob, { contentType: blob.type || undefined, upsert: false });
    if (upErr && !/exist/i.test(upErr.message)) {
      console.error('rechnung-uebernehmen Kopie:', upErr.message);
      return FEHLER(500, 'Die Rechnungsdatei konnte nicht in den Belegeingang kopiert werden.');
    }

    const { data, error: uErr } = await supabase.rpc('p279_rechnung_uebernehmen', { p_rechnung: rechnung, p_art: art, p_datei: i.ziel });
    if (uErr) return FEHLER(400, String(uErr.message || 'Übernehmen fehlgeschlagen.').slice(0, 300));
    return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('rechnung-uebernehmen Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return FEHLER(500, 'Übernehmen fehlgeschlagen.');
  }
}
