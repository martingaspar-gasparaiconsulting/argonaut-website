import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { betreiberGuard } from '../../../../lib/betreiberGuard';
import { DEMO_TOKEN } from '../../../../lib/beispielKern';
import { ZUGANG_TABELLEN, REGISTER_TABELLE } from '../../../../lib/uebungswelt';
import {
  XXL_EMAIL, XXL_KENNZEICHEN, XXL_PROFIL, alleModuleXxl, xxlPasswort, istXxlKonto,
  zeilenSichern, neuerKontext, kontextErgaenzen, gruppenZaehlung, type XxlGruppe,
} from '../../../../lib/musterbetriebXxl';
import { XXL_ALLE_SEEDER, loeschPlanAlle } from '../../../../lib/musterbetriebXxlBranchen';

// ============================================================================
// ARGONAUT OS · app/api/admin/musterbetrieb-xxl/route.ts — Paket 179
//
// Ein Knopf im Command Center: legt EIN Konto „Musterbetrieb XXL" an, schaltet
// alle Module frei und füllt jedes Modul mit Beispieldaten (lib/musterbetriebXxl,
// Push 2: Branchen-Module aus lib/musterbetriebXxlBranchen).
// Löschen entfernt exakt, was im Register steht, danach das Konto selbst.
//
// Schutz:
//   · Nur der Betreiber (betreiberGuard: Rolle admin + ANALYSE_BETREIBER_ID +
//     Zwei-Faktor, wenn eingerichtet).
//   · Gelöscht wird nur ein Konto mit der festen Adresse UND dem Kennzeichen
//     app_metadata.argonaut_musterbetrieb_xxl — nie ein echter Betrieb.
//   · Jeder Löschbefehl trägt zusätzlich owner_user_id = Musterbetrieb.
//   · Das Passwort wird zufällig erzeugt und NUR in der Antwort gezeigt.
//
// Body: { aktion: 'status' | 'anlegen' | 'loeschen' }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}
type Admin = ReturnType<typeof service>;

/** Das Musterbetrieb-Konto finden (über profiles.email, dann Konto prüfen). */
async function kontoFinden(admin: Admin): Promise<{ id: string; gueltig: boolean } | null> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', XXL_EMAIL).maybeSingle();
  const id = (p?.id as string | undefined) || null;
  if (!id) return null;
  const { data } = await admin.auth.admin.getUserById(id);
  return { id, gueltig: istXxlKonto(data?.user ?? null) };
}

async function registerZaehlen(admin: Admin, uid: string): Promise<number> {
  const { count } = await admin.from(REGISTER_TABELLE).select('*', { count: 'exact', head: true }).eq('owner_user_id', uid);
  return count || 0;
}

async function status(admin: Admin) {
  const k = await kontoFinden(admin);
  if (!k) return NextResponse.json({ ok: true, vorhanden: false, email: XXL_EMAIL });
  return NextResponse.json({
    ok: true, vorhanden: true, gueltig: k.gueltig, email: XXL_EMAIL, datensaetze: await registerZaehlen(admin, k.id),
  });
}

