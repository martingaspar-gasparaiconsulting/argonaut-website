import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../../../../lib/supabase-server';
import { DEMO_BETRIEBE, demoEmail, demoPasswort, type DemoBetrieb } from '../../../../lib/demoBetriebe';
import { kategorieModule } from '../../../../lib/branchenkatalog';
import { aktiveSeeder } from '../../../../lib/uebungswelt';
import { branchenSchritte } from '../../../../lib/onboardingBranchen';

// ============================================================================
// ARGONAUT OS · app/api/admin/demo-betriebe/route.ts
//
// Legt die 21 Vorführ-Betriebe für die Präsentation an — auf einen Klick.
//
// Warum als Route und nicht als Skript: Konten anlegen braucht den Service-Role-
// Schlüssel, und der liegt ausschließlich in Vercel. Diese Route läuft dort,
// hinter dem Admin-Guard, und macht je Betrieb:
//
//   1. Auth-Konto anlegen (email_confirm: true → es geht KEINE Mail raus)
//   2. profiles füllen: Firma, Anschrift, Steuernummern, IBAN, Branche,
//      Kategorie, demo = true OHNE Ablaufdatum
//   3. Branchen-Module scharfschalten (tenant_module)
//   4. Übungswelt einspielen (dieselben Seeder wie der Kundenknopf)
//   5. Onboarding-Häkchen bis zum Zielprozentsatz setzen
//
// EIGENSCHAFTEN, die für einen Live-Termin wichtig sind:
//   · Wiederholbar. Ein zweiter Aufruf legt nichts doppelt an, sondern
//     aktualisiert die Stammdaten und ergänzt nur, was fehlt.
//   · Nichts bricht die Schleife ab. Jeder Betrieb wird einzeln abgesichert;
//     was schiefgeht, steht im Ergebnis-Bericht statt in einem 500er.
//   · Der Bericht sagt je Betrieb, WAS angelegt wurde — damit man am Testtag
//     sieht, ob wirklich alles steht, statt es zu hoffen.
//
// Body (alles optional):
//   { nur: ['maler','baeckerei'] }  → nur diese Betriebe
//   { zuruecksetzen: true }         → Übungswelt vorher entfernen und neu laden
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type Admin = ReturnType<typeof service>;

async function adminGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'nicht angemeldet' }, { status: 401 });
  const { data: profil } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profil || profil.role !== 'admin') return NextResponse.json({ ok: false, error: 'kein Zugriff' }, { status: 403 });
  return null;
}

type Ergebnis = {
  slug: string;
  firma: string;
  email: string;
  passwort: string;
  userId: string | null;
  neu: boolean;
  module: number;
  datensaetze: number;
  haken: number;
  prozent: number;
  hinweise: string[];
};

/** Auth-Konto anlegen — oder die ID eines schon vorhandenen Kontos finden. */
async function konto(admin: Admin, email: string, passwort: string): Promise<{ id: string | null; neu: boolean; fehler?: string }> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: passwort,
    email_confirm: true,               // bestätigt sofort -> Supabase verschickt nichts
    user_metadata: { demo_betrieb: true },
  });
  if (!error && data?.user?.id) return { id: data.user.id, neu: true };

  // Schon vorhanden: über profiles.email nachschlagen und das Passwort erneuern,
  // damit das Zugangsblatt in jedem Fall stimmt.
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  const id = (p?.id as string | undefined) || null;
  if (id) {
    await admin.auth.admin.updateUserById(id, { password: passwort, email_confirm: true });
    return { id, neu: false };
  }
  return { id: null, neu: false, fehler: error?.message || 'Konto weder anlegbar noch auffindbar' };
}

