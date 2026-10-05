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
import { aktionPlanen, zustandNach, type AktionPlan, type Ziel, type GlockeAn } from './ablaufMotor';
import type { Datensatz } from './automation';
import { randomUUID } from 'node:crypto';
import { ablaufPdfHtml, ablaufPdfPfad } from './ablaufPdf';
import { textPdf } from './textPdf';
import { kiEntwurf } from './ablaufKi';
import { baueNutzlast, webhookGrundgeheimnis, webhookSchluessel, webhookKoepfe } from './ablaufWebhook';
import { sendeWebhook } from './ablaufWebhookSenden';
import { datumDeutsch } from './automation';
import { escapeHtml } from './newsletter';
import { werbungErlaubt } from './werbeErlaubnisServer';
import { createAdminClient } from './supabase-admin';
import { werbeVersandTeile } from './werbeAbmeldeLink';
import { WERBE_GRUND_TEXT } from './werbeErlaubnis';
import { webhookWiederholbar, neuversuchPlanen } from './ablaufRobust';

/** Grundadresse für Abmeldelinks in Mails aus Abläufen. */
function basisUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com').trim().replace(/\/+$/, '');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = {
  from: (tabelle: string) => any;
  rpc?: (fn: string, args: Record<string, unknown>) => any;
  storage?: { from: (bucket: string) => any };
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Privater Speicherordner für PDFs aus Abläufen (SQL p167). */
export const ABLAUF_BUCKET = 'ablauf-dateien';

/** Was fuehreAus über den Lauf wissen muss (Paket 167). */
type Umfeld = { ablauf: AblaufZeile; lauf: LaufZeile; pfad: string; ziel: Ziel; satz: Datensatz; jetzt: Date };

export type AblaufZeile = Ablauf & { id: string; owner_user_id: string; version: number; alt_regel_id: string | null };
export type LaufZeile = {
  id: string; owner_user_id: string; ablauf_id: string; version: number; ziel_typ: string | null; ziel_id: string | null;
  status: string; pfad: string | null; kontext: { tabelle?: string; slot?: string } | null;
  // Paket 186 (SQL p186): Neuversuch je Schritt + seit wann der Lauf läuft
  neuversuche?: number | null; neuversuch_pfad?: string | null; laeuft_seit?: string | null; gestartet_am?: string | null;
};
/** wiederholbar: Fehler, bei dem Warten hilft (Empfänger kurz nicht erreichbar) — Paket 186. */
type Ergebnis = { ergebnis: 'ok' | 'fehler' | 'uebersprungen'; meldung: string; wiederholbar?: boolean };

async function fuehreAus(db: Db, plan: AktionPlan, ownerId: string, u: Umfeld): Promise<Ergebnis> {
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
  if (plan.art === 'glocke') return glocke(db, ownerId, { an: plan.an, personen: plan.personen, abteilung: plan.abteilung }, plan.titel, plan.text, plan.link, `${u.lauf.id}:${u.pfad}`, plan.meldung);
  if (plan.art === 'pdf') return pdfErstellen(db, ownerId, plan, u);
  if (plan.art === 'ki') return kiSchritt(db, ownerId, plan, u);
  if (plan.art === 'webhook') return webhook(plan, u);
  return mailSenden(db, ownerId, plan);
}

/**
 * Paket 173 (Befund H10): Mail aus einem Ablauf.
 *  - Absendername und Antwort-Adresse sind die des BETRIEBS (vorher „ARGONAUT OS",
 *    Antworten landeten bei info@argonaut-os.com), kundenPost wie bei der Rückholung.
 *  - Der Text wird entschärft — Platzhalter tragen Kundendaten aus Formularen.
 *  - Werbung: Sperrliste aller Kanäle, Abmeldelink, Widerspruchshinweis, List-Unsubscribe.
 */
