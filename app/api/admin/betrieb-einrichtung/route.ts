// ============================================================================
// ARGONAUT OS · app/api/admin/betrieb-einrichtung  (G3 Push 4 · Betriebs-Akte)
//
// BETREIBER-ENDPUNKT. Eine Kundenakte für den Betreiber: einen Betrieb
// anklicken und sehen, was bei DIESEM noch offen ist — und den KI-Berater
// gleich einstellen.
//
//   GET  (ohne betrieb)            → alle Betriebe mit Fortschritt
//   GET  ?betrieb=<owner_user_id>  → Ist-Zustand + Setter-Einstellung
//   POST { betrieb, kanal, rolle, ziel, fragen, uebergabe_bei, buchung_slug, aktiv }
//
// SICHERHEIT — dasselbe Doppelschloss wie /api/admin/whatsapp-eingang:
//   1. profiles.role === 'admin'
//   2. ANALYSE_BETREIBER_ID gesetzt UND identisch
// Ohne gesetzte Betreiber-Kennung kommt niemand durch. Dieser Endpunkt schreibt
// in FREMDE Betriebe — da ist eine vergessene Variable kein Grund zum
// Durchlassen.
//
// WARUM DIE ÜBERSICHT NICHT JE BETRIEB NACHFRAGT
// Bei 200 Betrieben wären das über tausend Abfragen. Stattdessen wird jede
// Tabelle EINMAL gelesen und im Speicher zugeordnet. Wo eine Abfrage scheitert
// oder das Limit voll ausgeschöpft ist, gilt das Feld als `null` — also
// „unbekannt“ und nicht „offen“. Ein Betreiber soll keinen Punkt jagen, der
// längst erledigt ist.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { baueCheckliste, fortschritt, type Bestand } from '@/lib/einrichtung';
import { gebuchteModulKeys, type TenantModulRow } from '@/lib/tenantModule';
import { leseEinstellung, type Frage } from '@/lib/setter';
import { normalisiereFragen, pruefeFragen, heikleFragen } from '@/lib/setterVorlagen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Wie viele Zeilen je Hilfstabelle für die Übersicht gelesen werden. */
const ZUORDNUNG_LIMIT = 10000;
/** Wie viele Betriebe die Übersicht zeigt. */
const BETRIEB_LIMIT = 500;

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

/** Beide Schlösser. null = erlaubt, sonst die fertige Absage. */
async function betreiberGuard(): Promise<NextResponse | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });

  const { data: profil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profil || (profil as { role?: string }).role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }

  const betreiber = process.env.ANALYSE_BETREIBER_ID;
  if (!betreiber || user.id !== betreiber) {
    return NextResponse.json({ ok: false, error: 'Kein Zugriff.' }, { status: 403 });
  }
  return null;
}

type ProfilRow = {
  id: string;
  firma?: string | null;
  company_name?: string | null;
  email?: string | null;
  buchung_slug?: string | null;
  buchung_aktiv?: boolean | null;
};

type Zeile = Record<string, unknown>;
/** Gelesene Zeilen + ob wir ihnen trauen dürfen. `sicher: false` → unbekannt. */
type Ernte = { zeilen: Zeile[]; sicher: boolean };

const LEER: Ernte = { zeilen: [], sicher: false };

/** Nicht leer und keine leere Liste. */
function gefuellt(wert: unknown): boolean {
  if (wert == null) return false;
  if (Array.isArray(wert)) return wert.some((x) => String(x ?? '').trim().length > 0);
  return String(wert).trim().length > 0;
}

function anzeigeName(p: ProfilRow): string {
  return String(p.firma || p.company_name || p.email || p.id);
}

/** Volles Limit heißt: es kann mehr geben, als wir gesehen haben. */
function ernte(data: unknown, error: unknown): Ernte {
  if (error) return LEER;
  const zeilen = (data as Zeile[] | null) ?? [];
  return { zeilen, sicher: zeilen.length < ZUORDNUNG_LIMIT };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const betrieb = (new URL(req.url).searchParams.get('betrieb') || '').trim();
  return betrieb ? einBetrieb(betrieb) : alleBetriebe();
}