async function anlegen(admin: Admin) {
  if (await kontoFinden(admin)) {
    return NextResponse.json({ ok: false, error: 'Der Musterbetrieb existiert schon. Bitte zuerst löschen.' }, { status: 409 });
  }
  const passwort = xxlPasswort();
  const { data: neu, error: kontoFehler } = await admin.auth.admin.createUser({
    email: XXL_EMAIL,
    password: passwort,
    email_confirm: true,                                   // bestätigt -> es geht keine Mail raus
    app_metadata: { [XXL_KENNZEICHEN]: true },
    user_metadata: { demo_betrieb: true },
  });
  const uid = neu?.user?.id;
  if (kontoFehler || !uid) {
    return NextResponse.json({ ok: false, error: `Konto: ${kontoFehler?.message || 'nicht angelegt'}` }, { status: 500 });
  }

  const hinweise: string[] = [];
  const heute = new Date().toISOString().slice(0, 10);

  // Profil (Update, falls der Anmelde-Trigger schon eine Zeile angelegt hat, sonst Insert).
  const profil = {
    email: XXL_EMAIL, ...XXL_PROFIL, firma_email: XXL_EMAIL,
    status: 'active', demo: true, demo_ablauf: null, onboarding_completed: true,
  };
  const { data: upd, error: updErr } = await admin.from('profiles').update(profil).eq('id', uid).select('id');
  if (updErr) hinweise.push(`Profil: ${updErr.message}`);
  else if (!upd || upd.length === 0) {
    const { error } = await admin.from('profiles').insert({ id: uid, ...profil });
    if (error) hinweise.push(`Profil anlegen: ${error.message}`);
  }

  // Alle Module scharf.
  const module = alleModuleXxl().map((modul_key) => ({ owner_user_id: uid, modul_key, aktiv: true }));
  const { error: modErr } = await admin.from('tenant_module').upsert(module, { onConflict: 'owner_user_id,modul_key' });
  if (modErr) hinweise.push(`Module: ${modErr.message}`);

  // Seeder der Reihe nach; eine Schicht darf die anderen nicht stoppen.
  const ctx = neuerKontext(uid, heute);
  const angelegt: Array<{ gruppe: XxlGruppe; anzahl: number }> = [];
  const jeTabelle: Record<string, number> = {};
  for (const s of XXL_ALLE_SEEDER) {
    let zeilen;
    try { zeilen = zeilenSichern(s.baue(ctx), uid); } catch (e) {
      hinweise.push(`${s.key}: ${e instanceof Error ? e.message : 'Bau fehlgeschlagen'}`);
      continue;
    }
    if (!zeilen.length) continue;

    if (s.zugang) {
      const { error } = await admin.from(s.tabelle).insert(zeilen);
      if (error) hinweise.push(`${s.key}: ${error.message}`);
      else { angelegt.push({ gruppe: s.gruppe, anzahl: zeilen.length }); jeTabelle[s.tabelle] = (jeTabelle[s.tabelle] || 0) + zeilen.length; }
      continue;
    }

    const { data, error } = await admin.from(s.tabelle).insert(zeilen).select('id');
    if (error || !data) { hinweise.push(`${s.key}: ${error?.message || 'keine Daten'}`); continue; }
    const ids = (data as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
    if (!ids.length) continue;
    const { error: regErr } = await admin.from(REGISTER_TABELLE).insert(
      ids.map((datensatz_id) => ({ owner_user_id: uid, tabelle: s.tabelle, datensatz_id })),
    );
    if (regErr) hinweise.push(`Register ${s.key}: ${regErr.message}`);
    kontextErgaenzen(ctx, s.tabelle, ids, zeilen);
    angelegt.push({ gruppe: s.gruppe, anzahl: ids.length });
    jeTabelle[s.tabelle] = (jeTabelle[s.tabelle] || 0) + ids.length;
  }

  return NextResponse.json({
    ok: true, email: XXL_EMAIL, passwort, module: module.length,
    datensaetze: angelegt.reduce((s, a) => s + a.anzahl, 0),
    gruppen: gruppenZaehlung(angelegt), tabellen: jeTabelle, hinweise,
  });
}

async function loeschen(admin: Admin) {
  const k = await kontoFinden(admin);
  if (!k) return NextResponse.json({ ok: true, entfernt: 0, hinweise: ['Kein Musterbetrieb vorhanden.'] });
  if (!k.gueltig) {
    // Adresse passt, Kennzeichen fehlt: NICHT anfassen.
    return NextResponse.json({ ok: false, error: 'Konto ohne Musterbetrieb-Kennzeichen — wird nicht gelöscht.' }, { status: 409 });
  }
  const uid = k.id;
  const hinweise: string[] = [];
  let entfernt = 0;

  const { data: reg } = await admin.from(REGISTER_TABELLE).select('tabelle, datensatz_id').eq('owner_user_id', uid);
  for (const schritt of loeschPlanAlle((reg as Array<{ tabelle: string; datensatz_id: string }> | null) || [])) {
    for (let i = 0; i < schritt.ids.length; i += 200) {
      const teil = schritt.ids.slice(i, i + 200);
      const { error } = await admin.from(schritt.tabelle).delete().in('id', teil).eq('owner_user_id', uid);
      if (error) hinweise.push(`${schritt.tabelle}: ${error.message}`);
      else entfernt += teil.length;
    }
  }
  for (const tab of ZUGANG_TABELLEN) {
    const { error } = await admin.from(tab).delete().eq('owner_user_id', uid).eq('token_verschluesselt', DEMO_TOKEN);
    if (error) hinweise.push(`${tab}: ${error.message}`);
  }
  await admin.from(REGISTER_TABELLE).delete().eq('owner_user_id', uid);
  await admin.from('tenant_module').delete().eq('owner_user_id', uid);
  await admin.from('onboarding_schritte').delete().eq('owner_user_id', uid);

  // Konto zuletzt. Hängt noch etwas daran, bleibt es stehen und der Bericht sagt, woran.
  let { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    await admin.from('profiles').delete().eq('id', uid);
    ({ error: delErr } = await admin.auth.admin.deleteUser(uid));
  }
  if (delErr) hinweise.push(`Konto: ${delErr.message}`);

  return NextResponse.json({ ok: true, entfernt, kontoGeloescht: !delErr, hinweise });
}

export async function POST(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;
  try {
    const body = await req.json().catch(() => ({}));
    const aktion = String((body as { aktion?: unknown })?.aktion || '');
    const admin = service();
    if (aktion === 'status') return await status(admin);
    if (aktion === 'anlegen') return await anlegen(admin);
    if (aktion === 'loeschen') return await loeschen(admin);
    return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  } catch (e) {
    console.error('musterbetrieb-xxl:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: 'Interner Fehler.' }, { status: 500 });
  }
}
