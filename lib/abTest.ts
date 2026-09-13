// ============================================================================
// ARGONAUT OS · lib/abTest.ts — zwei Betreffzeilen gegeneinander (3.15 Teil 2)
//
// Die Auswertung gab es schon: lib/mailMessung.ts vergleicht zwei Versendungen
// und nennt bewusst KEINEN Sieger, wenn die Grundlage zu dünn ist. Was fehlte,
// war das Aussteuern davor — zwei Betreffzeilen an je einen Teil der Liste
// schicken, warten, und den Rest mit dem besseren Betreff bedienen.
//
// ▄▄▄ DIE UNBEQUEME WAHRHEIT ZUERST ▄▄▄
// Ein A/B-Test braucht Menge. Unter 30 Zugestellten je Gruppe ist der
// Unterschied Zufall — das steht schon in mailMessung.AUSSAGEKRAEFTIG_AB.
// Bei 80 Abonnenten gibt es keinen sinnvollen Test, und diese Datei sagt das
// auch, statt eine Zahl zu liefern, auf die jemand eine Entscheidung baut.
// pruefeMenge() ist deshalb der erste Aufruf, nicht der letzte.
//
// ▄▄▄ WIE AUFGETEILT WIRD ▄▄▄
// Nicht zufällig, sondern über eine Streuzahl aus der Adresse. Dasselbe
// Ergebnis bei jedem Aufruf — sonst wäre ein Test nicht wiederholbar und ein
// abgebrochener Lauf würde Empfänger doppelt bedienen. Alphabetisch wäre
// falsch: dann landeten alle „a…"-Adressen in derselben Gruppe.
//
// KEINE Netzwerk-/Supabase-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

import { quoten, zugestellt, vergleiche, AUSSAGEKRAEFTIG_AB, type VersandRoh } from './mailMessung';

/** Voreinstellung: je Variante ein Fünftel, der Rest bekommt den Sieger. */
export const ANTEIL_STANDARD = 20;

/** So lange wird gewartet, bevor ein Ergebnis überhaupt angesehen wird. */
export const WARTEZEIT_STUNDEN = 4;

/** Weniger als so viele Empfänger je Gruppe ergeben keinen Test. */
export const MINDESTGRUPPE = AUSSAGEKRAEFTIG_AB;

// ------------------------------------------------------------ Menge prüfen

export type MengenBefund = {
  moeglich: boolean;
  /** Anteil je Variante in Prozent, der die Mindestgruppe gerade erreicht. */
  empfohlenerAnteil: number;
  /** Wieviele je Gruppe bei diesem Anteil. */
  jeGruppe: number;
  satz: string;
};

/**
 * Lohnt ein Test bei dieser Listengröße — und mit welchem Anteil?
 *
 * Gerechnet wird rückwärts: je Gruppe müssen MINDESTGRUPPE Empfänger
 * zusammenkommen. Reicht die Liste nicht einmal für eine Halbierung, ist die
 * Antwort Nein — und zwar deutlich, nicht als kleingedruckter Hinweis.
 */
export function pruefeMenge(gesamt: unknown, mindest = MINDESTGRUPPE): MengenBefund {
  const n = Math.max(0, Math.floor(Number(gesamt) || 0));
  const noetig = mindest * 2;

  if (n < noetig) {
    return {
      moeglich: false,
      empfohlenerAnteil: 0,
      jeGruppe: 0,
      satz:
        `Für einen Test bräuchte es mindestens ${noetig} Empfänger (${mindest} je Betreffzeile). `
        + `Vorhanden sind ${n}. Schicken Sie einen Betreff an alle — das Ergebnis wäre sonst Zufall.`,
    };
  }

  // Kleinster Anteil, bei dem die Mindestgruppe noch erreicht wird, gedeckelt
  // auf den Standard: bei einer großen Liste braucht es keine Hälfte.
  const noetigerAnteil = Math.ceil((mindest / n) * 100);
  const anteil = Math.min(50, Math.max(noetigerAnteil, Math.min(ANTEIL_STANDARD, 50)));
  const jeGruppe = Math.floor((n * anteil) / 100);
  const rest = n - jeGruppe * 2;

  return {
    moeglich: true,
    empfohlenerAnteil: anteil,
    jeGruppe,
    satz: `${jeGruppe} Empfänger je Betreffzeile, ${rest} bekommen anschließend den besseren.`,
  };
}

