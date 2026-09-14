import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';
import {
  anrede, abmeldenUrl, seitenUrl, formatiereTermin, dauerText, endetAm,
  bestaetigungVerfallen, kannAnmelden,
  STATUS_AKTIV, STATUS_ABGEMELDET, STATUS_UNBESTAETIGT, TERMIN_ABGESAGT,
} from '@/lib/webinar';
import { icsAnhang } from '@/lib/ics';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/webinar-bestaetigen   (Paket 5 · Punkt 3.13)
//
// ÖFFENTLICH. GET ?token=... — der Klick aus der Bestaetigungsmail.
// Die Anmeldung wird bestaetigt und der Platz ist verbindlich reserviert.
//
// ▄▄▄ HIER STEHT KEIN ZUGANGSLINK ▄▄▄
// Die Bestaetigungsmail nennt Datum und Dauer, mehr nicht. Der Zugangslink
// kommt erst mit der Erinnerung 24 Stunden vorher. Ein Link, der Wochen im
// Postfach liegt, wird weitergereicht.
//
// ▄▄▄ DER PLATZ WIRD BEIM BESTAETIGEN NOCHMAL GEPRUEFT ▄▄▄
// Zwischen Eintragung und Klick koennen Tage liegen. In der Zeit kann der
// Termin ausgebucht, abgesagt oder vorbei sein. Wer erst beim Erinnerungs-
// Cron merkt, dass er gar keinen Platz hat, erfaehrt es zu spaet.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Umgeht RLS (der Klickende ist nicht eingeloggt). Alles haengt am Token;
// owner_user_id und Branding kommen IMMER aus der gefundenen Zeile.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function ursprung(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

type AnmeldungRow = {
  id: string; owner_user_id: string; webinar_id: string; termin_id: string;
  email: string; name: string | null; status: string;
  abmelde_token: string | null; erstellt_am: string;
};
type WebinarRow = { id: string; titel: string; referent: string; key: string };
type TerminRow = {
  id: string; beginnt_am: string | null; dauer_minuten: number;
  kapazitaet: number | null; status: string; zugang_url: string | null;
};

