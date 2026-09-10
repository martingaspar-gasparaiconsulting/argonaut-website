// ============================================================================
// ARGONAUT OS · app/api/nutzung/route.ts — Punkt 6.4, die Zählstelle
//
//   POST { pfad }  ->  zählt EINEN Aufruf für Betrieb + Modul + heute
//
// ▄▄▄ WAS HIER NICHT PASSIERT ▄▄▄
// Es wird NICHT gespeichert, WER die Seite geöffnet hat. Der angemeldete
// Nutzer wird nur benutzt, um den BETRIEB zu bestimmen; danach ist er weg.
// In `modul_nutzung` gibt es keine Spalte, in die eine Person passt, und keine
// Uhrzeit — nur ein Datum. Damit ist die Tabelle zur Leistungs- und
// Verhaltenskontrolle nicht geeignet (§ 87 Abs. 1 Nr. 6 BetrVG), und das soll
// sie auch bleiben.
//
// Kein Klick-Protokoll: Zehn Aufrufe derselben Seite am selben Tag sind EINE
// Zeile mit der Zahl 10, nicht zehn Zeilen.
//
// Diese Route antwortet IMMER mit 200 und einem knappen Ergebnis. Eine
// Statistik darf niemandem die Arbeit stören: Wenn das Zählen scheitert, ist
// die Zahl falsch — schlimmer wäre eine Fehlermeldung im Gesicht des Kunden,
// weil eine Statistik hakt.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { modulAusPfad } from '@/lib/nutzung';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, grund: 'nicht angemeldet' });

    const body = await req.json().catch(() => null);
    const modul = modulAusPfad(body?.pfad);
    if (!modul) return NextResponse.json({ ok: false, grund: 'nicht zaehlbar' });

    const admin = createAdminClient();

    // Welcher BETRIEB? Ein eingeladener Mitarbeiter zählt auf das Konto seines
    // Betriebs, nicht auf ein eigenes — sonst stünden in der Statistik so viele
    // „Betriebe“, wie es Mitarbeiter gibt.
    let betrieb = user.id;
    try {
      const { data: ma } = await admin
        .from('mitarbeiter')
        .select('owner_user_id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      const owner = (ma as { owner_user_id?: string } | null)?.owner_user_id;
      if (owner) betrieb = owner;
    } catch {
      // Kein Mitarbeiter-Datensatz (oder die Spalte heißt anders): Dann ist der
      // Angemeldete selbst der Betrieb. Lieber eine Zeile am richtigen Ort zu
      // wenig als eine Fehlermeldung.
    }

    const { error } = await admin.rpc('modul_nutzung_zaehle', {
      p_owner: betrieb,
      p_modul: modul,
      p_anzahl: 1,
    });
    if (error) {
      console.error('api/nutzung:', error.message);
      return NextResponse.json({ ok: false, grund: 'nicht gezaehlt' });
    }

    return NextResponse.json({ ok: true, modul });
  } catch (e) {
    console.error('api/nutzung:', e instanceof Error ? e.message : 'unbekannt');
    return NextResponse.json({ ok: false, grund: 'fehler' });
  }
}
