import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/analyse  (cookiefreies Website-Tracking)
// ÖFFENTLICH. Nimmt anonyme Ereignisse entgegen und legt sie in web_ereignisse
// ab. Drei Ereignis-Typen:
//   • 'view'    — Seitenaufruf (mit Titel, Herkunft/Kanal, UTM)
//   • 'click'   — Klick auf ein Element (Ziel-Text/Link)
//   • 'verweil' — beim Verlassen: wie lange war der Besucher auf der Seite
// Es wird NIE eine IP gespeichert — nur ein täglich wechselnder Hash
// (Besucher-Tagesschlüssel). Kein Cookie, kein Banner. Service-Role, RLS-sicher;
// owner_user_id kommt sicher aus web_seiten, NIE vom Client.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
}

function ganzzahl(v: unknown, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), max);
}

function geraetAusUA(ua: string): string {
  const u = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(u)) return 'tablet';
  if (/mobi|iphone|android.*mobile|phone|ipod/.test(u)) return 'mobil';
  return 'desktop';
}

function browserAusUA(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/chrome\//i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Andere';
}

function osAusUA(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Andere';
}

function refHost(ref: string | null, eigenerHost: string): string {
  if (!ref) return '';
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '');
    if (h === eigenerHost.replace(/^www\./, '')) return ''; // eigener Klick = direkt
    return h.slice(0, 120);
  } catch {
    return '';
  }
}

const SUCHMASCHINEN = /(google|bing|duckduckgo|ecosia|yahoo|yandex|baidu|startpage|brave)\./i;
const SOZIALE = /(facebook|instagram|linkedin|t\.co|twitter|x\.com|youtube|tiktok|pinterest|reddit|whatsapp|telegram|xing)\./i;

// Kanal bestimmen — genau deine Frage „war's ein Link oder eine Werbeanzeige?".
function kanalBestimmen(referrer: string, utmMedium: string | null, utmQuelle: string | null): string {
  const m = (utmMedium || '').toLowerCase();
  const q = (utmQuelle || '').toLowerCase();
  if (/(cpc|ppc|paid|ads?|anzeige|display|banner|retarget)/.test(m)) return 'bezahlt';
  if (/(email|e-mail|newsletter)/.test(m) || /(newsletter|mailing)/.test(q)) return 'email';
  if (/(social|sozial)/.test(m) || SOZIALE.test(referrer)) return 'social';
  if (/(organic|organisch|seo)/.test(m) || SUCHMASCHINEN.test(referrer)) return 'organisch';
  if (referrer) return 'verweis';
  return 'direkt';
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  try {
    // sendBeacon schickt den Body oft als text/plain — deshalb tolerant parsen.
    const roh = await req.text();
    let b: Record<string, unknown> | null = null;
    try {
      b = JSON.parse(roh) as Record<string, unknown>;
    } catch {
      b = null;
    }
    if (!b || typeof b !== 'object') {
      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    const seite = str(b.seite, 100) || 'argonaut-os';
    const typRoh = String(b.typ || 'view');
    const typ = typRoh === 'click' || typRoh === 'verweil' ? typRoh : 'view';
    const pfad = str(b.pfad, 300) || '/';
    const titel = str(b.titel, 300);
    const ziel = typ === 'click' ? str(b.ziel, 200) : null;
    const verweildauer_ms = typ === 'verweil' ? ganzzahl(b.verweildauer_ms, 1000 * 60 * 60) : null;

    // UTM: entweder direkt vom Client oder aus dem mitgeschickten Query-String.
    let utm_quelle = str(b.utm_quelle, 120);
    let utm_medium = str(b.utm_medium, 120);
    let utm_kampagne = str(b.utm_kampagne, 160);
    const abfrage = str(b.abfrage, 500);
    if ((!utm_quelle || !utm_medium) && abfrage) {
      try {
        const p = new URLSearchParams(abfrage.startsWith('?') ? abfrage.slice(1) : abfrage);
        utm_quelle = utm_quelle || str(p.get('utm_source'), 120);
        utm_medium = utm_medium || str(p.get('utm_medium'), 120);
        utm_kampagne = utm_kampagne || str(p.get('utm_campaign'), 160);
      } catch {
        /* egal */
      }
    }

    const ua = req.headers.get('user-agent') || '';
    const ipRoh = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '')
      .split(',')[0]
      .trim();
    const land =
      (req.headers.get('x-vercel-ip-country') || '').slice(0, 2).toUpperCase() || null;
    const host = req.headers.get('host') || '';
    const referrer = refHost(str(b.referrer, 300), host);
    const kanal = kanalBestimmen(referrer, utm_medium, utm_quelle);

    // Anonymer Tages-Schlüssel: Hash aus Datum + IP + UA + Server-Geheimnis.
    // Die IP selbst wird NICHT gespeichert; der Schlüssel wechselt täglich.
    const tag = new Date().toISOString().slice(0, 10);
    const geheim = process.env.SUPABASE_SERVICE_ROLE_KEY || 'argonaut-salt';
    const besucher_tag = createHash('sha256')
      .update(`${tag}|${ipRoh}|${ua}|${geheim}`)
      .digest('hex')
      .slice(0, 32);

    const db = admin();

    // Für Kundenseiten den Inhaber sicher bestimmen; die eigene Seite
    // ('argonaut-os') läuft ohne Inhaber. Unbekannte/nicht-live Seiten still
    // verwerfen, damit die Tabelle sauber bleibt.
    let owner_user_id: string | null = null;
    if (seite !== 'argonaut-os') {
      const { data } = await db
        .from('web_seiten')
        .select('owner_user_id, status')
        .eq('oeffentlich_id', seite)
        .maybeSingle();
      const row = data as { owner_user_id?: string; status?: string } | null;
      if (row?.status === 'live' && row.owner_user_id) {
        owner_user_id = row.owner_user_id;
      } else {
        return NextResponse.json({ ok: true }, { headers: CORS });
      }
    }

    await db.from('web_ereignisse').insert({
      oeffentlich_id: seite,
      owner_user_id,
      typ,
      pfad,
      titel,
      ziel,
      verweildauer_ms,
      referrer,
      kanal,
      utm_quelle,
      utm_medium,
      utm_kampagne,
      geraet: geraetAusUA(ua),
      browser: browserAusUA(ua),
      os: osAusUA(ua),
      land,
      besucher_tag,
    });

    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (err) {
    console.error('analyse Fehler:', err);
    // Tracking darf die Seite des Besuchers NIE stören → immer freundlich „ok".
    return NextResponse.json({ ok: true }, { headers: CORS });
  }
}
