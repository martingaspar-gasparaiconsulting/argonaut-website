// ============================================================================
// ARGONAUT OS · lib/contentFliessband.ts — reine Logik fuers KI-Content-Fliessband
// (Marketing-Ausbau · Punkt 3)
//
// Ziel: EIN Thema/Anlass -> fertige Beitraege je Kanal (Instagram, Facebook,
// LinkedIn, Newsletter, WhatsApp) im passenden Ton + ein Bildvorschlag.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — nur pure, node-testbare
// Funktionen. Der KI-Aufruf (kiFetch/haiku) und das Speichern (social_beitrag /
// Kalender) passieren in der Route bzw. auf der Seite; hier liegen nur:
//   · der Kanal-Katalog (Ton, Laenge, Ziel je Kanal),
//   · die Prompt-Bausteine (System + Nutzer),
//   · das robuste Parsen der KI-Antwort in saubere Vorschlaege.
// ============================================================================

/** Wohin ein fertiger Vorschlag uebernommen wird. */
export type FliessbandZiel = 'social' | 'newsletter' | 'whatsapp';

export type FliessbandKanal = {
  id: string;
  name: string;
  icon: string;
  ziel: FliessbandZiel;
  /** social_beitrag-Kanal-Id (nur bei ziel 'social'), sonst null. */
  plattformId: string | null;
  /** Hartes Zeichenlimit (Abschneide-Gefahr auf der Plattform). */
  zeichenLimit: number;
  /** Empfohlene Laenge — Richtwert fuer die KI. */
  richtwert: number;
  /** Ton-/Stil-Anweisung an die KI (ein Satz). */
  tonHinweis: string;
  /** Newsletter: eigener Betreff noetig. */
  mitBetreff: boolean;
  /** Bildvorschlag sinnvoll. */
  mitBild: boolean;
  /** Ohne Bild kein Beitrag moeglich (Instagram). */
  bildPflicht: boolean;
};

/**
 * Kanal-Katalog des Fliessbands (Stand 08/2026). Reihenfolge = Anzeige-Reihenfolge.
 * Zeichenlimits konservativ aus lib/social.ts uebernommen (Instagram 2200,
 * Facebook 5000, LinkedIn 3000); Newsletter/WhatsApp grosszuegig gedeckelt.
 */
export const FLIESSBAND_KANAELE: FliessbandKanal[] = [
  {
    id: 'instagram', name: 'Instagram', icon: '📸', ziel: 'social', plattformId: 'instagram',
    zeichenLimit: 2200, richtwert: 600,
    tonHinweis: 'locker und nahbar, 1–2 passende Emojis, am Ende 3–6 relevante Hashtags',
    mitBetreff: false, mitBild: true, bildPflicht: true,
  },
  {
    id: 'facebook', name: 'Facebook', icon: '📘', ziel: 'social', plattformId: 'facebook',
    zeichenLimit: 5000, richtwert: 700,
    tonHinweis: 'freundlich und konkret, mit einer kleinen Handlungsaufforderung, sparsame Emojis',
    mitBetreff: false, mitBild: true, bildPflicht: false,
  },
  {
    id: 'linkedin', name: 'LinkedIn', icon: '💼', ziel: 'social', plattformId: 'linkedin',
    zeichenLimit: 3000, richtwert: 900,
    tonHinweis: 'professionell und sachlich, Fachkompetenz/Mehrwert betonen, wenige oder keine Emojis, höchstens 3 Hashtags',
    mitBetreff: false, mitBild: true, bildPflicht: false,
  },
  {
    id: 'newsletter', name: 'Newsletter', icon: '✉️', ziel: 'newsletter', plattformId: null,
    zeichenLimit: 6000, richtwert: 1200,
    tonHinweis: 'persönliche Sie-Ansprache, klar strukturiert, mit Betreffzeile und freundlichem Schlussgruß',
    mitBetreff: true, mitBild: true, bildPflicht: false,
  },
  {
    id: 'whatsapp', name: 'WhatsApp', icon: '💬', ziel: 'whatsapp', plattformId: null,
    zeichenLimit: 1000, richtwert: 350,
    tonHinweis: 'kurz, direkt und persönlich, höchstens 1 Emoji, klarer nächster Schritt',
    mitBetreff: false, mitBild: false, bildPflicht: false,
  },
];

