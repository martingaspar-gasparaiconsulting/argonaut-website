import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase-server';
import { fahrplan, pruefeAblauf, schrittAn, schrittText, ausloeserHatVorgang, ausloeserText, type Ablauf } from '@/lib/ablauf';
import { zeitplanSlot } from '@/lib/ablaufZeit';
import {
  ausloeserZiel, neueStarts, freieStarts, aktionPlanen, zustandNach, planText, RUECKBLICK_TAGE, MAX_KANDIDATEN, OHNE_VORGANG,
} from '@/lib/ablaufMotor';
import { ergaenzeKontakte } from '@/lib/ablaufDaten';
import type { Datensatz } from '@/lib/automation';

// ============================================================================
// ARGONAUT OS · /api/ablaeufe/probe?id=… — Probelauf eines Ablaufs (Paket 157)
//
// „Was würde dieser Ablauf jetzt tun?" — rechnet mit denselben Plänen wie der
// Motor (lib/ablaufMotor), führt NICHTS aus und schreibt NICHTS.
// Läuft mit der Anmeldung des Nutzers (RLS); nur die Geschäftsleitung.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAG = 86400000;

const MAX_BEISPIELE = 5;

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'Kein Ablauf gewählt.' }, { status: 400 });

  const { data: roh } = await supabase.from('ablaeufe').select('*').eq('id', id).maybeSingle();
  const ablauf = roh as (Ablauf & { id: string; owner_user_id: string; alt_regel_id: string | null }) | null;
  if (!ablauf) return NextResponse.json({ ok: false, error: 'Ablauf nicht gefunden.' }, { status: 404 });
  if (ablauf.owner_user_id !== user.id) return NextResponse.json({ ok: false, error: 'Nur die Geschäftsleitung.' }, { status: 403 });

  const jetzt = new Date();
  const pruefung = pruefeAblauf(ablauf);
  const ziel = ausloeserZiel(ablauf.ausloeser);
  if (!ausloeserHatVorgang(ablauf.ausloeser)) {
    // Zeitplan / Knopf: ein Lauf ohne Vorgang — die Schritte zeigen, sonst nichts.
    const f = fahrplan(ablauf, null, {}, jetzt);
    const z = zustandNach(f.danach);
    const slot = zeitplanSlot(ablauf.ausloeser, jetzt);
    return NextResponse.json({
      ok: true, zeitpunkt: jetzt.toISOString(), pruefung,
      hinweis: ablauf.ausloeser.art === 'zeitplan'
        ? `${ausloeserText(ablauf.ausloeser)} — ${slot ? `heute fällig (${slot})` : 'jetzt nicht fällig'}.`
        : `${ausloeserText(ablauf.ausloeser)}.`,
      beispiele: [{
        vorgang: 'Ohne Vorgang',
        schritte: f.jetzt.filter((e) => e.art === 'aktion').map((e) => ({ pfad: e.pfad, text: `${schrittText(e.schritt)}: ${planText(aktionPlanen(e.schritt, ablauf, OHNE_VORGANG, user.id, {}, jetzt))}` })),
        danach: z.meldung,
      }],
    });
  }
  // Paket 168: Knopf auf einer Modulseite — Probe mit einem Beispiel-Vorgang des Betriebs.
  if (ziel && ablauf.ausloeser.art === 'knopf') {
    const { data: juengster } = await supabase.from(ziel.tabelle).select('*').eq('owner_user_id', user.id).limit(1);
    const satz = ((juengster ?? []) as Datensatz[])[0];
    if (!satz) return NextResponse.json({ ok: true, zeitpunkt: jetzt.toISOString(), pruefung, beispiele: [], hinweis: `${ausloeserText(ablauf.ausloeser)} — noch kein Vorgang zum Ausprobieren vorhanden.` });
    await ergaenzeKontakte(supabase, user.id, [satz]);
    const f = fahrplan(ablauf, null, satz, jetzt);
    const z = zustandNach(f.danach);
    return NextResponse.json({
      ok: true, zeitpunkt: jetzt.toISOString(), pruefung,
      hinweis: `${ausloeserText(ablauf.ausloeser)} — so liefe es für einen Beispiel-Vorgang.`,
      beispiele: [{
        vorgang: String(satz.auftragsnummer ?? satz.titel ?? satz.name ?? ([satz.vorname, satz.nachname].filter(Boolean).join(' ') || satz.firma) ?? 'Vorgang'),
        schritte: f.jetzt.map((e) => (e.art === 'bedingung'
          ? { pfad: e.pfad, text: e.ergebnis ? 'Wenn: ja → Dann-Zweig' : 'Wenn: nein → Sonst-Zweig' }
          : { pfad: e.pfad, text: `${schrittText(e.schritt)}: ${planText(aktionPlanen(e.schritt, ablauf, ziel, user.id, satz, jetzt))}` })),
        danach: z.meldung,
      }],
    });
  }
  if (!ziel || ablauf.ausloeser.art !== 'datum') {
    return NextResponse.json({ ok: true, zeitpunkt: jetzt.toISOString(), pruefung, faellig: 0, wuerde_starten: 0, zurueckgestellt: 0, beispiele: [], hinweis: 'Dieser Auslöser läuft noch nicht im Motor.' });
  }
  const tage = Math.max(0, Math.trunc(Number(ablauf.ausloeser.tage) || 0));

  const { data: kandidatenRoh } = await supabase.from(ziel.tabelle).select('*')
    .eq('owner_user_id', user.id)
    .not(ziel.datumFeld, 'is', null)
    .lte(ziel.datumFeld, jetzt.toISOString())
    .gte(ziel.datumFeld, new Date(jetzt.getTime() - (RUECKBLICK_TAGE + tage + 1) * TAG).toISOString())
    .order(ziel.datumFeld, { ascending: true })
    .limit(MAX_KANDIDATEN);
  const kandidaten = (kandidatenRoh ?? []) as Datensatz[];

  const { data: gelaufen } = await supabase.from('ablauf_laeufe').select('ziel_id').eq('ablauf_id', ablauf.id).eq('probe', false).limit(5000);
  const schon = new Set((gelaufen ?? []).map((l) => String((l as { ziel_id: string | null }).ziel_id ?? '')));
  const alt = new Set<string>();
  if (ablauf.alt_regel_id) {
    const { data: log } = await supabase.from('automation_log').select('ziel_id').eq('regel_id', ablauf.alt_regel_id).eq('ergebnis', 'ok').limit(5000);
    for (const l of (log ?? []) as { ziel_id: string | null }[]) alt.add(String(l.ziel_id ?? ''));
  }
  const { count } = await supabase.from('ablauf_laeufe').select('id', { count: 'exact', head: true })
    .eq('ablauf_id', ablauf.id).eq('probe', false).gte('gestartet_am', new Date(jetzt.getTime() - TAG).toISOString());
  const n = neueStarts(ablauf.ausloeser, kandidaten, schon, alt, freieStarts(count ?? 0), jetzt);

  const beispiele = n.starten.slice(0, MAX_BEISPIELE);
  await ergaenzeKontakte(supabase, user.id, beispiele);
  const ergebnis = beispiele.map((satz) => {
    const f = fahrplan(ablauf, null, satz, jetzt);
    const schritte = f.jetzt.map((e) => (e.art === 'bedingung'
      ? { pfad: e.pfad, text: e.ergebnis ? 'Wenn: ja → Dann-Zweig' : 'Wenn: nein → Sonst-Zweig' }
      : { pfad: e.pfad, text: `${schrittText(e.schritt)}: ${planText(aktionPlanen(e.schritt, ablauf, ziel, user.id, satz, jetzt))}` }));
    const z = zustandNach(f.danach);
    const naechster = z.pfad ? schrittAn(ablauf.schritte, z.pfad) : null;
    return {
      vorgang: String(satz.rechnungsnummer ?? satz.angebotsnummer ?? satz.titel ?? satz.name ?? ([satz.vorname, satz.nachname].filter(Boolean).join(' ') || satz.firma) ?? 'Vorgang'),
      schritte,
      danach: z.status === 'wartet' ? `wartet bis ${z.weiter_am}, dann: ${naechster ? schrittText(naechster) : '—'}`
        : z.status === 'freigabe' ? `wartet auf Ihre Freigabe, dann: ${naechster ? schrittText(naechster) : '—'}`
        : z.meldung,
    };
  });

  return NextResponse.json({
    ok: true, zeitpunkt: jetzt.toISOString(), pruefung,
    geprueft: kandidaten.length, faellig: n.faellig, wuerde_starten: n.starten.length, zurueckgestellt: n.zurueckgestellt,
    beispiele: ergebnis,
  });
}
