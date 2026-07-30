// ============================================================================
// ARGONAUT OS · lib/social.ts — reine Helfer fuer Social-Media (Marketing-Autopilot)
// (Social Paket 1 · Fundament — Beitrag-Editor + Kanal-Verwaltung + Transparenz)
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen
// (node-testbar). Das echte Verbinden (OAuth je Plattform) + das Posten kommen in
// den Folgepaketen (P2+), pro Plattform, sobald der Zugang beim Betrieb hinterlegt
// ist. ARGONAUT ist dabei sein eigener interner Aggregator (kein Fremd-Dienst).
// ============================================================================

export type SocialPlattformId =
  | 'google_business' | 'facebook' | 'instagram' | 'linkedin'
  | 'youtube' | 'telegram' | 'pinterest'
  | 'tiktok' | 'x' | 'threads' | 'bluesky' | 'mastodon';

/** Kern = direkt/sauber per API. Schwanz = per API mit Huerde/Kosten. */
export type SocialGruppe = 'kern' | 'schwanz';

/** Welche Medien eine Plattform mindestens braucht. */
export type SocialMedienArt = 'kein' | 'bild' | 'video' | 'bild_oder_video';

export type SocialPlattform = {
  id: SocialPlattformId;
  name: string;
  icon: string;
  gruppe: SocialGruppe;
  zeichenlimit: number;       // Obergrenze fuer Text/Bildunterschrift
  medienArt: SocialMedienArt; // was mindestens noetig ist
  medienPflicht: boolean;     // true -> ohne Bild/Video kein Beitrag moeglich
  apiKurz: string;            // Posting-Weg in einem Satz
  kostenKurz: string;         // eine Zeile fuer die Transparenz-Box
  freigabeKurz: string;       // welche Freigabe / Huerde
  link: string;               // offizielle Doku/Preise
};

/**
 * Kanal-Landkarte (Stand 07/2026). Kern zuerst (lokal/DE-Mittelstand am
 * wirksamsten), danach der lange Schwanz. Zeichenlimits sind bewusst
 * konservativ — sie schuetzen den Nutzer vor Abschneiden, nicht mehr.
 */
