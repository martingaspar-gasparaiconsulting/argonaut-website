// ============================================================================
// ARGONAUT OS · lib/fahrzeugMappeServer.ts — Paket 305 (10.10.2026) · FM1
//
// NUR SERVERSEITIG (Türen unter app/api/oeffentlich/fahrzeugmappe, die Seiten
// /ankauf/<kennung> und /fahrzeug-verkaufen). Liest und schreibt mit der
// Service-Rolle, weil der Verkäufer kein Konto hat. Deshalb gilt streng:
// - Der Betrieb kommt AUSSCHLIESSLICH aus der Kennung des Online-Ankaufs
//   (modul_einstellung „kfz-ankauf", vom Chef eingeschaltet) bzw. aus der
//   Domain im Website-Bauer — nie aus der Anfrage.
// - Die Mappe kommt nur über den Link des Verkäufers: gespeichert ist allein
//   der SHA-256-Prüfwert, gesucht wird mit Betrieb UND Prüfwert.
// - Der Speicherordner „fahrzeugmappe" hat keine Regeln für Nutzer; Ansehen nur
//   über kurz gültige, signierte Links.
// ============================================================================

import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { ANKAUF_MODUL, kennungGueltig, onlineEinstellung } from './kfzAnkauf';
import { hostSauber } from './kfzBoerse';
import { MAPPE_BUCKET, tokenGueltig } from './fahrzeugMappe';

export function mappeDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}
export type MappeDb = ReturnType<typeof mappeDb>;

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenNeu(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token) };
}

/** Betrieb zur Kennung — nur, wenn der Online-Ankauf eingeschaltet ist. Doppelte Kennung: nie raten. */
export async function betriebZuKennung(db: MappeDb, k: string): Promise<string | null> {
  if (!kennungGueltig(k)) return null;
  const { data } = await db.from('modul_einstellung').select('owner_user_id, einstellung')
    .eq('modul', ANKAUF_MODUL).eq('einstellung->online->>kennung', k).limit(2);
  const rows = ((data as unknown) as { owner_user_id: string; einstellung: unknown }[]) ?? [];
  if (rows.length !== 1) return null;
  const o = onlineEinstellung(rows[0].einstellung);
  return o.aktiv && o.kennung === k ? rows[0].owner_user_id : null;
}

/** Kennung des eingeschalteten Online-Ankaufs eines Betriebs (Menüpunkt der Webseite), sonst null. */
export async function aktiveAnkaufKennung(betrieb: string, db: MappeDb = mappeDb()): Promise<string | null> {
  const { data } = await db.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', ANKAUF_MODUL).maybeSingle();
  const o = onlineEinstellung((data as { einstellung?: unknown } | null)?.einstellung);
  return o.aktiv ? o.kennung : null;
}

/** Betrieb und Kennung zur Domain des Händlers (autohaus.de/fahrzeug-verkaufen). Mehrere Besitzer: nie raten. */
export async function betriebZuDomain(db: MappeDb, host: string): Promise<{ betrieb: string; kennung: string } | null> {
  const d = hostSauber(host);
  if (!d) return null;
  const { data } = await db.from('web_seiten').select('owner_user_id').in('domain', [d, `www.${d}`]).limit(10);
  const besitzer = [...new Set((((data as unknown) as { owner_user_id: string }[]) ?? []).map((z) => z.owner_user_id))];
  if (besitzer.length !== 1) return null;
  const kennung = await aktiveAnkaufKennung(besitzer[0], db);
  return kennung ? { betrieb: besitzer[0], kennung } : null;
}

export type MappeZeile = {
  id: string; owner_user_id: string; status: string; wunsch: string | null; angaben: unknown;
  ankauf_id: string | null; eingereicht_am: string | null; erstellt_am: string; nachreichen_bis: string | null;
};

/** Mappe zum Link des Verkäufers — nur im richtigen Betrieb. */
export async function mappeZuToken(db: MappeDb, betrieb: string, token: unknown): Promise<MappeZeile | null> {
  if (!tokenGueltig(token)) return null;
  const { data } = await db.from('kfz_mappe').select('id, owner_user_id, status, wunsch, angaben, ankauf_id, eingereicht_am, erstellt_am, nachreichen_bis')
    .eq('owner_user_id', betrieb).eq('token_hash', tokenHash(token)).maybeSingle();
  return (data as MappeZeile | null) ?? null;
}

