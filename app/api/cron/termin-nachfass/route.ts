import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';
import { cronGuard } from '../../../../lib/cronGuard';
import { escapeHtml } from '@/lib/newsletter';
import { werbeVersandTeile } from '@/lib/werbeAbmeldeLink';
import { werbePrueferLaden, betreiberKennung } from '@/lib/werbeErlaubnisServer';
import { FUSS_WIDERSPRUCH } from '@/lib/werbemail';

// ============================================================================
// ARGONAUT OS · /api/cron/termin-nachfass
// Tages-Cron: schickt am Tag NACH einem Website-Termin (Tabelle website_termine)
// eine freundliche Nachfass-Mail (Danke + neuer Termin/Test). nachfass_gesendet_am
// verhindert Doppelversand. Nur ARGONAUTs eigene Website-Leads (nicht tenant).
// Auslösung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=. Service-Role.
//
// Paket 173 (29.09.2026, Befund H9):
//  - Der Name kommt aus einem ÖFFENTLICHEN Formular und stand roh im HTML —
//    ein Angreifer konnte so Links und Text in eine Mail mit ARGONAUT-Absender
//    schmuggeln (Phishing). Jetzt escapeHtml.
//  - Die Mail wirbt („7 Tage testen") — sie trägt jetzt Abmeldelink,
//    Widerspruchshinweis und List-Unsubscribe, und wer (in irgendeinem Kanal
//    von ARGONAUT) widersprochen hat, bekommt sie nicht. Ob sie ohne
//    Einwilligung überhaupt zulässig ist, prüft der Anwalt (R34).
//  - Ohne ANALYSE_BETREIBER_ID gibt es keinen Abmeldelink — dann geht die
//    Mail NICHT raus (lieber keine als eine ohne Abmeldung).
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';
const MAX = 200;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function erlaubt(req: Request): Promise<boolean> {
  // Punkt 69 Paket 3 (22.09.2026): Diese Pruefung stand in SECHS Endpunkten
  // zeichengleich als eigene Kopie. Sie war nicht loechrig — `if (!secret)
  // return false` war schon da —, aber sechs Kopien heissen: eine Reparatur an
  // einer Stelle verpufft an fuenf anderen. Jetzt entscheidet lib/cronZugang.ts,
  // einmal, mit 26 Tests, und vergleicht das Geheimnis zeitverrat-sicher
  // statt mit ===.
  //
  // `betreiberErlaubt` bleibt AUS (Voreinstellung): dieser Endpunkt hatte noch
  // nie einen Anmeldeweg, und einen zu oeffnen waere eine Entscheidung, keine
  // Nebenwirkung. Die beiden bisherigen Wege — Vercels Bearer-Kopfzeile und
  // ?secret= von Hand — bleiben unveraendert.
  return (await cronGuard(req)) === null;
}

/** Kalendertag in Europe/Berlin als 'YYYY-MM-DD'. */
function berlinDatum(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function nachfassHtml(name: string | null, abmeldeLink: string): string {
  const sauber = (name || '').trim().slice(0, 80);
  const anrede = sauber ? `Guten Tag ${escapeHtml(sauber)},` : 'Guten Tag,';
  const btn = (href: string, label: string, gold: boolean) =>
    `<a href="${href}" style="display:inline-block;margin:4px 8px 4px 0;background:${gold ? '#C9A84C' : 'transparent'};color:${gold ? '#0A1628' : '#C9A84C'};text-decoration:none;font-weight:800;padding:12px 22px;border-radius:8px;${gold ? '' : 'border:1px solid #C9A84C;'}">${label}</a>`;
  return mailLayout('Ihr nächster Schritt mit ARGONAUT', `
    <p>${anrede}</p>
    <p>vielen Dank für Ihr Interesse an ARGONAUT. Falls noch Fragen offen sind, antworten Sie einfach auf diese Mail — ich bin direkt dran.</p>
    <p>Und falls wir uns terminlich verpasst haben: Suchen Sie sich gerne einen neuen Moment aus — oder starten Sie unverbindlich mit dem 7-Tage-Test.</p>
    <p style="margin:22px 0;">${btn(`${BASIS_URL}/demo`, '📅 Termin vereinbaren', true)}${btn(`${BASIS_URL}/testen`, '7 Tage kostenlos testen', false)}</p>
    <p style="color:#8FA3BE;font-size:12px;line-height:1.5;">Sie erhalten diese E-Mail, weil Sie über argonaut-os.com einen Termin angefragt haben.
      <a href="${abmeldeLink}" style="color:#8FA3BE;text-decoration:underline;">Keine weiteren E-Mails erhalten</a>.<br>${FUSS_WIDERSPRUCH}</p>`);
}

type TerminRow = { id: string; name: string | null; email: string | null };

async function lauf(req: Request) {
  if (!(await erlaubt(req))) return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });

  const db = service();
  const heute = berlinDatum(new Date()); // Termine VOR heute (also gestern/früher) sind vorbei.

  const { data, error } = await db
    .from('website_termine')
    .select('id, name, email')
    .lt('slot_date', heute)
    .is('nachfass_gesendet_am', null)
    .not('email', 'is', null)
    .order('slot_date', { ascending: true })
    .limit(MAX);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as TerminRow[];
  let gesendet = 0, fehler = 0, gesperrt = 0;

  const betreiber = betreiberKennung();
  if (!betreiber) {
    return NextResponse.json({ ok: true, geprueft: rows.length, gesendet: 0, hinweis: 'ANALYSE_BETREIBER_ID fehlt — ohne Abmeldelink wird keine Nachfass-Mail verschickt.' });
  }
  const darf = await werbePrueferLaden(db, rows.map((t) => ({ betrieb: betreiber, email: t.email })));

  for (const t of rows) {
    if (!t.email) continue;
    // Nur der Widerspruch zaehlt hier (Rechtsgrundlage: Anwalt R34).
    const erlaubnis = darf(betreiber, t.email, { nurWiderspruch: true });
    if (!erlaubnis.erlaubt) {
      // Kein Versand, aber vermerken — sonst wird es jeden Tag neu versucht.
      if (erlaubnis.grund === 'widersprochen') {
        await db.from('website_termine').update({ nachfass_gesendet_am: new Date().toISOString() }).eq('id', t.id);
      }
      gesperrt++;
      continue;
    }
    const teile = werbeVersandTeile(BASIS_URL, betreiber, t.email);
    if (!teile) { fehler++; continue; }
    try {
      const r = await sendeMail({
        an: t.email,
        betreff: 'Danke für Ihr Interesse an ARGONAUT — Ihr nächster Schritt',
        html: nachfassHtml(t.name, teile.abmeldeLink),
        kopfzeilen: teile.kopfzeilen,
      });
      if (!r.ok) throw new Error(r.fehler);
      await db.from('website_termine').update({ nachfass_gesendet_am: new Date().toISOString() }).eq('id', t.id);
      gesendet++;
    } catch {
      fehler++;
    }
  }

  return NextResponse.json({ ok: true, geprueft: rows.length, gesendet, gesperrt, fehler });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
