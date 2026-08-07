// ============================================================================
// ARGONAUT OS · lib/seoExtern.ts — On-Page-SEO-Check für eine EXTERNE Website
// (Marketing-Ausbau · Punkt 6b — bestehende Kundenseite prüfen)
//
// Ergänzt lib/seoCheck.ts (ARGONAUT-eigene Seiten) um den Fall „Kunde hat schon
// eine echte Website". Die Route holt das Live-HTML serverseitig; HIER wird es
// nur zerlegt und bewertet — reine, node-testbare Funktionen, KEIN Netzwerk,
// KEINE Supabase-/React-Abhängigkeit.
//
// Bewertet dieselbe Idee wie der interne Check (Titel, Meta, H1, Text, Bilder …),
// plus Web-spezifische Signale (HTTPS, mobil/Viewport, Sprache, Canonical).
// ============================================================================

export type CheckStatus = 'gut' | 'warnung' | 'fehlt';
export type SeoCheck = {
  schluessel: string;
  titel: string;
  status: CheckStatus;
  gewicht: number;
  befund: string;
  tipp: string;
};

const FAKTOR: Record<CheckStatus, number> = { gut: 1, warnung: 0.5, fehlt: 0 };

/** URL normalisieren: Protokoll ergänzen (https), grob validieren. null = ungültig. */
export function normalisiereUrl(roh: unknown): string | null {
  let s = (typeof roh === 'string' ? roh : '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  // grobe Plausibilität: Host mit Punkt
  if (!/^https?:\/\/[^\s./]+\.[^\s.]{2,}/i.test(s)) return null;
  // gefährliche Zeichen raus
  if (/[\s<>"']/.test(s)) return null;
  return s.slice(0, 300);
}

/** Ein Attribut aus einem Tag lesen (name="..." | '...' | wert). */
function attr(tag: string, name: string): string {
  const re = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = tag.match(re);
  if (!m) return '';
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

/** Alle Tags eines Typs (z. B. meta, img, h1) als Roh-Strings. */
function alleTags(html: string, tag: string): string[] {
  const re = new RegExp('<' + tag + '\\b[^>]*>', 'gi');
  return html.match(re) || [];
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ParsedSeite = {
  title: string;
  metaDescription: string;
  h1s: string[];
  woerter: number;
  bilder: { src: string; alt: string }[];
  hatViewport: boolean;
  lang: string;
  hatCanonical: boolean;
};

/** Zerlegt rohes HTML in die SEO-relevanten Bestandteile (defensiv). */
export function extrahiereSeite(html: string | null | undefined): ParsedSeite {
  const h = typeof html === 'string' ? html : '';

  const titleM = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleM ? stripTags(titleM[1]) : '';

  let metaDescription = '';
  let hatViewport = false;
  let hatCanonical = false;
  for (const t of alleTags(h, 'meta')) {
    const name = attr(t, 'name').toLowerCase() || attr(t, 'property').toLowerCase();
    if (name === 'description' && !metaDescription) metaDescription = stripTags(attr(t, 'content'));
    if (name === 'viewport') hatViewport = true;
  }
  for (const t of alleTags(h, 'link')) {
    if (attr(t, 'rel').toLowerCase() === 'canonical') hatCanonical = true;
  }

  const h1s: string[] = [];
  const h1Re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let m: RegExpExecArray | null;
  while ((m = h1Re.exec(h)) !== null) {
    const t = stripTags(m[1]);
    if (t) h1s.push(t);
  }

  const bilder: { src: string; alt: string }[] = [];
  for (const t of alleTags(h, 'img')) {
    const src = attr(t, 'src');
    if (!src) continue;
    bilder.push({ src, alt: attr(t, 'alt') });
  }

  const htmlTag = h.match(/<html\b[^>]*>/i);
  const lang = htmlTag ? attr(htmlTag[0], 'lang') : '';

  const text = stripTags(h);
  const woerter = text ? text.split(' ').filter(Boolean).length : 0;

  return { title, metaDescription, h1s, woerter, bilder, hatViewport, lang, hatCanonical };
}

/** Bewertet eine zerlegte externe Seite gegen die On-Page-Faktoren. */
export function pruefeExtern(p: ParsedSeite, url: string) {
  const checks: SeoCheck[] = [];
  const zeichen = (s: string) => Array.from(s || '').length;

  // 1) Titel
  const tl = zeichen(p.title);
  checks.push({
    schluessel: 'titel', titel: 'Seitentitel (Title-Tag)', gewicht: 3,
    status: !p.title ? 'fehlt' : (tl >= 30 && tl <= 60 ? 'gut' : 'warnung'),
    befund: !p.title ? 'Kein <title> gefunden.' : `Titel ist ${tl} Zeichen lang: „${p.title.slice(0, 70)}".`,
    tipp: 'Idealer Titel: 30–60 Zeichen, mit Leistung + Ort (z. B. „Malerbetrieb Schmitt – Maler in Köln").',
  });

  // 2) Meta-Beschreibung
  const ml = zeichen(p.metaDescription);
  checks.push({
    schluessel: 'meta', titel: 'Meta-Beschreibung', gewicht: 3,
    status: !p.metaDescription ? 'fehlt' : (ml >= 70 && ml <= 160 ? 'gut' : 'warnung'),
    befund: !p.metaDescription ? 'Kein <meta name="description"> gefunden.' : `Beschreibung ist ${ml} Zeichen lang.`,
    tipp: 'Setz eine Meta-Beschreibung mit 70–160 Zeichen — das ist der Vorschautext in den Google-Ergebnissen.',
  });

  // 3) H1
  checks.push({
    schluessel: 'h1', titel: 'Hauptüberschrift (H1)', gewicht: 2,
    status: p.h1s.length === 0 ? 'fehlt' : (p.h1s.length === 1 ? 'gut' : 'warnung'),
    befund: p.h1s.length === 0 ? 'Keine H1-Überschrift.' : p.h1s.length === 1 ? `Genau eine H1: „${p.h1s[0].slice(0, 60)}".` : `${p.h1s.length} H1-Überschriften (idealerweise nur eine).`,
    tipp: 'Genau eine H1 je Seite, die das Hauptthema/Angebot klar benennt.',
  });

  // 4) Textmenge
  checks.push({
    schluessel: 'text', titel: 'Textmenge', gewicht: 2,
    status: p.woerter >= 250 ? 'gut' : (p.woerter >= 80 ? 'warnung' : 'fehlt'),
    befund: `Rund ${p.woerter} Wörter Text.`,
    tipp: 'Mind. ~250 Wörter echten, hilfreichen Inhalt — Google bewertet Substanz.',
  });

  // 5) Bilder + Alt-Texte
  const anzBilder = p.bilder.length;
  const mitAlt = p.bilder.filter((b) => (b.alt || '').trim()).length;
  let bildStatus: CheckStatus;
  let bildBefund: string;
  if (anzBilder === 0) { bildStatus = 'warnung'; bildBefund = 'Keine Bilder gefunden.'; }
  else if (mitAlt === anzBilder) { bildStatus = 'gut'; bildBefund = `${anzBilder} Bild(er), alle mit Alt-Text.`; }
  else if (mitAlt === 0) { bildStatus = 'fehlt'; bildBefund = `${anzBilder} Bild(er), aber keines mit Alt-Text.`; }
  else { bildStatus = 'warnung'; bildBefund = `${mitAlt} von ${anzBilder} Bildern haben einen Alt-Text.`; }
  checks.push({
    schluessel: 'bilder', titel: 'Bilder & Alt-Texte', gewicht: 1,
    status: bildStatus, befund: bildBefund,
    tipp: 'Jedes Bild braucht einen Alt-Text (beschreibt das Bild) — gut für Google-Bildersuche und Barrierefreiheit.',
  });

  // 6) HTTPS
  const https = /^https:\/\//i.test(url);
  checks.push({
    schluessel: 'https', titel: 'Sichere Verbindung (HTTPS)', gewicht: 1,
    status: https ? 'gut' : 'fehlt',
    befund: https ? 'Seite läuft über HTTPS.' : 'Seite läuft nur über HTTP.',
    tipp: 'HTTPS ist Pflicht für Vertrauen und Ranking — ein SSL-Zertifikat gibt es meist kostenlos beim Hoster.',
  });

  // 7) Mobil / Viewport
  checks.push({
    schluessel: 'mobil', titel: 'Mobil-Tauglichkeit', gewicht: 1,
    status: p.hatViewport ? 'gut' : 'fehlt',
    befund: p.hatViewport ? 'Viewport für Mobilgeräte gesetzt.' : 'Kein Viewport-Tag — Seite evtl. nicht mobil-optimiert.',
    tipp: 'Die meisten Kunden googeln am Handy. Ohne mobile Optimierung sinkt das Ranking deutlich.',
  });

  // 8) Sprache
  checks.push({
    schluessel: 'sprache', titel: 'Sprach-Auszeichnung', gewicht: 1,
    status: p.lang ? 'gut' : 'warnung',
    befund: p.lang ? `Sprache gesetzt: „${p.lang}".` : 'Keine Sprach-Angabe (<html lang>).',
    tipp: 'Setz die Sprache im <html lang="de"> — hilft Google und Vorlese-Programmen.',
  });

  // 9) Canonical
  checks.push({
    schluessel: 'canonical', titel: 'Canonical-Link', gewicht: 1,
    status: p.hatCanonical ? 'gut' : 'warnung',
    befund: p.hatCanonical ? 'Canonical-Link vorhanden.' : 'Kein Canonical-Link.',
    tipp: 'Ein Canonical-Tag verhindert Duplicate-Content-Probleme (dieselbe Seite unter mehreren Adressen).',
  });

  let summe = 0, max = 0;
  for (const ch of checks) { summe += ch.gewicht * FAKTOR[ch.status]; max += ch.gewicht; }
  const score = max > 0 ? Math.round((summe / max) * 100) : 0;
  const note: 'gut' | 'mittel' | 'schwach' = score >= 80 ? 'gut' : score >= 50 ? 'mittel' : 'schwach';
  const offen = checks.filter((ch) => ch.status !== 'gut').length;

  return { score, note, offen, checks, title: p.title || 'Ohne Titel' };
}
