// ============================================================================
// ARGONAUT OS · lib/videoSkript.ts — reine Logik fuers Video-Skript-Studio
// (Marketing-Tiefe · Abschnitt 14 — "Kanaele + Video")
//
// Ziel: EIN Thema/Anlass -> fertige, drehreife KURZVIDEO-Skripte je Kanal
// (Instagram Reel, TikTok, YouTube Shorts, Facebook Reel, LinkedIn Video):
// Hook, Szenen/Shotlist (Zeit · Bild/Einstellung · Text), On-Screen-Text,
// Untertitel-Block, Call-to-Action und Hashtags — passend zu Format & Dauer.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks, KEINE Imports — nur
// pure, node-testbare Funktionen. Der KI-Aufruf (kiFetch/haiku) passiert in der
// Route, die Oberflaeche auf der Seite. Hier liegen nur:
//   · der Video-Kanal-Katalog (Format, Dauer, Ton je Kanal),
//   · die Prompt-Bausteine (System + Nutzer),
//   · das robuste Parsen der KI-Antwort in saubere Skripte.
//
// Bewusst OHNE Video-Erzeugung/Avatar/Stimme — das ist Abschnitt 7. Hier
// entsteht nur der drehreife TEXT: null neue Abhaengigkeiten, ~0 Kosten (Haiku).
// ============================================================================

export type VideoKanal = {
  id: string;
  name: string;
  icon: string;
  /** Plattform-Klartext fuer Anzeige/Prompt. */
  plattform: string;
  /** Empfohlenes Seitenverhaeltnis. */
  format: string;
  /** Empfohlene Dauer in Sekunden (Startwert). */
  standardSekunden: number;
  /** Hartes Dauer-Limit der Plattform in Sekunden. */
  maxSekunden: number;
  /** Ton-/Stil-Anweisung an die KI (ein Satz). */
  tonHinweis: string;
};

/**
 * Video-Kanal-Katalog (Stand 08/2026). Reihenfolge = Anzeige-Reihenfolge.
 * Dauer-Limits konservativ: Reels/Shorts sind kurz-optimiert, TikTok/LinkedIn
 * lassen mehr Laenge zu. Alle Hochformat 9:16 ausser LinkedIn (quadratisch).
 */
export const VIDEO_KANAELE: VideoKanal[] = [
  {
    id: 'instagram-reel', name: 'Instagram Reel', icon: '📸',
    plattform: 'Instagram Reels', format: '9:16 (Hochformat)',
    standardSekunden: 30, maxSekunden: 90,
    tonHinweis: 'locker, nahbar, schneller Schnitt; starker Hook in den ersten 3 Sekunden; 3–6 relevante Hashtags',
  },
  {
    id: 'tiktok', name: 'TikTok', icon: '🎵',
    plattform: 'TikTok', format: '9:16 (Hochformat)',
    standardSekunden: 30, maxSekunden: 180,
    tonHinweis: 'sehr direkt, trend- und dialognah, gesprochene Sprache; Muster-/Aha-Moment; 3–5 Hashtags',
  },
  {
    id: 'youtube-shorts', name: 'YouTube Shorts', icon: '▶️',
    plattform: 'YouTube Shorts', format: '9:16 (Hochformat)',
    standardSekunden: 40, maxSekunden: 60,
    tonHinweis: 'klarer roter Faden, ein Nutzen-Versprechen im Titel/Hook, sachlich-freundlich; wenige Hashtags',
  },
  {
    id: 'facebook-reel', name: 'Facebook Reel', icon: '📘',
    plattform: 'Facebook Reels', format: '9:16 (Hochformat)',
    standardSekunden: 30, maxSekunden: 90,
    tonHinweis: 'freundlich und konkret, lokal/regional gedacht, mit klarer Handlungsaufforderung; sparsame Hashtags',
  },
  {
    id: 'linkedin-video', name: 'LinkedIn Video', icon: '💼',
    plattform: 'LinkedIn', format: '1:1 (quadratisch) oder 16:9',
    standardSekunden: 45, maxSekunden: 180,
    tonHinweis: 'professionell und sachlich, Fachkompetenz/Mehrwert betonen, kaum Emojis, hoechstens 3 Hashtags',
  },
];

