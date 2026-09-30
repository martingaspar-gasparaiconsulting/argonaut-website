import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { ausloeserHatVorgang, knopfModul } from '@/lib/ablauf';
import { freieStarts, laufbereit, ausloeserZiel, OHNE_VORGANG } from '@/lib/ablaufMotor';
import { starteLauf, type AblaufZeile } from '@/lib/ablaufAusfuehren';
import { ergaenzeKontakte } from '@/lib/ablaufDaten';
import { createAdminClient } from '@/lib/supabase-admin';
import { darfKnopfStarten } from '@/lib/ablaufKnopfRecht';
import { knopfAufrufer } from '@/lib/ablaufKnopfServer';
import type { Datensatz } from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/start — Auslöser „Knopf" (Paket 159, erweitert 168)
//
// Zwei Wege für die Geschäftsleitung, mit ihrer Anmeldung (RLS):
//   · „▶ Jetzt starten" auf der Seite Abläufe: Knopf-Ablauf OHNE Vorgang.
//   · Paket 168: Knopf auf einer Kunden-, Anfrage-, Auftrags- oder Projektseite:
//     { id, vorgangId } — der Datensatz der Seite ist der Vorgang. Er wird
//     serverseitig geladen (nie vom Browser übernommen) und muss dem Betrieb
//     gehören. Je Ablauf und Vorgang läuft der Knopf EINMAL (Unique-Index).
// Deckel wie beim Motor: höchstens 25 Starts je Ablauf in 24 Stunden.
//
// Paket 192: Hat der Ablauf den Haken „Auch Mitarbeiter", darf ein Mitarbeiter
// mit Schreibrecht für das Modul den Knopf auf der Modulseite drücken
// (lib/ablaufKnopfRecht). Dann läuft alles mit dem Service-Schlüssel, jede
// Abfrage auf den Betrieb gefiltert; der Vorgang wird serverseitig geladen,
// im Protokoll steht, wer gestartet hat.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { id?: string; vorgangId?: string };
  if (!body.id) return NextResponse.json({ ok: false, error: 'Kein Ablauf gewählt.' }, { status: 400 });

  if (!/^[0-9a-f-]{36}$/i.test(String(body.id))) return NextResponse.json({ ok: false, error: 'Ablauf nicht gefunden.' }, { status: 404 });

  // Paket 192: Wer drückt? Geschäftsleitung (eigene Sitzung, RLS) oder Mitarbeiter (Service-Schlüssel, Betriebs-Filter).
  const admin = createAdminClient();
  const wer = await knopfAufrufer(admin, user.id);
  const betrieb = wer.rolle === 'chef' ? user.id : wer.betrieb;
  const { data } = await admin.from('ablaeufe').select('*').eq('id', body.id).eq('owner_user_id', betrieb).maybeSingle();
  const ablauf = data as AblaufZeile | null;
  if (!ablauf) return NextResponse.json({ ok: false, error: 'Ablauf nicht gefunden.' }, { status: 404 });
  if (ablauf.ausloeser?.art !== 'knopf') {
    return NextResponse.json({ ok: false, error: 'Dieser Ablauf startet nicht per Knopf.' }, { status: 400 });
  }
  const recht = darfKnopfStarten(ablauf, wer, new Date().toISOString().slice(0, 10));
  if (!recht.ja) return NextResponse.json({ ok: false, error: recht.grund }, { status: 403 });
  // Chef: wie bisher mit der eigenen Sitzung. Mitarbeiter: Service-Schlüssel (RLS ließe ihn nicht an ablaeufe/ablauf_laeufe).
  const db = recht.alsMitarbeiter ? admin : supabase;
  const von = recht.alsMitarbeiter ? ` von ${wer.name}` : '';
  const mitVorgang = ausloeserHatVorgang(ablauf.ausloeser);
  if (mitVorgang !== !!body.vorgangId) {
    return NextResponse.json({ ok: false, error: mitVorgang ? 'Dieser Knopf gehört auf eine Modulseite.' : 'Dieser Knopf startet ohne Vorgang auf der Seite Abläufe.' }, { status: 400 });
  }
  if (!laufbereit(ablauf)) return NextResponse.json({ ok: false, error: 'Bitte den Ablauf zuerst einschalten.' }, { status: 400 });

  const jetzt = new Date();
  const { count } = await db.from('ablauf_laeufe').select('id', { count: 'exact', head: true })
    .eq('ablauf_id', ablauf.id).eq('probe', false).gte('gestartet_am', new Date(jetzt.getTime() - 86400000).toISOString());
  if (freieStarts(count ?? 0) <= 0) return NextResponse.json({ ok: false, error: 'Deckel erreicht: höchstens 25 Starts in 24 Stunden.' }, { status: 429 });

  if (!mitVorgang) {
    if (recht.alsMitarbeiter) return NextResponse.json({ ok: false, error: 'Mitarbeiter starten nur Knöpfe auf einer Modulseite.' }, { status: 403 });
    const status = await starteLauf(supabase, ablauf, OHNE_VORGANG, 'knopf', null, { knopf: true }, {}, 'Gestartet per Knopf', jetzt);
    if (status === null) return NextResponse.json({ ok: false, error: 'Start fehlgeschlagen.' }, { status: 500 });
    return NextResponse.json({ ok: true, status });
  }

  // ---- Paket 168: Knopf auf einer Modulseite ----
  const ziel = ausloeserZiel(ablauf.ausloeser);
  const modul = knopfModul(ablauf.ausloeser.modul);
  const vorgangId = String(body.vorgangId);
  if (!ziel || !modul || !/^[0-9a-f-]{36}$/i.test(vorgangId)) return NextResponse.json({ ok: false, error: 'Vorgang ungültig.' }, { status: 400 });
  const { data: satzDaten } = await db.from(ziel.tabelle).select('*').eq('id', vorgangId).eq('owner_user_id', betrieb).maybeSingle();
  const satz = satzDaten as Datensatz | null;
  if (!satz) return NextResponse.json({ ok: false, error: `${modul.einzahl} nicht gefunden.` }, { status: 404 });

  const { data: schon } = await db.from('ablauf_laeufe').select('id, gestartet_am, status')
    .eq('ablauf_id', ablauf.id).eq('ziel_typ', ziel.zielTyp).eq('ziel_id', vorgangId).eq('probe', false).maybeSingle();
  if (schon) {
    return NextResponse.json({ ok: false, error: `„${ablauf.name}" lief für diesen Vorgang schon (gestartet ${new Date((schon as { gestartet_am: string }).gestartet_am).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}).` }, { status: 409 });
  }

  await ergaenzeKontakte(db, betrieb, [satz]);
  const kontext: Record<string, unknown> = { tabelle: ziel.tabelle, knopf: true };
  if (recht.alsMitarbeiter) kontext.gestartet_von = user.id;
  const status = await starteLauf(db, ablauf, ziel, ziel.zielTyp, vorgangId, kontext, satz, `Gestartet per Knopf (${modul.einzahl})${von}`, jetzt);
  if (status === null) return NextResponse.json({ ok: false, error: 'Start fehlgeschlagen — lief er vielleicht gerade schon?' }, { status: 409 });
  return NextResponse.json({ ok: true, status });
}
