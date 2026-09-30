import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { zweiFaktorStand } from '@/lib/zweiFaktorServer';
import { rolleImBetrieb } from '@/lib/zweiFaktorTeamServer';
import {
  pflichtStand, einschaltenPruefen, ausschaltenPruefen, neuerPflichtTag, datumDe, UEBERGANG_TAGE,
  type PflichtZeile,
} from '@/lib/zweiFaktorPflicht';

// ============================================================================
// ARGONAUT OS · /api/zwei-faktor/pflicht — Zwei-Faktor-Pflicht je Betrieb (Paket 190)
//
// GET:  nur für die Geschäftsleitung — Stand (aus / Übergangsfrist / Pflicht),
//       Nachweis (wer, wann, Häkchen), wie viele Zugänge noch keinen Faktor haben.
//       Alle anderen bekommen { rolle: null } (keine Karte).
// POST: { an: true, mitarbeiterInformiert: true, betriebsrat: 'einbezogen'|'keiner' }
//       { an: false }
// Nur mit selbst bestätigtem Code (aal2). Betrieb und Rolle kommen aus der
// Datenbank, nie vom Browser. Geschrieben wird nur mit dem Service-Schlüssel;
// die Tabellen haben keine Regel für Nutzer.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
async function zugaengeOhneFaktor(admin: any, betrieb: string): Promise<{ gesamt: number; ohne: number }> {
  const { data } = await admin.from('mitarbeiter').select('auth_user_id, austrittsdatum')
    .eq('owner_user_id', betrieb).not('auth_user_id', 'is', null).limit(1000);
  const heute = new Date().toISOString().slice(0, 10);
  const ids = ((data ?? []) as { auth_user_id: string; austrittsdatum: string | null }[])
    .filter((m) => !m.austrittsdatum || m.austrittsdatum >= heute)
    .map((m) => m.auth_user_id);
  let ohne = 0;
  for (const id of ids.slice(0, 200)) {
    const { data: f, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
    if (error) continue;
    const hat = ((f?.factors ?? []) as { status?: string }[]).some((x) => x.status === 'verified');
    if (!hat) ohne++;
  }
  return { gesamt: ids.length, ohne };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function GET() {
  const a = await anmeldung();
  if (!a) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, a.user.id);
  if (ich.rolle !== 'chef') return NextResponse.json({ ok: true, rolle: null });

  const { data } = await admin.from('zwei_faktor_pflicht')
    .select('an, pflicht_ab, eingeschaltet_am, mitarbeiter_informiert, betriebsrat')
    .eq('owner_user_id', ich.betrieb).maybeSingle();
  const zeile = data as PflichtZeile | null;
  const stand = pflichtStand(zeile, new Date());
  const team = await zugaengeOhneFaktor(admin, ich.betrieb);
  return NextResponse.json({
    ok: true, rolle: 'chef', aal2: a.aal2, uebergangTage: UEBERGANG_TAGE,
    stufe: stand.stufe, pflichtAb: stand.ab, restTage: stand.restTage,
    eingeschaltetAm: zeile?.an ? (zeile.eingeschaltet_am ?? null) : null,
    betriebsrat: zeile?.an ? (zeile.betriebsrat ?? null) : null,
    mitarbeiterGesamt: team.gesamt, mitarbeiterOhneFaktor: team.ohne,
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(req: Request) {
  const a = await anmeldung();
  if (!a) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { an?: unknown; mitarbeiterInformiert?: unknown; betriebsrat?: unknown };
  const admin = createAdminClient();
  const ich = await rolleImBetrieb(admin, a.user.id);
  const jetzt = new Date();

  if (body.an === false) {
    const d = ausschaltenPruefen({ rolle: ich.rolle, aal2: a.aal2 });
    if (!d.ja) return NextResponse.json({ ok: false, error: d.grund }, { status: 403 });
    const { error } = await admin.from('zwei_faktor_pflicht').upsert({
      owner_user_id: ich.betrieb, an: false, ausgeschaltet_am: jetzt.toISOString(), ausgeschaltet_von: a.user.id, geaendert_am: jetzt.toISOString(),
    }, { onConflict: 'owner_user_id' });
    if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar.' }, { status: 500 });
    await admin.from('zwei_faktor_pflicht_protokoll').insert({ owner_user_id: ich.betrieb, aktion: 'aus', durch_user_id: a.user.id });
    return NextResponse.json({ ok: true, meldung: 'Pflicht ausgeschaltet. Wer keinen zweiten Faktor hat, kommt wieder nur mit Passwort hinein.' });
  }

  if (body.an !== true) return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  const d = einschaltenPruefen({ rolle: ich.rolle, aal2: a.aal2, mitarbeiterInformiert: body.mitarbeiterInformiert, betriebsrat: body.betriebsrat });
  if (!d.ja) return NextResponse.json({ ok: false, error: d.grund }, { status: 403 });

  const { data: bisher } = await admin.from('zwei_faktor_pflicht').select('an, pflicht_ab').eq('owner_user_id', ich.betrieb).maybeSingle();
  const warAn = (bisher as PflichtZeile | null)?.an === true;
  const pflichtAb = neuerPflichtTag(bisher as PflichtZeile | null, jetzt);
  const zeile: Record<string, unknown> = {
    owner_user_id: ich.betrieb, an: true, pflicht_ab: pflichtAb,
    mitarbeiter_informiert: true, betriebsrat: d.betriebsrat, geaendert_am: jetzt.toISOString(),
    ausgeschaltet_am: null, ausgeschaltet_von: null,
  };
  if (!warAn) { zeile.eingeschaltet_am = jetzt.toISOString(); zeile.eingeschaltet_von = a.user.id; }
  const { error } = await admin.from('zwei_faktor_pflicht').upsert(zeile, { onConflict: 'owner_user_id' });
  if (error) return NextResponse.json({ ok: false, error: 'Gerade nicht speicherbar.' }, { status: 500 });
  await admin.from('zwei_faktor_pflicht_protokoll').insert({
    owner_user_id: ich.betrieb, aktion: 'an', durch_user_id: a.user.id,
    mitarbeiter_informiert: true, betriebsrat: d.betriebsrat, pflicht_ab: pflichtAb,
  });

  // Glocke an alle Mitarbeiter mit Zugang (nur beim ersten Einschalten).
  if (!warAn) {
    const { data: ma } = await admin.from('mitarbeiter').select('auth_user_id').eq('owner_user_id', ich.betrieb).not('auth_user_id', 'is', null).limit(1000);
    for (const m of (ma ?? []) as { auth_user_id: string }[]) {
      await admin.rpc('benachrichtigung_erstellen', {
        p_owner: m.auth_user_id, p_typ: 'zwei_faktor_pflicht',
        p_titel: 'Zwei-Faktor-Anmeldung wird Pflicht',
        p_nachricht: `Ab ${datumDe(pflichtAb)} geht die Anmeldung nur noch mit Code aus einer Authenticator-App. Einrichten dauert etwa 2 Minuten.`,
        p_link: '/auth/zwei-faktor/einrichten?weiter=/dashboard/mein-bereich', p_ref_tabelle: 'zwei_faktor_pflicht', p_ref_id: ich.betrieb, p_dedup_stunden: 24,
      });
    }
  }
  return NextResponse.json({
    ok: true,
    meldung: warAn
      ? `Pflicht bleibt an (ab ${datumDe(pflichtAb)}).`
      : `Pflicht eingeschaltet. Ab ${datumDe(pflichtAb)} kommt niemand mehr ohne zweiten Faktor ins Dashboard; bis dahin haben alle ${UEBERGANG_TAGE} Tage Zeit. Die Mitarbeiter wurden per Glocke informiert.`,
  });
}
