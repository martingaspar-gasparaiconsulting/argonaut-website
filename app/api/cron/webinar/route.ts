import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, absenderBranding, kundenMailLayout } from '@/lib/mail';
import { escapeHtml, textZuHtml } from '@/lib/newsletter';
import { werbeDeckel, tagesBudget, WERBE_ANTEIL, begruendung } from '@/lib/mailBudget';
import {
  erinnerungFaellig, nachbereitungFaellig, nachbereitungFuer,
  setzePlatzhalter, anrede, abmeldenUrl, formatiereTermin, dauerText, endetAm,
  ERINNERUNGEN, STATUS_AKTIV, TERMIN_GEPLANT,
} from '@/lib/webinar';
import { icsAnhang } from '@/lib/ics';

// ============================================================================
// ARGONAUT OS · /api/cron/webinar   (Paket 5 · Punkt 3.13)
//
// Laeuft alle 15 Minuten. Zwei Aufgaben in einem Durchgang:
//   1) ERINNERUNGEN vor dem Termin   (7 Tage · 1 Tag · 1 Stunde)
//   2) NACHBEREITUNG nach dem Termin (Aufzeichnung + Angebot)
//
// ▄▄▄ DIE WICHTIGSTE ENTSCHEIDUNG DIESER DATEI ▄▄▄
// Erinnerungen sind BETRIEBSPOST, die Nachbereitung ist WERBUNG.
// Wer sich angemeldet hat, erwartet die Erinnerung — sie ist die Lieferung
// des Bestellten, wie eine Terminbestaetigung. Deshalb laeuft sie NICHT gegen
// den Werbe-Deckel aus lib/mailBudget.ts: ein Webinar findet EINMAL statt,
// und eine Erinnerung, die wegen eines Deckels einen Tag spaeter kommt, ist
// wertlos. Die Nachbereitung dagegen kann warten und wird gedeckelt.
// Dieselbe Trennung wie in lib/automation.ts (istWerbung) seit dem 13.09.
//
// ▄▄▄ WERBEWIDERSPRUCH GILT AUCH HIER ▄▄▄
// Vor jeder Nachbereitung wird geprueft, ob die Adresse in public.kontakte
// einen werbe_widerspruch_am traegt. Der Abmeldelink der Rueckhol-Strecke
// verspricht dem Empfaenger, dass sein Widerspruch „fuer die Werbung des
// Betriebs insgesamt" gilt — ohne diese Pruefung waere das Versprechen
// gebrochen. Auf die ERINNERUNGEN wirkt der Widerspruch bewusst nicht: er
// betrifft Werbung, nicht einen Termin, den der Empfaenger selbst gebucht hat.
//
// ▄▄▄ DER PROTOKOLL-EINTRAG KOMMT VOR DEM VERSAND ▄▄▄
// Bricht der Lauf zwischen Versand und Protokoll ab, bekaeme der Empfaenger
// dieselbe Mail beim naechsten Durchgang noch einmal — und der laeuft schon in
// 15 Minuten. Der eindeutige Schluessel (anmeldung_id, art, stufe) macht den
// Eintrag zur Sperre.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄
// Umgeht RLS. Jede Zeile traegt ihre eigene owner_user_id, und Branding wird
// JE ZEILE geladen. Wer hier die Mail eines Betriebs an den Empfaenger eines
// anderen schickt, verschickt eine Datenpanne. tsc faengt das NICHT.
//
// Ausloesung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=. ?probe=1 = trocken.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** So weit voraus wird nach Terminen gesucht — die erste Erinnerung liegt 7 Tage davor. */
const VORLAUF_TAGE = 8;
/** So weit zurueck — die Nachbereitung hat ein Fenster von 3 Tagen nach dem Ende. */
const RUECKBLICK_TAGE = 4;
const MAX_TERMINE = 200;
const MAX_ANMELDUNGEN = 2000;

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function erlaubt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}

function ursprung(req: Request): string {
  const gesetzt = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  if (gesetzt) return gesetzt.replace(/\/+$/, '');
  try { return new URL(req.url).origin; } catch { return ''; }
}

/**
 * Deckel fuer die ERINNERUNGEN. Sie laufen nicht gegen den Werbe-Anteil,
 * brauchen aber trotzdem eine Obergrenze: sonst kann ein einziges grosses
 * Webinar das Tageskontingent aufbrauchen und die Mahnungen fallen aus.
 * Genommen wird der Betriebspost-Anteil eines Tages — nicht durch die Zahl der
 * Laeufe geteilt, weil Erinnerungen sich an einem Termin ballen.
 * Bei echtem Volumen ist Resend Pro noetig (Punkt 1.2).
 */