/** Gueltige Video-Kanal-Ids (fuer Server-Validierung). */
export const VIDEO_KANAL_IDS: string[] = VIDEO_KANAELE.map((k) => k.id);

/** Kanal-Objekt per Id (oder null). */
export function videoKanalFuer(id: string | null | undefined): VideoKanal | null {
  return VIDEO_KANAELE.find((k) => k.id === id) ?? null;
}

/** Nur bekannte Kanal-Ids aus einer Roh-Liste (dedupe, Katalog-Reihenfolge). */
export function bereinigeVideoKanaele(roh: unknown): string[] {
  const set = new Set<string>();
  if (Array.isArray(roh)) for (const r of roh) if (typeof r === 'string') set.add(r);
  return VIDEO_KANAELE.filter((k) => set.has(k.id)).map((k) => k.id);
}

/** Zeichen zaehlen — emoji-/umlaut-sicher (Unicode-Zeichen, nicht Bytes). */
export function zaehleZeichen(text: string | null | undefined): number {
  return Array.from(text || '').length;
}

/** Thema saeubern + auf sinnvolle Laenge begrenzen. */
export function saeubereThema(roh: unknown): string {
  return (typeof roh === 'string' ? roh : '').trim().slice(0, 600);
}

/**
 * Gewuenschte Video-Dauer auf einen sinnvollen Wert begrenzen.
 * Untergrenze 10 s, Obergrenze das Kanal-Maximum (oder 180 s ohne Kanal).
 * Ungueltige Eingabe -> Fallback (Kanal-Standard oder 30 s).
 */
export function saeubereDauer(roh: unknown, kanal?: VideoKanal | null): number {
  const max = kanal ? kanal.maxSekunden : 180;
  const standard = kanal ? kanal.standardSekunden : 30;
  const n = typeof roh === 'number' ? roh : Number(roh);
  if (!Number.isFinite(n) || n <= 0) return standard;
  return Math.max(10, Math.min(Math.round(n), max));
}

/** Optionale Firmen-/CI-Angaben, die die KI beim Texten beruecksichtigt. */
export type CIAngaben = {
  firma?: string | null;
  branche?: string | null;
  ton?: string | null;
};

/**
 * System-Prompt: erfahrener Kurzvideo-/Reel-Autor. Reines JSON, kein Markdown,
 * keine erfundenen Fakten. Wirkt fuer Kunde UND Betreiber gleich.
 */
export function baueVideoSystemPrompt(): string {
  return [
    'Du bist ein erfahrener Kurzvideo-Autor (Reels, TikTok, Shorts) für einen deutschen Mittelstandsbetrieb.',
    'Aus EINEM Thema/Anlass erstellst du je Kanal ein drehreifes, veröffentlichungsfertiges Kurzvideo-Skript — genau im geforderten Ton, Format und in der geforderten Dauer.',
    'Ein Skript besteht aus: einem starken Hook (erste ~3 Sekunden), einer Szenenliste (Shotlist) mit Zeitfenster, Bild/Einstellung und gesprochenem/eingeblendetem Text, kurzen On-Screen-Text-Einblendungen, einem zusammenhängenden Untertitel-Text, einem klaren Call-to-Action und passenden Hashtags.',
    'Die Szenen-Zeitfenster müssen sich zur geforderten Gesamtdauer summieren.',
    'ERFINDE KEINE Fakten: keine Preise, Rabatte, Zahlen, Termine, Öffnungszeiten, Auszeichnungen oder Zitate, die nicht im Thema stehen. Bleib beim Thema, konkret und glaubwürdig.',
    'Bild/Einstellung beschreibt, was zu sehen ist (2–8 Wörter, umsetzbar mit Smartphone), NICHT wie man filmt im Detail.',
    'Schreibe fehlerfreies Deutsch.',
    'Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt — ohne Einleitung, ohne Erklärung, ohne Markdown, ohne Code-Zäune.',
  ].join(' ');
}

