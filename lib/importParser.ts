// ============================================================================
// ARGONAUT OS · lib/importParser.ts — Herz des Import-Centers (Stufe 2)
//
// Vier Aufgaben, alle als reine Funktionen (node-testbar, keine Imports):
//   1. CSV zerlegen — Trennzeichen, Anfuehrungszeichen und BOM selbst erkennen
//   2. Werte deutsch verstehen — "1.234,50" ist eine Zahl, "15.08.2026" ein Datum
//   3. Spalten erraten — "Firmenname" gehoert zum Feld "firma", "Mail" zu "email"
//   4. Zeilen pruefen — was fehlt, was ist unbrauchbar, was wird uebernommen
//
// Excel (.xlsx) wird NICHT hier gelesen, sondern serverseitig mit exceljs
// (bereits im Projekt vorhanden) — dort faellt am Ende dieselbe Struktur an:
// eine Kopfzeile plus Zeilen als Text. Ab da laeuft alles durch diese Datei.
//
// ▄▄▄ PUNKT 63 (21.09.2026) — DEN PARSER HAERTEN ▄▄▄
//
// Die Datei hatte bis heute KEINEN Test. Fuenf Befunde, alle am echten Code
// nachgesehen — einer davon stimmte so nicht, das steht unten dabei.
//
//  1. EIN ANFUEHRUNGSZEICHEN MITTEN IM FELD FRISST DIE SPALTE.
//     `if (c === '"') { inAnf = true; }` galt an JEDER Stelle. Ein Artikel
//     `Schraube 5" lang` schaltete mitten im Feld in den Anfuehrungsmodus;
//     ab da wurden Trennzeichen ignoriert, und die halbe Zeile rutschte in
//     eine Spalte. GEMESSEN am Artikelstamm eines Schraubenhaendlers — dort
//     steht das Zoll-Zeichen in fast jeder zweiten Bezeichnung.
//     Ein Anfuehrungszeichen ist jetzt nur am FELDANFANG ein Begrenzer.
//
//  2. "5,00 EUR" WURDE 0,00 EUR.
//     Der eigene Leser entfernte €, $, % und Leerzeichen — aber nicht das
//     Wort "EUR". Uebrig blieb "5.00EUR", Number() sagte NaN, und
//     pruefeZeile machte daraus still den Standardwert 0. Bei einer offenen
//     Rechnung ueber 5.000 EUR heisst das: sie kommt mit 0,00 EUR an und
//     gilt als bezahlt. REPARIERT durch Anschluss an lib/zahlen.ts, der
//     Waehrungswoerter, DATEV-Nachzeichen ("1.234,56-") und
//     Buchhalter-Klammern ("(1.234,56)") laengst kennt. Damit ist auch
//     Punkt 12 fuer diese Datei erledigt — sie war eine der siebzehn mit
//     eigenem Zahl-Leser.
//
//  3. "12,345" WURDE 12,345 STATT 12.345 (FAKTOR 1000).
//     Der alte Leser hatte fuer den PUNKT eine Tausenderregel ("1.234" ->
//     1234), fuer das KOMMA aber nicht. Deutsch gelesen ist "12,345"
//     richtig zwoelfkommadreivierfuenf; in einer englischen Datei sind es
//     zwoelftausend. Das laesst sich an EINER Zelle nicht entscheiden —
//     wohl aber an der Spalte. NEU: rateDezimaltrenner() sieht sich alle
//     Werte an und entscheidet einmal fuer die ganze Datei; bleibt es
//     mehrdeutig, wird es GEMELDET statt geraten.
//
//  4. DAS US-DATUM WURDE NICHT LEER, SONDERN STILL FALSCH.
//     Die Liste sagte "wird leer". Das stimmt nur fuer "08/15/2026" (Monat
//     15 gibt es nicht). Der gefaehrliche Fall ist "05/08/2026": das wurde
//     klaglos als 5. August gelesen, gemeint war der 8. Mai. Eine falsche
//     Faelligkeit um drei Monate, ohne jede Meldung. NEU: das Schraegstrich-
//     Format gilt als mehrdeutig und wird gemeldet, solange die Datei nicht
//     sagt, welche Reihenfolge gilt.
//
//  5. "1.1.69" WURDE 2069.
//     Die Grenze lag fest bei 70. Ein Rechnungsdatum in der Zukunft ist
//     immer falsch; jetzt entscheidet das laufende Jahr, und ein Datum, das
//     dadurch in der Zukunft laege, faellt ins vorige Jahrhundert.
//
//  6. KEINE GROESSENGRENZE — NUR HALB RICHTIG.
//     app/api/import/lesen/route.ts hat sehr wohl welche (12 MB, 5.000
//     Zeilen, Z. 20-21). Aber sie greifen NACH dem Parsen: leseCsv laeuft
//     erst ueber die vollen 12 MB. Die Bibliothek bekommt deshalb eigene
//     Grenzen, damit sie auch dort sicher ist, wo keine Route davorsteht.
//
//  7. GUTSCHRIFTEN RUNDETEN UNSYMMETRISCH (Rest aus Punkt 30).
//     nachbereiten() rechnete mit dem nackten Math.round. Bei einer
//     Gutschrift mit negativen Summen rundet das in die falsche Richtung.
//     Jetzt centRunden aus lib/zahlen.ts.
//
//  8. DER STEUERSATZ 19 % STAND FEST IM CODE (eigener Befund).
//     Wird nur ein Bruttobetrag geliefert, rechnete die Datei mit 1,19
//     zurueck — bei einem Buchhaendler oder Baecker ist das falsch, und die
//     Warnung nannte den Satz nicht einmal. Jetzt ist er eine EINGABE mit
//     19 % als Standard, und die Warnung sagt, mit welchem Satz gerechnet
//     wurde.
// ============================================================================

import { leseZahl as leseZahlGemeinsam, leseZahlMitTrenner, centRunden } from './zahlen';
import { datumPlusMonate } from './wiederkehr';

// ---------------------------------------------------------------------------
// 1) CSV zerlegen
// ---------------------------------------------------------------------------

export type Tabelle = {
  kopf: string[];
  zeilen: string[][];
  trennzeichen: string;
  /** Was beim Lesen aufgefallen ist — abgeschnittene Daten, Grenzen, Auffaelliges. */
  hinweise: string[];
};

/**
 * Grenzen der BIBLIOTHEK. Die Route hat eigene (12 MB, 5.000 Zeilen), aber
 * die greifen erst danach — und wer leseCsv anderswo aufruft, hat gar keine.
 * Ueberschreiten bricht nicht ab: es wird abgeschnitten und GEMELDET.
 */
export const GRENZEN = {
  zeichen: 20 * 1024 * 1024,
  zeilen: 200000,
  spalten: 512,
  feldZeichen: 100000,
} as const;

const KANDIDATEN = [';', ',', '\t', '|'];

/**
 * Rät das Trennzeichen: gewinnt, wer in den ersten Zeilen am gleichmaessigsten
 * vorkommt. Deutsche Excel-Exporte nutzen Semikolon, englische Komma —
 * ein falsches Raten macht aus einer Preisliste Datenmuell, deshalb wird die
 * Gleichmaessigkeit geprueft und nicht nur die Haeufigkeit.
 */
export function rateTrennzeichen(text: string): string {
  const zeilen = text.split(/\r?\n/).filter((z) => z.trim().length > 0).slice(0, 12);
  if (zeilen.length === 0) return ';';

  let bestes = ';';
  let besteWertung = -1;

  for (const kandidat of KANDIDATEN) {
    const zahlen = zeilen.map((z) => zaehleAusserhalbAnfuehrung(z, kandidat));
    const erste = zahlen[0];
    if (erste === 0) continue;
    const gleich = zahlen.filter((n) => n === erste).length / zahlen.length;
    const wertung = gleich * 100 + Math.min(erste, 40);
    if (wertung > besteWertung) { besteWertung = wertung; bestes = kandidat; }
  }
  return bestes;
}

function zaehleAusserhalbAnfuehrung(zeile: string, zeichen: string): number {
  let n = 0, inAnf = false;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') { inAnf = !inAnf; continue; }
    if (!inAnf && c === zeichen) n++;
  }
  return n;
}

/**
 * Zerlegt CSV-Text in Kopf + Zeilen. Beherrscht Anfuehrungszeichen,
 * doppelte Anfuehrungszeichen als Escape ("" = ") und Zeilenumbrueche
 * innerhalb eines Feldes — genau das, woran einfache split()-Parser scheitern.
 */
export function leseCsv(rohtext: string, trennzeichen?: string): Tabelle {
  const hinweise: string[] = [];

  let text = String(rohtext ?? '').replace(/^﻿/, '');          // BOM weg
  if (text.length > GRENZEN.zeichen) {
    text = text.slice(0, GRENZEN.zeichen);
    hinweise.push(
      `Die Datei ist größer als ${Math.round(GRENZEN.zeichen / 1024 / 1024)} MB und wurde abgeschnitten. ` +
        'Bitte in kleineren Teilen importieren — sonst fehlen Zeilen, ohne dass es auffällt.',
    );
  }

  const tz = trennzeichen || rateTrennzeichen(text);

  const alleZeilen: string[][] = [];
  let feld = '';
  let zeile: string[] = [];
  let inAnf = false;
  /** Nur am Feldanfang ist ein Anführungszeichen ein Begrenzer. */
  let feldAnfang = true;
  let zuLangeFelder = 0;
  let abgeschnitten = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inAnf) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++; }
        else { inAnf = false; feldAnfang = false; }
      } else if (feld.length >= GRENZEN.feldZeichen) {
        // Der gefaehrlichste Fall ueberhaupt: ein nie geschlossenes
        // Anfuehrungszeichen. Ohne diese Bremse frisst EIN Feld den ganzen
        // Rest der Datei — dieselbe Wirkung wie Befund 1, nur von der
        // anderen Seite. Der erste Entwurf hatte die Pruefung nur im
        // Nicht-Anfuehrungs-Zweig; der Test hat es gefangen.
        zuLangeFelder++;
      } else feld += c;
      continue;
    }

    // BEFUND 1: früher galt das hier an JEDER Stelle im Feld.
    // `Schraube 5" lang` schaltete mitten im Text in den Anführungsmodus und
    // verschluckte die folgenden Trennzeichen. Jetzt zählt es nur, solange
    // im Feld noch kein Zeichen steht.
    if (c === '"' && feldAnfang && feld === '') { inAnf = true; continue; }

    if (c === tz) {
      zeile.push(feld); feld = ''; feldAnfang = true;
      if (zeile.length > GRENZEN.spalten) { abgeschnitten = true; break; }
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      zeile.push(feld); alleZeilen.push(zeile); zeile = []; feld = ''; feldAnfang = true;
      if (alleZeilen.length >= GRENZEN.zeilen) { abgeschnitten = true; break; }
      continue;
    }
    if (feld.length >= GRENZEN.feldZeichen) { zuLangeFelder++; continue; }
    feld += c;
    feldAnfang = false;
  }
  if (feld.length > 0 || zeile.length > 0) { zeile.push(feld); alleZeilen.push(zeile); }

  if (abgeschnitten) {
    hinweise.push(
      `Die Datei hat mehr als ${GRENZEN.zeilen.toLocaleString('de-DE')} Zeilen oder ` +
        `${GRENZEN.spalten} Spalten und wurde abgeschnitten.`,
    );
  }
  if (zuLangeFelder > 0) {
    hinweise.push(
      `${zuLangeFelder} Feld${zuLangeFelder === 1 ? '' : 'er'} war zu lang und wurde gekürzt — ` +
        'meist ein fehlendes schließendes Anführungszeichen in der Datei.',
    );
  }

  const gefuellt = alleZeilen.filter((z) => z.some((f) => f.trim().length > 0));
  if (gefuellt.length === 0) return { kopf: [], zeilen: [], trennzeichen: tz, hinweise };

  const kopf = (gefuellt[0] ?? []).map((h) => h.trim());
  let zuVieleSpalten = 0;
  const zeilen = gefuellt.slice(1).map((z) => {
    const kopie = z.map((f) => f.trim());
    if (kopie.length > kopf.length) zuVieleSpalten++;
    while (kopie.length < kopf.length) kopie.push('');
    return kopie;
  });
  if (zuVieleSpalten > 0) {
    hinweise.push(
      `${zuVieleSpalten} Zeile${zuVieleSpalten === 1 ? '' : 'n'} hat mehr Spalten als die Kopfzeile. ` +
        'Die zusätzlichen Werte werden nicht übernommen — meist ein Trennzeichen mitten im Text.',
    );
  }

  return { kopf, zeilen, trennzeichen: tz, hinweise };
}

// ---------------------------------------------------------------------------
// 2) Werte deutsch verstehen
// ---------------------------------------------------------------------------

/** Welches Zeichen in DIESER Datei das Dezimaltrennzeichen ist. */
export type Dezimaltrenner = ',' | '.' | 'unbekannt';

/**
 * "1.234,50" · "1234.50" · "1 234,50 EUR" · "5,00 EUR" · "(1.234,56)" ·
 * "1.234,56-" -> Zahl. Sonst null.
 *
 * BEFUND 2: Der eigene Leser kannte das Wort "EUR" nicht und machte aus
 * "5,00 EUR" ein NaN, aus dem pruefeZeile still eine 0 baute. Statt den
 * Leser zu flicken, ruft diese Funktion jetzt den GEMEINSAMEN aus
 * lib/zahlen.ts — dieselbe Zahl wird damit im Import so gelesen wie im
 * Bankabgleich, im DATEV-Export und in der Rechnung. Damit ist auch Punkt 12
 * fuer diese Datei erledigt.
 *
 * `dezimal` kommt aus rateDezimaltrenner() und gilt fuer die ganze Datei.
 * Ohne Angabe gilt die deutsche Lesart, genau wie bisher.
 */
export function leseZahl(wert: unknown, dezimal: Dezimaltrenner = 'unbekannt'): number | null {
  if (dezimal === ',' || dezimal === '.') return leseZahlMitTrenner(wert, dezimal);
  return leseZahlGemeinsam(wert);
}

export type TrennerBefund = {
  dezimal: Dezimaltrenner;
  sicher: boolean;
  /** Werte, die je nach Lesart etwas anderes bedeuten. */
  mehrdeutige: string[];
  hinweis: string | null;
};

/**
 * BEFUND 3: An EINER Zelle laesst sich "12,345" nicht entscheiden — deutsch
 * sind es zwoelfkommadreivierfuenf, englisch zwoelftausend. An der SPALTE
 * schon: wer irgendwo "1.234,56" schreibt, meint deutsch; wer "1,234.56"
 * schreibt, meint englisch.
 *
 * Gibt 'unbekannt' zurueck, wenn die Datei es nicht hergibt. Dann wird
 * deutsch gelesen UND gemeldet — geraten wird nicht.
 */
export function rateDezimaltrenner(werte: readonly string[]): TrennerBefund {
  let deutsch = 0;
  let englisch = 0;
  const mehrdeutige: string[] = [];

  for (const roh of werte) {
    const s = String(roh ?? '').trim();
    if (s === '') continue;
    const hatKomma = s.includes(',');
    const hatPunkt = s.includes('.');

    if (hatKomma && hatPunkt) {
      // Beide da: das HINTERE ist das Dezimaltrennzeichen. Eindeutig.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) deutsch++;
      else englisch++;
      continue;
    }
    // Genau ein Trennzeichen mit drei Ziffern dahinter ist der strittige Fall.
    if (/^-?\d{1,3},\d{3}$/.test(s) || /^-?\d{1,3}\.\d{3}$/.test(s)) {
      if (mehrdeutige.length < 5) mehrdeutige.push(s);
      continue;
    }
    // Ein Komma mit ein oder zwei Nachkommastellen ist deutsch typisch,
    // ein Punkt mit ein oder zwei englisch typisch — aber nur ein Indiz.
    if (/^-?\d+,\d{1,2}$/.test(s)) deutsch++;
    else if (/^-?\d+\.\d{1,2}$/.test(s)) englisch++;
  }

  if (deutsch > 0 && englisch === 0) {
    return { dezimal: ',', sicher: true, mehrdeutige, hinweis: null };
  }
  if (englisch > 0 && deutsch === 0) {
    return {
      dezimal: '.',
      sicher: true,
      mehrdeutige,
      hinweis: 'Die Datei nutzt die englische Schreibweise (1,234.56). Zahlen werden entsprechend gelesen.',
    };
  }
  if (deutsch > 0 && englisch > 0) {
    return {
      dezimal: deutsch >= englisch ? ',' : '.',
      sicher: false,
      mehrdeutige,
      hinweis:
        `In der Datei stehen BEIDE Schreibweisen (${deutsch} deutsch, ${englisch} englisch). ` +
        `Gelesen wird ${deutsch >= englisch ? 'deutsch' : 'englisch'} — bitte die Beträge stichprobenweise prüfen.`,
    };
  }
  if (mehrdeutige.length > 0) {
    return {
      dezimal: 'unbekannt',
      sicher: false,
      mehrdeutige,
      hinweis:
        `Werte wie ${mehrdeutige.slice(0, 3).map((m) => '"' + m + '"').join(', ')} sind mehrdeutig: ` +
        'deutsch gelesen sind es Nachkommastellen, englisch Tausender. ' +
        'Gelesen wird deutsch — bei einer englischen Datei wären die Beträge tausendfach zu klein.',
    };
  }
  return { dezimal: 'unbekannt', sicher: true, mehrdeutige, hinweis: null };
}

export type DatumErgebnis = {
  /** "2026-08-15" oder null. */
  datum: string | null;
  /** Das Format liess zwei Lesarten zu (Tag/Monat gegen Monat/Tag). */
  mehrdeutig: boolean;
  /** Die andere Lesart, falls es eine gibt — fuer die Meldung. */
  andereLesart: string | null;
};

/**
 * "15.08.2026" · "15.8.26" · "2026-08-15" · "15/08/2026" -> "2026-08-15".
 *
 * BEFUND 4: Der gefaehrliche Fall ist NICHT "08/15/2026" (Monat 15 gibt es
 * nicht, das fiel schon vorher durch). Es ist "05/08/2026": klaglos als
 * 5. August gelesen, gemeint war in einer US-Datei der 8. Mai. Eine
 * Faelligkeit drei Monate daneben, ohne jede Meldung.
 *
 * BEFUND 5: Die Jahrhundertgrenze lag fest bei 70. "1.1.69" wurde 2069.
 * Jetzt entscheidet das laufende Jahr.
 */
export function leseDatumGenau(wert: unknown, heute: Date = new Date()): DatumErgebnis {
  const leer: DatumErgebnis = { datum: null, mehrdeutig: false, andereLesart: null };
  if (wert === null || wert === undefined) return leer;
  const s = String(wert).trim();
  if (s === '') return leer;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return { datum: baue(Number(iso[1]), Number(iso[2]), Number(iso[3])), mehrdeutig: false, andereLesart: null };

  const teile = s.match(/^(\d{1,2})([.\/-])(\d{1,2})\2(\d{2,4})/);
  if (!teile) return leer;

  const a = Number(teile[1]);
  const trenner = teile[2];
  const b = Number(teile[3]);
  const jahr = jahrhundert(Number(teile[4]), heute);

  const alsTagMonat = baue(jahr, b, a);   // deutsch: Tag.Monat.Jahr
  const alsMonatTag = baue(jahr, a, b);   // englisch: Monat/Tag/Jahr

  // Der Punkt ist in Deutschland eindeutig. Nur Schraegstrich und Bindestrich
  // werden in beiden Welten benutzt.
  if (trenner === '.') return { datum: alsTagMonat, mehrdeutig: false, andereLesart: null };

  if (alsTagMonat && alsMonatTag && alsTagMonat !== alsMonatTag) {
    return { datum: alsTagMonat, mehrdeutig: true, andereLesart: alsMonatTag };
  }
  if (alsTagMonat) return { datum: alsTagMonat, mehrdeutig: false, andereLesart: null };
  // "08/15/2026": als Tag.Monat unlesbar, als Monat/Tag eindeutig.
  if (alsMonatTag) return { datum: alsMonatTag, mehrdeutig: false, andereLesart: null };
  return leer;

  function baue(j: number, m: number, t: number): string | null {
    if (m < 1 || m > 12 || t < 1 || t > 31 || j < 1900 || j > 2200) return null;
    const d = new Date(Date.UTC(j, m - 1, t));
    if (d.getUTCMonth() !== m - 1 || d.getUTCDate() !== t) return null;   // 31.02. faengt sich hier
    return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
  }
}

/**
 * Wie weit ein zweistelliges Jahr in der Zukunft liegen darf, bevor es ins
 * vorige Jahrhundert faellt.
 *
 * Die Zahl ist eine ENTSCHEIDUNG, keine Wahrheit, und sie hat zwei Seiten:
 * zu klein, und eine Faelligkeit "31.12.28" landet 1928; zu gross, und ein
 * Geburtsdatum "1.1.69" bleibt 2069. Zehn Jahre decken jedes realistische
 * Zahlungsziel und jede Gewaehrleistungsfrist ab und halten den gemeldeten
 * Fall trotzdem sauber.
 */
export const ZUKUNFT_JAHRE = 10;

/**
 * Zweistelliges Jahr aufs Jahrhundert bringen.
 *
 * BEFUND 5: Die Grenze lag FEST bei 70 — "1.1.69" wurde 2069, ein
 * Geburtsdatum also hundert Jahre daneben. Feste Grenzen veralten ohnehin:
 * 2070 haette dieselbe Zeile wieder falsch gerechnet. Jetzt entscheidet das
 * laufende Jahr plus ZUKUNFT_JAHRE.
 *
 * Gegenprobe zum alten Verhalten, damit nichts schlechter wird: "1.1.28"
 * ergab alt 2028 und ergibt neu 2028; nur "1.1.69" aendert sich, und genau
 * das war der Befund.
 */
export function jahrhundert(zweistellig: number, heute: Date = new Date()): number {
  if (zweistellig >= 100) return zweistellig;
  const jetzt = heute.getUTCFullYear();
  const grenze = (jetzt + ZUKUNFT_JAHRE) % 100;
  return zweistellig <= grenze ? 2000 + zweistellig : 1900 + zweistellig;
}

/**
 * Paket 128: Datum mit Uhrzeit — „12.10.2026 18:00", „2026-10-12 18:00:00",
 * „2026-10-12T18:00". Ergebnis wie ein datetime-local-Feld: „2026-10-12T18:00"
 * (ohne Uhrzeit nur „2026-10-12"). null = unlesbar.
 */
