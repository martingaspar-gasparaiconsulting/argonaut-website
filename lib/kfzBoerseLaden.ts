// ============================================================================
// ARGONAUT OS · lib/kfzBoerseLaden.ts — Paket 272 (08.10.2026) · K11a Fahrzeugbörse
//
// NUR SERVERSEITIG (Seiten unter app/fahrzeuge und die Börsen-Türen in
// app/api/oeffentlich). Liest mit der Service-Rolle, weil Besucher nicht
// angemeldet sind. Deshalb gilt hier streng:
// - Der Betrieb wird AUSSCHLIESSLICH über die Kennung aus modul_einstellung
//   bestimmt (Chef schaltet die Börse ein) — nie aus der Anfrage übernommen.
// - Jede Abfrage hängt an owner_user_id = dieser Betrieb.
// - Aus kfz_bestand wird nur BOERSE_SPALTEN gelesen und durch oeffentlich()
//   gefiltert (Positivliste: kein EK, keine FIN, kein Kennzeichen, keine Notiz).
// - Fotos gehen nur über die Bild-Tür (signierter Link beim Abruf), Videos nie.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { istBot } from './kfzPreis';
import { BOERSE_MODUL, BOERSE_SPALTEN, BOERSE_SPALTEN_OHNE_HISTORIE, BOERSE_STATUS, boerseEinstellung, kennungGueltig, idGueltig, oeffentlich, hostSauber, type BoerseEinstellung, type BoerseFahrzeug } from './kfzBoerse';

export function boerseDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

export type BoerseDb = ReturnType<typeof boerseDb>;

export type Firma = {
  name: string; inhaber: string; strasse: string; plz: string; ort: string; telefon: string; email: string;
  web: string; oeffnungszeiten: string; ustid: string; register: string; aufsicht: string; logo: string | null; akzent: string;
};

/** Betrieb zur Kennung — nur, wenn die Börse eingeschaltet ist. Doppelte Kennung -> nie raten. */
export async function betriebZuKennung(db: BoerseDb, k: string): Promise<{ betrieb: string; einst: BoerseEinstellung } | null> {
  if (!kennungGueltig(k)) return null;
  const { data } = await db.from('modul_einstellung').select('owner_user_id, einstellung')
    .eq('modul', BOERSE_MODUL).eq('einstellung->>kennung', k).limit(2);
  const rows = ((data as unknown) as { owner_user_id: string; einstellung: unknown }[]) ?? [];
  if (rows.length !== 1) return null;
  const einst = boerseEinstellung(rows[0].einstellung);
  return einst.aktiv && einst.kennung === k ? { betrieb: rows[0].owner_user_id, einst } : null;
}

// --- Paket 273: Börse auf der eigenen Domain des Betriebs ----------------------------------

type DomainZeile = { owner_user_id: string; domain: string | null; status: string | null };

/**
 * Betrieb zur Domain (Aufruf über autohaus-muster.de/fahrzeuge): die Domain steht
 * in web_seiten (Website-Bauer, eindeutig je Seite). Gehört sie mehr als einem
 * Betrieb, wird nie geraten. Die Börse muss eingeschaltet sein.
 */
export async function betriebZuDomain(db: BoerseDb, host: string): Promise<{ betrieb: string; einst: BoerseEinstellung; kennung: string; domain: string } | null> {
  const d = hostSauber(host);
  if (!d) return null;
  const { data } = await db.from('web_seiten').select('owner_user_id, domain, status').in('domain', [d, `www.${d}`]).limit(10);
  const besitzer = [...new Set((((data as unknown) as DomainZeile[]) ?? []).map((z) => z.owner_user_id))];
  if (besitzer.length !== 1) return null;
  const { data: e } = await db.from('modul_einstellung').select('einstellung').eq('owner_user_id', besitzer[0]).eq('modul', BOERSE_MODUL).maybeSingle();
  const einst = boerseEinstellung((e as { einstellung?: unknown } | null)?.einstellung);
  return einst.aktiv && einst.kennung ? { betrieb: besitzer[0], einst, kennung: einst.kennung, domain: d } : null;
}

/** Kennung der eingeschalteten Börse eines Betriebs (für den Menüpunkt „Fahrzeuge" der Webseite), sonst null. */
export async function aktiveBoerseKennung(betrieb: string, db: BoerseDb = boerseDb()): Promise<string | null> {
  const { data } = await db.from('modul_einstellung').select('einstellung').eq('owner_user_id', betrieb).eq('modul', BOERSE_MODUL).maybeSingle();
  const e = boerseEinstellung((data as { einstellung?: unknown } | null)?.einstellung);
  return e.aktiv ? e.kennung : null;
}

