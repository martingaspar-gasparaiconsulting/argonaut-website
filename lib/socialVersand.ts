// ============================================================================
// ARGONAUT OS · lib/socialVersand.ts  (Social Paket 3 · Auto-Posten-Motor)
//
// SERVER-ONLY. Postet einen Beitrag auf die verbundenen Meta-Kanaele
// (Facebook-Seite + Instagram). Erwartet einen Supabase-Client mit Service-Role
// (Protokoll-Inserts setzen owner explizit).
//
// SPEICHER-PRINZIP (schlank, ohne Drittanbieter): Videos werden NUR VERLINKT,
// nie dauerhaft bei uns gelagert. Fuer Facebook geht ein YouTube-/Vimeo-Link als
// normaler Link-Beitrag; Instagram braucht eine DIREKTE Bild-/Videodatei-URL.
// (Ein spaeteres Zusatzpaket erlaubt Datei-Upload mit Auto-Loeschung nach dem
// Posten — hier bewusst noch nicht, um den Motor schlank zu halten.)
//
// Payload-Erzeugung ist rein & node-testbar; nur der fetch-Aufruf selbst ist
// gegen die echte API erst testbar, sobald ein Zugang verbunden ist.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { videoEinbettung } from './landingpages';

const META_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;

export type MetaAnfrage = { url: string; body: Record<string, unknown> };

export type MedienKlassen = { bildUrls: string[]; videoDateiUrls: string[]; embedLinks: string[] };

/**
 * Teilt die Medien-URLs eines Beitrags in drei Klassen:
 *   - bildUrls:       direkte Bilddateien (jpg/png/webp/gif)
 *   - videoDateiUrls: direkte Videodateien (mp4/webm/ogg)
 *   - embedLinks:     YouTube-/Vimeo-Links (nur als Link postbar, keine Datei)
 * Reihenfolge bleibt erhalten. Unbekanntes wird ignoriert.
 */
export function klassifiziereMedien(urls: string[] | null | undefined): MedienKlassen {
  const bildUrls: string[] = [];
  const videoDateiUrls: string[] = [];
  const embedLinks: string[] = [];
  for (const roh of urls || []) {
    const u = (roh || '').trim();
    if (!u) continue;
    const v = videoEinbettung(u);
    if (v.typ === 'youtube' || v.typ === 'vimeo') { embedLinks.push(u); continue; }
    if (v.typ === 'datei') { videoDateiUrls.push(u); continue; }
    if (/\.(jpe?g|png|webp|gif)(\?[^\s]*)?$/i.test(u)) { bildUrls.push(u); continue; }
    // Unbekannt -> ignorieren (kein Rateposten).
  }
  return { bildUrls, videoDateiUrls, embedLinks };
}

/**
 * Kann dieser Kanal mit diesem Inhalt gepostet werden?
 * Facebook: ja, sobald Text ODER irgendein Medium/Link da ist.
 * Instagram: braucht eine DIREKTE Bild- oder Videodatei-URL (kein reiner Link/Text).
 */
export function postbarkeitMeta(
  plattform: string,
  inhalt: { text?: string | null; klassen: MedienKlassen },
): { ok: boolean; grund: string | null } {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls, embedLinks } = inhalt.klassen;
  const hatDirektMedium = bildUrls.length > 0 || videoDateiUrls.length > 0;

  if (plattform === 'facebook') {
    if (text || hatDirektMedium || embedLinks.length > 0) return { ok: true, grund: null };
    return { ok: false, grund: 'Facebook: kein Inhalt zum Posten.' };
  }
  if (plattform === 'instagram') {
    if (hatDirektMedium) return { ok: true, grund: null };
    return { ok: false, grund: 'Instagram braucht ein direktes Bild oder eine Videodatei (ein YouTube-/Vimeo-Link genügt hier nicht).' };
  }
  return { ok: false, grund: 'Diese Plattform wird vom Auto-Posten noch nicht unterstützt.' };
}

/** Baut den EINEN Facebook-Seiten-Aufruf (Foto / Video / Text+Link). */
export function baueFacebookAnfrage(
  pageId: string,
  token: string,
  inhalt: { text?: string | null; klassen: MedienKlassen },
): MetaAnfrage {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls, embedLinks } = inhalt.klassen;
  const id = (pageId || '').trim();

  if (bildUrls[0]) {
    return { url: `${GRAPH}/${id}/photos`, body: { url: bildUrls[0], caption: text, access_token: token } };
  }
  if (videoDateiUrls[0]) {
    return { url: `${GRAPH}/${id}/videos`, body: { file_url: videoDateiUrls[0], description: text, access_token: token } };
  }
  const body: Record<string, unknown> = { message: text, access_token: token };
  if (embedLinks[0]) body.link = embedLinks[0];
  return { url: `${GRAPH}/${id}/feed`, body };
}

