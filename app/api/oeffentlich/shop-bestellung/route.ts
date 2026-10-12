// ============================================================================
// ARGONAUT OS · /api/oeffentlich/shop-bestellung  (Webshop · Kasse)
// ÖFFENTLICH (login-frei). Nimmt eine Kunden-Bestellung von der veröffentlichten
// Shop-Seite entgegen und legt sie als shop_bestellungen beim Seiten-Inhaber an.
// Inhaber sicher über oeffentlich_id aus web_seiten (status=live). PREISE werden
// SERVERSEITIG aus artikel neu bestimmt (Client-Preise werden ignoriert) — nur
// im_shop-Artikel des Inhabers zählen. Danach best effort: Betriebs-Mail +
// Käufer-Bestätigung. Bestellung läuft dann über die vorhandenen Dashboard-
// Knöpfe in Rechnung/CRM/Lager (nichts wird hier automatisch abgebucht).
// Paket 324 (S4): Sprache des Kunden wird vermerkt; die Käufer-Bestätigung
// geht auf Englisch, wenn auf Englisch bestellt wurde (sonst Deutsch).
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml, istEmailGueltig } from '@/lib/newsletter';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { baueBestellung, leseMenge, type ShopZeile } from '@/lib/shopUebernahme';
import { centRunden } from '@/lib/zahlen';
import { startSperrGrund } from '@/lib/startSperre';
import {
  baueB2bBestellung, centText, leseWunschMenge, endkundenPreis, euro, mengenRegel, mengePruefen, offenAusBestellungen,
  offenAusRechnungen, rahmenPruefen, zahlartPruefen, type B2bArtikel,
} from '@/lib/shopB2b';
import { kundeAusToken, ladeNurGewerbe, ladePreisBasis, tokenAus } from '@/lib/shopB2bServer';
import { bestellungErlaubt } from '@/lib/shopGewerbe';
import { sprachName } from '@/lib/mehrsprachig';
import { bestellSprache, fuellen, mailTexte, type MailTexte } from '@/lib/shopSprachen';

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
function eur(n: number, sprache: string | null = null): string {
  // Paket 324: Zahlformat der Kundensprache (immer EUR, immer westliche Ziffern).
  return (Number(n) || 0).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency: 'EUR' });
}

// Paket 204: aktiv + shop_mwst mitlesen; fehlt shop_mwst (SQL p204 offen), ohne lesen (dann 19 %).
const FELDER = 'id, bezeichnung, verkaufspreis, artikelnummer, aktiv';

