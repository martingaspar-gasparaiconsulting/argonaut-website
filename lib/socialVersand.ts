// ============================================================================
// ARGONAUT OS · lib/socialVersand.ts  (Social Paket 3 + 6 · Auto-Posten-Motor)
//
// SERVER-ONLY. Postet einen Beitrag auf die verbundenen Kanaele:
//   - Meta: Facebook-Seite + Instagram (Graph API)
//   - Google Unternehmensprofil (localPosts)   [P6]
//   - LinkedIn (ugcPosts)                       [P6]
//
// Erwartet einen Supabase-Client mit Service-Role (Protokoll-Inserts setzen owner
// explizit). SPEICHER-PRINZIP: Videos werden NUR VERLINKT, nie bei uns gelagert.
//
// Payload-Erzeugung ist rein & node-testbar; nur der fetch-Aufruf selbst ist
// gegen die echte API erst testbar, sobald ein Zugang verbunden ist.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { videoEinbettung } from './landingpages';

const META_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;
const GBP = 'https://mybusiness.googleapis.com/v4';
const LINKEDIN = 'https://api.linkedin.com/v2/ugcPosts';

/** Kanaele, die der Motor aktiv posten kann. */
export const POSTBARE_PLATTFORMEN = ['facebook', 'instagram', 'google_business', 'linkedin'];

export type Anfrage = { url: string; body: Record<string, unknown>; headers?: Record<string, string> };
export type MedienKlassen = { bildUrls: string[]; videoDateiUrls: string[]; embedLinks: string[] };

/** Teilt Medien-URLs in Bild / Videodatei / Embed (YouTube/Vimeo). */
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
  }
  return { bildUrls, videoDateiUrls, embedLinks };
}

/** Kann dieser Kanal mit diesem Inhalt gepostet werden? */
export function postbarkeit(plattform: string, inhalt: { text?: string | null; klassen: MedienKlassen }): { ok: boolean; grund: string | null } {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls, embedLinks } = inhalt.klassen;
  const hatDirektMedium = bildUrls.length > 0 || videoDateiUrls.length > 0;

  switch (plattform) {
    case 'facebook':
      return (text || hatDirektMedium || embedLinks.length > 0) ? { ok: true, grund: null } : { ok: false, grund: 'Facebook: kein Inhalt zum Posten.' };
    case 'instagram':
      return hatDirektMedium ? { ok: true, grund: null } : { ok: false, grund: 'Instagram braucht ein direktes Bild oder eine Videodatei (ein YouTube-/Vimeo-Link genügt hier nicht).' };
    case 'google_business':
      return text ? { ok: true, grund: null } : { ok: false, grund: 'Google Unternehmensprofil braucht einen Text.' };
    case 'linkedin':
      return (text || embedLinks.length > 0) ? { ok: true, grund: null } : { ok: false, grund: 'LinkedIn braucht einen Text.' };
    default:
      return { ok: false, grund: 'Diese Plattform wird vom Auto-Posten noch nicht unterstützt.' };
  }
}

// ---------- Meta (Facebook / Instagram) ----------

export function baueFacebookAnfrage(pageId: string, token: string, inhalt: { text?: string | null; klassen: MedienKlassen }): Anfrage {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls, embedLinks } = inhalt.klassen;
  const id = (pageId || '').trim();
  if (bildUrls[0]) return { url: `${GRAPH}/${id}/photos`, body: { url: bildUrls[0], caption: text, access_token: token } };
  if (videoDateiUrls[0]) return { url: `${GRAPH}/${id}/videos`, body: { file_url: videoDateiUrls[0], description: text, access_token: token } };
  const body: Record<string, unknown> = { message: text, access_token: token };
  if (embedLinks[0]) body.link = embedLinks[0];
  return { url: `${GRAPH}/${id}/feed`, body };
}

export function baueInstagramContainer(igId: string, token: string, inhalt: { text?: string | null; klassen: MedienKlassen }): Anfrage {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls } = inhalt.klassen;
  const id = (igId || '').trim();
  const body: Record<string, unknown> = { caption: text, access_token: token };
  if (videoDateiUrls[0]) { body.media_type = 'REELS'; body.video_url = videoDateiUrls[0]; }
  else { body.image_url = bildUrls[0]; }
  return { url: `${GRAPH}/${id}/media`, body };
}

export function baueInstagramPublish(igId: string, token: string, creationId: string): Anfrage {
  return { url: `${GRAPH}/${(igId || '').trim()}/media_publish`, body: { creation_id: creationId, access_token: token } };
}

// ---------- Google Unternehmensprofil (localPosts) ----------

export function baueGoogleBusinessAnfrage(locationName: string, token: string, inhalt: { text?: string | null; klassen: MedienKlassen }): Anfrage {
  const text = (inhalt.text || '').trim();
  const bild = inhalt.klassen.bildUrls[0];
  const body: Record<string, unknown> = { languageCode: 'de', summary: text, topicType: 'STANDARD' };
  if (bild) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: bild }];
  return {
    url: `${GBP}/${(locationName || '').trim()}/localPosts`,
    body,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
}

// ---------- LinkedIn (ugcPosts) ----------