/**
 * Nutzer-Prompt: Thema + CI + Zieldauer + die exakt angeforderten Kanaele mit
 * Format/Dauer-Regeln und den geforderten JSON-Feldern.
 */
export function baueVideoNutzerPrompt(
  thema: string,
  kanaele: string[],
  dauer: number,
  ci?: CIAngaben,
): string {
  const ids = bereinigeVideoKanaele(kanaele);
  const ciZeilen: string[] = [];
  const firma = (ci?.firma || '').trim();
  const branche = (ci?.branche || '').trim();
  const ton = (ci?.ton || '').trim();
  if (firma) ciZeilen.push(`Betrieb/Firma: ${firma}`);
  if (branche) ciZeilen.push(`Branche: ${branche}`);
  if (ton) ciZeilen.push(`Gewünschter Grundton: ${ton}`);

  const kanalZeilen = ids.map((id) => {
    const k = videoKanalFuer(id)!;
    const sek = saeubereDauer(dauer, k);
    return `- Schlüssel "${k.id}" (${k.name}, ${k.plattform}, Format ${k.format}, Dauer ~${sek} Sekunden): ${k.tonHinweis}.`;
  }).join('\n');

  return [
    `THEMA/ANLASS:\n${(thema || '').trim()}`,
    ciZeilen.length ? `\nCORPORATE IDENTITY:\n${ciZeilen.join('\n')}` : '',
    `\nGEWÜNSCHTE VIDEO-DAUER (Richtwert): ~${saeubereDauer(dauer)} Sekunden. Je Kanal gilt zusätzlich das oben genannte Kanal-Limit.`,
    `\nERZEUGE JE KANAL EIN KURZVIDEO-SKRIPT:\n${kanalZeilen}`,
    [
      '\nGib genau ein JSON-Objekt zurück, dessen Schlüssel exakt diese Kanal-Schlüssel sind: ' + ids.map((i) => `"${i}"`).join(', ') + '.',
      'Jeder Wert ist ein Objekt mit den Feldern:',
      '"hook" (String, der Aufhänger der ersten ~3 Sekunden),',
      '"szenen" (Array von Objekten je Szene mit "zeit" z. B. "0–3s", "bild" = Einstellung/Motiv, "text" = gesprochener/eingeblendeter Text),',
      '"onScreenText" (Array kurzer Text-Einblendungen),',
      '"untertitel" (String, zusammenhängender Untertitel-/Sprechertext),',
      '"cta" (String, Handlungsaufforderung am Ende),',
      '"hashtags" (Array von Hashtags ohne Leerzeichen).',
      'Beispielform: {"instagram-reel":{"hook":"…","szenen":[{"zeit":"0–3s","bild":"…","text":"…"}],"onScreenText":["…"],"untertitel":"…","cta":"…","hashtags":["#…"]}}.',
    ].join(' '),
  ].filter(Boolean).join('\n');
}

/** Eine geparste Szene der Shotlist. */
export type VideoSzene = {
  zeit: string;
  bild: string;
  text: string;
};

/** Ein fertiges, geprueftes Video-Skript fuer die Oberflaeche. */
export type VideoSkript = {
  kanal: string;
  name: string;
  icon: string;
  plattform: string;
  format: string;
  dauerSekunden: number;
  hook: string;
  szenen: VideoSzene[];
  onScreenText: string[];
  untertitel: string;
  cta: string;
  hashtags: string[];
};

