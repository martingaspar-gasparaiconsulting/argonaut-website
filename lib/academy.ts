// ============================================================================
// ARGONAUT OS · lib/academy.ts — Lernfortschritt und Auszeichnungen
//
// Die Regeln dahinter, wer wann was geschafft hat. Bewusst als reine
// Funktionen, damit die Zahlen nachvollziehbar bleiben: Bei etwas, das
// Mitarbeitern Auszeichnungen gibt (oder eben nicht), darf nichts im
// Halbdunkel passieren.
//
// Der maritime Ton ist kein Zufall — er ist derselbe wie in
// lib/onboardingStufen.ts (Leinen los → Kapitän). Zwei verschiedene
// Bildwelten im selben System waeren Beliebigkeit.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type KursQuelle = 'global' | 'eigen';

export type Fortschritt = {
  kurs_id: string;
  kurs_quelle: KursQuelle;
  sekunden: number;
  laenge_sekunden: number;
  prozent: number;
  abgeschlossen: boolean;
  abgeschlossen_am?: string | null;
};

/** Ab hier gilt ein Kurs als gesehen. Nicht 100 %: Abspann und Verabschiedung
 *  schaut niemand zu Ende, und daran soll keine Auszeichnung scheitern. */
export const ABSCHLUSS_AB_PROZENT = 92;

/** Naeher als das am Ende? Dann beim naechsten Mal von vorn statt in den Abspann. */
const NEUSTART_AB_PROZENT = 98;

/** Kleinere Spruenge werden nicht gespeichert — sonst schreibt der Player
 *  im Sekundentakt in die Datenbank. */
export const SPEICHER_ABSTAND_SEKUNDEN = 10;

// ---------------------------------------------------------------------------
// Fortschritt rechnen
// ---------------------------------------------------------------------------

/** Für die ANZEIGE — gerundet, damit im Balken keine Kommastellen stehen. */
export function prozentAus(sekunden: number, laenge: number): number {
  const l = Math.max(0, Number(laenge) || 0);
  if (l <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(genauProzent(sekunden, laenge))));
}

/** Für ENTSCHEIDUNGEN — ungerundet. Sonst gilt ein Kurs bei 91,5 % als
 *  geschafft, weil die Anzeige auf 92 rundet. An einer Auszeichnung darf
 *  nicht die Darstellung schuld sein. */
export function genauProzent(sekunden: number, laenge: number): number {
  const s = Math.max(0, Number(sekunden) || 0);
  const l = Math.max(0, Number(laenge) || 0);
  if (l <= 0) return 0;
  return Math.max(0, Math.min(100, (s / l) * 100));
}

export function istAbgeschlossen(sekunden: number, laenge: number): boolean {
  const l = Math.max(0, Number(laenge) || 0);
  if (l <= 0) return false;
  return genauProzent(sekunden, laenge) >= ABSCHLUSS_AB_PROZENT;
}

/**
 * Wo soll das Video starten? Wer fast durch war, faengt wieder vorn an —
 * sonst landet man beim Wiederansehen direkt im Abspann und fragt sich,
 * warum nichts passiert.
 */
export function startpunkt(f: Fortschritt | undefined): number {
  if (!f) return 0;
  const s = Math.max(0, Number(f.sekunden) || 0);
  const l = Math.max(0, Number(f.laenge_sekunden) || 0);
  if (l <= 0) return s;
  if (genauProzent(s, l) >= NEUSTART_AB_PROZENT) return 0;
  // Ein paar Sekunden zurueck, damit man wieder hineinfindet.
  return Math.max(0, s - 3);
}

/** Lohnt es sich, diesen Stand zu speichern? */
export function sollSpeichern(alt: number, neu: number, laenge: number): boolean {
  const a = Math.max(0, Number(alt) || 0);
  const n = Math.max(0, Number(neu) || 0);
  if (n < a) return true;                                   // zurueckgespult
  if (Math.abs(n - a) >= SPEICHER_ABSTAND_SEKUNDEN) return true;
  // Am Ende immer speichern — sonst fehlt genau der Abschluss.
  return laenge > 0 && istAbgeschlossen(n, laenge) && !istAbgeschlossen(a, laenge);
}

