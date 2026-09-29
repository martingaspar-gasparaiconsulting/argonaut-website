// ============================================================================
// ARGONAUT OS · lib/werbeErlaubnisServer.ts — Werbe-Erlaubnis aus der Datenbank
// (Paket 173, 29.09.2026) · NUR serverseitig, mit Service-Rolle aufrufen.
//
// Zwei Aufgaben:
//   1. werbePrueferLaden(): holt für (Betrieb, Adressen) die Fakten über die
//      Datenbank-Funktion werbe_fakten (SQL p173, nur service_role) und liefert
//      eine Prüf-Funktion. Klappt das Laden nicht, sagt die Prüfung NEIN
//      („unbekannt") — lieber eine Werbe-Mail zu wenig als eine ohne Erlaubnis.
//   2. widerspruchEintragen(): EINE Abmeldung wirkt in ALLEN Kanälen —
//      Sperrliste, Kontakt, Newsletter, Serien, Rückholung.
//
// Jede Abfrage ist auf den Betrieb (owner_user_id) gefiltert. Die Service-Rolle
// umgeht RLS — wer hier den Filter vergisst, meldet Adressen bei fremden
// Betrieben ab. tsc fängt das NICHT; tests/werbeMailsP173 prüft es.
// ============================================================================

import { entscheideWerbung, normMail, istMail, type WerbeFakten, type WerbeEntscheid, type PruefOptionen } from './werbeErlaubnis';
import { istKennung } from './werbeAbmeldeLink';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from: (t: string) => any; rpc?: (fn: string, args: any) => any };
/* eslint-enable @typescript-eslint/no-explicit-any */

const STUECK = 500;

/** Kennung von ARGONAUT selbst (für ARGONAUTs eigene Werbe-Post). null = nicht gesetzt. */
export function betreiberKennung(env: Record<string, string | undefined> = process.env): string | null {
  const b = (env.ANALYSE_BETREIBER_ID || '').trim().toLowerCase();
  return istKennung(b) ? b : null;
}