/** Gueltige Fliessband-Kanal-Ids (fuer Server-Validierung). */
export const FLIESSBAND_KANAL_IDS: string[] = FLIESSBAND_KANAELE.map((k) => k.id);

/** Kanal-Objekt per Id (oder null). */
export function kanalFuer(id: string | null | undefined): FliessbandKanal | null {
  return FLIESSBAND_KANAELE.find((k) => k.id === id) ?? null;
}

/** Nur bekannte Kanal-Ids aus einer Roh-Liste (dedupe, Katalog-Reihenfolge). */
export function bereinigeKanaele(roh: unknown): string[] {
  const set = new Set<string>();
  if (Array.isArray(roh)) for (const r of roh) if (typeof r === 'string') set.add(r);
  return FLIESSBAND_KANAELE.filter((k) => set.has(k.id)).map((k) => k.id);
}

/** Zeichen zaehlen — emoji-/umlaut-sicher (Unicode-Zeichen, nicht Bytes). */
export function zaehleZeichen(text: string | null | undefined): number {
  return Array.from(text || '').length;
}

/** Optionale Firmen-/CI-Angaben, die die KI beim Texten beruecksichtigt. */
export type CIAngaben = {
  firma?: string | null;
  branche?: string | null;
  ton?: string | null;
};

/** Thema saeubern + auf sinnvolle Laenge begrenzen. */
export function saeubereThema(roh: unknown): string {
  return (typeof roh === 'string' ? roh : '').trim().slice(0, 600);
}

/**
 * System-Prompt: nuechterner, praeziser Marketing-Texter. Kein Markdown, reines
 * JSON, keine erfundenen Fakten. Wirkt fuer Kunde UND Betreiber gleich.
 */
export function baueSystemPrompt(): string {
  return [
    'Du bist ein erfahrener Marketing-Texter für einen deutschen Mittelstandsbetrieb.',
    'Aus EINEM Thema/Anlass erstellst du fertige, veröffentlichungsreife Beiträge — je Kanal genau im geforderten Ton und in der Corporate Identity des Betriebs.',
    'ERFINDE KEINE Fakten: keine Preise, Rabatte, Zahlen, Termine, Öffnungszeiten, Auszeichnungen oder Zitate, die nicht im Thema stehen. Bleib beim Thema und schreibe glaubwürdig und konkret.',
    'Schreibe fehlerfreies Deutsch. Halte die geforderte Länge je Kanal ein.',
    'Für jeden Kanal gibst du zusätzlich ein Bildmotiv an (Feld "bild"): 2–4 Wörter, die eine passende, lizenzfreie Foto-Suche beschreiben.',
    'Antworte AUSSCHLIESSLICH mit einem einzigen JSON-Objekt — ohne Einleitung, ohne Erklärung, ohne Markdown, ohne Code-Zäune.',
  ].join(' ');
}

/**
 * Nutzer-Prompt: Thema + CI + die exakt angeforderten Kanaele mit ihren Regeln
 * und den geforderten JSON-Feldern. Nur bereinigte Kanaele werden aufgenommen.
 */
