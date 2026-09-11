// ============================================================================
// ARGONAUT OS · lib/betreiberGuard.ts — das Doppelschloss für Betreiber-Wege
//
// WARUM ES DAS GIBT
// Endpunkte unter /api/admin schreiben in FREMDE Betriebe. Dort darf genau eine
// Person durch: der Betreiber. Die Prüfung dafür stand bis zum 11.09.2026
// wortgleich in jedem einzelnen Endpunkt — und eine Sicherheitsprüfung, die es
// mehrfach gibt, ist eine Sicherheitsprüfung, die irgendwann auseinanderläuft.
// Ab jetzt steht sie hier, einmal.
//
// DIE ZWEI SCHLÖSSER — beide müssen auf:
//   1. profiles.role === 'admin'
//   2. ANALYSE_BETREIBER_ID ist gesetzt UND identisch mit der angemeldeten
//      Kennung
//
// Das zweite Schloss ist kein Gürtel zum Hosenträger. Wäre nur die Rolle nötig,
// würde eine versehentlich auf 'admin' gesetzte Zeile in `profiles` reichen, um
// in jeden Kundenbetrieb zu schreiben. Ist die Umgebungsvariable NICHT gesetzt,
// kommt bewusst NIEMAND durch — eine vergessene Variable ist hier kein Grund
// zum Durchlassen, sondern einer zum Zumachen.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';

/**
 * Beide Schlösser prüfen.
 * @returns `null`, wenn der Weg frei ist — sonst die fertige Absage.
 */
export async function betreiberGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }

  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (!betreiber || user.id !== betreiber) {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }
  return null;
}
