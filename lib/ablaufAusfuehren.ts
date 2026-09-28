// ============================================================================
// ARGONAUT OS · lib/ablaufAusfuehren.ts — einen Lauf abarbeiten (Paket 159)
//
// Aus /api/cron/ablaeufe herausgezogen, damit der Motor UND der Knopf
// (/api/ablaeufe/start) denselben Weg gehen: Fahrplan -> geplante Aktionen
// ausführen -> Protokoll je Schritt -> Zustand setzen. Ausgeführt wird nur,
// was lib/ablaufMotor geplant hat. Jede Schreib-Abfrage ist auf den Betrieb
// (owner_user_id) gefiltert — der Motor arbeitet mit Service-Role.
// ============================================================================

import { sendeMail, kundenMailLayout, absenderBranding } from './mail';
import { fahrplan, type Ablauf, type Schritt } from './ablauf';
import { aktionPlanen, zustandNach, type AktionPlan, type Ziel } from './ablaufMotor';
import type { Datensatz } from './automation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (tabelle: string) => any };

export type AblaufZeile = Ablauf & { id: string; owner_user_id: string; version: number; alt_regel_id: string | null };
export type LaufZeile = {
  id: string; owner_user_id: string; ablauf_id: string; version: number; ziel_typ: string | null; ziel_id: string | null;
  status: string; pfad: string | null; kontext: { tabelle?: string; slot?: string } | null;
};
type Ergebnis = { ergebnis: 'ok' | 'fehler' | 'uebersprungen'; meldung: string };

async function fuehreAus(db: Db, plan: AktionPlan, ownerId: string): Promise<Ergebnis> {
  if (plan.art === 'uebersprungen') return { ergebnis: 'uebersprungen', meldung: plan.meldung };
  if (plan.art === 'fehler') return { ergebnis: 'fehler', meldung: plan.meldung };
  if (plan.art === 'anlegen') {
    const { error } = await db.from(plan.tabelle).insert({ ...plan.daten, owner_user_id: ownerId });
    return error ? { ergebnis: 'fehler', meldung: error.message } : { ergebnis: 'ok', meldung: plan.meldung };
  }
  if (plan.art === 'aendern') {
    if (!plan.id) return { ergebnis: 'fehler', meldung: 'kein Vorgang' };
    const { data, error } = await db.from(plan.tabelle).update(plan.daten)
      .eq('id', plan.id).eq('owner_user_id', ownerId).select('id');
    if (error) return { ergebnis: 'fehler', meldung: error.message };
    if (!data || data.length === 0) return { ergebnis: 'fehler', meldung: 'Vorgang nicht gefunden' };
    return { ergebnis: 'ok', meldung: plan.meldung };
  }
  const marke = await absenderBranding(db, ownerId);
  const inhalt = plan.text.split('\n').map((z) => `<p style="margin:0 0 10px">${z || '&nbsp;'}</p>`).join('');
  const r = await sendeMail({ an: plan.an, betreff: plan.betreff, html: kundenMailLayout(marke.firma, marke.akzent, plan.betreff, inhalt) });
  return r.ok ? { ergebnis: 'ok', meldung: plan.meldung } : { ergebnis: 'fehler', meldung: r.fehler };
}

export async function protokoll(db: Db, lauf: LaufZeile, pfad: string | null, schrittTyp: string, ergebnis: string, meldung: string, details: Record<string, unknown> = {}) {
  await db.from('ablauf_protokoll').insert({
    owner_user_id: lauf.owner_user_id, lauf_id: lauf.id, ablauf_id: lauf.ablauf_id,
    pfad, schritt_typ: schrittTyp, ergebnis, meldung: meldung.slice(0, 500), details,
  });
}

export async function setzeLauf(db: Db, lauf: LaufZeile, felder: Record<string, unknown>) {
  await db.from('ablauf_laeufe').update(felder).eq('id', lauf.id).eq('owner_user_id', lauf.owner_user_id);
}