export function baueLinkedInAnfrage(authorUrn: string, token: string, inhalt: { text?: string | null; klassen: MedienKlassen }): Anfrage {
  const text = (inhalt.text || '').trim();
  const link = inhalt.klassen.embedLinks[0];
  const share: Record<string, unknown> = {
    shareCommentary: { text },
    shareMediaCategory: link ? 'ARTICLE' : 'NONE',
  };
  if (link) share.media = [{ status: 'READY', originalUrl: link }];
  return {
    url: LINKEDIN,
    body: {
      author: (authorUrn || '').trim(),
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': share },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    },
    headers: { Authorization: `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' },
  };
}

/** Fuehrt EINEN Aufruf aus (Netzwerk). Wirft nie — gibt {ok, id?, fehler?}. */
export async function sendeAnfrage(a: Anfrage): Promise<{ ok: boolean; id: string | null; fehler: string | null }> {
  try {
    const res = await fetch(a.url, { method: 'POST', headers: a.headers ?? { 'Content-Type': 'application/json' }, body: JSON.stringify(a.body) });
    const txt = await res.text();
    let json: unknown = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { /* kein JSON */ }
    if (!res.ok) {
      const fehler =
        (json as { error?: { message?: string } } | null)?.error?.message ||
        (json as { message?: string } | null)?.message ||
        txt.slice(0, 300) || `HTTP ${res.status}`;
      return { ok: false, id: null, fehler };
    }
    const j = (json as { id?: string; post_id?: string; name?: string } | null) || {};
    const id = j.post_id || j.id || j.name || res.headers.get('x-restli-id') || null;
    return { ok: true, id, fehler: null };
  } catch (e) {
    return { ok: false, id: null, fehler: e instanceof Error ? e.message : 'Netzwerkfehler.' };
  }
}

export type MetaZugang = { plattform: string; ziel_id: string; token: string };
export type BeitragLite = { id: string; text: string | null; medien_urls: string[] | null; kanaele: string[] | null };
export type VersandErgebnis = { plattform: string; ok: boolean; extern_id: string | null; fehler: string | null };

/** Postet EINEN Kanal (FB = 1 Call, IG = 2 Calls, Google/LinkedIn = 1 Call). */
export async function posteKanal(plattform: string, zugang: MetaZugang, klassen: MedienKlassen, text: string | null): Promise<VersandErgebnis> {
  const post = postbarkeit(plattform, { text, klassen });
  if (!post.ok) return { plattform, ok: false, extern_id: null, fehler: post.grund };
  const inhalt = { text, klassen };

  if (plattform === 'facebook') {
    const r = await sendeAnfrage(baueFacebookAnfrage(zugang.ziel_id, zugang.token, inhalt));
    return { plattform, ok: r.ok, extern_id: r.id, fehler: r.fehler };
  }
  if (plattform === 'instagram') {
    const c = await sendeAnfrage(baueInstagramContainer(zugang.ziel_id, zugang.token, inhalt));
    if (!c.ok || !c.id) return { plattform, ok: false, extern_id: null, fehler: c.fehler || 'Instagram-Container fehlgeschlagen.' };
    const p = await sendeAnfrage(baueInstagramPublish(zugang.ziel_id, zugang.token, c.id));
    return { plattform, ok: p.ok, extern_id: p.id, fehler: p.fehler };
  }
  if (plattform === 'google_business') {
    const r = await sendeAnfrage(baueGoogleBusinessAnfrage(zugang.ziel_id, zugang.token, inhalt));
    return { plattform, ok: r.ok, extern_id: r.id, fehler: r.fehler };
  }
  if (plattform === 'linkedin') {
    const r = await sendeAnfrage(baueLinkedInAnfrage(zugang.ziel_id, zugang.token, inhalt));
    return { plattform, ok: r.ok, extern_id: r.id, fehler: r.fehler };
  }
  return { plattform, ok: false, extern_id: null, fehler: 'Plattform nicht unterstützt.' };
}

/** Postet einen Beitrag auf alle gewaehlten, verbundenen Kanaele + Protokoll. */
export async function posteBeitrag(
  admin: SupabaseClient,
  opts: { ownerId: string; beitrag: BeitragLite; zugaenge: Record<string, MetaZugang> },
): Promise<{ ergebnisse: VersandErgebnis[]; gesendet: number; fehler: number }> {
  const klassen = klassifiziereMedien(opts.beitrag.medien_urls);
  const text = opts.beitrag.text;
  const kanaele = (opts.beitrag.kanaele || []).filter((k) => POSTBARE_PLATTFORMEN.includes(k));

  const ergebnisse: VersandErgebnis[] = [];
  let gesendet = 0, fehler = 0;

  for (const plattform of kanaele) {
    const zugang = opts.zugaenge[plattform];
    const erg = zugang
      ? await posteKanal(plattform, zugang, klassen, text)
      : { plattform, ok: false, extern_id: null, fehler: 'Kanal nicht verbunden — bitte oben verbinden.' };
    ergebnisse.push(erg);
    if (erg.ok) gesendet++; else fehler++;
    try {
      await admin.from('social_versand').insert({
        owner_user_id: opts.ownerId, beitrag_id: opts.beitrag.id, plattform,
        status: erg.ok ? 'gesendet' : 'fehler', extern_id: erg.extern_id, fehler_text: erg.fehler,
      });
    } catch { /* Protokoll darf den Lauf nicht stoppen */ }
  }

  return { ergebnisse, gesendet, fehler };
}