export function leseDatumZeit(wert: unknown, heute: Date = new Date()): string | null {
  const s = String(wert ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(.+?)(?:[ T,]+(\d{1,2})[:.](\d{2})(?::\d{2}(?:\.\d+)?)?\s*(?:uhr)?)?(?:z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  const d = leseDatumGenau(m[1], heute).datum;
  if (!d) return null;
  if (m[2] === undefined) return d;
  const h = Number(m[2]); const min = Number(m[3]);
  if (h > 23 || min > 59) return null;
  return `${d}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Paket 128: Datum + Monate — dieselbe Rechnung wie die Module (lib/wiederkehr, Monatsende bleibt im Monat). */
export function plusMonate(iso: string, monate: number): string {
  return datumPlusMonate(iso, monate);
}

/** Wie bisher: nur das Datum, ohne die Mehrdeutigkeit. */
export function leseDatum(wert: unknown, heute: Date = new Date()): string | null {
  return leseDatumGenau(wert, heute).datum;
}
/** "ja" · "x" · "1" · "wahr" · "true" → true · "nein" · "0" · "" → false. */
export function leseJaNein(wert: unknown, standard = false): boolean {
  const s = String(wert ?? '').trim().toLowerCase();
  if (s === '') return standard;
  return ['ja', 'j', 'x', '1', 'true', 'wahr', 'yes', 'y', 'aktiv'].includes(s);
}

// ---------------------------------------------------------------------------
// 3) Die Ziele: welche Felder gibt es, wie heissen sie in fremden Dateien
// ---------------------------------------------------------------------------

/** 'datumZeit' (Paket 128): „12.10.2026 18:00" -> „2026-10-12T18:00" (wie die Module es speichern). */
export type FeldTyp = 'text' | 'zahl' | 'datum' | 'jaNein' | 'datumZeit';

export type ZielFeld = {
  key: string;
  label: string;
  typ: FeldTyp;
  pflicht?: boolean;
  hinweis?: string;
  /** Schreibweisen, unter denen dieses Feld in fremden Dateien auftaucht. */
  alias: string[];
  standard?: string | number | boolean;
  /**
   * Schritt 2 (27.09.2026): Diese Spalte gibt es erst mit dem SQL von
   * Paket 124 (oder nur in manchen Datenbanken). Der Motor bietet das Feld nur
   * an, wenn der Feldkatalog aus der Datenbank es bestaetigt — sonst wuerde
   * das Einspielen an einer fehlenden Spalte scheitern.
   */
  neu?: boolean;
  /**
   * Kein eigenes Datenbankfeld: wird beim Pruefen in echte Felder umgesetzt.
   *   name_zerlegen — „Müller, Anna" -> vorname/nachname (oder firma)
   *   adresse_teil  — Straße / PLZ / Ort -> das eine Feld „adresse"
   */
  virtuell?: 'name_zerlegen' | 'adresse_teil' | 'kunde_verweis' | 'name_teil' | 'anhang' | 'preis' | 'filter' | 'position' | 'nachschlag';
  /**
   * Paket 127: bei virtuell 'position' — die Spalte in der Positionen-Tabelle
   * (ziel.kinder.tabelle). null = nur zur Kontrolle (z. B. Gesamtpreis, der
   * aus Menge x Einzelpreis nachgerechnet wird).
   */
  positionSpalte?: string | null;
  /**
   * Schritt 3: bei virtuell 'anhang' — an welches Textfeld der Wert als
   * „Label: Wert" angehaengt wird (z. B. Bearbeiter an den Inhalt einer
   * Aktivitaet). So bleibt eine Spalte sichtbar, fuer die es kein Feld gibt.
   */
  anhangAn?: string;
  /** Nicht als Spalte in die Mustervorlage (z. B. virtuelle Felder). */
  nichtInVorlage?: boolean;
  /**
   * Nur bei exakt gleichem Spaltennamen zuordnen, nie per Teiltreffer —
   * fuer Felder, die nur die Datenbank kennt (deren Namen sind technisch
   * und wuerden sonst zufaellig passen).
   */
  nurExakt?: boolean;
};

export type ImportZiel = {
  key: string;
  label: string;
  icon: string;
  tabelle: string;
  beschreibung: string;
  /** Feld, ueber das Dubletten erkannt werden (leer = keine Dublettenpruefung). */
  schluessel?: string;
  /**
   * Schritt 2: ALLE Felder, an denen ein vorhandener Eintrag erkannt wird —
   * in dieser Reihenfolge. Ein Treffer in irgendeinem genuegt. Bei Kunden
   * aus DATEV fehlt oft die E-Mail, die Kundennummer (Debitorenkonto) nie.
   */
  schluesselFelder?: string[];
  /** Modul-Schluessel fuer „Eigene Felder" (eigenes_feld.modul). */
  eigeneFelderModul?: string;
  /**
   * Schritt 3: Dieses Ziel wird nur angeboten, wenn der Feldkatalog aus der
   * Datenbank die Tabelle kennt (SQL Paket 125). Ohne Katalog waere nicht
   * sicher, welche Spalten es gibt.
   */
  nurMitKatalog?: boolean;
  /**
   * Schritt 3: Verknuepfung mit dem Kunden. Der Motor sucht den Kontakt ueber
   * Kundennummer, E-Mail, Firmen- oder Personennamen und schreibt dessen id in
   * `spalte` (und die Firma in `firmaSpalte`). `pflicht`: ohne Kunden keine Zeile.
   * `ausFeldern`: echte Felder, deren Wert zugleich als Kunde gilt (kunde_name).
   * `textSuche`: Felder, in denen eine bekannte Kundennummer stehen kann
   * („Kunde K-1008 …" in den Notizen einer Offenen-Posten-Liste).
   */
  kundeVerweis?: {
    spalte: string; firmaSpalte?: string; pflicht?: boolean; ausFeldern?: string[]; textSuche?: string[];
    /**
     * Paket 127: WORAUF verwiesen wird. Standard: die Kunden (kontakte).
     * 'mitarbeiter' (Qualifikationen: ueber Personalnummer als Eigenes Feld,
     * E-Mail oder Namen), 'lieferanten' (Bestellungen).
     */
    quelle?: 'kontakte' | 'mitarbeiter' | 'lieferanten';
    /** Anzeige: „Mitarbeiter", „Lieferant" (Standard „Kunde"). */
    label?: string;
    /** Anzeige Mehrzahl: „die Mitarbeiter" (Standard „die Kunden"). */
    mehrzahl?: string;
  };
  /**
   * Paket 127: Eine Datei-Zeile ist eine POSITION; Zeilen mit gleichem
   * Kopf-Feld (Bestellnummer) werden zu einem Beleg gruppiert. Die Positionen
   * landen in kinder.tabelle, verknuepft ueber kinder.fremdschluessel.
   */
  kinder?: { tabelle: string; fremdschluessel: string; kopfFeld: string };
  /**
   * Paket 128: Wertelisten je Feld (Status, Art, Typ …) — allgemein statt je
   * Ziel eigener Code. Schluessel sind vereinheitlicht (normal()). Unbekannt
   * -> Standard; der alte Wert wandert als „Label im Altsystem: X" in textFeld.
   */
  listen?: { feld: string; liste: Record<string, string>; standard: string; textFeld?: string; label: string }[];
  /**
   * Paket 128: Folgedatum rechnen, wenn es fehlt (naechste Kontrolle =
   * letzte + Intervall), genau wie das Modul es beim Anlegen tut.
   */
  folgeDatum?: { ziel: string; aus: string; monateFeld: string }[];
  /**
   * Paket 128: Verweis ueber einen NAMEN in eine Nebentabelle (Gruppe eines
   * Objekts, Objekt eines Pruefprotokolls). Die Seite sucht `nameSpalte` in
   * `tabelle` (genau, ohne Gross/Klein) und schreibt die id nach `spalte`;
   * `anlegen`: fehlende Eintraege werden angelegt. Kein Treffer -> der Name
   * steht in `textFeld` — nichts verschluckt.
   */
  nachschlag?: { ausFeld: string; tabelle: string; nameSpalte: string; spalte: string; anlegen?: boolean; textFeld?: string; label: string };
  /** Wohin nach dem Import geschaut wird. */
  ergebnisHref?: string;
  /**
   * Schritt 3 Teil 2: Datenbank-Spalten, die der Katalog NICHT als Feld
   * anbieten darf (Rechte, Zugaenge, Spalten einer anderen Nutzung derselben
   * Tabelle).
   */
  ausblenden?: string[];
  /**
   * Spalten, die in diesem Ziel gesperrt sind — `muster` ist ein regulaerer
   * Ausdruck auf den vereinheitlichten Spaltennamen (siehe normal()).
   */
  sperren?: { muster: string; grund: string }[];
  /** Nur der Chef darf diese Daten anlegen (die Datenbank-Regeln verlangen es ohnehin). */
  nurChef?: boolean;
  /**
   * Zeilen mit diesem Wert in einem Filterfeld fallen mit Grund heraus —
   * z. B. „Angebot" in einer gemischten Auftrags-/Angebotsliste.
   */
  ablehnenWenn?: { feld: string; werte: string[]; grund: string };
  felder: ZielFeld[];
};

/** Das Kunden-Verweisfeld — gleich fuer alle Ziele mit kundeVerweis. */
const KUNDE_FELD: ZielFeld = {
  key: 'kunde', label: 'Kunde (Nummer, Name oder E-Mail)', typ: 'text', virtuell: 'kunde_verweis',
  hinweis: 'Wird mit Ihren Kunden in ARGONAUT verknüpft — über Kundennummer, E-Mail oder den genauen Namen.',
  alias: ['kunde', 'kundenname', 'kunden name', 'customer', 'client', 'rechnungsempfaenger', 'empfaenger', 'auftraggeber', 'firma'],
};
/**
 * Die Kundennummer zum Verknuepfen — eigenes Feld, weil viele Listen Nummer
 * UND Namen fuehren. Die Nummer zaehlt zuerst, der Name nur, wenn sie fehlt.
 */
const KUNDE_NR_FELD: ZielFeld = {
  key: 'kunde_nummer', label: 'Kundennummer (zum Verknüpfen)', typ: 'text', virtuell: 'kunde_verweis', nichtInVorlage: true,
  alias: ['kundennummer', 'kundennr', 'kunden-nr', 'kunden nr', 'kd-nr', 'kdnr', 'debitor', 'debitorennummer', 'debitorenkonto', 'konto', 'customer number', 'customer id', 'customer no'],
};

/**
 * Paket 128: Werteliste aus den erlaubten Werten + Synonymen bauen
 * (Schluessel vereinheitlicht wie normal(), ohne Leerzeichen-Variante).
 */
function liste(erlaubt: readonly string[], synonyme: Record<string, string> = {}): Record<string, string> {
  const raus: Record<string, string> = {};
  const n = (x: string) => String(x).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
  for (const w of erlaubt) { raus[n(w)] = w; raus[n(w).replace(/\s+/g, '')] = w; }
  for (const [k, v] of Object.entries(synonyme)) { raus[n(k)] = v; raus[n(k).replace(/\s+/g, '')] = v; }
  return raus;
}

export const ZIELE: ImportZiel[] = [
  {
    key: 'kontakte',
    label: 'Kunden & Kontakte',
    icon: '🤝',
    tabelle: 'kontakte',
    beschreibung: 'Kundenliste aus der alten Software oder aus Excel ins CRM übernehmen.',
    schluessel: 'email',
    schluesselFelder: ['kundennummer', 'import_schluessel', 'email'],
    eigeneFelderModul: 'kontakte',
    felder: [
      { key: 'kundennummer', label: 'Kundennummer', typ: 'text', neu: true, alias: ['kundennummer', 'kundennr', 'kunden-nr', 'kunden nr', 'kd-nr', 'kdnr', 'debitor', 'debitorennummer', 'debitorenkonto', 'customer number', 'customer id', 'customer no'] },
      { key: 'anrede', label: 'Anrede', typ: 'text', neu: true, alias: ['anrede', 'salutation', 'briefanrede'] },
      { key: 'firma', label: 'Firma', typ: 'text', alias: ['firma', 'firmenname', 'unternehmen', 'company', 'company name', 'kunde', 'kundenname', 'name der firma', 'organisation', 'organization', 'organization name', 'account name'] },
      { key: 'vorname', label: 'Vorname', typ: 'text', alias: ['vorname', 'first name', 'firstname', 'given name', 'rufname'] },
      { key: 'nachname', label: 'Nachname', typ: 'text', alias: ['nachname', 'last name', 'lastname', 'surname', 'family name', 'familienname', 'ansprechpartner'] },
      { key: 'name_komplett', label: 'Name (wird zerlegt)', typ: 'text', virtuell: 'name_zerlegen', nichtInVorlage: true, hinweis: '„Müller, Anna" oder „Anna Müller" — wird in Vor- und Nachname zerlegt; Firmennamen (GmbH, KG …) landen bei Firma.', alias: ['name', 'full name', 'vollstaendiger name', 'kontakt', 'contact name', 'matchcode'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e mail', 'emailadresse', 'e-mail-adresse', 'email address', 'e-mail address', 'email 1 value'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone', 'phone number', 'festnetz', 'business phone', 'telefon geschaeftlich'] },
      { key: 'mobil', label: 'Mobil', typ: 'text', neu: true, alias: ['mobil', 'handy', 'mobiltelefon', 'mobilnummer', 'mobile', 'mobile phone', 'mobile phone number', 'cell', 'cell phone'] },
      { key: 'position', label: 'Position', typ: 'text', alias: ['position', 'funktion', 'rolle', 'titel', 'job title', 'jobtitel'] },
      { key: 'strasse', label: 'Straße', typ: 'text', neu: true, alias: ['strasse', 'straße', 'str', 'strasse und hausnummer', 'anschrift', 'adresse', 'street', 'street address', 'address', 'address line 1', 'addressline1', 'address1'] },
      { key: 'plz', label: 'PLZ', typ: 'text', neu: true, alias: ['plz', 'postleitzahl', 'zip', 'zip code', 'postal code', 'postcode'] },
      { key: 'ort', label: 'Ort', typ: 'text', neu: true, alias: ['ort', 'stadt', 'wohnort', 'city', 'town'] },
      { key: 'land', label: 'Land', typ: 'text', neu: true, alias: ['land', 'staat', 'country', 'country region', 'country code', 'laenderkennzeichen'] },
      { key: 'website', label: 'Website', typ: 'text', neu: true, alias: ['website', 'webseite', 'homepage', 'internet', 'url', 'web'] },
      { key: 'ust_id', label: 'USt-IdNr.', typ: 'text', neu: true, alias: ['ust-id', 'ust id', 'ustid', 'ust-idnr', 'ust idnr', 'umsatzsteuer-id', 'eu-ustid', 'vat', 'vat id', 'vat number', 'tax id'] },
      { key: 'import_schluessel', label: 'Nummer im Altsystem', typ: 'text', neu: true, hinweis: 'Die Kennung aus dem alten Programm (z. B. „Record ID") — damit ein zweiter Import denselben Eintrag wiedererkennt.', alias: ['record id', 'datensatz id', 'alt id', 'altnummer', 'id altsystem', 'externe id', 'external id', 'import id'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'interessent', hinweis: 'interessent · aktiv · kunde · inaktiv', alias: ['status', 'kundenstatus', 'lifecycle stage'] },
      { key: 'quelle', label: 'Quelle', typ: 'text', alias: ['quelle', 'herkunft', 'source', 'kanal', 'lead source'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar', 'anmerkung', 'notes', 'note'] },
    ],
  },
  {
    key: 'artikel',
    label: 'Artikel & Preise',
    icon: '📦',
    tabelle: 'artikel',
    beschreibung: 'Sortiment, Preise und Lagerbestände ins ERP laden.',
    schluessel: 'artikelnummer',
    schluesselFelder: ['artikelnummer', 'ean'],
    eigeneFelderModul: 'artikel',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'artikel', 'artikelbezeichnung', 'name', 'produkt', 'produktname', 'beschreibung kurz', 'titel'] },
      { key: 'artikelnummer', label: 'Artikelnummer', typ: 'text', alias: ['artikelnummer', 'artikelnr', 'artikel-nr', 'art nr', 'artnr', 'nummer', 'sku', 'nr', 'seller-sku', 'item number', 'product code'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'langtext', 'details', 'text'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'warengruppe', 'gruppe', 'sparte', 'rubrik'] },
      { key: 'einheit', label: 'Einheit', typ: 'text', standard: 'Stk', alias: ['einheit', 'me', 'mengeneinheit', 'verpackungseinheit', 'einh'] },
      { key: 'einkaufspreis', label: 'Einkaufspreis', typ: 'zahl', standard: 0, alias: ['einkaufspreis', 'ek', 'ek-preis', 'ekpreis', 'einkauf', 'nettoeinkauf', 'bezugspreis'] },
      { key: 'verkaufspreis', label: 'Verkaufspreis', typ: 'zahl', standard: 0, alias: ['verkaufspreis', 'vk', 'vk-preis', 'vkpreis', 'preis', 'verkauf', 'listenpreis', 'nettopreis'] },
      { key: 'aktueller_bestand', label: 'Bestand', typ: 'zahl', standard: 0, alias: ['bestand', 'aktueller bestand', 'lagerbestand', 'menge', 'stueckzahl', 'anzahl'] },
      { key: 'mindestbestand', label: 'Mindestbestand', typ: 'zahl', standard: 0, alias: ['mindestbestand', 'meldebestand', 'minbestand', 'min', 'sicherheitsbestand'] },
      { key: 'lagerort', label: 'Lagerort', typ: 'text', alias: ['lagerort', 'lagerplatz', 'regal', 'fach', 'ort'] },
      { key: 'ean', label: 'EAN / Barcode', typ: 'text', alias: ['ean', 'barcode', 'gtin', 'strichcode'] },
      { key: 'aktiv', label: 'Aktiv', typ: 'jaNein', standard: true, alias: ['aktiv', 'status', 'gesperrt'] },
    ],
  },
  {
    key: 'lieferanten',
    label: 'Lieferanten',
    icon: '🏭',
    tabelle: 'lieferanten',
    beschreibung: 'Lieferanten-Stammdaten für Einkauf und Bestellwesen.',
    schluessel: 'name',
    schluesselFelder: ['lieferantennummer', 'name'],
    eigeneFelderModul: 'lieferanten',
    felder: [
      { key: 'lieferantennummer', label: 'Lieferantennummer', typ: 'text', neu: true, alias: ['lieferantennummer', 'lieferantennr', 'lieferanten-nr', 'lief-nr', 'kreditor', 'kreditorennummer', 'kreditorenkonto', 'supplier number', 'vendor number', 'vendor id'] },
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, alias: ['name', 'lieferant', 'firma', 'firmenname', 'unternehmen', 'company', 'supplier', 'vendor'] },
      { key: 'ansprechpartner', label: 'Ansprechpartner', typ: 'text', alias: ['ansprechpartner', 'kontakt', 'kontaktperson', 'zustaendig'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'address'] },
      { key: 'adresse_strasse', label: 'Straße (zur Adresse)', typ: 'text', virtuell: 'adresse_teil', nichtInVorlage: true, alias: ['strasse', 'straße', 'str', 'street'] },
      { key: 'adresse_plz', label: 'PLZ (zur Adresse)', typ: 'text', virtuell: 'adresse_teil', nichtInVorlage: true, alias: ['plz', 'postleitzahl', 'zip', 'postal code'] },
      { key: 'adresse_ort', label: 'Ort (zur Adresse)', typ: 'text', virtuell: 'adresse_teil', nichtInVorlage: true, alias: ['ort', 'stadt', 'city'] },
      { key: 'ust_id', label: 'USt-IdNr.', typ: 'text', neu: true, alias: ['ust-id', 'ust id', 'ustid', 'ust-idnr', 'eu-ustid', 'vat id', 'vat number'] },
      { key: 'website', label: 'Website', typ: 'text', alias: ['website', 'webseite', 'url', 'internet', 'homepage'] },
      { key: 'kundennummer', label: 'Unsere Kundennummer', typ: 'text', alias: ['kundennummer', 'kundennr', 'kunden-nr', 'unsere nummer'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'kommentar'] },
    ],
  },
  {
    key: 'rechnungen',
    label: 'Offene Posten',
    icon: '🧾',
    tabelle: 'rechnungen',
    beschreibung: 'Unbezahlte Rechnungen aus der alten Buchhaltung übernehmen — damit Mahnwesen und Cashflow von Tag eins stimmen.',
    schluessel: 'rechnungsnummer',
    schluesselFelder: ['rechnungsnummer'],
    eigeneFelderModul: 'rechnungen',
    kundeVerweis: { spalte: 'kontakt_id', firmaSpalte: 'firma_id', textSuche: ['titel', 'notizen'] },
    felder: [
      { key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text', pflicht: true, alias: ['rechnungsnummer', 'rechnungsnr', 'rg-nr', 'rgnr', 'belegnummer', 'beleg-nr', 'nummer', 'nr'] },
      { key: 'titel', label: 'Titel / Betreff', typ: 'text', alias: ['titel', 'betreff', 'bezeichnung', 'leistung', 'text', 'buchungstext'] },
      KUNDE_FELD,
      KUNDE_NR_FELD,
      { key: 'rechnungsdatum', label: 'Rechnungsdatum', typ: 'datum', alias: ['rechnungsdatum', 'datum', 'belegdatum', 'rg-datum'] },
      { key: 'faelligkeitsdatum', label: 'Fällig am', typ: 'datum', alias: ['faelligkeitsdatum', 'fällig am', 'faellig', 'fällig', 'faelligkeit', 'zahlungsziel datum', 'due date'] },
      { key: 'netto_summe', label: 'Netto', typ: 'zahl', standard: 0, alias: ['netto', 'netto summe', 'nettobetrag', 'betrag netto', 'summe netto'] },
      { key: 'mwst_summe', label: 'MwSt', typ: 'zahl', standard: 0, alias: ['mwst', 'ust', 'steuer', 'umsatzsteuer', 'mehrwertsteuer', 'mwst betrag'] },
      { key: 'brutto_summe', label: 'Brutto', typ: 'zahl', standard: 0, hinweis: 'Fehlt Brutto, wird es aus Netto + MwSt gerechnet.', alias: ['brutto', 'brutto summe', 'bruttobetrag', 'betrag', 'gesamt', 'gesamtbetrag', 'summe', 'rechnungsbetrag', 'offener betrag'] },
      { key: 'bezahlter_betrag', label: 'Bereits bezahlt', typ: 'zahl', standard: 0, alias: ['bezahlt', 'bezahlter betrag', 'anzahlung', 'teilzahlung', 'gezahlt'] },
      { key: 'zahlungsstatus', label: 'Status', typ: 'text', standard: 'offen', hinweis: 'offen · teilbezahlt · bezahlt · ueberfaellig', alias: ['status', 'zahlungsstatus', 'zahlstatus'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'kommentar'] },
    ],
  },
  {
    key: 'leistungskatalog',
    label: 'Leistungskatalog',
    icon: '🛠',
    tabelle: 'leistungskatalog',
    beschreibung: 'Stundensätze, Montagepauschalen und Leistungen mit Einheit und Preis — die Grundlage für Angebote und Aufmaß.',
    schluessel: 'bezeichnung',
    schluesselFelder: ['bezeichnung'],
    eigeneFelderModul: 'leistungskatalog',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/leistungskatalog',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'leistung', 'leistungsbezeichnung', 'name', 'titel', 'position', 'description'] },
      { key: 'kuerzel', label: 'Kürzel', typ: 'text', alias: ['kuerzel', 'kürzel', 'kurzzeichen', 'leistungsnummer', 'leistungsnr', 'nummer', 'nr', 'code'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'gruppe', 'leistungsgruppe', 'bereich', 'gewerk'] },
      { key: 'einheit', label: 'Einheit', typ: 'text', hinweis: 'Std, Min, AW oder eine Mengeneinheit (Stück, m², lfm …) — daraus ergibt sich die Erfassungsart.', alias: ['einheit', 'me', 'mengeneinheit', 'unit'] },
      { key: 'erfassungsart', label: 'Erfassungsart', typ: 'text', hinweis: 'stunden · minuten · aw · stueck — leer: aus der Einheit', alias: ['erfassungsart', 'abrechnungsart', 'art'] },
      { key: 'standard_wert', label: 'Standardwert (Zeit/Menge)', typ: 'zahl', standard: 1, alias: ['standardwert', 'standard wert', 'zeitwert', 'vorgabezeit', 'dauer', 'menge'] },
      { key: 'preis', label: 'Preis netto', typ: 'zahl', virtuell: 'preis', nichtInVorlage: true, hinweis: 'Je nach Einheit Stundensatz oder Einheitspreis.', alias: ['preis', 'preis netto', 'nettopreis', 'vk', 'verkaufspreis', 'stundensatz', 'einheitspreis', 'ep', 'price'] },
      { key: 'festpreis_netto', label: 'Festpreis netto', typ: 'zahl', alias: ['festpreis', 'pauschale', 'pauschalpreis'] },
      { key: 'mwst_satz', label: 'MwSt-Satz %', typ: 'zahl', standard: 19, alias: ['mwst', 'mwst satz', 'ust satz', 'steuersatz'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'langtext', 'beschreibung'] },
      { key: 'aktiv', label: 'Aktiv', typ: 'jaNein', standard: true, alias: ['aktiv'] },
    ],
  },
  {
    key: 'wartungsvertraege',
    label: 'Wartungsverträge',
    icon: '🔧',
    tabelle: 'wartungsvertraege',
    beschreibung: 'Laufende Wartungs- und Prüfverträge mit Intervall und letzter Wartung — die nächste Fälligkeit rechnet ARGONAUT selbst.',
    schluessel: 'vertragsnummer',
    schluesselFelder: ['vertragsnummer'],
    eigeneFelderModul: 'wartungsvertraege',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'kontakt_id', ausFeldern: ['kunde_name'] },
    ergebnisHref: '/dashboard/wartung',
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'bezeichnung', 'leistung', 'vertrag', 'vertragsart', 'name'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', hinweis: 'Wird zusätzlich mit dem Kunden in ARGONAUT verknüpft, wenn er dort schon steht.', alias: ['kunde_name', 'kunde', 'kundenname', 'auftraggeber', 'customer'] },
      { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text', alias: ['vertragsnummer', 'vertragsnr', 'vertrag nr', 'nummer', 'nr'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · pausiert · gekuendigt · abgelaufen', alias: ['status'] },
      { key: 'beginn_am', label: 'Beginn', typ: 'datum', alias: ['beginn_am', 'beginn', 'vertragsbeginn', 'start', 'seit'] },
      { key: 'intervall_monate', label: 'Intervall (Monate)', typ: 'zahl', standard: 12, alias: ['intervall_monate', 'intervall', 'intervall monate', 'turnus', 'rhythmus'] },
      { key: 'letzte_wartung_am', label: 'Letzte Wartung', typ: 'datum', alias: ['letzte_wartung_am', 'letzte wartung', 'zuletzt', 'letzte pruefung'] },
      { key: 'naechste_faelligkeit_am', label: 'Nächste Fälligkeit', typ: 'datum', hinweis: 'Leer: aus letzter Wartung (oder Beginn) plus Intervall.', alias: ['naechste_faelligkeit_am', 'naechste faelligkeit', 'nächste wartung', 'faellig', 'fällig'] },
      { key: 'erinnerung_tage_vorher', label: 'Erinnerung (Tage vorher)', typ: 'zahl', standard: 30, alias: ['erinnerung_tage_vorher', 'erinnerung', 'vorlauf'] },
      { key: 'betrag_netto', label: 'Betrag netto', typ: 'zahl', alias: ['betrag_netto', 'betrag', 'preis', 'jahresbetrag', 'netto'] },
      { key: 'mwst_satz', label: 'MwSt-Satz %', typ: 'zahl', alias: ['mwst_satz', 'mwst', 'ust satz'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'umfang', 'leistungsumfang'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung'] },
    ],
  },
  {
    key: 'verkaufschancen',
    label: 'Verkaufschancen',
    icon: '🎯',
    tabelle: 'verkaufschancen',
    beschreibung: 'Offene Deals mit Phase, Wert und Wahrscheinlichkeit — landen in der Pipeline, mit dem Kunden verknüpft.',
    schluessel: 'titel',
    schluesselFelder: ['titel'],
    eigeneFelderModul: 'verkaufschancen',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'kontakt_id', firmaSpalte: 'firma_id' },
    ergebnisHref: '/dashboard/crm/pipeline',
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'deal', 'deal name', 'chance', 'bezeichnung', 'name', 'opportunity', 'betreff'] },
      KUNDE_FELD,
      KUNDE_NR_FELD,
      { key: 'phase', label: 'Phase', typ: 'text', standard: 'erstkontakt', hinweis: 'erstkontakt · qualifiziert · angebot · verhandlung · gewonnen · verloren', alias: ['phase', 'stage', 'deal stage', 'status', 'stufe'] },
      { key: 'wert', label: 'Wert netto', typ: 'zahl', alias: ['wert', 'wert netto', 'betrag', 'volumen', 'amount', 'deal value', 'umsatz'] },
      { key: 'wahrscheinlichkeit', label: 'Wahrscheinlichkeit %', typ: 'zahl', alias: ['wahrscheinlichkeit', 'wahrscheinlichkeit %', 'probability', 'chance %'] },
      { key: 'erwartetes_abschlussdatum', label: 'Abschluss erwartet', typ: 'datum', alias: ['abschluss erwartet', 'abschlussdatum', 'erwartetes abschlussdatum', 'close date', 'expected close date'] },
      { key: 'ansprechpartner', label: 'Ansprechpartner (in die Notizen)', typ: 'text', virtuell: 'anhang', anhangAn: 'notizen', nichtInVorlage: true, alias: ['ansprechpartner', 'kontaktperson', 'contact'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notizen', 'notiz', 'bemerkung', 'beschreibung', 'notes'] },
    ],
  },
  {
    key: 'kontakt_aktivitaeten',
    label: 'Aktivitäten & Gesprächsnotizen',
    icon: '📞',
    tabelle: 'kontakt_aktivitaeten',
    beschreibung: 'Anrufe, E-Mails, Termine und Notizen aus dem alten CRM — erscheinen in der Zeitleiste des Kunden.',
    eigeneFelderModul: 'kontakt_aktivitaeten',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'kontakt_id', pflicht: true },
    ergebnisHref: '/dashboard/crm',
    felder: [
      KUNDE_FELD,
      KUNDE_NR_FELD,
      { key: 'aktivitaet_am', label: 'Datum', typ: 'datum', alias: ['datum', 'aktivitaet am', 'am', 'zeitpunkt', 'date', 'erstellt'] },
      { key: 'typ', label: 'Art', typ: 'text', standard: 'notiz', hinweis: 'anruf · email · termin · notiz — alles andere wird Notiz, die Art steht im Text', alias: ['typ', 'art', 'aktivitaet', 'activity type', 'type', 'kanal'] },
      { key: 'inhalt', label: 'Inhalt', typ: 'text', pflicht: true, alias: ['inhalt', 'betreff', 'notiz', 'text', 'beschreibung', 'subject', 'body', 'note'] },
      { key: 'bearbeiter', label: 'Bearbeiter (in den Inhalt)', typ: 'text', virtuell: 'anhang', anhangAn: 'inhalt', nichtInVorlage: true, alias: ['bearbeiter', 'mitarbeiter', 'owner', 'zustaendig', 'user'] },
      { key: 'wiedervorlage', label: 'Wiedervorlage (in den Inhalt)', typ: 'text', virtuell: 'anhang', anhangAn: 'inhalt', nichtInVorlage: true, alias: ['wiedervorlage', 'follow up', 'naechster kontakt'] },
    ],
  },
  {
    key: 'leads',
    label: 'Leads & Anfragen',
    icon: '📨',
    tabelle: 'leads',
    beschreibung: 'Offene Anfragen aus Website, Telefon und altem CRM — landen in der Lead-Liste. Werbe-Einwilligungen werden nicht übernommen.',
    schluessel: 'email',
    schluesselFelder: ['email'],
    eigeneFelderModul: 'leads',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/leads',
    felder: [
      { key: 'name', label: 'Name', typ: 'text', alias: ['name', 'kontaktname', 'full name'] },
      { key: 'lead_vorname', label: 'Vorname (zum Namen)', typ: 'text', virtuell: 'name_teil', nichtInVorlage: true, alias: ['vorname', 'first name'] },
      { key: 'lead_nachname', label: 'Nachname (zum Namen)', typ: 'text', virtuell: 'name_teil', nichtInVorlage: true, alias: ['nachname', 'last name'] },
      { key: 'lead_firma', label: 'Firma (zum Namen)', typ: 'text', virtuell: 'name_teil', nichtInVorlage: true, alias: ['firma', 'firmenname', 'company'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone', 'mobil', 'handy'] },
      { key: 'plz', label: 'PLZ', typ: 'text', alias: ['plz', 'postleitzahl', 'zip'] },
      { key: 'ort', label: 'Ort', typ: 'text', hinweis: '„71116 Gärtringen" wird in PLZ und Ort geteilt.', alias: ['ort', 'stadt', 'city', 'wohnort'] },
      { key: 'dienstleistung', label: 'Anliegen / Leistung', typ: 'text', alias: ['anliegen', 'dienstleistung', 'leistung', 'interesse', 'thema', 'betreff'] },
      { key: 'nachricht', label: 'Nachricht', typ: 'text', alias: ['nachricht', 'notiz', 'notizen', 'bemerkung', 'text', 'message'] },
      { key: 'quelle', label: 'Quelle', typ: 'text', standard: 'Import', alias: ['quelle', 'herkunft', 'kanal', 'source'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'neu', hinweis: 'neu · offen · gewonnen · verloren', alias: ['status', 'lead status'] },
      { key: 'lead_nummer', label: 'Lead-Nr. (in die Nachricht)', typ: 'text', virtuell: 'anhang', anhangAn: 'nachricht', nichtInVorlage: true, alias: ['lead-nr', 'lead nr', 'leadnummer', 'anfrage nr'] },
      { key: 'eingang_am', label: 'Eingang am (in die Nachricht)', typ: 'text', virtuell: 'anhang', anhangAn: 'nachricht', nichtInVorlage: true, alias: ['eingang am', 'eingang', 'eingegangen', 'anfrage vom', 'create date'] },
      { key: 'budget', label: 'Budget (in die Nachricht)', typ: 'text', virtuell: 'anhang', anhangAn: 'nachricht', nichtInVorlage: true, alias: ['budget', 'budget geschaetzt', 'budget (geschätzt)'] },
    ],
  },
  {
    key: 'mitarbeiter',
    label: 'Mitarbeiter (nur Chef)',
    icon: '👷',
    tabelle: 'mitarbeiter',
    beschreibung: 'Stammdaten Ihres Teams: Name, Kontakt, Tätigkeit, Eintritt, Wochenstunden, Urlaubsanspruch. Ohne Zugänge, ohne Lohn- und Bankdaten.',
    schluessel: 'email',
    schluesselFelder: ['email', 'vorname+nachname'],
    eigeneFelderModul: 'mitarbeiter',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/personal',
    ausblenden: ['auth_user_id', 'rolle', 'nutzer_typ', 'darf_verteilen', 'darf_abrechnen', 'leitungsrolle', 'sv_nummer', 'steuer_id', 'iban', 'notfall_kontakt'],
    sperren: [
      { muster: '(sv|sozialversicherung)', grund: 'Sozialversicherungs- und Steuernummern übernimmt ARGONAUT nicht aus einer Datei — die tragen Sie in der Personalakte ein.' },
      { muster: '(steuer id|steuerid|steuer identifikation|identifikationsnummer|steuerklasse)', grund: 'Sozialversicherungs- und Steuernummern übernimmt ARGONAUT nicht aus einer Datei — die tragen Sie in der Personalakte ein.' },
      { muster: '(brutto|lohn|gehalt|verguetung|stundenlohn|entgelt)', grund: 'Lohn- und Gehaltsdaten gehören ins Lohnprogramm und werden nicht importiert.' },
      { muster: '(login|zugang|passwort|kennwort|benutzer|rolle|recht)', grund: 'Zugänge und Rechte richten Sie unter Personal mit „Einladen" ein — nie aus einer Datei.' },
    ],
    felder: [
      { key: 'vorname', label: 'Vorname', typ: 'text', pflicht: true, alias: ['vorname', 'first name'] },
      { key: 'nachname', label: 'Nachname', typ: 'text', pflicht: true, alias: ['nachname', 'name', 'last name', 'familienname'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'mobil', 'handy', 'telefonnummer'] },
      { key: 'position', label: 'Tätigkeit / Position', typ: 'text', alias: ['position', 'taetigkeit', 'tätigkeit', 'funktion', 'beruf', 'stelle', 'job title'] },
      { key: 'abteilung', label: 'Abteilung', typ: 'text', alias: ['abteilung', 'bereich', 'team', 'kostenstelle'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · inaktiv · beurlaubt', alias: ['status'] },
      { key: 'eintrittsdatum', label: 'Eintritt', typ: 'datum', alias: ['eintritt', 'eintrittsdatum', 'beschaeftigt seit', 'seit', 'start'] },
      { key: 'austrittsdatum', label: 'Austritt', typ: 'datum', alias: ['austritt', 'austrittsdatum', 'ausgeschieden am'] },
      { key: 'geburtsdatum', label: 'Geburtsdatum', typ: 'datum', alias: ['geburtsdatum', 'geboren', 'geburtstag'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'wohnort'] },
      { key: 'wochenstunden', label: 'Wochenstunden', typ: 'zahl', alias: ['wochenstunden', 'stunden pro woche', 'arbeitszeit', 'sollstunden'] },
      { key: 'arbeitszeit_modell', label: 'Arbeitszeitmodell', typ: 'text', hinweis: 'vollzeit · teilzeit · minijob · midijob', alias: ['arbeitszeit_modell', 'arbeitszeitmodell', 'beschaeftigungsart', 'anstellung'] },
      { key: 'urlaubsanspruch_tage', label: 'Urlaubsanspruch (Tage)', typ: 'zahl', alias: ['urlaubsanspruch', 'urlaubstage', 'urlaub anspruch', 'jahresurlaub'] },
    ],
  },
  {
    key: 'auftraege',
    label: 'Laufende Aufträge',
    icon: '📋',
    tabelle: 'auftraege',
    beschreibung: 'Offene Aufträge mit Kunde, Zeitraum und Netto-Betrag. Angebote in derselben Liste werden aussortiert — die übernehmen wir gemeinsam.',
    schluessel: 'auftragsnummer',
    schluesselFelder: ['auftragsnummer'],
    eigeneFelderModul: 'auftraege',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'kontakt_id', firmaSpalte: 'firma_id' },
    ergebnisHref: '/dashboard/auftraege',
    ablehnenWenn: { feld: 'belegart', werte: ['angebot', 'angebote', 'kostenvoranschlag', 'quote', 'offer'], grund: 'Das ist ein Angebot. Angebote übernehmen wir gemeinsam mit Ihnen (eigener Schritt) — diese Zeile bleibt in Ihrer Datei.' },
    felder: [
      { key: 'auftragsnummer', label: 'Auftragsnummer', typ: 'text', hinweis: 'Leer: ARGONAUT vergibt AU-Jahr-Nummer.', alias: ['auftragsnummer', 'auftragsnr', 'nummer', 'nr', 'auftrag nr', 'order number'] },
      { key: 'belegart', label: 'Art (Auftrag/Angebot)', typ: 'text', virtuell: 'filter', nichtInVorlage: true, alias: ['art', 'belegart', 'typ', 'dokumentart'] },
      KUNDE_FELD,
      KUNDE_NR_FELD,
      { key: 'titel', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['titel', 'bezeichnung', 'betreff', 'leistung', 'projekt', 'auftrag'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'beauftragt', hinweis: 'entwurf · beauftragt · in_bearbeitung · abgeschlossen · storniert', alias: ['status', 'auftragsstatus'] },
      { key: 'auftragsdatum', label: 'Beginn / Auftragsdatum', typ: 'datum', alias: ['auftragsdatum', 'von', 'beginn', 'start', 'datum', 'auftrag vom'] },
      { key: 'lieferdatum', label: 'Ende / Liefertermin', typ: 'datum', alias: ['lieferdatum', 'bis', 'bis gueltig bis', 'bis / gültig bis', 'ende', 'fertigstellung', 'liefertermin'] },
      { key: 'netto_summe', label: 'Betrag netto', typ: 'zahl', alias: ['betrag netto', 'netto', 'auftragswert', 'summe netto', 'betrag', 'wert'] },
      { key: 'stand', label: 'Stand (in die Notizen)', typ: 'text', virtuell: 'anhang', anhangAn: 'notizen', nichtInVorlage: true, alias: ['stand', 'fortschritt', 'erledigt', 'fertig %'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notizen', 'notiz', 'bemerkung', 'beschreibung'] },
    ],
  },
  {
    key: 'projekte',
    label: 'Projekte / Baustellen',
    icon: '🏗',
    tabelle: 'projekte',
    beschreibung: 'Laufende Projekte und Baustellen mit Zeitraum, Budget und Verantwortlichem.',
    schluessel: 'name',
    schluesselFelder: ['name'],
    eigeneFelderModul: 'projekte',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/projekte',
    felder: [
      { key: 'name', label: 'Projektname', typ: 'text', pflicht: true, alias: ['name', 'projekt', 'projektname', 'baustelle', 'bezeichnung', 'titel'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'details', 'notiz', 'notizen'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · pausiert · abgeschlossen · abgebrochen', alias: ['status'] },
      { key: 'prioritaet', label: 'Priorität', typ: 'text', standard: 'normal', hinweis: 'niedrig · normal · hoch · dringend', alias: ['prioritaet', 'priorität', 'prio', 'wichtigkeit'] },
      { key: 'start_datum', label: 'Start', typ: 'datum', alias: ['start', 'start_datum', 'beginn', 'von', 'baubeginn'] },
      { key: 'end_datum', label: 'Ende', typ: 'datum', alias: ['ende', 'end_datum', 'bis', 'fertigstellung', 'abnahme'] },
      { key: 'budget', label: 'Budget', typ: 'zahl', alias: ['budget', 'auftragswert', 'volumen'] },
      { key: 'verantwortlich', label: 'Verantwortlich', typ: 'text', alias: ['verantwortlich', 'bauleiter', 'projektleiter', 'zustaendig'] },
    ],
  },
  {
    key: 'vertraege',
    label: 'Laufende Kosten & Verträge',
    icon: '📑',
    tabelle: 'vertraege',
    beschreibung: 'Miete, Leasing, Versicherungen, Abos mit Kosten, Laufzeit und Kündigungsfrist — die Fristen-Ampel rechnet ab dem ersten Tag.',
    schluessel: 'vertragsnummer',
    schluesselFelder: ['vertragsnummer', 'bezeichnung+vertragspartner'],
    eigeneFelderModul: 'vertraege',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/vertraege',
    // Dieselbe Tabelle traegt die Betreiberkosten aus dem Command Center mit anderen Spalten.
    ausblenden: ['anbieter', 'art', 'betrag', 'intervall', 'absetzbar_prozent', 'start_datum', 'ende_datum', 'notiz', 'aktiv', 'kuendigung_grund', 'kuendigung_am', 'kunde_id'],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'vertrag', 'titel', 'name', 'leistung'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', hinweis: 'z. B. Miete, Leasing, Versicherung, Wartung, Abo/Lizenz, Lieferant', alias: ['kategorie', 'art', 'vertragsart', 'typ'] },
      { key: 'vertragspartner', label: 'Vertragspartner', typ: 'text', alias: ['vertragspartner', 'anbieter', 'partner', 'versicherer', 'vermieter', 'leasinggeber', 'lieferant'] },
      { key: 'vertragsnummer', label: 'Vertragsnummer', typ: 'text', alias: ['vertragsnummer', 'vertragsnr', 'versicherungsnummer', 'kundennummer', 'nummer'] },
      { key: 'beginn', label: 'Beginn', typ: 'datum', alias: ['beginn', 'start', 'vertragsbeginn', 'seit'] },
      { key: 'ende', label: 'Ende', typ: 'datum', alias: ['ende', 'laufzeit bis', 'vertragsende', 'bis'] },
      { key: 'kuendigungsfrist_tage', label: 'Kündigungsfrist (Tage)', typ: 'zahl', standard: 0, alias: ['kuendigungsfrist', 'kündigungsfrist', 'kuendigungsfrist tage', 'frist'] },
      { key: 'auto_verlaengerung', label: 'Verlängert sich automatisch', typ: 'jaNein', alias: ['auto verlaengerung', 'verlaengert sich', 'automatische verlaengerung', 'stillschweigende verlaengerung'] },
      { key: 'verlaengerung_monate', label: 'Verlängerung (Monate)', typ: 'zahl', alias: ['verlaengerung monate', 'verlaengerung', 'verlängerung'] },
      { key: 'kosten_betrag', label: 'Kosten', typ: 'zahl', alias: ['kosten', 'betrag', 'beitrag', 'rate', 'miete', 'kosten betrag'] },
      { key: 'kosten_intervall', label: 'Intervall', typ: 'text', standard: 'monatlich', hinweis: 'monatlich · quartalsweise · jaehrlich · einmalig', alias: ['intervall', 'zahlweise', 'turnus', 'kosten intervall'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · gekuendigt · beendet', alias: ['status'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notizen', 'bemerkung', 'notiz'] },
    ],
  },
  {
    key: 'anlagegueter',
    label: 'Anlagen (Anlagenverzeichnis)',
    icon: '🏷',
    tabelle: 'anlagegueter',
    beschreibung: 'Anlagevermögen mit Anschaffung, Kosten und Nutzungsdauer — für die Abschreibung in der Buchhaltung.',
    schluessel: 'bezeichnung',
    schluesselFelder: ['bezeichnung+anschaffungsdatum'],
    eigeneFelderModul: 'anlagegueter',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/anlagen',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'anlage', 'wirtschaftsgut', 'gegenstand', 'name'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'anlagenklasse', 'gruppe', 'konto'] },
      { key: 'anschaffungsdatum', label: 'Anschaffung', typ: 'datum', alias: ['anschaffungsdatum', 'anschaffung', 'kaufdatum', 'zugang', 'datum'] },
      { key: 'anschaffungskosten', label: 'Anschaffungskosten netto', typ: 'zahl', alias: ['anschaffungskosten', 'ak', 'kaufpreis', 'anschaffungswert', 'netto'] },
      { key: 'nutzungsdauer_jahre', label: 'Nutzungsdauer (Jahre)', typ: 'zahl', alias: ['nutzungsdauer', 'nd', 'nutzungsdauer jahre', 'jahre', 'afa jahre'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · verkauft · ausgemustert', alias: ['status'] },
      { key: 'abgang_am', label: 'Abgang am', typ: 'datum', alias: ['abgang', 'abgang am', 'verkauft am', 'ausgemustert am'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung'] },
    ],
  },
  {
    key: 'fahrzeuge',
    label: 'Fuhrpark',
    icon: '🚐',
    tabelle: 'fahrzeuge',
    beschreibung: 'Fahrzeuge mit Kennzeichen, TÜV, UVV, Versicherung und Kilometerstand — die Fristen erscheinen gleich in der Fahrzeugakte.',
    schluessel: 'kennzeichen',
    schluesselFelder: ['kennzeichen', 'fahrgestellnummer'],
    eigeneFelderModul: 'fahrzeuge',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/erp/fuhrpark',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'fahrzeug', 'modell', 'name', 'typbezeichnung'] },
      { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text', alias: ['kennzeichen', 'amtliches kennzeichen', 'kfz kennzeichen', 'plate'] },
      { key: 'fahrzeugtyp', label: 'Fahrzeugtyp', typ: 'text', alias: ['fahrzeugtyp', 'typ', 'art', 'klasse'] },
      { key: 'fahrgestellnummer', label: 'Fahrgestellnummer', typ: 'text', alias: ['fahrgestellnummer', 'fin', 'vin', 'fahrzeugidentnummer'] },
      { key: 'erstzulassung', label: 'Erstzulassung', typ: 'datum', alias: ['erstzulassung', 'ez', 'zulassung'] },
      { key: 'tuev_bis', label: 'TÜV bis', typ: 'datum', alias: ['tuev', 'tüv', 'tuev bis', 'hu', 'hauptuntersuchung'] },
      { key: 'wartung_bis', label: 'Wartung bis', typ: 'datum', alias: ['wartung', 'wartung bis', 'inspektion', 'service faellig'] },
      { key: 'versicherung_bis', label: 'Versicherung bis', typ: 'datum', alias: ['versicherung', 'versicherung bis'] },
      { key: 'uvv_bis', label: 'UVV bis', typ: 'datum', alias: ['uvv', 'uvv bis', 'uvv pruefung'] },
      { key: 'leasing_ende', label: 'Leasing-Ende', typ: 'datum', alias: ['leasing ende', 'leasingende', 'leasing bis'] },
      { key: 'km_stand', label: 'Kilometerstand', typ: 'zahl', alias: ['km', 'km stand', 'kilometerstand', 'laufleistung'] },
      { key: 'kraftstoff', label: 'Kraftstoff', typ: 'text', alias: ['kraftstoff', 'antrieb', 'treibstoff', 'fuel'] },
      { key: 'tank_liter', label: 'Tankgröße (Liter)', typ: 'zahl', alias: ['tank', 'tankgroesse', 'tankinhalt', 'tank liter'] },
      { key: 'fahrer_name', label: 'Fester Fahrer', typ: 'text', alias: ['fahrer', 'fester fahrer', 'fahrer name', 'nutzer'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notizen', 'notiz', 'bemerkung'] },
      { key: 'aktiv', label: 'Aktiv', typ: 'jaNein', standard: true, alias: ['aktiv'] },
    ],
  },
  {
    key: 'eingangsbelege',
    label: 'Eingangsrechnungen (Liste)',
    icon: '📥',
    tabelle: 'eingangsbelege',
    beschreibung: 'Alte Eingangsrechnungen aus einer Liste (ohne Beleg-Datei) — für Übersicht, Auswertung und den Abgleich mit dem Konto.',
    schluessel: 'belegnummer',
    schluesselFelder: ['lieferant+belegnummer'],
    eigeneFelderModul: 'eingangsbelege',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/eingangsbelege',
    ausblenden: ['datei_pfad', 'datev_konto', 'datev_rahmen', 'einsatz_id', 'kennzeichen', 'bewirtung_anlass', 'bewirtung_teilnehmer'],
    felder: [
      { key: 'lieferant', label: 'Lieferant', typ: 'text', pflicht: true, alias: ['lieferant', 'kreditor', 'rechnungssteller', 'firma', 'name', 'vendor', 'supplier'] },
      { key: 'belegnummer', label: 'Rechnungsnummer', typ: 'text', alias: ['belegnummer', 'rechnungsnummer', 'rechnungsnr', 'beleg nr', 'nummer', 'nr'] },
      { key: 'belegdatum', label: 'Rechnungsdatum', typ: 'datum', alias: ['belegdatum', 'rechnungsdatum', 'datum'] },
      { key: 'netto', label: 'Netto', typ: 'zahl', alias: ['netto', 'nettobetrag', 'betrag netto'] },
      { key: 'ust_satz', label: 'USt-Satz %', typ: 'zahl', alias: ['ust satz', 'mwst satz', 'steuersatz', 'ust %', 'mwst %'] },
      { key: 'ust_betrag', label: 'USt-Betrag', typ: 'zahl', alias: ['ust', 'ust betrag', 'mwst', 'mwst betrag', 'vorsteuer'] },
      { key: 'brutto', label: 'Brutto', typ: 'zahl', alias: ['brutto', 'bruttobetrag', 'betrag', 'gesamt', 'rechnungsbetrag'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'kostenart', 'aufwand', 'gruppe'] },
      { key: 'bezahlt_am', label: 'Bezahlt am', typ: 'datum', alias: ['bezahlt am', 'bezahlt', 'zahlungsdatum', 'ausgeglichen am'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'erfasst', hinweis: 'erfasst · geprueft · gebucht', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'buchungstext'] },
    ],
  },
  // --- Paket 127: Schritt 3 Rest ---------------------------------------------
  {
    key: 'mitarbeiter_qualifikation',
    label: 'Qualifikationen (nur Chef)',
    icon: '🎓',
    tabelle: 'mitarbeiter_qualifikation',
    beschreibung: 'Befähigungen und Schulungen je Mitarbeiter mit „gültig bis" — erscheinen gleich in der Dispo mit Ampel. Vorher die Mitarbeiter importieren.',
    // Erkennung im Bestand: Mitarbeiter + Art (so ist die Tabelle eindeutig).
    // „__kunde+art" erkennt Doppelte INNERHALB der Datei, bevor verknuepft ist.
    schluesselFelder: ['mitarbeiter_id+art', '__kunde+art'],
    nurMitKatalog: true,
    nurChef: true,
    kundeVerweis: { spalte: 'mitarbeiter_id', pflicht: true, quelle: 'mitarbeiter', label: 'Mitarbeiter', mehrzahl: 'die Mitarbeiter' },
    ergebnisHref: '/dashboard/dispo/qualifikationen',
    felder: [
      {
        key: 'kunde', label: 'Mitarbeiter (Name oder E-Mail)', typ: 'text', virtuell: 'kunde_verweis',
        hinweis: 'Wird mit Ihren Mitarbeitern verknüpft — über Personalnummer, E-Mail oder den genauen Namen.',
        alias: ['name', 'mitarbeiter', 'mitarbeitername', 'mitarbeiter name', 'person', 'e-mail', 'email', 'employee'],
      },
      {
        key: 'kunde_nummer', label: 'Personalnummer (zum Verknüpfen)', typ: 'text', virtuell: 'kunde_verweis', nichtInVorlage: true,
        alias: ['personalnummer', 'personalnr', 'pers nr', 'pers-nr', 'persnr', 'mitarbeiternummer', 'ma nr', 'ma-nr', 'employee id', 'employee number'],
      },
      { key: 'art', label: 'Qualifikation', typ: 'text', pflicht: true, hinweis: 'Bekannte Befähigungen (z. B. Elektrofachkraft, Ersthelfer) werden für die Dispo erkannt; alle anderen bleiben mit ihrem Namen erhalten.', alias: ['qualifikation', 'befaehigung', 'schulung', 'zertifikat', 'nachweis art', 'art', 'bezeichnung', 'qualification', 'certificate'] },
      { key: 'gueltig_bis', label: 'Gültig bis', typ: 'datum', alias: ['gueltig bis', 'gültig bis', 'ablauf', 'ablaufdatum', 'befristet bis', 'naechste pruefung', 'valid until', 'expires'] },
      { key: 'nachweis', label: 'Nachweis / Bemerkung', typ: 'text', alias: ['nachweis', 'bemerkung', 'notiz', 'aussteller', 'zertifikatsnummer'] },
      { key: 'erworben', label: 'Erworben am (in den Nachweis)', typ: 'text', virtuell: 'anhang', anhangAn: 'nachweis', nichtInVorlage: true, alias: ['erworben', 'erworben am', 'ausgestellt', 'ausgestellt am', 'datum', 'schulungsdatum', 'seit'] },
      { key: 'quali_status', label: 'Status im Altsystem (in den Nachweis)', typ: 'text', virtuell: 'anhang', anhangAn: 'nachweis', nichtInVorlage: true, alias: ['status'] },
    ],
  },
  {
    key: 'bestellungen',
    label: 'Bestellungen mit Positionen',
    icon: '🛒',
    tabelle: 'bestellungen',
    beschreibung: 'Offene und gelieferte Bestellungen bei Lieferanten — eine Zeile je Position, gleiche Bestellnummer = eine Bestellung. Vorher Lieferanten und Artikel importieren.',
    // Keine Doppelten-Pruefung je Zeile: mehrere Zeilen mit derselben
    // Bestellnummer sind hier gewollt (Positionen). Erkannt wird je Bestellung.
    schluesselFelder: [],
    eigeneFelderModul: 'bestellungen',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'lieferant_id', quelle: 'lieferanten', label: 'Lieferant', mehrzahl: 'die Lieferanten' },
    kinder: { tabelle: 'bestellpositionen', fremdschluessel: 'bestellung_id', kopfFeld: 'bestellnummer' },
    ergebnisHref: '/dashboard/erp/bestellungen',
    felder: [
      { key: 'bestellnummer', label: 'Bestellnummer', typ: 'text', pflicht: true, hinweis: 'Zeilen mit gleicher Nummer werden eine Bestellung.', alias: ['bestellnummer', 'bestellnr', 'bestell nr', 'best nr', 'bestellung', 'bestellung nr', 'einkaufsnummer', 'order number', 'po number', 'purchase order'] },
      { key: 'bestelldatum', label: 'Bestelldatum', typ: 'datum', alias: ['bestelldatum', 'bestellt am', 'datum', 'order date'] },
      { key: 'lieferdatum_erwartet', label: 'Liefertermin', typ: 'datum', alias: ['liefertermin', 'lieferdatum', 'erwartet', 'lieferung erwartet', 'wunschtermin', 'delivery date'] },
      {
        key: 'kunde', label: 'Lieferant (Name oder E-Mail)', typ: 'text', virtuell: 'kunde_verweis',
        hinweis: 'Wird mit Ihren Lieferanten verknüpft — über Lieferantennummer, E-Mail oder den genauen Namen.',
        alias: ['lieferant', 'lieferantenname', 'lieferant name', 'kreditor name', 'firma', 'supplier', 'vendor'],
      },
      {
        key: 'kunde_nummer', label: 'Lieferantennummer (zum Verknüpfen)', typ: 'text', virtuell: 'kunde_verweis', nichtInVorlage: true,
        alias: ['lieferantennummer', 'lieferantennr', 'lieferanten nr', 'lief nr', 'kreditor', 'kreditorennummer', 'supplier number', 'vendor number'],
      },
      { key: 'status', label: 'Status', typ: 'text', hinweis: 'je Position: bestellt · teilgeliefert · geliefert · storniert — der Status der Bestellung ergibt sich daraus', alias: ['status', 'bestellstatus', 'positionsstatus', 'lieferstatus'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notizen', 'notiz', 'bemerkung', 'kommentar'] },
      { key: 'artikelnummer', label: 'Artikelnummer (Position)', typ: 'text', virtuell: 'position', positionSpalte: null, hinweis: 'Wird mit Ihren Artikeln verknüpft.', alias: ['artikelnummer', 'artikelnr', 'artikel nr', 'art nr', 'materialnummer', 'sku', 'item number'] },
      { key: 'bezeichnung', label: 'Bezeichnung (Position)', typ: 'text', virtuell: 'position', positionSpalte: 'bezeichnung', alias: ['bezeichnung', 'artikel', 'artikelbezeichnung', 'text', 'beschreibung', 'produkt', 'description'] },
      { key: 'menge', label: 'Menge (Position)', typ: 'zahl', pflicht: true, virtuell: 'position', positionSpalte: 'menge', alias: ['menge', 'anzahl', 'bestellmenge', 'stueck', 'qty', 'quantity'] },
      { key: 'einheit', label: 'Einheit (Position)', typ: 'text', virtuell: 'position', positionSpalte: null, hinweis: 'Kommt vom Artikel; ohne Artikel steht sie in der Bezeichnung.', alias: ['einheit', 'me', 'mengeneinheit', 'unit'] },
      { key: 'einzelpreis', label: 'Einzelpreis netto (Position)', typ: 'zahl', virtuell: 'position', positionSpalte: 'einzelpreis', alias: ['einzelpreis', 'ek', 'ek preis', 'stueckpreis', 'einkaufspreis', 'preis', 'unit price'] },
      { key: 'gesamt_netto', label: 'Gesamt netto (Kontrolle)', typ: 'zahl', virtuell: 'position', positionSpalte: null, hinweis: 'Wird mit Menge × Einzelpreis verglichen.', alias: ['gesamt netto', 'gesamt', 'gesamtpreis', 'positionswert', 'summe', 'betrag netto', 'netto'] },
      { key: 'menge_geliefert', label: 'Bereits geliefert (Position)', typ: 'zahl', virtuell: 'position', positionSpalte: 'menge_geliefert', alias: ['geliefert', 'gelieferte menge', 'menge geliefert', 'erhalten', 'eingegangen'] },
    ],
  },
  // --- Paket 128: Karten, die bisher nur eine Vorlage hatten (Teil 1) -------
  {
    key: 'objekte',
    label: 'Objekt-/Asset-Register',
    icon: '🏛',
    tabelle: 'assets',
    beschreibung: 'Anlagen, Maschinen, Geräte und Objekte mit Kontrollintervall — die nächste Kontrolle wird wie im Modul gerechnet, Gruppen werden angelegt.',
    schluesselFelder: ['kennung', 'bezeichnung+standort'],
    eigeneFelderModul: 'assets',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/objekte',
    nachschlag: { ausFeld: 'gruppe', tabelle: 'asset_gruppen', nameSpalte: 'bezeichnung', spalte: 'gruppe_id', anlegen: true, textFeld: 'notiz', label: 'Gruppe' },
    listen: [
      { feld: 'typ', label: 'Typ', standard: 'sonstiges', textFeld: 'notiz', liste: liste(['maschine', 'fahrzeug', 'pv', 'aufzug', 'werkzeug', 'klima', 'immobilie', 'baum', 'feuerloescher', 'sonstiges'], { anlage: 'pv', photovoltaik: 'pv', geraet: 'werkzeug', 'werkzeug geraet': 'werkzeug', kaelte: 'klima', 'klima kaelte': 'klima', gebaeude: 'immobilie', einheit: 'immobilie', loescher: 'feuerloescher', sonstige: 'sonstiges' }) },
      { feld: 'zustand', label: 'Zustand', standard: 'gut', textFeld: 'notiz', liste: liste(['gut', 'beobachten', 'kritisch'], { ok: 'gut', 'in ordnung': 'gut', mittel: 'beobachten', maessig: 'beobachten', schlecht: 'kritisch', defekt: 'kritisch' }) },
    ],
    folgeDatum: [{ ziel: 'naechste_kontrolle', aus: 'letzte_kontrolle', monateFeld: 'kontrollintervall_monate' }],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'objekt', 'anlage', 'name', 'geraet', 'gerät', 'asset'] },
      { key: 'typ', label: 'Typ', typ: 'text', standard: 'sonstiges', hinweis: 'maschine · fahrzeug · pv · aufzug · werkzeug · klima · immobilie · baum · feuerloescher · sonstiges', alias: ['typ', 'art', 'objektart', 'kategorie'] },
      { key: 'gruppe', label: 'Gruppe', typ: 'text', virtuell: 'nachschlag', hinweis: 'Wird mit Ihren Objekt-Gruppen verknüpft; fehlende werden angelegt.', alias: ['gruppe', 'objektgruppe', 'bereich', 'anlagengruppe'] },
      { key: 'standort', label: 'Standort', typ: 'text', alias: ['standort', 'ort', 'raum', 'gebaeude', 'einsatzort'] },
      { key: 'hersteller', label: 'Hersteller', typ: 'text', alias: ['hersteller', 'marke', 'fabrikat'] },
      { key: 'kennung', label: 'Kennung / Seriennummer', typ: 'text', alias: ['kennung', 'seriennummer', 'inventarnummer', 'inventar nr', 'serien nr', 'id nummer'] },
      { key: 'zustand', label: 'Zustand', typ: 'text', standard: 'gut', hinweis: 'gut · beobachten · kritisch', alias: ['zustand', 'ampel'] },
      { key: 'kontrollintervall_monate', label: 'Kontrollintervall (Monate)', typ: 'zahl', standard: 12, alias: ['kontrollintervall monate', 'kontrollintervall', 'intervall', 'pruefintervall', 'intervall monate'] },
      { key: 'letzte_kontrolle', label: 'Letzte Kontrolle', typ: 'datum', alias: ['letzte kontrolle', 'letzte pruefung', 'geprueft am', 'kontrolliert am'] },
      { key: 'naechste_kontrolle', label: 'Nächste Kontrolle', typ: 'datum', hinweis: 'Leer: letzte Kontrolle + Intervall.', alias: ['naechste kontrolle', 'naechste pruefung', 'faellig', 'faellig am'] },
      { key: 'anschaffungsdatum', label: 'Anschaffung', typ: 'datum', alias: ['anschaffungsdatum', 'anschaffung', 'kaufdatum', 'baujahr datum'] },
      { key: 'anschaffungswert', label: 'Anschaffungswert', typ: 'zahl', alias: ['anschaffungswert', 'kaufpreis', 'wert', 'anschaffungskosten'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung'] },
    ],
  },
  {
    key: 'pruefprotokolle',
    label: 'Prüfprotokolle',
    icon: '📋',
    tabelle: 'pruef_protokoll',
    beschreibung: 'Frühere Prüfungen (DGUV V3, Feuerlöscher, Leitern …) mit Ergebnis und nächster Fälligkeit — mit dem Objekt verknüpft, wenn es den Namen im Register gibt.',
    schluesselFelder: ['objekt_bezeichnung+pruef_art+datum'],
    eigeneFelderModul: 'pruef_protokoll',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/pruefprotokolle',
    nachschlag: { ausFeld: 'objekt_bezeichnung', tabelle: 'assets', nameSpalte: 'bezeichnung', spalte: 'asset_id', label: 'Objekt' },
    listen: [
      { feld: 'ergebnis', label: 'Ergebnis', standard: 'bestanden', textFeld: 'bemerkung', liste: liste(['bestanden', 'maengel', 'durchgefallen'], { ok: 'bestanden', 'i o': 'bestanden', io: 'bestanden', 'in ordnung': 'bestanden', 'ohne maengel': 'bestanden', bestanden: 'bestanden', mangel: 'maengel', 'mit maengeln': 'maengel', 'bedingt bestanden': 'maengel', 'n i o': 'durchgefallen', nio: 'durchgefallen', 'nicht bestanden': 'durchgefallen', gesperrt: 'durchgefallen' }) },
    ],
    folgeDatum: [{ ziel: 'naechste_pruefung', aus: 'datum', monateFeld: 'intervall_monate' }],
    felder: [
      { key: 'objekt_bezeichnung', label: 'Objekt', typ: 'text', alias: ['objekt bezeichnung', 'objekt', 'geraet', 'gerät', 'anlage', 'bezeichnung', 'pruefling'] },
      { key: 'pruef_art', label: 'Prüfart', typ: 'text', pflicht: true, alias: ['pruef art', 'pruefart', 'prüfart', 'pruefung', 'art', 'pruefungsart'] },
      { key: 'norm', label: 'Norm', typ: 'text', alias: ['norm', 'vorschrift', 'grundlage', 'regel'] },
      { key: 'datum', label: 'Prüfdatum', typ: 'datum', pflicht: true, alias: ['datum', 'pruefdatum', 'geprueft am', 'prüfdatum'] },
      { key: 'pruefer', label: 'Prüfer', typ: 'text', alias: ['pruefer', 'prüfer', 'geprueft von', 'befaehigte person'] },
      { key: 'intervall_monate', label: 'Intervall (Monate)', typ: 'zahl', alias: ['intervall monate', 'intervall', 'pruefintervall'] },
      { key: 'naechste_pruefung', label: 'Nächste Prüfung', typ: 'datum', hinweis: 'Leer: Prüfdatum + Intervall.', alias: ['naechste pruefung', 'naechste', 'faellig', 'faellig am', 'wiederholung'] },
      { key: 'ergebnis', label: 'Ergebnis', typ: 'text', standard: 'bestanden', hinweis: 'bestanden · maengel · durchgefallen', alias: ['ergebnis', 'befund', 'status'] },
      { key: 'bemerkung', label: 'Bemerkung', typ: 'text', alias: ['bemerkung', 'notiz', 'maengel beschreibung', 'kommentar'] },
    ],
  },
  {
    key: 'bde',
    label: 'Maschinen (BDE/MDE)',
    icon: '📟',
    tabelle: 'bde_maschine',
    beschreibung: 'Maschinenstammdaten für die Betriebsdatenerfassung — Taktzeit und Status.',
    schluesselFelder: ['maschinen_nr', 'bezeichnung'],
    eigeneFelderModul: 'bde_maschine',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/bde',
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', liste: liste(['aktiv', 'wartung', 'ausgemustert'], { 'in betrieb': 'aktiv', laufend: 'aktiv', 'in wartung': 'wartung', reparatur: 'wartung', stillgelegt: 'ausgemustert', verschrottet: 'ausgemustert' }) }],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'maschine', 'name', 'anlage'] },
      { key: 'maschinen_nr', label: 'Maschinen-Nr.', typ: 'text', alias: ['maschinen nr', 'maschinennummer', 'maschinen nummer', 'nummer', 'anlagen nr', 'inventarnummer'] },
      { key: 'standort', label: 'Standort / Halle', typ: 'text', alias: ['standort', 'halle', 'ort', 'bereich'] },
      { key: 'ideal_takt_sek', label: 'Idealtakt (Sekunden)', typ: 'zahl', alias: ['ideal takt sek', 'idealtakt', 'taktzeit', 'takt sek', 'zykluszeit'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · wartung · ausgemustert', alias: ['status'] },
    ],
  },
  {
    key: 'chargen',
    label: 'Chargen & Serien',
    icon: '🔬',
    tabelle: 'charge_los',
    beschreibung: 'Chargen- und Serien-Lose mit MHD und Herkunft — Grundlage für Rückverfolgung und Rückruf.',
    schluesselFelder: ['charge_nr'],
    eigeneFelderModul: 'charge_los',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/chargen',
    listen: [
      { feld: 'typ', label: 'Typ', standard: 'charge', textFeld: 'bemerkung', liste: liste(['charge', 'serie'], { los: 'charge', batch: 'charge', lot: 'charge', seriennummer: 'serie', serial: 'serie' }) },
      { feld: 'status', label: 'Status', standard: 'freigegeben', textFeld: 'bemerkung', liste: liste(['freigegeben', 'quarantaene', 'gesperrt', 'verbraucht'], { frei: 'freigegeben', ok: 'freigegeben', quarantäne: 'quarantaene', pruefung: 'quarantaene', 'in pruefung': 'quarantaene', sperre: 'gesperrt', blockiert: 'gesperrt', aufgebraucht: 'verbraucht', leer: 'verbraucht' }) },
    ],
    felder: [
      { key: 'charge_nr', label: 'Chargen-Nr.', typ: 'text', pflicht: true, alias: ['charge nr', 'chargennummer', 'charge', 'los', 'los nr', 'losnummer', 'lot', 'seriennummer'] },
      { key: 'typ', label: 'Typ', typ: 'text', standard: 'charge', hinweis: 'charge · serie', alias: ['typ', 'art'] },
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', alias: ['bezeichnung', 'artikel', 'produkt', 'material'] },
      { key: 'menge', label: 'Menge', typ: 'zahl', alias: ['menge', 'anzahl', 'bestand'] },
      { key: 'einheit', label: 'Einheit', typ: 'text', alias: ['einheit', 'me', 'mengeneinheit'] },
      { key: 'herstell_datum', label: 'Herstelldatum', typ: 'datum', alias: ['herstell datum', 'herstelldatum', 'produktionsdatum', 'hergestellt am', 'eingang'] },
      { key: 'mhd', label: 'MHD / Verfall', typ: 'datum', alias: ['mhd', 'mindesthaltbarkeit', 'verfall', 'verbrauchen bis', 'haltbar bis'] },
      { key: 'herkunft', label: 'Herkunft / Lieferant', typ: 'text', alias: ['herkunft', 'lieferant', 'ursprung', 'erzeuger'] },
      { key: 'auftrag', label: 'Auftrag', typ: 'text', alias: ['auftrag', 'auftragsnummer', 'fertigungsauftrag'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'freigegeben', hinweis: 'freigegeben · quarantaene · gesperrt · verbraucht', alias: ['status', 'freigabe'] },
      { key: 'bemerkung', label: 'Bemerkung', typ: 'text', alias: ['bemerkung', 'notiz', 'notizen'] },
    ],
  },
  {
    key: 'expose',
    label: 'Exposé-Objekte',
    icon: '🏠',
    tabelle: 'expose',
    beschreibung: 'Immobilien-Objekte für Exposé und Vermarktung. Importierte Objekte kommen als Entwurf — veröffentlicht wird erst nach Ihrer Prüfung (Pflichtangaben Energieausweis).',
    schluesselFelder: ['bezeichnung+adresse', 'bezeichnung+ort'],
    eigeneFelderModul: 'expose',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/expose',
    listen: [
      { feld: 'objekt_art', label: 'Objektart', standard: 'wohnung', textFeld: 'objekt_text', liste: liste(['wohnung', 'haus', 'gewerbe', 'grundstueck'], { etw: 'wohnung', eigentumswohnung: 'wohnung', apartment: 'wohnung', einfamilienhaus: 'haus', efh: 'haus', mehrfamilienhaus: 'haus', mfh: 'haus', reihenhaus: 'haus', doppelhaushaelfte: 'haus', buero: 'gewerbe', laden: 'gewerbe', halle: 'gewerbe', gewerbeflaeche: 'gewerbe', grundstück: 'grundstueck', bauland: 'grundstueck' }) },
      { feld: 'vermarktung_art', label: 'Vermarktung', standard: 'kauf', textFeld: 'objekt_text', liste: liste(['kauf', 'miete'], { verkauf: 'kauf', kaufen: 'kauf', vermietung: 'miete', mieten: 'miete', pacht: 'miete' }) },
      { feld: 'energie_typ', label: 'Energieausweis', standard: '', textFeld: 'objekt_text', liste: liste(['bedarf', 'verbrauch'], { bedarfsausweis: 'bedarf', verbrauchsausweis: 'verbrauch' }) },
      // Nie direkt „aktiv": veroeffentlicht wird erst nach Pruefung der Pflichtangaben.
      { feld: 'status', label: 'Status', standard: 'entwurf', textFeld: 'objekt_text', liste: liste(['entwurf', 'reserviert', 'verkauft', 'vermietet'], { aktiv: 'entwurf', online: 'entwurf', veroeffentlicht: 'entwurf', verfuegbar: 'entwurf', frei: 'entwurf' }) },
    ],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'titel', 'objekt', 'objektname', 'name'] },
      { key: 'objekt_art', label: 'Objektart', typ: 'text', standard: 'wohnung', hinweis: 'wohnung · haus · gewerbe · grundstueck', alias: ['objekt art', 'objektart', 'art', 'typ', 'immobilienart'] },
      { key: 'vermarktung_art', label: 'Vermarktung', typ: 'text', standard: 'kauf', hinweis: 'kauf · miete', alias: ['vermarktung art', 'vermarktung', 'vermarktungsart', 'angebotsart'] },
      { key: 'ort', label: 'Ort', typ: 'text', alias: ['ort', 'stadt', 'gemeinde'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'strasse', 'straße', 'lage'] },
      { key: 'wohnflaeche', label: 'Wohnfläche m²', typ: 'zahl', alias: ['wohnflaeche', 'wohnfläche', 'flaeche', 'nutzflaeche', 'qm'] },
      { key: 'grundstuecksflaeche', label: 'Grundstücksfläche m²', typ: 'zahl', alias: ['grundstuecksflaeche', 'grundstücksfläche', 'grundstueck', 'grundstuecksgroesse'] },
      { key: 'zimmer', label: 'Zimmer', typ: 'zahl', alias: ['zimmer', 'zimmeranzahl', 'raeume'] },
      { key: 'baujahr', label: 'Baujahr', typ: 'zahl', alias: ['baujahr', 'erbaut'] },
      { key: 'etage', label: 'Etage', typ: 'text', alias: ['etage', 'geschoss', 'stockwerk'] },
      { key: 'verfuegbar_ab', label: 'Verfügbar ab', typ: 'datum', alias: ['verfuegbar ab', 'bezugsfrei ab', 'frei ab'] },
      { key: 'preis', label: 'Preis', typ: 'zahl', alias: ['preis', 'kaufpreis', 'kaltmiete', 'miete'] },
      { key: 'nebenkosten', label: 'Nebenkosten', typ: 'zahl', alias: ['nebenkosten', 'nk', 'hausgeld'] },
      { key: 'provision_prozent', label: 'Provision %', typ: 'zahl', alias: ['provision prozent', 'provision', 'courtage', 'kaeuferprovision'] },
      { key: 'energie_typ', label: 'Energieausweis-Art', typ: 'text', hinweis: 'bedarf · verbrauch', alias: ['energie typ', 'energieausweis', 'ausweisart', 'energieausweis art'] },
      { key: 'energiekennwert', label: 'Energiekennwert', typ: 'zahl', alias: ['energiekennwert', 'endenergie', 'kennwert', 'kwh m2 a'] },
      { key: 'energietraeger', label: 'Energieträger', typ: 'text', alias: ['energietraeger', 'energieträger', 'heizung', 'befeuerung'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'entwurf', hinweis: 'Aktive Objekte kommen als Entwurf.', alias: ['status'] },
      { key: 'objekt_text', label: 'Objektbeschreibung', typ: 'text', alias: ['objekt text', 'beschreibung', 'objektbeschreibung', 'text'] },
      { key: 'lage_text', label: 'Lagebeschreibung', typ: 'text', alias: ['lage text', 'lagebeschreibung'] },
      { key: 'ausstattung_text', label: 'Ausstattung', typ: 'text', alias: ['ausstattung text', 'ausstattung'] },
    ],
  },
  {
    key: 'kurse',
    label: 'Kurse',
    icon: '🎓',
    tabelle: 'bildung_kurse',
    beschreibung: 'Kursangebote mit Zeitraum, Ort, Dozent, Plätzen und Preis.',
    schluesselFelder: ['titel+start_am'],
    eigeneFelderModul: 'bildung_kurse',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/bildung',
    listen: [{ feld: 'art', label: 'Art', standard: 'einzeltermin', liste: liste(['einzeltermin', 'serie'], { einmalig: 'einzeltermin', termin: 'einzeltermin', tageskurs: 'einzeltermin', reihe: 'serie', kursreihe: 'serie', woechentlich: 'serie', mehrteilig: 'serie' }) }],
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'kurs', 'kursname', 'bezeichnung', 'name'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'einzeltermin', hinweis: 'einzeltermin · serie', alias: ['art', 'kursart', 'typ'] },
      { key: 'start_am', label: 'Beginn', typ: 'datum', alias: ['start am', 'start', 'beginn', 'von', 'kursbeginn'] },
      { key: 'ende_am', label: 'Ende', typ: 'datum', alias: ['ende am', 'ende', 'bis', 'kursende'] },
      { key: 'ort', label: 'Ort', typ: 'text', alias: ['ort', 'raum', 'veranstaltungsort'] },
      { key: 'dozent', label: 'Dozent/in', typ: 'text', alias: ['dozent', 'dozentin', 'trainer', 'kursleitung', 'referent'] },
      { key: 'plaetze', label: 'Plätze', typ: 'zahl', standard: 10, alias: ['plaetze', 'plätze', 'teilnehmer max', 'max teilnehmer', 'kapazitaet'] },
      { key: 'preis', label: 'Preis', typ: 'zahl', alias: ['preis', 'kursgebuehr', 'gebuehr', 'kosten'] },
      { key: 'zertifikat_aktiv', label: 'Teilnahmebescheinigung', typ: 'jaNein', alias: ['zertifikat aktiv', 'zertifikat', 'bescheinigung', 'teilnahmebescheinigung'] },
    ],
  },
  {
    key: 'veranstaltungen',
    label: 'Veranstaltungen',
    icon: '🎫',
    tabelle: 'event_veranstaltung',
    beschreibung: 'Events mit Beginn, Kapazität, Preis und Status.',
    schluesselFelder: ['titel+beginn'],
    eigeneFelderModul: 'event_veranstaltung',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/veranstaltungen',
    listen: [
      { feld: 'art', label: 'Art', standard: 'sonstige', liste: liste(['konzert', 'workshop', 'tagung', 'fest', 'vortrag', 'kurs', 'sonstige'], { auffuehrung: 'konzert', theater: 'konzert', seminar: 'workshop', konferenz: 'tagung', messe: 'tagung', feier: 'fest', party: 'fest', lesung: 'vortrag', webinar: 'vortrag' }) },
      { feld: 'status', label: 'Status', standard: 'geplant', liste: liste(['geplant', 'aktiv', 'ausverkauft', 'abgesagt', 'beendet'], { offen: 'aktiv', buchbar: 'aktiv', 'im verkauf': 'aktiv', voll: 'ausverkauft', storniert: 'abgesagt', abgeschlossen: 'beendet', vorbei: 'beendet' }) },
    ],
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'veranstaltung', 'event', 'name', 'bezeichnung'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'sonstige', hinweis: 'konzert · workshop · tagung · fest · vortrag · kurs · sonstige', alias: ['art', 'typ', 'kategorie'] },
      { key: 'ort', label: 'Ort', typ: 'text', alias: ['ort', 'location', 'veranstaltungsort', 'raum'] },
      { key: 'beginn', label: 'Beginn', typ: 'datumZeit', alias: ['beginn', 'start', 'datum', 'von', 'einlass'] },
      { key: 'ende', label: 'Ende', typ: 'datumZeit', alias: ['ende', 'bis'] },
      { key: 'kapazitaet', label: 'Kapazität', typ: 'zahl', alias: ['kapazitaet', 'kapazität', 'plaetze', 'max teilnehmer', 'tickets'] },
      { key: 'preis', label: 'Preis', typ: 'zahl', alias: ['preis', 'eintritt', 'ticketpreis'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'geplant', hinweis: 'geplant · aktiv · ausverkauft · abgesagt · beendet', alias: ['status'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'text', 'notiz'] },
    ],
  },
  {
    key: 'reservierung_plaetze',
    label: 'Reservierbare Plätze',
    icon: '🪑',
    tabelle: 'reservierung_platz',
    beschreibung: 'Tische, Lager- und Thekenplätze zum Reservieren.',
    schluesselFelder: ['bezeichnung+standort', 'bezeichnung'],
    eigeneFelderModul: 'reservierung_platz',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/reservierung',
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv'], { 'in betrieb': 'aktiv', 'in nutzung': 'aktiv', offen: 'aktiv', ja: 'aktiv' }) }, { feld: 'art', label: 'Art', standard: 'tisch', textFeld: 'notiz', liste: liste(['tisch', 'lagerplatz', 'theke'], { platz: 'tisch', sitzplatz: 'tisch', lager: 'lagerplatz', stellplatz: 'lagerplatz', einlagerung: 'lagerplatz', tresen: 'theke', abholung: 'theke' }) }],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'tisch', 'platz', 'name', 'nummer'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'tisch', hinweis: 'tisch · lagerplatz · theke', alias: ['art', 'typ'] },
      { key: 'standort', label: 'Bereich', typ: 'text', alias: ['standort', 'bereich', 'raum', 'zone'] },
      { key: 'kapazitaet', label: 'Kapazität', typ: 'zahl', alias: ['kapazitaet', 'kapazität', 'plaetze', 'personen', 'sitzplaetze'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung'] },
    ],
  },
  {
    key: 'belegung',
    label: 'Belegungs-Einheiten',
    icon: '🗓',
    tabelle: 'belegung_einheit',
    beschreibung: 'Zimmer, Ferienwohnungen, Stellplätze und Räume mit Preis je Nacht/Tag/Stunde — Buchungen folgen im Modul.',
    schluesselFelder: ['einheit_nr', 'bezeichnung'],
    eigeneFelderModul: 'belegung_einheit',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/belegung',
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', liste: liste(['aktiv'], { 'in betrieb': 'aktiv', 'in nutzung': 'aktiv', offen: 'aktiv', ja: 'aktiv' }) }, { feld: 'abrechnungsart', label: 'Abrechnung', standard: 'nacht', liste: liste(['nacht', 'tag', 'stunde'], { 'pro nacht': 'nacht', uebernachtung: 'nacht', 'pro tag': 'tag', tageweise: 'tag', 'pro stunde': 'stunde', stuendlich: 'stunde' }) }],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'zimmer', 'einheit', 'name', 'objekt'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'zimmertyp', 'typ', 'art'] },
      { key: 'einheit_nr', label: 'Nummer', typ: 'text', alias: ['einheit nr', 'zimmernummer', 'zimmer nr', 'nummer', 'nr'] },
      { key: 'abrechnungsart', label: 'Abrechnung', typ: 'text', standard: 'nacht', hinweis: 'nacht · tag · stunde', alias: ['abrechnungsart', 'abrechnung', 'preis pro'] },
      { key: 'preis_pro_einheit', label: 'Preis je Einheit', typ: 'zahl', alias: ['preis pro einheit', 'preis', 'preis pro nacht', 'uebernachtungspreis', 'tagespreis'] },
      { key: 'grundgebuehr', label: 'Grundgebühr', typ: 'zahl', alias: ['grundgebuehr', 'grundgebühr', 'endreinigung', 'pauschale'] },
      { key: 'kaution', label: 'Kaution', typ: 'zahl', alias: ['kaution'] },
      { key: 'max_belegung', label: 'Max. Personen', typ: 'zahl', alias: ['max belegung', 'max personen', 'betten', 'personen'] },
      { key: 'mwst_satz', label: 'MwSt %', typ: 'zahl', standard: 7, alias: ['mwst satz', 'mwst', 'ust', 'steuersatz'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', alias: ['status'] },
    ],
  },
  {
    key: 'erinnerungen',
    label: 'Erinnerungen',
    icon: '🔔',
    tabelle: 'erinnerung',
    beschreibung: 'Wiedervorlagen und Erinnerungstermine. Versendet wird nichts automatisch — Sie entscheiden je Erinnerung.',
    schluesselFelder: ['titel+faellig_am'],
    eigeneFelderModul: 'erinnerung',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/erinnerungen',
    // E-Mail-Adressen fuer den Versand nicht aus Dateien (Werbe-Einwilligung) — die Seite waehlt den Kontakt.
    ausblenden: ['email', 'bezug_id', 'versendet_am', 'gesendet_am'],
    listen: [
      { feld: 'kanal', label: 'Kanal', standard: 'telefon', textFeld: 'notiz', liste: liste(['telefon', 'email', 'sms', 'whatsapp', 'brief', 'persoenlich'], { anruf: 'telefon', tel: 'telefon', 'e mail': 'email', mail: 'email', post: 'brief', persönlich: 'persoenlich', 'vor ort': 'persoenlich' }) },
      { feld: 'bezug_typ', label: 'Bezug', standard: 'frei', liste: liste(['termin', 'reservierung', 'frei'], { sonstiges: 'frei', allgemein: 'frei' }) },
      { feld: 'status', label: 'Status', standard: 'offen', textFeld: 'notiz', liste: liste(['offen', 'erledigt', 'entfallen'], { neu: 'offen', faellig: 'offen', done: 'erledigt', abgeschlossen: 'erledigt', erinnert: 'erledigt', storniert: 'entfallen', abgesagt: 'entfallen' }) },
    ],
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'betreff', 'erinnerung', 'aufgabe', 'bezeichnung'] },
      { key: 'kanal', label: 'Kanal', typ: 'text', standard: 'telefon', hinweis: 'telefon · email · sms · whatsapp · brief · persoenlich', alias: ['kanal', 'art', 'weg'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', alias: ['kunde name', 'kunde', 'kundenname', 'name', 'kontakt'] },
      { key: 'faellig_am', label: 'Fällig am', typ: 'datum', pflicht: true, alias: ['faellig am', 'fällig am', 'faellig', 'wiedervorlage', 'datum', 'erinnern am'] },
      { key: 'termin_am', label: 'Termin am', typ: 'datum', alias: ['termin am', 'termin', 'termindatum'] },
      { key: 'bezug_typ', label: 'Bezug', typ: 'text', standard: 'frei', hinweis: 'termin · reservierung · frei', alias: ['bezug typ', 'bezug'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'offen', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'text'] },
    ],
  },
  {
    key: 'gutachten',
    label: 'Gutachten',
    icon: '📑',
    tabelle: 'gutachten',
    beschreibung: 'Gutachten und Sachverständigen-Vorgänge mit Auftraggeber, Objekt und Aktenzeichen.',
    schluesselFelder: ['aktenzeichen', 'titel+datum'],
    eigeneFelderModul: 'gutachten',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/gutachten',
    listen: [{ feld: 'status', label: 'Status', standard: 'entwurf', textFeld: 'zusammenfassung', liste: liste(['entwurf', 'fertig'], { offen: 'entwurf', neu: 'entwurf', 'in bearbeitung': 'entwurf', laufend: 'entwurf', abgeschlossen: 'fertig', erledigt: 'fertig', versendet: 'fertig', erstellt: 'fertig' }) }],
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'gutachten', 'bezeichnung', 'betreff'] },
      { key: 'auftraggeber', label: 'Auftraggeber', typ: 'text', alias: ['auftraggeber', 'kunde', 'mandant', 'besteller'] },
      { key: 'objekt', label: 'Objekt', typ: 'text', alias: ['objekt', 'gegenstand', 'fahrzeug', 'immobilie', 'adresse'] },
      { key: 'art', label: 'Art', typ: 'text', alias: ['art', 'gutachtenart', 'typ'] },
      { key: 'aktenzeichen', label: 'Aktenzeichen', typ: 'text', alias: ['aktenzeichen', 'az', 'vorgangsnummer', 'auftragsnummer'] },
      { key: 'datum', label: 'Datum', typ: 'datum', alias: ['datum', 'auftragsdatum', 'erstellt am', 'ortstermin'] },
      { key: 'gutachter', label: 'Gutachter/in', typ: 'text', alias: ['gutachter', 'sachverstaendiger', 'bearbeiter'] },
      { key: 'stunden', label: 'Stunden', typ: 'zahl', alias: ['stunden', 'aufwand', 'zeitaufwand'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'entwurf', alias: ['status'] },
      { key: 'zusammenfassung', label: 'Zusammenfassung', typ: 'text', alias: ['zusammenfassung', 'ergebnis', 'notiz', 'bemerkung'] },
    ],
  },
  {
    key: 'schlaege',
    label: 'Schläge (Landwirtschaft)',
    icon: '🌾',
    tabelle: 'schlag',
    beschreibung: 'Feldstücke und Schläge mit Fläche und Kultur für die Schlagkartei.',
    schluesselFelder: ['bezeichnung+flurstueck', 'bezeichnung'],
    eigeneFelderModul: 'schlag',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/schlagkartei',
    // Das Modul kennt nur „aktiv" (Anlegen) — andere Werte bleiben im Text.
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv'], { 'in betrieb': 'aktiv', 'in nutzung': 'aktiv', offen: 'aktiv', ja: 'aktiv' }) }],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'schlag', 'schlagname', 'feldstueck', 'feldstück', 'name'] },
      { key: 'flurstueck', label: 'Flurstück', typ: 'text', alias: ['flurstueck', 'flurstück', 'flur', 'flik', 'feldblock'] },
      { key: 'flaeche_ha', label: 'Fläche (ha)', typ: 'zahl', alias: ['flaeche ha', 'fläche ha', 'flaeche', 'fläche', 'hektar', 'ha'] },
      { key: 'kultur', label: 'Kultur', typ: 'text', alias: ['kultur', 'frucht', 'hauptfrucht', 'anbau'] },
      { key: 'kultur_jahr', label: 'Anbaujahr', typ: 'zahl', alias: ['kultur jahr', 'anbaujahr', 'erntejahr', 'jahr'] },
      { key: 'aussaat_am', label: 'Aussaat', typ: 'datum', alias: ['aussaat am', 'aussaat', 'saat', 'gesaet am'] },
      { key: 'ernte_am', label: 'Ernte', typ: 'datum', alias: ['ernte am', 'ernte', 'geerntet am'] },
      { key: 'standort', label: 'Standort / Gemarkung', typ: 'text', alias: ['standort', 'gemarkung', 'lage', 'ort'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung'] },
    ],
  },
  {
    key: 'tiergruppen',
    label: 'Tierbestand',
    icon: '🐄',
    tabelle: 'tier_gruppe',
    beschreibung: 'Tiergruppen mit Betriebsnummer und aktuellem Bestand (Landwirtschaft). Einzeltier-Akten von Tierärzten kommen erst nach der Anwalts-Prüfung.',
    schluesselFelder: ['bezeichnung+betriebsnummer', 'bezeichnung'],
    eigeneFelderModul: 'tier_gruppe',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/tierbestand',
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv'], { 'in betrieb': 'aktiv', 'in nutzung': 'aktiv', offen: 'aktiv', ja: 'aktiv' }) }, { feld: 'tierart', label: 'Tierart', standard: 'sonstige', textFeld: 'notiz', liste: liste(['rind', 'schwein', 'schaf', 'ziege', 'pferd', 'gefluegel', 'sonstige'], { rinder: 'rind', kuh: 'rind', kuehe: 'rind', milchkuehe: 'rind', kalb: 'rind', kaelber: 'rind', schweine: 'schwein', ferkel: 'schwein', sau: 'schwein', mastschweine: 'schwein', schafe: 'schaf', laemmer: 'schaf', ziegen: 'ziege', pferde: 'pferd', gefluegel: 'gefluegel', geflügel: 'gefluegel', huehner: 'gefluegel', legehennen: 'gefluegel', puten: 'gefluegel', enten: 'gefluegel', gaense: 'gefluegel' }) }],
    felder: [
      { key: 'tierart', label: 'Tierart', typ: 'text', pflicht: true, hinweis: 'rind · schwein · schaf · ziege · pferd · gefluegel · sonstige', alias: ['tierart', 'art', 'tiere'] },
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'gruppe', 'tiergruppe', 'stall', 'name'] },
      { key: 'betriebsnummer', label: 'Betriebsnummer (VVVO)', typ: 'text', alias: ['betriebsnummer', 'vvvo', 'vvvo nummer', 'registriernummer'] },
      { key: 'standort', label: 'Standort / Stall', typ: 'text', alias: ['standort', 'stall', 'ort'] },
      { key: 'meldefrist_tage', label: 'Meldefrist (Tage)', typ: 'zahl', standard: 7, alias: ['meldefrist tage', 'meldefrist'] },
      { key: 'aktueller_bestand', label: 'Aktueller Bestand', typ: 'zahl', alias: ['aktueller bestand', 'bestand', 'anzahl', 'stueckzahl', 'tiere anzahl'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung'] },
    ],
  },
  {
    key: 'ertraege',
    label: 'Anlagen (Erträge/Energie)',
    icon: '☀️',
    tabelle: 'ertrag_anlage',
    beschreibung: 'PV-, BHKW-, Wind- und Speicher-Anlagen mit Leistung, Soll-Ertrag und Vergütung.',
    schluesselFelder: ['bezeichnung+standort', 'bezeichnung'],
    eigeneFelderModul: 'ertrag_anlage',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/ertraege',
    listen: [
      { feld: 'typ', label: 'Typ', standard: 'sonstige', liste: liste(['pv', 'bhkw', 'wind', 'speicher', 'waermepumpe', 'sonstige'], { photovoltaik: 'pv', solar: 'pv', 'pv anlage': 'pv', blockheizkraftwerk: 'bhkw', windkraft: 'wind', windrad: 'wind', batterie: 'speicher', batteriespeicher: 'speicher', wärmepumpe: 'waermepumpe', wp: 'waermepumpe' }) },
      { feld: 'status', label: 'Status', standard: 'aktiv', liste: liste(['aktiv', 'wartung', 'stillgelegt'], { 'in betrieb': 'aktiv', laufend: 'aktiv', stoerung: 'wartung', 'in wartung': 'wartung', abgeschaltet: 'stillgelegt', ausser_betrieb: 'stillgelegt', 'ausser betrieb': 'stillgelegt' }) },
    ],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'anlage', 'name', 'anlagenname'] },
      { key: 'typ', label: 'Typ', typ: 'text', standard: 'sonstige', hinweis: 'pv · bhkw · wind · speicher · waermepumpe · sonstige', alias: ['typ', 'art', 'anlagentyp'] },
      { key: 'standort', label: 'Standort', typ: 'text', alias: ['standort', 'ort', 'adresse', 'dach'] },
      { key: 'nennleistung_kwp', label: 'Nennleistung (kWp/kW)', typ: 'zahl', alias: ['nennleistung kwp', 'nennleistung', 'leistung', 'kwp', 'kw'] },
      { key: 'soll_spezifisch', label: 'Soll-Ertrag je kWp', typ: 'zahl', alias: ['soll spezifisch', 'soll ertrag', 'spezifischer ertrag', 'kwh kwp'] },
      { key: 'verguetung_ct', label: 'Vergütung (ct/kWh)', typ: 'zahl', alias: ['verguetung ct', 'verguetung', 'vergütung', 'einspeiseverguetung', 'eeg verguetung'] },
      { key: 'strompreis_ct', label: 'Strompreis (ct/kWh)', typ: 'zahl', alias: ['strompreis ct', 'strompreis', 'bezugspreis'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · wartung · stillgelegt', alias: ['status'] },
    ],
  },
  {
    key: 'freigaben',
    label: 'Freigaben & Assets',
    icon: '✅',
    tabelle: 'proof_asset',
    beschreibung: 'Kreativ-Assets (Entwürfe, Videos, Texte) für Freigabe und Proofing mit dem Kunden.',
    schluesselFelder: ['titel+kunde', 'titel'],
    eigeneFelderModul: 'proof_asset',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/freigaben',
    listen: [{ feld: 'kategorie', label: 'Kategorie', standard: 'sonstige', liste: liste(['design', 'video', 'text', 'web', 'print', 'social', 'sonstige'], { grafik: 'design', logo: 'design', layout: 'design', film: 'video', clip: 'video', motion: 'video', texte: 'text', copy: 'text', website: 'web', webseite: 'web', druck: 'print', flyer: 'print', plakat: 'print', 'social media': 'social', instagram: 'social', linkedin: 'social' }) }],
    felder: [
      { key: 'titel', label: 'Titel', typ: 'text', pflicht: true, alias: ['titel', 'asset', 'bezeichnung', 'name', 'datei'] },
      { key: 'kunde', label: 'Kunde', typ: 'text', alias: ['kunde', 'kundenname', 'auftraggeber'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', standard: 'sonstige', hinweis: 'design · video · text · web · print · social · sonstige', alias: ['kategorie', 'art', 'typ'] },
    ],
  },
];

export function zielDef(key: string): ImportZiel | undefined {
  return ZIELE.find((z) => z.key === key);
}

// ---------------------------------------------------------------------------
// 3b) Mustervorlagen — eine CSV, die garantiert passt
//
// Statt fuer jede Branche eine eigene Datei zu pflegen, wird die Vorlage aus
// dem Ziel-Katalog GEBAUT. Neues Feld im Katalog = neue Spalte in der Vorlage,
// ohne dass irgendwo eine Datei nachgezogen werden muss.
// ---------------------------------------------------------------------------

const BEISPIELE: Record<string, Record<string, string>> = {
  kontakte: {
    kundennummer: 'K-1001|K-1002|K-1003',
    anrede: 'Frau|Herr|Frau',
    strasse: 'Hauptstraße 12|Industriering 4|Am Markt 3',
    plz: '45127|70565|71032',
    ort: 'Essen|Stuttgart|Böblingen',
    land: 'DE|DE|DE',
    mobil: '|0170 9876543|',
    website: 'www.muster.de|www.beispiel-handwerk.de|',
    ust_id: 'DE123456789||',
    import_schluessel: '||',
    firma: 'Muster GmbH|Beispiel Handwerk e.K.|',
    vorname: 'Anna|Thomas|Petra',
    nachname: 'Berger|Klein|Wagner',
    email: 'a.berger@muster.de|info@beispiel-handwerk.de|p.wagner@web.de',
    telefon: '0201 1234567|0170 9876543|0711 4455667',
    position: 'Einkauf|Inhaber|',
    status: 'kunde|interessent|interessent',
    quelle: 'Empfehlung|Messe|Website',
    notizen: 'Zahlt immer puenktlich|Ueber Kollegen gekommen|Privatkunde, keine Firma',
  },
  artikel: {
    bezeichnung: 'Sechskantschraube M8x40|Dichtungsband 10m|Arbeitsstunde Monteur',
    artikelnummer: 'A-1001|A-1002|L-500',
    beschreibung: 'verzinkt, DIN 933|selbstklebend, grau|Regelarbeitszeit',
    kategorie: 'Verbindungstechnik|Dichtstoffe|Leistungen',
    einheit: 'Stk|Rolle|Std',
    einkaufspreis: '0,45|3,90|0,00',
    verkaufspreis: '1,20|8,50|68,00',
    aktueller_bestand: '250|40|0',
    mindestbestand: '50|10|0',
    lagerort: 'Regal A3|Regal B1|',
    ean: '4012345678901|4012345678902|',
    aktiv: 'ja|ja|ja',
  },
  lieferanten: {
    lieferantennummer: 'L-01|L-02|L-03',
    ust_id: 'DE987654321||',
    name: 'Grosshandel Nord GmbH|Werkzeug Sued AG|Elektro Mitte KG',
    ansprechpartner: 'Frau Meier|Herr Bauer|',
    email: 'bestellung@grosshandel-nord.de|vertrieb@werkzeug-sued.de|info@elektro-mitte.de',
    telefon: '040 1234567|089 7654321|',
    adresse: 'Hafenstrasse 12, 20457 Hamburg|Industriering 4, 80939 Muenchen|Am Kanal 7, 34117 Kassel',
    website: 'www.grosshandel-nord.de|www.werkzeug-sued.de|',
    kundennummer: 'K-88123|4711|',
    notizen: 'Lieferung Di und Do|Ab 500 EUR frei Haus|Nur Abholung',
  },
  rechnungen: {
    kunde: 'K-1001|K-1002|info@muster.de',
    rechnungsnummer: 'RE-2025-0142|RE-2025-0143|RE-2025-0144',
    titel: 'Wartung Anlage Halle 2|Montage Türelement|Materiallieferung KW 22',
    rechnungsdatum: '12.05.2025|28.05.2025|02.06.2025',
    faelligkeitsdatum: '26.05.2025|11.06.2025|16.06.2025',
    netto_summe: '1250,00|480,00|318,50',
    mwst_summe: '237,50|91,20|60,52',
    brutto_summe: '1487,50|571,20|379,02',
    bezahlter_betrag: '0,00|200,00|379,02',
    zahlungsstatus: 'offen|teilbezahlt|bezahlt',
    notizen: 'Aus Altsystem uebernommen|Anzahlung erhalten|',
  },
};

// Schritt 3: Beispiele der weiteren Ziele (gleiche Musterfirma wie oben)
Object.assign(BEISPIELE, {
  leistungskatalog: {
    bezeichnung: 'Montagestunde Geselle|Steckdose setzen inkl. Material|Kabelkanal verlegen',
    kuerzel: 'L-01|L-02|L-03',
    kategorie: 'Arbeitszeit|Installation|Installation',
    einheit: 'Std|Stück|lfm',
    erfassungsart: '||',
    standard_wert: '1|1|1',
    festpreis_netto: '||',
    mwst_satz: '19|19|19',
    notiz: '|inkl. Anfahrt im Stadtgebiet|',
    aktiv: 'ja|ja|ja',
  },
  wartungsvertraege: {
    titel: 'Prüfung ortsveränderliche Geräte|Wartung Ladeinfrastruktur|E-Check Wohnanlage',
    kunde_name: 'Muster GmbH|Beispiel Handwerk e.K.|Petra Wagner',
    vertragsnummer: 'W-0001|W-0002|W-0003',
    status: 'aktiv|aktiv|pausiert',
    beginn_am: '01.03.2023|15.07.2024|01.01.2022',
    intervall_monate: '12|24|48',
    letzte_wartung_am: '01.03.2026|15.07.2024|',
    naechste_faelligkeit_am: '||',
    erinnerung_tage_vorher: '30|30|30',
    betrag_netto: '480,00|2.280,00|350,00',
    mwst_satz: '19|19|19',
    beschreibung: 'DGUV V3 laut Vertrag|4 Ladepunkte|',
    notiz: '||',
  },
  verkaufschancen: {
    titel: 'Hallenbeleuchtung auf LED|Wallbox Firmenparkplatz|PV-Anlage Privathaus',
    kunde: 'K-1001|K-1002|p.wagner@web.de',
    phase: 'erstkontakt|angebot|verhandlung',
    wert: '28.000,00|6.400,00|18.900,00',
    wahrscheinlichkeit: '10|50|70',
    erwartetes_abschlussdatum: '31.12.2026|15.11.2026|30.10.2026',
    notizen: '||',
  },
  kontakt_aktivitaeten: {
    kunde: 'K-1001|K-1002|p.wagner@web.de',
    aktivitaet_am: '22.09.2026|28.08.2026|02.09.2026',
    typ: 'Anruf|E-Mail|Termin',
    inhalt: 'Interesse an Wallbox|Angebot nachgefasst|Aufmaß vor Ort',
  },
  leads: {
    name: 'Georg Faulhaber|Sven Klein|Muster GmbH',
    email: 'g.faulhaber@web.de|s.klein@web.de|info@muster.de',
    telefon: '0151 1234567|0176 7654321|0201 1234567',
    plz: '71116|71083|45127',
    ort: 'Gärtringen|Herrenberg|Essen',
    dienstleistung: 'PV-Anlage mit Speicher|Wallbox|Beleuchtung Halle',
    nachricht: '||',
    quelle: 'Empfehlung|Website|Messe',
    status: 'neu|offen|neu',
  },
} as Record<string, Record<string, string>>);

/**
 * Wie viele Beispielzeilen eine Mustervorlage bekommt. Drei Zeilen zeigen
 * mehr als zwei: eine gefuellte, eine abweichende und eine mit bewusst
 * leeren Feldern — damit sieht der Kunde, was Pflicht ist und was nicht.
 */
export const ZEILEN_JE_MUSTERVORLAGE = 3;

/**
 * Baut eine Muster-CSV fuer ein Import-Ziel: Kopfzeile mit allen Feldern
 * (Pflichtfelder mit *) und drei ausgefuellten Beispielzeilen. Semikolon als
 * Trennzeichen und BOM voran — damit deutsches Excel sie beim Doppelklick
 * korrekt in Spalten legt und Umlaute richtig zeigt.
 *
 * Fehlt zu einem Feld ein Beispielwert, bleibt die Zelle leer — nie undefined,
 * nie eine Spalte weniger als in der Kopfzeile.
 */
export function baueMustervorlage(zielKey: string): string {
  const ziel = zielDef(zielKey);
  if (!ziel) return '';

  const beispiel = BEISPIELE[zielKey] ?? {};
  const felder = ziel.felder.filter((f) => !f.nichtInVorlage);
  const kopf = felder.map((f) => f.label + (f.pflicht ? ' *' : ''));

  const zeilen: string[][] = Array.from({ length: ZEILEN_JE_MUSTERVORLAGE }, () => [] as string[]);
  for (const f of felder) {
    const teile = (beispiel[f.key] ?? '').split('|');
    for (let i = 0; i < ZEILEN_JE_MUSTERVORLAGE; i++) {
      zeilen[i]?.push(teile[i] ?? '');
    }
  }

  const feldRaus = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + [kopf, ...zeilen].map((z) => z.map(feldRaus).join(';')).join('\r\n') + '\r\n';
}

/** Passt eine gespeicherte Zuordnung zu dieser Datei? Vergleicht die Kopfzeilen. */
export function passtZuordnung(gespeichert: string[], aktuell: string[]): boolean {
  if (!Array.isArray(gespeichert) || gespeichert.length === 0) return false;
  const a = gespeichert.map(normal).filter(Boolean).sort().join('|');
  const b = aktuell.map(normal).filter(Boolean).sort().join('|');
  return a === b;
}

// ---------------------------------------------------------------------------
// 4) Spalten erraten
// ---------------------------------------------------------------------------

/** Vereinheitlicht Spaltennamen fuer den Vergleich: Umlaute, Zeichen, Leerraum. */
export function normal(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mapping: Spaltenname aus der Datei -> Zielfeld-Key ('' = nicht importieren). */
export type Mapping = Record<string, string>;

/**
 * Ordnet die Spalten der Datei automatisch den Zielfeldern zu.
 * Drei Stufen: exakter Treffer auf Feldname/Alias, dann Teiltreffer,
 * dann nichts — lieber offen lassen als falsch raten.
 */
export function errateMapping(kopf: string[], zielKey: string): Mapping {
  const ziel = zielDef(zielKey);
  if (!ziel) return {};
  return errateMappingFuer(kopf, ziel);
}

/**
 * Schritt 2: dieselbe Erkennung fuer ein Ziel mit Feldern aus dem
 * Feldkatalog der Datenbank — plus die belegten Spaltennamen eines
 * Altsystems (extraAlias), die VOR allen allgemeinen Aliasen zaehlen.
 */
export function errateMappingFuer(kopf: string[], ziel: ImportZiel, extraAlias: Record<string, string[]> = {}): Mapping {
  const map: Mapping = {};
  const vergeben = new Set<string>();
  const feldKeys = new Set(ziel.felder.map((f) => f.key));

  // Stufe 0: belegte Spaltennamen des Altsystems (exakt)
  for (const spalte of kopf) {
    const n = normal(spalte);
    if (!n) continue;
    for (const [feld, namen] of Object.entries(extraAlias)) {
      if (!feldKeys.has(feld) || vergeben.has(feld)) continue;
      if (namen.some((x) => normal(x) === n)) { map[spalte] = feld; vergeben.add(feld); break; }
    }
  }

  const kandidaten = ziel.felder.map((f) => ({
    key: f.key,
    nurExakt: !!f.nurExakt,
    begriffe: [normal(f.key), normal(f.label), ...f.alias.map(normal)].filter((x) => x.length > 0),
  }));

  // Stufe 1: exakte Treffer
  for (const spalte of kopf) {
    if (map[spalte]) continue;
    const n = normal(spalte);
    if (!n) continue;
    const treffer = kandidaten.find((k) => !vergeben.has(k.key) && k.begriffe.includes(n));
    if (treffer) { map[spalte] = treffer.key; vergeben.add(treffer.key); }
  }

  // Stufe 2: Teiltreffer (laengster Begriff gewinnt, um "preis" vor "einkaufspreis" zu vermeiden)
  for (const spalte of kopf) {
    if (map[spalte]) continue;
    const n = normal(spalte);
    if (n.length < 2) continue;
    let bester: { key: string; laenge: number } | null = null;
    for (const k of kandidaten) {
      if (vergeben.has(k.key) || k.nurExakt) continue;
      for (const b of k.begriffe) {
        if (b.length < 3) continue;
        // Schritt 3: nur GANZE Woerter. Vorher wurde „Kundengruppe" zu Firma
        // (steckt „kunde" drin) und „Art" zu Artikelnummer — still falsch.
        if (n === b || (' ' + n + ' ').includes(' ' + b + ' ') || (' ' + b + ' ').includes(' ' + n + ' ')) {
          if (!bester || b.length > bester.laenge) bester = { key: k.key, laenge: b.length };
        }
      }
    }
    if (bester) { map[spalte] = bester.key; vergeben.add(bester.key); }
  }

  for (const spalte of kopf) if (!map[spalte]) map[spalte] = '';
  return map;
}

/** Welche Pflichtfelder sind im Mapping noch nicht zugeordnet? */
export function fehlendePflichtfelder(mapping: Mapping, zielKey: string, zielObjekt?: ImportZiel): ZielFeld[] {
  const ziel = zielObjekt ?? zielDef(zielKey);
  if (!ziel) return [];
  const zugeordnet = new Set(Object.values(mapping).filter(Boolean));
  return ziel.felder.filter((f) => f.pflicht && !zugeordnet.has(f.key));
}

// ---------------------------------------------------------------------------
// 5) Zeilen pruefen und umwandeln
// ---------------------------------------------------------------------------

export type ZeilenFehler = { zeile: number; feld: string; meldung: string };

export type ZeilenErgebnis = {
  /** Fertiger Datensatz zum Speichern — null, wenn die Zeile unbrauchbar ist. */
  werte: Record<string, unknown> | null;
  fehler: ZeilenFehler[];
  warnungen: ZeilenFehler[];
};

/**
 * Felder, bei denen eine unlesbare Zahl KEINE Warnung sein darf.
 *
 * BEFUND 2, zweiter Teil: Bisher wurde aus "5,00 EUR" eine Warnung und der
 * Standardwert 0 — der Satz lief trotzdem durch. Bei einer offenen Rechnung
 * heisst das: sie kommt mit 0,00 EUR an, gilt sofort als bezahlt und fehlt
 * in Mahnwesen und Cashflow. Die Warnung steht derweil in einer Liste, die
 * bei 500 Zeilen niemand liest.
 *
 * Bei diesen Feldern ist eine unlesbare Zahl deshalb ein FEHLER: die Zeile
 * faellt raus und wird benannt, statt still falsch anzukommen.
 */
export const GELDFELDER: readonly string[] = [
  'netto_summe', 'mwst_summe', 'brutto_summe', 'bezahlter_betrag',
  'einkaufspreis', 'verkaufspreis',
  // Schritt 3: Preise und Werte der weiteren Ziele
  'preis', 'festpreis_netto', 'wert', 'betrag_netto',
  // Schritt 3 Teil 2
  'netto', 'ust_betrag', 'brutto', 'anschaffungskosten', 'kosten_betrag', 'budget_betrag',
  // Paket 127: Bestellpositionen
  'einzelpreis', 'gesamt_netto',
];

export type ZeilenOptionen = {
  /** Dezimaltrennzeichen der Datei, aus rateDezimaltrenner(). */
  dezimal?: Dezimaltrenner;
  /** Steuersatz fuer die Brutto-Rueckrechnung, wenn nur Brutto geliefert wird. */
  steuersatz?: number;
  /** Bezugsdatum fuer zweistellige Jahreszahlen. */
  heute?: Date;
  /**
   * Schritt 2: das Ziel mit den Feldern aus dem Feldkatalog der Datenbank.
   * Ohne Angabe gilt der feste Katalog (ZIELE) wie bisher.
   */
  ziel?: ImportZiel;
  /**
   * Schritt 2: eine Zeile begruendet ablehnen, bevor sie geprueft wird —
   * z. B. ein Kreditor in einer DATEV-Datei, die als Kunden importiert wird.
   * Gibt den Grund zurueck oder null.
   */
  ablehnen?: (zeile: string[]) => { feld: string; grund: string } | null;
};

/** Standard-Steuersatz, wenn keiner uebergeben wird. Eine EINGABE, kein Gesetz. */
export const STEUERSATZ_STANDARD = 19;

/**
 * Wandelt EINE Datei-Zeile in einen Datensatz um.
 * nummer = Zeilennummer wie in Excel (Kopfzeile = 1, erste Datenzeile = 2).
 */
export function pruefeZeile(
  zielKey: string,
  mapping: Mapping,
  kopf: string[],
  zeile: string[],
  nummer: number,
  opt: ZeilenOptionen = {},
): ZeilenErgebnis {
  const ziel = opt.ziel ?? zielDef(zielKey);
  const fehler: ZeilenFehler[] = [];
  const warnungen: ZeilenFehler[] = [];
  if (!ziel) return { werte: null, fehler: [{ zeile: nummer, feld: '', meldung: 'Unbekanntes Import-Ziel' }], warnungen };
  const abgelehnt = opt.ablehnen?.(zeile) ?? null;
  if (abgelehnt) return { werte: null, fehler: [{ zeile: nummer, feld: abgelehnt.feld, meldung: abgelehnt.grund }], warnungen };
  // Schritt 3 Teil 2: Filterfeld des Ziels (z. B. Art = Angebot)
  if (ziel.ablehnenWenn) {
    const i = kopf.findIndex((sp) => mapping[sp] === ziel.ablehnenWenn!.feld);
    const w = i >= 0 ? normal(zeile[i] ?? '') : '';
    if (w && ziel.ablehnenWenn.werte.some((x) => normal(x) === w)) {
      const label = ziel.felder.find((f) => f.key === ziel.ablehnenWenn!.feld)?.label ?? ziel.ablehnenWenn.feld;
      return { werte: null, fehler: [{ zeile: nummer, feld: label, meldung: ziel.ablehnenWenn.grund }], warnungen };
    }
  }
  const dezimal = opt.dezimal ?? 'unbekannt';
  const heute = opt.heute ?? new Date();

  const roh: Record<string, string> = {};
  kopf.forEach((spalte, i) => {
    const feldKey = mapping[spalte];
    if (feldKey) roh[feldKey] = (zeile[i] ?? '').trim();
  });

  const werte: Record<string, unknown> = {};

  for (const f of ziel.felder) {
    const eingabe = roh[f.key];
    const leer = eingabe === undefined || eingabe === '';

    if (leer) {
      if (f.pflicht) { fehler.push({ zeile: nummer, feld: f.label, meldung: 'Pflichtfeld ist leer' }); continue; }
      if (f.standard !== undefined) werte[f.key] = f.standard;
      continue;
    }

    if (f.typ === 'zahl') {
      const n = leseZahl(eingabe, dezimal);
      if (n === null) {
        if (GELDFELDER.includes(f.key)) {
          fehler.push({
            zeile: nummer,
            feld: f.label,
            meldung: `"${eingabe}" ist kein lesbarer Betrag. Die Zeile wird NICHT übernommen — ` +
              'ein Geldfeld stillschweigend auf 0 zu setzen wäre schlimmer als sie wegzulassen.',
          });
        } else {
          warnungen.push({ zeile: nummer, feld: f.label, meldung: `"${eingabe}" ist keine Zahl — übernommen als ${f.standard ?? 0}` });
          werte[f.key] = f.standard ?? 0;
        }
      } else werte[f.key] = n;
      continue;
    }

    if (f.typ === 'datum') {
      const d = leseDatumGenau(eingabe, heute);
      if (d.datum === null) {
        warnungen.push({ zeile: nummer, feld: f.label, meldung: `"${eingabe}" ist kein erkennbares Datum — Feld bleibt leer` });
      } else {
        werte[f.key] = d.datum;
        if (d.mehrdeutig) {
          warnungen.push({
            zeile: nummer,
            feld: f.label,
            meldung: `"${eingabe}" ist mehrdeutig: gelesen als ${d.datum} (Tag/Monat). ` +
              `In einer englischen Datei wäre es ${d.andereLesart} — bitte prüfen.`,
          });
        }
      }
      continue;
    }

    if (f.typ === 'datumZeit') {
      const dz = leseDatumZeit(eingabe, heute);
      if (!dz) warnungen.push({ zeile: nummer, feld: f.label, meldung: `"${eingabe}" ist kein erkennbares Datum — Feld bleibt leer` });
      else werte[f.key] = dz;
      continue;
    }

    if (f.typ === 'jaNein') { werte[f.key] = leseJaNein(eingabe, Boolean(f.standard)); continue; }

    werte[f.key] = eingabe;
  }

  // E-Mail-Adressen, die offensichtlich keine sind, gehen nicht durch —
  // sonst laufen spaeter Mahnungen und Newsletter ins Leere.
  for (const key of ['email']) {
    const v = werte[key];
    if (typeof v === 'string' && v !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      warnungen.push({ zeile: nummer, feld: 'E-Mail', meldung: `"${v}" sieht nicht wie eine E-Mail-Adresse aus — Feld bleibt leer` });
      delete werte[key];
    }
  }

  if (fehler.length > 0) return { werte: null, fehler, warnungen };

  virtuelleFelderAufloesen(ziel, werte);
  nachbereiten(zielKey, werte, nummer, warnungen, opt.steuersatz ?? STEUERSATZ_STANDARD, ziel);

  // Eine Zeile ohne jeden Inhalt ist kein Datensatz.
  const hatInhalt = Object.entries(werte).some(([k, v]) => {
    const feld = ziel.felder.find((x) => x.key === k);
    if (feld && feld.standard !== undefined && v === feld.standard) return false;
    return v !== '' && v !== null && v !== undefined;
  });
  if (!hatInhalt) return { werte: null, fehler: [{ zeile: nummer, feld: '', meldung: 'Zeile enthält keine verwertbaren Daten' }], warnungen };

  return { werte, fehler, warnungen };
}

/**
 * Ziel-spezifische Nacharbeit: rechnen, was der Kunde nicht mitgeliefert hat.
 *
 * BEFUND 7 (Rest aus Punkt 30): Hier stand dreimal das nackte Math.round.
 * Bei einer Gutschrift mit negativen Summen rundet das in die falsche
 * Richtung — GEMESSEN: aus −2,345 wurde −2,34 statt −2,35. Jetzt centRunden
 * aus lib/zahlen.ts, symmetrisch um Null.
 *
 * BEFUND 8 (eigener Befund): Der Steuersatz 19 stand fest im Code. Bei einem
 * Buchhändler (7 %) oder einem Kleinunternehmer (0 %) rechnete die Datei
 * falsch zurueck, und die Warnung nannte den Satz nicht einmal.
 */
function nachbereiten(
  zielKey: string,
  werte: Record<string, unknown>,
  nummer: number,
  warnungen: ZeilenFehler[],
  steuersatz: number = STEUERSATZ_STANDARD,
  ziel?: ImportZiel,
): void {
  // Paket 128: allgemeine Wertelisten und Folgedaten des Ziels
  for (const l of ziel?.listen ?? []) aufListe(werte, l.feld, l.liste, l.standard, l.textFeld ?? '', l.label, nummer, warnungen);
  for (const d of ziel?.folgeDatum ?? []) {
    const aus = typeof werte[d.aus] === 'string' ? String(werte[d.aus]).slice(0, 10) : '';
    const monate = Number(werte[d.monateFeld]);
    if (!werte[d.ziel] && /^\d{4}-\d{2}-\d{2}$/.test(aus) && monate > 0) werte[d.ziel] = plusMonate(aus, Math.round(monate));
  }
  if (zielKey === 'rechnungen') {
    const netto = typeof werte.netto_summe === 'number' ? werte.netto_summe : 0;
    const mwst = typeof werte.mwst_summe === 'number' ? werte.mwst_summe : 0;
    const brutto = typeof werte.brutto_summe === 'number' ? werte.brutto_summe : 0;
    const satz = Number.isFinite(steuersatz) && steuersatz >= 0 ? steuersatz : STEUERSATZ_STANDARD;

    if (brutto === 0 && (netto !== 0 || mwst !== 0)) {
      werte.brutto_summe = centRunden(netto + mwst);
    } else if (brutto !== 0 && netto === 0 && mwst === 0) {
      // Nur Brutto geliefert: zurueckrechnen, aber als Annahme kennzeichnen.
      werte.netto_summe = centRunden(brutto / (1 + satz / 100));
      werte.mwst_summe = centRunden(brutto - (werte.netto_summe as number));
      warnungen.push({
        zeile: nummer,
        feld: 'MwSt',
        meldung: `Nur Bruttobetrag geliefert — Netto und MwSt mit ${satz} % zurückgerechnet. ` +
          'Bei einem abweichenden Steuersatz stimmen beide Werte nicht.',
      });
    }

    const bezahlt = typeof werte.bezahlter_betrag === 'number' ? werte.bezahlter_betrag : 0;
    const brutto2 = typeof werte.brutto_summe === 'number' ? werte.brutto_summe : 0;

    // Eine Gutschrift hat einen negativen Bruttobetrag. Die Statusregeln
    // darunter sind fuer positive Betraege gebaut — dort greift keine, und
    // das ist richtig so. Der Fall wird aber benannt, damit niemand meint,
    // der Import habe ihn uebersehen.
    if (brutto2 < 0) {
      warnungen.push({
        zeile: nummer,
        feld: 'Brutto',
        meldung: 'Negativer Bruttobetrag — vermutlich eine Gutschrift. ' +
          'Der Zahlungsstatus wird nicht automatisch gesetzt; bitte nach dem Import prüfen.',
      });
    }

    if (!werte.zahlungsstatus || werte.zahlungsstatus === 'offen') {
      if (bezahlt > 0 && bezahlt < brutto2) werte.zahlungsstatus = 'teilbezahlt';
      else if (bezahlt > 0 && bezahlt >= brutto2 && brutto2 > 0) werte.zahlungsstatus = 'bezahlt';
    }
    const erlaubt = ['offen', 'teilbezahlt', 'bezahlt', 'storniert', 'ueberfaellig'];
    if (typeof werte.zahlungsstatus === 'string' && !erlaubt.includes(werte.zahlungsstatus)) {
      warnungen.push({ zeile: nummer, feld: 'Status', meldung: `"${werte.zahlungsstatus}" ist kein bekannter Status — auf "offen" gesetzt` });
      werte.zahlungsstatus = 'offen';
    }
  }

  if (zielKey === 'leistungskatalog') leistungNachbereiten(werte, nummer, warnungen);
  // Paket 127
  if (zielKey === 'mitarbeiter_qualifikation') qualiNachbereiten(werte, nummer, warnungen);
  // Schritt 3 Teil 2
  if (zielKey === 'mitarbeiter') {
    aufListe(werte, 'status', MA_STATUS, 'aktiv', '', 'Status', nummer, warnungen);
    aufListe(werte, 'arbeitszeit_modell', ARBEITSZEIT, 'vollzeit', '', 'Arbeitszeitmodell', nummer, warnungen);
  }
  if (zielKey === 'auftraege') {
    aufListe(werte, 'status', AUFTRAG_STATUS, 'beauftragt', 'notizen', 'Status', nummer, warnungen);
    const netto = typeof werte.netto_summe === 'number' ? werte.netto_summe : null;
    if (netto !== null && typeof werte.brutto_summe !== 'number') {
      const satz = steuersatz;
      werte.mwst_summe = centRunden(netto * satz / 100);
      werte.brutto_summe = centRunden(netto + (werte.mwst_summe as number));
      warnungen.push({ zeile: nummer, feld: 'MwSt', meldung: `Nur Netto geliefert — MwSt und Brutto mit ${satz} % gerechnet.` });
    }
  }
  if (zielKey === 'projekte') {
    aufListe(werte, 'status', PROJEKT_STATUS, 'aktiv', 'beschreibung', 'Status', nummer, warnungen);
    aufListe(werte, 'prioritaet', PRIORITAET, 'normal', 'beschreibung', 'Priorität', nummer, warnungen);
  }
  if (zielKey === 'vertraege') {
    aufListe(werte, 'kosten_intervall', INTERVALL, 'monatlich', 'notizen', 'Intervall', nummer, warnungen);
    aufListe(werte, 'status', VERTRAG_STATUS, 'aktiv', 'notizen', 'Status', nummer, warnungen);
  }
  if (zielKey === 'anlagegueter') {
    aufListe(werte, 'status', ANLAGE_STATUS, 'aktiv', 'notiz', 'Status', nummer, warnungen);
    if (typeof werte.nutzungsdauer_jahre !== 'number' || werte.nutzungsdauer_jahre <= 0) {
      warnungen.push({ zeile: nummer, feld: 'Nutzungsdauer', meldung: 'Keine Nutzungsdauer — die Datenbank setzt 1 Jahr. Bitte in den Anlagen korrigieren, sonst stimmt die Abschreibung nicht.' });
      delete werte.nutzungsdauer_jahre;
    }
    if (werte.status !== 'aktiv' && !werte.abgang_am) {
      warnungen.push({ zeile: nummer, feld: 'Abgang am', meldung: 'Verkauft/ausgemustert ohne Abgangsdatum — bitte in den Anlagen nachtragen.' });
    }
  }
  if (zielKey === 'eingangsbelege') {
    aufListe(werte, 'status', BELEG_STATUS, 'erfasst', 'notiz', 'Status', nummer, warnungen);
    const n = typeof werte.netto === 'number' ? werte.netto : null;
    const u = typeof werte.ust_betrag === 'number' ? werte.ust_betrag : null;
    const b = typeof werte.brutto === 'number' ? werte.brutto : null;
    const satz = typeof werte.ust_satz === 'number' ? werte.ust_satz : null;
    if (b === null && n !== null) {
      const ust = u ?? (satz !== null ? centRunden(n * satz / 100) : null);
      if (ust !== null) { werte.ust_betrag = ust; werte.brutto = centRunden(n + ust); }
    } else if (b !== null && n === null) {
      const s2 = satz ?? steuersatz;
      werte.netto = centRunden(b / (1 + s2 / 100));
      werte.ust_betrag = centRunden(b - (werte.netto as number));
      if (satz === null) warnungen.push({ zeile: nummer, feld: 'USt', meldung: `Nur Brutto geliefert — Netto und USt mit ${s2} % zurückgerechnet.` });
    }
    if (typeof werte.ust_satz !== 'number' && typeof werte.netto === 'number' && typeof werte.ust_betrag === 'number' && werte.netto !== 0) {
      werte.ust_satz = Math.round((werte.ust_betrag / werte.netto) * 100);
    }
  }
  if (zielKey === 'verkaufschancen') {
    aufListe(werte, 'phase', PHASEN, 'erstkontakt', 'notizen', 'Phase', nummer, warnungen);
    if (typeof werte.wahrscheinlichkeit === 'number' && werte.wahrscheinlichkeit > 0 && werte.wahrscheinlichkeit <= 1) {
      werte.wahrscheinlichkeit = Math.round(werte.wahrscheinlichkeit * 100);   // 0,25 -> 25 %
    }
  }
  if (zielKey === 'kontakt_aktivitaeten') aufListe(werte, 'typ', AKTIVITAET_TYPEN, 'notiz', 'inhalt', 'Art', nummer, warnungen, true);
  if (zielKey === 'wartungsvertraege') aufListe(werte, 'status', WARTUNG_STATUS, 'aktiv', 'notiz', 'Status', nummer, warnungen);
  if (zielKey === 'leads') {
    aufListe(werte, 'status', LEAD_STATUS, 'offen', 'nachricht', 'Status', nummer, warnungen, true);
    const ort = String(werte.ort ?? '').trim();
    const m = ort.match(/^(\d{5})\s+(.+)$/);
    if (m && !String(werte.plz ?? '').trim()) { werte.plz = m[1]; werte.ort = m[2]; }
  }

  if (zielKey === 'kontakte') {
    const erlaubt = ['interessent', 'aktiv', 'kunde', 'inaktiv'];
    if (typeof werte.status === 'string') {
      const uebersetzt = STATUS_UEBERSETZUNG[normal(werte.status)];
      if (uebersetzt) werte.status = uebersetzt;
    }
    if (typeof werte.status === 'string' && !erlaubt.includes(werte.status.toLowerCase())) {
      warnungen.push({ zeile: nummer, feld: 'Status', meldung: `"${werte.status}" ist kein bekannter Status — auf "interessent" gesetzt (der alte Wert steht in den Notizen)` });
      // Schritt 2 „nichts verschluckt": der alte Wert geht nicht verloren.
      const alt = `Status im Altsystem: ${werte.status}`;
      werte.notizen = typeof werte.notizen === 'string' && werte.notizen ? `${werte.notizen}\n${alt}` : alt;
      werte.status = 'interessent';
    } else if (typeof werte.status === 'string') {
      werte.status = werte.status.toLowerCase();
    }
  }
}

// ---------------------------------------------------------------------------
// Schritt 3: Wertelisten der weiteren Ziele (am Code belegt, siehe Kommentar)
// ---------------------------------------------------------------------------

/** verkaufschancen.phase (app/dashboard/crm/pipeline). Schluessel normalisiert. */
export const PHASEN: Record<string, string> = {
  erstkontakt: 'erstkontakt', neu: 'erstkontakt', lead: 'erstkontakt', 'first contact': 'erstkontakt', appointmentscheduled: 'erstkontakt',
  qualifiziert: 'qualifiziert', qualified: 'qualifiziert', qualifiedtobuy: 'qualifiziert', bedarfsanalyse: 'qualifiziert',
  angebot: 'angebot', 'angebot versendet': 'angebot', proposal: 'angebot', presentationscheduled: 'angebot', 'proposal made': 'angebot',
  verhandlung: 'verhandlung', negotiation: 'verhandlung', decisionmakerboughtin: 'verhandlung', contractsent: 'verhandlung',
  gewonnen: 'gewonnen', won: 'gewonnen', 'closed won': 'gewonnen', closedwon: 'gewonnen', auftrag: 'gewonnen',
  verloren: 'verloren', lost: 'verloren', 'closed lost': 'verloren', closedlost: 'verloren', abgesagt: 'verloren',
};
/** kontakt_aktivitaeten.typ (app/dashboard/crm/[id]). */
export const AKTIVITAET_TYPEN: Record<string, string> = {
  anruf: 'anruf', telefonat: 'anruf', telefon: 'anruf', call: 'anruf', rueckruf: 'anruf',
  email: 'email', 'e mail': 'email', mail: 'email',
  termin: 'termin', 'termin vor ort': 'termin', besuch: 'termin', meeting: 'termin', treffen: 'termin', vor_ort: 'termin', 'vor ort': 'termin',
  notiz: 'notiz', note: 'notiz', vermerk: 'notiz',
};
/** wartungsvertraege.status (app/dashboard/wartung). */
export const WARTUNG_STATUS: Record<string, string> = {
  aktiv: 'aktiv', laufend: 'aktiv', active: 'aktiv',
  pausiert: 'pausiert', ruht: 'pausiert', paused: 'pausiert',
  gekuendigt: 'gekuendigt', gekündigt: 'gekuendigt', cancelled: 'gekuendigt', canceled: 'gekuendigt',
  abgelaufen: 'abgelaufen', beendet: 'abgelaufen', expired: 'abgelaufen',
};
/** leads.status (app/dashboard/leads). */
export const LEAD_STATUS: Record<string, string> = {
  neu: 'neu', new: 'neu', offen: 'offen', open: 'offen', kontaktiert: 'offen', qualifiziert: 'offen',
  'termin vereinbart': 'offen', 'in bearbeitung': 'offen', contacted: 'offen',
  gewonnen: 'gewonnen', won: 'gewonnen', kunde: 'gewonnen', auftrag: 'gewonnen',
  verloren: 'verloren', lost: 'verloren', 'kein bedarf': 'verloren', abgesagt: 'verloren', abgelehnt: 'verloren',
};

/**
 * Einen Wert auf eine feste Liste bringen. Unbekannt -> Standard, und der
 * alte Wert wandert als „Label im Altsystem: X" in das Textfeld — nichts
 * verschluckt. `still`: ohne Warnung, wenn die Umsetzung zu erwarten ist
 * (z. B. „kontaktiert" -> offen bei Leads; der alte Wert steht trotzdem da).
 */
function aufListe(
  werte: Record<string, unknown>, feld: string, liste: Record<string, string>, standard: string,
  textFeld: string, label: string, nummer: number, warnungen: ZeilenFehler[], alteImmerMerken = false,
): void {
  const roh = werte[feld];
  if (typeof roh !== 'string' || !roh.trim()) return;
  const n = normal(roh);
  const treffer = liste[n] ?? liste[n.replace(/\s+/g, '')];
  const merken = () => {
    if (!textFeld) return;
    const alt = `${label} im Altsystem: ${roh.trim()}`;
    werte[textFeld] = typeof werte[textFeld] === 'string' && String(werte[textFeld]).trim() ? `${String(werte[textFeld]).trim()}\n${alt}` : alt;
  };
  if (treffer) {
    if (alteImmerMerken && normal(treffer).replace(/\s+/g, '') !== n.replace(/\s+/g, '')) merken();
    werte[feld] = treffer;
    return;
  }
  warnungen.push({ zeile: nummer, feld: label, meldung: `"${roh}" ist kein bekannter Wert — auf "${standard}" gesetzt` + (textFeld ? ' (der alte Wert steht im Text)' : ' (bitte prüfen)') });
  merken();
  werte[feld] = standard;
}

/** Schritt 3 Teil 2: Wertelisten (am Code belegt, Quelle je Liste). */
export const MA_STATUS: Record<string, string> = { aktiv: 'aktiv', beschaeftigt: 'aktiv', inaktiv: 'inaktiv', ausgeschieden: 'inaktiv', ausgetreten: 'inaktiv', beurlaubt: 'beurlaubt', elternzeit: 'beurlaubt', ruhend: 'beurlaubt' };
export const ARBEITSZEIT: Record<string, string> = { vollzeit: 'vollzeit', vz: 'vollzeit', teilzeit: 'teilzeit', tz: 'teilzeit', minijob: 'minijob', geringfuegig: 'minijob', '520': 'minijob', '538': 'minijob', midijob: 'midijob', uebergangsbereich: 'midijob' };
export const AUFTRAG_STATUS: Record<string, string> = {
  entwurf: 'entwurf', beauftragt: 'beauftragt', auftrag: 'beauftragt', erteilt: 'beauftragt', offen: 'beauftragt', angenommen: 'beauftragt',
  in_bearbeitung: 'in_bearbeitung', 'in bearbeitung': 'in_bearbeitung', laufend: 'in_bearbeitung', 'in arbeit': 'in_bearbeitung', begonnen: 'in_bearbeitung',
  abgeschlossen: 'abgeschlossen', fertig: 'abgeschlossen', erledigt: 'abgeschlossen', storniert: 'storniert', abgebrochen: 'storniert',
};
export const PROJEKT_STATUS: Record<string, string> = { aktiv: 'aktiv', laufend: 'aktiv', offen: 'aktiv', 'in arbeit': 'aktiv', pausiert: 'pausiert', ruht: 'pausiert', abgeschlossen: 'abgeschlossen', fertig: 'abgeschlossen', erledigt: 'abgeschlossen', abgebrochen: 'abgebrochen', storniert: 'abgebrochen' };
export const PRIORITAET: Record<string, string> = { niedrig: 'niedrig', gering: 'niedrig', low: 'niedrig', normal: 'normal', mittel: 'normal', medium: 'normal', hoch: 'hoch', high: 'hoch', dringend: 'dringend', urgent: 'dringend', 'sehr hoch': 'dringend' };
export const INTERVALL: Record<string, string> = {
  monatlich: 'monatlich', monat: 'monatlich', mtl: 'monatlich', monthly: 'monatlich',
  quartalsweise: 'quartalsweise', quartal: 'quartalsweise', vierteljaehrlich: 'quartalsweise', quarterly: 'quartalsweise',
  jaehrlich: 'jaehrlich', jahr: 'jaehrlich', 'p a': 'jaehrlich', jaehrl: 'jaehrlich', yearly: 'jaehrlich', annual: 'jaehrlich',
  einmalig: 'einmalig', once: 'einmalig',
};
export const VERTRAG_STATUS: Record<string, string> = { aktiv: 'aktiv', laufend: 'aktiv', gekuendigt: 'gekuendigt', beendet: 'beendet', abgelaufen: 'beendet' };
export const ANLAGE_STATUS: Record<string, string> = { aktiv: 'aktiv', 'im bestand': 'aktiv', verkauft: 'verkauft', veraeussert: 'verkauft', ausgemustert: 'ausgemustert', verschrottet: 'ausgemustert', abgang: 'ausgemustert' };
export const BELEG_STATUS: Record<string, string> = { erfasst: 'erfasst', offen: 'erfasst', neu: 'erfasst', geprueft: 'geprueft', freigegeben: 'geprueft', gebucht: 'gebucht', verbucht: 'gebucht' };

/**
 * Paket 127: Qualifikationen auf die Schluessel der Dispo (lib/dispoPlus.ts
 * QUALIFIKATIONEN). Muster auf dem vereinheitlichten Text (normal()). Was
 * nicht passt, bleibt mit seinem Namen als eigene Befaehigung erhalten.
 */
export const QUALI_MUSTER: [RegExp, string][] = [
  [/\b(elektrofachkraft|efk)\b/, 'elektrofachkraft'],
  [/\b(elektrotechnisch unterwiesen\w*|eup)\b/, 'eup'],
  [/\b(gas|gasinstallation|installateurverzeichnis)\b/, 'gas'],
  [/\b(kaeltemittel\w*|f gase|chemklimaschutzv)\b/, 'kaeltemittel'],
  [/\b(trinkwasser\w*|vdi 6023)\b/, 'trinkwasser'],
  [/\b(stapler\w*|gabelstapler|flurfoerderzeug\w*)\b/, 'stapler'],
  [/\b(hubarbeitsbuehne\w*|arbeitsbuehne|hebebuehne|ipaf)\b/, 'hubarbeitsbuehne'],
  [/\b(psa|absturzsicherung|psaga|auffanggurt)\b/, 'psa_absturz'],
  [/\b(geruest\w*)\b/, 'geruest'],
  [/\b(schweiss\w*)\b/, 'schweissen'],
  [/\b(asbest\w*|trgs 519)\b/, 'asbest'],
  [/\b(fuehrerschein (c|c1|ce|c1e)|klasse (c|c1|ce))\b/, 'fuehrerschein_c'],
  [/\b(erste hilfe|ersthelfer\w*|betriebshelfer)\b/, 'erste_hilfe'],
  [/\b(brandschutzhelfer\w*)\b/, 'brandschutzhelfer'],
];

/** Den Dispo-Schluessel zu einem Qualifikations-Text finden (oder null). */
export function qualiSchluessel(text: string): string | null {
  const n = normal(text);
  if (!n) return null;
  for (const [muster, key] of QUALI_MUSTER) if (muster.test(n)) return key;
  return null;
}

function qualiNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const roh = String(werte.art ?? '').trim();
  if (!roh) return;
  const key = qualiSchluessel(roh);
  if (key) {
    werte.art = key;
    // Der genaue Name aus dem Altsystem („Erste Hilfe (Betriebshelfer)") bleibt sichtbar.
    const alt = `Bezeichnung im Altsystem: ${roh}`;
    werte.nachweis = typeof werte.nachweis === 'string' && werte.nachweis.trim() ? `${werte.nachweis.trim()}\n${alt}` : alt;
    return;
  }
  werte.art = roh.slice(0, 120);
  warnungen.push({
    zeile: nummer, feld: 'Qualifikation',
    meldung: `„${roh}" ist keine Befähigung aus der Dispo-Liste — mit diesem Namen übernommen (in der Dispo sichtbar, aber nicht als Anforderung wählbar).`,
  });
}