export function baueNutzerPrompt(thema: string, kanaele: string[], ci?: CIAngaben): string {
  const ids = bereinigeKanaele(kanaele);
  const ciZeilen: string[] = [];
  const firma = (ci?.firma || '').trim();
  const branche = (ci?.branche || '').trim();
  const ton = (ci?.ton || '').trim();
  if (firma) ciZeilen.push(`Betrieb/Firma: ${firma}`);
  if (branche) ciZeilen.push(`Branche: ${branche}`);
  if (ton) ciZeilen.push(`Gewünschter Grundton: ${ton}`);

  const kanalZeilen = ids.map((id) => {
    const k = kanalFuer(id)!;
    const felder = k.mitBetreff ? '"betreff", "text", "bild"' : '"text", "bild"';
    return `- Schlüssel "${k.id}" (${k.name}): ${k.tonHinweis}. Ziel-Länge ~${k.richtwert} Zeichen, maximal ${k.zeichenLimit} Zeichen. Felder: ${felder}.`;
  }).join('\n');

  return [
    `THEMA/ANLASS:\n${(thema || '').trim()}`,
    ciZeilen.length ? `\nCORPORATE IDENTITY:\n${ciZeilen.join('\n')}` : '',
    `\nERZEUGE JE KANAL EINEN BEITRAG:\n${kanalZeilen}`,
    `\nGib genau ein JSON-Objekt zurück, dessen Schlüssel exakt diese Kanal-Schlüssel sind: ${ids.map((i) => `"${i}"`).join(', ')}. Jeder Wert ist ein Objekt mit den genannten Feldern. Beispielform: {"instagram":{"text":"…","bild":"…"}}.`,
  ].filter(Boolean).join('\n');
}

/** Ein fertiger, geprueften Vorschlag fuer die Oberflaeche. */
export type Vorschlag = {
  kanal: string;
  name: string;
  icon: string;
  ziel: FliessbandZiel;
  plattformId: string | null;
  betreff: string | null;
  text: string;
  bildStichwort: string | null;
  zeichen: number;
  zeichenLimit: number;
  zuLang: boolean;
  bildPflicht: boolean;
};

/**
 * Holt das JSON-Objekt aus der KI-Rohantwort — auch wenn Code-Zaeune oder ein
 * Vor-/Nachsatz drumherum stehen. Gibt null zurueck, wenn nichts Brauchbares da.
 */
export function extrahiereJson(roh: string | null | undefined): Record<string, unknown> | null {
  if (!roh) return null;
  let s = String(roh).trim();
  // Code-Zaeune entfernen (```json … ``` oder ``` … ```).
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

/**
 * Baut aus der KI-Rohantwort saubere Vorschlaege — nur fuer die angeforderten
 * Kanaele, in Katalog-Reihenfolge. Jeder Kanal-Wert darf ein Objekt
 * ({text, betreff?, bild?}) ODER direkt ein Text-String sein. Fehlt ein Kanal
 * oder ist sein Text leer, wird er ausgelassen (kein leerer Vorschlag).
 */
export function parseVorschlaege(rohText: string | null | undefined, kanaele: string[]): Vorschlag[] {
  const ids = bereinigeKanaele(kanaele);
  const obj = extrahiereJson(rohText);
  if (!obj) return [];

  const out: Vorschlag[] = [];
  for (const id of ids) {
    const k = kanalFuer(id)!;
    const roh = obj[id];
    if (roh == null) continue;

    let text = '';
    let betreff = '';
    let bild = '';
    if (typeof roh === 'string') {
      text = roh.trim();
    } else if (roh && typeof roh === 'object') {
      const r = roh as Record<string, unknown>;
      text = alsText(r.text ?? r.inhalt ?? r.beitrag);
      betreff = alsText(r.betreff ?? r.titel ?? r.subject);
      bild = alsText(r.bild ?? r.bildmotiv ?? r.foto ?? r.motiv);
    }
    if (!text) continue;

    const zeichen = zaehleZeichen(text);
    out.push({
      kanal: k.id,
      name: k.name,
      icon: k.icon,
      ziel: k.ziel,
      plattformId: k.plattformId,
      betreff: k.mitBetreff ? (betreff || null) : null,
      text,
      bildStichwort: k.mitBild ? (bild || null) : null,
      zeichen,
      zeichenLimit: k.zeichenLimit,
      zuLang: zeichen > k.zeichenLimit,
      bildPflicht: k.bildPflicht,
    });
  }
  return out;
}
