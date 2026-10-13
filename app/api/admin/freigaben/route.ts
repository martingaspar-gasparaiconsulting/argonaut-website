import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';
import { alleSchalter, freigebenPruefen, zeilenMitStand, type DbZeile } from '@/lib/freigabeZentrale';

// ============================================================================
// ARGONAUT OS · /api/admin/freigaben — Freigabe-Zentrale (Paket 345, A0 Teil 1)
//
// Nur der Betreiber (Doppelschloss) UND nur mit eingerichtetem und in dieser
// Sitzung bestätigtem zweiten Faktor — hier reicht „hat keinen Faktor" nicht.
// GET:  alle Schalter mit Code-Stand und Datenbank-Stand + letzte Protokoll-Zeilen
// POST: { aktion: 'freigeben', schluessel, vermerk, anwalt_frage, anwalt_antwort_datum }
//       { aktion: 'sperren', schluessel }            — Vormerkung zurücknehmen
//       { aktion: 'ausblenden', schluessel, getippt } — getippt = Titel exakt
//       { aktion: 'einblenden', schluessel }
// Teil 1: Eine Freigabe ist nur VORGEMERKT; wirksam bleibt der Code.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function pruefen(): Promise<{ absage: NextResponse | null; userId: string | null }> {
  const { absage, userId } = await betreiberPruefung();
  if (absage) return { absage, userId: null };
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const stand = await zweiFaktorStand(supabase, user, true);
  if (!stand.hatFaktor || stand.aal !== 'aal2') {
    return { absage: NextResponse.json({ ok: false, error: 'Die Freigabe-Zentrale öffnet nur mit eingerichteter und bestätigter Zwei-Faktor-Anmeldung.' }, { status: 403 }), userId: null };
  }
  return { absage: null, userId };
}

function heute(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
}

export async function GET() {
  const { absage } = await pruefen();
  if (absage) return absage;
  const admin = createAdminClient();
  const [s, p] = await Promise.all([
    admin.from('freigabe_schalter').select('schluessel, an, vermerk, anwalt_frage, anwalt_antwort_datum, ausgeblendet, geaendert_am').limit(500),
    admin.from('freigabe_protokoll').select('id, schluessel, aktion, vermerk, am').order('am', { ascending: false }).limit(100),
  ]);
  if (s.error || p.error) {
    return NextResponse.json({ ok: false, sqlFehlt: true, error: 'Die Freigabe-Zentrale ist noch nicht eingerichtet (SQL Paket 345).', zeilen: zeilenMitStand([]) }, { headers: { 'cache-control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, zeilen: zeilenMitStand((s.data ?? []) as DbZeile[]), protokoll: p.data ?? [] }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const { absage, userId } = await pruefen();
  if (absage) return absage;
  const body = await req.json().catch(() => ({})) as {
    aktion?: string; schluessel?: string; vermerk?: string; anwalt_frage?: string; anwalt_antwort_datum?: string; getippt?: string;
  };
  const schluessel = String(body.schluessel ?? '');
  const s = alleSchalter().find((x) => x.schluessel === schluessel);
  if (!s) return NextResponse.json({ ok: false, error: 'Diesen Schalter gibt es nicht.' }, { status: 400 });
  const admin = createAdminClient();
  const { data: alt } = await admin.from('freigabe_schalter').select('schluessel, an, vermerk, anwalt_frage, anwalt_antwort_datum, ausgeblendet').eq('schluessel', schluessel).maybeSingle();
  const basis = { schluessel, an: false, vermerk: null as string | null, anwalt_frage: null as string | null, anwalt_antwort_datum: null as string | null, ausgeblendet: false, ...(alt ?? {}) };

  let zeile: typeof basis;
  let meldung: string;
  if (body.aktion === 'freigeben') {
    const e = { schluessel, vermerk: String(body.vermerk ?? ''), anwalt_frage: String(body.anwalt_frage ?? ''), anwalt_antwort_datum: String(body.anwalt_antwort_datum ?? '') };
    const f = freigebenPruefen(e, heute());
    if (f.length) return NextResponse.json({ ok: false, error: f.join(' ') }, { status: 400 });
    zeile = { ...basis, an: true, vermerk: e.vermerk.trim(), anwalt_frage: e.anwalt_frage.trim() || null, anwalt_antwort_datum: e.anwalt_antwort_datum };
    meldung = `„${s.titel}": Freigabe vorgemerkt. Wirksam wird sie mit Teil 2 der Freigabe-Zentrale; bis dahin gilt der Schalter im Code.`;
  } else if (body.aktion === 'sperren') {
    if (!basis.an) return NextResponse.json({ ok: false, error: 'Dieser Schalter ist nicht vorgemerkt.' }, { status: 400 });
    zeile = { ...basis, an: false };
    meldung = `„${s.titel}": Vormerkung zurückgenommen — bleibt gesperrt.`;
  } else if (body.aktion === 'ausblenden') {
    // Schritt 3 der drei Schritte wird am Server noch einmal geprüft: Titel exakt
    if (String(body.getippt ?? '').trim() !== s.titel.trim()) {
      return NextResponse.json({ ok: false, error: 'Zum Ausblenden bitte den Namen genau so eintippen, wie er dasteht.' }, { status: 400 });
    }
    zeile = { ...basis, ausgeblendet: true };
    meldung = `„${s.titel}" ausgeblendet. Der Schalter im Code bleibt, „Ausgeblendete zeigen" holt ihn zurück.`;
  } else if (body.aktion === 'einblenden') {
    zeile = { ...basis, ausgeblendet: false };
    meldung = `„${s.titel}" wieder eingeblendet.`;
  } else {
    return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  }
  const { error } = await admin.from('freigabe_schalter').upsert({ ...zeile, geaendert_von: userId }, { onConflict: 'schluessel' });
  if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar (SQL Paket 345?).' }, { status: 500 });
  return NextResponse.json({ ok: true, meldung });
}
