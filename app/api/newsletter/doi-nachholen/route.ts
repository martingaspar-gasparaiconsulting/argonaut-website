import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { modulRechtPruefen } from '@/lib/modulRecht';
import { sendeMail, absenderBranding } from '@/lib/mail';
import { optinBestaetigenUrl } from '@/lib/newsletter';
import { werbeFaktenLaden } from '@/lib/werbeErlaubnisServer';
import { entscheideWerbung, istMail, normMail } from '@/lib/werbeErlaubnis';
import {
  pruefeEinwilligungsAngabe, doiNachholenErlaubt, angabeAmEintrag, DOI_GRUND_TEXT,
  doiNachholenBetreff, doiNachholenHtml, DOI_TAGESDECKEL, type DoiAbo,
} from '@/lib/doiNachholen';

// ============================================================================
// ARGONAUT OS · app/api/newsletter/doi-nachholen/route.ts  (Paket 199 · D1)
//
// POST { id, einwilligung_quelle?, einwilligung_am? }
//   Schickt einer VON HAND eingetragenen Newsletter-Adresse die Bestätigungs-
//   Mail (Double-Opt-in). Erst der Klick der Person macht sie aktiv — über die
//   bestehende Route /api/oeffentlich/optin-bestaetigen.
//
// Regeln (lib/doiNachholen.ts): Quelle + Datum der Einwilligung Pflicht und
// danach fest; nie an Abgemeldete/Widersprochene; höchstens 2 Mails, 7 Tage
// Abstand; Tagesdeckel je Betrieb. Modulrecht Marketing „ändern".
// Schreiben nur mit dem Server-Schlüssel — SQL p199 sperrt die Nachweis-
// Spalten für den Browser.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';

