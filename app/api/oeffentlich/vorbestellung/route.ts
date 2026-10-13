// ============================================================================
// ARGONAUT OS · /api/oeffentlich/vorbestellung  (Shop · Vorbestellung)
// Paket 343 (12.10.2026) · BV3b Feinkost Teil 2
//
// ÖFFENTLICH (login-frei). Nimmt aus dem Shop des Betriebs eine Vorbestellung
// (knappe Ware, Abholung im Laden, Bezahlung bei Abholung) oder — wenn
// ausgebucht — einen Eintrag auf die Vormerkliste entgegen.
//
// Gesperrt, bis die Start-Schalter „shop“ UND „vorbestellShop“ frei sind
// (lib/startSperre.ts, Anwalt R52/R53). Der Betrieb kommt nur aus der
// veröffentlichten Seite (web_seiten.status = live), nie vom Browser; jede
// Abfrage ist hart auf owner_user_id gefiltert. Ob die Aktion im Shop stehen
// darf (im Shop zeigen, Artikel mit Preis, passende Einheit, LMIV-Pflicht-
// angaben), prüft der Server neu — mit derselben Regel wie das Schaufenster.
// Die Datenbank (Wächter p342) sperrt die Aktion beim Buchen und lässt nie
// mehr zu, als da ist. Mails danach best effort.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { escapeHtml, istEmailGueltig } from '@/lib/newsletter';
import { drossel, drosselIp, drosselText } from '@/lib/drossel';
import { startSperrGrundServer } from '@/lib/freigabeServer';
import { ladePreisBasis } from '@/lib/shopB2bServer';
import { bestellSprache, fuellen } from '@/lib/shopSprachen';
import { sprachName } from '@/lib/mehrsprachig';
import { mengeText, datumKurz, vormerkPruefen } from '@/lib/vorbestellAktion';
import {
  mengeFuer, schonVorgemerkt, shopAktion, shopEingabe, shopVorbestellPruefen, tagText, vbMailTexte, voraussichtlich,
} from '@/lib/vorbestellShop';
import { ladeAktionen } from '@/lib/vorbestellShopServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function eur(n: number, sprache: string | null): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency: 'EUR' });
}