export async function POST(req: Request) {
  // Paket 216: Webshop bis zur Abnahme durch den Anwalt abgeschaltet (lib/startSperre.ts).
  const shopGesperrt = startSperrGrund('shop');
  if (shopGesperrt) return NextResponse.json({ error: shopGesperrt }, { status: 403 });
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
    const kSprache = bestellSprache(b.sprache);

    if (!seite) return NextResponse.json({ error: 'Seite nicht erkannt.' }, { status: 400 });
    if (!besteller) return NextResponse.json({ error: 'Bitte Ihren Namen angeben.' }, { status: 400 });
    if (!email && !telefon) return NextResponse.json({ error: 'Bitte E-Mail oder Telefon angeben.' }, { status: 400 });
    if (email && !istEmailGueltig(email)) return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
    if (b.privacy !== true) return NextResponse.json({ error: 'Bitte der Datenschutzerklärung zustimmen.' }, { status: 400 });
    if (!eingaben.length) return NextResponse.json({ error: 'Ihr Warenkorb ist leer.' }, { status: 400 });

    // Gewünschte Mengen je Artikel-ID einsammeln (max 100 Positionen).
    const wunsch = new Map<string, number>();
    for (const e of eingaben.slice(0, 100)) {
      const o = e as Record<string, unknown>;
      const id = typeof o.id === 'string' ? o.id : '';
      // Paket 317: bis 100.000 lesen (Gebinde); Endkunden bleiben unten bei höchstens 9.999.
      const menge = leseWunschMenge(o.menge);
      if (id && menge > 0) wunsch.set(id, (wunsch.get(id) || 0) + menge);
    }
    if (!wunsch.size) return NextResponse.json({ error: 'Keine gültigen Positionen.' }, { status: 400 });

    const db = admin();
    // S1: Mengen-Deckel je Absender und je Mail-Adresse + Shop (lib/drossel.ts).
    const zuViel = await drossel(db, 'oeffentlich/shop-bestellung', { ip: drosselIp(req.headers), ziel: email ? `${seite}|${email}` : null });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429 });

    // Inhaber sicher bestimmen — nur veröffentlichte Seiten nehmen Bestellungen an.
    const { data: s } = await db.from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ error: 'Dieser Shop nimmt gerade keine Bestellungen an.' }, { status: 404 });
    }
    const ownerId = inh.owner_user_id;

    // Preise serverseitig aus artikel — nur im_shop-Artikel des Inhabers,
    // nur aktive mit Preis über 0, MwSt je Artikel (Paket 204).
    const lies = (felder: string) => db
      .from('artikel')
      .select(felder)
      .eq('owner_user_id', ownerId)
      .eq('im_shop', true)
      .in('id', Array.from(wunsch.keys()));
    // Paket 316: Gebinde und Mindestmenge mitlesen (fehlen die Spalten, ohne sie).
    let antwort = await lies(FELDER + ', shop_mwst, shop_gebinde, shop_mindestmenge, einheit');
    if (antwort.error) antwort = await lies(FELDER + ', shop_mwst');
    if (antwort.error) antwort = await lies(FELDER);
    const artikel = (antwort.data as unknown as (ShopZeile & B2bArtikel)[]) ?? [];

    // Paket 317 (S3a): Preis-Basis des Betriebs und Geschäftskunde aus dem Link.
    const basis = await ladePreisBasis(db, ownerId);
    const kunde = await kundeAusToken(db, ownerId, tokenAus(req, b.konto), artikel.map((a) => a.id));
    if (tokenAus(req, b.konto) && !kunde) {
      return NextResponse.json({ error: 'Ihr Kundenlink ist nicht mehr gültig. Bitte fordern Sie beim Anbieter einen neuen an oder bestellen Sie ohne Firmenkonto.', konto_ungueltig: true }, { status: 403 });
    }
    // Paket 327 (S3b): Shop nur für geprüfte Geschäftskunden — der Server entscheidet, nicht der Browser.
    const erlaubt = bestellungErlaubt(await ladeNurGewerbe(db, ownerId), kunde);
    if (!erlaubt.ok) return NextResponse.json({ error: erlaubt.grund, nur_gewerbe: true }, { status: 403 });
    const bestellnr = clean(b.bestellnummer, 60);

    let positionen: object[];
    let brutto: number;
    let netto: number | null = null;
    let zahlart: 'rechnung' | 'vorkasse' | null = null;
    if (kunde) {
      const { data: pr } = await db.from('profiles').select('kleinunternehmer').eq('id', ownerId).maybeSingle();
      const ku = !!(pr as { kleinunternehmer?: boolean } | null)?.kleinunternehmer;
      const e = baueB2bBestellung(artikel, wunsch, kunde.liste, basis, ku);
      if (e.fehler.length) return NextResponse.json({ error: e.fehler.join(' ') }, { status: 400 });
      if (!e.positionen.length) return NextResponse.json({ error: 'Die gewählten Produkte sind nicht mehr verfügbar.' }, { status: 409 });
      zahlart = zahlartPruefen(b.zahlart, kunde.auf_rechnung);
      if (b.zahlart === 'rechnung' && zahlart !== 'rechnung') {
        return NextResponse.json({ error: 'Kauf auf Rechnung ist für Ihr Konto nicht freigegeben. Bitte wählen Sie Vorkasse.' }, { status: 400 });
      }
      if (zahlart === 'rechnung' && kunde.kreditrahmen_cent) {
        const [rq, bq] = await Promise.all([
          db.from('rechnungen').select('brutto_summe, bezahlter_betrag, zahlungsstatus').eq('owner_user_id', ownerId).eq('kontakt_id', kunde.kontakt_id).in('zahlungsstatus', ['offen', 'teilbezahlt', 'ueberfaellig']).limit(1000),
          db.from('shop_bestellungen').select('brutto_summe, status, rechnung_id').eq('owner_user_id', ownerId).eq('shop_kunde_id', kunde.id).is('rechnung_id', null).limit(1000),
        ]);
        if (rq.error || bq.error) return NextResponse.json({ error: 'Der Rahmen für Kauf auf Rechnung konnte nicht geprüft werden. Bitte wählen Sie Vorkasse oder versuchen Sie es später.' }, { status: 503 });
        const offen = offenAusRechnungen(rq.data ?? []) + offenAusBestellungen(bq.data ?? []);
        const r = rahmenPruefen(kunde.kreditrahmen_cent, offen, e.brutto_cent);
        if (!r.ok) {
          return NextResponse.json({ error: `Ihr Rahmen für Kauf auf Rechnung reicht für diese Bestellung nicht (noch frei: ${centText(r.frei_cent ?? 0)}). Bitte wählen Sie Vorkasse oder sprechen Sie uns an.` }, { status: 409 });
        }
      }
      positionen = e.positionen;
      brutto = euro(e.brutto_cent);
      netto = euro(e.netto_cent);
    } else {
      // Endkunde: Mengen wie bisher (ganze Zahl bis 9.999), dazu Gebinde und Mindestmenge; Preis brutto je Preis-Basis.
      for (const [id, m] of wunsch) wunsch.set(id, leseMenge(m));
      const fehler: string[] = [];
      for (const a of artikel) {
        const m = wunsch.get(a.id) || 0;
        if (m <= 0) continue;
        const p = mengePruefen(m, mengenRegel(a.shop_gebinde, a.shop_mindestmenge), String(a.bezeichnung || 'Produkt'));
        if (!p.ok) fehler.push(p.fehler);
      }
      if (fehler.length) return NextResponse.json({ error: fehler.join(' ') }, { status: 400 });
      const mitBrutto = basis === 'netto' ? artikel.map((a) => ({ ...a, verkaufspreis: endkundenPreis(a.verkaufspreis, a.shop_mwst, basis) })) : artikel;
      const e = baueBestellung(mitBrutto, wunsch);
      if (!e.positionen.length) return NextResponse.json({ error: 'Die gewählten Produkte sind nicht mehr verfügbar.' }, { status: 409 });
      positionen = e.positionen;
      brutto = e.brutto;
    }

    const notizTeile = [
      kunde ? `Geschäftskunde: ${kunde.name}` : '',
      zahlart ? `Zahlart: ${zahlart === 'rechnung' ? 'auf Rechnung' : 'Vorkasse'}` : '',
      bestellnr ? `Bestellnummer des Kunden: ${bestellnr}` : '',
      kSprache ? `Sprache des Kunden: ${sprachName(kSprache)}` : '',
      telefon ? `Telefon: ${telefon}` : '',
      nachricht || '',
    ].filter(Boolean);

    const zeile: Record<string, unknown> = {
      owner_user_id: ownerId,
      quelle: 'website',
      besteller: kunde ? `${kunde.name} · ${besteller}`.slice(0, 200) : besteller,
      email,
      status: 'neu',
      brutto_summe: brutto,
      positionen,
      notiz: notizTeile.join(' · ') || null,
      bestell_am: new Date().toISOString(),
    };
    if (kunde) Object.assign(zeile, { shop_kunde_id: kunde.id, kontakt_id: kunde.kontakt_id, zahlart, netto_summe: netto });
    if (kSprache) zeile.sprache = kSprache;
    let { error: insErr } = await db.from('shop_bestellungen').insert(zeile);
    // Paket 324: Fehlt die Spalte sprache (SQL p323 offen), ohne sie speichern — die Sprache steht dann nur in der Notiz.
    if (insErr && kSprache) {
      delete zeile.sprache;
      ({ error: insErr } = await db.from('shop_bestellungen').insert(zeile));
    }
    if (insErr) {
      console.error('shop-bestellung Insert:', insErr);
      return NextResponse.json({ error: 'Bestellung konnte nicht gespeichert werden.' }, { status: 500 });
    }

    // Firmenname + Benachrichtigungs-Adresse aus dem CI des Inhabers.
    const { data: ciRow } = await db.from('web_ci').select('firma, email').eq('owner_user_id', ownerId).maybeSingle();
    const ci = ciRow as { firma?: string; email?: string } | null;
    const firma = (ci?.firma || '').toString().trim();
    const betriebMail = (ci?.email || '').toString().trim();

    type MailPos = { menge: number; bezeichnung: string; einzelpreis: number; einzelpreis_netto?: number };
    // Paket 324: Tabelle und Summen in der Sprache der Mail (Betrieb immer Deutsch, Käufer je Bestell-Sprache).
    const posTabIn = (spr: string | null) => (positionen as MailPos[])
      .map((p) => `<tr><td style="padding:4px 12px 4px 0;">${p.menge.toLocaleString(spr === 'en' ? 'en-GB' : 'de-DE')}×</td><td style="padding:4px 12px 4px 0;">${escapeHtml(p.bezeichnung)}</td><td style="padding:4px 0;text-align:right;font-weight:600;">${escapeHtml(eur(kunde && p.einzelpreis_netto != null ? centRunden(p.menge * p.einzelpreis_netto) : p.menge * p.einzelpreis, spr))}</td></tr>`)
      .join('');
    const summenIn = (m: MailTexte, spr: string | null) => kunde && netto != null
      ? `<tr><td colspan="2" style="padding:8px 12px 0 0;">${escapeHtml(m.summeNetto)}</td><td style="padding:8px 0 0;text-align:right;">${escapeHtml(eur(netto, spr))}</td></tr>`
        + `<tr><td colspan="2" style="padding:2px 12px 0 0;">${escapeHtml(m.ust)}</td><td style="padding:2px 0 0;text-align:right;">${escapeHtml(eur(centRunden(brutto - netto), spr))}</td></tr>`
        + `<tr><td colspan="2" style="padding:2px 12px 0 0;font-weight:700;">${escapeHtml(m.summeBrutto)}</td><td style="padding:2px 0 0;text-align:right;font-weight:800;">${escapeHtml(eur(brutto, spr))}</td></tr>`
        + `<tr><td colspan="3" style="padding:8px 0 0;color:#6b7688;">${escapeHtml(m.zahlart)}: ${escapeHtml(zahlart === 'rechnung' ? fuellen(m.aufRechnung, { n: kunde.zahlungsziel_tage }) : m.vorkasse)}${bestellnr ? ` · ${escapeHtml(m.bestellnummer)}: ${escapeHtml(bestellnr)}` : ''}</td></tr>`
      : `<tr><td colspan="2" style="padding:8px 12px 0 0;font-weight:700;">${escapeHtml(m.summe)}</td><td style="padding:8px 0 0;text-align:right;font-weight:800;">${escapeHtml(eur(brutto, spr))}</td></tr>`;
    const posTab = posTabIn(null);
    const summenZeilen = summenIn(mailTexte('de'), null);

    // 1) Betrieb benachrichtigen (best effort — Bestellung liegt schon sicher).
    if (betriebMail) {
      const html = mailLayout(
        'Neue Shop-Bestellung',
        `<p style="margin:0 0 14px;">Über Ihren Onlineshop ist eine neue Bestellung eingegangen — sie liegt bereits unter „Shop / Marktplatz".</p>
         <table style="border-collapse:collapse;font-size:14px;">${posTab}
         ${summenZeilen}</table>
         <p style="margin:16px 0 0;font-size:14px;">Besteller: <b>${escapeHtml(besteller)}</b>${email ? ` · ${escapeHtml(email)}` : ''}${telefon ? ` · ${escapeHtml(telefon)}` : ''}${kSprache ? ` · Sprache: <b>${escapeHtml(sprachName(kSprache))}</b>` : ''}</p>
         ${nachricht ? `<p style="margin:8px 0 0;color:#6b7688;font-size:13px;">${escapeHtml(nachricht).replace(/\n/g, '<br>')}</p>` : ''}`,
      );
      const r = await sendeMail({ an: betriebMail, betreff: `Neue Shop-Bestellung: ${besteller}`, html, ...(email ? { antwortAn: email } : {}) });
      if (!r.ok) console.error('shop-bestellung Betriebs-Mail:', r.fehler);
    }

    // 2) Käufer-Bestätigung (best effort) — Paket 324: auf Englisch, wenn auf Englisch bestellt.
    if (email) {
      const m = mailTexte(kSprache);
      const vorname = besteller.split(' ')[0];
      const html = mailLayout(
        m.titel,
        `<p style="margin:0 0 14px;">${vorname ? fuellen(escapeHtml(m.anredeName), { name: escapeHtml(vorname) }) : escapeHtml(m.anrede)}</p>
         <p style="margin:0 0 14px;">${firma ? fuellen(escapeHtml(m.dankBei), { firma: escapeHtml(firma) }) : escapeHtml(m.dank)}</p>
         <table style="border-collapse:collapse;font-size:14px;margin:0 0 12px;">${posTabIn(kSprache)}
         ${summenIn(m, kSprache)}</table>
         <p style="margin:8px 0 0;">${escapeHtml(m.gruss)}${firma ? '<br>' + escapeHtml(firma) : ''}</p>`,
      );
      try {
        const r = await sendeMail({ an: email, betreff: firma ? fuellen(m.betreffBei, { firma }) : m.betreff, html });
        if (!r.ok) console.error('shop-bestellung Käufer-Mail:', r.fehler);
      } catch (e) { console.error('shop-bestellung Käufer-Mail-Versand:', e); }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('shop-bestellung Fehler:', err);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
