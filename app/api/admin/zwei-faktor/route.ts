import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { betreiberPruefung } from '@/lib/betreiberGuard';
import { hilfeAnBetreiber, emailNorm, darfZuruecksetzen } from '@/lib/zweiFaktorTeam';
import { faktorZuruecksetzen, rolleImBetrieb } from '@/lib/zweiFaktorTeamServer';

// ============================================================================
// ARGONAUT OS · /api/admin/zwei-faktor — Betreiber-Tür (Paket 164 Stufe 2)
//
// Nur der Betreiber (Doppelschloss betreiberPruefung, mit Faktor nur aal2).
// GET:  offene Hilfe-Anfragen, die beim Betreiber landen (Geschäftsleitung
//       selbst oder länger als 24 h offen)
// POST: { aktion: 'zuruecksetzen', email }  — jeden Zugang (auch Chef)
//       { aktion: 'grenze', email, max }     — Personen je Betrieb (Chef + Vertretungen)
//       { aktion: 'erledigt', id }           — Anfrage schließen
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type NutzerTreffer = { id: string; email?: string | null; factors?: Array<{ status?: string }> };

async function nutzerPerMail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<NutzerTreffer | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const t = (data?.users ?? []).find((u) => String(u.email ?? '').toLowerCase() === email);
    if (t) return t as NutzerTreffer;
    if ((data?.users ?? []).length < 1000) return null;
  }
  return null;
}

export async function GET() {
  const { absage } = await betreiberPruefung();
  if (absage) return absage;
  const admin = createAdminClient();
  const { data } = await admin.from('zwei_faktor_hilfe').select('id, user_id, owner_user_id, name, vom_chef, status, erstellt_am')
    .eq('status', 'offen').order('erstellt_am', { ascending: true }).limit(500);
  const jetzt = new Date();
  const anfragen = ((data ?? []) as { vom_chef: boolean; erstellt_am: string; status: string }[]).filter((x) => hilfeAnBetreiber(x, jetzt));
  return NextResponse.json({ ok: true, anfragen }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const { absage, userId } = await betreiberPruefung();
  if (absage) return absage;
  const body = await req.json().catch(() => ({})) as { aktion?: string; email?: string; max?: number; id?: string };
  const admin = createAdminClient();

  if (body.aktion === 'erledigt') {
    if (!body.id) return NextResponse.json({ ok: false, error: 'Anfrage fehlt.' }, { status: 400 });
    await admin.from('zwei_faktor_hilfe').update({ status: 'erledigt', erledigt_am: new Date().toISOString(), erledigt_durch: userId }).eq('id', body.id);
    return NextResponse.json({ ok: true });
  }

  const email = emailNorm(body.email);
  if (!email) return NextResponse.json({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse.' }, { status: 400 });
  const ziel = await nutzerPerMail(admin, email);
  if (!ziel) return NextResponse.json({ ok: false, error: 'Kein Zugang mit dieser E-Mail gefunden.' }, { status: 404 });
  const rolle = await rolleImBetrieb(admin, ziel.id);

  if (body.aktion === 'zuruecksetzen') {
    // aal2: betreiberPruefung lässt mit Faktor nur bestätigte Sitzungen durch (und bei Pflicht nur mit Faktor).
    const d = darfZuruecksetzen({ userId: userId as string, betrieb: '', rolle: 'betreiber', aal2: true }, { userId: ziel.id, betrieb: rolle.betrieb, istChef: rolle.rolle === 'chef' });
    if (!d.ja) return NextResponse.json({ ok: false, error: d.grund }, { status: 403 });
    const f = await faktorZuruecksetzen(admin, { betrieb: rolle.betrieb, zielUserId: ziel.id, zielName: `${rolle.name} (${email})`, durchUserId: userId as string, durchRolle: 'betreiber' });
    if (f) return NextResponse.json({ ok: false, error: f }, { status: 502 });
    return NextResponse.json({ ok: true, meldung: `Zwei-Faktor-Anmeldung von ${email} zurückgesetzt.` });
  }

  if (body.aktion === 'grenze') {
    if (rolle.rolle !== 'chef') return NextResponse.json({ ok: false, error: 'Bitte die E-Mail der Geschäftsleitung angeben (Grenze gilt je Betrieb).' }, { status: 400 });
    const max = Math.trunc(Number(body.max));
    if (!(max >= 1 && max <= 20)) return NextResponse.json({ ok: false, error: 'Personen je Betrieb: 1 bis 20.' }, { status: 400 });
    const { error } = await admin.from('zwei_faktor_grenze').upsert({ owner_user_id: rolle.betrieb, max_personen: max, geaendert_am: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar.' }, { status: 500 });
    return NextResponse.json({ ok: true, meldung: `Grenze für ${email}: ${max} Personen (Chef + ${max - 1} Vertretung(en)).` });
  }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}