export async function POST(req: Request) {
  // Paket 343: Vorbestellung im Shop erst nach der rechtlichen Prüfung (Webshop UND Vorbestellung frei).
  const gesperrt = (await startSperrGrundServer('shop')) || (await startSperrGrundServer('vorbestellShop')); // Paket 346
  if (gesperrt) return NextResponse.json({ error: gesperrt }, { status: 403 });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    const b = body as Record<string, unknown>;

    // Honeypot: still „ok", nichts speichern.
    if (typeof b.firma_hp === 'string' && b.firma_hp.trim() !== '') return NextResponse.json({ ok: true });

    const seite = typeof b.seite === 'string' ? b.seite.trim().slice(0, 100) : '';
    const aktionId = typeof b.aktion === 'string' ? b.aktion.trim() : '';
    const art = b.art === 'vormerken' ? 'vormerken' : b.art === 'vorbestellen' ? 'vorbestellen' : null;
    const e = shopEingabe(b);
    const kSprache = bestellSprache(b.sprache);

    if (!seite) return NextResponse.json({ error: 'Seite nicht erkannt.' }, { status: 400 });
    if (!art || !UUID.test(aktionId)) return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
    if (!e.name) return NextResponse.json({ error: 'Bitte Ihren Namen angeben.' }, { status: 400 });
    if (!e.mail && !e.tel) return NextResponse.json({ error: 'Bitte E-Mail oder Telefon angeben.' }, { status: 400 });
    if (e.mail && !istEmailGueltig(e.mail)) return NextResponse.json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' }, { status: 400 });
    if (b.privacy !== true) return NextResponse.json({ error: 'Bitte der Datenschutzerklärung zustimmen.' }, { status: 400 });
    if (art === 'vormerken' && b.einwilligung !== true) return NextResponse.json({ error: 'Bitte bestätigen Sie, dass wir Sie benachrichtigen dürfen.' }, { status: 400 });

    const db = admin();
    // Mengen-Deckel je Absender und je Kunde + Shop (lib/drossel.ts).
    const zuViel = await drossel(db, 'oeffentlich/vorbestellung', { ip: drosselIp(req.headers), ziel: `${seite}|${(e.mail || e.tel).toLowerCase()}` });
    if (zuViel) return NextResponse.json({ error: drosselText(zuViel) }, { status: 429 });

    // Betrieb sicher bestimmen — nur veröffentlichte Seiten nehmen Vorbestellungen an.
    const { data: s } = await db.from('web_seiten').select('owner_user_id, status').eq('oeffentlich_id', seite).maybeSingle();
    const inh = s as { owner_user_id?: string; status?: string } | null;
    if (!inh || inh.status !== 'live' || !inh.owner_user_id) {
      return NextResponse.json({ error: 'Dieser Shop nimmt gerade keine Vorbestellungen an.' }, { status: 404 });
    }
    const ownerId = inh.owner_user_id;

    // Aktion neu laden und mit derselben Regel wie das Schaufenster prüfen.
    const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    const basis = await ladePreisBasis(db, ownerId);
    const [g] = await ladeAktionen(db, ownerId, heute, basis, aktionId);
    const sicht = g ? shopAktion(g.aktion, g.stand, g.artikel, g.etikett, g.preis, g.mwst) : null;
    if (!g || !sicht) return NextResponse.json({ error: 'Diese Ware kann gerade nicht vorbestellt werden.', neu_laden: true }, { status: 409 });
    const a = g.aktion;

    // Name des Betriebs (für Einwilligung und Mails) und Adresse für die Benachrichtigung.
    const [{ data: ciRow }, { data: prRow }] = await Promise.all([
      db.from('web_ci').select('firma, email').eq('owner_user_id', ownerId).maybeSingle(),
      db.from('profiles').select('firma_name').eq('id', ownerId).maybeSingle(),
    ]);
    const ci = ciRow as { firma?: string; email?: string } | null;
    const firma = String(ci?.firma || (prRow as { firma_name?: string } | null)?.firma_name || '').trim();
    const betriebMail = String(ci?.email || '').trim();
    const m = vbMailTexte(kSprache);
    const name = e.name;

    if (art === 'vorbestellen') {
      const r = shopVorbestellPruefen(e, a, g.stand, g.posten);
      if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: 409 });
      const menge = r.felder.menge as number;
      const tag = r.felder.abhol_tag as string;
      const zeile = {
        ...r.felder,
        owner_user_id: ownerId,
        aktion_id: a.id,
        status: 'offen',
        notiz: ['Über den Online-Shop', kSprache ? `Sprache des Kunden: ${sprachName(kSprache)}` : ''].filter(Boolean).join(' · '),
      };
      const { error: insErr } = await db.from('vorbestell_posten').insert(zeile).select('id').maybeSingle();
      if (insErr) {
        // Meldungen des Wächters p342 (Menge, Höchstmenge, Abholtag) sind für Kunden geschrieben.
        const eigen = (insErr as { code?: string }).code === 'P0001';
        if (!eigen) console.error('vorbestellung Insert:', insErr.message);
        return NextResponse.json({ error: eigen ? insErr.message : 'Vorbestellung konnte nicht gespeichert werden.' }, { status: eigen ? 409 : 500 });
      }
      const summe = voraussichtlich(menge, sicht.preis);
      const preisZeile = fuellen(escapeHtml(m.preis), {
        preis: escapeHtml(eur(sicht.preis, kSprache)), einheit: escapeHtml(kSprache === 'en' && sicht.einheit === 'Stk' ? 'pc' : sicht.einheit), summe: escapeHtml(eur(summe, kSprache)),
      });

      if (betriebMail) {
        const html = mailLayout('Neue Vorbestellung aus dem Shop',
          `<p style="margin:0 0 12px;">Über Ihren Onlineshop ist eine Vorbestellung eingegangen — sie steht unter „Lebensmittel › Vorbestellung &amp; Vormerkliste“.</p>
           <p style="margin:0 0 6px;"><b>${escapeHtml(mengeText(menge, a.einheit))} ${escapeHtml(a.titel)}</b> · Abholung ${escapeHtml(datumKurz(tag))}</p>
           <p style="margin:0 0 6px;">voraussichtlich ${escapeHtml(eur(summe, null))} (${escapeHtml(eur(sicht.preis, null))} je ${escapeHtml(sicht.einheit)})</p>
           <p style="margin:12px 0 0;font-size:14px;">Kunde: <b>${escapeHtml(name)}</b>${e.mail ? ` · ${escapeHtml(e.mail)}` : ''}${e.tel ? ` · ${escapeHtml(e.tel)}` : ''}${kSprache ? ` · Sprache: <b>${escapeHtml(sprachName(kSprache))}</b>` : ''}</p>`);
        const rb = await sendeMail({ an: betriebMail, betreff: `Neue Vorbestellung: ${a.titel} (${name})`, html, ...(e.mail ? { antwortAn: e.mail } : {}) });
        if (!rb.ok) console.error('vorbestellung Betriebs-Mail:', rb.fehler);
      }
      if (e.mail) {
        const html = mailLayout(escapeHtml(m.titel),
          `<p style="margin:0 0 14px;">${fuellen(escapeHtml(m.anrede), { name: escapeHtml(name) })}</p>
           <p style="margin:0 0 10px;">${fuellen(escapeHtml(m.vorbestellt), { firma: escapeHtml(firma || '—'), menge: escapeHtml(mengeFuer(menge, a.einheit, kSprache)), titel: escapeHtml(a.titel) })}</p>
           <p style="margin:0 0 6px;">${fuellen(escapeHtml(m.abholung), { tag: escapeHtml(tagText(tag, kSprache)) })}</p>
           <p style="margin:0 0 6px;">${preisZeile}${sicht.nach_gewicht ? ' ' + escapeHtml(m.gewicht) : ''}</p>
           <p style="margin:0 0 6px;">${escapeHtml(m.zahlung)}</p>
           <p style="margin:12px 0 0;">${escapeHtml(m.gruss)}${firma ? '<br>' + escapeHtml(firma) : ''}</p>`);
        try {
          const rk = await sendeMail({ an: e.mail, betreff: fuellen(m.betreff, { titel: a.titel }), html, ...(betriebMail ? { antwortAn: betriebMail } : {}) });
          if (!rk.ok) console.error('vorbestellung Kunden-Mail:', rk.fehler);
        } catch (x) { console.error('vorbestellung Kunden-Mail-Versand:', x instanceof Error ? x.message : 'unbekannt'); }
      }
      return NextResponse.json({ ok: true, art });
    }

    // --- Vormerkliste: nur wenn ausgebucht, nur mit Einwilligung --------------------------
    if (g.stand.phase !== 'ausgebucht') {
      return NextResponse.json({ error: 'Es ist wieder etwas frei — Sie können direkt vorbestellen.', neu_laden: true }, { status: 409 });
    }
    const { data: vz, error: vFehler } = await db.from('vormerkung').select('kunde_mail, kunde_tel, status')
      .eq('owner_user_id', ownerId).eq('aktion_id', a.id).limit(5000);
    if (vFehler) return NextResponse.json({ error: 'Die Vormerkliste ist gerade nicht erreichbar. Bitte später erneut.' }, { status: 503 });
    // Schon vorgemerkt: keine zweite Zeile, keine zweite Mail — gleiche Antwort (verrät nichts über andere).
    if (schonVorgemerkt((vz as { kunde_mail: string | null; kunde_tel: string | null; status: string }[]) ?? [], e.mail || null, e.tel || null)) {
      return NextResponse.json({ ok: true, art });
    }
    const r = vormerkPruefen({ kunde_name: e.name, kunde_tel: e.tel, kunde_mail: e.mail, menge_wunsch: e.menge, einwilligung: true, notiz: '' }, a, firma);
    if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: 400 });
    const { error: vmErr } = await db.from('vormerkung').insert({
      ...r.felder,
      owner_user_id: ownerId,
      aktion_id: a.id,
      notiz: ['Über den Online-Shop', kSprache ? `Sprache des Kunden: ${sprachName(kSprache)}` : ''].filter(Boolean).join(' · '),
    }).select('id').maybeSingle();
    if (vmErr) {
      const eigen = (vmErr as { code?: string }).code === 'P0001';
      if (!eigen) console.error('vormerkung Insert:', vmErr.message);
      return NextResponse.json({ error: eigen ? vmErr.message : 'Vormerkung konnte nicht gespeichert werden.' }, { status: eigen ? 409 : 500 });
    }
    const mengeW = r.felder.menge_wunsch as number;
    if (betriebMail) {
      const html = mailLayout('Neue Vormerkung aus dem Shop',
        `<p style="margin:0 0 12px;">Für „${escapeHtml(a.titel)}“ (ausgebucht) hat sich über Ihren Onlineshop jemand auf die Vormerkliste gesetzt — mit Einwilligung in die Benachrichtigung.</p>
         <p style="margin:0 0 6px;">Wunsch: <b>${escapeHtml(mengeText(mengeW, a.einheit))}</b></p>
         <p style="margin:12px 0 0;font-size:14px;">Kunde: <b>${escapeHtml(name)}</b>${e.mail ? ` · ${escapeHtml(e.mail)}` : ''}${e.tel ? ` · ${escapeHtml(e.tel)}` : ''}</p>`);
      const rb = await sendeMail({ an: betriebMail, betreff: `Neue Vormerkung: ${a.titel} (${name})`, html });
      if (!rb.ok) console.error('vormerkung Betriebs-Mail:', rb.fehler);
    }
    if (e.mail) {
      const html = mailLayout(escapeHtml(m.vormerkTitel),
        `<p style="margin:0 0 14px;">${fuellen(escapeHtml(m.anrede), { name: escapeHtml(name) })}</p>
         <p style="margin:0 0 10px;">${fuellen(escapeHtml(m.vorgemerkt), { firma: escapeHtml(firma || '—'), titel: escapeHtml(a.titel), menge: escapeHtml(mengeFuer(mengeW, a.einheit, kSprache)) })}</p>
         <p style="margin:0 0 6px;">${escapeHtml(m.vormerkInfo)}</p>
         <p style="margin:12px 0 0;">${escapeHtml(m.gruss)}${firma ? '<br>' + escapeHtml(firma) : ''}</p>`);
      try {
        const rk = await sendeMail({ an: e.mail, betreff: fuellen(m.vormerkBetreff, { titel: a.titel }), html, ...(betriebMail ? { antwortAn: betriebMail } : {}) });
        if (!rk.ok) console.error('vormerkung Kunden-Mail:', rk.fehler);
      } catch (x) { console.error('vormerkung Kunden-Mail-Versand:', x instanceof Error ? x.message : 'unbekannt'); }
    }
    return NextResponse.json({ ok: true, art });
  } catch (err) {
    console.error('vorbestellung Fehler:', err instanceof Error ? err.message : 'unbekannt');
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
