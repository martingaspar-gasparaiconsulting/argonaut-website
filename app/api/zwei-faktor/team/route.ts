import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';
import { helferPlaetze, darfHelferSetzen, darfZuruecksetzen } from '@/lib/zweiFaktorTeam';
import { rolleImBetrieb, maxPersonen, faktorZuruecksetzen } from '@/lib/zweiFaktorTeamServer';
import { pruefeMitarbeiterKonto } from '@/lib/kontoSchutzServer';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/team — Zwei-Faktor im Team (Paket 164 Stufe 2)
//
// GET:  für Geschäftsleitung und Vertretung — Mitarbeiter mit Zugang (nur
//       Namen), offene Hilfe-Anfragen, Vertretungen, freie Plätze.
//       Alle anderen bekommen { rolle: null } (kein Kasten).
// POST: { aktion: 'zuruecksetzen', mitarbeiterId }  — Chef oder Vertretung
//       { aktion: 'helfer', mitarbeiterId, an }        — nur der Chef
// Immer nur mit selbst bestätigtem Code (aal2). Kennung und Betrieb kommen aus
// getUser() bzw. der Datenbank, nie vom Browser. Die Ziele werden mit dem
// Betrieb gefiltert geladen.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function anmeldung() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const stand = await zweiFaktorStand(supabase, user, false);
  return { user, aal2: stand.hatFaktor && stand.aal === 'aal2' };
}