/** Baut den Instagram-Container-Aufruf (Schritt 1 von 2). */
export function baueInstagramContainer(
  igId: string,
  token: string,
  inhalt: { text?: string | null; klassen: MedienKlassen },
): MetaAnfrage {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls } = inhalt.klassen;
  const id = (igId || '').trim();
  const body: Record<string, unknown> = { caption: text, access_token: token };
  if (videoDateiUrls[0]) { body.media_type = 'REELS'; body.video_url = videoDateiUrls[0]; }
  else { body.image_url = bildUrls[0]; }
  return { url: `${GRAPH}/${id}/media`, body };
}

/** Baut den Instagram-Veroeffentlichen-Aufruf (Schritt 2 von 2). */
export function baueInstagramPublish(igId: string, token: string, creationId: string): MetaAnfrage {
  return { url: `${GRAPH}/${(igId || '').trim()}/media_publish`, body: { creation_id: creationId, access_token: token } };
}

/** Fuehrt EINEN Graph-Aufruf aus (Netzwerk). Wirft nie — gibt {ok, id?, fehler?}. */
export async function sendeMetaAnfrage(a: MetaAnfrage): Promise<{ ok: boolean; id: string | null; fehler: string | null }> {
  try {
    const res = await fetch(a.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a.body) });
    const txt = await res.text();
    let json: unknown = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { /* kein JSON */ }
    if (!res.ok) {
      const fehler = (json as { error?: { message?: string } } | null)?.error?.message || txt.slice(0, 300) || `HTTP ${res.status}`;
      return { ok: false, id: null, fehler };
    }
    const j = (json as { id?: string; post_id?: string } | null) || {};
    return { ok: true, id: j.post_id || j.id || null, fehler: null };
  } catch (e) {
    return { ok: false, id: null, fehler: e instanceof Error ? e.message : 'Netzwerkfehler.' };
  }
}

export type MetaZugang = { plattform: string; ziel_id: string; token: string };

export type BeitragLite = { id: string; text: string | null; medien_urls: string[] | null; kanaele: string[] | null };

export type VersandErgebnis = { plattform: string; ok: boolean; extern_id: string | null; fehler: string | null };

/**
 * Postet EINEN Kanal (Facebook = 1 Aufruf, Instagram = Container + Publish).
 * Rein die Netzwerk-Orchestrierung; kein DB-Zugriff.
 */
export async function posteKanal(plattform: string, zugang: MetaZugang, klassen: MedienKlassen, text: string | null): Promise<VersandErgebnis> {
  const post = postbarkeitMeta(plattform, { text, klassen });
  if (!post.ok) return { plattform, ok: false, extern_id: null, fehler: post.grund };

  if (plattform === 'facebook') {
    const r = await sendeMetaAnfrage(baueFacebookAnfrage(zugang.ziel_id, zugang.token, { text, klassen }));
    return { plattform, ok: r.ok, extern_id: r.id, fehler: r.fehler };
  }
  if (plattform === 'instagram') {
    const c = await sendeMetaAnfrage(baueInstagramContainer(zugang.ziel_id, zugang.token, { text, klassen }));
    if (!c.ok || !c.id) return { plattform, ok: false, extern_id: null, fehler: c.fehler || 'Instagram-Container fehlgeschlagen.' };
    const p = await sendeMetaAnfrage(baueInstagramPublish(zugang.ziel_id, zugang.token, c.id));
    return { plattform, ok: p.ok, extern_id: p.id, fehler: p.fehler };
  }
  return { plattform, ok: false, extern_id: null, fehler: 'Plattform nicht unterstützt.' };
}

/**
 * Postet einen Beitrag auf alle gewaehlten, verbundenen Meta-Kanaele und
 * protokolliert jeden Kanal in social_versand. Wirft nie. Gibt die Ergebnisse
 * zurueck (fuer Statuswechsel des Beitrags durch den Aufrufer).
 */
export async function posteBeitrag(
  admin: SupabaseClient,
  opts: { ownerId: string; beitrag: BeitragLite; zugaenge: Record<string, MetaZugang> },
): Promise<{ ergebnisse: VersandErgebnis[]; gesendet: number; fehler: number }> {
  const klassen = klassifiziereMedien(opts.beitrag.medien_urls);
  const text = opts.beitrag.text;
  const kanaele = (opts.beitrag.kanaele || []).filter((k) => k === 'facebook' || k === 'instagram');

  const ergebnisse: VersandErgebnis[] = [];
  let gesendet = 0, fehler = 0;

  for (const plattform of kanaele) {
    const zugang = opts.zugaenge[plattform];
    let erg: VersandErgebnis;
    if (!zugang) {
      erg = { plattform, ok: false, extern_id: null, fehler: 'Kanal nicht verbunden — bitte oben verbinden.' };
    } else {
      erg = await posteKanal(plattform, zugang, klassen, text);
    }
    ergebnisse.push(erg);
    if (erg.ok) gesendet++; else fehler++;
    try {
      await admin.from('social_versand').insert({
        owner_user_id: opts.ownerId,
        beitrag_id: opts.beitrag.id,
        plattform,
        status: erg.ok ? 'gesendet' : 'fehler',
        extern_id: erg.extern_id,
        fehler_text: erg.fehler,
      });
    } catch { /* Protokoll darf den Lauf nicht stoppen */ }
  }

  return { ergebnisse, gesendet, fehler };
}
