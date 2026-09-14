import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { seitenUrl, STATUS_ABGEMELDET } from '@/lib/webinar';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/webinar-abmelden   (Paket 5 · Punkt 3.13)
//
// ÖFFENTLICH. GET ?token=... — der Abmeldelink aus jeder Webinar-Mail.
//
// ▄▄▄ WARUM GET UND NICHT POST ▄▄▄
// Mail-Programme oeffnen Links zur Vorschau vorab. Bei GET kann das eine
// versehentliche Abmeldung ausloesen — aergerlich, aber harmlos. Bei POST
// mit Bestaetigungsknopf funktionieren die Abmeldungen in vielen Programmen
// gar nicht, und eine NICHT ausgefuehrte Abmeldung ist eine Abmahnung.
// Dieselbe Abwaegung wie in /api/oeffentlich/rueckhol-abmelden.
//
// ▄▄▄ WAS DIE ABMELDUNG BEDEUTET ▄▄▄
// Sie gilt fuer DIESE Anmeldung: keine Erinnerungen, keine Nachbereitung,
// und der Platz wird frei. Sie ist KEIN betriebsweiter Werbewiderspruch —
// dafuer gibt es kontakte.werbe_widerspruch_am, das der Cron zusaetzlich
// prueft, bevor er die Nachbereitung verschickt.
//
// ▄▄▄ ACHTUNG · SERVICE-ROLLE ▄▄▄ Umgeht RLS; alles haengt am Token.
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

type AnmeldungRow = { id: string; webinar_id: string; status: string };
type WebinarRow = { key: string };

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
      .select('id, webinar_id, status')
      .eq('abmelde_token', token)
      .maybeSingle();
    const a = (data as AnmeldungRow | null) ?? null;
    // Ein unbekannter Token bekommt DIESELBE Antwort wie ein gueltiger.
    // Sonst laesst sich durch Ausprobieren herausfinden, welche Token es gibt.
    if (!a) return zurueck(null, 'abgemeldet');

    const { data: wRoh } = await db
      .from('webinare').select('key').eq('id', a.webinar_id).maybeSingle();
    const key = (wRoh as WebinarRow | null)?.key ?? null;

    // Zweiter Klick: freundlich dieselbe Seite, kein Fehler.
    if (a.status === STATUS_ABGEMELDET) return zurueck(key, 'abgemeldet');

    await db.from('webinar_anmeldung').update({
      status: STATUS_ABGEMELDET,
      abgemeldet_am: new Date().toISOString(),
    }).eq('id', a.id);

    return zurueck(key, 'abgemeldet');
  } catch (e: unknown) {
    console.error('webinar-abmelden fehlgeschlagen:', e instanceof Error ? e.message : e);
    // Im Zweifel die freundliche Seite zeigen — eine Fehlerseite beim
    // Abmelden liest sich wie „hat nicht geklappt" und erzeugt Beschwerden.
    return zurueck(null, 'abgemeldet');
  }
}
