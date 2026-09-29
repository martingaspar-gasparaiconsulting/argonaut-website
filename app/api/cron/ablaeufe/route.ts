import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cronGuard } from '@/lib/cronGuard';
import { ausloeserHatVorgang } from '@/lib/ablauf';
import {
  ausloeserZiel, nochGueltig, neueStarts, freieStarts, laufbereit, OHNE_VORGANG,
  MAX_ABLAEUFE, MAX_FORTSETZUNGEN, MAX_KANDIDATEN, RUECKBLICK_TAGE, MAX_JE_ABLAUF,
  MAX_EREIGNISSE, ereignisZuAlt, massenanlage, passendeAblaeufe, ereignisTrifft, type EreignisZeile,
} from '@/lib/ablaufMotor';
import { zeitplanSlot, slotKennung } from '@/lib/ablaufZeit';
import {
  arbeiteAb, schritteFuer, protokoll, setzeLauf, starteLauf,
  type AblaufZeile, type LaufZeile,
} from '@/lib/ablaufAusfuehren';
import { ergaenzeKontakte } from '@/lib/ablaufDaten';
import type { Datensatz } from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/cron/ablaeufe — der Motor der Abläufe (Paket 157, 28.09.2026)
//
// Läuft stündlich (vercel.json). Je Durchgang drei Teile:
//   1. FORTSETZEN: Läufe, deren Wartezeit um ist (auch nach einer Freigabe durch
//      den Chef — die Seite setzt den Lauf dann auf „wartet, weiter ab jetzt").
//      Bei Läufen mit Vorgang wird vorher geprüft, ob der Auslöser noch gilt
//      (Rechnung bezahlt -> Lauf endet, statt weiter zu mahnen).
//   2. NEU STARTEN „Datum erreicht": je eingeschaltetem Ablauf die fälligen
//      Vorgänge — EINMALIG je Ablauf und Vorgang (Unique-Index), höchstens
//      MAX_JE_ABLAUF neue Läufe je 24 Stunden, nicht älter als der Rückblick,
//      nichts, was die alte Regel schon erledigt hat.
//   3. ZEITPLAN (Paket 159): fälliger Slot in Berliner Zeit, je Slot genau ein
//      Lauf (feste Kennung aus Ablauf + Slot, derselbe Unique-Index).
//   4. EREIGNIS (Paket 166): Warteschlange ablauf_ereignisse (füllt die
//      Datenbank per Trigger). Zu alt / Massenanlage (Import) -> nichts;
//      sonst je passendem Ablauf ein Lauf (EINMALIG, Deckel je 24 h).
// Abgearbeitet wird in lib/ablaufAusfuehren.ts (gemeinsam mit dem Knopf).
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