export async function GET() {
  const a = await anmeldung();
  if (!a) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, a.user.id);
  if (ich.rolle !== 'chef' && ich.rolle !== 'helfer') return NextResponse.json({ ok: true, rolle: null });

  const [{ data: ma }, { data: helfer }, { data: anfragen }, max] = await Promise.all([
    admin.from('mitarbeiter').select('id, vorname, nachname, auth_user_id, austrittsdatum').eq('owner_user_id', ich.betrieb).not('auth_user_id', 'is', null).order('nachname').limit(1000),
    admin.from('zwei_faktor_helfer').select('mitarbeiter_id').eq('owner_user_id', ich.betrieb),
    admin.from('zwei_faktor_hilfe').select('id, user_id, name, erstellt_am').eq('owner_user_id', ich.betrieb).eq('status', 'offen').eq('vom_chef', false).order('erstellt_am', { ascending: false }).limit(100),
    maxPersonen(admin, ich.betrieb),
  ]);
  const helferIds = new Set(((helfer ?? []) as { mitarbeiter_id: string }[]).map((h) => h.mitarbeiter_id));
  const liste = ((ma ?? []) as { id: string; vorname: string | null; nachname: string | null; auth_user_id: string }[])
    .filter((m) => m.auth_user_id !== a.user.id)
    .map((m) => ({ id: m.id, name: [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter', helfer: helferIds.has(m.id), userId: m.auth_user_id }));
  const offen = new Set(((anfragen ?? []) as { user_id: string }[]).map((x) => x.user_id));
  return NextResponse.json({
    ok: true, rolle: ich.rolle, aal2: a.aal2,
    plaetze: helferPlaetze(max), belegt: helferIds.size,
    mitarbeiter: liste.map(({ userId, ...m }) => ({ ...m, hilfe: offen.has(userId) })),
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const a = await anmeldung();
  if (!a) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { aktion?: string; mitarbeiterId?: string; an?: boolean };
  if (!body.mitarbeiterId || !/^[0-9a-f-]{36}$/i.test(body.mitarbeiterId)) return NextResponse.json({ ok: false, error: 'Mitarbeiter fehlt.' }, { status: 400 });
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, a.user.id);
  const { data: zielDaten } = await admin.from('mitarbeiter').select('id, vorname, nachname, auth_user_id, email')
    .eq('id', body.mitarbeiterId).eq('owner_user_id', ich.betrieb).maybeSingle();
  const ziel = zielDaten as { id: string; vorname: string | null; nachname: string | null; auth_user_id: string | null; email: string | null } | null;
  if (!ziel || !ziel.auth_user_id) return NextResponse.json({ ok: false, error: 'Mitarbeiter mit Zugang nicht gefunden.' }, { status: 404 });
  const zielName = [ziel.vorname, ziel.nachname].filter(Boolean).join(' ') || 'Mitarbeiter';

  if (body.aktion === 'zuruecksetzen') {
    const d = darfZuruecksetzen({ userId: a.user.id, betrieb: ich.betrieb, rolle: ich.rolle, aal2: a.aal2 }, { userId: ziel.auth_user_id, betrieb: ich.betrieb, istChef: false });
    if (!d.ja) return NextResponse.json({ ok: false, error: d.grund }, { status: 403 });
    // Paket 169 (K2): auth_user_id nie blind vertrauen — Konto muss zu diesem
    // Mitarbeiter dieses Betriebs gehoeren (nie Chef, Betreiber, fremder Betrieb).
    const k = await pruefeMitarbeiterKonto(admin, { zielId: ziel.auth_user_id, betrieb: ich.betrieb, maEmail: ziel.email });
    if (!k.ja) return NextResponse.json({ ok: false, error: k.grund }, { status: 403 });
    const f = await faktorZuruecksetzen(admin, { betrieb: ich.betrieb, zielUserId: ziel.auth_user_id, zielName, durchUserId: a.user.id, durchRolle: ich.rolle as 'chef' | 'helfer' });
    if (f) return NextResponse.json({ ok: false, error: f }, { status: 502 });
    return NextResponse.json({ ok: true, meldung: `Zwei-Faktor-Anmeldung von ${zielName} zurückgesetzt. Daten und Rechte bleiben; beim nächsten Anmelden wird neu eingerichtet.` });
  }

  if (body.aktion === 'helfer') {
    if (ich.rolle !== 'chef') return NextResponse.json({ ok: false, error: 'Nur die Geschäftsleitung bestimmt die Vertretung.' }, { status: 403 });
    if (!a.aal2) return NextResponse.json({ ok: false, error: 'Zuerst selbst mit Code anmelden (Zwei-Faktor-Anmeldung einrichten bzw. bestätigen).' }, { status: 403 });
    if (body.an === false) {
      await admin.from('zwei_faktor_helfer').delete().eq('owner_user_id', ich.betrieb).eq('mitarbeiter_id', ziel.id);
      return NextResponse.json({ ok: true, meldung: `${zielName} ist keine Vertretung mehr.` });
    }
    const [{ data: helfer }, max] = await Promise.all([
      admin.from('zwei_faktor_helfer').select('mitarbeiter_id').eq('owner_user_id', ich.betrieb),
      maxPersonen(admin, ich.betrieb),
    ]);
    const k = await pruefeMitarbeiterKonto(admin, { zielId: ziel.auth_user_id, betrieb: ich.betrieb, maEmail: ziel.email });
    if (!k.ja) return NextResponse.json({ ok: false, error: k.grund }, { status: 403 });
    const liste = ((helfer ?? []) as { mitarbeiter_id: string }[]).map((h) => h.mitarbeiter_id);
    if (!darfHelferSetzen({ rolle: ich.rolle, anzahlHelfer: liste.length, maxPersonen: max, schonHelfer: liste.includes(ziel.id) })) {
      return NextResponse.json({ ok: false, error: `Höchstens ${helferPlaetze(max)} Vertretung(en). Für mehr bitte beim ARGONAUT-Support melden.` }, { status: 409 });
    }
    const { error } = await admin.from('zwei_faktor_helfer').upsert({ owner_user_id: ich.betrieb, mitarbeiter_id: ziel.id, user_id: ziel.auth_user_id, erstellt_von: a.user.id }, { onConflict: 'owner_user_id,user_id' });
    if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar.' }, { status: 500 });
    return NextResponse.json({ ok: true, meldung: `${zielName} darf jetzt als Vertretung zurücksetzen.` });
  }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}
