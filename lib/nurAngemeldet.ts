// ============================================================================
// ARGONAUT OS · lib/nurAngemeldet.ts — Login-Pflicht für Schnittstellen (Paket S0)
//
// Martins Regel (28.09.2026): Was ein Betrieb intern macht oder verschickt,
// darf nie von außen angestoßen werden — nur mit Login, nachvollziehbar.
// Offen bleiben nur die Türen für Besucher und Kunden eines Betriebs
// (Webseite, Shop, Buchung, Double-Opt-in, Abmelden, Portal-Link) — die
// stehen mit Grund in lib/offeneTueren.ts. tests/zugangWaechterS0.test.mjs
// bricht den Build ab, wenn eine Schnittstelle weder hier noch dort steht.
//
//   const absage = await nurAngemeldet();
//   if (absage) return absage;
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from './supabase-server';
import { betriebSperrePruefen } from './betriebSperreServer';

export async function nurAngemeldet(): Promise<NextResponse | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Paket 177: gesperrte (gekuendigte) Betriebe kommen auch ueber die
      // Schnittstellen nicht mehr durch — Chef wie Mitarbeiter.
      const sperre = await betriebSperrePruefen(supabase);
      if (sperre.protokoll) console.error(sperre.protokoll);
      if (sperre.gesperrt) {
        return NextResponse.json({ ok: false, error: 'Der Zugang dieses Betriebs ist gesperrt.' }, { status: 403 });
      }
      return null;
    }
  } catch {
    // keine gültige Anmeldung lesbar -> wie abgemeldet
  }
  return NextResponse.json({ ok: false, error: 'Bitte melden Sie sich an.' }, { status: 401 });
}
