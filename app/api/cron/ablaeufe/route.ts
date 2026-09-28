import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cronGuard } from '@/lib/cronGuard';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import { fahrplan, type Ablauf, type Schritt } from '@/lib/ablauf';
import {
  ausloeserZiel, nochGueltig, neueStarts, freieStarts, laufbereit, aktionPlanen, zustandNach,
  MAX_ABLAEUFE, MAX_FORTSETZUNGEN, MAX_KANDIDATEN, RUECKBLICK_TAGE, MAX_JE_ABLAUF,
  type AktionPlan, type Ziel,
} from '@/lib/ablaufMotor';
import { ergaenzeKontakte } from '@/lib/ablaufDaten';
import type { Datensatz } from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/cron/ablaeufe — der Motor der Abläufe (Paket 157, 28.09.2026)
//
// Läuft stündlich (vercel.json). Je Durchgang zwei Teile:
//   1. FORTSETZEN: Läufe, deren Wartezeit um ist (auch nach einer Freigabe durch
//      den Chef — die Seite setzt den Lauf dann auf „wartet, weiter ab jetzt").
//      Vorher wird geprüft, ob der Auslöser noch gilt (Rechnung bezahlt ->
//      Lauf endet, statt weiter zu mahnen).
//   2. NEU STARTEN: je eingeschaltetem Ablauf mit „Datum erreicht" die fälligen
//      Vorgänge — EINMALIG je Ablauf und Vorgang (Unique-Index), höchstens
//      MAX_JE_ABLAUF neue Läufe je 24 Stunden, nicht älter als der Rückblick,
//      nichts, was die alte Regel schon erledigt hat.
// Jeder Schritt landet im Protokoll (ablauf_protokoll).
//
// PROBELAUF: ?probe=1 rechnet nur und schreibt NICHTS (keine Läufe, kein Protokoll).
// Einzelner Ablauf: ?ablauf=<id>.
//
// Zugang NUR über das Zeitplan-Geheimnis (CRON_SECRET) — der Betreiber-Weg ist
// bei neuen Endpunkten bewusst zu (siehe lib/cronGuard.ts). Service-Role umgeht
// RLS — deshalb wird überall streng auf owner_user_id gefiltert.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function service() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type Admin = ReturnType<typeof service>;

type AblaufZeile = Ablauf & { id: string; owner_user_id: string; version: number; alt_regel_id: string | null };
type LaufZeile = {
  id: string; owner_user_id: string; ablauf_id: string; version: number; ziel_typ: string | null; ziel_id: string | null;
  status: string; pfad: string | null; kontext: { tabelle?: string } | null;
};
type Ergebnis = { ergebnis: 'ok' | 'fehler' | 'uebersprungen'; meldung: string };

const TAG = 86400000;

// ---------------------------------------------------------------------------
// Einen geplanten Schritt ausführen — nur, was lib/ablaufMotor geplant hat.
// ---------------------------------------------------------------------------
async function fuehreAus(admin: Admin, plan: AktionPlan, ownerId: string): Promise<Ergebnis> {
  if (plan.art === 'uebersprungen') return { ergebnis: 'uebersprungen', meldung: plan.meldung };
  if (plan.art === 'fehler') return { ergebnis: 'fehler', meldung: plan.meldung };
  if (plan.art === 'anlegen') {
    const { error } = await admin.from(plan.tabelle).insert({ ...plan.daten, owner_user_id: ownerId });
    return error ? { ergebnis: 'fehler', meldung: error.message } : { ergebnis: 'ok', meldung: plan.meldung };
  }
  if (plan.art === 'aendern') {
    const { data, error } = await admin.from(plan.tabelle).update(plan.daten)
      .eq('id', plan.id).eq('owner_user_id', ownerId).select('id');
    if (error) return { ergebnis: 'fehler', meldung: error.message };
    if (!data || data.length === 0) return { ergebnis: 'fehler', meldung: 'Vorgang nicht gefunden' };
    return { ergebnis: 'ok', meldung: plan.meldung };
  }
  const marke = await absenderBranding(admin, ownerId);
  const inhalt = plan.text.split('\n').map((z) => `<p style="margin:0 0 10px">${z || '&nbsp;'}</p>`).join('');
  const r = await sendeMail({ an: plan.an, betreff: plan.betreff, html: kundenMailLayout(marke.firma, marke.akzent, plan.betreff, inhalt) });
  return r.ok ? { ergebnis: 'ok', meldung: plan.meldung } : { ergebnis: 'fehler', meldung: r.fehler };
}