export const SOCIAL_PLATTFORMEN: SocialPlattform[] = [
  {
    id: 'google_business',
    name: 'Google Unternehmensprofil',
    icon: '🏢',
    gruppe: 'kern',
    zeichenlimit: 1500,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Beitrag direkt über die Google-Business-Profile-API.',
    kostenKurz: 'kostenlos (Google-Konto) · keine Gebühren',
    freigabeKurz: 'Bestätigtes Unternehmensprofil bei Google.',
    link: 'https://developers.google.com/my-business',
  },
  {
    id: 'facebook',
    name: 'Facebook-Seite',
    icon: '📘',
    gruppe: 'kern',
    zeichenlimit: 5000,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Seiten-Beitrag über die Meta-Graph-API.',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Facebook-Seite (keine Privat-Chronik) + Meta-App.',
    link: 'https://developers.facebook.com/docs/pages-api',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '📸',
    gruppe: 'kern',
    zeichenlimit: 2200,
    medienArt: 'bild_oder_video',
    medienPflicht: true,
    apiKurz: 'Beitrag über die Instagram-Graph-API (Business-Konto).',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Instagram-Business-Konto + verknüpfte Facebook-Seite.',
    link: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '💼',
    gruppe: 'kern',
    zeichenlimit: 3000,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Beitrag über die LinkedIn-API (Person oder Unternehmensseite).',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'LinkedIn-App mit Freigabe (Review) durch LinkedIn.',
    link: 'https://learn.microsoft.com/linkedin/marketing/',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: '▶️',
    gruppe: 'kern',
    zeichenlimit: 5000,
    medienArt: 'video',
    medienPflicht: true,
    apiKurz: 'Video-Upload über die YouTube-Data-API.',
    kostenKurz: 'kostenlos · tägliche Upload-Kontingente',
    freigabeKurz: 'Google-Konto mit eigenem YouTube-Kanal.',
    link: 'https://developers.google.com/youtube/v3',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: '✈️',
    gruppe: 'kern',
    zeichenlimit: 4096,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Kanal-Nachricht über die Telegram-Bot-API (einfachster Weg).',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Bot bei @BotFather anlegen, in den eigenen Kanal setzen.',
    link: 'https://core.telegram.org/bots/api',
  },
  {
    id: 'pinterest',
    name: 'Pinterest',
    icon: '📌',
    gruppe: 'kern',
    zeichenlimit: 500,
    medienArt: 'bild',
    medienPflicht: true,
    apiKurz: 'Pin über die Pinterest-API.',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Pinterest-Business-Konto + App-Freigabe.',
    link: 'https://developers.pinterest.com/docs/api/v5/',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '🎵',
    gruppe: 'schwanz',
    zeichenlimit: 2200,
    medienArt: 'video',
    medienPflicht: true,
    apiKurz: 'Video über die TikTok-Content-Posting-API.',
    kostenKurz: 'kostenlos · App-Audit durch TikTok nötig',
    freigabeKurz: 'App-Review/Audit durch TikTok vor dem ersten Posten.',
    link: 'https://developers.tiktok.com/doc/content-posting-api-get-started/',
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    icon: '𝕏',
    gruppe: 'schwanz',
    zeichenlimit: 280,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Post über die X-API v2.',
    kostenKurz: 'kostenpflichtig · bezahlter API-Zugang (Stand 07/2026)',
    freigabeKurz: 'X-Developer-Konto mit bezahltem Zugang.',
    link: 'https://developer.x.com/en/products/x-api',
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: '🧵',
    gruppe: 'schwanz',
    zeichenlimit: 500,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Beitrag über die Threads-API (Meta).',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Meta-Konto mit Threads-Profil + Meta-App.',
    link: 'https://developers.facebook.com/docs/threads',
  },
  {
    id: 'bluesky',
    name: 'Bluesky',
    icon: '🦋',
    gruppe: 'schwanz',
    zeichenlimit: 300,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Post über das AT-Protokoll (Bluesky).',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Bluesky-Konto + App-Passwort.',
    link: 'https://docs.bsky.app/',
  },
  {
    id: 'mastodon',
    name: 'Mastodon',
    icon: '🐘',
    gruppe: 'schwanz',
    zeichenlimit: 500,
    medienArt: 'kein',
    medienPflicht: false,
    apiKurz: 'Beitrag (Toot) über die Mastodon-API der eigenen Instanz.',
    kostenKurz: 'kostenlos · keine Gebühren',
    freigabeKurz: 'Konto auf einer Mastodon-Instanz + Zugangs-Token.',
    link: 'https://docs.joinmastodon.org/api/',
  },
];

/** Reihenfolge/Labels der Beitrag-Status. */
export const SOCIAL_STATUS: { id: string; label: string }[] = [
  { id: 'entwurf', label: 'Entwurf' },
  { id: 'geplant', label: 'Geplant' },
  { id: 'gesendet', label: 'Gesendet' },
];

/** Gueltige Plattform-Ids (fuer Server-Validierung). */
export const SOCIAL_PLATTFORM_IDS: string[] = SOCIAL_PLATTFORMEN.map((p) => p.id);

/** Plattform-Objekt per Id (oder null). */
export function plattformFuer(id: string | null | undefined): SocialPlattform | null {
  return SOCIAL_PLATTFORMEN.find((p) => p.id === id) ?? null;
}

/** Alle Plattformen einer Gruppe (kern/schwanz), in Katalog-Reihenfolge. */
export function plattformenNachGruppe(gruppe: SocialGruppe): SocialPlattform[] {
  return SOCIAL_PLATTFORMEN.filter((p) => p.gruppe === gruppe);
}

/** Nur bekannte Plattform-Ids aus einer Roh-Liste (dedupe, Katalog-Reihenfolge). */
export function bereinigeKanaele(roh: unknown): SocialPlattformId[] {
  const set = new Set<string>();
  if (Array.isArray(roh)) for (const r of roh) if (typeof r === 'string') set.add(r);
  return SOCIAL_PLATTFORMEN.filter((p) => set.has(p.id)).map((p) => p.id);
}

/**
 * Zeichen zaehlen — emoji-/umlaut-sicher (zaehlt Unicode-Zeichen, nicht Bytes).
 */
export function zaehleZeichen(text: string | null | undefined): number {
  return Array.from(text || '').length;
}

/**
 * Kleinstes Zeichenlimit ueber die gewaehlten Kanaele (das bindende Limit).
 * Ohne gewaehlten Kanal -> null (kein Limit anzuwenden).
 */