function erinnerungsDeckel(budget: number): number {
  return Math.max(20, Math.floor(budget * (1 - WERBE_ANTEIL)));
}

type TerminRow = {
  id: string; owner_user_id: string; webinar_id: string;
  beginnt_am: string | null; dauer_minuten: number; kapazitaet: number | null;
  zugang_url: string | null; status: string;
};
type AnmeldungRow = {
  id: string; owner_user_id: string; webinar_id: string; termin_id: string;
  email: string; name: string | null; status: string; teilnahme: string;
  nachbereitung_am: string | null; abmelde_token: string | null;
};
type WebinarRow = { id: string; titel: string; referent: string; aufzeichnung_url: string | null };
type VersandRow = { anmeldung_id: string; art: string; stufe: number };

// Je eine Zeichenkette, nicht zusammengesetzt (siehe tests/selectLiteral.test.mjs).
const TERMIN_SPALTEN = 'id, owner_user_id, webinar_id, beginnt_am, dauer_minuten, kapazitaet, zugang_url, status';
const ANMELDUNG_SPALTEN = 'id, owner_user_id, webinar_id, termin_id, email, name, status, teilnahme, nachbereitung_am, abmelde_token';

async function lauf(req: Request) {
  if (!erlaubt(req)) return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });
  const probe = new URL(req.url).searchParams.get('probe') === '1';

  const db = service();
  const jetzt = new Date();
  const jetztIso = jetzt.toISOString();
  const basis = ursprung(req);
  const budget = tagesBudget(process.env.MAIL_TAGESBUDGET);
  const deckelWerbung = werbeDeckel(process.env.MAIL_TAGESBUDGET);
  const deckelErinnerung = erinnerungsDeckel(budget);

  const von = new Date(jetzt.getTime() - RUECKBLICK_TAGE * 86_400_000).toISOString();
  const bis = new Date(jetzt.getTime() + VORLAUF_TAGE * 86_400_000).toISOString();

  const { data: termineRoh, error } = await db
    .from('webinar_termin')
    .select(TERMIN_SPALTEN)
    .eq('status', TERMIN_GEPLANT)
    .not('beginnt_am', 'is', null)
    .gte('beginnt_am', von)
    .lte('beginnt_am', bis)
    .order('beginnt_am', { ascending: true })
    .limit(MAX_TERMINE);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const termine = (termineRoh ?? []) as TerminRow[];
  if (termine.length === 0) {
    return NextResponse.json({ ok: true, termine: 0, erinnert: 0, nachbereitet: 0, hinweis: 'Kein Termin im Zeitfenster.' });
  }
  const terminJeId = new Map(termine.map((t) => [t.id, t]));

  const { data: anmeldungenRoh } = await db
    .from('webinar_anmeldung')
    .select(ANMELDUNG_SPALTEN)
    .in('termin_id', termine.map((t) => t.id))
    .eq('status', STATUS_AKTIV)
    .limit(MAX_ANMELDUNGEN);
  const anmeldungen = (anmeldungenRoh ?? []) as AnmeldungRow[];
  if (anmeldungen.length === 0) {
    return NextResponse.json({ ok: true, termine: termine.length, geprueft: 0, erinnert: 0, nachbereitet: 0 });
  }

  // Schon verschickte Stufen je Anmeldung.
  const { data: versandRoh } = await db
    .from('webinar_versand')
    .select('anmeldung_id, art, stufe')
    .in('anmeldung_id', anmeldungen.map((a) => a.id))
    .eq('art', 'erinnerung')
    .limit(20000);
  const gesendetJeAnmeldung = new Map<string, number[]>();
  for (const v of ((versandRoh ?? []) as VersandRow[])) {
    const liste = gesendetJeAnmeldung.get(v.anmeldung_id) ?? [];
    liste.push(v.stufe);
    gesendetJeAnmeldung.set(v.anmeldung_id, liste);
  }

  // Webinar-Stammdaten je Zeile.
  const webinarIds = Array.from(new Set(anmeldungen.map((a) => a.webinar_id)));
  const { data: webinareRoh } = await db
    .from('webinare').select('id, titel, referent, aufzeichnung_url').in('id', webinarIds);
  const webinarJeId = new Map(((webinareRoh ?? []) as WebinarRow[]).map((w) => [w.id, w]));

  // Werbewiderspruch: nur fuer die Nachbereitung nachschlagen. Siehe Dateikopf.
  const widerspruch = new Set<string>();
  const mailsFuerPruefung = Array.from(new Set(anmeldungen.map((a) => a.email.toLowerCase())));
  if (mailsFuerPruefung.length > 0) {
    const { data: kontakteRoh } = await db
      .from('kontakte')
      .select('owner_user_id, email, werbe_widerspruch_am')
      .in('email', mailsFuerPruefung)
      .not('werbe_widerspruch_am', 'is', null)
      .limit(5000);
    for (const k of ((kontakteRoh ?? []) as { owner_user_id: string; email: string | null }[])) {
      widerspruch.add(`${k.owner_user_id}|${String(k.email ?? '').toLowerCase()}`);
    }
  }

  const brandingCache = new Map<string, { firma: string; akzent: string; email: string | undefined }>();
  async function brandingVon(ownerId: string) {
    if (!brandingCache.has(ownerId)) brandingCache.set(ownerId, await absenderBranding(db, ownerId));
    return brandingCache.get(ownerId)!;
  }

  let erinnert = 0, nachbereitet = 0, uebersprungen = 0, gesperrt = 0, fehler = 0;
  const wuerde: { email: string; art: string; stufe: number }[] = [];

  for (const a of anmeldungen) {
    const t = terminJeId.get(a.termin_id);
    const w = webinarJeId.get(a.webinar_id);
    if (!t || !w) { uebersprungen++; continue; }

    const e = erinnerungFaellig(a, t, gesendetJeAnmeldung.get(a.id) ?? [], jetztIso);

    // ---------------------------------------------------------------- Erinnerung
    if (e.tun === 'senden') {
      if (erinnert >= deckelErinnerung) { uebersprungen++; continue; }
      if (probe) { wuerde.push({ email: a.email, art: 'erinnerung', stufe: e.stufe }); erinnert++; continue; }
      try {
        // Erst sperren, dann senden.
        const { error: sperrFehler } = await db.from('webinar_versand').insert({
          owner_user_id: a.owner_user_id, anmeldung_id: a.id, termin_id: t.id,
          art: 'erinnerung', stufe: e.stufe,
        });
        if (sperrFehler) { uebersprungen++; continue; }

        const marke = await brandingVon(a.owner_user_id);
        const terminText = formatiereTermin(t.beginnt_am);
        const werte = { firma: marke.firma, name: a.name, titel: w.titel, termin: terminText, dauer: dauerText(t.dauer_minuten) };
        const betreff = setzePlatzhalter(e.betreff, werte).trim() || `Erinnerung: ${w.titel}`;

        // Der Zugangslink NUR in den Stufen, die ihn tragen duerfen.
        const zugang = e.mitZugang && String(t.zugang_url ?? '').trim()
          ? `<p style="margin:22px 0;"><a href="${escapeHtml(String(t.zugang_url))}" style="display:inline-block;background:${marke.akzent};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;">Zum Webinar</a></p>`
          : '';
        const hinweisOhneLink = e.mitZugang && !String(t.zugang_url ?? '').trim()
          ? `<p style="margin:0 0 12px;">Den Zugangslink schicken wir Ihnen gleich separat nach.</p>`
          : '';

        const inhalt = `
          <p style="margin:0 0 12px;">${escapeHtml(anrede(a.name))}</p>
          <p style="margin:0 0 12px;">${escapeHtml(`unser Webinar „${w.titel}" findet statt${terminText ? ` am ${terminText}` : ''}.`)}</p>
          ${dauerText(t.dauer_minuten) ? `<p style="margin:0 0 12px;color:#8a94a6;">Dauer: ${escapeHtml(dauerText(t.dauer_minuten))}${w.referent ? ` · Referent: ${escapeHtml(w.referent)}` : ''}</p>` : ''}
          ${zugang}${hinweisOhneLink}
          <p style="margin:0;">Bei Fragen antworten Sie einfach auf diese E-Mail.</p>
          <p style="margin:26px 0 0;border-top:1px solid #eeeeee;padding-top:14px;color:#8a94a6;font-size:12px;line-height:1.5;">
            Sie erhalten diese E-Mail, weil Sie sich für dieses Webinar angemeldet haben.
            <a href="${abmeldenUrl(basis, a.abmelde_token || '')}" style="color:#8a94a6;">Hier abmelden</a>.
          </p>`;

        // Kalendereintrag nur an die Stufen haengen, die auch den Zugangslink
        // tragen — dann steht der Link im Kalender und der Teilnehmer muss die
        // Mail nicht mehr suchen. DIESELBE UID wie in der Bestaetigungsmail,
        // die Folgenummer ist die Stufe: der Kalender ERSETZT den Eintrag,
        // statt einen zweiten anzulegen.
        const kalender = e.mitZugang
          ? icsAnhang({
              uid: `webinar-${a.id}@argonaut-os.com`,
              beginn: t.beginnt_am,
              ende: endetAm(t.beginnt_am, t.dauer_minuten),
              titel: w.titel,
              beschreibung: w.referent ? `Referent: ${w.referent}` : '',
              ort: t.zugang_url || '',
              organisatorName: marke.firma,
              organisatorMail: marke.email,
              sequenz: e.stufe,
            })
          : null;

        const r = await sendeMail({
          an: a.email, betreff,
          html: kundenMailLayout(marke.firma, marke.akzent, '', inhalt),
          absenderName: marke.firma, antwortAn: marke.email,
          ...(kalender ? { anhaenge: [kalender] } : {}),
        });
        if (!r.ok) throw new Error(r.fehler);
        erinnert++;
      } catch (err) {
        console.error('Webinar-Erinnerung fehlgeschlagen', a.id, err instanceof Error ? err.message : err);
        fehler++;
      }
      continue;
    }

    // -------------------------------------------------------------- Nachbereitung
    const n = nachbereitungFaellig(a, t, jetztIso);
    if (n.tun !== 'senden') { uebersprungen++; continue; }

    // Nachbereitung ist Werbung: Deckel UND Werbewiderspruch gelten.
    if (nachbereitet >= deckelWerbung) { uebersprungen++; continue; }
    if (widerspruch.has(`${a.owner_user_id}|${a.email.toLowerCase()}`)) {
      // Kein Versand, aber vermerken — sonst wird es bei jedem Lauf neu geprüft.
      if (!probe) {
        await db.from('webinar_anmeldung')
          .update({ nachbereitung_am: jetztIso }).eq('id', a.id);
      }
      gesperrt++;
      continue;
    }
    if (probe) { wuerde.push({ email: a.email, art: 'nachbereitung', stufe: 0 }); nachbereitet++; continue; }

    try {
      const { error: sperrFehler } = await db.from('webinar_versand').insert({
        owner_user_id: a.owner_user_id, anmeldung_id: a.id, termin_id: t.id,
        art: 'nachbereitung', stufe: 0,
      });
      if (sperrFehler) { uebersprungen++; continue; }

      const marke = await brandingVon(a.owner_user_id);
      const vorlage = nachbereitungFuer(n.teilnahme);
      const werte = { firma: marke.firma, name: a.name, titel: w.titel, termin: formatiereTermin(t.beginnt_am), dauer: dauerText(t.dauer_minuten) };
      const betreff = setzePlatzhalter(vorlage.betreff, werte).trim() || `Die Unterlagen zu ${w.titel}`;
      const text = setzePlatzhalter(vorlage.text, werte);

      const aufzeichnung = String(w.aufzeichnung_url ?? '').trim()
        ? `<p style="margin:22px 0;"><a href="${escapeHtml(String(w.aufzeichnung_url))}" style="display:inline-block;background:${marke.akzent};color:#ffffff;text-decoration:none;font-weight:700;padding:13px 24px;border-radius:8px;">Aufzeichnung ansehen</a></p>`
        : '';

      const inhalt = `
        <p style="margin:0 0 12px;">${escapeHtml(anrede(a.name))}</p>
        <div style="margin:0 0 12px;">${textZuHtml(text)}</div>
        ${aufzeichnung}
        <p style="margin:26px 0 0;border-top:1px solid #eeeeee;padding-top:14px;color:#8a94a6;font-size:12px;line-height:1.5;">
          Sie erhalten diese E-Mail, weil Sie sich für „${escapeHtml(w.titel)}" angemeldet hatten.
          <a href="${abmeldenUrl(basis, a.abmelde_token || '')}" style="color:#8a94a6;">Hier mit einem Klick abmelden</a>.
        </p>`;

      const r = await sendeMail({
        an: a.email, betreff,
        html: kundenMailLayout(marke.firma, marke.akzent, '', inhalt),
        absenderName: marke.firma, antwortAn: marke.email,
      });
      if (!r.ok) throw new Error(r.fehler);

      await db.from('webinar_anmeldung').update({ nachbereitung_am: jetztIso }).eq('id', a.id);
      nachbereitet++;
    } catch (err) {
      console.error('Webinar-Nachbereitung fehlgeschlagen', a.id, err instanceof Error ? err.message : err);
      fehler++;
    }
  }

  return NextResponse.json({
    ok: true,
    probe: probe || undefined,
    termine: termine.length,
    geprueft: anmeldungen.length,
    erinnert, nachbereitet, uebersprungen, gesperrt, fehler,
    stufen: ERINNERUNGEN.map((s) => `${s.stufe}: ${s.stundenVorher} h vorher`),
    wuerdeSenden: probe ? wuerde.slice(0, 20) : undefined,
    hinweis: `Erinnerungen sind Betriebspost (Deckel ${deckelErinnerung} je Lauf). ${begruendung(budget, deckelWerbung, nachbereitet)}`,
  });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