// --- Übersicht -------------------------------------------------------------

async function alleBetriebe() {
  const db = adminDb();

  const { data: profileRoh } = await db
    .from('profiles')
    .select('id, firma, company_name, email, buchung_slug, buchung_aktiv')
    .order('firma', { ascending: true })
    .limit(BETRIEB_LIMIT);
  const profile = (profileRoh as ProfilRow[] | null) ?? [];

  const [ci, seiten, dialog, wa, arten, artikel, module] = await Promise.all([
    db.from('web_ci').select('owner_user_id, firma').limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
    db.from('web_seiten').select('owner_user_id, status, chat_domains').limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
    db.from('dialog_einstellung').select('owner_user_id, kanal, rolle, buchung_slug, aktiv').limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
    db.from('whatsapp_zugang').select('owner_user_id, webhook_token, app_secret_verschluesselt, meta_phone_number_id').limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
    db.from('termin_arten').select('owner_user_id').limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
    db.from('artikel').select('owner_user_id').eq('im_shop', true).limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
    db.from('tenant_module').select('owner_user_id, modul_key, aktiv').limit(ZUORDNUNG_LIMIT)
      .then((r) => ernte(r.data, r.error), () => LEER),
  ]);

  /** owner_user_id → true, wenn irgendeine Zeile die Bedingung erfüllt. */
  function nach(quelle: Ernte, trifft: (z: Zeile) => boolean): (id: string) => boolean | null {
    const treffer = new Set<string>();
    for (const z of quelle.zeilen) {
      const owner = String(z.owner_user_id ?? '');
      if (owner && trifft(z)) treffer.add(owner);
    }
    return (id: string) => (treffer.has(id) ? true : quelle.sicher ? false : null);
  }

  const hatCi = nach(ci, (z) => gefuellt(z.firma));
  const hatLive = nach(seiten, (z) => z.status === 'live');
  const hatDomain = nach(seiten, (z) => gefuellt(z.chat_domains));
  const hatSetter = nach(dialog, (z) => z.aktiv === true && String(z.rolle ?? '') === 'setter');
  const hatDialogSlug = nach(dialog, (z) => gefuellt(z.buchung_slug));
  const hatToken = nach(wa, (z) => gefuellt(z.webhook_token));
  const hatSecret = nach(wa, (z) => gefuellt(z.app_secret_verschluesselt));
  const hatNummer = nach(wa, (z) => gefuellt(z.meta_phone_number_id));
  const hatArten = nach(arten, () => true);
  const hatArtikel = nach(artikel, () => true);

  // Module je Betrieb — derselbe Vertrag wie lib/tenantModule.ts: keine Zeile
  // heißt „nie scharf konfiguriert“, und damit gilt alles als gebucht.
  const modulJeOwner = new Map<string, TenantModulRow[]>();
  for (const z of module.zeilen) {
    const owner = String(z.owner_user_id ?? '');
    if (!owner) continue;
    const liste = modulJeOwner.get(owner) ?? [];
    liste.push({ modul_key: String(z.modul_key ?? ''), aktiv: z.aktiv === true });
    modulJeOwner.set(owner, liste);
  }

  const betriebe = profile.map((p) => {
    const slugImDialog = hatDialogSlug(p.id);
    const slugAmProfil = p.buchung_aktiv === true && gefuellt(p.buchung_slug);

    const bestand: Bestand = {
      ciFirma: hatCi(p.id),
      webLive: hatLive(p.id),
      setterEingerichtet: hatSetter(p.id),
      chatDomain: hatDomain(p.id),
      waToken: hatToken(p.id),
      waSecret: hatSecret(p.id),
      waNummer: hatNummer(p.id),
      terminArten: hatArten(p.id),
      buchungSlug: slugImDialog === true || slugAmProfil ? true : slugImDialog,
      shopArtikel: hatArtikel(p.id),
      mailAbsender: null,
      bankZugang: null,
    };

    const gebucht = gebuchteModulKeys(modulJeOwner.get(p.id) ?? null);
    const f = fortschritt(baueCheckliste(bestand, gebucht));
    return { id: p.id, name: anzeigeName(p), ...f };
  });

  return NextResponse.json({ ok: true, betriebe });
}

