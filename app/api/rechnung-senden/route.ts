// ============================================================
// ARGONAUT OS · Bündel 5 · app/api/rechnung-senden/route.ts
// Versendet eine bereits erzeugte E-Rechnung (XRechnung-/ZUGFeRD-XML oder
// ZUGFeRD-PDF) per E-Mail an den Kunden. Die ERZEUGUNG passiert unverändert
// über /api/rechnung-e bzw. /api/rechnung-zugferd im Client; diese Route ist
// bewusst ein reiner, sicherer Mail-Versand: Datei anhängen, abschicken.
//
// Branding: Mail geht im Namen DES KUNDEN raus (kundenMailLayout + Firmenname
// + Firmen-Akzentfarbe), nicht ARGONAUT.
//
// Body: { an, betreff?, nachricht?, rechnungsnummer?, dateiname, inhaltBase64, typ }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import { abrechnungPruefen } from '@/lib/nurGeschaeftsleitung';
import { quellSchreiber } from '@/lib/abrechnungServer';
import { createAdminClient } from '@/lib/supabase-admin';
import { drosselSchluessel, type DrosselRegel } from '@/lib/drossel';

// Paket 175 (Befund M6): die Route war ein Mail-Relais fuer JEDEN Angemeldeten —
// beliebige Adresse, beliebiger Anhang, ohne Deckel. Jetzt: nur wer abrechnen darf
// (Chef oder Mitarbeiter mit „Darf abrechnen"), nur PDF/XML bis 10 MB, und
// hoechstens 300 Rechnungs-Mails je Betrieb und Tag.
const MAX_ANHANG_BYTES = 10 * 1024 * 1024;
const ERLAUBTE_TYPEN = ['application/pdf', 'application/xml', 'text/xml'];
const TAGES_DECKEL: DrosselRegel = { art: 'ziel', max: 300, fensterSek: 86400 };

async function deckelErreicht(betrieb: string): Promise<boolean> {
  try {
    const salz = process.env.ANALYTICS_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'argonaut-os-standardsalz';
    const schluessel = drosselSchluessel('rechnung-senden', TAGES_DECKEL, betrieb, salz);
    if (!schluessel) return false;
    const { data, error } = await createAdminClient().rpc('drossel_zaehlen', {
      p_schluessel: schluessel, p_max: TAGES_DECKEL.max, p_fenster_sek: TAGES_DECKEL.fensterSek,
    });
    if (error) return false; // Zaehler nicht erreichbar: nie aussperren (wie lib/drossel)
    return data === false;
  } catch {
    return false;
  }
}

export const runtime = 'nodejs';

function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function istMail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function POST(req: NextRequest) {
  try {
    // Nur eingeloggte Nutzer dürfen versenden.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });
    // „Darf abrechnen" (27.09.26): Absender (Firmenname, Antwortadresse, Farbe) ist
    // immer der BETRIEB. Schickte ein Mitarbeiter, stand bisher „Ihr Dienstleister"
    // ohne Antwortadresse in der Mail — sein eigenes Profil hat keine Firmendaten.
    const abr = await abrechnungPruefen(supabase, user.id, 'Rechnungen verschickt die Geschäftsleitung oder wer das Recht „Darf abrechnen" hat.');
    if (!abr.ok) return NextResponse.json({ error: abr.fehler }, { status: 403 });
    const mitarbeiter = abr.mitarbeiter;
    const absenderId = abr.betrieb;

    const body = await req.json().catch(() => ({}));
    const an = typeof body?.an === 'string' ? body.an.trim() : '';
    const inhaltBase64 = typeof body?.inhaltBase64 === 'string' ? body.inhaltBase64 : '';
    const dateiname = (typeof body?.dateiname === 'string' && body.dateiname.trim()) || 'Rechnung';
    const typ = typeof body?.typ === 'string' ? body.typ : 'application/octet-stream';
    const nummer = typeof body?.rechnungsnummer === 'string' ? body.rechnungsnummer : '';
    const nachricht = typeof body?.nachricht === 'string' ? body.nachricht : '';

    if (!istMail(an)) return NextResponse.json({ error: 'Keine gültige Empfänger-E-Mail.' }, { status: 400 });
    if (!inhaltBase64) return NextResponse.json({ error: 'Keine Datei zum Versenden übergeben.' }, { status: 400 });

    if (!ERLAUBTE_TYPEN.includes(typ)) return NextResponse.json({ error: 'Nur PDF- oder XML-Rechnungen können versendet werden.' }, { status: 400 });

    let anhangBuffer: Buffer;
    try {
      anhangBuffer = Buffer.from(inhaltBase64, 'base64');
    } catch {
      return NextResponse.json({ error: 'Anhang konnte nicht gelesen werden.' }, { status: 400 });
    }
    if (anhangBuffer.length === 0 || anhangBuffer.length > MAX_ANHANG_BYTES) {
      return NextResponse.json({ error: 'Der Anhang ist leer oder größer als 10 MB.' }, { status: 400 });
    }
    if (await deckelErreicht(absenderId)) {
      return NextResponse.json({ error: 'Heute wurden schon sehr viele Rechnungen verschickt. Bitte versuchen Sie es morgen erneut oder melden Sie sich beim Support.' }, { status: 429 });
    }

    const betreff = (typeof body?.betreff === 'string' && body.betreff.trim())
      || `Ihre Rechnung${nummer ? ' ' + nummer : ''}`;

    const inhalt = `
      <p>Guten Tag,</p>
      <p>anbei erhalten Sie Ihre Rechnung${nummer ? ` <b>${escapeHtml(nummer)}</b>` : ''} als E-Rechnung im Anhang.</p>
      ${nachricht ? `<p>${escapeHtml(nachricht)}</p>` : ''}
      <p>Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
      <p>Vielen Dank.</p>`;

    const brand = await absenderBranding(quellSchreiber(supabase, { mitarbeiter }), absenderId);
    const html = kundenMailLayout(brand.firma, brand.akzent, 'Ihre Rechnung', inhalt);

    const r = await sendeMail({
      an,
      betreff,
      html,
      absenderName: brand.firma,
      antwortAn: brand.email,
      anhaenge: [{ dateiname, inhalt: anhangBuffer, typ }],
    });
    if (!r.ok) return NextResponse.json({ error: r.fehler }, { status: 500 });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e: unknown) {
    console.error('Rechnung-senden Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ error: 'Unerwarteter Fehler beim Versand.' }, { status: 500 });
  }
}
