// ============================================================================
// ARGONAUT OS · lib/kiPreise.ts — EINE Preistabelle fuer alle KI-Kosten
//
// Paket PA (24.09.2026). Reine Logik, node-getestet (tests/kiPreiseP70.test.mjs).
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Die Preise standen an ZWEI Stellen, und beide lagen daneben:
//   · lib/ki.ts rechnete Sonnet ab dem 01.09.2026 mit $3 / $15. Die offizielle
//     Preisliste nennt fuer Sonnet 5 dauerhaft $2 / $10. Das Kosten-Protokoll
//     (ki_nutzung) zeigte fuer die 14 Sonnet-Routen also 50 % ZU VIEL.
//   · Opus fiel in den "unbekannt"-Zweig und wurde mit $3 / $15 geschaetzt.
//     Opus 5.5 kostet $4 / $20 — die Anzeige waere ZU NIEDRIG gewesen.
//   · lib/inhaltPrompt.ts hatte eine eigene, dritte Kopie fuer die Schaetzung
//     vor dem Absenden eines Stapels.
// Ab hier gilt nur noch diese Tabelle. Aendert Anthropic einen Preis, ist das
// EINE Zeile.
//
// Stand der Preise: offizielle Preisliste, geprueft am 24.09.2026
//   https://platform.claude.com/docs/en/about-claude/pricing
//   Opus 5.5   $4 / $20     Sonnet 5  $2 / $10     Haiku 4.5  $1 / $5
//   Cache schreiben (5 Min) = 1,25 x Eingabe · Cache lesen = 0,1 x Eingabe
//   Stapel-Schnittstelle (Batch) = halber Preis, auch auf die Cache-Anteile
//
// Unbekanntes Modell -> es wird mit dem TEUERSTEN Satz gerechnet (Opus). Eine
// Kostenanzeige, die im Zweifel zu hoch liegt, loest hoechstens eine Warnung
// zu viel aus. Eine, die zu niedrig liegt, verdeckt eine teure Route.
// ============================================================================

export type Preis = {
  /** USD je 1 Mio Eingabe-Tokens */
  rein: number;
  /** USD je 1 Mio Ausgabe-Tokens */
  raus: number;
  /** USD je 1 Mio Tokens, die in den Cache geschrieben werden (5 Minuten) */
  cacheWrite: number;
  /** USD je 1 Mio Tokens, die aus dem Cache gelesen werden */
  cacheRead: number;
};

export type Familie = 'haiku' | 'sonnet' | 'opus';

/** Grundpreise je Familie — Eingabe / Ausgabe in USD je 1 Mio Tokens. */
export const GRUNDPREIS: Record<Familie, { rein: number; raus: number }> = {
  haiku: { rein: 1, raus: 5 },
  sonnet: { rein: 2, raus: 10 },
  opus: { rein: 4, raus: 20 },
};

export const CACHE_SCHREIBEN_FAKTOR = 1.25;
export const CACHE_LESEN_FAKTOR = 0.1;
export const STAPEL_FAKTOR = 0.5;

/**
 * Welche Familie steckt im Modellnamen? Unbekannt -> null.
 * "claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5-5" … — gross/klein egal.
 */
export function familieVon(modell: unknown): Familie | null {
  const m = String(modell ?? '').toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('opus')) return 'opus';
  return null;
}

/** Rundet auf 6 Nachkommastellen — gegen 0.30000000000000004 in der Anzeige. */
function glatt(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

/**
 * Preis je 1 Mio Tokens fuer ein Modell.
 * @param stapel true = ueber die Stapel-Schnittstelle (halber Preis)
 */
export function preisFuer(modell: unknown, stapel = false): Preis {
  const familie = familieVon(modell) ?? 'opus'; // unbekannt -> teuerster Satz
  const g = GRUNDPREIS[familie];
  const f = stapel ? STAPEL_FAKTOR : 1;
  return {
    rein: glatt(g.rein * f),
    raus: glatt(g.raus * f),
    cacheWrite: glatt(g.rein * CACHE_SCHREIBEN_FAKTOR * f),
    cacheRead: glatt(g.rein * CACHE_LESEN_FAKTOR * f),
  };
}

export type Verbrauch = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
};

/** Token-Zahl defensiv lesen: nur endliche, nicht negative Zahlen zaehlen. */
function tokens(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Kosten eines Aufrufs in USD aus dem usage-Block der Antwort.
 * Fehlende oder kaputte Felder zaehlen als 0 — nie NaN im Protokoll.
 */
export function kostenUsd(modell: unknown, verbrauch: Verbrauch | null | undefined, stapel = false): number {
  const u = verbrauch ?? {};
  const p = preisFuer(modell, stapel);
  const summe =
    tokens(u.input_tokens) * p.rein +
    tokens(u.output_tokens) * p.raus +
    tokens(u.cache_creation_input_tokens) * p.cacheWrite +
    tokens(u.cache_read_input_tokens) * p.cacheRead;
  return summe / 1_000_000;
}

/**
 * Schaetzung VOR dem Absenden: n Anfragen mit je tokensRein / tokensRaus.
 * Fuer die Anzeige "das wird ungefaehr X USD kosten".
 */
export function schaetzeUsd(
  anzahl: number,
  modell: unknown,
  tokensRein: number,
  tokensRaus: number,
  stapel = false,
): number {
  const n = Math.max(0, Math.floor(Number(anzahl) || 0));
  const p = preisFuer(modell, stapel);
  return (n * tokens(tokensRein) * p.rein + n * tokens(tokensRaus) * p.raus) / 1_000_000;
}