const TAG = 86400000;

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
  let fortgesetzt = 0, gestartet = 0, zeitplaene = 0;

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
    const mitVorgang = ausloeserHatVorgang(ablauf.ausloeser);
    if (probe) { bericht.push({ ablauf: ablauf.name, lauf: lauf.id, wuerde: 'fortsetzen', ab: lauf.pfad }); continue; }

    // Anspruch anmelden: nur EIN Durchgang setzt einen Lauf fort.
    const { data: meins } = await admin.from('ablauf_laeufe').update({ status: 'laeuft' })
      .eq('id', lauf.id).eq('owner_user_id', lauf.owner_user_id).eq('status', 'wartet').select('id');
    if (!meins || meins.length === 0) continue;

    const schritte = await schritteFuer(admin, ablauf, lauf);
    if (!mitVorgang) {
      // Zeitplan / Knopf: kein Vorgang zu laden, nichts nachzuprüfen.
      if (!schritte) { await setzeLauf(admin, lauf, { status: 'abgebrochen', meldung: 'Fassung fehlt', beendet_am: jetzt.toISOString() }); continue; }
      await arbeiteAb(admin, ablauf, schritte, lauf, lauf.pfad, {}, OHNE_VORGANG, jetzt);
      fortgesetzt++;
      continue;
    }
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
      // null = lief schon (EINMALIG-Index, 23505) — kein Drama
      const r = await starteLauf(admin, ablauf, ziel, ziel.zielTyp, String(satz.id),
        { tabelle: ziel.tabelle, trigger: ablauf.ausloeser.trigger }, satz, 'Gestartet: Datum erreicht', jetzt);
      if (r !== null) ok++;
    }
    gestartet += ok;
    await admin.from('ablaeufe').update({ zuletzt_lauf_am: jetzt.toISOString() }).eq('id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id);
    bericht.push({ ablauf: ablauf.name, geprueft: kandidaten.length, faellig: n.faellig, gestartet: ok, zurueckgestellt_wegen_deckel: n.zurueckgestellt });
  }

  // ---- 3) Zeitplan: fälliger Slot in Berliner Zeit, je Slot genau ein Lauf --------
  for (const ablauf of ablaeufe) {
    if (ablauf.ausloeser.art !== 'zeitplan') continue;
    const slot = zeitplanSlot(ablauf.ausloeser, jetzt);
    if (!slot) continue;
    if (probe) { bericht.push({ ablauf: ablauf.name, zeitplan: slot, wuerde: 'starten, falls noch nicht gelaufen' }); continue; }
    const r = await starteLauf(admin, ablauf, OHNE_VORGANG, 'zeitplan', slotKennung(ablauf.id, slot), { slot }, {}, `Gestartet: Zeitplan ${slot}`, jetzt);
    if (r !== null) {
      zeitplaene++;
      await admin.from('ablaeufe').update({ zuletzt_lauf_am: jetzt.toISOString() }).eq('id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id);
      bericht.push({ ablauf: ablauf.name, zeitplan: slot, ergebnis: r });
    }
  }

  // ---- 4) Ereignis: Warteschlange abarbeiten (Paket 166) ------------------------
  let ereignisStarts = 0;
  {
    const { data: evRoh, error: evFehler } = await admin.from('ablauf_ereignisse').select('*')
      .is('verarbeitet_am', null).order('erstellt_am', { ascending: true }).limit(MAX_EREIGNISSE);
    // Fehlt die Tabelle noch (SQL p166 nicht ausgeführt), geht der Motor ohne diesen Teil weiter.
    const ereignisse = evFehler ? [] : ((evRoh ?? []) as EreignisZeile[]);
    const masse = massenanlage(ereignisse);
    const erledigt = async (e: EreignisZeile, ergebnis: string) => {
      if (probe) return;
      await admin.from('ablauf_ereignisse').update({ verarbeitet_am: jetzt.toISOString(), ergebnis: ergebnis.slice(0, 300) })
        .eq('id', e.id).eq('owner_user_id', e.owner_user_id);
    };
    for (const e of ereignisse) {
      if (ereignisZuAlt(e, jetzt)) { await erledigt(e, 'zu alt'); continue; }
      if (masse.has(e.id)) { await erledigt(e, 'Massenanlage (z. B. Import) — kein Ablauf gestartet'); continue; }
      const passend = passendeAblaeufe(e, ablaeufe);
      if (passend.length === 0) { await erledigt(e, 'kein eingeschalteter Ablauf'); continue; }
      if (!probe) {
        // Anspruch anmelden: nur EIN Durchgang bearbeitet ein Ereignis.
        const { data: meins } = await admin.from('ablauf_ereignisse').update({ verarbeitet_am: jetzt.toISOString(), ergebnis: 'in Arbeit' })
          .eq('id', e.id).eq('owner_user_id', e.owner_user_id).is('verarbeitet_am', null).select('id');
        if (!meins || meins.length === 0) continue;
      }
      const { data: satzDaten } = await admin.from(e.tabelle).select('*').eq('id', e.ziel_id).eq('owner_user_id', e.owner_user_id).maybeSingle();
      const satz = satzDaten as Datensatz | null;
      if (!satz) { await erledigt(e, 'Vorgang gibt es nicht mehr'); continue; }
      await ergaenzeKontakte(admin, e.owner_user_id, [satz]);
      const teile: string[] = [];
      for (const ablauf of passend) {
        const ziel = ausloeserZiel(ablauf.ausloeser);
        if (!ziel) continue;
        if (!ereignisTrifft(ablauf.ausloeser, satz)) { teile.push(`${ablauf.name}: Bedingung nicht erfüllt`); continue; }
        const { count } = await admin.from('ablauf_laeufe').select('id', { count: 'exact', head: true })
          .eq('ablauf_id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id).eq('probe', false)
          .gte('gestartet_am', new Date(jetzt.getTime() - TAG).toISOString());
        if (freieStarts(count ?? 0) <= 0) { teile.push(`${ablauf.name}: Tagesdeckel erreicht`); continue; }
        if (probe) { bericht.push({ ablauf: ablauf.name, ereignis: e.ereignis, vorgang: e.ziel_id, wuerde: 'starten' }); continue; }
        const r = await starteLauf(admin, ablauf, ziel, ziel.zielTyp, e.ziel_id,
          { tabelle: ziel.tabelle, ereignis: e.ereignis }, satz, `Gestartet: Ereignis ${e.ereignis}`, jetzt);
        if (r !== null) {
          ereignisStarts++;
          teile.push(`${ablauf.name}: gestartet`);
          await admin.from('ablaeufe').update({ zuletzt_lauf_am: jetzt.toISOString() }).eq('id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id);
        } else teile.push(`${ablauf.name}: lief schon für diesen Vorgang`);
      }
      await erledigt(e, teile.join(' · ') || 'nichts zu tun');
    }
  }

  return NextResponse.json({
    ok: true, probelauf: probe, zeitpunkt: jetzt.toISOString(),
    ablaeufe_aktiv: ablaeufe.length,
    ...(probe ? {} : { fortgesetzt, gestartet, zeitplaene, ereignis_starts: ereignisStarts }),
    deckel_je_ablauf_24h: MAX_JE_ABLAUF, rueckblick_tage: RUECKBLICK_TAGE,
    bericht,
  });
}

export async function GET(req: Request) { return durchgang(req); }
export async function POST(req: Request) { return durchgang(req); }
