// ============================================================================
// ARGONAUT OS · /api/oeffentlich/shop-bestellung  (Webshop · Kasse)
// ÖFFENTLICH (login-frei). Nimmt eine Kunden-Bestellung von der veröffentlichten
// Shop-Seite entgegen und legt sie als shop_bestellungen beim Seiten-Inhaber an.
// Inhaber sicher über oeffentlich_id aus web_seiten (status=live). PREISE werden
// SERVERSEITIG aus artikel neu bestimmt (Client-Preise werden ignoriert) — nur
// im_shop-Artikel des Inhabers zählen. Danach best effort: Betriebs-Mail +
// Käufer-Bestätigung. Bestellung läuft dann über die vorhandenen Dashboard-
// Knöpfe in Rechnung/CRM/Lager (nichts wird hier automatisch abgebucht).
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml } from '@/lib/newsletter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}
function eur(n: number): string {
  return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

type ArtikelRow = { id: string; bezeichnung: string | null; verkaufspreis: number | null; artikelnummer: string | null };
type Pos = { bezeichnung: string; menge: number; einzelpreis: number; mwst: number; artikelnummer?: string };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    const b = body as Record<string, unknown>;

    // Honeypot: still „ok", nichts speichern.
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') return NextResponse.json({ ok: true });

    const seite = clean(b.seite, 100);
    const besteller = clean(b.besteller, 200);
    const email = clean(b.email, 200);
    const telefon = clean(b.telefon, 60);
    const nachricht = clean(b.nachricht, 3000);
    const eingaben = Array.isArray(b.positionen) ? (b.positionen as unknown[]) : [];

    if (!seite) return NextResponse.json({ error: 'Seite nicht erkannt.' }, { status: 400 });
    if (!besteller) return NextResponse.json({ error: 'Bitte Ihren Namen angeben.' }, { status: 400 });
    if (!email && !telefon) return NextResponse.json({ error: 'Bitte E-Mail oder Telefon angeben.' }, { status: 400 });
    if (b.privacy !== true) return NextResponse.json({ error: 'Bitte der Datenschutzerklärung zustimmen.' }, { status: 400 });
    if (!eingaben.length) return NextResponse.json({ error: 'Ihr Warenkorb ist leer.' }, { status: 400 });

    // Gewünschte Mengen je Artikel-ID einsammeln (max 100 Positionen).
    const wunsch = new Map<string, number>();
    for (const e of eingaben.slice(0, 100)) {
      const o = e as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : '';
      const menge = Math.max(1, Math.min(9999, Math.round(Number(o.menge) || 0)));
      if (id && menge > 0) wunsch.set(id, (wunsch.get(id) || 0) + menge);
    }
    if (!wunsch.size) return NextResponse.json({ error: 'Keine gültigen Positionen.' }, { status: 400 });

    const db = admin();

    // Inhaber sicher bestimmen — nur veröffentlichte Seiten nehmen Bestellungen an.
    const { data: s } = await db.from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ error: 'Dieser Shop nimmt gerade keine Bestellungen an.' }, { status: 404 });
    }
    const ownerId = inh.owner_user_id;

    // Preise serverseitig aus artikel — nur im_shop-Artikel des Inhabers.
    const { data: artD } = await db
      .from('artikel')
      .select('id, bezeichnung, verkaufspreis, artikelnummer')
      .eq('owner_user_id', ownerId)
      .eq('im_shop', true)
      .in('id', Array.from(wunsch.keys()));
    const artikel = (artD as ArtikelRow[]) ?? [];

    const positionen: Pos[] = [];
    let brutto = 0;
    for (const a of artikel) {
      const menge = wunsch.get(a.id) || 0;
      if (menge <= 0) continue;
      const einzel = Number(a.verkaufspreis) || 0;
      positionen.push({
        bezeichnung: (a.bezeichnung || 'Produkt').toString(),
        menge,
        einzelpreis: einzel,
        mwst: 19,
        ...(a.artikelnummer ? { artikelnummer: a.artikelnummer } : {}),
      });
      brutto += menge * einzel;
    }
    if (!positionen.length) return NextResponse.json({ error: 'Die gewählten Produkte sind nicht mehr verfügbar.' }, { status: 409 });
    brutto = Math.round(brutto * 100) / 100;

    const notizTeile = [telefon ? `Telefon: ${telefon}` : '', nachricht || ''].filter(Boolean);

    const { error: insErr } = await db.from('shop_bestellungen').insert({
      owner_user_id: ownerId,
      quelle: 'website',
      besteller,
      email,
      status: 'neu',
      brutto_summe: brutto,
      positionen,
      notiz: notizTeile.join(' · ') || null,
      bestell_am: new Date().toISOString(),
    });
    if (insErr) {
      console.error('shop-bestellung Insert:', insErr);
      return NextResponse.json({ error: 'Bestellung konnte nicht gespeichert werden.' }, { status: 500 });
    }

    // Firmenname + Benachrichtigungs-Adresse aus dem CI des Inhabers.
    const { data: ciRow } = await db.from('web_ci').select('firma, email').eq('owner_user_id', ownerId).maybeSingle();
    const ci = ciRow as { firma?: string; email?: string } | null;
    const firma = (ci?.firma || '').toString().trim();
    const betriebMail = (ci?.email || '').toString().trim();

    const posTab = positionen
      .map((p) => `<tr><td style="padding:4px 12px 4px 0;">${p.menge}×</td><td style="padding:4px 12px 4px 0;">${escapeHtml(p.bezeichnung)}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(eur(p.menge * p.einzelpreis))}</td></tr>`)
      .join('');

    // 1) Betrieb benachrichtigen (best effort — Bestellung liegt schon sicher).
    if (betriebMail) {
      const html = mailLayout(
        'Neue Shop-Bestellung',
        `<p style="margin:0 0 14px;">Über Ihren Onlineshop ist eine neue Bestellung eingegangen — sie liegt bereits unter „Shop / Marktplatz".</p>
         <table style="border-collapse:collapse;font-size:14px;">${posTab}
         <tr><td colspan="2" style="padding:8px 12px 0 0;font-weight:700;">Summe</td><td style="padding:8px 0 0;text-align:right;font-weight:800;">${escapeHtml(eur(brutto))}</td></tr></table>
         <p style="margin:16px 0 0;font-size:14px;">Besteller: <b>${escapeHtml(besteller)}</b>${email ? ` · ${escapeHtml(email)}` : ''}${telefon ? ` · ${escapeHtml(telefon)}` : ''}</p>
         ${nachricht ? `<p style="margin:8px 0 0;color:#6b7688;font-size:13px;">${escapeHtml(nachricht).replace(/\n/g, '<br>')}</p>` : ''}`,
      );
      const r = await sendeMail({ an: betriebMail, betreff: `Neue Shop-Bestellung: ${besteller}`, html, ...(email ? { antwortAn: email } : {}) });
      if (!r.ok) console.error('shop-bestellung Betriebs-Mail:', r.fehler);
    }

    // 2) Käufer-Bestätigung (best effort).
    if (email) {
      const vorname = besteller.split(' ')[0];
      const html = mailLayout(
        'Ihre Bestellung ist eingegangen',
        `<p style="margin:0 0 14px;">Guten Tag${vorname ? ' ' + escapeHtml(vorname) : ''},</p>
         <p style="margin:0 0 14px;">vielen Dank für Ihre Bestellung${firma ? ' bei ' + escapeHtml(firma) : ''}. Wir haben sie erhalten und melden uns mit der Bestätigung.</p>
         <table style="border-collapse:collapse;font-size:14px;margin:0 0 12px;">${posTab}
         <tr><td colspan="2" style="padding:8px 12px 0 0;font-weight:700;">Summe</td><td style="padding:8px 0 0;text-align:right;font-weight:800;">${escapeHtml(eur(brutto))}</td></tr></table>
         <p style="margin:8px 0 0;">Beste Grüße${firma ? '<br>' + escapeHtml(firma) : ''}</p>`,
      );
      try {
        const r = await sendeMail({ an: email, betreff: `Ihre Bestellung${firma ? ' bei ' + firma : ''}`, html });
        if (!r.ok) console.error('shop-bestellung Käufer-Mail:', r.fehler);
      } catch (e) { console.error('shop-bestellung Käufer-Mail-Versand:', e); }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('shop-bestellung Fehler:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