function alsListe(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/** Fakten für einen Betrieb. null = nicht ladbar (dann gilt: keine Werbung). */
export async function werbeFaktenLaden(db: Db, betrieb: string, emails: unknown[]): Promise<WerbeFakten | null> {
  if (!istKennung(betrieb) || !db.rpc) return null;
  const liste = Array.from(new Set((emails ?? []).map(normMail).filter((e) => istMail(e))));
  const fakten: WerbeFakten = { sperren: [], kontakte: [], abos: [] };
  for (let i = 0; i < liste.length; i += STUECK) {
    try {
      const { data, error } = await db.rpc('werbe_fakten', { p_owner: betrieb, p_emails: liste.slice(i, i + STUECK) });
      if (error || !data || typeof data !== 'object') return null;
      const d = data as Record<string, unknown>;
      fakten.sperren.push(...alsListe(d.sperren));
      fakten.kontakte.push(...alsListe(d.kontakte));
      fakten.abos.push(...alsListe(d.abos));
    } catch {
      return null;
    }
  }
  return fakten;
}

export type WerbePruefer = (betrieb: string, email: unknown, opt?: PruefOptionen) => WerbeEntscheid;

/** Für viele (Betrieb, Adresse)-Paare auf einmal laden — ein Aufruf je Betrieb und 500 Adressen. */
export async function werbePrueferLaden(db: Db, paare: { betrieb: string; email: unknown }[]): Promise<WerbePruefer> {
  const jeBetrieb = new Map<string, string[]>();
  for (const p of paare ?? []) {
    const b = String(p?.betrieb ?? '').trim().toLowerCase();
    if (!istKennung(b)) continue;
    const l = jeBetrieb.get(b) ?? [];
    l.push(normMail(p?.email));
    jeBetrieb.set(b, l);
  }
  const fakten = new Map<string, WerbeFakten | null>();
  for (const [b, mails] of jeBetrieb) fakten.set(b, await werbeFaktenLaden(db, b, mails));
  return (betrieb, email, opt = {}) => {
    const b = String(betrieb ?? '').trim().toLowerCase();
    return entscheideWerbung(email, fakten.has(b) ? fakten.get(b) ?? null : null, opt);
  };
}

/** Einzelprüfung (z. B. Abläufe, Bewertungsbitte). */
export async function werbungErlaubt(db: Db, betrieb: string, email: unknown, opt: PruefOptionen = {}): Promise<WerbeEntscheid> {
  const p = await werbePrueferLaden(db, [{ betrieb, email }]);
  return p(betrieb, email, opt);
}

function ilikeGenau(mail: string): string {
  return normMail(mail).replace(/[\\%_]/g, (c) => '\\' + c);
}

/**
 * Den Widerspruch EINER Adresse bei EINEM Betrieb überall eintragen.
 * Liefert true, wenn die Sperrliste (die Quelle, die jeder Versand liest)
 * geschrieben wurde. Die übrigen Schritte laufen auch, wenn einer scheitert.
 */
export async function widerspruchEintragen(db: Db, betrieb: string, emailRoh: unknown, quelle: string): Promise<boolean> {
  const b = String(betrieb ?? '').trim().toLowerCase();
  const email = normMail(emailRoh);
  if (!istKennung(b) || !istMail(email)) return false;
  const jetzt = new Date().toISOString();
  const heute = jetzt.slice(0, 10);
  let ok = false;

  // 1) Sperrliste — jeder Werbeversand liest sie über werbe_fakten.
  try {
    const { error } = await db.from('werbe_sperre')
      .upsert({ owner_user_id: b, email, gesperrt_am: jetzt, quelle: String(quelle || 'abmeldung').slice(0, 60) }, { onConflict: 'owner_user_id,email' });
    ok = !error;
    if (error) console.error('[widerspruch] Sperrliste', error.message);
  } catch (e) { console.error('[widerspruch] Sperrliste', e instanceof Error ? e.message : e); }

  const schritt = async (name: string, f: () => PromiseLike<{ error?: { message?: string } | null }>) => {
    try {
      const r = await f();
      if (r?.error) console.error(`[widerspruch] ${name}`, r.error.message);
    } catch (e) { console.error(`[widerspruch] ${name}`, e instanceof Error ? e.message : e); }
  };

  // 2) Kontakt: der erste Widerspruch bleibt als Nachweis stehen.
  await schritt('Kontakt', () => db.from('kontakte')
    .update({ werbe_widerspruch_am: jetzt })
    .eq('owner_user_id', b).ilike('email', ilikeGenau(email)).is('werbe_widerspruch_am', null));
  // 3) Newsletter
  await schritt('Newsletter', () => db.from('newsletter_abonnenten')
    .update({ status: 'abgemeldet', abgemeldet_am: jetzt })
    .eq('owner_user_id', b).eq('email', email).neq('status', 'abgemeldet'));
  // 4) Info-Serien (Autoresponder)
  await schritt('Serie', () => db.from('autoresponder_lauf')
    .update({ status: 'abgemeldet' })
    .eq('owner_user_id', b).eq('email', email).eq('status', 'aktiv'));
  // 5) Rückholung
  await schritt('Rückholung', () => db.from('rueckhol_lauf')
    .update({ status: 'gestoppt', stopp_grund: 'hat der Werbung widersprochen', beendet_am: heute, faellig_am: null })
    .eq('owner_user_id', b).ilike('email', ilikeGenau(email)).eq('status', 'aktiv'));
  // Freebie-, Webinar-, Dossier- und Lead-Strecken lesen die Sperrliste vor
  // jedem Versand selbst — dort muss nichts umgeschrieben werden.
  return ok;
}

type RpcSitzung = { rpc: (fn: string) => PromiseLike<{ data: unknown }> };

/** Der Betrieb der angemeldeten Person (beim Mitarbeiter der Chef — mein_chef_id() mit der Sitzung geprüft). */
export async function betriebDerSitzung(sitzung: unknown, eigeneId: string): Promise<string> {
  let chef: unknown = null;
  try { chef = (await (sitzung as RpcSitzung).rpc('mein_chef_id')).data; } catch { chef = null; }
  const c = typeof chef === 'string' ? chef.trim().toLowerCase() : '';
  return istKennung(c) ? c : String(eigeneId).trim().toLowerCase();
}

/**
 * Newsletter- und Serien-Empfänger filtern: nur wer darf, bleibt. Kann die
 * Prüfung nicht laden, bleibt NIEMAND (ok = false).
 */
export async function erlaubteEmpfaenger<T extends { email?: string | null }>(
  db: Db, betrieb: string, liste: T[], opt: PruefOptionen = {},
): Promise<{ ok: boolean; erlaubt: T[]; abgelehnt: { email: string; grund: WerbeEntscheid['grund'] }[] }> {
  const fakten = await werbeFaktenLaden(db, betrieb, (liste ?? []).map((z) => z?.email));
  if (!fakten) return { ok: false, erlaubt: [], abgelehnt: [] };
  const erlaubt: T[] = [];
  const abgelehnt: { email: string; grund: WerbeEntscheid['grund'] }[] = [];
  for (const z of liste ?? []) {
    const r = entscheideWerbung(z?.email, fakten, opt);
    if (r.erlaubt) erlaubt.push(z); else abgelehnt.push({ email: normMail(z?.email), grund: r.grund });
  }
  return { ok: true, erlaubt, abgelehnt };
}