/** Stammdaten ins Profil schreiben. Update-or-insert, ohne role anzufassen. */
async function profilSetzen(admin: Admin, userId: string, b: DemoBetrieb, email: string): Promise<string[]> {
  const hinweise: string[] = [];
  const felder: Record<string, unknown> = {
    email,
    firma_name: `${b.firma} ${b.rechtsform}`.trim(),
    firma_strasse: b.strasse,
    firma_plz: b.plz,
    firma_ort: b.ort,
    firma_telefon: b.telefon,
    firma_email: email,
    firma_website: b.website,
    firma_rechtsform: b.rechtsform,
    firma_geschaeftsfuehrer: b.inhaber,
    firma_ust_id: b.ustId,
    firma_steuernummer: b.steuernummer,
    firma_iban: b.iban,
    firma_bank: b.bank,
    firma_bic: b.bic,
    sepa_iban: b.iban,
    branche: b.branche,
    kategorie: b.kategorie,
    status: 'active',
    demo: true,
    demo_ablauf: null,                 // unbegrenzt: stirbt vor der Präsentation nicht weg
    onboarding_completed: b.ziel >= 100,
  };

  const { data: upd, error: updErr } = await admin.from('profiles').update(felder).eq('id', userId).select('id');
  if (updErr) {
    // Eine unbekannte Spalte darf den Betrieb nicht kosten -> auf den harten Kern zurückfallen.
    hinweise.push(`Profil nur teilweise gesetzt (${updErr.message})`);
    const kern = {
      email, firma_name: felder.firma_name, branche: b.branche, kategorie: b.kategorie,
      status: 'active', demo: true, demo_ablauf: null,
    };
    const { error: kernErr } = await admin.from('profiles').update(kern).eq('id', userId);
    if (kernErr) hinweise.push(`Profil-Kern fehlgeschlagen: ${kernErr.message}`);
    return hinweise;
  }
  if (!upd || upd.length === 0) {
    const { error: insErr } = await admin.from('profiles').insert({ id: userId, ...felder });
    if (insErr) hinweise.push(`Profil anlegen fehlgeschlagen: ${insErr.message}`);
  }
  return hinweise;
}

/** Branchen-Module scharfschalten. */
async function moduleSetzen(admin: Admin, userId: string, kategorie: string): Promise<{ anzahl: number; hinweis?: string }> {
  const keys = kategorieModule(kategorie);
  const rows = keys.map((modul_key) => ({ owner_user_id: userId, modul_key, aktiv: true }));
  const { error } = await admin.from('tenant_module').upsert(rows, { onConflict: 'owner_user_id,modul_key' });
  return error ? { anzahl: 0, hinweis: `Module: ${error.message}` } : { anzahl: rows.length };
}

