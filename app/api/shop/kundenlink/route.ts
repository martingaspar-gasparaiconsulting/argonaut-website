// ============================================================================
// ARGONAUT OS · Paket 316 (S3a) · /api/shop/kundenlink — Kundenkonto per Link
//
// Nur die Geschäftsleitung (mit Login, Datenbank-Regeln gelten). Erzeugt einen
// neuen geheimen Link für einen Geschäftskunden. In der Datenbank liegt NUR
// die Prüfsumme (sha256) — der Link selbst wird genau einmal zurückgegeben
// und auf Wunsch an die E-Mail-Adresse des Kontakts geschickt. Ein neuer
// Link macht den alten sofort ungültig.
//
// Body:    { kundeId, senden?: boolean }
// Antwort: { link, mail } — Link nur in dieser Antwort.
// ============================================================================

import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';
import { firmaKurz } from '@/lib/fahrzeugMappeServer';
import { basisAdresse } from '@/lib/kfzBoerseLaden';
import { kundenLink, kundeName, shopSeite, tokenGueltig } from '@/lib/shopB2b';
import { startFrei } from '@/lib/startSperre';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEIN = (status: number, text: string) => NextResponse.json({ error: text }, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return KEIN(401, 'Bitte melden Sie sich an.');
    const { data: chef } = await supabase.rpc('mein_chef_id');
    if (chef) return KEIN(403, 'Den Kunden-Link erzeugt nur die Geschäftsleitung.');

    const body = (await req.json().catch(() => null)) as { kundeId?: unknown; senden?: unknown } | null;
    const kundeId = typeof body?.kundeId === 'string' ? body.kundeId : '';
    if (!UUID.test(kundeId)) return KEIN(400, 'Kunde nicht erkannt.');

    const { data: k } = await supabase.from('shop_kunde')
      .select('id, owner_user_id, kontakt_id, aktiv').eq('id', kundeId).eq('owner_user_id', user.id).maybeSingle();
    const kunde = k as { id: string; owner_user_id: string; kontakt_id: string; aktiv: boolean } | null;
    if (!kunde) return KEIN(404, 'Geschäftskunde nicht gefunden.');
    if (!kunde.aktiv) return KEIN(409, 'Der Kunde ist pausiert. Bitte zuerst wieder aktivieren.');

    // Seite mit Produkt-Baustein (live) — dorthin führt der Link.
    const { data: seiten } = await supabase.from('web_seiten')
      .select('oeffentlich_id, status, bloecke').eq('owner_user_id', user.id).limit(50);
    const oid = shopSeite((seiten as { oeffentlich_id: string | null; status: string | null; bloecke: unknown }[]) ?? []);
    if (!oid) return KEIN(409, 'Es gibt noch keine veröffentlichte Seite mit dem Baustein „Produkte". Bitte zuerst unter Webseiten anlegen und veröffentlichen.');

    const token = randomBytes(24).toString('base64url');
    if (!tokenGueltig(token)) return KEIN(500, 'Der Link konnte nicht erzeugt werden.');
    const hash = createHash('sha256').update(token).digest('hex');

    const { data: upd, error } = await supabase.from('shop_kunde')
      .update({ token_hash: hash }).eq('id', kunde.id).eq('owner_user_id', user.id).select('id');
    if (error || !upd || upd.length !== 1) return KEIN(500, 'Der Link konnte nicht gespeichert werden.');

    const link = kundenLink(basisAdresse(), oid, token);

    let mail = false;
    if (body?.senden === true) {
      const { data: kt } = await supabase.from('kontakte')
        .select('firma, vorname, nachname, email').eq('id', kunde.kontakt_id).eq('owner_user_id', user.id).maybeSingle();
      const kontakt = kt as { firma: string | null; vorname: string | null; nachname: string | null; email: string | null } | null;
      const an = String(kontakt?.email ?? '').trim();
      if (!an) return NextResponse.json({ link, mail: false, hinweis: 'Der Kontakt hat keine E-Mail-Adresse. Bitte den Link selbst weitergeben.' }, { headers: { 'Cache-Control': 'no-store' } });
      const fk = await firmaKurz(supabase, user.id);
      const firma = fk.firma || 'Ihr Lieferant';
      const offen = startFrei('shop');
      const html = kundenMailLayout(firma, fk.akzent, 'Ihr Zugang zu unserem Shop',
        `<p style="margin:0 0 14px;">Guten Tag,</p>`
        + `<p style="margin:0 0 14px;">für ${escapeHtml(kundeName(kontakt))} haben wir einen persönlichen Zugang zu unserem Online-Shop eingerichtet. Über den Knopf sehen Sie Ihre Preise netto, Ihre Staffelpreise und — falls vereinbart — die Zahlung auf Rechnung.</p>`
        + `<p style="margin:18px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:${fk.akzent};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;">Zum Shop</a></p>`
        + `<p style="margin:0 0 14px;color:#6b7688;font-size:13px;">Bitte geben Sie diesen Link nicht weiter — er ist Ihr persönlicher Zugang. Wenn Sie einen neuen Link brauchen, antworten Sie einfach auf diese E-Mail.</p>`
        + (offen ? '' : `<p style="margin:0;color:#6b7688;font-size:13px;">Der Shop wird in Kürze freigeschaltet; bis dahin nehmen wir Bestellungen gern per Telefon oder E-Mail entgegen.</p>`));
      const r = await sendeMail({ an, betreff: `Ihr Zugang zu unserem Shop${fk.firma ? ' · ' + fk.firma : ''}`, html, betriebId: user.id, ...(fk.firma ? { absenderName: fk.firma } : {}), ...(fk.email ? { antwortAn: fk.email } : {}) });
      mail = r.ok;
      if (!r.ok) console.error('shop/kundenlink Mail:', r.fehler);
    }
    return NextResponse.json({ link, mail }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('shop/kundenlink:', e instanceof Error ? e.message : 'unbekannt');
    return KEIN(500, 'Interner Fehler.');
  }
}
