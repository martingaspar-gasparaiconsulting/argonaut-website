// ============================================================================
// ARGONAUT OS · lib/kalkulatorLernen.ts
//
// "Aus echten Projekten lernen": aus dem, was der Betrieb tatsaechlich
// gerechnet und gemessen hat, werden Vorschlaege fuer seine Normwerte.
//
// WARUM MEDIAN UND NICHT DURCHSCHNITT
// Erfahrungswerte im Handwerk haben Ausreisser: der Auftrag mit dem
// verhunzten Untergrund, die Baustelle mit drei Stunden Wartezeit auf den
// Kran. Ein Durchschnitt zieht solche Faelle in die Norm hinein und macht
// jedes kuenftige Angebot teurer, als es sein muesste. Der Median ist die
// Zahl in der Mitte — er bleibt stehen, egal wie schlimm der eine Ausreisser
// war. Deshalb wird hier immer der Median vorgeschlagen und die Spannweite
// dazu angezeigt, damit man sieht, wie sicher die Zahl ist.
//
// GRUNDSATZ: Es wird NICHTS automatisch uebernommen. Jeder Vorschlag muss
// bestaetigt werden. Eine Kalkulation, die sich hinter dem Ruecken des
// Betriebs veraendert, waere schlimmer als gar keine.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type Beobachtung = {
  /** Woher der Wert stammt — fuer die Anzeige. */
  quelle: string;
  wert: number;
  /** Optional: wann beobachtet, fuer "die letzten X". */
  datum?: string;
};

export type Vorschlag = {
  schluessel: string;
  bezeichnung: string;
  art: string;
  einheit: string;
  bezug: string;
  /** Der vorgeschlagene Wert — immer der Median. */
  vorschlag: number;
  /** Was aktuell hinterlegt ist (falls vorhanden). */
  bisher?: number;
  anzahl: number;
  kleinster: number;
  groesster: number;
  /** Wie stark die Werte streuen, in Prozent des Medians. */
  streuung_prozent: number;
  /** Wie verlaesslich ist der Vorschlag? */
  guete: 'gut' | 'mittel' | 'duenn';
  abweichung_prozent?: number;
  hinweis: string;
};

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

/** Median — die Zahl in der Mitte. Bei gerader Anzahl der Schnitt der beiden mittleren. */
export function median(werte: number[]): number {
  const gute = werte.filter((w) => typeof w === 'number' && isFinite(w)).sort((a, b) => a - b);
  if (gute.length === 0) return 0;
  const m = Math.floor(gute.length / 2);
  if (gute.length % 2 === 1) return gute[m] ?? 0;
  return (((gute[m - 1] ?? 0) + (gute[m] ?? 0)) / 2);
}

export function spanne(werte: number[]): { min: number; max: number } {
  const gute = werte.filter((w) => typeof w === 'number' && isFinite(w));
  if (gute.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...gute), max: Math.max(...gute) };
}

/**
 * Wie stark streuen die Werte, gemessen am Median?
 * 0 % = alle gleich · 100 % = die Spannweite ist so gross wie der Median selbst.
 */
export function streuung(werte: number[]): number {
  const m = median(werte);
  if (m === 0) return 0;
  const { min, max } = spanne(werte);
  return Math.round(((max - min) / Math.abs(m)) * 1000) / 10;
}

/** Wie verlaesslich ist ein Vorschlag? Zahl der Beobachtungen und Streuung entscheiden. */
export function guete(anzahl: number, streuungProzent: number): 'gut' | 'mittel' | 'duenn' {
  if (anzahl < 3) return 'duenn';
  if (anzahl >= 8 && streuungProzent <= 40) return 'gut';
  if (anzahl >= 5 && streuungProzent <= 70) return 'gut';
  if (streuungProzent > 120) return 'duenn';
  return 'mittel';
}