/** Verbundene Domain des Betriebs (veröffentlichte Webseite mit eingetragener Domain) — für die Google-Adresse. */
export async function verbundeneDomain(db: BoerseDb, betrieb: string): Promise<string | null> {
  const { data } = await db.from('web_seiten').select('owner_user_id, domain, status').eq('owner_user_id', betrieb).eq('status', 'live').limit(20);
  const domains = [...new Set((((data as unknown) as DomainZeile[]) ?? []).map((z) => hostSauber(z.domain)).filter((x): x is string => !!x))];
  return domains.length === 1 ? domains[0] : null;   // mehrere Domains: keine raten, Börse bleibt unter argonaut-os.com
}

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Firmenangaben für Kopf, Impressum und Datenschutz: Webseiten-Daten (web_ci), sonst Profil. */
export async function firmaZu(db: BoerseDb, betrieb: string): Promise<Firma> {
  const [ci, pr] = await Promise.all([
    db.from('web_ci').select('firma, impressum_inhaber, strasse, plz, ort, telefon, email, web, oeffnungszeiten, impressum_ustid, impressum_register, impressum_aufsicht, logo_url, farbe_akzent').eq('owner_user_id', betrieb).maybeSingle(),
    db.from('profiles').select('firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_ust_id').eq('id', betrieb).maybeSingle(),
  ]);
  const c = ((ci.data as unknown) as Record<string, unknown> | null) ?? {};
  const p = ((pr.data as unknown) as Record<string, unknown> | null) ?? {};
  const logo = s(c.logo_url);
  return {
    name: s(c.firma) || s(p.firma_name), inhaber: s(c.impressum_inhaber),
    strasse: s(c.strasse) || s(p.firma_strasse), plz: s(c.plz) || s(p.firma_plz), ort: s(c.ort) || s(p.firma_ort),
    telefon: s(c.telefon) || s(p.firma_telefon), email: s(c.email) || s(p.firma_email), web: s(c.web) || s(p.firma_website),
    oeffnungszeiten: s(c.oeffnungszeiten), ustid: s(c.impressum_ustid) || s(p.firma_ust_id),
    register: s(c.impressum_register), aufsicht: s(c.impressum_aufsicht),
    akzent: /^#[0-9a-fA-F]{6}$/.test(s(c.farbe_akzent)) ? s(c.farbe_akzent) : '#0A1628',
    logo: /^https:\/\/[^\s"'<>]+$/.test(logo) ? logo : null,
  };
}

type MedienZeile = { id: string; bestand_id: string; position: number | null };

/** Alle sichtbaren Fahrzeuge des Betriebs mit Titelbild-ID (erstes Foto nach Reihenfolge). */
export async function sichtbareFahrzeuge(db: BoerseDb, betrieb: string): Promise<{ f: BoerseFahrzeug; bild: string | null }[]> {
  const voll = await db.from('kfz_bestand').select(BOERSE_SPALTEN)
    .eq('owner_user_id', betrieb).eq('inseriert', true).in('status', BOERSE_STATUS).limit(500);
  // Paket 274: SQL noch nicht gelaufen -> ohne Historie-Spalten weiter
  const data: unknown = voll.error
    ? (await db.from('kfz_bestand').select(BOERSE_SPALTEN_OHNE_HISTORIE)
      .eq('owner_user_id', betrieb).eq('inseriert', true).in('status', BOERSE_STATUS).limit(500)).data
    : voll.data;
  const liste = (((data as unknown) as unknown[]) ?? []).map(oeffentlich).filter((x): x is BoerseFahrzeug => x !== null);
  if (!liste.length) return [];
  const { data: m } = await db.from('kfz_bestand_medien').select('id, bestand_id, position')
    .eq('owner_user_id', betrieb).eq('art', 'foto').in('bestand_id', liste.map((x) => x.id))
    .order('position', { ascending: true }).limit(5000);
  const erstes = new Map<string, string>();
  for (const z of (((m as unknown) as MedienZeile[]) ?? [])) if (!erstes.has(z.bestand_id)) erstes.set(z.bestand_id, z.id);
  return liste.map((f) => ({ f, bild: erstes.get(f.id) ?? null }));
}

/** Ein sichtbares Fahrzeug mit allen Foto-IDs (Reihenfolge der Akte). Nicht sichtbar -> null. */
export async function sichtbaresFahrzeug(db: BoerseDb, betrieb: string, id: string): Promise<{ f: BoerseFahrzeug; bilder: string[] } | null> {
  if (!idGueltig(id)) return null;
  const voll = await db.from('kfz_bestand').select(BOERSE_SPALTEN).eq('owner_user_id', betrieb).eq('id', id).maybeSingle();
  const data: unknown = voll.error
    ? (await db.from('kfz_bestand').select(BOERSE_SPALTEN_OHNE_HISTORIE).eq('owner_user_id', betrieb).eq('id', id).maybeSingle()).data
    : voll.data;
  const f = oeffentlich(data);
  if (!f) return null;
  const { data: m } = await db.from('kfz_bestand_medien').select('id, bestand_id, position')
    .eq('owner_user_id', betrieb).eq('bestand_id', id).eq('art', 'foto').order('position', { ascending: true }).limit(60);
  return { f, bilder: (((m as unknown) as MedienZeile[]) ?? []).map((z) => z.id) };
}

/** Basis-Adresse für absolute Links (Strukturdaten, Mails). */
export function basisAdresse(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://argonaut-os.com').trim().replace(/\/+$/, '');
}

// --- Paket 275: Aufrufe je Fahrzeug zählen (K12a Markt und Preis) ---------------------------

/**
 * Zählt einen Aufruf der Detailseite (+1 für heute). Nur eine Tageszahl — keine IP,
 * kein Cookie, kein Besucher. Bots, Link-Vorschauen und Vorab-Abrufe zählen nicht.
 * Die Funktion p275_aufruf_zaehlen darf nur die Server-Rolle ausführen und zählt nur
 * inserierte Fahrzeuge dieses Betriebs. Fehlt das SQL oder hakt es: still weiter —
 * die Seite darf am Zähler nie scheitern.
 */
export async function aufrufZaehlen(db: BoerseDb, betrieb: string, id: string, kopf: Headers | null): Promise<void> {
  try {
    if (!kopf || istBot(kopf.get('user-agent'))) return;
    const zweck = `${kopf.get('purpose') ?? ''} ${kopf.get('sec-purpose') ?? ''} ${kopf.get('next-router-prefetch') ?? ''}`;
    if (/prefetch|prerender|1/i.test(zweck.trim())) return;
    await db.rpc('p275_aufruf_zaehlen', { p_owner: betrieb, p_bestand: id });
  } catch {
    /* Zähler ist Nebensache */
  }
}