export async function mailSenden(db: Db, ownerId: string, plan: Extract<AktionPlan, { art: 'mail' }>): Promise<Ergebnis> {
  let teile: ReturnType<typeof werbeVersandTeile> = null;
  if (plan.werbung) {
    // Die Sperrliste liest nur der Server-Schlüssel (werbe_fakten) — auch beim Knopf, der mit der Sitzung läuft.
    let pruefDb: Db = db;
    try { pruefDb = createAdminClient() as unknown as Db; } catch { /* Motor läuft ohnehin mit Service-Rolle */ }
    const erlaubnis = await werbungErlaubt(pruefDb, ownerId, plan.an, { nurWiderspruch: true });
    if (!erlaubnis.erlaubt) return { ergebnis: 'uebersprungen', meldung: `kein Werbeversand: ${WERBE_GRUND_TEXT[erlaubnis.grund]}` };
    teile = werbeVersandTeile(basisUrl(), ownerId, plan.an);
    if (!teile) return { ergebnis: 'fehler', meldung: 'Abmeldelink konnte nicht erstellt werden — keine Werbe-Mail verschickt' };
  }
  const marke = await absenderBranding(db, ownerId);
  const inhalt = plan.text.split('\n').map((z) => `<p style="margin:0 0 10px">${z ? escapeHtml(z) : '&nbsp;'}</p>`).join('');
  const html = kundenMailLayout(marke.firma, marke.akzent, plan.betreff, inhalt, teile
    ? { werbung: true, abmeldeLink: teile.abmeldeLink, grund: `Sie erhalten diese E-Mail von ${marke.firma}.` }
    : undefined);
  const r = await sendeMail({
    an: plan.an, betreff: plan.betreff, html,
    absenderName: marke.firma, antwortAn: marke.email, kundenPost: true, betriebId: marke.betriebId,
    ...(teile ? { kopfzeilen: teile.kopfzeilen } : {}),
  });
  return r.ok ? { ergebnis: 'ok', meldung: plan.meldung } : { ergebnis: 'fehler', meldung: r.fehler };
}

// ---------------------------------------------------------------------------
// Paket 167: Glocke, PDF, KI-Entwurf, Webhook
// ---------------------------------------------------------------------------

/**
 * Empfänger der Glocke: Geschäftsleitung = der Betrieb; Team = alle Mitarbeiter mit Zugang (nicht ausgetreten).
 * Paket 192: Personen = nur die gewählten Mitarbeiter DIESES Betriebs; Abteilung = alle
 * Mitarbeiter mit Zugang, deren Abteilung (ohne Groß/Klein, getrimmt) passt.
 * Immer auf owner_user_id gefiltert — eine fremde Kennung in der Einstellung erreicht niemanden.
 */
export type GlockeZiel = { an: GlockeAn; personen?: string[]; abteilung?: string | null };

export async function glockenEmpfaenger(db: Db, ownerId: string, ziel: GlockeZiel, jetzt: Date): Promise<string[]> {
  if (ziel.an === 'chef') return [ownerId];
  const heute = jetzt.toISOString().slice(0, 10);
  const { data } = await db.from('mitarbeiter').select('id, auth_user_id, austrittsdatum, abteilung')
    .eq('owner_user_id', ownerId).not('auth_user_id', 'is', null).limit(1000);
  const personen = new Set((ziel.personen ?? []).map((x) => x.toLowerCase()));
  const abteilung = (ziel.abteilung ?? '').trim().toLowerCase();
  const ids = ((data ?? []) as { id: string; auth_user_id: string | null; austrittsdatum: string | null; abteilung: string | null }[])
    .filter((m) => m.auth_user_id && (!m.austrittsdatum || m.austrittsdatum >= heute))
    .filter((m) => ziel.an === 'team'
      || (ziel.an === 'personen' && personen.has(String(m.id).toLowerCase()))
      || (ziel.an === 'abteilung' && !!abteilung && String(m.abteilung ?? '').trim().toLowerCase() === abteilung))
    .map((m) => m.auth_user_id as string)
    .filter((x) => x !== ownerId);
  const uniq = [...new Set(ids)];
  // Team: die Geschäftsleitung sieht die Meldung mit. Personen/Abteilung: nur die Gewählten.
  return ziel.an === 'team' ? [ownerId, ...uniq] : uniq;
}