function antwort(ok: boolean, text: string, status = 200, extra: Record<string, unknown> = {}) {
  return NextResponse.json(ok ? { ok: true, hinweis: text, ...extra } : { ok: false, error: text, ...extra }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const recht = await modulRechtPruefen(supabase, user?.id ?? null, 'marketing', 'aendern');
    if (!recht.ok) return antwort(false, recht.fehler, recht.status);
    const betrieb = recht.betrieb;

    const body = await req.json().catch(() => null);
    const id = String(body?.id ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return antwort(false, 'Kein Eintrag angegeben.', 400);

    const db = createAdminClient();
    const { data: roh, error } = await db
      .from('newsletter_abonnenten')
      .select('id, owner_user_id, email, name, status, quelle, bestaetigt_am, abgemeldet_am, einwilligung_quelle, einwilligung_am, doi_gesendet_am, doi_anzahl')
      .eq('id', id)
      .eq('owner_user_id', betrieb)
      .maybeSingle();
    if (error) {
      // Spalten fehlen = SQL p199 noch nicht gelaufen.
      if (/einwilligung_quelle|doi_gesendet_am|doi_anzahl|column/i.test(error.message)) {
        return antwort(false, 'Diese Funktion wird gerade eingerichtet (SQL p199 fehlt).', 503);
      }
      console.error('doi-nachholen lesen:', error.message);
      return antwort(false, 'Eintrag konnte nicht geladen werden.', 500);
    }
    const abo = roh as (DoiAbo & { id: string; email: string; name: string | null }) | null;
    if (!abo) return antwort(false, 'Eintrag nicht gefunden.', 404);

    const email = normMail(abo.email);
    if (!istMail(email)) return antwort(false, 'Die E-Mail-Adresse ist ungültig.', 400);

    // Quelle + Datum: am Eintrag (dann fest) oder neu aus der Anfrage.
    let quelle = String(abo.einwilligung_quelle ?? '');
    let datum = String(abo.einwilligung_am ?? '').slice(0, 10);
    const schonDa = angabeAmEintrag(abo);
    if (!schonDa) {
      const a = pruefeEinwilligungsAngabe(body?.einwilligung_quelle, body?.einwilligung_am);
      if (!a.ok) return antwort(false, a.fehler, 400);
      quelle = a.quelle;
      datum = a.datum;
    }

    const grund = doiNachholenErlaubt(abo, true);
    if (grund !== 'ok') return antwort(false, DOI_GRUND_TEXT[grund], 409);

    // Widerspruch / Sperrliste aus ALLEN Kanälen (Paket 173).
    const fakten = await werbeFaktenLaden(db, betrieb, [email]);
    if (!fakten) return antwort(false, 'Die Einwilligung konnte gerade nicht geprüft werden. Bitte später erneut versuchen.', 503);
    if (entscheideWerbung(email, fakten).grund === 'widersprochen') {
      return antwort(false, 'Diese Person hat der Werbung widersprochen — eine Bestätigungs-Mail ist nicht erlaubt.', 409);
    }

    // Tagesdeckel je Betrieb.
    const seit = new Date(Date.now() - 86400000).toISOString();
    const { count } = await db
      .from('newsletter_abonnenten')
      .select('id', { count: 'exact', head: true })
      .eq('owner_user_id', betrieb)
      .gte('doi_gesendet_am', seit);
    if ((count ?? 0) >= DOI_TAGESDECKEL) {
      return antwort(false, `Heute wurden schon ${DOI_TAGESDECKEL} Bestätigungs-Mails gesendet. Bitte morgen weitermachen.`, 429);
    }

    // Erst speichern (Nachweis), dann senden. Die Bedingung auf doi_anzahl
    // verhindert, dass ein Doppelklick zwei Mails auslöst.
    const token = randomUUID();
    const jetzt = new Date().toISOString();
    const vorher = Math.max(0, Math.trunc(Number(abo.doi_anzahl) || 0));
    const felder: Record<string, unknown> = {
      status: 'unbestaetigt',
      bestaetigt_token: token,
      bestaetigt_am: null,
      doi_gesendet_am: jetzt,
      doi_anzahl: vorher + 1,
    };
    if (!schonDa) { felder.einwilligung_quelle = quelle; felder.einwilligung_am = datum; }
    let upd = db.from('newsletter_abonnenten').update(felder).eq('id', abo.id).eq('owner_user_id', betrieb);
    upd = vorher === 0 ? upd.or('doi_anzahl.is.null,doi_anzahl.eq.0') : upd.eq('doi_anzahl', vorher);
    const { data: geaendert, error: uErr } = await upd.select('id');
    if (uErr) {
      console.error('doi-nachholen speichern:', uErr.message);
      return antwort(false, 'Speichern fehlgeschlagen.', 500);
    }
    if (!geaendert || (geaendert as unknown[]).length === 0) {
      return antwort(false, 'Der Eintrag wurde gerade schon bearbeitet. Bitte die Seite neu laden.', 409);
    }

    const brand = await absenderBranding(db, betrieb);
    const r = await sendeMail({
      an: email,
      betreff: doiNachholenBetreff(brand.firma),
      html: doiNachholenHtml({
        firma: brand.firma, url: optinBestaetigenUrl(BASIS_URL, token), akzent: brand.akzent,
        name: abo.name, quelle, datum,
      }),
      absenderName: brand.firma,
      antwortAn: brand.email,
      kundenPost: true,
    });
    if (!r.ok) {
      console.error('doi-nachholen senden:', r.fehler);
      // Nicht gesendet = nicht gezählt. Quelle + Datum bleiben (Angabe des Betriebs).
      await db.from('newsletter_abonnenten')
        .update({ status: abo.status ?? 'aktiv', bestaetigt_token: null, doi_gesendet_am: abo.doi_gesendet_am ?? null, doi_anzahl: vorher })
        .eq('id', abo.id).eq('owner_user_id', betrieb).eq('bestaetigt_token', token);
      return antwort(false, 'Die Mail konnte nicht gesendet werden. Bitte die Adresse prüfen und später erneut versuchen.', 502);
    }
    return antwort(true, `Bestätigungs-Mail an ${email} gesendet. Die Adresse wird aktiv, sobald die Person bestätigt.`);
  } catch (e) {
    console.error('doi-nachholen:', e instanceof Error ? e.message : e);
    return antwort(false, 'Interner Fehler.', 500);
  }
}