/** Mengen-Einheiten des Leistungskatalogs (wie leistungLogik EINHEITEN_MENGE). */
const MENGEN_EINHEIT: Record<string, string> = {
  stueck: 'Stück', 'stück': 'Stück', stk: 'Stück', st: 'Stück', pauschal: 'Stück', psch: 'Stück', pau: 'Stück',
  ha: 'ha', fm: 'fm', srm: 'Srm', rm: 'Rm', m3: 'm³', 'm³': 'm³', m2: 'm²', 'm²': 'm²', qm: 'm²', lfm: 'lfm', m: 'lfm', kg: 'kg', t: 't',
};

/**
 * Leistungskatalog wie das Modul selbst: die Einheit bestimmt die
 * Erfassungsart; der Preis wird Stundensatz (Zeit) oder Einheitspreis (Menge).
 */
function leistungNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const einheitRoh = String(werte.einheit ?? '').trim();
  const e = einheitRoh.toLowerCase().replace(/\.$/, '');
  let art = String(werte.erfassungsart ?? '').trim().toLowerCase();
  if (!['stunden', 'minuten', 'aw', 'stueck'].includes(art)) {
    if (art) warnungen.push({ zeile: nummer, feld: 'Erfassungsart', meldung: `"${werte.erfassungsart}" unbekannt — aus der Einheit bestimmt` });
    if (/^(std|stunde|stunden|h|hour|hours)$/.test(e)) art = 'stunden';
    else if (/^(min|minute|minuten)$/.test(e)) art = 'minuten';
    else if (/^(aw|arbeitswert|arbeitswerte)$/.test(e)) art = 'aw';
    else if (e) art = 'stueck';
    else art = 'stunden';
  }
  werte.erfassungsart = art;
  if (art === 'stueck') werte.einheit = MENGEN_EINHEIT[e] ?? (einheitRoh || 'Stück');
  else delete werte.einheit;
  if (art === 'aw') werte.aw_minuten = 6;
  if (typeof werte.preis === 'number') {
    if (art === 'stueck') werte.einheitspreis_netto = werte.preis;
    else werte.stundensatz_netto = werte.preis;
  }
  delete werte.preis;
}

