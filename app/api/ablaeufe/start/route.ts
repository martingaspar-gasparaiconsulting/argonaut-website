import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { ausloeserHatVorgang, knopfModul } from '@/lib/ablauf';
import { freieStarts, laufbereit, ausloeserZiel, OHNE_VORGANG } from '@/lib/ablaufMotor';
import { starteLauf, type AblaufZeile } from '@/lib/ablaufAusfuehren';
import { ergaenzeKontakte } from '@/lib/ablaufDaten';
import type { Datensatz } from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/start — Auslöser „Knopf" (Paket 159, erweitert 168)
//
// Zwei Wege, beide nur für die Geschäftsleitung und mit ihrer Anmeldung (RLS):
//   · „▶ Jetzt starten" auf der Seite Abläufe: Knopf-Ablauf OHNE Vorgang.
//   · Paket 168: Knopf auf einer Kunden-, Anfrage-, Auftrags- oder Projektseite:
//     { id, vorgangId } — der Datensatz der Seite ist der Vorgang. Er wird
//     serverseitig geladen (nie vom Browser übernommen) und muss dem Betrieb
//     gehören. Je Ablauf und Vorgang läuft der Knopf EINMAL (Unique-Index).
// Deckel wie beim Motor: höchstens 25 Starts je Ablauf in 24 Stunden.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string; vorgangId?: string };
  if (!body.id) return NextResponse.json({ ok: false, error: 'Kein Ablauf gewählt.' }, { status: 400 });

  const { data } = await supabase.from('ablaeufe').select('*').eq('id', body.id).maybeSingle();
  const ablauf = data as AblaufZeile | null;
  if (!ablauf) return NextResponse.json({ ok: false, error: 'Ablauf nicht gefunden.' }, { status: 404 });
  if (ablauf.owner_user_id !== user.id) return NextResponse.json({ ok: false, error: 'Nur die Geschäftsleitung.' }, { status: 403 });
  if (ablauf.ausloeser?.art !== 'knopf') {
    return NextResponse.json({ ok: false, error: 'Dieser Ablauf startet nicht per Knopf.' }, { status: 400 });
  }
  const mitVorgang = ausloeserHatVorgang(ablauf.ausloeser);
  if (mitVorgang !== !!body.vorgangId) {
    return NextResponse.json({ ok: false, error: mitVorgang ? 'Dieser Knopf gehört auf eine Modulseite.' : 'Dieser Knopf startet ohne Vorgang auf der Seite Abläufe.' }, { status: 400 });
  }
  if (!laufbereit(ablauf)) return NextResponse.json({ ok: false, error: 'Bitte den Ablauf zuerst einschalten.' }, { status: 400 });

  const jetzt = new Date();
  const { count } = await supabase.from('ablauf_laeufe').select('id', { count: 'exact', head: true })
    .eq('ablauf_id', ablauf.id).eq('probe', false).gte('gestartet_am', new Date(jetzt.getTime() - 86400000).toISOString());
  if (freieStarts(count ?? 0) <= 0) return NextResponse.json({ ok: false, error: 'Deckel erreicht: höchstens 25 Starts in 24 Stunden.' }, { status: 429 });

  if (!mitVorgang) {
    const status = await starteLauf(supabase, ablauf, OHNE_VORGANG, 'knopf', null, { knopf: true }, {}, 'Gestartet per Knopf', jetzt);
    if (status === null) return NextResponse.json({ ok: false, error: 'Start fehlgeschlagen.' }, { status: 500 });
    return NextResponse.json({ ok: true, status });
  }

  // ---- Paket 168: Knopf auf einer Modulseite ----
  const ziel = ausloeserZiel(ablauf.ausloeser);
  const modul = knopfModul(ablauf.ausloeser.modul);
  const vorgangId = String(body.vorgangId);
  if (!ziel || !modul || !/^[0-9a-f-]{36}$/i.test(vorgangId)) return NextResponse.json({ ok: false, error: 'Vorgang ungültig.' }, { status: 400 });
  const { data: satzDaten } = await supabase.from(ziel.tabelle).select('*').eq('id', vorgangId).eq('owner_user_id', user.id).maybeSingle();
  const satz = satzDaten as Datensatz | null;
  if (!satz) return NextResponse.json({ ok: false, error: `${modul.einzahl} nicht gefunden.` }, { status: 404 });

  const { data: schon } = await supabase.from('ablauf_laeufe').select('id, gestartet_am, status')
    .eq('ablauf_id', ablauf.id).eq('ziel_typ', ziel.zielTyp).eq('ziel_id', vorgangId).eq('probe', false).maybeSingle();
  if (schon) {
    return NextResponse.json({ ok: false, error: `„${ablauf.name}" lief für diesen Vorgang schon (gestartet ${new Date((schon as { gestartet_am: string }).gestartet_am).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}).` }, { status: 409 });
  }

  await ergaenzeKontakte(supabase, user.id, [satz]);
  const status = await starteLauf(supabase, ablauf, ziel, ziel.zielTyp, vorgangId, { tabelle: ziel.tabelle, knopf: true }, satz, `Gestartet per Knopf (${modul.einzahl})`, jetzt);
  if (status === null) return NextResponse.json({ ok: false, error: 'Start fehlgeschlagen — lief er vielleicht gerade schon?' }, { status: 409 });
  return NextResponse.json({ ok: true, status });
}
