import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendeMail, mailLayout } from '@/lib/mail';

// ============================================================================
// ARGONAUT OS · /api/cron/termin-nachfass
// Tages-Cron: schickt am Tag NACH einem Website-Termin (Tabelle website_termine)
// eine freundliche Nachfass-Mail (Danke + neuer Termin/Test). nachfass_gesendet_am
// verhindert Doppelversand. Nur ARGONAUTs eigene Website-Leads (nicht tenant).
// Auslösung: Vercel-Cron (Bearer CRON_SECRET) oder ?secret=. Service-Role.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASIS_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com';
const MAX = 200;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function erlaubt(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get('secret') === secret;
}

/** Kalendertag in Europe/Berlin als 'YYYY-MM-DD'. */
function berlinDatum(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function nachfassHtml(name: string | null): string {
  const anrede = name ? `Guten Tag ${name},` : 'Guten Tag,';
  const btn = (href: string, label: string, gold: boolean) =>
    `<a href="${href}" style="display:inline-block;margin:4px 8px 4px 0;background:${gold ? '#C9A84C' : 'transparent'};color:${gold ? '#0A1628' : '#C9A84C'};text-decoration:none;font-weight:800;padding:12px 22px;border-radius:8px;${gold ? '' : 'border:1px solid #C9A84C;'}">${label}</a>`;
  return mailLayout('Ihr nächster Schritt mit ARGONAUT', `
    <p>${anrede}</p>
    <p>vielen Dank für Ihr Interesse an ARGONAUT. Falls noch Fragen offen sind, antworten Sie einfach auf diese Mail — ich bin direkt dran.</p>
    <p>Und falls wir uns terminlich verpasst haben: Suchen Sie sich gerne einen neuen Moment aus — oder starten Sie unverbindlich mit dem 7-Tage-Test.</p>
    <p style="margin:22px 0;">${btn(`${BASIS_URL}/demo`, '📅 Termin vereinbaren', true)}${btn(`${BASIS_URL}/testen`, '7 Tage kostenlos testen', false)}</p>
    <p style="color:#8FA3BE;font-size:12px;">Möchten Sie keine weitere Nachricht von uns? Eine kurze Antwort genügt.</p>`);
}

type TerminRow = { id: string; name: string | null; email: string | null };

async function lauf(req: Request) {
  if (!erlaubt(req)) return NextResponse.json({ ok: false, error: 'Nicht autorisiert.' }, { status: 401 });

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
  let gesendet = 0, fehler = 0;

  for (const t of rows) {
    if (!t.email) continue;
    try {
      const r = await sendeMail({ an: t.email, betreff: 'Danke für Ihr Interesse an ARGONAUT — Ihr nächster Schritt', html: nachfassHtml(t.name) });
      if (!r.ok) throw new Error(r.fehler);
      await db.from('website_termine').update({ nachfass_gesendet_am: new Date().toISOString() }).eq('id', t.id);
      gesendet++;
    } catch {
      fehler++;
    }
  }

  return NextResponse.json({ ok: true, geprueft: rows.length, gesendet, fehler });
}

export async function GET(req: Request) { return lauf(req); }
export async function POST(req: Request) { return lauf(req); }
