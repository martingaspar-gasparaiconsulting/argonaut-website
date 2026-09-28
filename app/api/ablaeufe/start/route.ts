import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { ausloeserHatVorgang } from '@/lib/ablauf';
import { freieStarts, laufbereit, OHNE_VORGANG } from '@/lib/ablaufMotor';
import { starteLauf, type AblaufZeile } from '@/lib/ablaufAusfuehren';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/start — Auslöser „Knopf" (Paket 159)
//
// „▶ Jetzt starten" auf der Seite Abläufe: startet einen eingeschalteten
// Knopf-Ablauf OHNE Vorgang sofort. Nur die Geschäftsleitung. Läuft mit der
// Anmeldung des Chefs (RLS) über denselben Ausführer wie der Motor.
// Deckel wie beim Motor: höchstens 25 Starts je Ablauf in 24 Stunden.
// Knöpfe direkt in den Modulen (mit Vorgang) folgen später.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string };
  if (!body.id) return NextResponse.json({ ok: false, error: 'Kein Ablauf gewählt.' }, { status: 400 });

  const { data } = await supabase.from('ablaeufe').select('*').eq('id', body.id).maybeSingle();
  const ablauf = data as AblaufZeile | null;
  if (!ablauf) return NextResponse.json({ ok: false, error: 'Ablauf nicht gefunden.' }, { status: 404 });
  if (ablauf.owner_user_id !== user.id) return NextResponse.json({ ok: false, error: 'Nur die Geschäftsleitung.' }, { status: 403 });
  if (ablauf.ausloeser?.art !== 'knopf' || ausloeserHatVorgang(ablauf.ausloeser)) {
    return NextResponse.json({ ok: false, error: 'Dieser Ablauf startet nicht per Knopf auf dieser Seite.' }, { status: 400 });
  }
  if (!laufbereit(ablauf)) return NextResponse.json({ ok: false, error: 'Bitte den Ablauf zuerst einschalten.' }, { status: 400 });

  const jetzt = new Date();
  const { count } = await supabase.from('ablauf_laeufe').select('id', { count: 'exact', head: true })
    .eq('ablauf_id', ablauf.id).eq('probe', false).gte('gestartet_am', new Date(jetzt.getTime() - 86400000).toISOString());
  if (freieStarts(count ?? 0) <= 0) return NextResponse.json({ ok: false, error: 'Deckel erreicht: höchstens 25 Starts in 24 Stunden.' }, { status: 429 });

  const status = await starteLauf(supabase, ablauf, OHNE_VORGANG, 'knopf', null, { knopf: true }, {}, 'Gestartet per Knopf', jetzt);
  if (status === null) return NextResponse.json({ ok: false, error: 'Start fehlgeschlagen.' }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}
