import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sicheresZiel } from '@/lib/mailMessung';
import { klickSignaturGueltig, zwischenseiteHtml } from '@/lib/mailKlickSignatur';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/mail-klick   (D5 Teil 3, S1 Paket 161)
//
// ÖFFENTLICH. Zaehlt einen Klick hoch und leitet zum Ziel weiter.
// Gezaehlt wird eine SUMME je Versand und je Zieladresse — nicht, WER
// geklickt hat.
//
// ▄▄▄ OFFENE UMLEITUNG VERHINDERN ▄▄▄
// Bis S1 leitete diese Route auf JEDES http(s)-Ziel weiter — auch ohne
// Versand und Schluessel. Betrueger konnten so Links verschicken, die auf
// unsere Domain zeigen und bei ihnen landen.
// Jetzt:
//   · MIT gueltiger Unterschrift h (lib/mailKlickSignatur.ts, von ARGONAUT
//     beim Versand gesetzt): zaehlen + sofort weiterleiten (wie bisher).
//   · OHNE (alte Mails, gebastelte Links): NICHT zaehlen, keine Umleitung,
//     sondern eine Zwischenseite mit dem Ziel im Klartext und „Weiter".
//     Alte Mails funktionieren also weiter — mit einem Klick mehr.
// `sicheresZiel` laesst weiterhin nur http/https durch; alles andere geht
// auf die Startseite.
//
// Ein Fehler beim Zaehlen haelt die Umleitung nie auf.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const versand = (url.searchParams.get('v') || '').trim();
  const schluessel = (url.searchParams.get('s') || '').trim();
  const zielRoh = url.searchParams.get('u') || '';
  const h = (url.searchParams.get('h') || '').trim();
  const ziel = sicheresZiel(zielRoh);

  const heimat = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, '');
  if (!ziel) return NextResponse.redirect(heimat || '/', 302);

  const signiert = !!(versand && schluessel && h) && klickSignaturGueltig(versand, schluessel, zielRoh, h);
  if (!signiert) {
    return new Response(zwischenseiteHtml(ziel), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } },
    );
    await db.rpc('mail_klick_zaehlen', {
      p_versand: versand, p_schluessel: schluessel, p_url: ziel,
    });
  } catch (e) {
    // Nur protokollieren. Die Umleitung laeuft trotzdem.
    console.error('mail-klick:', e instanceof Error ? e.message : e);
  }

  return NextResponse.redirect(ziel, 302);
}