async function protokoll(admin: Admin, lauf: LaufZeile, pfad: string | null, schrittTyp: string, ergebnis: string, meldung: string, details: Record<string, unknown> = {}) {
  await admin.from('ablauf_protokoll').insert({
    owner_user_id: lauf.owner_user_id, lauf_id: lauf.id, ablauf_id: lauf.ablauf_id,
    pfad, schritt_typ: schrittTyp, ergebnis, meldung: meldung.slice(0, 500), details,
  });
}

async function setzeLauf(admin: Admin, lauf: LaufZeile, felder: Record<string, unknown>) {
  await admin.from('ablauf_laeufe').update(felder).eq('id', lauf.id).eq('owner_user_id', lauf.owner_user_id);
}

/** Den Fahrplan ab `startPfad` abarbeiten, Protokoll schreiben, Zustand setzen. */
async function arbeiteAb(
  admin: Admin, ablauf: AblaufZeile, schritte: Schritt[], lauf: LaufZeile, startPfad: string | null,
  satz: Datensatz, ziel: Ziel, jetzt: Date,
): Promise<string> {
  const f = fahrplan({ schritte }, startPfad, satz, jetzt);
  for (const e of f.jetzt) {
    if (e.art === 'bedingung') {
      await protokoll(admin, lauf, e.pfad, 'wenn', 'ok', e.ergebnis ? 'Wenn: ja → Dann-Zweig' : 'Wenn: nein → Sonst-Zweig');
      continue;
    }
    const plan = aktionPlanen(e.schritt, ablauf, ziel, lauf.owner_user_id, satz, jetzt);
    let r: Ergebnis;
    try { r = await fuehreAus(admin, plan, lauf.owner_user_id); }
    catch (err: unknown) { r = { ergebnis: 'fehler', meldung: err instanceof Error ? err.message : 'unbekannter Fehler' }; }
    await protokoll(admin, lauf, e.pfad, 'aktion', r.ergebnis, r.meldung, { aktion: e.schritt.aktion });
    if (r.ergebnis === 'fehler') {
      // Nach einem Fehler geht es NICHT weiter — keine Folge-Mail auf kaputter Grundlage.
      await setzeLauf(admin, lauf, { status: 'fehler', pfad: e.pfad, weiter_am: null, meldung: r.meldung.slice(0, 500), beendet_am: jetzt.toISOString() });
      return 'fehler';
    }
  }
  const z = zustandNach(f.danach);
  if (f.danach.art === 'warten') await protokoll(admin, lauf, z.pfad, 'warten', 'wartet', `Wartet bis ${z.weiter_am ?? '—'}`);
  if (f.danach.art === 'freigabe') await protokoll(admin, lauf, f.danach.pfad, 'freigabe', 'freigabe', z.meldung);
  if (f.danach.art === 'stopp') await protokoll(admin, lauf, f.danach.pfad, 'stopp', 'ok', z.meldung);
  const ende = z.status === 'fertig' || z.status === 'gestoppt';
  await setzeLauf(admin, lauf, { status: z.status, pfad: z.pfad, weiter_am: z.weiter_am, meldung: z.meldung, beendet_am: ende ? jetzt.toISOString() : null });
  return z.status;
}