/** Übungswelt einspielen — dieselben Seeder wie beim Kundenknopf. */
async function weltLaden(
  admin: Admin, userId: string, kategorie: string, heute: string, zuruecksetzen: boolean,
): Promise<{ anzahl: number; hinweise: string[] }> {
  const hinweise: string[] = [];

  const { count: schon } = await admin
    .from('beispiel_datensatz').select('*', { count: 'exact', head: true }).eq('owner_user_id', userId);

  if ((schon || 0) > 0) {
    if (!zuruecksetzen) return { anzahl: schon || 0, hinweise: ['Übungswelt war schon geladen'] };
    const { data: reg } = await admin
      .from('beispiel_datensatz').select('tabelle, datensatz_id').eq('owner_user_id', userId);
    const proTabelle = new Map<string, string[]>();
    for (const r of ((reg as Array<{ tabelle: string; datensatz_id: string }> | null) || [])) {
      const arr = proTabelle.get(r.tabelle) || [];
      arr.push(r.datensatz_id);
      proTabelle.set(r.tabelle, arr);
    }
    for (const [tab, ids] of proTabelle) {
      const { error } = await admin.from(tab).delete().in('id', ids);
      if (error) hinweise.push(`Aufräumen ${tab}: ${error.message}`);
    }
    await admin.from('beispiel_datensatz').delete().eq('owner_user_id', userId);
  }

  let anzahl = 0;
  for (const s of aktiveSeeder(kategorie)) {
    const zeilen = s.baue(kategorie, userId, heute);
    if (!zeilen.length) continue;
    const { data, error } = await admin.from(s.tabelle).insert(zeilen).select('id');
    if (error || !data) {
      hinweise.push(`${s.key}: ${error?.message || 'keine Daten'}`);
      continue;
    }
    const ids = (data as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
    if (!ids.length) continue;
    await admin.from('beispiel_datensatz').insert(
      ids.map((id) => ({ owner_user_id: userId, tabelle: s.tabelle, datensatz_id: id })),
    );
    anzahl += ids.length;
  }
  return { anzahl, hinweise };
}

/**
 * Onboarding-Häkchen setzen, bis der Zielprozentsatz erreicht ist.
 *
 * Die Startstrecke besteht aus 10 universellen plus den Branchenschritten. Wir
 * setzen so viele Häkchen, dass gerundet der Zielwert herauskommt — bei 100 %
 * alle. Firmendaten, IBAN, Kontakte, Angebote und Rechnungen erkennt die Seite
 * ohnehin automatisch; ein zusätzliches Häkchen darauf stört nicht.
 */
const UNI_KEYS = ['firma', 'logo', 'bank', 'import', 'kontakt', 'angebot', 'rechnung', 'zahlung', 'anschluesse', 'module'];

async function haekchenSetzen(
  admin: Admin, userId: string, kategorie: string, ziel: number, heute: string,
): Promise<{ gesetzt: number; prozent: number; hinweis?: string }> {
  const alle = [...UNI_KEYS, ...branchenSchritte(kategorie).map((s) => s.key)];
  const wieViele = Math.min(alle.length, Math.round((Math.max(0, Math.min(100, ziel)) / 100) * alle.length));
  const rows = alle.slice(0, wieViele).map((schritt_key) => ({
    owner_user_id: userId, schritt_key, erledigt: true, erledigt_am: `${heute}T09:00:00.000Z`,
  }));
  // Alte Häkchen entfernen, damit ein zweiter Lauf den Stand nicht nach oben schiebt.
  await admin.from('onboarding_schritte').delete().eq('owner_user_id', userId);
  if (!rows.length) return { gesetzt: 0, prozent: 0 };
  const { error } = await admin.from('onboarding_schritte').insert(rows);
  const prozent = alle.length ? Math.round((rows.length / alle.length) * 100) : 0;
  return error ? { gesetzt: 0, prozent: 0, hinweis: `Onboarding: ${error.message}` } : { gesetzt: rows.length, prozent };
}

async function lauf(req: Request) {
  const gesperrt = await adminGuard();
  if (gesperrt) return gesperrt;

  let body: { nur?: unknown; zuruecksetzen?: boolean } = {};
  try { body = await req.json(); } catch { /* leerer Body ist erlaubt */ }

  const nur = Array.isArray(body.nur) ? body.nur.map((x) => String(x)) : [];
  const zuruecksetzen = body.zuruecksetzen === true;
  const liste = nur.length ? DEMO_BETRIEBE.filter((b) => nur.includes(b.slug)) : DEMO_BETRIEBE;

  const admin = service();
  const heute = new Date().toISOString().slice(0, 10);
  const ergebnisse: Ergebnis[] = [];

  for (const b of liste) {
    const email = demoEmail(b.slug);
    const passwort = demoPasswort(b.slug);
    const e: Ergebnis = {
      slug: b.slug, firma: `${b.firma} ${b.rechtsform}`.trim(), email, passwort,
      userId: null, neu: false, module: 0, datensaetze: 0, haken: 0, prozent: 0, hinweise: [],
    };

    try {
      const k = await konto(admin, email, passwort);
      if (!k.id) {
        e.hinweise.push(k.fehler || 'Konto konnte nicht angelegt werden');
        ergebnisse.push(e);
        continue;
      }
      e.userId = k.id;
      e.neu = k.neu;

      e.hinweise.push(...await profilSetzen(admin, k.id, b, email));

      const m = await moduleSetzen(admin, k.id, b.kategorie);
      e.module = m.anzahl;
      if (m.hinweis) e.hinweise.push(m.hinweis);

      const w = await weltLaden(admin, k.id, b.kategorie, heute, zuruecksetzen);
      e.datensaetze = w.anzahl;
      e.hinweise.push(...w.hinweise);

      const h = await haekchenSetzen(admin, k.id, b.kategorie, b.ziel, heute);
      e.haken = h.gesetzt;
      e.prozent = h.prozent;
      if (h.hinweis) e.hinweise.push(h.hinweis);
    } catch (err) {
      e.hinweise.push(err instanceof Error ? err.message : 'unbekannter Fehler');
    }

    ergebnisse.push(e);
  }

  return NextResponse.json({
    ok: true,
    betriebe: ergebnisse.length,
    neu: ergebnisse.filter((x) => x.neu).length,
    mitHinweis: ergebnisse.filter((x) => x.hinweise.length > 0).length,
    ergebnisse,
  });
}

export async function POST(req: Request) {
  return lauf(req);
}
