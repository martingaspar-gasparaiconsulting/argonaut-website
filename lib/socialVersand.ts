// ============================================================================
// ARGONAUT OS · lib/socialVersand.ts  (Social Paket 3 + 6 + 7 · Auto-Posten-Motor)
//
// SERVER-ONLY. Postet einen Beitrag auf die verbundenen Kanaele:
//   - Meta: Facebook-Seite + Instagram (Graph API)
//   - Google Unternehmensprofil (localPosts)   [P6]
//   - LinkedIn (ugcPosts)                       [P6]
//   - Mastodon (api/v1/statuses)                [P7]
//   - Bluesky (AT-Protokoll, zweistufig)        [P7]
//
// Erwartet einen Supabase-Client mit Service-Role (Protokoll-Inserts setzen owner
// explizit). SPEICHER-PRINZIP: Videos werden NUR VERLINKT, nie bei uns gelagert.
//
// Payload-Erzeugung ist rein & node-testbar; nur der fetch-Aufruf selbst ist
// gegen die echte API erst testbar, sobald ein Zugang verbunden ist.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { videoEinbettung } from './landingpages';
import { plattformFuer, zaehleZeichen, POSTBARE_PLATTFORMEN } from './social';

/** Kanaele, die der Motor aktiv posten kann. Quelle: lib/social.ts. */
export { POSTBARE_PLATTFORMEN };

const META_VERSION = 'v21.0';
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;
const GBP = 'https://mybusiness.googleapis.com/v4';
const LINKEDIN = 'https://api.linkedin.com/v2/ugcPosts';
/** Der oeffentliche Einstiegs-Server des AT-Protokolls. */
const BSKY = 'https://bsky.social';


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

// ---------- Offene Netze: Adressen aufraeumen (rein, node-testbar) ----------

/**
 * Macht aus dem, was ein Betrieb eintippt, eine brauchbare Server-Adresse.
 * „mastodon.social“, „https://mastodon.social/“ und „@ich@mastodon.social“
 * fuehren alle zu „https://mastodon.social“.
 */
