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

/** Ergebnis der Prüfung: entweder eine Absage oder die Kennung des Betreibers. */
export type BetreiberPruefung =
  | { absage: NextResponse; userId: null }
  | { absage: null; userId: string };

/**
 * Beide Schlösser prüfen und die Kennung des Betreibers mitgeben.
 *
 * Warum es diese zweite Form gibt (12.09.2026): Endpunkte wie
 * app/api/beleg-upload brauchen nach der Prüfung die eigene Kennung weiter —
 * als Ordnername im Speicher-Eimer und als owner_user_id in der Zeile. Ohne
 * diese Form müssten sie getUser() ein zweites Mal aufrufen.
 *
 * @returns `{ absage: null, userId }`, wenn der Weg frei ist —
 *          sonst `{ absage, userId: null }` mit der fertigen Absage.
 */
export async function betreiberPruefung(): Promise<BetreiberPruefung> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { absage: NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 }), userId: null };
  }

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return { absage: NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 }), userId: null };
  }

  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (!betreiber || user.id !== betreiber) {
    return { absage: NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 }), userId: null };
  }
  return { absage: null, userId: user.id };
}

/**
 * Beide Schlösser prüfen.
 * @returns `null`, wenn der Weg frei ist — sonst die fertige Absage.
 */
export async function betreiberGuard(): Promise<NextResponse | null> {
  const { absage } = await betreiberPruefung();
  return absage;
}
