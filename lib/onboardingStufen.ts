// ============================================================================
// ARGONAUT OS · lib/onboardingStufen.ts — „Vom Matrosen zum Kapitän"
//
// Die Fortschritts-Stufen der geführten Startstrecke. Das Narrativ steht so
// auch auf der Website: Der Kunde fährt seine eigene Argo — und wird Schritt
// für Schritt vom Matrosen zum Kapitän.
//
// Reine Logik: keine Imports, keine Hooks, node-testbar, von Client UND Server
// nutzbar. Die Oberfläche (/dashboard/onboarding) liest hier nur ab.
// ============================================================================

export type Stufe = {
  /** Ab wie viel Prozent diese Stufe gilt. */
  abProzent: number;
  /** Rang, den der Kunde erreicht hat. */
  rang: string;
  /** Kurze Anrede-Zeile — steht neben dem Auge. */
  spruch: string;
  /** Was ihn als Nächstes erwartet (motiviert weiterzumachen). */
  ausblick: string;
  /** Farbton für das Auge auf dieser Stufe. */
  farbe: string;
};

/**
 * Sieben Stufen. Die Abstände sind bewusst am Anfang eng (schnelle Erfolge)
 * und werden nach hinten größer — so fühlt sich der Start leicht an und der
 * Abschluss verdient.
 */
export const STUFEN: Stufe[] = [
  {
    abProzent: 0,
    rang: 'Leinen los',
    spruch: 'Willkommen an Bord. Deine Argo liegt bereit.',
    ausblick: 'Der erste Schritt dauert keine zwei Minuten — danach läuft es von allein.',
    farbe: '#7aa3b3',
  },
  {
    abProzent: 10,
    rang: 'Matrose',
    spruch: 'Der erste Schritt ist gemacht — genau so geht das.',
    ausblick: 'Noch ein paar Handgriffe, dann arbeitet das System für dich statt umgekehrt.',
    farbe: '#8fb8c4',
  },
  {
    abProzent: 25,
    rang: 'Leichtmatrose',
    spruch: 'Ein Viertel liegt hinter dir. Du kennst jetzt den Weg.',
    ausblick: 'Ab hier merkst du, wie die Module ineinandergreifen.',
    farbe: '#a8c9d1',
  },
  {
    abProzent: 40,
    rang: 'Bootsmann',
    spruch: 'Die Grundausstattung steht. Dein Betrieb ist im System angekommen.',
    ausblick: 'Jetzt kommen die Teile, die dir täglich Zeit sparen.',
    farbe: '#C9A84C',
  },
  {
    abProzent: 60,
    rang: 'Steuermann',
    spruch: 'Über die Hälfte. Du steuerst deinen Betrieb jetzt selbst.',
    ausblick: 'Der Rest ist Feinschliff — und der lohnt sich besonders.',
    farbe: '#d4b65e',
  },
  {
    abProzent: 80,
    rang: 'Erster Offizier',
    spruch: 'Fast am Ziel. Was jetzt noch fehlt, macht den Unterschied.',
    ausblick: 'Die letzten Schritte schalten die Automatik frei.',
    farbe: '#e8c46a',
  },
  {
    abProzent: 100,
    rang: 'Kapitän',
    spruch: 'Geschafft. Du führst deinen Betrieb mit ARGONAUT.',
    ausblick: 'Dein Abschluss-Zertifikat liegt bereit — herzlichen Glückwunsch.',
    farbe: '#4CAF7D',
  },
];

/** Die aktuell erreichte Stufe zu einem Fortschritt in Prozent. */
export function stufeFuer(prozent: number): Stufe {
  const p = Math.max(0, Math.min(100, Math.round(Number(prozent) || 0)));
  let treffer = STUFEN[0];
  for (const s of STUFEN) {
    if (p >= s.abProzent) treffer = s;
  }
  return treffer;
}

/** Die nächste Stufe — null, wenn der Kunde bereits Kapitän ist. */
export function naechsteStufe(prozent: number): Stufe | null {
  const p = Math.max(0, Math.min(100, Math.round(Number(prozent) || 0)));
  return STUFEN.find((s) => s.abProzent > p) ?? null;
}

/** Wie viele Prozentpunkte fehlen bis zur nächsten Stufe? 0 = Ziel erreicht. */
export function bisNaechsteStufe(prozent: number): number {
  const n = naechsteStufe(prozent);
  if (!n) return 0;
  const p = Math.max(0, Math.min(100, Math.round(Number(prozent) || 0)));
  return n.abProzent - p;
}

/**
 * Hat der Kunde mit diesem Schritt eine NEUE Stufe erreicht?
 * Wird gebraucht, damit das Auge nur dann aufleuchtet, wenn es etwas zu
 * feiern gibt — und nicht bei jedem Klick.
 */
export function stufeAufgestiegen(vorher: number, nachher: number): boolean {
  return stufeFuer(nachher).abProzent > stufeFuer(vorher).abProzent;
}

/** Ist die Strecke komplett durchlaufen? Dann gibt es das Zertifikat. */
export function istKapitaen(prozent: number): boolean {
  return Math.round(Number(prozent) || 0) >= 100;
}

/** Fortschritt in Prozent aus erledigten und gesamten Schritten. */
export function prozentAus(erledigt: number, gesamt: number): number {
  if (!gesamt || gesamt < 1) return 0;
  return Math.round((Math.max(0, erledigt) / gesamt) * 100);
}