export function mastodonBasis(roh: string | null | undefined): string {
  let s = String(roh ?? '').trim();
  if (!s) return '';
  // Eine Adresse der Form @nutzer@server -> nur der Server zaehlt.
  if (s.startsWith('@')) {
    const teile = s.slice(1).split('@');
    s = teile.length > 1 ? teile[teile.length - 1] : teile[0];
  }
  s = s.replace(/^https?:\/\//i, '');
  s = s.split('/')[0].trim();
  s = s.replace(/\/+$/, '');
  return s ? `https://${s.toLowerCase()}` : '';
}

/**
 * Macht aus dem, was ein Betrieb eintippt, einen Bluesky-Handle.
 * „@name.bsky.social“ und „https://bsky.app/profile/name.bsky.social“
 * fuehren beide zu „name.bsky.social“.
 */
export function bskyHandle(roh: string | null | undefined): string {
  let s = String(roh ?? '').trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\/(www\.)?bsky\.app\/profile\//i, '');
  s = s.replace(/^https?:\/\//i, '');
  s = s.split('/')[0].trim();
  s = s.replace(/^@+/, '');
  return s.toLowerCase();
}

/**
 * Der Text fuer Mastodon/Bluesky. Diese Netze haben kein eigenes Link-Feld —
 * ein Video-Link muss deshalb IM Text stehen, sonst geht er verloren.
 * Steht er schon drin, wird er nicht doppelt angehaengt.
 */
export function textFuerOffeneNetze(text: string | null | undefined, klassen: MedienKlassen): string {
  const t = String(text ?? '').trim();
  const link = klassen.embedLinks[0] || '';
  if (!link) return t;
  if (t.includes(link)) return t;
  return t ? `${t}\n\n${link}` : link;
}

/** Kann dieser Kanal mit diesem Inhalt gepostet werden? */
export function postbarkeit(plattform: string, inhalt: { text?: string | null; klassen: MedienKlassen }): { ok: boolean; grund: string | null } {
  const text = (inhalt.text || '').trim();
  const { bildUrls, videoDateiUrls, embedLinks } = inhalt.klassen;
  const hatDirektMedium = bildUrls.length > 0 || videoDateiUrls.length > 0;

  // Mastodon und Bluesky: nur Text und Links, dafuer mit hartem Zeichenlimit.
  // Das Limit wird hier NOCH EINMAL geprueft, obwohl der Editor es schon prueft:
  // Ein Beitrag kann vor dem Hinzufuegen des Kanals geschrieben worden sein.
  if (plattform === 'mastodon' || plattform === 'bluesky') {
    const p = plattformFuer(plattform);
    const voll = textFuerOffeneNetze(text, inhalt.klassen);
    if (!voll) {
      return { ok: false, grund: `${p?.name ?? plattform} braucht einen Text.` };
    }
    if (p && zaehleZeichen(voll) > p.zeichenlimit) {
      return { ok: false, grund: `${p.name}: Text zu lang (${zaehleZeichen(voll)}/${p.zeichenlimit} Zeichen).` };
    }
    return { ok: true, grund: null };
  }

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

// ---------- Mastodon (api/v1/statuses) ----------

/**
 * Ein Beitrag („Toot“) auf der eigenen Instanz.
 *
 * Der Idempotenz-Schluessel ist kein Beiwerk: Schickt der Cron denselben
 * Beitrag nach einem Netzwerkfehler ein zweites Mal, erkennt Mastodon das am
 * Schluessel und postet trotzdem nur einmal.
 */
export function baueMastodonAnfrage(
  instanz: string,
  token: string,
  inhalt: { text?: string | null; klassen: MedienKlassen },
  idempotenzSchluessel?: string,
): Anfrage {
  const basis = mastodonBasis(instanz);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (idempotenzSchluessel) headers['Idempotency-Key'] = idempotenzSchluessel;
  return {
    url: `${basis}/api/v1/statuses`,
    body: { status: textFuerOffeneNetze(inhalt.text, inhalt.klassen), visibility: 'public', language: 'de' },
    headers,
  };
}

// ---------- Bluesky (AT-Protokoll, zwei Schritte) ----------

/**
 * Schritt 1: Anmeldung. Bluesky kennt keine Dauer-Token — man tauscht Handle
 * und App-Passwort gegen ein kurzlebiges Ticket (accessJwt) ein.
 */
export function baueBlueskySession(handle: string, appPasswort: string): Anfrage {
  return {
    url: `${BSKY}/xrpc/com.atproto.server.createSession`,
    body: { identifier: bskyHandle(handle), password: (appPasswort || '').trim() },
    headers: { 'Content-Type': 'application/json' },
  };
}

/** Schritt 2: Der eigentliche Beitrag, mit dem Ticket aus Schritt 1. */
export function baueBlueskyPost(
  did: string,
  jwt: string,
  inhalt: { text?: string | null; klassen: MedienKlassen },
  jetztIso: string,
): Anfrage {
  return {
    url: `${BSKY}/xrpc/com.atproto.repo.createRecord`,
    body: {
      repo: (did || '').trim(),
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: textFuerOffeneNetze(inhalt.text, inhalt.klassen),
        createdAt: jetztIso,
        langs: ['de'],
      },
    },
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  };
}

export type RohAntwort = {
  ok: boolean;
  json: Record<string, unknown> | null;
  restliId: string | null;
  fehler: string | null;
};

/**
 * Fuehrt EINEN Aufruf aus und gibt die ganze Antwort zurueck. Wirft nie.
 * Braucht man dort, wo nicht nur eine Id interessiert (Bluesky-Anmeldung).
 */
export async function sendeAnfrageRoh(a: Anfrage): Promise<RohAntwort> {
  try {
    const res = await fetch(a.url, { method: 'POST', headers: a.headers ?? { 'Content-Type': 'application/json' }, body: JSON.stringify(a.body) });
    const txt = await res.text();
    let json: unknown = null;
    try { json = txt ? JSON.parse(txt) : null; } catch { /* kein JSON */ }
    const restliId = res.headers.get('x-restli-id');
    const objekt = (json && typeof json === 'object') ? (json as Record<string, unknown>) : null;
    if (!res.ok) {
      // Meta/Google melden {error:{message}}, LinkedIn {message},
      // Mastodon und Bluesky {error:"Text"} bzw. {message:"Text"}.
      const roherFehler = objekt?.error;
      const fehler =
        (typeof roherFehler === 'object' && roherFehler !== null
          ? (roherFehler as { message?: string }).message
          : undefined) ||
        (typeof objekt?.message === 'string' ? (objekt.message as string) : undefined) ||
        (typeof roherFehler === 'string' ? roherFehler : undefined) ||
        txt.slice(0, 300) || `HTTP ${res.status}`;
      return { ok: false, json: objekt, restliId, fehler };
    }
    return { ok: true, json: objekt, restliId, fehler: null };
  } catch (e) {
    return { ok: false, json: null, restliId: null, fehler: e instanceof Error ? e.message : 'Netzwerkfehler.' };
  }
}

/** Fuehrt EINEN Aufruf aus (Netzwerk). Wirft nie — gibt {ok, id?, fehler?}. */
export async function sendeAnfrage(a: Anfrage): Promise<{ ok: boolean; id: string | null; fehler: string | null }> {
  const r = await sendeAnfrageRoh(a);
  if (!r.ok) return { ok: false, id: null, fehler: r.fehler };
  const j = (r.json as { id?: string; post_id?: string; name?: string } | null) || {};
  const id = j.post_id || j.id || j.name || r.restliId || null;
  return { ok: true, id, fehler: null };
}

/**
 * Ein entschluesselter Zugang. Heisst aus historischen Gruenden „MetaZugang“ —
 * gilt aber fuer alle Kanaele: ziel_id ist je nach Kanal die Seiten-ID, der
 * Standort-Name, die URN, die Instanz-Adresse oder der Bluesky-Handle.
 */
export type MetaZugang = { plattform: string; ziel_id: string; token: string };
export type BeitragLite = { id: string; text: string | null; medien_urls: string[] | null; kanaele: string[] | null };
export type VersandErgebnis = { plattform: string; ok: boolean; extern_id: string | null; fehler: string | null };

/**
 * Postet EINEN Kanal.
 * FB = 1 Aufruf, IG = 2, Google/LinkedIn/Mastodon = 1, Bluesky = 2 (Anmeldung + Beitrag).
 *
 * beitragId dient als Idempotenz-Schluessel (Mastodon) — bei einem zweiten
 * Anlauf entsteht dann kein doppelter Beitrag.
 */
export async function posteKanal(
  plattform: string,
  zugang: MetaZugang,
  klassen: MedienKlassen,
  text: string | null,
  beitragId?: string,
): Promise<VersandErgebnis> {
  const post = postbarkeit(plattform, { text, klassen });
  if (!post.ok) return { plattform, ok: false, extern_id: null, fehler: post.grund };
  const inhalt = { text, klassen };

  // Bild/Video kann in den offenen Netzen noch nicht mit. Das ist kein Fehler —
  // der Text geht raus — aber es wird im Protokoll vermerkt, damit niemand
  // raetselt, wo das Foto geblieben ist.
  const medienHinweis =
    (plattform === 'mastodon' || plattform === 'bluesky') &&
    (klassen.bildUrls.length > 0 || klassen.videoDateiUrls.length > 0)
      ? 'Hinweis: Nur der Text wurde übertragen — Bilder und Videos kann dieser Kanal noch nicht.'
      : null;

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
  if (plattform === 'mastodon') {
    if (!mastodonBasis(zugang.ziel_id)) {
      return { plattform, ok: false, extern_id: null, fehler: 'Die Adresse der Mastodon-Instanz fehlt oder ist unbrauchbar.' };
    }
    const r = await sendeAnfrage(baueMastodonAnfrage(zugang.ziel_id, zugang.token, inhalt, beitragId));
    return { plattform, ok: r.ok, extern_id: r.id, fehler: r.ok ? medienHinweis : r.fehler };
  }
  if (plattform === 'bluesky') {
    if (!bskyHandle(zugang.ziel_id)) {
      return { plattform, ok: false, extern_id: null, fehler: 'Der Bluesky-Handle fehlt oder ist unbrauchbar.' };
    }
    const sitzung = await sendeAnfrageRoh(baueBlueskySession(zugang.ziel_id, zugang.token));
    const jwt = typeof sitzung.json?.accessJwt === 'string' ? (sitzung.json.accessJwt as string) : '';
    const did = typeof sitzung.json?.did === 'string' ? (sitzung.json.did as string) : '';
    if (!sitzung.ok || !jwt || !did) {
      return {
        plattform, ok: false, extern_id: null,
        fehler: sitzung.fehler || 'Anmeldung bei Bluesky fehlgeschlagen — bitte Handle und App-Passwort prüfen.',
      };
    }
    const r = await sendeAnfrageRoh(baueBlueskyPost(did, jwt, inhalt, new Date().toISOString()));
    // Bluesky antwortet mit {uri, cid} — es gibt kein Feld „id“.
    const uri = typeof r.json?.uri === 'string' ? (r.json.uri as string) : null;
    return { plattform, ok: r.ok, extern_id: uri, fehler: r.ok ? medienHinweis : r.fehler };
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
      ? await posteKanal(plattform, zugang, klassen, text, opts.beitrag.id)
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
