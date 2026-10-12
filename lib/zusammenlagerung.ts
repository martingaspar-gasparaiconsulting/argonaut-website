// ============================================================================
// ARGONAUT OS · lib/zusammenlagerung.ts — Zusammenlagerungs-Ampel (Paket 330 · G2c)
//
// Reine Logik, node-getestet (tests/zusammenlagerungP330.test.mjs).
//
// Je Lagerplatz prüft die Ampel jedes Paar von Stoffen nach der
// Zusammenlagerungstabelle der TRGS 510 (Abschnitt 13, Fassung 2021):
//   „+"  Zusammenlagerung erlaubt             -> grün
//   Ziffer  nur eingeschränkt erlaubt          -> gelb (Bedingung Nr. … prüfen)
//   „–"  Separatlagerung erforderlich          -> rot
//
// Ehrlich:
//   · Die Tabelle ist aus einem Abbild der TRGS 510 abgelesen (Fachseite,
//     Stand 2021) und per Test auf Symmetrie geprüft. Vor dem Einschalten
//     Zelle für Zelle mit dem amtlichen Text abgleichen (Kontrollgang).
//   · Den Wortlaut der Bedingungen 1–8 geben wir NICHT wieder (nicht aus
//     amtlicher Quelle vorliegend) — die Ampel nennt nur die Nummer.
//   · LGK 10–13 nutzen die gemeinsame Spalte „10–13" der Tabelle (Gefahrstoffe).
//   · Kleinmengen-Ausnahmen (Abschnitt 13) und Mengen prüft die Ampel nicht.
//   · Ein Stoff ohne Lagerklasse wird nicht bewertet, sondern gemeldet.
// Freigeschaltet erst nach der Abnahme (lib/startSperre „zusammenlagerung", R49).
// ============================================================================

/** Reihenfolge der Zeilen und Spalten der Tabelle. */
export const ZL_KLASSEN = [
  '1', '2A', '2B', '3', '4.1A', '4.1B', '4.2', '4.3', '5.1A', '5.1B', '5.1C', '5.2',
  '6.1A', '6.1B', '6.1C', '6.1D', '6.2', '7', '8A', '8B', '10-13',
] as const;
export type ZlKlasse = (typeof ZL_KLASSEN)[number];

/**
 * Die Tabelle, Zeile für Zeile in der Reihenfolge von ZL_KLASSEN.
 * „+" erlaubt, „-" Separatlagerung, Ziffer = nur mit Bedingung Nr.
 */
const TABELLE: Record<ZlKlasse, string> = {
  '1':     '1 - - - - - - - - - - - - - - - - - - - -',
  '2A':    '- 3 2 - - - - - - - 1 - - - - - - - 2 + 2',
  '2B':    '- 2 + + - - - - - - 1 - + + + + - - + + +',
  '3':     '- - + + - - - - - 4 - - + - + 6 - - + + 5',
  '4.1A':  '- - - - 1 1 - - - - - 1 - - - - - - 1 1 1',
  '4.1B':  '- - - - 1 + 6 6 - 4 - 1 8 - + 6 - - + + +',
  '4.2':   '- - - - - 6 + 6 - - - - - - 6 6 - - 6 6 6',
  '4.3':   '- - - - - 6 6 + - - - - - - 6 6 - - 6 6 6',
  '5.1A':  '- - - - - - - - + + - - - - - - - - - - -',
  '5.1B':  '- - - 4 - 4 - - + + 1 - 4 4 6 6 - - 7 + 7',
  '5.1C':  '- 1 1 - - - - - - 1 1 - - - - - - - 1 1 1',
  '5.2':   '- - - - 1 1 - - - - - + - - - - - - - - 1',
  '6.1A':  '- - + + - 8 - - - 4 - - + + + + - - + + 5',
  '6.1B':  '- - + - - - - - - 4 - - + + + + - - + + 5',
  '6.1C':  '- - + + - + 6 6 - 6 - - + + + + - - + + +',
  '6.1D':  '- - + 6 - 6 6 6 - 6 - - + + + + - - + + +',
  '6.2':   '- - - - - - - - - - - - - - - - + - - - -',
  '7':     '- - - - - - - - - - - - - - - - - 1 - - -',
  '8A':    '- 2 + + 1 + 6 6 - 7 1 - + + + + - - + + +',
  '8B':    '- + + + 1 + 6 6 - + 1 - + + + + - - + + +',
  '10-13': '- 2 + 5 1 + 6 6 - 7 1 1 5 5 + + - - + + +',
};

export const TABELLE_ROH: Readonly<Record<ZlKlasse, string>> = Object.freeze({ ...TABELLE });
export const QUELLE = 'TRGS 510, Abschnitt 13, Zusammenlagerungstabelle (Fassung 2021) — vor Freigabe mit dem amtlichen Text abgleichen';

export type Zelle = { art: 'erlaubt' } | { art: 'getrennt' } | { art: 'bedingt'; nr: number };

