import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import { kontenDesBetriebs, sperrenErlaubt } from '@/lib/churnSperre';

// ============================================================================
// ARGONAUT OS · /api/admin/betrieb-sperre   (Paket 177, 29.09.2026)
//
// Der Betreiber sperrt einen gekuendigten Betrieb — oder hebt die Sperre auf.
//   GET  ?betrieb=<id>                       -> Stand + Konten
//   POST { betrieb, aktion: 'sperren', grund }
//   POST { betrieb, aktion: 'entsperren' }
//
// Sperren wirkt doppelt:
//   1. betrieb_sperre (SQL p177) — Dashboard, Anmeldung und alle
//      Schnittstellen mit nurAngemeldet() weisen ab sofort ab, fuer Chef UND
//      Mitarbeiter.
//   2. Alle Konten des Betriebs werden beim Anmelde-Dienst gesperrt (ban).
//      Dann ist auch eine neue Anmeldung unmoeglich, und laufende Sitzungen
//      verfallen spaetestens beim naechsten Auffrischen (≤ 1 Stunde).
// Nie das Betreiber-Konto. Entsperren loescht nichts (Nachweis bleibt).
// Daten des Betriebs bleiben vollstaendig erhalten.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LANG = '876000h'; // ~100 Jahre = bis zur Aufhebung

function adminDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

async function kontenLaden(db: ReturnType<typeof adminDb>, betrieb: string): Promise<string[]> {
  const { data } = await db.from('mitarbeiter').select('auth_user_id, owner_user_id').eq('owner_user_id', betrieb).limit(1000);
  return kontenDesBetriebs(betrieb, (data ?? []) as { auth_user_id?: unknown; owner_user_id?: unknown }[], process.env.ANALYSE_BETREIBER_ID);
}

export async function GET(req: Request) {
  const { absage } = await betreiberPruefung();
  if (absage) return absage;
  const betrieb = (new URL(req.url).searchParams.get('betrieb') || '').trim().toLowerCase();
  const erlaubt = sperrenErlaubt(betrieb, '', 'nur-lesen');
  if (!erlaubt.ok) return NextResponse.json({ ok: false, error: erlaubt.fehler }, { status: 400 });
  const db = adminDb();
  const { data, error } = await db.from('betrieb_sperre').select('*').eq('owner_user_id', betrieb).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: 'Die Sperrliste fehlt noch (SQL p177 ausführen).' }, { status: 503 });
  const konten = await kontenLaden(db, betrieb);
  const z = data as { aufgehoben_am?: string | null } | null;
  return NextResponse.json({ ok: true, sperre: data ?? null, gesperrt: !!z && !z.aufgehoben_am, konten: konten.length });
}

export async function POST(req: Request) {
  const { absage, userId } = await betreiberPruefung();
  if (absage) return absage;
  const body = await req.json().catch(() => null) as { betrieb?: string; aktion?: string; grund?: string } | null;
  const betrieb = String(body?.betrieb ?? '').trim().toLowerCase();
  const aktion = String(body?.aktion ?? '');
  const db = adminDb();

  if (aktion === 'sperren') {
    const grund = String(body?.grund ?? '').trim().slice(0, 300);
    const erlaubt = sperrenErlaubt(betrieb, process.env.ANALYSE_BETREIBER_ID, grund);
    if (!erlaubt.ok) return NextResponse.json({ ok: false, error: erlaubt.fehler }, { status: 400 });
    const { error } = await db.from('betrieb_sperre').upsert({
      owner_user_id: betrieb, grund, gesperrt_am: new Date().toISOString(), gesperrt_von: userId,
      aufgehoben_am: null, aufgehoben_von: null,
    }, { onConflict: 'owner_user_id' });
    if (error) return NextResponse.json({ ok: false, error: 'Sperre konnte nicht gespeichert werden (SQL p177 ausgeführt?).' }, { status: 500 });
    const konten = await kontenLaden(db, betrieb);
    let gebannt = 0;
    const fehler: string[] = [];
    for (const id of konten) {
      const { error: e } = await db.auth.admin.updateUserById(id, { ban_duration: LANG });
      if (e) fehler.push(e.message); else gebannt++;
    }
    return NextResponse.json({ ok: true, gesperrt: true, konten: konten.length, gebannt, hinweis: fehler.length ? `${fehler.length} Konto/Konten konnten beim Anmelde-Dienst nicht gesperrt werden — die Sperre im System gilt trotzdem.` : undefined });
  }

  if (aktion === 'entsperren') {
    const erlaubt = sperrenErlaubt(betrieb, '', 'aufheben');
    if (!erlaubt.ok) return NextResponse.json({ ok: false, error: erlaubt.fehler }, { status: 400 });
    const { error } = await db.from('betrieb_sperre')
      .update({ aufgehoben_am: new Date().toISOString(), aufgehoben_von: userId })
      .eq('owner_user_id', betrieb).is('aufgehoben_am', null);
    if (error) return NextResponse.json({ ok: false, error: 'Aufheben fehlgeschlagen.' }, { status: 500 });
    const konten = await kontenLaden(db, betrieb);
    let frei = 0;
    for (const id of konten) {
      const { error: e } = await db.auth.admin.updateUserById(id, { ban_duration: 'none' });
      if (!e) frei++;
    }
    return NextResponse.json({ ok: true, gesperrt: false, konten: konten.length, freigegeben: frei });
  }

  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}