// ------------------------------------------------------------- Aufteilen

/**
 * Streuzahl aus einer Zeichenkette — klein, schnell, ohne Bibliothek.
 * Wird nur zum Mischen benutzt, nie für etwas Sicherheitsrelevantes.
 */
export function streuzahl(text: unknown): number {
  const s = String(text ?? '').trim().toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

export type Empfaenger = { email?: unknown };

export type Aufteilung<T> = { a: T[]; b: T[]; rest: T[] };

/**
 * Teilt die Liste in Gruppe A, Gruppe B und den Rest.
 *
 * Gemischt wird über die Streuzahl der Adresse — gleiches Ergebnis bei jedem
 * Aufruf. Ein Empfänger ohne Adresse fällt heraus, statt in einer Gruppe zu
 * landen, die ihn nie erreicht.
 */
export function teileAuf<T extends Empfaenger>(
  liste: T[] | null | undefined,
  anteilProzent: unknown = ANTEIL_STANDARD,
  streuwort = '',
): Aufteilung<T> {
  const gueltig = (liste ?? []).filter((e) => String(e?.email ?? '').includes('@'));
  const anteil = Math.min(50, Math.max(1, Math.floor(Number(anteilProzent) || 0)));
  if (gueltig.length === 0) return { a: [], b: [], rest: [] };

  const gemischt = [...gueltig].sort(
    (x, y) => streuzahl(String(x.email) + streuwort) - streuzahl(String(y.email) + streuwort),
  );

  const jeGruppe = Math.floor((gemischt.length * anteil) / 100);
  if (jeGruppe === 0) return { a: [], b: [], rest: gemischt };

  return {
    a: gemischt.slice(0, jeGruppe),
    b: gemischt.slice(jeGruppe, jeGruppe * 2),
    rest: gemischt.slice(jeGruppe * 2),
  };
}

// ---------------------------------------------------------------- Phasen

export type TestStand = {
  gestartet_am?: unknown;
  rest_gesendet_am?: unknown;
};

export type Phase = 'nicht_gestartet' | 'wartet' | 'auswertbar' | 'abgeschlossen';

export const PHASE_TEXT: Record<Phase, string> = {
  nicht_gestartet: 'noch nicht gestartet',
  wartet: 'läuft — das Ergebnis wird noch nicht angesehen',
  auswertbar: 'kann ausgewertet werden',
  abgeschlossen: 'abgeschlossen, der Rest ist raus',
};

/**
 * In welcher Phase steckt der Test?
 *
 * Die Wartezeit ist kein Schmuck: Wer nach zwanzig Minuten nachsieht, sieht
 * die Postfächer, die zufällig gerade offen waren. „jetzt" wird immer
 * hereingereicht, nie hier gebildet.
 */
export function phase(stand: TestStand | null | undefined, jetztIso: string, stunden = WARTEZEIT_STUNDEN): Phase {
  const start = String(stand?.gestartet_am ?? '').trim();
  if (!start) return 'nicht_gestartet';
  if (String(stand?.rest_gesendet_am ?? '').trim()) return 'abgeschlossen';

  const a = new Date(start).getTime();
  const b = new Date(jetztIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 'wartet';

  const vergangen = (b - a) / 3600000;
  return vergangen >= Math.max(0, Number(stunden) || 0) ? 'auswertbar' : 'wartet';
}

/** Wieviele Stunden noch zu warten sind — für die Anzeige. */
export function restStunden(stand: TestStand | null | undefined, jetztIso: string, stunden = WARTEZEIT_STUNDEN): number | null {
  const start = String(stand?.gestartet_am ?? '').trim();
  if (!start) return null;
  const a = new Date(start).getTime();
  const b = new Date(jetztIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const offen = Math.max(0, Number(stunden) || 0) - (b - a) / 3600000;
  return offen <= 0 ? 0 : Math.ceil(offen);
}

// --------------------------------------------------------------- Ergebnis

export type Ergebnis = {
  /** 'a' | 'b' | null — null heißt: kein belastbarer Unterschied. */
  sieger: 'a' | 'b' | null;
  /** Auch ohne Sieger geht der Rest raus — dann mit diesem Betreff. */
  empfehlung: 'a' | 'b';
  sicher: boolean;
  satz: string;
  quoteA: number | null;
  quoteB: number | null;
  zugestelltA: number;
  zugestelltB: number;
};

/**
 * Wer hat gewonnen — und darf man das sagen?
 *
 * Die Beurteilung kommt aus lib/mailMessung.vergleiche(); die Regeln stehen
 * dort und sind dort getestet: unter 30 Zugestellten oder unter 5
 * Prozentpunkten Unterschied gibt es keinen Sieger.
 *
 * Es gibt trotzdem immer eine EMPFEHLUNG, denn der Rest der Liste muss ja
 * irgendeinen Betreff bekommen. Bei Gleichstand ist das die erste Variante —
 * willkürlich, aber offen als solche benannt statt als Erkenntnis verkleidet.
 */
export function ergebnis(a: VersandRoh | null | undefined, b: VersandRoh | null | undefined): Ergebnis {
  const qa = quoten(a);
  const qb = quoten(b);
  const urteil = vergleiche(a, b);
  const za = zugestellt(a);
  const zb = zugestellt(b);

  let sieger: 'a' | 'b' | null = null;
  if (urteil.sicher && qa.oeffnung != null && qb.oeffnung != null) {
    sieger = qa.oeffnung > qb.oeffnung ? 'a' : 'b';
  }

  const empfehlung: 'a' | 'b' =
    sieger ?? ((qa.oeffnung ?? 0) >= (qb.oeffnung ?? 0) ? 'a' : 'b');

  const zusatz = sieger
    ? ''
    : ' Für den Rest wird die ' + (empfehlung === 'a' ? 'erste' : 'zweite')
      + ' Betreffzeile genommen — das ist eine Setzung, kein Ergebnis.';

  return {
    sieger,
    empfehlung,
    sicher: urteil.sicher,
    satz: urteil.satz + zusatz,
    quoteA: qa.oeffnung,
    quoteB: qb.oeffnung,
    zugestelltA: za,
    zugestelltB: zb,
  };
}

/**
 * Was einem Test zum Start fehlt. Leere Liste heißt: es kann los.
 * Zwei gleiche Betreffzeilen sind kein Test — das fällt hier auf.
 */
export function fehltZumStart(betreffA: unknown, betreffB: unknown, empfaengerAnzahl: unknown): string[] {
  const fehlt: string[] = [];
  const a = String(betreffA ?? '').trim();
  const b = String(betreffB ?? '').trim();
  if (a.length < 3) fehlt.push('die erste Betreffzeile');
  if (b.length < 3) fehlt.push('die zweite Betreffzeile');
  if (a.length >= 3 && a.toLowerCase() === b.toLowerCase()) fehlt.push('zwei VERSCHIEDENE Betreffzeilen');
  if (!pruefeMenge(empfaengerAnzahl).moeglich) fehlt.push('genug Empfänger');
  return fehlt;
}

/** Kurzfassung für Listen: „42 % gegen 31 %". */
export function kurzstand(e: Ergebnis): string {
  const f = (v: number | null) => (v == null ? '—' : v.toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %');
  return f(e.quoteA) + ' gegen ' + f(e.quoteB);
}

export { AUSSAGEKRAEFTIG_AB };