/**
 * Status-Woerter fremder Systeme (HubSpot-Lebenszyklus, englische Exporte,
 * deutsche Umschreibungen) auf die vier ARGONAUT-Werte. Schluessel normalisiert.
 */
export const STATUS_UEBERSETZUNG: Record<string, string> = {
  customer: 'kunde', kunde: 'kunde', bestandskunde: 'kunde', stammkunde: 'kunde', client: 'kunde',
  lead: 'interessent', subscriber: 'interessent', marketingqualifiedlead: 'interessent',
  salesqualifiedlead: 'interessent', 'marketing qualified lead': 'interessent',
  'sales qualified lead': 'interessent', opportunity: 'interessent', prospect: 'interessent',
  interessent: 'interessent', neukunde: 'interessent', 'potenzieller kunde': 'interessent',
  evangelist: 'kunde', active: 'aktiv', aktiv: 'aktiv', inactive: 'inaktiv', inaktiv: 'inaktiv',
  ehemalig: 'inaktiv', 'ehemaliger kunde': 'inaktiv', former: 'inaktiv', gesperrt: 'inaktiv',
};

/** Rechtsformen, an denen ein Firmenname zu erkennen ist. */
const RECHTSFORM = /\b(gmbh|ag|kg|ohg|gbr|ug|e\.?\s?k\.?|e\.?\s?v\.?|mbh|se|co\.?|inc|ltd|llc|partg|stiftung|verein|genossenschaft|eg)\b/i;

