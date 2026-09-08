import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, sichereFarbe } from '@/lib/newsletter';
import {
  anrede, setzePlatzhalter, faelligAm, abmeldenUrl, seitenUrl,
  bestaetigungVerfallen, STATUS_AKTIV, STATUS_ABGEMELDET,
} from '@/lib/freebie';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/freebie-bestaetigen   (D3)
//
// ÖFFENTLICH. GET ?token=... — der Klick aus der Bestaetigungsmail.
// Hier passiert alles auf einmal: Anmeldung bestaetigen, die Datei ausliefern
// und den ersten Schritt der Strecke terminieren.
//
// DIE DATEI GEHT ALS SIGNIERTE ADRESSE RAUS, NICHT ALS ANHANG:
// Ein 20-MB-Anhang laesst die Mail bei vielen Anbietern im Spam landen oder
// wird ganz abgewiesen. Die Adresse gilt 30 Tage — lang genug, um sie in Ruhe
// zu oeffnen, kurz genug, dass sie nicht ewig weitergereicht wird.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Umgeht RLS (der Klickende ist nicht eingeloggt). Alles haengt am Token;
// owner_user_id und Branding kommen IMMER aus der gefundenen Zeile.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wie lange die Adresse zur Datei gilt (Sekunden) — 30 Tage. */
const LINK_SEKUNDEN = 60 * 60 * 24 * 30;
const BUCKET = 'freebies';

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

type LeadRow = {
  id: string; owner_user_id: string; freebie_id: string; email: string;
  name: string | null; status: string; abmelde_token: string;
  bestaetigt_am: string | null; erstellt_am: string;
};
type FreebieRow = {
  id: string; titel: string; datei_pfad: string | null; datei_name: string | null;
  oeffentlich_key: string;
};
type MailRow = { schritt: number; tag: number; aktiv: boolean };

export async function GET(req: Request) {
  const basis = ursprung(req);
  const token = (new URL(req.url).searchParams.get('token') || '').trim();
  const zurueck = (key: string | null, zustand: string) =>
    NextResponse.redirect(key ? `${seitenUrl(basis, key)}?${zustand}=1` : `${basis}/?${zustand}=1`);

  if (!token) return zurueck(null, 'fehler');

  try {
    const db = admin();
    const { data } = await db
      .from('freebie_lead')
      .select('id, owner_user_id, freebie_id, email, name, status, abmelde_token, bestaetigt_am, erstellt_am')
      .eq('token', token)
      .maybeSingle();
    const l = (data as LeadRow | null) ?? null;
    if (!l) return zurueck(null, 'fehler');

    const { data: fRoh } = await db
      .from('freebie')
      .select('id, titel, datei_pfad, datei_name, oeffentlich_key')
      .eq('id', l.freebie_id)
      .maybeSingle();
    const f = (fRoh as FreebieRow | null) ?? null;
    const key = f?.oeffentlich_key ?? null;

    // Wer sich abgemeldet hat, kommt ueber einen alten Link NICHT zurueck.
    if (l.status === STATUS_ABGEMELDET) return zurueck(key, 'abgemeldet');
    // Zweiter Klick auf denselben Link: freundlich, aber keine zweite Mail.
    if (l.status === STATUS_AKTIV) return zurueck(key, 'bestaetigt');
    if (bestaetigungVerfallen(l.erstellt_am, new Date().toISOString())) return zurueck(key, 'verfallen');
    if (!f) return zurueck(null, 'fehler');

    // ---- 1) Termin fuer den ersten Streckenschritt --------------------------
    const jetztIso = new Date().toISOString();
    const { data: mailsRoh } = await db
      .from('freebie_mail')
      .select('schritt, tag, aktiv')
      .eq('freebie_id', f.id)
      .eq('aktiv', true)
      .order('schritt', { ascending: true });
    const mails = ((mailsRoh ?? []) as MailRow[]);
    const ersterTag = mails.length > 0 ? mails[0].tag : null;

    await db.from('freebie_lead').update({
      status: STATUS_AKTIV,
      bestaetigt_am: jetztIso,
      schritt: 0,
      // Ohne aktive Strecke bleibt der Termin leer — und der Cron ruehrt
      // die Zeile nie an. Genau so soll es sein.
      faellig_am: ersterTag == null ? null : faelligAm(jetztIso, ersterTag),
    }).eq('id', l.id);

    // ---- 2) Branding und Datei --------------------------------------------
    const { data: profil } = await db
      .from('profiles').select('firma_name, firma_akzentfarbe, firma_email').eq('id', l.owner_user_id).maybeSingle();
    const p = (profil ?? {}) as { firma_name?: string | null; firma_akzentfarbe?: string | null; firma_email?: string | null };
    const firma = (p.firma_name || '').trim() || 'Ihr Ansprechpartner';
    const titel = setzePlatzhalter(f.titel, { firma });

    let dateiUrl = '';
    if (f.datei_pfad) {
      const { data: signiert } = await db.storage.from(BUCKET)
        .createSignedUrl(f.datei_pfad, LINK_SEKUNDEN, { download: f.datei_name || 'ratgeber.pdf' });
      dateiUrl = signiert?.signedUrl || '';
    }

    const abUrl = abmeldenUrl(basis, l.abmelde_token);
    const akzent = sichereFarbe(p.firma_akzentfarbe);

    const knopf = dateiUrl
      ? `<p style="margin:22px 0;"><a href="${dateiUrl}" style="display:inline-block;background:${akzent};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;">${escapeHtml(titel)} herunterladen</a></p>
         <p style="margin:0 0 12px;color:#8a94a6;font-size:13px;">Der Link gilt 30 Tage. Speichern Sie die Datei am besten gleich ab.</p>`
      : `<p style="margin:0 0 12px;">Die Datei schicken wir Ihnen gleich nach — melden Sie sich gern, wenn Sie nichts hören.</p>`;

    const inhalt = `
      <p style="margin:0 0 12px;">${escapeHtml(anrede(l.name))}</p>
      <p style="margin:0 0 12px;">danke für Ihre Bestätigung. Hier ist Ihr Exemplar:</p>
      ${knopf}
      <p style="margin:0;">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
      <p style="margin:26px 0 0;border-top:1px solid #eeeeee;padding-top:14px;color:#8a94a6;font-size:12px;line-height:1.5;">
        Sie erhalten in den nächsten Wochen noch einige wenige E-Mails zum Thema.
        <a href="${abUrl}" style="color:#8a94a6;">Hier können Sie sich jederzeit mit einem Klick abmelden.</a>
      </p>`;

    try {
      await sendeMail({
        an: l.email,
        betreff: `Ihr Exemplar: ${titel}`,
        html: kundenMailLayout(firma, p.firma_akzentfarbe, '', inhalt),
        absenderName: firma,
        antwortAn: (p.firma_email || '').trim() || undefined,
      });
    } catch (e) {
      // Die Bestaetigung steht bereits in der Datenbank. Scheitert nur der
      // Versand, ist der Interessent trotzdem eingetragen — er sieht die
      // Seite mit dem Hinweis und kann sich melden.
      console.error('Freebie-Auslieferung fehlgeschlagen', l.id, e instanceof Error ? e.message : e);
    }

    return zurueck(key, 'bestaetigt');
  } catch (e: unknown) {
    console.error('freebie-bestaetigen fehlgeschlagen:', e instanceof Error ? e.message : e);
    return zurueck(null, 'fehler');
  }
}
