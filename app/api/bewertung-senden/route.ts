// ============================================================
// ARGONAUT OS · Bündel 7 · app/api/bewertung-senden/route.ts
// Verschickt die Bewertungs-Einladung per E-Mail an den Kunden.
// Der Datensatz selbst wird im Client über RLS angelegt; hier geht nur die Mail raus.
// Branding: im Namen DES BETRIEBS (kundenMailLayout + Firmen-Akzentfarbe).
// Body: { an, kundeName?, link }
//
// Paket 173 (29.09.2026, Befund H7):
//  - Eine Bewertungsbitte ist Werbung (BGH VI ZR 225/17). Sie geht nur an
//    Adressen mit Einwilligung und ohne Widerspruch (lib/werbeErlaubnis),
//    mit Abmeldelink, Widerspruchshinweis und List-Unsubscribe.
//  - Der Link muss auf eine Bewertungsanfrage DIESES Betriebs an GENAU diese
//    Adresse zeigen — vorher nahm die Route jeden http-Link und jeden
//    Firmennamen aus dem Browser (ein Mail-Relais mit fremdem Absender).
//  - Absender und Firmenname kommen vom Betrieb, auch beim Mitarbeiter.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import { betriebDerSitzung, werbungErlaubt } from '@/lib/werbeErlaubnisServer';
import { werbeVersandTeile } from '@/lib/werbeAbmeldeLink';
import { normMail, istMail, WERBE_GRUND_TEXT } from '@/lib/werbeErlaubnis';

export const runtime = 'nodejs';

function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const TOKEN = /\/bewerten\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

function basisUrl(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const an = normMail(body?.an);
    const kundeName = (typeof body?.kundeName === 'string' ? body.kundeName : '').trim().slice(0, 120);
    const linkRoh = typeof body?.link === 'string' ? body.link.trim() : '';

    if (!istMail(an)) return NextResponse.json({ error: 'Keine gültige E-Mail.' }, { status: 400 });

    // Der Link muss eine Bewertungsanfrage dieses Betriebs an genau diese Adresse sein.
    let pfad = '';
    try { pfad = new URL(linkRoh).pathname; } catch { pfad = ''; }
    const treffer = TOKEN.exec(pfad);
    if (!treffer) return NextResponse.json({ error: 'Kein gültiger Bewertungs-Link.' }, { status: 400 });
    const token = treffer[1].toLowerCase();
    const { data: anfrage } = await supabase
      .from('bewertungsanfragen').select('id, kunde_email').eq('token', token).maybeSingle();
    if (!anfrage || normMail((anfrage as { kunde_email?: string | null }).kunde_email) !== an) {
      return NextResponse.json({ error: 'Diese Bewertungsanfrage gehört nicht zu dieser Adresse.' }, { status: 400 });
    }

    const betrieb = await betriebDerSitzung(supabase, user.id);
    const admin = createAdminClient();

    const erlaubnis = await werbungErlaubt(admin, betrieb, an);
    if (!erlaubnis.erlaubt) {
      return NextResponse.json({
        error: `Keine E-Mail verschickt: ${WERBE_GRUND_TEXT[erlaubnis.grund]}. Eine Bewertungsbitte per E-Mail ist Werbung und braucht eine Einwilligung.`,
        ohneEinwilligung: true,
      }, { status: 403 });
    }

    const basis = basisUrl(req);
    const teile = werbeVersandTeile(basis, betrieb, an);
    if (!teile) return NextResponse.json({ error: 'Abmeldelink konnte nicht erstellt werden — keine E-Mail verschickt.' }, { status: 500 });

    const brand = await absenderBranding(admin, betrieb);
    const link = `${basis}/bewerten/${token}`;

    const anrede = kundeName ? `Guten Tag ${escapeHtml(kundeName)},` : 'Guten Tag,';
    const inhalt = `
      <p>${anrede}</p>
      <p>vielen Dank für Ihr Vertrauen in <b>${escapeHtml(brand.firma)}</b>. Über eine kurze Bewertung
         würden wir uns sehr freuen — sie dauert keine Minute:</p>
      <p style="margin:22px 0;">
        <a href="${escapeHtml(link)}" style="display:inline-block;background:${brand.akzent};color:#ffffff;font-weight:700;
           text-decoration:none;padding:13px 26px;border-radius:8px;">★ Jetzt bewerten</a>
      </p>
      <p style="color:#5b6b7d;font-size:13px;">Falls der Knopf nicht funktioniert: ${escapeHtml(link)}</p>`;
    const html = kundenMailLayout(brand.firma, brand.akzent, 'Ihre Meinung zählt', inhalt, {
      werbung: true,
      abmeldeLink: teile.abmeldeLink,
      grund: `Sie erhalten diese E-Mail, weil Sie Kunde bei ${brand.firma} sind und eingewilligt haben.`,
    });

    const r = await sendeMail({
      an,
      betreff: `Wie war's bei ${brand.firma}? Ihre kurze Bewertung`,
      html,
      absenderName: brand.firma, betriebId: brand.betriebId,
      antwortAn: brand.email,
      kopfzeilen: teile.kopfzeilen,
      kundenPost: true,
    });
    if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: 500 });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e: unknown) {
    console.error('Bewertung-senden Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Versand fehlgeschlagen.' }, { status: 500 });
  }
}
