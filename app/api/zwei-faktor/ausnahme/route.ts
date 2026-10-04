import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';
import { rolleImBetrieb } from '@/lib/zweiFaktorTeamServer';
import { ausnahmePruefen, ausnahmeAktiv, heuteBerlin } from '@/lib/zweiFaktorAusnahme';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/ausnahme — Ausnahmen von der Pflicht (Paket 203 · B4)
//
// GET:  nur Geschäftsleitung — Mitarbeiter-Zugänge (ohne Vertretungen) und die
//       gültigen Ausnahmen. Alle anderen: { rolle: null }.
// POST: { aktion: 'an', mitarbeiterId, grund, bis? } | { aktion: 'aus', mitarbeiterId }
// Nur mit eigenem bestätigtem Code (aal2). Betrieb, Rolle und Ziel kommen aus
// der Datenbank, nie vom Browser. Geschrieben wird nur mit dem Server-Schlüssel
// (SQL p203: keine Regel für Nutzer). Aufheben löscht nichts (Nachweis).
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

type MaZeile = { id: string; auth_user_id: string | null; vorname: string | null; nachname: string | null; austrittsdatum: string | null };
type AusZeile = { id: string; mitarbeiter_id: string; auth_user_id: string; grund: string; bis: string | null; angelegt_am: string; aufgehoben_am: string | null };

export async function GET() {
  const a = await anmeldung();
  if (!a) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, a.user.id);
  if (ich.rolle !== 'chef') return NextResponse.json({ ok: true, rolle: null });

  const heute = heuteBerlin();
  const { data: ma } = await admin.from('mitarbeiter').select('id, auth_user_id, vorname, nachname, austrittsdatum')
    .eq('owner_user_id', ich.betrieb).not('auth_user_id', 'is', null).limit(1000);
  const { data: helfer } = await admin.from('zwei_faktor_helfer').select('user_id').eq('owner_user_id', ich.betrieb);
  const helferIds = new Set(((helfer ?? []) as { user_id: string }[]).map((h) => h.user_id));
  const { data: aus, error } = await admin.from('zwei_faktor_ausnahme')
    .select('id, mitarbeiter_id, auth_user_id, grund, bis, angelegt_am, aufgehoben_am')
    .eq('owner_user_id', ich.betrieb).is('aufgehoben_am', null);
  if (error) return NextResponse.json({ ok: true, rolle: 'chef', bereit: false, mitarbeiter: [], ausnahmen: [] });

  const mitarbeiter = ((ma ?? []) as MaZeile[])
    .filter((m) => !m.austrittsdatum || m.austrittsdatum >= heute)
    .filter((m) => m.auth_user_id && !helferIds.has(m.auth_user_id))
    .map((m) => ({ id: m.id, name: [m.vorname, m.nachname].filter(Boolean).join(' ') || 'Mitarbeiter' }));
  const ausnahmen = ((aus ?? []) as AusZeile[])
    .filter((z) => ausnahmeAktiv(z))
    .map((z) => ({ mitarbeiterId: z.mitarbeiter_id, grund: z.grund, bis: z.bis, angelegtAm: z.angelegt_am }));
  return NextResponse.json({ ok: true, rolle: 'chef', bereit: true, aal2: a.aal2, mitarbeiter, ausnahmen }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const a = await anmeldung();
  if (!a) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { aktion?: unknown; mitarbeiterId?: unknown; grund?: unknown; bis?: unknown };
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, a.user.id);
  if (ich.rolle !== 'chef') return NextResponse.json({ ok: false, error: 'Ausnahmen legt nur die Geschäftsleitung fest.' }, { status: 403 });
  if (!a.aal2) return NextResponse.json({ ok: false, error: 'Zuerst selbst mit Code anmelden.' }, { status: 403 });

  const mitarbeiterId = typeof body.mitarbeiterId === 'string' ? body.mitarbeiterId : '';
  if (!/^[0-9a-f-]{36}$/i.test(mitarbeiterId)) return NextResponse.json({ ok: false, error: 'Kein Mitarbeiter gewählt.' }, { status: 400 });
  const { data: zielRoh } = await admin.from('mitarbeiter').select('id, auth_user_id, owner_user_id')
    .eq('id', mitarbeiterId).eq('owner_user_id', ich.betrieb).maybeSingle();
  const ziel = zielRoh as { id: string; auth_user_id: string | null } | null;
  const jetzt = new Date().toISOString();

  if (body.aktion === 'aus') {
    const { error } = await admin.from('zwei_faktor_ausnahme')
      .update({ aufgehoben_am: jetzt, aufgehoben_von: a.user.id })
      .eq('owner_user_id', ich.betrieb).eq('mitarbeiter_id', mitarbeiterId).is('aufgehoben_am', null);
    if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar.' }, { status: 500 });
    return NextResponse.json({ ok: true, meldung: 'Ausnahme aufgehoben. Bei eingeschalteter Pflicht richtet die Person beim nächsten Anmelden ihren zweiten Faktor ein.' });
  }
  if (body.aktion !== 'an') return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });

  let zielRolle: string | null = null;
  if (ziel?.auth_user_id) zielRolle = (await rolleImBetrieb(admin, ziel.auth_user_id)).rolle;
  const d = ausnahmePruefen({ rolle: ich.rolle, aal2: a.aal2, zielRolle, zielHatZugang: !!ziel?.auth_user_id, grund: body.grund, bis: body.bis });
  if (!d.ja) return NextResponse.json({ ok: false, error: d.fehler }, { status: 400 });

  // Eine gültige Ausnahme je Person: alte erst aufheben (Nachweis bleibt).
  await admin.from('zwei_faktor_ausnahme')
    .update({ aufgehoben_am: jetzt, aufgehoben_von: a.user.id })
    .eq('owner_user_id', ich.betrieb).eq('mitarbeiter_id', mitarbeiterId).is('aufgehoben_am', null);
  const { error } = await admin.from('zwei_faktor_ausnahme').insert({
    owner_user_id: ich.betrieb, mitarbeiter_id: mitarbeiterId, auth_user_id: ziel!.auth_user_id,
    grund: d.grund, bis: d.bis, angelegt_von: a.user.id,
  });
  if (error) return NextResponse.json({ ok: false, error: /zwei_faktor_ausnahme/.test(error.message) ? 'Diese Funktion wird gerade eingerichtet (SQL p203 fehlt).' : 'Gerade nicht speicherbar.' }, { status: 500 });
  return NextResponse.json({ ok: true, meldung: 'Ausnahme gespeichert. Diese Person meldet sich auch bei eingeschalteter Pflicht ohne zweiten Faktor an.' });
}