/** Schritte in der Fassung, mit der der Lauf gestartet ist (Versionen). */
async function schritteFuer(admin: Admin, ablauf: AblaufZeile, lauf: LaufZeile): Promise<Schritt[] | null> {
  if (Number(lauf.version) === Number(ablauf.version)) return ablauf.schritte;
  const { data } = await admin.from('ablauf_versionen').select('schritte')
    .eq('ablauf_id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id).eq('version', lauf.version).maybeSingle();
  const s = (data as { schritte?: unknown } | null)?.schritte;
  return Array.isArray(s) ? (s as Schritt[]) : null;
}

// ---------------------------------------------------------------------------
// Der Durchgang
// ---------------------------------------------------------------------------
async function durchgang(req: Request) {
  const absage = await cronGuard(req);
  if (absage) return absage;

  const url = new URL(req.url);
  const probe = url.searchParams.get('probe') === '1';
  const nurAblauf = url.searchParams.get('ablauf');
  const admin = service();
  const jetzt = new Date();
  const bericht: Array<Record<string, unknown>> = [];
  let fortgesetzt = 0, gestartet = 0;

  let q = admin.from('ablaeufe').select('*').eq('aktiv', true).limit(MAX_ABLAEUFE);
  if (nurAblauf) q = q.eq('id', nurAblauf);
  const { data: ablaufDaten, error: ablaufFehler } = await q;
  if (ablaufFehler) return NextResponse.json({ ok: false, error: ablaufFehler.message }, { status: 500 });
  const ablaeufe = ((ablaufDaten ?? []) as AblaufZeile[]).filter((a) => laufbereit(a));
  const nachId = new Map(ablaeufe.map((a) => [a.id, a]));

  // ---- 1) Fortsetzen: Wartezeit um (oder vom Chef freigegeben) -------------
  const { data: wartend } = await admin.from('ablauf_laeufe').select('*')
    .eq('status', 'wartet').eq('probe', false).lte('weiter_am', jetzt.toISOString())
    .order('weiter_am', { ascending: true }).limit(MAX_FORTSETZUNGEN);
  for (const lauf of (wartend ?? []) as LaufZeile[]) {
    const ablauf = nachId.get(lauf.ablauf_id);
    // Ausgeschaltet oder fremd -> der Lauf bleibt stehen, bis der Ablauf wieder an ist.
    if (!ablauf || ablauf.owner_user_id !== lauf.owner_user_id) continue;
    const tabelle = lauf.kontext?.tabelle;
    const ziel = ausloeserZiel(ablauf.ausloeser);
    if (probe) { bericht.push({ ablauf: ablauf.name, lauf: lauf.id, wuerde: 'fortsetzen', ab: lauf.pfad }); continue; }

    // Anspruch anmelden: nur EIN Durchgang setzt einen Lauf fort.
    const { data: meins } = await admin.from('ablauf_laeufe').update({ status: 'laeuft' })
      .eq('id', lauf.id).eq('owner_user_id', lauf.owner_user_id).eq('status', 'wartet').select('id');
    if (!meins || meins.length === 0) continue;

    const schritte = await schritteFuer(admin, ablauf, lauf);
    if (!ziel || !tabelle || tabelle !== ziel.tabelle || !schritte || !lauf.ziel_id) {
      await setzeLauf(admin, lauf, { status: 'abgebrochen', meldung: 'Fassung oder Ziel passt nicht mehr', beendet_am: jetzt.toISOString() });
      continue;
    }
    const { data: satzDaten } = await admin.from(tabelle).select('*').eq('id', lauf.ziel_id).eq('owner_user_id', lauf.owner_user_id).maybeSingle();
    const satz = satzDaten as Datensatz | null;
    if (!satz) {
      await setzeLauf(admin, lauf, { status: 'abgebrochen', meldung: 'Vorgang gibt es nicht mehr', beendet_am: jetzt.toISOString() });
      continue;
    }
    if (!nochGueltig(ablauf.ausloeser, satz)) {
      await protokoll(admin, lauf, lauf.pfad, 'pruefung', 'uebersprungen', 'Auslöser trifft nicht mehr zu (z. B. bezahlt oder erledigt) — Lauf beendet');
      await setzeLauf(admin, lauf, { status: 'abgebrochen', meldung: 'Auslöser trifft nicht mehr zu', beendet_am: jetzt.toISOString() });
      continue;
    }
    await ergaenzeKontakte(admin, lauf.owner_user_id, [satz]);
    await arbeiteAb(admin, ablauf, schritte, lauf, lauf.pfad, satz, ziel, jetzt);
    fortgesetzt++;
  }

  // ---- 2) Neu starten: „Datum erreicht" --------------------------------------
  for (const ablauf of ablaeufe) {
    const ziel = ausloeserZiel(ablauf.ausloeser);
    if (!ziel || ablauf.ausloeser.art !== 'datum') continue;
    const tage = Math.max(0, Math.trunc(Number(ablauf.ausloeser.tage) || 0));

    const { count } = await admin.from('ablauf_laeufe').select('id', { count: 'exact', head: true })
      .eq('ablauf_id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id).eq('probe', false)
      .gte('gestartet_am', new Date(jetzt.getTime() - TAG).toISOString());
    const frei = freieStarts(count ?? 0);

    const { data: roh, error: datenFehler } = await admin.from(ziel.tabelle).select('*')
      .eq('owner_user_id', ablauf.owner_user_id)
      .not(ziel.datumFeld, 'is', null)
      .lte(ziel.datumFeld, jetzt.toISOString())
      .gte(ziel.datumFeld, new Date(jetzt.getTime() - (RUECKBLICK_TAGE + tage + 1) * TAG).toISOString())
      .order(ziel.datumFeld, { ascending: true })
      .limit(MAX_KANDIDATEN);
    if (datenFehler) { bericht.push({ ablauf: ablauf.name, fehler: datenFehler.message }); continue; }
    const kandidaten = (roh ?? []) as Datensatz[];

    const { data: gelaufen } = await admin.from('ablauf_laeufe').select('ziel_id')
      .eq('ablauf_id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id).eq('probe', false).limit(5000);
    const schon = new Set((gelaufen ?? []).map((l) => String((l as { ziel_id: string | null }).ziel_id ?? '')));
    const alt = new Set<string>();
    if (ablauf.alt_regel_id) {
      const { data: log } = await admin.from('automation_log').select('ziel_id')
        .eq('regel_id', ablauf.alt_regel_id).eq('owner_user_id', ablauf.owner_user_id).eq('ergebnis', 'ok').limit(5000);
      for (const l of (log ?? []) as { ziel_id: string | null }[]) alt.add(String(l.ziel_id ?? ''));
    }
    const n = neueStarts(ablauf.ausloeser, kandidaten, schon, alt, frei, jetzt);

    if (probe) {
      bericht.push({ ablauf: ablauf.name, geprueft: kandidaten.length, faellig: n.faellig, wuerde_starten: n.starten.length, zurueckgestellt_wegen_deckel: n.zurueckgestellt });
      continue;
    }

    await ergaenzeKontakte(admin, ablauf.owner_user_id, n.starten);
    let ok = 0;
    for (const satz of n.starten) {
      const { data: neu, error } = await admin.from('ablauf_laeufe').insert({
        owner_user_id: ablauf.owner_user_id, ablauf_id: ablauf.id, version: ablauf.version,
        ziel_typ: ziel.zielTyp, ziel_id: String(satz.id), status: 'laeuft', probe: false,
        kontext: { tabelle: ziel.tabelle, trigger: ablauf.ausloeser.trigger },
      }).select('*').single();
      if (error || !neu) continue;          // 23505 = lief schon (EINMALIG) — kein Drama
      await protokoll(admin, neu as LaufZeile, null, 'start', 'ok', 'Gestartet: Datum erreicht');
      await arbeiteAb(admin, ablauf, ablauf.schritte, neu as LaufZeile, null, satz, ziel, jetzt);
      ok++;
    }
    gestartet += ok;
    await admin.from('ablaeufe').update({ zuletzt_lauf_am: jetzt.toISOString() }).eq('id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id);
    bericht.push({ ablauf: ablauf.name, geprueft: kandidaten.length, faellig: n.faellig, gestartet: ok, zurueckgestellt_wegen_deckel: n.zurueckgestellt });
  }

  return NextResponse.json({
    ok: true, probelauf: probe, zeitpunkt: jetzt.toISOString(),
    ablaeufe_aktiv: ablaeufe.length,
    ...(probe ? {} : { fortgesetzt, gestartet }),
    deckel_je_ablauf_24h: MAX_JE_ABLAUF, rueckblick_tage: RUECKBLICK_TAGE,
    bericht,
  });
}

export async function GET(req: Request) { return durchgang(req); }
export async function POST(req: Request) { return durchgang(req); }