function rund(n: number, stellen = 4): number {
  const f = Math.pow(10, stellen);
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Der Vorschlag
// ---------------------------------------------------------------------------

export type LernEingabe = {
  schluessel: string;
  bezeichnung: string;
  art: string;
  einheit: string;
  bezug: string;
  beobachtungen: Beobachtung[];
  bisher?: number;
};

/** Mindestzahl an Beobachtungen, bevor ueberhaupt ein Vorschlag entsteht. */
export const MIN_BEOBACHTUNGEN = 2;

export function baueVorschlag(e: LernEingabe): Vorschlag | null {
  const werte = (e.beobachtungen ?? [])
    .map((b) => Number(b.wert))
    .filter((w) => isFinite(w) && w > 0);

  if (werte.length < MIN_BEOBACHTUNGEN) return null;

  const m = rund(median(werte));
  const { min, max } = spanne(werte);
  const str = streuung(werte);
  const g = guete(werte.length, str);

  const abweichung = e.bisher && e.bisher > 0
    ? Math.round(((m - e.bisher) / e.bisher) * 1000) / 10
    : undefined;

  return {
    schluessel: e.schluessel,
    bezeichnung: e.bezeichnung,
    art: e.art,
    einheit: e.einheit,
    bezug: e.bezug,
    vorschlag: m,
    bisher: e.bisher,
    anzahl: werte.length,
    kleinster: rund(min),
    groesster: rund(max),
    streuung_prozent: str,
    guete: g,
    abweichung_prozent: abweichung,
    hinweis: hinweisText(werte.length, str, g, abweichung),
  };
}

function hinweisText(anzahl: number, str: number, g: 'gut' | 'mittel' | 'duenn', abw?: number): string {
  const basis =
    g === 'gut' ? `Aus ${anzahl} Vorgängen, die eng beieinander liegen — der Wert ist belastbar.`
    : g === 'mittel' ? `Aus ${anzahl} Vorgängen mit spürbaren Unterschieden (${str} % Spannweite).`
    : anzahl < 3 ? `Erst ${anzahl} Vorgänge — noch zu wenig für eine verlässliche Zahl.`
    : `${anzahl} Vorgänge, aber sehr unterschiedlich (${str} % Spannweite) — prüfen Sie, ob hier Verschiedenes zusammengeworfen wird.`;

  if (abw === undefined) return basis;
  if (Math.abs(abw) < 5) return `${basis} Ihr hinterlegter Wert passt gut dazu.`;
  const richtung = abw > 0 ? 'höher' : 'niedriger';
  return `${basis} In der Praxis liegt der Wert ${Math.abs(abw)} % ${richtung} als hinterlegt.`;
}

/** Nur die Vorschläge, die eine Änderung wert sind — der Rest ist Rauschen. */
export function nennenswert(v: Vorschlag, schwelleProzent = 5): boolean {
  if (v.guete === 'duenn') return false;
  if (v.bisher === undefined || v.bisher === 0) return true;
  return Math.abs(v.abweichung_prozent ?? 0) >= schwelleProzent;
}

// ---------------------------------------------------------------------------
// Quelle 1: die eigenen gespeicherten Kalkulationen
// ---------------------------------------------------------------------------

export type GespeicherterPosten = {
  art: string;
  bezeichnung: string;
  menge_je_einheit: number;
  einheit: string;
  preis_je_einheit: number;
};

export type GespeicherteKalk = {
  gewerk: string | null;
  einheit: string;
  posten: GespeicherterPosten[];
  erstellt_am?: string;
};

/** Aus Bezeichnung + Art einen stabilen Schlüssel machen (wie in der Oberfläche). */
export function schluesselAus(bezeichnung: string, art: string): string {
  const rein = String(bezeichnung || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  return `${art}_${rein || 'position'}`;
}

/**
 * Sammelt aus allen gespeicherten Kalkulationen eines Gewerks die
 * Verbrauchswerte je Position und schlaegt daraus Normwerte vor.
 * Das ist die Quelle, die IMMER funktioniert — sie braucht keine
 * BDE-Geraete und keine Zuschnitt-Projekte, nur die eigene Praxis.
 */
export function ausKalkulationen(
  kalkulationen: GespeicherteKalk[],
  gewerk: string,
  bisherige: Record<string, number> = {},
): Vorschlag[] {
  const gesammelt = new Map<string, LernEingabe>();

  for (const kalk of kalkulationen) {
    if ((kalk.gewerk ?? '') !== gewerk) continue;
    for (const p of kalk.posten ?? []) {
      const menge = Number(p.menge_je_einheit);
      if (!isFinite(menge) || menge <= 0) continue;
      if (!String(p.bezeichnung ?? '').trim()) continue;

      const key = schluesselAus(p.bezeichnung, p.art);
      const eintrag = gesammelt.get(key) ?? {
        schluessel: key,
        bezeichnung: p.bezeichnung,
        art: p.art,
        einheit: p.einheit,
        bezug: kalk.einheit,
        beobachtungen: [],
        bisher: bisherige[key],
      };
      eintrag.beobachtungen.push({
        quelle: 'Kalkulation',
        wert: menge,
        datum: kalk.erstellt_am,
      });
      gesammelt.set(key, eintrag);
    }
  }

  return Array.from(gesammelt.values())
    .map(baueVorschlag)
    .filter((v): v is Vorschlag => v !== null)
    .sort((a, b) => b.anzahl - a.anzahl);
}

// ---------------------------------------------------------------------------
// Quelle 2: der echte Verschnitt aus Zuschnitt-Projekten
// ---------------------------------------------------------------------------

export type ZuschnittBefund = {
  material: string;
  verschnitt_prozent: number;
  datum?: string;
};

/**
 * Aus abgeschlossenen Zuschnitt-Projekten den tatsaechlichen Verschnitt je
 * Material ableiten. Das ist die ehrlichste Zahl im ganzen System: sie kommt
 * nicht aus einer Schaetzung, sondern aus dem, was am Ende im Container lag.
 */
export function ausZuschnitt(befunde: ZuschnittBefund[], bisherige: Record<string, number> = {}): Vorschlag[] {
  const jeMaterial = new Map<string, LernEingabe>();

  for (const b of befunde) {
    const material = String(b.material ?? '').trim();
    const wert = Number(b.verschnitt_prozent);
    if (!material || !isFinite(wert) || wert < 0 || wert > 95) continue;

    const key = schluesselAus(`verschnitt ${material}`, 'material');
    const eintrag = jeMaterial.get(key) ?? {
      schluessel: key,
      bezeichnung: `Verschnitt ${material}`,
      art: 'material',
      einheit: 'Prozent',
      bezug: 'Zuschnitt',
      beobachtungen: [],
      bisher: bisherige[key],
    };
    eintrag.beobachtungen.push({ quelle: 'Zuschnitt-Projekt', wert, datum: b.datum });
    jeMaterial.set(key, eintrag);
  }

  return Array.from(jeMaterial.values())
    .map(baueVorschlag)
    .filter((v): v is Vorschlag => v !== null)
    .sort((a, b) => b.anzahl - a.anzahl);
}

// ---------------------------------------------------------------------------
// Zusammenfassung für die Anzeige
// ---------------------------------------------------------------------------

export type LernStand = {
  vorschlaege: number;
  nennenswerte: number;
  belastbare: number;
  text: string;
};

export function lernStand(alle: Vorschlag[]): LernStand {
  const nenn = alle.filter((v) => nennenswert(v));
  const gut = alle.filter((v) => v.guete === 'gut');

  let text: string;
  if (alle.length === 0) {
    text = 'Noch keine Erfahrungswerte gesammelt. Sobald Sie ein paar Kalkulationen gespeichert haben, entstehen hier Vorschläge aus Ihrer eigenen Praxis.';
  } else if (nenn.length === 0) {
    text = `${alle.length} Positionen ausgewertet — Ihre hinterlegten Werte passen zur Praxis. Nichts zu ändern.`;
  } else {
    text = `${nenn.length} von ${alle.length} Positionen weichen spürbar von Ihren hinterlegten Werten ab.`;
  }

  return { vorschlaege: alle.length, nennenswerte: nenn.length, belastbare: gut.length, text };
}