/** Den Fahrplan ab `startPfad` abarbeiten, Protokoll schreiben, Zustand setzen. */
export async function arbeiteAb(
  db: Db, ablauf: AblaufZeile, schritte: Schritt[], lauf: LaufZeile, startPfad: string | null,
  satz: Datensatz, ziel: Ziel, jetzt: Date,
): Promise<string> {
  const f = fahrplan({ schritte }, startPfad, satz, jetzt);
  for (const e of f.jetzt) {
    if (e.art === 'bedingung') {
      await protokoll(db, lauf, e.pfad, 'wenn', 'ok', e.ergebnis ? 'Wenn: ja → Dann-Zweig' : 'Wenn: nein → Sonst-Zweig');
      continue;
    }
    const plan = aktionPlanen(e.schritt, ablauf, ziel, lauf.owner_user_id, satz, jetzt);
    let r: Ergebnis;
    try { r = await fuehreAus(db, plan, lauf.owner_user_id); }
    catch (err: unknown) { r = { ergebnis: 'fehler', meldung: err instanceof Error ? err.message : 'unbekannter Fehler' }; }
    await protokoll(db, lauf, e.pfad, 'aktion', r.ergebnis, r.meldung, { aktion: e.schritt.aktion });
    if (r.ergebnis === 'fehler') {
      // Nach einem Fehler geht es NICHT weiter — keine Folge-Mail auf kaputter Grundlage.
      await setzeLauf(db, lauf, { status: 'fehler', pfad: e.pfad, weiter_am: null, meldung: r.meldung.slice(0, 500), beendet_am: jetzt.toISOString() });
      return 'fehler';
    }
  }
  const z = zustandNach(f.danach);
  if (f.danach.art === 'warten') await protokoll(db, lauf, z.pfad, 'warten', 'wartet', `Wartet bis ${z.weiter_am ?? '—'}`);
  if (f.danach.art === 'freigabe') await protokoll(db, lauf, f.danach.pfad, 'freigabe', 'freigabe', z.meldung);
  if (f.danach.art === 'stopp') await protokoll(db, lauf, f.danach.pfad, 'stopp', 'ok', z.meldung);
  const ende = z.status === 'fertig' || z.status === 'gestoppt';
  await setzeLauf(db, lauf, { status: z.status, pfad: z.pfad, weiter_am: z.weiter_am, meldung: z.meldung, beendet_am: ende ? jetzt.toISOString() : null });
  return z.status;
}

/** Schritte in der Fassung, mit der der Lauf gestartet ist (Versionen). */
export async function schritteFuer(db: Db, ablauf: AblaufZeile, lauf: LaufZeile): Promise<Schritt[] | null> {
  if (Number(lauf.version) === Number(ablauf.version)) return ablauf.schritte;
  const { data } = await db.from('ablauf_versionen').select('schritte')
    .eq('ablauf_id', ablauf.id).eq('owner_user_id', ablauf.owner_user_id).eq('version', lauf.version).maybeSingle();
  const s = (data as { schritte?: unknown } | null)?.schritte;
  return Array.isArray(s) ? (s as Schritt[]) : null;
}

/** Einen neuen Lauf anlegen (null = gab es schon: EINMALIG-Index) und sofort abarbeiten. */
export async function starteLauf(
  db: Db, ablauf: AblaufZeile, ziel: Ziel, zielTyp: string, zielId: string | null, kontext: Record<string, unknown>,
  satz: Datensatz, startMeldung: string, jetzt: Date,
): Promise<string | null> {
  const { data: neu, error } = await db.from('ablauf_laeufe').insert({
    owner_user_id: ablauf.owner_user_id, ablauf_id: ablauf.id, version: ablauf.version,
    ziel_typ: zielTyp, ziel_id: zielId, status: 'laeuft', probe: false, kontext,
  }).select('*').single();
  if (error || !neu) return null;
  await protokoll(db, neu as LaufZeile, null, 'start', 'ok', startMeldung);
  return arbeiteAb(db, ablauf, ablauf.schritte, neu as LaufZeile, null, satz, ziel, jetzt);
}