async function glocke(db: Db, ownerId: string, ziel: GlockeZiel, titel: string, text: string, link: string, ref: string, meldung: string): Promise<Ergebnis> {
  if (!db.rpc) return { ergebnis: 'fehler', meldung: 'Glocke nicht erreichbar' };
  const empfaenger = await glockenEmpfaenger(db, ownerId, ziel, new Date());
  if (empfaenger.length === 0) return { ergebnis: 'uebersprungen', meldung: `${meldung} — niemand mit Zugang gefunden` };
  let fehler = '';
  for (const uid of empfaenger) {
    const { error } = await db.rpc('benachrichtigung_erstellen', {
      p_owner: uid, p_typ: 'ablauf', p_titel: titel, p_nachricht: text, p_link: link,
      p_ref_tabelle: 'ablauf_laeufe', p_ref_id: ref, p_dedup_stunden: 24,
    });
    if (error) fehler = error.message;
  }
  if (fehler) return { ergebnis: 'fehler', meldung: fehler };
  return { ergebnis: 'ok', meldung: `${meldung} (${empfaenger.length} Empfänger)` };
}

async function firmaUndFarbe(db: Db, ownerId: string): Promise<{ firma: string; farbe: string | null }> {
  try {
    const { data: ci } = await db.from('web_ci').select('firma, farbe_primaer').eq('owner_user_id', ownerId).maybeSingle();
    const c = (ci ?? {}) as { firma?: string | null; farbe_primaer?: string | null };
    if (c.firma) return { firma: String(c.firma), farbe: c.farbe_primaer ?? null };
    const { data: p } = await db.from('profiles').select('firma_name').eq('id', ownerId).maybeSingle();
    return { firma: String((p as { firma_name?: string | null } | null)?.firma_name ?? ''), farbe: c.farbe_primaer ?? null };
  } catch { return { firma: '', farbe: null }; }
}

async function ergebnisAblegen(db: Db, ownerId: string, u: Umfeld, felder: Record<string, unknown>): Promise<string | null> {
  const { error } = await db.from('ablauf_ergebnisse').insert({
    owner_user_id: ownerId, lauf_id: u.lauf.id, ablauf_id: u.ablauf.id, ablauf_name: u.ablauf.name,
    ziel_typ: u.lauf.ziel_typ, ziel_id: u.lauf.ziel_id, ...felder,
  });
  return error ? error.message : null;
}

async function pdfErstellen(db: Db, ownerId: string, plan: Extract<AktionPlan, { art: 'pdf' }>, u: Umfeld): Promise<Ergebnis> {
  if (!db.storage) return { ergebnis: 'fehler', meldung: 'Ablage nicht erreichbar' };
  const { firma, farbe } = await firmaUndFarbe(db, ownerId);
  const html = ablaufPdfHtml({ vorlage: plan.vorlage, titel: plan.titel, text: plan.text, zeilen: plan.zeilen, firma, farbe, datum: datumDeutsch(u.jetzt) });
  const pdf = await textPdf(html);
  if (!pdf) return { ergebnis: 'fehler', meldung: 'PDF-Dienst gerade nicht erreichbar' };
  const pfad = ablaufPdfPfad(ownerId, randomUUID(), u.jetzt);
  const { error: upErr } = await db.storage.from(ABLAUF_BUCKET).upload(pfad, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: false });
  if (upErr) return { ergebnis: 'fehler', meldung: `Ablage: ${upErr.message}` };
  const f = await ergebnisAblegen(db, ownerId, u, { art: 'pdf', titel: plan.titel, datei_pfad: pfad });
  if (f) {
    try { await db.storage.from(ABLAUF_BUCKET).remove([pfad]); } catch { /* Aufräumen best effort */ }
    return { ergebnis: 'fehler', meldung: f };
  }
  return { ergebnis: 'ok', meldung: `${plan.meldung} — unter „Ergebnisse"` };
}

async function kiSchritt(db: Db, ownerId: string, plan: Extract<AktionPlan, { art: 'ki' }>, u: Umfeld): Promise<Ergebnis> {
  const r = await kiEntwurf(ownerId, plan.auftrag);
  if (!r.ok) return { ergebnis: 'fehler', meldung: r.meldung };
  const f = await ergebnisAblegen(db, ownerId, u, { art: 'entwurf', titel: plan.titel, inhalt: r.text });
  if (f) return { ergebnis: 'fehler', meldung: f };
  await glocke(db, ownerId, { an: 'chef' }, 'Entwurf liegt bereit', plan.titel, '/dashboard/ablaeufe', `${u.lauf.id}:${u.pfad}:entwurf`, '');
  return { ergebnis: 'ok', meldung: `${plan.meldung} — unter „Ergebnisse"` };
}

