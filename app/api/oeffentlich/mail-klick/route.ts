import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sicheresZiel } from '@/lib/mailMessung';

// ============================================================================
// ARGONAUT OS · /api/oeffentlich/mail-klick   (D5 Teil 3)
//
// ÖFFENTLICH. Zaehlt einen Klick hoch und leitet sofort zum Ziel weiter.
// Gezaehlt wird eine SUMME je Versand und je Zieladresse — nicht, WER
// geklickt hat.
//
// ▄▄▄ OFFENE UMLEITUNG VERHINDERN ▄▄▄
// Eine Route, die auf jedes mitgegebene Ziel weiterleitet, ist eine offene
// Umleitung: Betrueger haengen ihre eigene Adresse an und verschicken einen
// Link, der auf DEINE Domain zeigt. Deshalb prueft `sicheresZiel` streng auf
// http/https — javascript:, data: und protokolllose Adressen fliegen raus.
// Ohne gueltiges Ziel geht es auf die Startseite, nicht ins Leere.
//
// Der Klick wird gezaehlt, BEVOR umgeleitet wird — aber ein Fehler beim
// Zaehlen haelt die Umleitung nie auf. Der Mensch wollte zu einer Seite,
// nicht zu unserer Statistik.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const versand = (url.searchParams.get('v') || '').trim();
  const schluessel = (url.searchParams.get('s') || '').trim();
  const ziel = sicheresZiel(url.searchParams.get('u'));

  const heimat = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, '');
  if (!ziel) return NextResponse.redirect(heimat || '/', 302);

  try {
    if (versand && schluessel) {
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.SUPABASE_SERVICE_ROLE_KEY as string,
        { auth: { persistSession: false } },
      );
      await db.rpc('mail_klick_zaehlen', {
        p_versand: versand, p_schluessel: schluessel, p_url: ziel,
      });
    }
  } catch (e) {
    // Nur protokollieren. Die Umleitung laeuft trotzdem.
    console.error('mail-klick:', e instanceof Error ? e.message : e);
  }

  return NextResponse.redirect(ziel, 302);
}