// --- Einzelner Betrieb -----------------------------------------------------

async function einBetrieb(betrieb: string) {
  const db = adminDb();

  const { data: pRoh } = await db
    .from('profiles')
    .select('id, firma, company_name, email, buchung_slug, buchung_aktiv')
    .eq('id', betrieb)
    .maybeSingle();
  const p = pRoh as ProfilRow | null;
  if (!p) return NextResponse.json({ ok: false, error: 'Betrieb nicht gefunden.' }, { status: 404 });

  /** Mindestens eine Zeile? null = Abfrage kam nicht durch. */
  function jaNein(zahl: { count: number | null; error: unknown }): boolean | null {
    return zahl.error ? null : (zahl.count ?? 0) > 0;
  }

  const [ciR, waR, dialogR, liveR, seitenR, artenR, artikelR, modulR] = await Promise.all([
    db.from('web_ci').select('firma').eq('owner_user_id', betrieb).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('whatsapp_zugang').select('webhook_token, app_secret_verschluesselt, meta_phone_number_id, verbunden')
      .eq('owner_user_id', betrieb).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('dialog_einstellung').select('rolle, ziel, fragen, uebergabe_bei, buchung_slug, aktiv')
      .eq('owner_user_id', betrieb).eq('kanal', 'website').maybeSingle()
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('web_seiten').select('*', { count: 'exact', head: true })
      .eq('owner_user_id', betrieb).eq('status', 'live')
      .then((r) => r, () => ({ count: null, error: true as unknown })),
    db.from('web_seiten').select('chat_domains').eq('owner_user_id', betrieb).limit(50)
      .then((r) => r, () => ({ data: null, error: true as unknown })),
    db.from('termin_arten').select('*', { count: 'exact', head: true }).eq('owner_user_id', betrieb)
      .then((r) => r, () => ({ count: null, error: true as unknown })),
    db.from('artikel').select('*', { count: 'exact', head: true }).eq('owner_user_id', betrieb).eq('im_shop', true)
      .then((r) => r, () => ({ count: null, error: true as unknown })),
    db.from('tenant_module').select('modul_key, aktiv').eq('owner_user_id', betrieb)
      .then((r) => r, () => ({ data: null, error: true as unknown })),
  ]);

  const ci = ciR.error ? null : (ciR.data as { firma?: string } | null);
  const wa = waR.error ? null : (waR.data as Record<string, unknown> | null);
  const dlg = dialogR.error ? null : (dialogR.data as Record<string, unknown> | null);

  const domainZeilen = seitenR.error ? null : ((seitenR.data as Array<{ chat_domains?: unknown }> | null) ?? []);
  const chatDomain = domainZeilen === null ? null : domainZeilen.some((z) => gefuellt(z.chat_domains));

  const slugImDialog = gefuellt(dlg?.buchung_slug);
  const slugAmProfil = p.buchung_aktiv === true && gefuellt(p.buchung_slug);

  const bestand: Bestand = {
    ciFirma: ciR.error ? null : gefuellt(ci?.firma),
    webLive: jaNein(liveR as { count: number | null; error: unknown }),
    setterEingerichtet: dialogR.error ? null : (dlg?.aktiv === true && String(dlg?.rolle ?? '') === 'setter'),
    chatDomain,
    waToken: waR.error ? null : gefuellt(wa?.webhook_token),
    waSecret: waR.error ? null : gefuellt(wa?.app_secret_verschluesselt),
    waNummer: waR.error ? null : gefuellt(wa?.meta_phone_number_id),
    terminArten: jaNein(artenR as { count: number | null; error: unknown }),
    buchungSlug: slugImDialog || slugAmProfil ? true : (dialogR.error ? null : false),
    shopArtikel: jaNein(artikelR as { count: number | null; error: unknown }),
    mailAbsender: null,
    bankZugang: null,
  };

  const modulRoh = modulR.error ? null : ((modulR.data as TenantModulRow[] | null) ?? null);
  const gebucht = gebuchteModulKeys(modulRoh);
  const zeilen = baueCheckliste(bestand, gebucht);

  return NextResponse.json({
    ok: true,
    betrieb: {
      id: p.id,
      name: anzeigeName(p),
      email: p.email ?? '',
      buchungSlugProfil: p.buchung_slug ?? '',
      buchungAktivProfil: p.buchung_aktiv === true,
    },
    zeilen,
    fortschritt: fortschritt(zeilen),
    gebuchteModule: gebucht ? Array.from(gebucht) : null,
    einstellung: leseEinstellung(dlg),
    einstellungAktiv: dlg?.aktiv === true,
    einstellungVorhanden: !!dlg,
  });
}