/** „Müller, Anna" / „Anna Müller" / „Dr. Anna Müller" -> Vor- und Nachname. */
export function zerlegeName(roh: string): { vorname: string; nachname: string; firma: string } {
  const s = String(roh ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return { vorname: '', nachname: '', firma: '' };
  if (RECHTSFORM.test(s) || /&/.test(s)) return { vorname: '', nachname: '', firma: s };
  if (s.includes(',')) {
    const [nach, ...rest] = s.split(',');
    return { vorname: rest.join(',').trim(), nachname: nach.trim(), firma: '' };
  }
  const teile = s.split(' ').filter((t) => !/^(herr|frau|dr\.?|prof\.?|dipl\.?-?\w*\.?)$/i.test(t));
  if (teile.length <= 1) return { vorname: '', nachname: teile[0] ?? s, firma: '' };
  // Namenszusaetze gehoeren zum Nachnamen: „Anna von der Heide"
  let ab = teile.length - 1;
  while (ab > 1 && /^(von|van|de|der|den|zu|zum|zur|la|le|di|da)$/i.test(teile[ab - 1])) ab--;
  return { vorname: teile.slice(0, ab).join(' '), nachname: teile.slice(ab).join(' '), firma: '' };
}

/**
 * Virtuelle Felder in echte umsetzen und dann entfernen — sie duerfen nie
 * als Spalte in die Datenbank gehen.
 */
export function virtuelleFelderAufloesen(ziel: ImportZiel, werte: Record<string, unknown>): void {
  // Paket 128: Name fuer den Nachschlag merken (die Seite sucht die id) —
  // auch wenn das Namensfeld ein echtes Feld ist (Pruefprotokoll: Objekt).
  if (ziel.nachschlag) {
    const n = String(werte[ziel.nachschlag.ausFeld] ?? '').trim();
    if (n) werte.__nach = n;
  }
  const virtuelle = ziel.felder.filter((f) => f.virtuell);
  if (virtuelle.length === 0) return;
  const leer = (v: unknown) => v === undefined || v === null || String(v).trim() === '';

  if (typeof werte.name_komplett === 'string' && werte.name_komplett.trim()) {
    const z = zerlegeName(werte.name_komplett);
    if (z.firma) { if (leer(werte.firma)) werte.firma = z.firma; }
    else if (leer(werte.vorname) && leer(werte.nachname)) {
      if (z.vorname) werte.vorname = z.vorname;
      werte.nachname = z.nachname;
    } else if (leer(werte.nachname)) werte.nachname = werte.name_komplett.trim();
  }

  // Schritt 3: Kunde merken (die Verknuepfung macht die Seite mit dem Bestand).
  const kNr = typeof werte.kunde_nummer === 'string' ? werte.kunde_nummer.trim() : '';
  const kName = typeof werte.kunde === 'string' ? werte.kunde.trim() : '';
  if (kNr || kName) werte.__kunde = kNr || kName;
  if (kNr && kName) werte.__kunde2 = kName;

  // Schritt 3: Vorname/Nachname/Firma -> ein Namensfeld (Leads).
  const vn = String(werte.lead_vorname ?? '').trim();
  const nn = String(werte.lead_nachname ?? '').trim();
  const fi = String(werte.lead_firma ?? '').trim();
  if ((vn || nn || fi) && leer(werte.name)) {
    const person = [vn, nn].filter(Boolean).join(' ');
    werte.name = person && fi ? `${person} · ${fi}` : (person || fi);
  }

  // Schritt 3: Spalten ohne eigenes Feld als „Label: Wert" an ein Textfeld haengen.
  for (const f of virtuelle) {
    if (f.virtuell !== 'anhang' || !f.anhangAn) continue;
    const v = String(werte[f.key] ?? '').trim();
    if (!v) continue;
    const label = f.label.replace(/\s*\(.*\)\s*$/, '');
    const zeile = `${label}: ${v}`;
    werte[f.anhangAn] = leer(werte[f.anhangAn]) ? zeile : `${String(werte[f.anhangAn]).trim()}\n${zeile}`;
  }

  const strasse = String(werte.adresse_strasse ?? '').trim();
  const plz = String(werte.adresse_plz ?? '').trim();
  const ort = String(werte.adresse_ort ?? '').trim();
  if (strasse || plz || ort) {
    const zusammen = [strasse, [plz, ort].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    werte.adresse = leer(werte.adresse) ? zusammen : `${String(werte.adresse).trim()}, ${zusammen}`;
  }

  // 'preis' rechnet nachbereiten() um (Stundensatz oder Einheitspreis) und entfernt es dort.
  // Paket 127: 'position' bleibt — gruppiereBestellungen() holt die Positionen heraus.
  for (const f of virtuelle) if (f.virtuell !== 'preis' && f.virtuell !== 'position') delete werte[f.key];
  // Filterfelder sind nur zum Aussortieren da (siehe ablehnenWenn).
}

/** Alle Erkennungs-Werte eines Satzes als „feld:wert" (klein, getrimmt). */
export function schluesselWerte(satz: Record<string, unknown>, ziel: ImportZiel): string[] {
  const felder = ziel.schluesselFelder ?? (ziel.schluessel ? [ziel.schluessel] : []);
  const raus: string[] = [];
  for (const f of felder) {
    // Schritt 3 Teil 2: „lieferant+belegnummer" = beide zusammen erkennen
    const teile = f.split('+').map((t) => String(satz[t] ?? '').trim().toLowerCase());
    if (teile.every(Boolean)) raus.push(`${f}:${teile.join('|')}`);
  }
  return raus;
}

// ---------------------------------------------------------------------------
// 6) Die ganze Datei auf einen Schlag
// ---------------------------------------------------------------------------

export type PruefBericht = {
  gesamt: number;
  gut: number;
  schlecht: number;
  saetze: Record<string, unknown>[];
  fehler: ZeilenFehler[];
  warnungen: ZeilenFehler[];
  dubletten_in_datei: number;
  // --- ab Punkt 63, additiv ---
  /** Wie die Zahlen dieser Datei gelesen wurden und ob das sicher war. */
  trenner: TrennerBefund;
  /** Hinweise zur ganzen Datei (nicht zu einer Zeile) — gehören über den Bericht. */
  hinweise: string[];
  /**
   * F6 (26.09.2026): Zeilennummer in der DATEI je Satz (gleiche Reihenfolge
   * wie saetze). Vorher rechnete die Seite die Nummer aus der Position in der
   * gefilterten Liste — nach der ersten fehlerhaften oder doppelten Zeile
   * stimmte jede Fehlermeldung nicht mehr.
   */
  zeilenNummern: number[];
};

/**
 * Sammelt alle Werte der Zahlenspalten, damit der Dezimaltrenner an der
 * DATEI entschieden wird und nicht an der einzelnen Zelle.
 */
export function zahlenWerte(zielKey: string, mapping: Mapping, kopf: string[], zeilen: string[][], zielObjekt?: ImportZiel): string[] {
  const ziel = zielObjekt ?? zielDef(zielKey);
  if (!ziel) return [];
  const zahlFelder = new Set(ziel.felder.filter((f) => f.typ === 'zahl').map((f) => f.key));
  const spalten: number[] = [];
  kopf.forEach((spalte, i) => {
    const key = mapping[spalte];
    if (key && zahlFelder.has(key)) spalten.push(i);
  });
  const raus: string[] = [];
  for (const z of zeilen) {
    for (const i of spalten) {
      const v = (z[i] ?? '').trim();
      if (v !== '') raus.push(v);
    }
  }
  return raus;
}

/**
 * Prueft alle Zeilen und liefert den fertigen Stapel plus Fehlerbericht.
 * Dubletten INNERHALB der Datei werden erkannt und nur einmal uebernommen —
 * doppelte Kundennummern in Export-Dateien sind der Normalfall, nicht die Ausnahme.
 */
export function pruefeAlles(
  zielKey: string,
  mapping: Mapping,
  kopf: string[],
  zeilen: string[][],
  opt: ZeilenOptionen = {},
): PruefBericht {
  const ziel = opt.ziel ?? zielDef(zielKey);
  const saetze: Record<string, unknown>[] = [];
  const fehler: ZeilenFehler[] = [];
  const warnungen: ZeilenFehler[] = [];
  const hinweise: string[] = [];
  const gesehen = new Set<string>();
  const zeilenNummern: number[] = [];
  let dubletten = 0;

  // BEFUND 3: einmal fuer die ganze Datei entscheiden, nicht je Zelle.
  const trenner = opt.dezimal
    ? { dezimal: opt.dezimal, sicher: true, mehrdeutige: [], hinweis: null }
    : rateDezimaltrenner(zahlenWerte(zielKey, mapping, kopf, zeilen, ziel));
  if (trenner.hinweis) hinweise.push(trenner.hinweis);

  const zeilenOpt: ZeilenOptionen = { ...opt, dezimal: trenner.dezimal };

  zeilen.forEach((z, i) => {
    const nummer = i + 2;                       // +2: Kopfzeile ist Zeile 1
    const e = pruefeZeile(zielKey, mapping, kopf, z, nummer, zeilenOpt);
    warnungen.push(...e.warnungen);
    if (!e.werte) { fehler.push(...e.fehler); return; }

    if (ziel && (ziel.schluesselFelder || ziel.schluessel)) {
      // Schritt 2: an JEDEM Erkennungsfeld (Kundennummer, Alt-ID, E-Mail …).
      const werte = schluesselWerte(e.werte, ziel);
      const doppelt = werte.find((w) => gesehen.has(w));
      if (doppelt) {
        dubletten++;
        const feldKey = doppelt.slice(0, doppelt.indexOf(':'));
        const wert = doppelt.slice(doppelt.indexOf(':') + 1);
        warnungen.push({ zeile: nummer, feld: ziel.felder.find((f) => f.key === feldKey)?.label ?? feldKey, meldung: `"${wert}" kommt in der Datei mehrfach vor — nur der erste Eintrag wird übernommen` });
        return;
      }
      for (const w of werte) gesehen.add(w);
    }
    saetze.push(e.werte);
    zeilenNummern.push(nummer);
  });

  return {
    gesamt: zeilen.length,
    gut: saetze.length,
    schlecht: zeilen.length - saetze.length,
    saetze, fehler, warnungen,
    dubletten_in_datei: dubletten,
    trenner,
    hinweise,
    zeilenNummern,
  };
}