/**
 * Holt das JSON-Objekt aus der KI-Rohantwort — auch wenn Code-Zaeune oder ein
 * Vor-/Nachsatz drumherum stehen. Gibt null zurueck, wenn nichts Brauchbares da.
 */
export function extrahiereJson(roh: string | null | undefined): Record<string, unknown> | null {
  if (!roh) return null;
  let s = String(roh).trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b < 0 || b <= a) return null;
  try {
    const obj = JSON.parse(s.slice(a, b + 1));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Einen Feldwert defensiv zu getrimmtem String machen. */
function alsText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/** Eine unbekannte Struktur defensiv zu einer String-Liste machen (leere weg). */
function alsListe(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(alsText).filter((s) => s.length > 0);
  const s = alsText(v);
  return s ? [s] : [];
}

/** Hashtags normalisieren: fuehrendes # sicherstellen, Leerzeichen entfernen. */
function alsHashtags(v: unknown): string[] {
  return alsListe(v).map((h) => {
    const ohne = h.replace(/\s+/g, '');
    if (!ohne) return '';
    return ohne.startsWith('#') ? ohne : '#' + ohne.replace(/^#+/, '');
  }).filter((h) => h.length > 1);
}

/** Eine Szene defensiv parsen (String -> nur Text; Objekt -> zeit/bild/text). */
function parseSzene(roh: unknown): VideoSzene | null {
  if (typeof roh === 'string') {
    const t = roh.trim();
    return t ? { zeit: '', bild: '', text: t } : null;
  }
  if (roh && typeof roh === 'object') {
    const r = roh as Record<string, unknown>;
    const zeit = alsText(r.zeit ?? r.time ?? r.zeitfenster);
    const bild = alsText(r.bild ?? r.einstellung ?? r.motiv ?? r.visual);
    const text = alsText(r.text ?? r.sprecher ?? r.inhalt ?? r.voiceover);
    if (!zeit && !bild && !text) return null;
    return { zeit, bild, text };
  }
  return null;
}

/**
 * Baut aus der KI-Rohantwort saubere Skripte — nur fuer die angeforderten
 * Kanaele, in Katalog-Reihenfolge. Ein Skript wird ausgelassen, wenn weder Hook
 * noch Untertitel noch Szenen brauchbaren Inhalt haben (kein leeres Skript).
 */
export function parseVideoSkripte(
  rohText: string | null | undefined,
  kanaele: string[],
  dauer: number,
): VideoSkript[] {
  const ids = bereinigeVideoKanaele(kanaele);
  const obj = extrahiereJson(rohText);
  if (!obj) return [];

  const out: VideoSkript[] = [];
  for (const id of ids) {
    const k = videoKanalFuer(id)!;
    const roh = obj[id];
    if (roh == null || typeof roh !== 'object' || Array.isArray(roh)) continue;
    const r = roh as Record<string, unknown>;

    const hook = alsText(r.hook ?? r.aufhaenger);
    const untertitel = alsText(r.untertitel ?? r.captions ?? r.sprechertext ?? r.text);
    const cta = alsText(r.cta ?? r.handlungsaufforderung ?? r.aufruf);
    const szenen = (Array.isArray(r.szenen) ? r.szenen : Array.isArray(r.shotlist) ? r.shotlist : [])
      .map(parseSzene)
      .filter((s): s is VideoSzene => s !== null);
    const onScreenText = alsListe(r.onScreenText ?? r.einblendungen ?? r.overlay);
    const hashtags = alsHashtags(r.hashtags ?? r.tags);

    if (!hook && !untertitel && szenen.length === 0) continue;

    out.push({
      kanal: k.id,
      name: k.name,
      icon: k.icon,
      plattform: k.plattform,
      format: k.format,
      dauerSekunden: saeubereDauer(dauer, k),
      hook,
      szenen,
      onScreenText,
      untertitel,
      cta,
      hashtags,
    });
  }
  return out;
}