/** Lagerklasse aus dem Verzeichnis (TRGS-510-Schlüssel) → Tabellen-Klasse. 10, 11, 12, 13 → „10-13". */
export function zlKlasse(k: unknown): ZlKlasse | null {
  const t = String(k ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (t === '10' || t === '11' || t === '12' || t === '13') return '10-13';
  return (ZL_KLASSEN as readonly string[]).includes(t) ? (t as ZlKlasse) : null;
}

function zeichen(a: ZlKlasse, b: ZlKlasse): string {
  return TABELLE[a].split(' ')[ZL_KLASSEN.indexOf(b)];
}

/** Zelle der Tabelle für zwei Lagerklassen (null, wenn eine fehlt oder unbekannt ist). */
export function zelle(a: unknown, b: unknown): Zelle | null {
  const x = zlKlasse(a);
  const y = zlKlasse(b);
  if (!x || !y) return null;
  const z = zeichen(x, y);
  if (z === '+') return { art: 'erlaubt' };
  if (z === '-') return { art: 'getrennt' };
  const nr = Number(z);
  return Number.isInteger(nr) && nr >= 1 && nr <= 8 ? { art: 'bedingt', nr } : { art: 'getrennt' };
}

export type Stufe = 'gruen' | 'gelb' | 'rot' | 'grau';
const RANG: Record<Stufe, number> = { grau: 0, gruen: 1, gelb: 2, rot: 3 };

export type Stoff = { id?: string; bezeichnung?: string | null; lagerklasse?: string | null };
export type Konflikt = { a: string; b: string; ka: ZlKlasse; kb: ZlKlasse; stufe: 'gelb' | 'rot'; nr: number | null };
export type PlatzAmpel = { stufe: Stufe; konflikte: Konflikt[]; ohneKlasse: string[]; anzahl: number };

/**
 * Ampel für die Stoffe an EINEM Lagerplatz: schlechtestes Paar entscheidet.
 * Gleiche Klasse zählt wie jedes andere Paar (Diagonale der Tabelle).
 * Ohne Lagerklasse: nicht bewertet, Stufe höchstens „grau", wenn sonst nichts zu prüfen ist.
 */
export function platzAmpel(stoffe: Stoff[] | null | undefined): PlatzAmpel {
  const liste = (stoffe ?? []).filter(Boolean);
  const name = (s: Stoff) => String(s.bezeichnung ?? '').trim() || 'ohne Bezeichnung';
  const ohneKlasse = liste.filter((s) => !zlKlasse(s.lagerklasse)).map(name);
  const mit = liste.filter((s) => zlKlasse(s.lagerklasse));
  const konflikte: Konflikt[] = [];
  let stufe: Stufe = mit.length >= 1 ? 'gruen' : 'grau';
  for (let i = 0; i < mit.length; i++) {
    for (let j = i + 1; j < mit.length; j++) {
      const ka = zlKlasse(mit[i].lagerklasse) as ZlKlasse;
      const kb = zlKlasse(mit[j].lagerklasse) as ZlKlasse;
      // schlechtere der beiden Richtungen (die Tabelle ist symmetrisch — doppelt sicher)
      const z1 = zelle(ka, kb) as Zelle;
      const z2 = zelle(kb, ka) as Zelle;
      const z = bewerte(z1) >= bewerte(z2) ? z1 : z2;
      if (z.art === 'erlaubt') continue;
      const s: 'gelb' | 'rot' = z.art === 'getrennt' ? 'rot' : 'gelb';
      konflikte.push({ a: name(mit[i]), b: name(mit[j]), ka, kb, stufe: s, nr: z.art === 'bedingt' ? z.nr : null });
      if (RANG[s] > RANG[stufe]) stufe = s;
    }
  }
  konflikte.sort((x, y) => RANG[y.stufe] - RANG[x.stufe] || x.a.localeCompare(y.a, 'de') || x.b.localeCompare(y.b, 'de'));
  return { stufe, konflikte, ohneKlasse, anzahl: liste.length };
}

function bewerte(z: Zelle): number {
  return z.art === 'getrennt' ? 2 : z.art === 'bedingt' ? 1 : 0;
}

/** Ein Satz je Konflikt — ohne Wortlaut der Bedingungen (siehe Kopf). */
export function konfliktText(k: Konflikt): string {
  const paar = `„${k.a}" (LGK ${k.ka}) und „${k.b}" (LGK ${k.kb})`;
  return k.stufe === 'rot'
    ? `${paar}: Separatlagerung erforderlich (TRGS 510 Abschnitt 13).`
    : `${paar}: nur eingeschränkt zusammen lagern — Bedingung Nr. ${k.nr} der Zusammenlagerungstabelle (TRGS 510 Abschnitt 13) prüfen.`;
}

export const STUFE_TEXT: Record<Stufe, string> = {
  gruen: 'Zusammenlagerung nach Tabelle erlaubt',
  gelb: 'Nur mit Bedingungen',
  rot: 'Separatlagerung nötig',
  grau: 'Keine Lagerklassen eingetragen',
};