export function bindendesLimit(kanaele: string[] | null | undefined): number | null {
  const ids = bereinigeKanaele(kanaele);
  if (ids.length === 0) return null;
  let min = Infinity;
  for (const id of ids) {
    const p = plattformFuer(id);
    if (p && p.zeichenlimit < min) min = p.zeichenlimit;
  }
  return Number.isFinite(min) ? min : null;
}

/**
 * Probleme eines Beitrags fuer EINEN Kanal (Text zu lang / Medium fehlt).
 * medienAnzahl = Anzahl angehaengter Bilder/Videos (Art wird in P1 nicht
 * unterschieden — der Editor bietet Bild-Upload + Video-Link an).
 */
export function beitragProblemeFuerKanal(
  plattformId: string,
  text: string | null | undefined,
  medienAnzahl: number,
): string[] {
  const p = plattformFuer(plattformId);
  const fehler: string[] = [];
  if (!p) return fehler;
  const laenge = zaehleZeichen(text);
  if (laenge > p.zeichenlimit) {
    fehler.push(`${p.name}: Text zu lang (${laenge}/${p.zeichenlimit} Zeichen).`);
  }
  if (p.medienPflicht && medienAnzahl <= 0) {
    const was = p.medienArt === 'video' ? 'ein Video' : p.medienArt === 'bild' ? 'ein Bild' : 'ein Bild oder Video';
    fehler.push(`${p.name}: braucht ${was}.`);
  }
  return fehler;
}

export type BeitragEingabe = {
  text?: string | null;
  medienAnzahl?: number;         // Anzahl angehaengter Medien
  kanaele?: string[] | null;     // gewaehlte Plattform-Ids
};

/**
 * Gesamt-Pruefung eines Beitrags vor dem Speichern.
 * Regeln: mind. ein Kanal, Inhalt vorhanden (Text ODER Medium), und je Kanal
 * die Laengen-/Medien-Regeln. Gibt { ok, fehler[] } mit klaren dt. Meldungen.
 */
export function validiereBeitrag(v: BeitragEingabe): { ok: boolean; fehler: string[] } {
  const fehler: string[] = [];
  const text = (v?.text || '').trim();
  const medien = Math.max(0, Math.floor(Number(v?.medienAnzahl) || 0));
  const kanaele = bereinigeKanaele(v?.kanaele);

  if (kanaele.length === 0) fehler.push('Bitte mindestens einen Kanal auswählen.');
  if (!text && medien <= 0) fehler.push('Bitte einen Text schreiben oder ein Bild/Video anhängen.');

  for (const id of kanaele) fehler.push(...beitragProblemeFuerKanal(id, text, medien));

  return { ok: fehler.length === 0, fehler };
}

/**
 * Pruefung fuers Einplanen: geplant_am muss vorhanden und in der Zukunft sein.
 * jetztIso wird uebergeben (node-testbar, keine Date.now()-Abhaengigkeit).
 */
export function validierePlanung(
  status: string | null | undefined,
  geplantAm: string | null | undefined,
  jetztIso: string,
): { ok: boolean; fehler: string | null } {
  if (status !== 'geplant') return { ok: true, fehler: null };
  if (!geplantAm) return { ok: false, fehler: 'Bitte einen Zeitpunkt zum Einplanen wählen.' };
  const t = new Date(geplantAm).getTime();
  if (Number.isNaN(t)) return { ok: false, fehler: 'Der gewählte Zeitpunkt ist ungültig.' };
  if (t <= new Date(jetztIso).getTime()) return { ok: false, fehler: 'Der Zeitpunkt muss in der Zukunft liegen.' };
  return { ok: true, fehler: null };
}

/** Beitraege zaehlen nach Status. */
export function zaehleBeitraege(liste: { status?: string | null }[]): {
  gesamt: number; entwurf: number; geplant: number; gesendet: number;
} {
  const l = liste || [];
  let entwurf = 0, geplant = 0, gesendet = 0;
  for (const x of l) {
    if (x?.status === 'geplant') geplant++;
    else if (x?.status === 'gesendet') gesendet++;
    else entwurf++;
  }
  return { gesamt: l.length, entwurf, geplant, gesendet };
}

/** Aktive (vorgemerkte) Kanaele zaehlen. */
export function zaehleKanaele(liste: { aktiv?: boolean | null }[]): { gesamt: number; aktiv: number } {
  const l = liste || [];
  let aktiv = 0;
  for (const x of l) if (x?.aktiv) aktiv++;
  return { gesamt: l.length, aktiv };
}