async function webhook(plan: Extract<AktionPlan, { art: 'webhook' }>, u: Umfeld): Promise<Ergebnis> {
  const schluessel = webhookSchluessel(u.ablauf.id, webhookGrundgeheimnis());
  if (!schluessel) return { ergebnis: 'fehler', meldung: 'Webhook-Geheimnis fehlt auf dem Server' };
  const nutzlast = baueNutzlast({
    ablaufId: u.ablauf.id, ablaufName: u.ablauf.name, zielTyp: u.ziel.zielTyp, zielId: u.lauf.ziel_id,
    satz: u.satz, werte: plan.werte, felder: plan.felder, jetzt: u.jetzt,
  });
  const inhalt = JSON.stringify({ ...nutzlast, lauf_id: u.lauf.id });
  const zeit = String(Math.floor(u.jetzt.getTime() / 1000));
  const r = await sendeWebhook(plan.url, webhookKoepfe(schluessel, zeit, inhalt), inhalt);
  return r.ok
    ? { ergebnis: 'ok', meldung: `${plan.meldung}: ${r.meldung}` }
    : { ergebnis: 'fehler', meldung: `${plan.meldung}: ${r.meldung}`, wiederholbar: webhookWiederholbar(r) };
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

/** Paket 186: Endet ein Lauf mit Fehler, erfährt es die Geschäftsleitung (Glocke, je Lauf höchstens einmal). */
export async function laufFehlerGlocke(db: Db, lauf: LaufZeile, ablaufName: string, meldung: string): Promise<void> {
  try {
    await glocke(db, lauf.owner_user_id, { an: 'chef' }, `Ablauf gestoppt: ${String(ablaufName || 'Ablauf').slice(0, 80)}`,
      meldung.slice(0, 300), '/dashboard/ablaeufe', `${lauf.id}:fehler`, '');
  } catch { /* Glocke ist Hinweis, nie Grund für einen weiteren Fehler */ }
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
    try { r = await fuehreAus(db, plan, lauf.owner_user_id, { ablauf, lauf, pfad: e.pfad, ziel, satz, jetzt }); }
    catch (err: unknown) { r = { ergebnis: 'fehler', meldung: err instanceof Error ? err.message : 'unbekannter Fehler' }; }
    await protokoll(db, lauf, e.pfad, 'aktion', r.ergebnis, r.meldung, { aktion: e.schritt.aktion });
    if (r.ergebnis === 'fehler') {
      // Paket 186: Empfänger kurz weg -> derselbe Schritt später noch einmal (3 Neuversuche).
      if (r.wiederholbar) {
        const nv = neuversuchPlanen(lauf, e.pfad, jetzt);
        if (nv.art === 'neuversuch') {
          await protokoll(db, lauf, e.pfad, 'warten', 'wartet', nv.meldung);
          await setzeLauf(db, lauf, { status: 'wartet', pfad: e.pfad, weiter_am: nv.weiter_am, meldung: nv.meldung, neuversuche: nv.nr, neuversuch_pfad: e.pfad });
          return 'wartet';
        }
        r = { ...r, meldung: `${r.meldung} — ${nv.meldung}` };
      }
      // Nach einem Fehler geht es NICHT weiter — keine Folge-Mail auf kaputter Grundlage.
      await setzeLauf(db, lauf, { status: 'fehler', pfad: e.pfad, weiter_am: null, meldung: r.meldung.slice(0, 500), beendet_am: jetzt.toISOString() });
      await laufFehlerGlocke(db, lauf, ablauf.name, r.meldung);
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
    ziel_typ: zielTyp, ziel_id: zielId, status: 'laeuft', probe: false, kontext, laeuft_seit: jetzt.toISOString(),
  }).select('*').single();
  if (error || !neu) return null;
  await protokoll(db, neu as LaufZeile, null, 'start', 'ok', startMeldung);
  return arbeiteAb(db, ablauf, ablauf.schritte, neu as LaufZeile, null, satz, ziel, jetzt);
}