export function dauerText(sekunden: number): string {
  const s = Math.max(0, Math.round(Number(sekunden) || 0));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Die Raenge
// ---------------------------------------------------------------------------

export type Medaille = {
  key: string;
  rang: string;
  abKursen: number;
  icon: string;
  spruch: string;
  farbe: string;
};

export const MEDAILLEN: Medaille[] = [
  { key: 'erste_fahrt', rang: 'Erste Fahrt', abKursen: 1, icon: '⚓', spruch: 'Der erste Kurs ist geschafft — angelegt und losgefahren.', farbe: '#8FA3BE' },
  { key: 'smutje', rang: 'Smutje', abKursen: 3, icon: '🍲', spruch: 'Drei Kurse durch. Sie kennen sich an Bord langsam aus.', farbe: '#4CAF7D' },
  { key: 'matrose', rang: 'Matrose', abKursen: 6, icon: '🧭', spruch: 'Sechs Kurse — Sie packen mit an, ohne lange zu fragen.', farbe: '#00e5ff' },
  { key: 'bootsmann', rang: 'Bootsmann', abKursen: 10, icon: '🪢', spruch: 'Zehn Kurse. Andere fragen inzwischen Sie um Rat.', farbe: '#00e5ff' },
  { key: 'steuermann', rang: 'Steuermann', abKursen: 15, icon: '🎚️', spruch: 'Fünfzehn Kurse — Sie halten den Kurs auch bei Wind.', farbe: '#C9A84C' },
  { key: 'navigator', rang: 'Navigator', abKursen: 25, icon: '🗺️', spruch: 'Fünfundzwanzig Kurse. Sie finden den Weg, bevor andere die Karte auspacken.', farbe: '#C9A84C' },
  { key: 'kapitaen', rang: 'Kapitän', abKursen: 40, icon: '🎖️', spruch: 'Vierzig Kurse — an Bord gibt es nichts mehr, was Sie überrascht.', farbe: '#C9A84C' },
];

/** Höchster erreichter Rang — oder null, wenn noch keiner. */
export function medailleFuer(abgeschlossene: number): Medaille | null {
  const n = Math.max(0, Math.floor(Number(abgeschlossene) || 0));
  let treffer: Medaille | null = null;
  for (const m of MEDAILLEN) if (n >= m.abKursen) treffer = m;
  return treffer;
}

/** Alle Ränge, die bei diesem Stand verdient sind (auch die übersprungenen). */
export function verdienteMedaillen(abgeschlossene: number): Medaille[] {
  const n = Math.max(0, Math.floor(Number(abgeschlossene) || 0));
  return MEDAILLEN.filter((m) => n >= m.abKursen);
}

export function naechsteMedaille(abgeschlossene: number): Medaille | null {
  const n = Math.max(0, Math.floor(Number(abgeschlossene) || 0));
  return MEDAILLEN.find((m) => n < m.abKursen) ?? null;
}

/** Welche Ränge sind neu dazugekommen? Nur die werden gefeiert. */
export function neueMedaillen(abgeschlossene: number, bereitsVerliehen: string[]): Medaille[] {
  const schon = new Set(bereitsVerliehen ?? []);
  return verdienteMedaillen(abgeschlossene).filter((m) => !schon.has(m.key));
}

export function bisNaechsteMedaille(abgeschlossene: number): { fehlen: number; medaille: Medaille } | null {
  const n = Math.max(0, Math.floor(Number(abgeschlossene) || 0));
  const naechste = naechsteMedaille(n);
  if (!naechste) return null;
  return { fehlen: naechste.abKursen - n, medaille: naechste };
}

// ---------------------------------------------------------------------------
// Übersicht für den Chef
// ---------------------------------------------------------------------------

export type LernStandPerson = {
  user_id: string;
  name: string;
  abgeschlossen: number;
  angefangen: number;
  pflicht_offen: number;
  zuletzt_am?: string | null;
};

export type TeamStand = {
  personen: number;
  abgeschlossenGesamt: number;
  schnittJePerson: number;
  pflichtOffenGesamt: number;
  text: string;
};

export function teamStand(liste: LernStandPerson[]): TeamStand {
  const personen = liste.length;
  const gesamt = liste.reduce((s, p) => s + (Number(p.abgeschlossen) || 0), 0);
  const pflicht = liste.reduce((s, p) => s + (Number(p.pflicht_offen) || 0), 0);
  const schnitt = personen > 0 ? Math.round((gesamt / personen) * 10) / 10 : 0;

  let text: string;
  if (personen === 0) {
    text = 'Noch niemand im Team hat die Academy geöffnet.';
  } else if (pflicht > 0) {
    text = `${pflicht} ${pflicht === 1 ? 'Pflichtschulung ist' : 'Pflichtschulungen sind'} noch offen.`;
  } else if (gesamt === 0) {
    text = 'Die Academy ist eingerichtet, aber noch kein Kurs abgeschlossen.';
  } else {
    text = `${gesamt} abgeschlossene Kurse im Team, im Schnitt ${schnitt} je Person.`;
  }

  return { personen, abgeschlossenGesamt: gesamt, schnittJePerson: schnitt, pflichtOffenGesamt: pflicht, text };
}

/** Sortierung der Team-Liste: wer Pflichtschulungen offen hat, steht oben. */
export function sortiereTeam(liste: LernStandPerson[]): LernStandPerson[] {
  return [...liste].sort((a, b) => {
    if (a.pflicht_offen !== b.pflicht_offen) return b.pflicht_offen - a.pflicht_offen;
    if (a.abgeschlossen !== b.abgeschlossen) return b.abgeschlossen - a.abgeschlossen;
    return a.name.localeCompare(b.name);
  });
}