export type DateiZeile = {
  id: string; fach: string; art: string; pfad: string; mime: string; bytes: number | null;
  dateiname: string | null; beschreibung: string | null; pruefung: unknown; status: string; erstellt_am: string;
};

export async function dateienDerMappe(db: MappeDb, mappe: string, betrieb: string): Promise<DateiZeile[]> {
  const { data } = await db.from('kfz_mappe_datei')
    .select('id, fach, art, pfad, mime, bytes, dateiname, beschreibung, pruefung, status, erstellt_am')
    .eq('mappe_id', mappe).eq('owner_user_id', betrieb).order('erstellt_am', { ascending: true }).limit(100);
  return ((data as unknown) as DateiZeile[]) ?? [];
}

/** Signierte Ansichts-Links (Pfad -> URL). Fehler: leere Zuordnung, die Seite zeigt dann Platzhalter. */
export async function ansichtLinks(db: MappeDb, pfade: string[], sekunden: number): Promise<Record<string, string>> {
  if (!pfade.length) return {};
  const { data } = await db.storage.from(MAPPE_BUCKET).createSignedUrls(pfade, sekunden);
  const aus: Record<string, string> = {};
  for (const z of ((data as unknown) as { path: string | null; signedUrl: string | null }[]) ?? []) if (z.path && z.signedUrl) aus[z.path] = z.signedUrl;
  return aus;
}

/** Liegt die Datei wirklich im Ordner? Liefert ihre Größe oder null. */
export async function objektGroesse(db: MappeDb, pfad: string): Promise<number | null> {
  const i = pfad.lastIndexOf('/');
  if (i < 1) return null;
  const ordner = pfad.slice(0, i);
  const name = pfad.slice(i + 1);
  const { data, error } = await db.storage.from(MAPPE_BUCKET).list(ordner, { search: name, limit: 5 });
  if (error) return null;
  const z = (((data as unknown) as { name: string; metadata?: { size?: number } | null }[]) ?? []).find((x) => x.name === name);
  if (!z) return null;
  const n = Number(z.metadata?.size);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function objekteLoeschen(db: MappeDb, pfade: string[]): Promise<void> {
  if (!pfade.length) return;
  const { error } = await db.storage.from(MAPPE_BUCKET).remove(pfade);
  if (error) console.error('fahrzeugmappe: Dateien löschen fehlgeschlagen:', error.message);
}

// --- Paket 306 (FM2): Link für Mails, Verlauf ------------------------------------------------

/** Persönlicher Link des Verkäufers (Schlüssel nur im #-Teil, landet in keinem Server-Protokoll). */
export function mappeLink(basis: string, kennung: string, token: string): string {
  return `${basis.replace(/\/+$/, '')}/ankauf/${kennung}#m=${token}`;
}

export type NachrichtZeile = { id: string; von: string; art: string; text: string | null; betrag: number | null; gueltig_bis: string | null; termin: string | null; erstellt_am: string };

export async function verlaufDerMappe(db: MappeDb, mappe: string, betrieb: string): Promise<NachrichtZeile[]> {
  const { data } = await db.from('kfz_mappe_nachricht').select('id, von, art, text, betrag, gueltig_bis, termin, erstellt_am')
    .eq('mappe_id', mappe).eq('owner_user_id', betrieb).order('erstellt_am', { ascending: true }).limit(200);
  return ((data as unknown) as NachrichtZeile[]) ?? [];
}

/** Firmenname und Antwort-Adresse des Betriebs (Webseiten-Daten, sonst Profil). */
export async function firmaKurz(db: MappeDb, betrieb: string): Promise<{ firma: string; email: string; akzent: string }> {
  const [ci, pr] = await Promise.all([
    db.from('web_ci').select('firma, email, farbe_akzent').eq('owner_user_id', betrieb).maybeSingle(),
    db.from('profiles').select('firma_name, firma_email').eq('id', betrieb).maybeSingle(),
  ]);
  const c = ci.data as { firma?: string | null; email?: string | null; farbe_akzent?: string | null } | null;
  const p = pr.data as { firma_name?: string | null; firma_email?: string | null } | null;
  const akzent = String(c?.farbe_akzent ?? '');
  return {
    firma: String(c?.firma ?? '').trim() || String(p?.firma_name ?? '').trim(),
    email: String(c?.email ?? '').trim() || String(p?.firma_email ?? '').trim(),
    akzent: /^#[0-9a-fA-F]{6}$/.test(akzent) ? akzent : '#0A1628',
  };
}