export async function GET(req: Request) {
  const basis = ursprung(req);
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  const zurueck = (key: string | null, zustand: string) =>
    NextResponse.redirect(key ? `${seitenUrl(basis, key)}?${zustand}=1` : `${basis}/?${zustand}=1`);

  if (!token) return zurueck(null, 'fehler');

  try {
    const db = admin();
    const { data } = await db
      .from('webinar_anmeldung')
      .select('id, owner_user_id, webinar_id, termin_id, email, name, status, abmelde_token, erstellt_am')
      .eq('token', token)
      .maybeSingle();
    const a = (data as AnmeldungRow | null) ?? null;
    if (!a) return zurueck(null, 'fehler');

    const { data: wRoh } = await db
      .from('webinare').select('id, titel, referent, key').eq('id', a.webinar_id).maybeSingle();
    const w = (wRoh as WebinarRow | null) ?? null;
    const key = w?.key ?? null;

    // Wer sich abgemeldet hat, kommt ueber einen alten Link NICHT zurueck.
    if (a.status === STATUS_ABGEMELDET) return zurueck(key, 'abgemeldet');
    // Zweiter Klick auf denselben Link: freundlich, aber keine zweite Mail.
    if (a.status === STATUS_AKTIV) return zurueck(key, 'bestaetigt');
    if (bestaetigungVerfallen(a.erstellt_am, new Date().toISOString())) return zurueck(key, 'verfallen');
    if (!w) return zurueck(null, 'fehler');

    const { data: tRoh } = await db
      .from('webinar_termin')
      .select('id, beginnt_am, dauer_minuten, kapazitaet, status, zugang_url')
      .eq('id', a.termin_id)
      .maybeSingle();
    const t = (tRoh as TerminRow | null) ?? null;
    if (!t) return zurueck(key, 'fehler');
    if (String(t.status) === TERMIN_ABGESAGT) return zurueck(key, 'abgesagt');

    // Platz erneut pruefen — siehe Dateikopf. Die eigene, noch unbestaetigte
    // Zeile zaehlt bei der Belegung mit, deshalb wird sie hier abgezogen.
    const { data: belegtRoh } = await db
      .from('webinar_anmeldung')
      .select('id, status')
      .eq('termin_id', t.id)
      .neq('status', STATUS_ABGEMELDET)
      .limit(5000);
    const belegtOhneMich = Math.max(0, ((belegtRoh ?? []) as unknown[]).length - 1);
    const moeglich = kannAnmelden(t, belegtOhneMich, new Date().toISOString());
    if (!moeglich.ok) return zurueck(key, t.beginnt_am && new Date(t.beginnt_am).getTime() <= Date.now() ? 'vorbei' : 'ausgebucht');

    const jetzt = new Date().toISOString();
    const { error: updateFehler } = await db.from('webinar_anmeldung').update({
      status: STATUS_AKTIV,
      bestaetigt_am: jetzt,
    }).eq('id', a.id).eq('status', STATUS_UNBESTAETIGT);
    if (updateFehler) return zurueck(key, 'fehler');

    const { data: profil } = await db
      .from('profiles').select('firma_name, firma_akzentfarbe, firma_email').eq('id', a.owner_user_id).maybeSingle();
    const p = (profil ?? {}) as { firma_name?: string | null; firma_akzentfarbe?: string | null; firma_email?: string | null };
    const firma = (p.firma_name || '').trim() || 'Ihr Ansprechpartner';

    const terminText = formatiereTermin(t.beginnt_am);
    const dauer = dauerText(t.dauer_minuten);
    const abUrl = abmeldenUrl(basis, a.abmelde_token || '');

    const inhalt = `
      <p style="margin:0 0 12px;">${escapeHtml(anrede(a.name))}</p>
      <p style="margin:0 0 12px;">Ihr Platz ist reserviert. Hier die Eckdaten:</p>
      <table style="margin:0 0 16px;border-collapse:collapse;font-size:15px;">
        <tr><td style="padding:4px 16px 4px 0;color:#8a94a6;">Thema</td><td style="padding:4px 0;font-weight:700;">${escapeHtml(w.titel)}</td></tr>
        ${terminText ? `<tr><td style="padding:4px 16px 4px 0;color:#8a94a6;">Termin</td><td style="padding:4px 0;font-weight:700;">${escapeHtml(terminText)}</td></tr>` : ''}
        ${dauer ? `<tr><td style="padding:4px 16px 4px 0;color:#8a94a6;">Dauer</td><td style="padding:4px 0;">${escapeHtml(dauer)}</td></tr>` : ''}
        ${w.referent ? `<tr><td style="padding:4px 16px 4px 0;color:#8a94a6;">Referent</td><td style="padding:4px 0;">${escapeHtml(w.referent)}</td></tr>` : ''}
      </table>
      <p style="margin:0 0 12px;"><b>Den Zugangslink schicken wir Ihnen einen Tag vorher</b> und noch einmal eine Stunde vor Beginn — Sie müssen sich also nichts notieren.</p>
      <p style="margin:0;">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
      <p style="margin:26px 0 0;border-top:1px solid #eeeeee;padding-top:14px;color:#8a94a6;font-size:12px;line-height:1.5;">
        Sie erhalten diese E-Mail, weil Sie sich für dieses Webinar angemeldet haben.
        <a href="${abUrl}" style="color:#8a94a6;">Hier können Sie sich jederzeit mit einem Klick abmelden.</a>
      </p>`;

    // Kalendereintrag zum Anklicken. Die UID haengt an DIESER Anmeldung und
    // bleibt stabil — die Erinnerungsmails schicken denselben Eintrag noch
    // einmal mit hoeherer Folgenummer, und der Kalender ERSETZT ihn dann,
    // statt einen zweiten anzulegen.
    const kalender = icsAnhang({
      uid: `webinar-${a.id}@argonaut-os.com`,
      beginn: t.beginnt_am,
      ende: endetAm(t.beginnt_am, t.dauer_minuten),
      titel: w.titel,
      beschreibung: w.referent ? `Referent: ${w.referent}` : '',
      ort: t.zugang_url || '',
      organisatorName: firma,
      organisatorMail: (p.firma_email || '').trim() || undefined,
      sequenz: 0,
    });

    try {
      await sendeMail({
        an: a.email,
        betreff: `Anmeldung bestätigt: ${w.titel}`,
        html: kundenMailLayout(firma, p.firma_akzentfarbe, '', inhalt),
        absenderName: firma,
        antwortAn: (p.firma_email || '').trim() || undefined,
        ...(kalender ? { anhaenge: [kalender] } : {}),
      });
      // Protokollzeile, damit die Bestaetigung in der Uebersicht auftaucht.
      await db.from('webinar_versand').insert({
        owner_user_id: a.owner_user_id, anmeldung_id: a.id, termin_id: t.id,
        art: 'bestaetigung', stufe: 0, betreff: `Anmeldung bestätigt: ${w.titel}`,
      });
    } catch (e) {
      // Die Bestaetigung steht bereits in der Datenbank. Scheitert nur der
      // Versand, ist der Platz trotzdem reserviert — der Angemeldete sieht
      // die Seite mit dem Hinweis und bekommt die Erinnerungen normal.
      console.error('Webinar-Bestaetigungsmail fehlgeschlagen', a.id, e instanceof Error ? e.message : e);
    }

    return zurueck(key, 'bestaetigt');
  } catch (e: unknown) {
    console.error('webinar-bestaetigen fehlgeschlagen:', e instanceof Error ? e.message : e);
    return zurueck(null, 'fehler');
  }
}