// ---------------------------------------------------------------------------
// POST — Setter-Einstellung speichern
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const gesperrt = await betreiberGuard();
  if (gesperrt) return gesperrt;

  const body = await req.json().catch(() => null);
  const betrieb = String(body?.betrieb ?? '').trim();
  const kanal = String(body?.kanal ?? 'website').trim().toLowerCase() || 'website';
  const rolle = String(body?.rolle ?? '').trim().toLowerCase() === 'setter' ? 'setter' : 'auskunft';
  const zielRoh = String(body?.ziel ?? '').trim().toLowerCase();
  const ziel = zielRoh === 'termin' || zielRoh === 'rueckruf' ? zielRoh : 'anfrage';
  const aktiv = body?.aktiv !== false;
  const buchungSlug = String(body?.buchung_slug ?? '').trim().toLowerCase();

  if (!betrieb) return NextResponse.json({ ok: false, error: 'Kein Betrieb gewählt.' }, { status: 400 });

  const fragen: Frage[] = normalisiereFragen(Array.isArray(body?.fragen) ? body.fragen : []);
  const uebergabe: string[] = (Array.isArray(body?.uebergabe_bei) ? body.uebergabe_bei : [])
    .map((x: unknown) => String(x ?? '').trim().toLowerCase())
    .filter((x: string) => x.length > 0)
    .slice(0, 60);

  // Die Fragen-Prüfung greift nur beim Setter: Ein reiner Auskunftsgeber stellt
  // keine Fragen — da wäre „mindestens eine Pflichtfrage“ eine sinnlose Hürde.
  if (rolle === 'setter') {
    const fehler = pruefeFragen(fragen);
    if (fehler.length) {
      return NextResponse.json({ ok: false, error: fehler.join(' '), fehler }, { status: 400 });
    }
  }

  const db = adminDb();

  const { data: p } = await db.from('profiles').select('id').eq('id', betrieb).maybeSingle();
  if (!p) return NextResponse.json({ ok: false, error: 'Betrieb nicht gefunden.' }, { status: 404 });

  const felder = {
    rolle,
    ziel,
    fragen,
    uebergabe_bei: uebergabe,
    buchung_slug: buchungSlug || null,
    aktiv,
    aktualisiert_am: new Date().toISOString(),
  };

  const { data: vorhanden } = await db
    .from('dialog_einstellung')
    .select('id')
    .eq('owner_user_id', betrieb)
    .eq('kanal', kanal)
    .maybeSingle();

  let error;
  if (vorhanden) {
    ({ error } = await db
      .from('dialog_einstellung')
      .update(felder)
      .eq('id', (vorhanden as { id: string }).id));
  } else {
    ({ error } = await db
      .from('dialog_einstellung')
      .insert({ owner_user_id: betrieb, kanal, ...felder }));
  }

  if (error) {
    console.error('admin/betrieb-einrichtung:', error.message);
    return NextResponse.json({ ok: false, error: 'Speichern fehlgeschlagen.' }, { status: 500 });
  }

  // Warnungen sind kein Verbot — der Betreiber sieht sie und entscheidet.
  return NextResponse.json({ ok: true, warnungen: heikleFragen(fragen) });
}
