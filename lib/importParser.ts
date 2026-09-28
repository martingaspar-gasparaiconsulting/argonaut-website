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
import { spendeAltBestaetigt } from './spenden';
import { FOERDER_PROGRAMME } from '../app/dashboard/foerdermittel/programme';
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

/**
 * Paket 132: Ortszeit Berlin -> echter Zeitpunkt (UTC, wie toISOString()).
 * Die Dispo speichert Einsaetze als Zeitpunkt; „08:00" in einer Datei meint
 * deutsche Uhrzeit — im Sommer UTC+2, im Winter UTC+1. Sommerzeit gilt vom
 * letzten Sonntag im Maerz 01:00 UTC bis zum letzten Sonntag im Oktober 01:00 UTC.
 */
export function berlinZeitpunkt(lokal: string): string | null {
  const m = String(lokal ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const letzterSonntag = (monat: number) => {
    const ende = new Date(Date.UTC(y, monat, 0));           // letzter Tag des Monats (monat 1-basiert)
    return ende.getUTCDate() - ende.getUTCDay();
  };
  const sommerVon = Date.UTC(y, 2, letzterSonntag(3), 1, 0);
  const sommerBis = Date.UTC(y, 9, letzterSonntag(10), 1, 0);
  const alsUtc = Date.UTC(y, mo - 1, d, h, mi);
  const winter = alsUtc - 60 * 60000;
  const t = winter >= sommerVon && winter < sommerBis ? alsUtc - 120 * 60000 : winter;
  return new Date(t).toISOString();
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
/** 'zeitpunkt' (Paket 132): wie datumZeit, aber als echter Zeitpunkt (Berliner Ortszeit -> UTC), fuer Module mit toISOString(). */
export type FeldTyp = 'text' | 'zahl' | 'datum' | 'jaNein' | 'datumZeit' | 'zeitpunkt';

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
  virtuell?: 'name_zerlegen' | 'adresse_teil' | 'kunde_verweis' | 'name_teil' | 'anhang' | 'preis' | 'filter' | 'position' | 'nachschlag' | 'nachschlagMit' | 'rechnen';
  /** Paket 129: bei virtuell 'nachschlagMit' — Spalte des uebergeordneten Eintrags (Rezept-Typ, Tour-Datum). */
  elternSpalte?: string;
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
  /**
   * Paket 136: Eine unlesbare Zahl laesst die Zeile NICHT durch (wie bei
   * Geldfeldern) — ein Bestand darf nicht still auf 0 gesetzt werden.
   */
  streng?: boolean;
  /**
   * Paket 140: Dieses (virtuelle) Feld fuellt ein Pflichtfeld — Vorname und
   * Nachname ergeben den Pflicht-Namen eines Mitglieds. Ist das Pflichtfeld
   * selbst nicht zugeordnet, genuegt eines dieser Felder; ist in einer Zeile
   * weder das Pflichtfeld noch ein Helfer gefuellt, faellt sie mit Grund heraus.
   */
  fuellt?: string;
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
    /**
     * Paket 132: Nicht gefunden (und nicht Pflicht) -> der gesuchte Name wird
     * als „Label im Altsystem: X" an dieses Textfeld gehaengt. Nichts verschluckt.
     */
    textFeld?: string;
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
  nachschlag?: {
    ausFeld: string; tabelle: string; nameSpalte: string; spalte: string; anlegen?: boolean; textFeld?: string; label: string;
    /**
     * Paket 129: feste Werte fuer neu angelegte uebergeordnete Eintraege
     * (Tour: status 'geplant'). '@heute' = das heutige Datum.
     */
    anlegenMit?: Record<string, string | number | boolean | null>;
    /** Paket 129: Spalte, in die die laufende Nummer je Eintrag kommt (Zutat 1, 2 …; Stopp 1, 2 …), wenn die Datei keine hat. */
    positionSpalte?: string;
    /**
     * Paket 134: Ohne gefundenen Eintrag keine Zeile (Anmeldung ohne Kurs,
     * Interessent ohne Exposé) — die Zeile faellt mit Grund heraus, statt
     * das ganze Paket an der Datenbank scheitern zu lassen.
     */
    pflicht?: boolean;
    /** Paket 134: Anzeige Mehrzahl fuer den Grund („die Kurse"). */
    mehrzahl?: string;
  };
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
  /**
   * Paket 140: eigener Grund fuer gesperrte Bankspalten (Mitglieder: „SEPA-
   * Mandat bitte in ARGONAUT neu erfassen"). Ohne Angabe gilt GRUND.bank.
   */
  bankGrund?: string;
  /**
   * Paket 141: Vorhandene Eintraege werden NIE ueberschrieben, auch wenn
   * „Aktualisieren" gewaehlt ist (Spenden: eine inzwischen bestaetigte
   * Zuwendung darf sich durch einen zweiten Import nicht aendern).
   */
  nurNeu?: boolean;
  /** Nur der Chef darf diese Daten anlegen (die Datenbank-Regeln verlangen es ohnehin). */
  nurChef?: boolean;
  /**
   * Zeilen mit diesem Wert in einem Filterfeld fallen mit Grund heraus —
   * z. B. „Angebot" in einer gemischten Auftrags-/Angebotsliste.
   */
  ablehnenWenn?: { feld: string; werte: string[]; grund: string };
  /**
   * Paket 142: Zeile faellt heraus, sobald dieses Filterfeld ueberhaupt einen
   * Wert hat (Aufwand mit Rechnungsnummer = schon abgerechnet).
   */
  ablehnenWennGefuellt?: { feld: string; grund: string };
  /**
   * Paket 134: Wertegrenzen, die die Datenbank prueft (check-Regel). Eine
   * Zeile ausserhalb faellt mit Grund heraus — sonst scheitert das ganze Paket.
   */
  grenzen?: { feld: string; groesserAls?: number; hoechstens?: number; grund: string }[];
  /**
   * Paket 136: Die Datei bringt ZAEHLSTAENDE, keine neuen Datensaetze
   * (Bestand je Filiale). Die Seite legt nichts an, sondern bucht je Artikel
   * und Filiale eine Korrektur ueber lager_buchen (lib/importBestand.ts).
   */
  bestandSetzen?: boolean;
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
  // --- Paket 130: Betriebskosten-Einheiten, Reservierungs-Vorgaenge --------------
  {
    key: 'betriebskosten',
    label: 'Betriebskosten-Einheiten',
    icon: '🧾',
    tabelle: 'bk_einheit',
    beschreibung: 'Mieteinheiten mit Fläche, Personen, Verbrauch und Vorauszahlung — je Abrechnung (fehlt die Spalte, kommen alle in eine Abrechnung „Übernommen aus dem Altsystem" als Entwurf).',
    schluesselFelder: ['abrechnung_id+bezeichnung', '__nach+bezeichnung'],
    eigeneFelderModul: 'bk_einheit',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/betriebskosten',
    nachschlag: { ausFeld: 'abrechnung', tabelle: 'bk_abrechnung', nameSpalte: 'bezeichnung', spalte: 'abrechnung_id', anlegen: true, label: 'Abrechnung', anlegenMit: { status: 'entwurf' } },
    felder: [
      { key: 'abrechnung', label: 'Abrechnung', typ: 'text', virtuell: 'nachschlag', standard: 'Übernommen aus dem Altsystem', alias: ['abrechnung', 'abrechnungsjahr', 'objekt', 'liegenschaft', 'haus'] },
      { key: 'zeitraum_von', label: 'Zeitraum von (Abrechnung)', typ: 'datum', virtuell: 'nachschlagMit', elternSpalte: 'zeitraum_von', alias: ['zeitraum von', 'von', 'abrechnungszeitraum von', 'beginn'] },
      { key: 'zeitraum_bis', label: 'Zeitraum bis (Abrechnung)', typ: 'datum', virtuell: 'nachschlagMit', elternSpalte: 'zeitraum_bis', alias: ['zeitraum bis', 'bis', 'abrechnungszeitraum bis', 'ende'] },
      { key: 'bezeichnung', label: 'Einheit', typ: 'text', pflicht: true, alias: ['bezeichnung', 'einheit', 'wohnung', 'we', 'lage', 'mieteinheit'] },
      { key: 'mieter_name', label: 'Mieter', typ: 'text', alias: ['mieter name', 'mieter', 'name', 'nutzer'] },
      { key: 'wohnflaeche', label: 'Wohnfläche m²', typ: 'zahl', alias: ['wohnflaeche', 'wohnfläche', 'flaeche', 'fläche', 'qm', 'm2'] },
      { key: 'personen', label: 'Personen', typ: 'zahl', alias: ['personen', 'personenzahl', 'bewohner'] },
      { key: 'verbrauch', label: 'Verbrauch', typ: 'zahl', alias: ['verbrauch', 'zaehlerstand', 'verbrauchseinheiten'] },
      { key: 'vorauszahlung', label: 'Vorauszahlung (Jahr)', typ: 'zahl', alias: ['vorauszahlung', 'vorauszahlungen', 'nk vorauszahlung', 'abschlag', 'bk vorauszahlung'] },
    ],
  },
  {
    key: 'reservierung_vorgaenge',
    label: 'Reservierungs-Vorgänge',
    icon: '🪑',
    tabelle: 'reservierung_vorgang',
    beschreibung: 'Bestehende Tischreservierungen, Einlagerungen (z. B. Reifen) und Vorbestellungen — mit Platz verknüpft, wenn es den Namen gibt. Vorher die Plätze importieren.',
    schluesselFelder: ['art+kunde_name+von', 'art+kennzeichen'],
    eigeneFelderModul: 'reservierung_vorgang',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/reservierung',
    nachschlag: { ausFeld: 'platz', tabelle: 'reservierung_platz', nameSpalte: 'bezeichnung', spalte: 'platz_id', label: 'Platz', textFeld: 'gegenstand' },
    listen: [{ feld: 'art', label: 'Art', standard: 'tischreservierung', liste: liste(['tischreservierung', 'einlagerung', 'vorbestellung'], { tisch: 'tischreservierung', reservierung: 'tischreservierung', lager: 'einlagerung', reifen: 'einlagerung', reifeneinlagerung: 'einlagerung', vorbestellen: 'vorbestellung', bestellung: 'vorbestellung', abholung: 'vorbestellung' }) }],
    felder: [
      { key: 'art', label: 'Art', typ: 'text', standard: 'tischreservierung', hinweis: 'tischreservierung · einlagerung · vorbestellung', alias: ['art', 'typ', 'vorgangsart'] },
      { key: 'platz', label: 'Platz / Tisch / Lagerfach', typ: 'text', virtuell: 'nachschlag', alias: ['platz', 'tisch', 'lagerplatz', 'regal', 'fach', 'station'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', pflicht: true, alias: ['kunde name', 'kunde', 'name', 'gast', 'kundenname'] },
      { key: 'kunde_tel', label: 'Telefon', typ: 'text', alias: ['kunde tel', 'telefon', 'tel', 'mobil', 'handy'] },
      { key: 'von', label: 'Von / Termin', typ: 'datumZeit', pflicht: true, alias: ['von', 'datum', 'beginn', 'termin', 'eingelagert am', 'abholung am', 'uhrzeit von'] },
      { key: 'bis', label: 'Bis', typ: 'datumZeit', alias: ['bis', 'ende'] },
      { key: 'anzahl', label: 'Anzahl (Personen/Stück)', typ: 'zahl', alias: ['anzahl', 'personen', 'stueck', 'menge'] },
      { key: 'gegenstand', label: 'Gegenstand', typ: 'text', alias: ['gegenstand', 'artikel', 'bestellung', 'reifen', 'beschreibung'] },
      { key: 'kennzeichen', label: 'Kennzeichen', typ: 'text', alias: ['kennzeichen', 'kfz kennzeichen', 'amtliches kennzeichen'] },
      { key: 'betrag', label: 'Betrag', typ: 'zahl', standard: 0, alias: ['betrag', 'preis', 'gebuehr', 'anzahlung'] },
      { key: 'mwst_satz', label: 'MwSt %', typ: 'zahl', standard: 19, alias: ['mwst satz', 'mwst', 'ust'] },
      { key: 'status', label: 'Status', typ: 'text', hinweis: 'je Art: reserviert/bestaetigt/erschienen/no_show/storniert · eingelagert/zur_abholung/ausgelagert/entsorgt · offen/bereit/abgeholt/storniert', alias: ['status'] },
    ],
  },
  // --- Paket 129: Karten mit uebergeordnetem Eintrag (Rezept, Projekt, Tour) --
  {
    key: 'rezeptur',
    label: 'Rezepturen',
    icon: '🧮',
    tabelle: 'rezeptur_zutaten',
    beschreibung: 'Rezepturen mit ihren Zutaten — eine Zeile je Zutat, gleicher Rezeptname = ein Rezept. Fehlende Rezepte werden angelegt.',
    schluesselFelder: ['rezeptur_id+bezeichnung', '__nach+bezeichnung'],
    eigeneFelderModul: 'rezeptur_zutaten',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/rezeptur',
    nachschlag: { ausFeld: 'rezept', tabelle: 'rezepturen', nameSpalte: 'name', spalte: 'rezeptur_id', anlegen: true, label: 'Rezept', anlegenMit: { basis_einheit: 'kg', typ: 'allgemein' }, positionSpalte: 'position' },
    listen: [
      { feld: 'rezept_typ', label: 'Rezept-Typ', standard: 'allgemein', liste: liste(['teig', 'wurst', 'konditor', 'getraenk', 'allgemein'], { backwaren: 'teig', brot: 'teig', broetchen: 'teig', gebaeck: 'teig', fleisch: 'wurst', wurstwaren: 'wurst', zerlegen: 'wurst', torte: 'konditor', kuchen: 'konditor', konditorei: 'konditor', getränk: 'getraenk', bier: 'getraenk', sud: 'getraenk', sonstiges: 'allgemein' }) },
      { feld: 'rolle', label: 'Rolle', standard: 'sonstige', liste: liste(['sonstige', 'mehl', 'wasser'], { zutat: 'sonstige', getreide: 'mehl', schuettung: 'wasser', schüttung: 'wasser', fluessigkeit: 'wasser' }) },
    ],
    felder: [
      { key: 'rezept', label: 'Rezept', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Zeilen mit gleichem Rezeptnamen werden ein Rezept.', alias: ['rezept', 'rezeptur', 'rezeptname', 'produkt', 'artikel'] },
      { key: 'rezept_typ', label: 'Rezept-Typ', typ: 'text', virtuell: 'nachschlagMit', elternSpalte: 'typ', hinweis: 'teig · wurst · konditor · getraenk · allgemein', alias: ['typ', 'rezept typ', 'rezeptart', 'art'] },
      { key: 'bezeichnung', label: 'Zutat', typ: 'text', pflicht: true, alias: ['zutat', 'bezeichnung', 'rohstoff', 'komponente', 'material'] },
      { key: 'menge', label: 'Menge', typ: 'zahl', alias: ['menge', 'anteil', 'gewicht'] },
      { key: 'einheit', label: 'Einheit', typ: 'text', standard: 'kg', alias: ['einheit', 'me', 'mengeneinheit'] },
      { key: 'preis_pro_einheit', label: 'Preis je Einheit', typ: 'zahl', alias: ['preis pro einheit', 'preis', 'ek', 'einkaufspreis', 'preis je einheit'] },
      { key: 'rolle', label: 'Rolle', typ: 'text', standard: 'sonstige', hinweis: 'sonstige · mehl · wasser (für die Teigausbeute)', alias: ['rolle', 'funktion'] },
      { key: 'position', label: 'Position', typ: 'zahl', hinweis: 'Leer: Reihenfolge in der Datei.', alias: ['position', 'pos', 'reihenfolge'] },
    ],
  },
  {
    key: 'zuschnitt',
    label: 'Zuschnitt-Teile',
    icon: '📐',
    tabelle: 'zuschnitt_teil',
    beschreibung: 'Teilelisten mit Länge und Stückzahl — je Projekt (fehlt die Spalte, kommen alle Teile in ein Projekt „Übernommen aus dem Altsystem").',
    schluesselFelder: ['projekt_id+bezeichnung+laenge', '__nach+bezeichnung+laenge'],
    eigeneFelderModul: 'zuschnitt_teil',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/zuschnitt',
    nachschlag: { ausFeld: 'projekt', tabelle: 'zuschnitt_projekt', nameSpalte: 'bezeichnung', spalte: 'projekt_id', anlegen: true, label: 'Projekt', anlegenMit: { stangenlaenge: 6000, status: 'offen' } },
    felder: [
      { key: 'projekt', label: 'Projekt', typ: 'text', virtuell: 'nachschlag', standard: 'Übernommen aus dem Altsystem', alias: ['projekt', 'auftrag', 'projektname', 'zuschnittliste', 'liste'] },
      { key: 'material', label: 'Material (Projekt)', typ: 'text', virtuell: 'nachschlagMit', elternSpalte: 'material', alias: ['material', 'profil', 'werkstoff'] },
      { key: 'stangenlaenge', label: 'Stangenlänge mm (Projekt)', typ: 'zahl', virtuell: 'nachschlagMit', elternSpalte: 'stangenlaenge', alias: ['stangenlaenge', 'stangenlänge', 'rohlaenge', 'lagerlaenge'] },
      { key: 'bezeichnung', label: 'Teil', typ: 'text', alias: ['bezeichnung', 'teil', 'position', 'pos', 'name'] },
      { key: 'laenge', label: 'Länge (mm)', typ: 'zahl', pflicht: true, alias: ['laenge', 'länge', 'laenge mm', 'zuschnitt', 'mass', 'maß'] },
      { key: 'anzahl', label: 'Anzahl', typ: 'zahl', standard: 1, alias: ['anzahl', 'stueck', 'stück', 'menge', 'stk'] },
    ],
  },
  {
    key: 'tour_stopps',
    label: 'Tour-Stopps',
    icon: '🚚',
    tabelle: 'tour_stopp',
    beschreibung: 'Stopps mit Empfänger und Adresse — je Tour (fehlt die Spalte, kommen alle Stopps in eine Tour von heute).',
    schluesselFelder: ['tour_id+empfaenger+adresse', '__nach+empfaenger+adresse'],
    eigeneFelderModul: 'tour_stopp',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/tour',
    nachschlag: { ausFeld: 'tour', tabelle: 'tour', nameSpalte: 'bezeichnung', spalte: 'tour_id', anlegen: true, label: 'Tour', anlegenMit: { status: 'geplant', datum: '@heute' }, positionSpalte: 'reihenfolge' },
    listen: [{ feld: 'status', label: 'Status', standard: 'offen', liste: liste(['offen', 'zugestellt', 'nicht_angetroffen', 'verweigert'], { geplant: 'offen', ausgeliefert: 'zugestellt', geliefert: 'zugestellt', erledigt: 'zugestellt', 'nicht angetroffen': 'nicht_angetroffen', abwesend: 'nicht_angetroffen', abgelehnt: 'verweigert' }) }],
    felder: [
      { key: 'tour', label: 'Tour', typ: 'text', virtuell: 'nachschlag', standard: 'Übernommen aus dem Altsystem', alias: ['tour', 'tourname', 'route', 'fahrt'] },
      { key: 'tour_datum', label: 'Tour-Datum', typ: 'datum', virtuell: 'nachschlagMit', elternSpalte: 'datum', alias: ['tour datum', 'datum', 'liefertag', 'lieferdatum'] },
      { key: 'fahrer', label: 'Fahrer (Tour)', typ: 'text', virtuell: 'nachschlagMit', elternSpalte: 'fahrer', alias: ['fahrer', 'fahrerin'] },
      { key: 'fahrzeug', label: 'Fahrzeug (Tour)', typ: 'text', virtuell: 'nachschlagMit', elternSpalte: 'fahrzeug', alias: ['fahrzeug', 'kennzeichen', 'lkw'] },
      { key: 'reihenfolge', label: 'Reihenfolge', typ: 'zahl', hinweis: 'Leer: Reihenfolge in der Datei.', alias: ['reihenfolge', 'stopp', 'stopp nr', 'nr', 'pos'] },
      { key: 'empfaenger', label: 'Empfänger', typ: 'text', pflicht: true, alias: ['empfaenger', 'empfänger', 'kunde', 'name', 'firma'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'lieferadresse', 'strasse'] },
      { key: 'kolli', label: 'Kolli', typ: 'zahl', standard: 1, alias: ['kolli', 'pakete', 'stueck', 'anzahl'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'offen', hinweis: 'offen · zugestellt · nicht_angetroffen · verweigert', alias: ['status'] },
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
  // --- Paket 132: Umzug Schritt 4 — Handwerk & Handel ------------------------
  {
    key: 'einsaetze',
    label: 'Einsätze / Dispo',
    icon: '🗓',
    tabelle: 'einsaetze',
    beschreibung: 'Geplante und vergangene Einsätze aus der Plantafel — mit dem Mitarbeiter verknüpft (Personalnummer, E-Mail oder Name). Vorher die Mitarbeiter importieren.',
    // Nur mit Mitarbeiter: zwei Monteure mit demselben Auftrag zur selben Zeit sind ZWEI Einsaetze.
    schluesselFelder: ['mitarbeiter_id+beginn_am+titel', '__kunde+beginn_am+titel'],
    eigeneFelderModul: 'einsaetze',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'mitarbeiter_id', quelle: 'mitarbeiter', label: 'Mitarbeiter', mehrzahl: 'die Mitarbeiter', textFeld: 'beschreibung' },
    ergebnisHref: '/dashboard/dispo',
    ausblenden: ['termin_id', 'auftrag_id', 'rechnung_id', 'standort_id', 'quelle', 'anforderungen', 'unterwegs_am', 'vor_ort_am', 'erledigt_am',
      'unterwegs_lat', 'unterwegs_lon', 'vor_ort_lat', 'vor_ort_lon', 'erledigt_lat', 'erledigt_lon', 'unterschrift_pfad', 'unterschrift_name',
      'unterschrift_am', 'bericht_pfad', 'bericht_am', 'arbeitsbericht', 'arbeitsbericht_am', 'inhaber_einsatz'],
    listen: [{ feld: 'status', label: 'Status', standard: 'geplant', textFeld: 'beschreibung', liste: liste(['geplant', 'unterwegs', 'vor_ort', 'erledigt', 'abgesagt'], { offen: 'geplant', neu: 'geplant', eingeplant: 'geplant', disponiert: 'geplant', 'auf dem weg': 'unterwegs', anfahrt: 'unterwegs', 'vor ort': 'vor_ort', 'in arbeit': 'vor_ort', laufend: 'vor_ort', fertig: 'erledigt', abgeschlossen: 'erledigt', erledigt: 'erledigt', done: 'erledigt', storniert: 'abgesagt', abgebrochen: 'abgesagt', ausgefallen: 'abgesagt' }) }],
    felder: [
      {
        key: 'kunde', label: 'Mitarbeiter (Name oder E-Mail)', typ: 'text', virtuell: 'kunde_verweis',
        hinweis: 'Wird mit Ihren Mitarbeitern verknüpft. „Chef" oder „Inhaber" = Einsatz der Geschäftsleitung. Unbekannte Namen stehen in der Beschreibung.',
        alias: ['mitarbeiter', 'monteur', 'techniker', 'ausfuehrender', 'ausführender', 'ressource', 'mitarbeitername', 'name mitarbeiter', 'employee', 'technician'],
      },
      {
        key: 'kunde_nummer', label: 'Personalnummer (zum Verknüpfen)', typ: 'text', virtuell: 'kunde_verweis', nichtInVorlage: true,
        alias: ['personalnummer', 'personalnr', 'pers nr', 'pers-nr', 'persnr', 'mitarbeiternummer', 'ma nr', 'ma-nr', 'employee id'],
      },
      { key: 'titel', label: 'Titel', typ: 'text', standard: 'Einsatz', alias: ['titel', 'einsatz', 'betreff', 'taetigkeit', 'tätigkeit', 'leistung', 'bezeichnung', 'auftrag', 'auftragsbezeichnung'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'notiz', 'notizen', 'bemerkung', 'details', 'arbeiten'] },
      { key: 'einsatzort', label: 'Einsatzort', typ: 'text', alias: ['einsatzort', 'ort', 'adresse', 'baustelle', 'anschrift', 'objekt', 'lieferadresse'] },
      { key: 'beginn_am', label: 'Beginn', typ: 'zeitpunkt', pflicht: true, hinweis: 'Datum und Uhrzeit (deutsche Zeit). Nur ein Datum = ganzer Tag 07:00 bis 16:00.', alias: ['beginn', 'beginn am', 'start', 'von', 'datum', 'termin', 'einsatzbeginn', 'startzeit'] },
      { key: 'ende_am', label: 'Ende', typ: 'zeitpunkt', hinweis: 'Leer: Beginn + 1 Stunde.', alias: ['ende', 'ende am', 'bis', 'einsatzende', 'endzeit'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'geplant', hinweis: 'geplant · unterwegs · vor_ort · erledigt · abgesagt', alias: ['status', 'stand'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', alias: ['kunde', 'kundenname', 'auftraggeber', 'kunde name'] },
      { key: 'kunde_email', label: 'Kunde E-Mail', typ: 'text', alias: ['kunde email', 'kunde e-mail', 'e-mail kunde', 'email'] },
      { key: 'kunde_telefon', label: 'Kunde Telefon', typ: 'text', alias: ['kunde telefon', 'telefon kunde', 'telefon', 'tel'] },
    ],
  },
  {
    key: 'tickets',
    label: 'Service-Tickets',
    icon: '🎫',
    tabelle: 'tickets',
    beschreibung: 'Offene und alte Service-Tickets aus dem Ticket-System — Ticketnummer, Status und Priorität bleiben erhalten, der Kunde wird verknüpft, wenn es ihn gibt.',
    schluesselFelder: ['ticket_nummer', 'betreff+kunde_name'],
    eigeneFelderModul: 'tickets',
    nurMitKatalog: true,
    // Mitarbeiter duerfen Tickets des Betriebs lesen, aber nicht fuer den Betrieb anlegen (b1-befund) -> Import macht der Chef.
    nurChef: true,
    kundeVerweis: { spalte: 'kontakt_id', ausFeldern: ['kunde_email', 'kunde_name'] },
    ergebnisHref: '/dashboard/service',
    ausblenden: ['firma_id', 'kunde_id', 'standort_id'],
    listen: [
      { feld: 'status', label: 'Status', standard: 'offen', textFeld: 'beschreibung', liste: liste(['offen', 'in_bearbeitung', 'wartet', 'geloest', 'geschlossen'], { neu: 'offen', open: 'offen', new: 'offen', eingegangen: 'offen', 'in bearbeitung': 'in_bearbeitung', bearbeitung: 'in_bearbeitung', 'in progress': 'in_bearbeitung', 'in arbeit': 'in_bearbeitung', pending: 'wartet', 'on hold': 'wartet', warten: 'wartet', 'wartet auf kunde': 'wartet', gelöst: 'geloest', solved: 'geloest', resolved: 'geloest', erledigt: 'geloest', closed: 'geschlossen', abgeschlossen: 'geschlossen', archiviert: 'geschlossen' }) },
      { feld: 'prioritaet', label: 'Priorität', standard: 'mittel', textFeld: 'beschreibung', liste: liste(['niedrig', 'mittel', 'hoch', 'dringend'], { low: 'niedrig', gering: 'niedrig', normal: 'mittel', medium: 'mittel', high: 'hoch', wichtig: 'hoch', urgent: 'dringend', kritisch: 'dringend', critical: 'dringend', 'sehr hoch': 'dringend', notfall: 'dringend' }) },
      { feld: 'kategorie', label: 'Kategorie', standard: 'anfrage', textFeld: 'beschreibung', liste: liste(['anfrage', 'support', 'reklamation', 'sonstiges'], { frage: 'anfrage', question: 'anfrage', auskunft: 'anfrage', problem: 'support', incident: 'support', stoerung: 'support', störung: 'support', fehler: 'support', defekt: 'support', service: 'support', beschwerde: 'reklamation', complaint: 'reklamation', mangel: 'reklamation', garantie: 'reklamation', gewaehrleistung: 'reklamation', sonstige: 'sonstiges', other: 'sonstiges' }) },
      { feld: 'kanal', label: 'Kanal', standard: 'email', textFeld: 'beschreibung', liste: liste(['email', 'telefon', 'web', 'persoenlich'], { mail: 'email', 'e-mail': 'email', phone: 'telefon', anruf: 'telefon', tel: 'telefon', portal: 'web', formular: 'web', website: 'web', chat: 'web', 'vor ort': 'persoenlich', persönlich: 'persoenlich', laden: 'persoenlich' }) },
    ],
    felder: [
      { key: 'ticket_nummer', label: 'Ticketnummer', typ: 'text', hinweis: 'Die Nummer aus dem Altsystem bleibt erhalten.', alias: ['ticket nummer', 'ticketnummer', 'ticket nr', 'ticket-nr', 'ticket id', 'ticket', 'vorgangsnummer', 'vorgang nr', 'case number', 'ticket number'] },
      { key: 'betreff', label: 'Betreff', typ: 'text', pflicht: true, alias: ['betreff', 'subject', 'titel', 'thema', 'anliegen', 'zusammenfassung', 'summary'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', alias: ['beschreibung', 'description', 'text', 'nachricht', 'problem', 'details', 'problembeschreibung'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'offen', hinweis: 'offen · in_bearbeitung · wartet · geloest · geschlossen', alias: ['status', 'state', 'stand'] },
      { key: 'prioritaet', label: 'Priorität', typ: 'text', standard: 'mittel', hinweis: 'niedrig · mittel · hoch · dringend', alias: ['prioritaet', 'priorität', 'prio', 'priority', 'dringlichkeit'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', standard: 'anfrage', hinweis: 'anfrage · support · reklamation · sonstiges', alias: ['kategorie', 'art', 'typ', 'category', 'type'] },
      { key: 'kanal', label: 'Kanal', typ: 'text', standard: 'email', hinweis: 'email · telefon · web · persoenlich', alias: ['kanal', 'eingangskanal', 'quelle', 'channel', 'source'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', alias: ['kunde', 'kundenname', 'kunde name', 'anfragender', 'requester', 'firma', 'melder'] },
      { key: 'kunde_email', label: 'Kunde E-Mail', typ: 'text', alias: ['kunde email', 'kunde e-mail', 'email', 'e-mail', 'requester email'] },
      { key: 'kunde_telefon', label: 'Kunde Telefon', typ: 'text', alias: ['kunde telefon', 'telefon', 'tel', 'phone'] },
      { key: 'faellig_am', label: 'Fällig am', typ: 'datum', alias: ['faellig am', 'fällig am', 'faellig', 'frist', 'sla', 'due date', 'deadline'] },
      { key: 'geloest_am', label: 'Gelöst am', typ: 'datum', alias: ['geloest am', 'gelöst am', 'erledigt am', 'geschlossen am', 'resolved at', 'closed at'] },
      { key: 'erstellt', label: 'Erstellt im Altsystem (in die Beschreibung)', typ: 'text', virtuell: 'anhang', anhangAn: 'beschreibung', nichtInVorlage: true, alias: ['erstellt', 'erstellt am', 'angelegt', 'angelegt am', 'eingang', 'eingegangen am', 'created', 'created at'] },
      { key: 'bearbeiter', label: 'Bearbeiter (in die Beschreibung)', typ: 'text', virtuell: 'anhang', anhangAn: 'beschreibung', nichtInVorlage: true, alias: ['bearbeiter', 'zustaendig', 'zuständig', 'agent', 'assignee', 'owner'] },
    ],
  },
  {
    key: 'inventar',
    label: 'Inventar & Geräte',
    icon: '🧰',
    tabelle: 'inventar',
    beschreibung: 'Werkzeuge, Geräte und Betriebsausstattung mit Inventarnummer, Zustand und nächster Prüfung (z. B. DGUV V3).',
    schluesselFelder: ['inventarnummer', 'seriennummer', 'bezeichnung+standort'],
    eigeneFelderModul: 'inventar',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/erp/inventar',
    ausblenden: ['firma_id'],
    listen: [{ feld: 'zustand', label: 'Zustand', standard: 'gut', textFeld: 'notizen', liste: liste(['neu', 'gut', 'gebraucht', 'defekt', 'ausgemustert'], { neuwertig: 'neu', ok: 'gut', 'in ordnung': 'gut', einsatzbereit: 'gut', benutzt: 'gebraucht', abgenutzt: 'gebraucht', kaputt: 'defekt', reparatur: 'defekt', 'in reparatur': 'defekt', gesperrt: 'defekt', verschrottet: 'ausgemustert', entsorgt: 'ausgemustert', verkauft: 'ausgemustert' }) }],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'geraet', 'gerät', 'werkzeug', 'name', 'artikel', 'gegenstand'] },
      { key: 'inventarnummer', label: 'Inventarnummer', typ: 'text', alias: ['inventarnummer', 'inventar nr', 'inventar-nr', 'inv nr', 'invnr', 'geraetenummer', 'gerätenummer', 'id nummer'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'gruppe', 'art', 'typ', 'geraeteart'] },
      { key: 'seriennummer', label: 'Seriennummer', typ: 'text', alias: ['seriennummer', 'serien nr', 'serien-nr', 'sn', 'serial', 'serial number'] },
      { key: 'standort', label: 'Standort', typ: 'text', alias: ['standort', 'lagerort', 'ort', 'fahrzeug', 'raum', 'verantwortlich'] },
      { key: 'zustand', label: 'Zustand', typ: 'text', standard: 'gut', hinweis: 'neu · gut · gebraucht · defekt · ausgemustert', alias: ['zustand', 'status'] },
      { key: 'anschaffungsdatum', label: 'Anschaffung', typ: 'datum', alias: ['anschaffungsdatum', 'anschaffung', 'kaufdatum', 'gekauft am'] },
      { key: 'anschaffungswert', label: 'Anschaffungswert', typ: 'zahl', standard: 0, alias: ['anschaffungswert', 'kaufpreis', 'wert', 'preis', 'anschaffungskosten'] },
      { key: 'naechste_pruefung_am', label: 'Nächste Prüfung', typ: 'datum', alias: ['naechste pruefung', 'nächste prüfung', 'naechste pruefung am', 'pruefung faellig', 'dguv faellig', 'faellig', 'prueftermin'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notizen', 'notiz', 'bemerkung', 'kommentar'] },
      { key: 'letzte_pruefung', label: 'Letzte Prüfung (in die Notizen)', typ: 'text', virtuell: 'anhang', anhangAn: 'notizen', nichtInVorlage: true, alias: ['letzte pruefung', 'letzte prüfung', 'geprueft am', 'geprüft am'] },
    ],
  },
  {
    key: 'verleih',
    label: 'Mietgegenstände (Verleih)',
    icon: '🔑',
    tabelle: 'verleih_artikel',
    beschreibung: 'Geräte und Artikel zum Vermieten mit Tages-/Wochensatz, Kaution und Anzahl. Ausgemusterte Gegenstände werden nicht übernommen.',
    schluesselFelder: ['inventar_nr', 'bezeichnung'],
    eigeneFelderModul: 'verleih_artikel',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/verleih',
    ablehnenWenn: { feld: 'verleih_status', werte: ['ausgemustert', 'verschrottet', 'entsorgt', 'verkauft', 'inaktiv', 'geloescht', 'gelöscht'], grund: 'Ausgemustert im Altsystem — wird nicht als vermietbar übernommen. Die Zeile bleibt in Ihrer Datei.' },
    ausblenden: ['status'],
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'mietgegenstand', 'geraet', 'gerät', 'artikel', 'name', 'maschine'] },
      { key: 'kategorie', label: 'Kategorie', typ: 'text', alias: ['kategorie', 'gruppe', 'art', 'warengruppe'] },
      { key: 'inventar_nr', label: 'Inventar-Nr.', typ: 'text', alias: ['inventar nr', 'inventarnummer', 'inventar-nr', 'inv nr', 'geraetenummer', 'mietnummer', 'artikelnummer'] },
      { key: 'tagessatz', label: 'Tagessatz', typ: 'zahl', standard: 0, alias: ['tagessatz', 'tagesmiete', 'preis tag', 'miete tag', 'pro tag', 'tagespreis'] },
      { key: 'wochensatz', label: 'Wochensatz', typ: 'zahl', alias: ['wochensatz', 'wochenmiete', 'preis woche', 'pro woche', 'wochenpreis'] },
      { key: 'kaution', label: 'Kaution', typ: 'zahl', standard: 0, alias: ['kaution', 'pfand', 'sicherheit', 'deposit'] },
      { key: 'anzahl', label: 'Anzahl', typ: 'zahl', standard: 1, alias: ['anzahl', 'menge', 'stueck', 'stück', 'bestand'] },
      { key: 'verleih_status', label: 'Status im Altsystem', typ: 'text', virtuell: 'filter', nichtInVorlage: true, alias: ['status', 'zustand'] },
    ],
  },
  // --- Paket 133: Umzug Schritt 4 Teil 2 — Lebensmittel, Kasse, Beratung, Land-/Forstwirtschaft ---
  {
    key: 'haccp_plan',
    label: 'HACCP-Plan (Kontrollpunkte)',
    icon: '🌡',
    tabelle: 'lm_haccp_plan',
    beschreibung: 'Kontrollpunkte mit Sollwert und Intervall (Kühlhaus, Fritteuse, Wareneingang …) — erscheinen gleich im HACCP-Plan mit Fälligkeit.',
    schluesselFelder: ['kontrollpunkt'],
    eigeneFelderModul: 'lm_haccp_plan',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/lebensmittel',
    felder: [
      { key: 'kontrollpunkt', label: 'Kontrollpunkt', typ: 'text', pflicht: true, alias: ['kontrollpunkt', 'ccp', 'pruefpunkt', 'prüfpunkt', 'messpunkt', 'geraet', 'gerät', 'bereich', 'bezeichnung'] },
      { key: 'sollwert', label: 'Sollwert', typ: 'text', alias: ['sollwert', 'soll', 'grenzwert', 'zielwert', 'vorgabe', 'kritischer grenzwert'] },
      { key: 'intervall_tage', label: 'Intervall (Tage)', typ: 'text', standard: '1', hinweis: 'Zahl in Tagen oder „täglich", „wöchentlich", „monatlich".', alias: ['intervall tage', 'intervall', 'haeufigkeit', 'häufigkeit', 'turnus', 'rhythmus', 'frequenz'] },
      { key: 'letzte_kontrolle', label: 'Letzte Kontrolle', typ: 'datum', alias: ['letzte kontrolle', 'zuletzt geprueft', 'zuletzt geprüft', 'letzte messung'] },
      { key: 'aktiv', label: 'Aktiv', typ: 'jaNein', standard: true, alias: ['aktiv', 'in betrieb'] },
    ],
  },
  {
    key: 'haccp',
    label: 'HACCP-Kontrollen (Protokoll)',
    icon: '🧾',
    tabelle: 'lm_haccp',
    beschreibung: 'Frühere Temperatur- und Hygienekontrollen — mit dem Kontrollpunkt im Plan verknüpft, wenn der Name passt. Unklares Ergebnis gilt als Abweichung.',
    schluesselFelder: ['datum+kontrollpunkt+messwert'],
    eigeneFelderModul: 'lm_haccp',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/lebensmittel',
    nachschlag: { ausFeld: 'kontrollpunkt', tabelle: 'lm_haccp_plan', nameSpalte: 'kontrollpunkt', spalte: 'plan_id', label: 'Kontrollpunkt' },
    felder: [
      { key: 'datum', label: 'Datum', typ: 'datum', pflicht: true, alias: ['datum', 'kontrolliert am', 'gemessen am', 'pruefdatum', 'prüfdatum', 'tag'] },
      { key: 'kontrollpunkt', label: 'Kontrollpunkt', typ: 'text', pflicht: true, alias: ['kontrollpunkt', 'ccp', 'pruefpunkt', 'prüfpunkt', 'messpunkt', 'geraet', 'gerät', 'bereich'] },
      { key: 'messwert', label: 'Messwert', typ: 'text', alias: ['messwert', 'wert', 'temperatur', 'ist', 'istwert', 'ergebnis messung'] },
      { key: 'in_ordnung', label: 'In Ordnung', typ: 'text', hinweis: 'i. O. / n. i. O. — ja / nein. Leer = in Ordnung, Unklares = Abweichung.', alias: ['in ordnung', 'io', 'i o', 'ok', 'ergebnis', 'bewertung', 'status'] },
      { key: 'massnahme', label: 'Maßnahme', typ: 'text', alias: ['massnahme', 'maßnahme', 'korrekturmassnahme', 'korrekturmaßnahme', 'bemerkung', 'aktion'] },
      { key: 'pruefer', label: 'Prüfer', typ: 'text', alias: ['pruefer', 'prüfer', 'kontrolliert von', 'mitarbeiter', 'kuerzel', 'kürzel', 'unterschrift'] },
    ],
  },
  {
    key: 'kassen',
    label: 'Kassen & TSE (Stammdaten)',
    icon: '🧮',
    tabelle: 'kassen_system',
    beschreibung: 'Kassen, Taxameter und ihre TSE je Betriebsstätte — Grundlage für die Mitteilung an das Finanzamt (§ 146a AO). Gemeldet wird erst nach Ihrer Prüfung.',
    schluesselFelder: ['seriennummer', 'tse_seriennummer', 'betriebsstaette+modell'],
    eigeneFelderModul: 'kassen_system',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/kasse/meldung',
    listen: [{ feld: 'art', label: 'Art', standard: 'sonstiges', textFeld: 'notiz', liste: liste(['kasse_pc', 'kasse_app', 'registrierkasse', 'taxameter', 'wegstreckenzaehler', 'sonstiges'], { pc: 'kasse_pc', 'pc kasse': 'kasse_pc', pos: 'kasse_pc', 'pos system': 'kasse_pc', kassensystem: 'kasse_pc', app: 'kasse_app', tablet: 'kasse_app', ipad: 'kasse_app', 'tablet kasse': 'kasse_app', 'app kasse': 'kasse_app', registrierkasse: 'registrierkasse', 'elektronische registrierkasse': 'registrierkasse', ecr: 'registrierkasse', kasse: 'registrierkasse', taxi: 'taxameter', wegstreckenzähler: 'wegstreckenzaehler', mietwagen: 'wegstreckenzaehler' }) }],
    felder: [
      { key: 'betriebsstaette', label: 'Betriebsstätte', typ: 'text', pflicht: true, alias: ['betriebsstaette', 'betriebsstätte', 'filiale', 'standort', 'laden', 'adresse'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'sonstiges', hinweis: 'kasse_pc · kasse_app · registrierkasse · taxameter · wegstreckenzaehler · sonstiges', alias: ['art', 'typ', 'kassenart', 'geraeteart'] },
      { key: 'hersteller', label: 'Hersteller', typ: 'text', alias: ['hersteller', 'marke', 'fabrikat'] },
      { key: 'modell', label: 'Modell', typ: 'text', alias: ['modell', 'typbezeichnung', 'geraet', 'gerät', 'kasse'] },
      { key: 'software', label: 'Software', typ: 'text', alias: ['software', 'kassensoftware', 'programm', 'version'] },
      { key: 'seriennummer', label: 'Seriennummer', typ: 'text', alias: ['seriennummer', 'serien nr', 'sn', 'geraetenummer', 'kassennummer', 'kassen nr'] },
      { key: 'anschaffung_am', label: 'Anschaffung', typ: 'datum', alias: ['anschaffung am', 'anschaffung', 'anschaffungsdatum', 'in betrieb seit', 'inbetriebnahme'] },
      { key: 'gemietet', label: 'Gemietet / geleast', typ: 'jaNein', standard: false, alias: ['gemietet', 'miete', 'geleast', 'leasing', 'mietgeraet'] },
      { key: 'ausser_betrieb_am', label: 'Außer Betrieb am', typ: 'datum', alias: ['ausser betrieb am', 'außer betrieb am', 'ausser betrieb', 'stillgelegt am', 'abgemeldet am'] },
      { key: 'ausser_grund', label: 'Grund außer Betrieb', typ: 'text', alias: ['ausser grund', 'grund', 'grund ausser betrieb', 'stilllegungsgrund'] },
      { key: 'tse_art', label: 'TSE-Art', typ: 'text', alias: ['tse art', 'tse typ', 'tse', 'sicherheitseinrichtung'] },
      { key: 'tse_seriennummer', label: 'TSE-Seriennummer', typ: 'text', alias: ['tse seriennummer', 'tse serial', 'tse sn', 'tse nummer'] },
      { key: 'tse_bsi_id', label: 'TSE BSI-Zertifizierung', typ: 'text', alias: ['tse bsi id', 'bsi id', 'bsi zertifizierung', 'bsi k tr', 'zertifizierungs id'] },
      { key: 'tse_anschaffung_am', label: 'TSE-Anschaffung', typ: 'datum', alias: ['tse anschaffung am', 'tse anschaffung', 'tse seit', 'tse in betrieb'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen'] },
    ],
  },
  {
    key: 'retainer',
    label: 'Retainer / Rahmenverträge',
    icon: '🤝',
    tabelle: 'agentur_retainer',
    beschreibung: 'Laufende Betreuungs- und Rahmenverträge mit Monatsstunden und Stundensatz — mit dem Kunden verknüpft, wenn es ihn gibt. Es wird nichts abgerechnet.',
    schluesselFelder: ['kunde_name+bezeichnung'],
    eigeneFelderModul: 'agentur_retainer',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'kontakt_id', ausFeldern: ['kunde_name'] },
    ergebnisHref: '/dashboard/agentur',
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv', 'pausiert', 'beendet'], { laufend: 'aktiv', aktiv: 'aktiv', active: 'aktiv', ruhend: 'pausiert', pause: 'pausiert', paused: 'pausiert', gekuendigt: 'beendet', gekündigt: 'beendet', abgelaufen: 'beendet', ended: 'beendet', inaktiv: 'beendet' }) }],
    felder: [
      { key: 'kunde_nummer', label: 'Kundennummer (zum Verknüpfen)', typ: 'text', virtuell: 'kunde_verweis', nichtInVorlage: true, alias: ['kundennummer', 'kundennr', 'kunden nr', 'kd nr', 'debitor'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', alias: ['kunde', 'kundenname', 'auftraggeber', 'mandant', 'client', 'firma'] },
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', standard: 'Retainer', alias: ['bezeichnung', 'vertrag', 'paket', 'leistung', 'titel', 'name'] },
      { key: 'monatsstunden', label: 'Stunden je Monat', typ: 'zahl', standard: 0, alias: ['monatsstunden', 'stunden monat', 'stunden pro monat', 'kontingent', 'stundenkontingent', 'std monat'] },
      { key: 'stundensatz', label: 'Stundensatz', typ: 'zahl', standard: 0, alias: ['stundensatz', 'satz', 'preis stunde', 'euro stunde', 'honorar'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · pausiert · beendet', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen', 'leistungsumfang'] },
      { key: 'monatsbetrag', label: 'Monatsbetrag (in die Notiz)', typ: 'text', virtuell: 'anhang', anhangAn: 'notiz', nichtInVorlage: true, alias: ['monatsbetrag', 'pauschale', 'monatspauschale', 'betrag monat', 'fee'] },
      { key: 'laufzeit', label: 'Laufzeit (in die Notiz)', typ: 'text', virtuell: 'anhang', anhangAn: 'notiz', nichtInVorlage: true, alias: ['laufzeit', 'beginn', 'start', 'ende', 'kuendigungsfrist', 'kündigungsfrist'] },
    ],
  },
  {
    key: 'duengung',
    label: 'Düngung (Schlagkartei)',
    icon: '🧪',
    tabelle: 'schlag_duengung',
    beschreibung: 'Düngemaßnahmen je Schlag mit Menge und Nährstoffen (DüV-Aufzeichnung). Fehlende Schläge werden mit ihrem Namen angelegt — Fläche bitte nachtragen.',
    schluesselFelder: ['schlag_id+datum+duengemittel', '__nach+datum+duengemittel'],
    eigeneFelderModul: 'schlag_duengung',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/schlagkartei',
    nachschlag: { ausFeld: 'schlag', tabelle: 'schlag', nameSpalte: 'bezeichnung', spalte: 'schlag_id', anlegen: true, label: 'Schlag', anlegenMit: { status: 'aktiv' } },
    listen: [
      { feld: 'art', label: 'Art', standard: 'mineralisch', textFeld: 'notiz', liste: liste(['mineralisch', 'organisch'], { mineral: 'mineralisch', handelsduenger: 'mineralisch', handelsdünger: 'mineralisch', kunstduenger: 'mineralisch', kunstdünger: 'mineralisch', wirtschaftsduenger: 'organisch', wirtschaftsdünger: 'organisch', guelle: 'organisch', gülle: 'organisch', mist: 'organisch', gaerrest: 'organisch', gärrest: 'organisch', kompost: 'organisch', jauche: 'organisch' }) },
      { feld: 'einheit', label: 'Einheit', standard: 'kg/ha', textFeld: 'notiz', liste: liste(['kg/ha', 'm3/ha', 'dt/ha', 't/ha'], { 'kg ha': 'kg/ha', kg: 'kg/ha', 'm³/ha': 'm3/ha', 'cbm/ha': 'm3/ha', m3: 'm3/ha', cbm: 'm3/ha', 'dt ha': 'dt/ha', dt: 'dt/ha', 't ha': 't/ha', t: 't/ha' }) },
    ],
    felder: [
      { key: 'schlag', label: 'Schlag', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Wird mit Ihren Schlägen verknüpft; fehlende werden angelegt.', alias: ['schlag', 'schlagname', 'feldstueck', 'feldstück', 'feld', 'flaeche', 'fläche'] },
      { key: 'datum', label: 'Datum', typ: 'datum', pflicht: true, alias: ['datum', 'ausgebracht am', 'duengedatum', 'düngedatum', 'termin'] },
      { key: 'duengemittel', label: 'Düngemittel', typ: 'text', alias: ['duengemittel', 'düngemittel', 'duenger', 'dünger', 'produkt', 'mittel'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'mineralisch', hinweis: 'mineralisch · organisch', alias: ['art', 'duengerart', 'düngerart', 'typ'] },
      { key: 'menge', label: 'Menge je ha', typ: 'zahl', standard: 0, alias: ['menge', 'menge ha', 'aufwandmenge', 'menge je ha', 'ausbringmenge'] },
      { key: 'einheit', label: 'Einheit', typ: 'text', standard: 'kg/ha', hinweis: 'kg/ha · m3/ha · dt/ha · t/ha', alias: ['einheit', 'me'] },
      { key: 'n_gesamt', label: 'Gesamt-N (kg N/ha)', typ: 'zahl', standard: 0, alias: ['n gesamt', 'gesamt n', 'n', 'stickstoff', 'n kg ha', 'kg n ha'] },
      { key: 'n_verfuegbar', label: 'Verfügbarer N (kg N/ha)', typ: 'zahl', alias: ['n verfuegbar', 'n verfügbar', 'verfuegbarer n', 'verfügbarer n', 'nh4', 'pflanzenverfuegbar'] },
      { key: 'p2o5', label: 'P2O5 (kg/ha)', typ: 'zahl', standard: 0, alias: ['p2o5', 'phosphat', 'p'] },
      { key: 'anwender', label: 'Anwender', typ: 'text', alias: ['anwender', 'fahrer', 'ausgebracht von', 'mitarbeiter'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen'] },
    ],
  },
  {
    key: 'forst_objekte',
    label: 'Forst-/Baum-Objekte',
    icon: '🌳',
    tabelle: 'forst_objekte',
    beschreibung: 'Grundstücke, Parks und Anlagen mit Baumbestand für das Baumkataster.',
    schluesselFelder: ['bezeichnung'],
    eigeneFelderModul: 'forst_objekte',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/forst',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'objekt', 'grundstueck', 'grundstück', 'anlage', 'park', 'name', 'liegenschaft'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'lage', 'strasse', 'straße', 'ort'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen', 'eigentuemer', 'eigentümer', 'auftraggeber'] },
    ],
  },
  {
    key: 'forst_baeume',
    label: 'Bäume (Baumkataster)',
    icon: '🌲',
    tabelle: 'forst_baeume',
    beschreibung: 'Bäume je Objekt mit Art, Maßen, Zustand und Kontrollintervall — die nächste Kontrolle wird wie im Modul gerechnet. Fehlende Objekte werden angelegt.',
    schluesselFelder: ['objekt_id+notiz', '__nach+notiz'],
    eigeneFelderModul: 'forst_baeume',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/forst',
    nachschlag: { ausFeld: 'objekt', tabelle: 'forst_objekte', nameSpalte: 'bezeichnung', spalte: 'objekt_id', anlegen: true, label: 'Objekt' },
    listen: [{ feld: 'zustand', label: 'Zustand', standard: 'gut', textFeld: 'notiz', liste: liste(['gut', 'beobachten', 'kritisch'], { vital: 'gut', gesund: 'gut', ok: 'gut', 'leicht geschaedigt': 'beobachten', 'leicht geschädigt': 'beobachten', mittel: 'beobachten', maessig: 'beobachten', mäßig: 'beobachten', geschaedigt: 'kritisch', geschädigt: 'kritisch', 'stark geschaedigt': 'kritisch', 'stark geschädigt': 'kritisch', abgaengig: 'kritisch', abgängig: 'kritisch', 'nicht verkehrssicher': 'kritisch', faellen: 'kritisch', fällen: 'kritisch', tot: 'kritisch' }) }],
    folgeDatum: [{ ziel: 'naechste_kontrolle', aus: 'letzte_kontrolle', monateFeld: 'kontrollintervall_monate' }],
    felder: [
      { key: 'objekt', label: 'Objekt', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Wird mit Ihren Objekten verknüpft; fehlende werden angelegt.', alias: ['objekt', 'grundstueck', 'grundstück', 'anlage', 'park', 'standort', 'liegenschaft'] },
      { key: 'baum_nr', label: 'Baum-Nr.', typ: 'text', virtuell: 'anhang', anhangAn: 'notiz', hinweis: 'Steht in der Notiz und erkennt den Baum beim zweiten Import wieder.', alias: ['baum nr', 'baumnummer', 'baum nummer', 'nr', 'nummer', 'baum id', 'plakette'] },
      { key: 'art', label: 'Baumart', typ: 'text', alias: ['art', 'baumart', 'gattung', 'spezies', 'botanischer name', 'deutscher name'] },
      { key: 'hoehe_m', label: 'Höhe (m)', typ: 'zahl', alias: ['hoehe m', 'höhe m', 'hoehe', 'höhe', 'baumhoehe', 'baumhöhe'] },
      { key: 'stammdurchmesser_cm', label: 'Stammdurchmesser (cm)', typ: 'zahl', alias: ['stammdurchmesser cm', 'stammdurchmesser', 'bhd', 'durchmesser', 'stammumfang'] },
      { key: 'zustand', label: 'Zustand', typ: 'text', standard: 'gut', hinweis: 'gut · beobachten · kritisch', alias: ['zustand', 'vitalitaet', 'vitalität', 'ampel', 'verkehrssicherheit'] },
      { key: 'kontrollintervall_monate', label: 'Kontrollintervall (Monate)', typ: 'zahl', standard: 12, alias: ['kontrollintervall monate', 'kontrollintervall', 'intervall', 'regelkontrolle'] },
      { key: 'letzte_kontrolle', label: 'Letzte Kontrolle', typ: 'datum', alias: ['letzte kontrolle', 'kontrolliert am', 'kontrolle am', 'kontrolldatum'] },
      { key: 'naechste_kontrolle', label: 'Nächste Kontrolle', typ: 'datum', hinweis: 'Leer: letzte Kontrolle + Intervall.', alias: ['naechste kontrolle', 'nächste kontrolle', 'faellig', 'fällig'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'massnahme', 'maßnahme', 'notizen'] },
    ],
  },
  // --- Paket 134: Umzug Schritt 4 Teil 3 — Pflanzenschutz, Immobilien, Bildung/Vereine ---
  {
    key: 'psm',
    label: 'Pflanzenschutz (Schlagkartei)',
    icon: '🌿',
    tabelle: 'schlag_psm',
    beschreibung: 'Pflanzenschutz-Anwendungen je Schlag mit Mittel, Zulassungsnummer und Aufwandmenge (Aufzeichnungspflicht). Fehlende Schläge werden angelegt.',
    schluesselFelder: ['schlag_id+datum+mittel_name', '__nach+datum+mittel_name'],
    eigeneFelderModul: 'schlag_psm',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/schlagkartei',
    nachschlag: { ausFeld: 'schlag', tabelle: 'schlag', nameSpalte: 'bezeichnung', spalte: 'schlag_id', anlegen: true, label: 'Schlag', anlegenMit: { status: 'aktiv' } },
    listen: [
      { feld: 'verwendungsart', label: 'Verwendungsart', standard: 'freiland', liste: liste(['freiland', 'gewaechshaus', 'saatgut'], { feld: 'freiland', acker: 'freiland', gewächshaus: 'gewaechshaus', unterglas: 'gewaechshaus', 'unter glas': 'gewaechshaus', beize: 'saatgut', saatgutbehandlung: 'saatgut' }) },
      { feld: 'aufwand_einheit', label: 'Einheit', standard: 'l/ha', liste: liste(['l/ha', 'kg/ha'], { l: 'l/ha', 'l ha': 'l/ha', liter: 'l/ha', kg: 'kg/ha', 'kg ha': 'kg/ha' }) },
    ],
    felder: [
      { key: 'schlag', label: 'Schlag', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Wird mit Ihren Schlägen verknüpft; fehlende werden angelegt.', alias: ['schlag', 'schlagname', 'feldstueck', 'feldstück', 'feld'] },
      { key: 'datum', label: 'Datum', typ: 'datum', pflicht: true, alias: ['datum', 'anwendungsdatum', 'behandelt am', 'ausgebracht am'] },
      { key: 'startzeit', label: 'Uhrzeit', typ: 'text', alias: ['startzeit', 'uhrzeit', 'beginn', 'zeit'] },
      { key: 'mittel_name', label: 'Mittel', typ: 'text', pflicht: true, alias: ['mittel name', 'mittel', 'pflanzenschutzmittel', 'psm', 'produkt', 'handelsname'] },
      { key: 'zulassungsnr', label: 'Zulassungsnummer', typ: 'text', alias: ['zulassungsnr', 'zulassungsnummer', 'zulassung', 'zul nr', 'kennnummer'] },
      { key: 'aufwandmenge', label: 'Aufwandmenge', typ: 'zahl', standard: 0, alias: ['aufwandmenge', 'menge', 'aufwand', 'menge ha', 'dosis'] },
      { key: 'aufwand_einheit', label: 'Einheit', typ: 'text', standard: 'l/ha', hinweis: 'l/ha · kg/ha', alias: ['aufwand einheit', 'einheit', 'me'] },
      { key: 'verwendungsart', label: 'Verwendungsart', typ: 'text', standard: 'freiland', hinweis: 'freiland · gewaechshaus · saatgut', alias: ['verwendungsart', 'anwendungsart', 'art'] },
      { key: 'kultur', label: 'Kultur', typ: 'text', alias: ['kultur', 'frucht', 'hauptfrucht'] },
      { key: 'flaeche_ha', label: 'Behandelte Fläche (ha)', typ: 'zahl', alias: ['flaeche ha', 'fläche ha', 'behandelte flaeche', 'behandelte fläche', 'flaeche', 'fläche', 'ha'] },
      { key: 'eppo_code', label: 'EPPO-Code', typ: 'text', alias: ['eppo code', 'eppo', 'eppo kultur'] },
      { key: 'bbch_stadium', label: 'BBCH-Stadium', typ: 'text', alias: ['bbch stadium', 'bbch', 'stadium', 'entwicklungsstadium'] },
      { key: 'anwendungsgebiet', label: 'Anwendungsgebiet', typ: 'text', alias: ['anwendungsgebiet', 'schaderreger', 'indikation', 'gegen'] },
      { key: 'wartezeit_tage', label: 'Wartezeit (Tage)', typ: 'zahl', alias: ['wartezeit tage', 'wartezeit', 'wz'] },
      { key: 'anwender', label: 'Anwender', typ: 'text', alias: ['anwender', 'fahrer', 'ausgebracht von', 'sachkunde', 'sachkundenachweis'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen'] },
    ],
  },
  {
    key: 'einheiten',
    label: 'Mieteinheiten (Immobilien)',
    icon: '🏢',
    tabelle: 'immo_einheiten',
    beschreibung: 'Wohnungen, Gewerbeeinheiten und Stellplätze je Objekt mit Fläche und Soll-Miete.',
    schluesselFelder: ['objekt+bezeichnung'],
    eigeneFelderModul: 'immo_einheiten',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/immobilien',
    listen: [{ feld: 'status', label: 'Status', standard: 'frei', textFeld: 'notiz', liste: liste(['frei', 'vermietet'], { leer: 'frei', leerstand: 'frei', verfuegbar: 'frei', verfügbar: 'frei', belegt: 'vermietet', vermietet: 'vermietet', bewohnt: 'vermietet' }) }],
    felder: [
      { key: 'objekt', label: 'Objekt / Gebäude', typ: 'text', alias: ['objekt', 'gebaeude', 'gebäude', 'haus', 'liegenschaft', 'adresse', 'anschrift'] },
      { key: 'bezeichnung', label: 'Einheit', typ: 'text', pflicht: true, alias: ['bezeichnung', 'einheit', 'wohnung', 'we', 'whg', 'lage', 'einheit nr', 'wohnungsnummer'] },
      { key: 'flaeche_qm', label: 'Fläche (m²)', typ: 'zahl', alias: ['flaeche qm', 'fläche', 'flaeche', 'wohnflaeche', 'wohnfläche', 'qm', 'm2', 'm²'] },
      { key: 'zimmer', label: 'Zimmer', typ: 'zahl', alias: ['zimmer', 'raeume', 'räume', 'zimmeranzahl'] },
      { key: 'kaltmiete', label: 'Kaltmiete (Soll)', typ: 'zahl', standard: 0, alias: ['kaltmiete', 'grundmiete', 'nettokaltmiete', 'miete kalt', 'sollmiete'] },
      { key: 'nebenkosten', label: 'Nebenkosten (Soll)', typ: 'zahl', standard: 0, alias: ['nebenkosten', 'nk', 'betriebskosten', 'nk vorauszahlung', 'vorauszahlung'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'frei', hinweis: 'frei · vermietet', alias: ['status', 'belegung'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen', 'ausstattung'] },
    ],
  },
  {
    key: 'mietvertraege',
    label: 'Mietverträge',
    icon: '📜',
    tabelle: 'immo_mietvertraege',
    beschreibung: 'Laufende und beendete Mietverträge mit Mieter, Beginn und Miete — mit der Einheit verknüpft (fehlende Einheiten werden als vermietet angelegt). Es werden keine Mieteingänge oder Kautionsbuchungen erzeugt.',
    schluesselFelder: ['einheit_id+mieter_name+beginn', '__nach+mieter_name+beginn'],
    eigeneFelderModul: 'immo_mietvertraege',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/immobilien',
    nachschlag: { ausFeld: 'einheit', tabelle: 'immo_einheiten', nameSpalte: 'bezeichnung', spalte: 'einheit_id', anlegen: true, label: 'Einheit', anlegenMit: { status: 'vermietet' }, textFeld: 'notiz' },
    listen: [{ feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv', 'beendet'], { laufend: 'aktiv', aktiv: 'aktiv', bestehend: 'aktiv', beendet: 'beendet', ausgezogen: 'beendet', abgelaufen: 'beendet', aufgehoben: 'beendet' }) }],
    felder: [
      { key: 'einheit', label: 'Einheit', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Name der Einheit wie in Ihren Mieteinheiten; fehlende werden angelegt.', alias: ['einheit', 'wohnung', 'we', 'whg', 'mietobjekt', 'einheit nr'] },
      { key: 'mieter_name', label: 'Mieter', typ: 'text', pflicht: true, alias: ['mieter name', 'mieter', 'name', 'mietername', 'vertragspartner'] },
      { key: 'mieter_email', label: 'Mieter E-Mail', typ: 'text', alias: ['mieter email', 'email', 'e-mail', 'mail'] },
      { key: 'beginn', label: 'Mietbeginn', typ: 'datum', alias: ['beginn', 'mietbeginn', 'vertragsbeginn', 'einzug', 'ab'] },
      { key: 'ende', label: 'Mietende', typ: 'datum', alias: ['ende', 'mietende', 'vertragsende', 'auszug', 'bis'] },
      { key: 'kaltmiete', label: 'Kaltmiete', typ: 'zahl', standard: 0, alias: ['kaltmiete', 'grundmiete', 'nettokaltmiete', 'miete'] },
      { key: 'nebenkosten', label: 'Nebenkosten', typ: 'zahl', standard: 0, alias: ['nebenkosten', 'nk', 'nk vorauszahlung', 'betriebskosten', 'vorauszahlung'] },
      { key: 'kaution', label: 'Kaution (vereinbart)', typ: 'zahl', standard: 0, hinweis: 'Nur die vereinbarte Höhe — Kautionskonto und Zahlungen übernehmen wir gemeinsam.', alias: ['kaution', 'mietsicherheit', 'sicherheit'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · beendet', alias: ['status', 'vertragsstatus'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen'] },
    ],
  },
  {
    key: 'interessenten',
    label: 'Exposé-Interessenten',
    icon: '🙋',
    tabelle: 'expose_interessent',
    beschreibung: 'Interessenten je Exposé mit Kontaktdaten und Stand. Vorher die Exposé-Objekte importieren. Werbe-Einwilligungen werden nie aus Dateien übernommen.',
    schluesselFelder: ['expose_id+email', 'expose_id+name'],
    eigeneFelderModul: 'expose_interessent',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/expose',
    nachschlag: { ausFeld: 'expose', tabelle: 'expose', nameSpalte: 'bezeichnung', spalte: 'expose_id', label: 'Exposé', pflicht: true, mehrzahl: 'die Exposé-Objekte' },
    listen: [{ feld: 'status', label: 'Status', standard: 'neu', textFeld: 'notiz', liste: liste(['neu', 'besichtigung', 'angebot', 'zusage', 'abgesagt'], { offen: 'neu', anfrage: 'neu', kontakt: 'neu', besichtigt: 'besichtigung', termin: 'besichtigung', 'besichtigung vereinbart': 'besichtigung', verhandlung: 'angebot', reserviert: 'zusage', gekauft: 'zusage', 'mietvertrag': 'zusage', absage: 'abgesagt', 'kein interesse': 'abgesagt', verloren: 'abgesagt' }) }],
    felder: [
      { key: 'expose', label: 'Exposé', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Bezeichnung wie in Ihren Exposé-Objekten.', alias: ['expose', 'exposé', 'objekt', 'immobilie', 'angebot', 'objektname'] },
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, alias: ['name', 'interessent', 'kontakt', 'kunde', 'vollstaendiger name'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'mobil', 'handy', 'phone'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'neu', hinweis: 'neu · besichtigung · angebot · zusage · abgesagt', alias: ['status', 'stand', 'phase'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen', 'nachricht', 'anfrage text'] },
    ],
  },
  {
    key: 'anmeldungen',
    label: 'Kurs-Anmeldungen',
    icon: '📝',
    tabelle: 'bildung_anmeldungen',
    beschreibung: 'Teilnehmer je Kurs mit Stand der Anmeldung. Vorher die Kurse importieren — Anmeldungen ohne passenden Kurs bleiben mit Grund in der Datei.',
    schluesselFelder: ['kurs_id+email', 'kurs_id+name'],
    eigeneFelderModul: 'bildung_anmeldungen',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/bildung',
    nachschlag: { ausFeld: 'kurs', tabelle: 'bildung_kurse', nameSpalte: 'titel', spalte: 'kurs_id', label: 'Kurs', pflicht: true, mehrzahl: 'die Kurse' },
    listen: [{ feld: 'status', label: 'Status', standard: 'angemeldet', liste: liste(['angemeldet', 'bestaetigt', 'teilgenommen', 'storniert'], { neu: 'angemeldet', offen: 'angemeldet', gebucht: 'angemeldet', bestätigt: 'bestaetigt', bezahlt: 'bestaetigt', fix: 'bestaetigt', anwesend: 'teilgenommen', abgeschlossen: 'teilgenommen', bestanden: 'teilgenommen', abgesagt: 'storniert', abgemeldet: 'storniert', ausgefallen: 'storniert' }) }],
    felder: [
      { key: 'kurs', label: 'Kurs', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Kurstitel wie in Ihren Kursen.', alias: ['kurs', 'kursname', 'kurstitel', 'seminar', 'veranstaltung', 'lehrgang'] },
      { key: 'name', label: 'Teilnehmer', typ: 'text', pflicht: true, alias: ['name', 'teilnehmer', 'teilnehmerin', 'person', 'vollstaendiger name'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'angemeldet', hinweis: 'angemeldet · bestaetigt · teilgenommen · storniert', alias: ['status', 'stand', 'anmeldestatus'] },
    ],
  },
  {
    key: 'ehrenamt',
    label: 'Ehrenamts-Stunden',
    icon: '🙌',
    tabelle: 'verein_ehrenamt',
    beschreibung: 'Geleistete Ehrenamtsstunden je Person und Tag (höchstens 24 Stunden je Eintrag).',
    schluesselFelder: ['person+datum+taetigkeit', 'person+datum'],
    eigeneFelderModul: 'verein_ehrenamt',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/verein',
    ausblenden: ['mitglied_id', 'erstellt_von'],
    grenzen: [{ feld: 'stunden', groesserAls: 0, hoechstens: 24, grund: 'Stunden müssen größer als 0 und höchstens 24 je Eintrag sein — bitte auf mehrere Tage aufteilen.' }],
    felder: [
      { key: 'person', label: 'Person', typ: 'text', pflicht: true, alias: ['person', 'name', 'mitglied', 'helfer', 'helferin', 'ehrenamtliche'] },
      { key: 'datum', label: 'Datum', typ: 'datum', pflicht: true, alias: ['datum', 'tag', 'einsatz am', 'am'] },
      { key: 'stunden', label: 'Stunden', typ: 'zahl', pflicht: true, alias: ['stunden', 'std', 'dauer', 'zeit h', 'anzahl stunden'] },
      { key: 'taetigkeit', label: 'Tätigkeit', typ: 'text', alias: ['taetigkeit', 'tätigkeit', 'aufgabe', 'einsatz', 'arbeit', 'bemerkung'] },
    ],
  },
  // --- Paket 135: Nutzungsrechte (Agentur/Kreative) ---
  {
    key: 'nutzungsrechte',
    label: 'Nutzungsrechte (Lizenzen)',
    icon: '©️',
    tabelle: 'agentur_nutzungsrecht',
    beschreibung: 'Eingeräumte Nutzungsrechte je Werk und Kunde — Art, Gebiet, Medien, Zeitraum — und das Recht, das Sie selbst vom Urheber haben. Ablaufende Rechte erscheinen gleich mit Ampel.',
    schluesselFelder: ['werk+kunde+von', 'werk+kunde'],
    eigeneFelderModul: 'agentur_nutzungsrecht',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/agentur/nutzungsrechte',
    ausblenden: ['retainer_id'],
    listen: [
      { feld: 'recht', label: 'Recht', standard: 'einfach', textFeld: 'notiz', liste: liste(['einfach', 'ausschliesslich'], { 'nicht exklusiv': 'einfach', nichtexklusiv: 'einfach', 'non exclusive': 'einfach', einfaches: 'einfach', ausschließlich: 'ausschliesslich', exklusiv: 'ausschliesslich', exclusive: 'ausschliesslich', ausschliessliches: 'ausschliesslich' }) },
    ],
    felder: [
      { key: 'werk', label: 'Werk', typ: 'text', pflicht: true, alias: ['werk', 'titel', 'motiv', 'asset', 'bild', 'foto', 'datei', 'bezeichnung'] },
      { key: 'kunde', label: 'Kunde', typ: 'text', alias: ['kunde', 'kundenname', 'auftraggeber', 'lizenznehmer'] },
      { key: 'werkart', label: 'Werkart', typ: 'text', alias: ['werkart', 'art', 'typ', 'medienart', 'gattung'] },
      { key: 'recht', label: 'Recht', typ: 'text', standard: 'einfach', hinweis: 'einfach · ausschliesslich', alias: ['recht', 'rechteart', 'lizenzart', 'exklusivitaet', 'exklusivität'] },
      { key: 'raum', label: 'Gebiet', typ: 'text', alias: ['raum', 'gebiet', 'territorium', 'region', 'land'] },
      { key: 'medien', label: 'Nutzungsarten', typ: 'text', hinweis: 'Mehrere mit Komma: Print, Website, Social Media, Online-Werbung, TV/Video, Außenwerbung, Verpackung, Messe/Event.', alias: ['medien', 'nutzungsarten', 'nutzungsart', 'kanaele', 'kanäle', 'verwendung', 'medium'] },
      { key: 'von', label: 'Von', typ: 'datum', alias: ['von', 'beginn', 'ab', 'gueltig ab', 'gültig ab', 'lizenzbeginn'] },
      { key: 'bis', label: 'Bis', typ: 'datum', alias: ['bis', 'ende', 'gueltig bis', 'gültig bis', 'ablauf', 'lizenzende'] },
      { key: 'bearbeitung', label: 'Bearbeitung erlaubt', typ: 'jaNein', standard: false, alias: ['bearbeitung', 'bearbeitungsrecht', 'aenderungen erlaubt', 'änderungen erlaubt'] },
      { key: 'weiterlizenz', label: 'Weiterlizenz erlaubt', typ: 'jaNein', standard: false, alias: ['weiterlizenz', 'unterlizenz', 'sublizenz', 'weitergabe'] },
      { key: 'urheber', label: 'Urheber', typ: 'text', alias: ['urheber', 'fotograf', 'fotografin', 'kreativer', 'lizenzgeber', 'quelle', 'bildagentur'] },
      { key: 'fremd_recht', label: 'Eigenes Recht vom Urheber', typ: 'text', hinweis: 'einfach · ausschliesslich (leer, wenn Sie selbst Urheber sind)', alias: ['fremd recht', 'eigenes recht', 'recht vom urheber', 'eingekauftes recht'] },
      { key: 'fremd_bis', label: 'Eigenes Recht bis', typ: 'datum', alias: ['fremd bis', 'eigenes recht bis', 'recht vom urheber bis'] },
      { key: 'fremd_medien', label: 'Eigene Nutzungsarten vom Urheber', typ: 'text', alias: ['fremd medien', 'eigene nutzungsarten', 'eingekaufte nutzungsarten'] },
      { key: 'verguetung', label: 'Vergütung', typ: 'zahl', alias: ['verguetung', 'vergütung', 'lizenzgebuehr', 'lizenzgebühr', 'honorar', 'preis'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'notizen', 'auflagen'] },
    ],
  },
  // Paket 138: GEMEINSAM freigegeben 27.09.2026 — Gutscheine mit Restwert,
  // keine Einloesungen, keine Rechnung.
  {
    key: 'gutscheine',
    label: 'Gutscheine & Karten',
    icon: '🎁',
    tabelle: 'gutschein',
    beschreibung: 'Ausgegebene Wertgutscheine, Mehrfachkarten und Leistungsgutscheine. Übernommen wird der RESTWERT (bzw. die restlichen Nutzungen) — '
      + 'Ursprungswert und Eingelöstes stehen in der Notiz. Es werden keine Einlösungen und keine Rechnungen angelegt.',
    schluesselFelder: ['code'],
    eigeneFelderModul: 'gutschein',
    nurMitKatalog: true,
    kundeVerweis: { spalte: 'kontakt_id', ausFeldern: ['empfaenger_name'] },
    ergebnisHref: '/dashboard/gutscheine',
    listen: [
      { feld: 'art', label: 'Art', standard: 'wert', textFeld: 'notiz', liste: liste(['wert', 'mehrfachkarte', 'leistung'], { wertgutschein: 'wert', geldgutschein: 'wert', guthaben: 'wert', gutschein: 'wert', 'gift card': 'wert', giftcard: 'wert', 'voucher': 'wert', mehrfach: 'mehrfachkarte', '10er karte': 'mehrfachkarte', zehnerkarte: 'mehrfachkarte', '5er karte': 'mehrfachkarte', punktekarte: 'mehrfachkarte', abo: 'mehrfachkarte', paket: 'mehrfachkarte', leistungsgutschein: 'leistung', sachgutschein: 'leistung', behandlung: 'leistung', erlebnis: 'leistung' }) },
      { feld: 'mwst_typ', label: 'Gutschein-Typ (USt)', standard: 'mehrzweck', textFeld: 'notiz', liste: liste(['mehrzweck', 'einzweck'], { mehrzweckgutschein: 'mehrzweck', einzweckgutschein: 'einzweck', mzg: 'mehrzweck', ezg: 'einzweck' }) },
      { feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv', 'eingeloest', 'verfallen', 'storniert'], { offen: 'aktiv', gueltig: 'aktiv', 'teilweise eingeloest': 'aktiv', teileingeloest: 'aktiv', active: 'aktiv', eingelöst: 'eingeloest', verbraucht: 'eingeloest', redeemed: 'eingeloest', abgelaufen: 'verfallen', expired: 'verfallen', storno: 'storniert', cancelled: 'storniert', canceled: 'storniert' }) },
    ],
    felder: [
      { key: 'code', label: 'Gutschein-Code', typ: 'text', pflicht: true, alias: ['code', 'gutscheincode', 'gutscheinnummer', 'gutschein nr', 'nummer', 'nr', 'voucher code', 'kartennummer', 'seriennummer'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'wert', hinweis: 'wert · mehrfachkarte · leistung', alias: ['art', 'typ', 'gutscheinart', 'kartenart'] },
      { key: 'wert', label: 'Ursprungswert (€)', typ: 'zahl', alias: ['wert', 'ursprungswert', 'betrag', 'nennwert', 'ausgabewert', 'kartenpreis', 'preis', 'value'] },
      { key: 'restwert', label: 'Restwert (€)', typ: 'zahl', virtuell: 'rechnen', hinweis: 'Wird der Startwert in ARGONAUT.', alias: ['restwert', 'restguthaben', 'guthaben', 'saldo', 'offen', 'offener betrag', 'balance', 'remaining'] },
      { key: 'eingeloest_betrag', label: 'Bereits eingelöst (€)', typ: 'zahl', virtuell: 'rechnen', alias: ['eingeloest', 'eingelöst', 'eingeloester betrag', 'eingelöster betrag', 'verbraucht', 'redeemed'] },
      { key: 'nutzungen_gesamt', label: 'Nutzungen gesamt', typ: 'zahl', alias: ['nutzungen', 'nutzungen gesamt', 'anzahl nutzungen', 'besuche', 'einheiten', 'anzahl'] },
      { key: 'nutzungen_genutzt', label: 'Nutzungen genutzt', typ: 'zahl', virtuell: 'rechnen', alias: ['genutzt', 'nutzungen genutzt', 'verbrauchte nutzungen', 'besuche genutzt'] },
      { key: 'nutzungen_rest', label: 'Nutzungen übrig', typ: 'zahl', virtuell: 'rechnen', alias: ['rest', 'restnutzungen', 'nutzungen uebrig', 'nutzungen übrig', 'verbleibend', 'offene nutzungen'] },
      { key: 'mwst_typ', label: 'Gutschein-Typ (USt)', typ: 'text', standard: 'mehrzweck', hinweis: 'mehrzweck · einzweck', alias: ['mwst typ', 'ust typ', 'gutscheintyp', 'einzweck mehrzweck'] },
      { key: 'mwst_satz', label: 'MwSt-Satz', typ: 'zahl', standard: 19, alias: ['mwst', 'mwst satz', 'ust', 'steuersatz'] },
      { key: 'leistung_text', label: 'Leistung', typ: 'text', alias: ['leistung', 'leistungstext', 'inhalt', 'behandlung'] },
      { key: 'kunde_nummer', label: 'Kundennummer (zum Verknüpfen)', typ: 'text', virtuell: 'kunde_verweis', nichtInVorlage: true, alias: ['kundennummer', 'kundennr', 'kunden nr', 'kd nr'] },
      { key: 'empfaenger_name', label: 'Empfänger', typ: 'text', alias: ['empfaenger', 'empfänger', 'beschenkter', 'inhaber', 'kunde', 'kaeufer', 'käufer', 'name'] },
      { key: 'anlass', label: 'Anlass', typ: 'text', alias: ['anlass', 'grund', 'aktion'] },
      { key: 'ausgestellt_am', label: 'Ausgestellt am', typ: 'datum', alias: ['ausgestellt am', 'ausgestellt', 'ausgabedatum', 'verkauft am', 'kaufdatum', 'datum'] },
      { key: 'gueltig_bis', label: 'Gültig bis', typ: 'datum', alias: ['gueltig bis', 'gültig bis', 'ablauf', 'ablaufdatum', 'verfall', 'verfällt', 'expires'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · eingeloest · verfallen · storniert', alias: ['status'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'kommentar'] },
    ],
  },
  // Paket 139: GEMEINSAM freigegeben 27.09.2026 — Foerdervorhaben, nur Chef.
  {
    key: 'foerdervorhaben',
    label: 'Fördervorhaben',
    icon: '💰',
    tabelle: 'foerder_vorhaben',
    beschreibung: 'Beantragte und bewilligte Förderprogramme mit Fristen, Beträgen und Stand des Verwendungsnachweises. '
      + 'Programme aus dem ARGONAUT-Katalog werden erkannt, andere als eigenes Vorhaben übernommen. Nur die Geschäftsleitung.',
    schluesselFelder: ['programm_key'],
    eigeneFelderModul: 'foerdermittel',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/foerdermittel',
    listen: [
      { feld: 'status', label: 'Status', standard: 'interessiert', textFeld: 'notiz', liste: liste(['interessiert', 'beantragt', 'bewilligt', 'abgelehnt', 'abgeschlossen'], { geplant: 'interessiert', idee: 'interessiert', vorgemerkt: 'interessiert', gestellt: 'beantragt', eingereicht: 'beantragt', 'in pruefung': 'beantragt', antrag: 'beantragt', zugesagt: 'bewilligt', genehmigt: 'bewilligt', zuwendungsbescheid: 'bewilligt', laufend: 'bewilligt', abgelehnt: 'abgelehnt', ablehnung: 'abgelehnt', erledigt: 'abgeschlossen', beendet: 'abgeschlossen', ausgezahlt: 'abgeschlossen' }) },
      { feld: 'nachweis_status', label: 'Nachweis', standard: 'offen', textFeld: 'notiz', liste: liste(['offen', 'eingereicht', 'anerkannt'], { ausstehend: 'offen', fehlt: 'offen', abgegeben: 'eingereicht', versendet: 'eingereicht', geprueft: 'anerkannt', akzeptiert: 'anerkannt', erledigt: 'anerkannt' }) },
    ],
    felder: [
      { key: 'programm_name', label: 'Programm', typ: 'text', pflicht: true, alias: ['programm', 'programmname', 'foerderprogramm', 'förderprogramm', 'foerderung', 'förderung', 'vorhaben', 'massnahme', 'maßnahme'] },
      { key: 'programm_key', label: 'Programm-Schlüssel (ARGONAUT)', typ: 'text', nurExakt: true, nichtInVorlage: true, alias: ['programm_key'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'interessiert', hinweis: 'interessiert · beantragt · bewilligt · abgelehnt · abgeschlossen', alias: ['status', 'stand', 'antragsstatus'] },
      { key: 'frist', label: 'Frist', typ: 'datum', alias: ['frist', 'antragsfrist', 'einreichfrist', 'deadline'] },
      { key: 'bewilligt_betrag', label: 'Bewilligt (€)', typ: 'zahl', alias: ['bewilligt', 'bewilligt betrag', 'bewilligter betrag', 'zuschuss', 'foerdersumme', 'fördersumme', 'zuwendung'] },
      { key: 'verwendet_betrag', label: 'Verwendet (€)', typ: 'zahl', alias: ['verwendet', 'verwendet betrag', 'abgerufen', 'ausgegeben', 'verbraucht'] },
      { key: 'bewilligung_von', label: 'Bewilligung von', typ: 'datum', alias: ['bewilligung von', 'bewilligungszeitraum von', 'laufzeit von', 'beginn'] },
      { key: 'bewilligung_bis', label: 'Bewilligung bis', typ: 'datum', alias: ['bewilligung bis', 'bewilligungszeitraum bis', 'laufzeit bis', 'ende'] },
      { key: 'nachweis_frist', label: 'Nachweis-Frist', typ: 'datum', alias: ['nachweis frist', 'nachweisfrist', 'verwendungsnachweis bis', 'vn frist'] },
      { key: 'nachweis_status', label: 'Nachweis', typ: 'text', standard: 'offen', hinweis: 'offen · eingereicht · anerkannt', alias: ['nachweis', 'nachweis status', 'verwendungsnachweis'] },
      { key: 'sachbericht', label: 'Sachbericht', typ: 'text', alias: ['sachbericht', 'bericht'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'kommentar', 'aktenzeichen', 'foerderkennzeichen', 'förderkennzeichen'] },
    ],
  },
  // Paket 140: GEMEINSAM freigegeben 27.09.2026 — Mitglieder & Abos OHNE
  // Bankdaten. IBAN/BIC/Mandat/Einziehungen bleiben in der Datei; das
  // SEPA-Mandat wird in ARGONAUT neu erfasst. Nur Chef (die Datenbank laesst
  // Mitarbeiter hier nichts fuer den Betrieb anlegen: mgd_insert).
  {
    key: 'mitglieder',
    label: 'Mitglieder & Abos',
    icon: '👥',
    tabelle: 'mitglieder',
    beschreibung: 'Mitglieder, Abos und Beiträge mit Intervall, Status und Vertragsdaten. Bankverbindung und SEPA-Mandat werden NICHT übernommen — '
      + 'bitte das SEPA-Mandat je Mitglied in ARGONAUT neu erfassen. Nur die Geschäftsleitung.',
    schluesselFelder: ['mitglieds_nr', 'name+email'],
    eigeneFelderModul: 'mitglieder',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/mitglieder',
    bankGrund: 'Bankverbindung und SEPA-Mandat übernimmt ARGONAUT nicht aus einer Datei — bitte das SEPA-Mandat in ARGONAUT neu erfassen.',
    sperren: [
      { muster: 'letzte einziehung|einziehung|einzug|lastschrift|erst einzug|erstlastschrift|folgelastschrift|glaeubiger|creditor|direct debit', grund: 'Einzugs- und Mandatsdaten übernimmt ARGONAUT nicht aus einer Datei — bitte das SEPA-Mandat in ARGONAUT neu erfassen.' },
    ],
    ausblenden: ['iban', 'bic', 'mandatsreferenz', 'mandat_datum', 'letzte_einziehung', 'erst_einzug'],
    listen: [
      { feld: 'intervall', label: 'Intervall', standard: 'monat', textFeld: 'notiz', liste: liste(['monat', 'quartal', 'jahr'], { monatlich: 'monat', mtl: 'monat', monthly: 'monat', 'pro monat': 'monat', vierteljaehrlich: 'quartal', quartalsweise: 'quartal', quartalsbeitrag: 'quartal', quarterly: 'quartal', jaehrlich: 'jahr', jahresbeitrag: 'jahr', 'pro jahr': 'jahr', yearly: 'jahr', annual: 'jahr', annually: 'jahr', 'p a': 'jahr' }) },
      { feld: 'status', label: 'Status', standard: 'aktiv', textFeld: 'notiz', liste: liste(['aktiv', 'pausiert', 'gekuendigt'], { active: 'aktiv', laufend: 'aktiv', mitglied: 'aktiv', ordentlich: 'aktiv', beitragsfrei: 'aktiv', ehrenmitglied: 'aktiv', ruhend: 'pausiert', ruht: 'pausiert', pause: 'pausiert', paused: 'pausiert', passiv: 'pausiert', gekündigt: 'gekuendigt', kuendigung: 'gekuendigt', ausgetreten: 'gekuendigt', austritt: 'gekuendigt', beendet: 'gekuendigt', ehemalig: 'gekuendigt', inaktiv: 'gekuendigt', cancelled: 'gekuendigt', canceled: 'gekuendigt' }) },
      { feld: 'vertragsart', label: 'Vertragsart', standard: 'studio', textFeld: 'notiz', liste: liste(['studio', 'verein'], { abo: 'studio', vertrag: 'studio', fitness: 'studio', fitnessstudio: 'studio', kurs: 'studio', mitgliedschaft: 'verein', vereinsmitglied: 'verein', satzung: 'verein', ev: 'verein', 'e v': 'verein' }) },
      { feld: 'satzung_zum', label: 'Austritt laut Satzung zum', standard: 'jahresende', textFeld: 'notiz', liste: liste(['monatsende', 'quartalsende', 'jahresende', 'jederzeit'], { monat: 'monatsende', 'ende des monats': 'monatsende', quartal: 'quartalsende', 'ende des quartals': 'quartalsende', jahr: 'jahresende', 'ende des jahres': 'jahresende', 'ende des geschaeftsjahres': 'jahresende', geschaeftsjahr: 'jahresende', kalenderjahr: 'jahresende', sofort: 'jederzeit' }) },
    ],
    felder: [
      { key: 'mitglieds_nr', label: 'Mitgliedsnummer', typ: 'text', alias: ['mitgliedsnummer', 'mitglieds nr', 'mitgliedsnr', 'mitglied nr', 'mitglieder nr', 'mitgl nr', 'member id', 'member number', 'vertragsnummer', 'abo nr', 'abonummer'] },
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, hinweis: 'Oder Vorname und Nachname in zwei Spalten — sie werden zusammengesetzt.', alias: ['name', 'mitglied', 'mitgliedsname', 'vollstaendiger name', 'vollständiger name', 'full name', 'kunde', 'abonnent'] },
      // Die Namens-Helfer heissen wie bei den Leads (lead_*), weil virtuelleFelderAufloesen sie dort schon zusammensetzt.
      { key: 'lead_vorname', label: 'Vorname (zum Namen)', typ: 'text', virtuell: 'name_teil', fuellt: 'name', nichtInVorlage: true, alias: ['vorname', 'first name', 'rufname'] },
      { key: 'lead_nachname', label: 'Nachname (zum Namen)', typ: 'text', virtuell: 'name_teil', fuellt: 'name', nichtInVorlage: true, alias: ['nachname', 'last name', 'familienname', 'surname'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e mail', 'emailadresse', 'email address'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'handy', 'mobil', 'phone', 'mobile'] },
      { key: 'betrag', label: 'Beitrag (€ je Intervall)', typ: 'zahl', alias: ['beitrag', 'betrag', 'mitgliedsbeitrag', 'beitragshoehe', 'beitragshöhe', 'monatsbeitrag', 'abopreis', 'preis', 'gebuehr', 'gebühr', 'fee', 'amount'] },
      { key: 'intervall', label: 'Intervall', typ: 'text', standard: 'monat', hinweis: 'monat · quartal · jahr (halbjährlich und wöchentlich werden umgerechnet)', alias: ['intervall', 'zahlweise', 'zahlungsintervall', 'beitragsintervall', 'turnus', 'rhythmus', 'periode', 'billing period'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'aktiv', hinweis: 'aktiv · pausiert · gekuendigt', alias: ['status', 'mitgliedsstatus', 'abostatus', 'stand'] },
      { key: 'vertragsart', label: 'Vertragsart', typ: 'text', standard: 'studio', hinweis: 'studio (Abo/Vertrag) · verein (Satzung)', alias: ['vertragsart', 'mitgliedsart', 'art', 'tarifart'] },
      { key: 'beginn_am', label: 'Beginn', typ: 'datum', alias: ['beginn', 'beginn am', 'eintritt', 'eintrittsdatum', 'mitglied seit', 'start', 'startdatum', 'vertragsbeginn', 'member since'] },
      { key: 'abgeschlossen_am', label: 'Abgeschlossen am', typ: 'datum', alias: ['abgeschlossen am', 'vertragsabschluss', 'abschlussdatum', 'unterschrieben am'] },
      { key: 'erstlaufzeit_monate', label: 'Erstlaufzeit (Monate)', typ: 'zahl', alias: ['erstlaufzeit', 'mindestlaufzeit', 'laufzeit', 'laufzeit monate', 'vertragslaufzeit'] },
      { key: 'kuendigungsfrist_monate', label: 'Kündigungsfrist (Monate)', typ: 'zahl', alias: ['kuendigungsfrist', 'kündigungsfrist', 'kuendigungsfrist monate', 'frist monate'] },
      { key: 'verlaengerung_monate', label: 'Verlängerung (Monate)', typ: 'zahl', alias: ['verlaengerung', 'verlängerung', 'verlaengerung monate', 'automatische verlaengerung'] },
      { key: 'satzung_frist_monate', label: 'Austrittsfrist laut Satzung (Monate)', typ: 'zahl', alias: ['austrittsfrist', 'satzung frist', 'satzungsfrist'] },
      { key: 'satzung_zum', label: 'Austritt laut Satzung zum', typ: 'text', hinweis: 'monatsende · quartalsende · jahresende · jederzeit', alias: ['austritt zum', 'satzung zum', 'austrittstermin'] },
      { key: 'kuendigung_eingang', label: 'Kündigung eingegangen am', typ: 'datum', alias: ['kuendigung eingang', 'kündigung eingang', 'kuendigung eingegangen', 'gekuendigt am', 'gekündigt am', 'kuendigungsdatum', 'kündigungsdatum'] },
      { key: 'kuendigung_zum', label: 'Kündigung zum', typ: 'datum', alias: ['kuendigung zum', 'kündigung zum', 'austritt', 'austrittsdatum', 'ende', 'vertragsende', 'enddatum', 'end date'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'bemerkungen', 'kommentar', 'hinweis', 'notes'] },
    ],
  },
  // Paket 141: GEMEINSAM freigegeben 27.09.2026 — Spenden IMMER unbestaetigt,
  // keine Bestaetigungsnummer; die alte Nummer steht in der Notiz (NICHT im
  // Zweck: der Zweck wird auf die Zuwendungsbestaetigung gedruckt).
  {
    key: 'spenden',
    label: 'Spenden & Zuwendungen',
    icon: '❤️',
    tabelle: 'spende',
    beschreibung: 'Geld- und Sachspenden sowie Aufwandsverzicht. Jede Spende kommt als „unbestätigt" — ARGONAUT vergibt keine Bestätigungsnummer. '
      + 'Eine Nummer aus dem Altsystem steht in der Notiz. Bereits vorhandene Spenden werden nie überschrieben.',
    schluesselFelder: ['spender_name+datum+betrag'],
    eigeneFelderModul: 'spende',
    nurMitKatalog: true,
    nurNeu: true,
    kundeVerweis: { spalte: 'kontakt_id', ausFeldern: ['spender_name'], label: 'Kontakt', mehrzahl: 'die Kontakte' },
    ergebnisHref: '/dashboard/spenden',
    ausblenden: ['bestaetigt', 'bestaetigt_am', 'bestaetigung_nr', 'verzicht_aufwand'],
    listen: [
      { feld: 'art', label: 'Art', standard: 'geldzuwendung', textFeld: 'notiz', liste: liste(['geldzuwendung', 'sachzuwendung', 'aufwandsverzicht'], { geld: 'geldzuwendung', geldspende: 'geldzuwendung', spende: 'geldzuwendung', bar: 'geldzuwendung', barspende: 'geldzuwendung', ueberweisung: 'geldzuwendung', lastschrift: 'geldzuwendung', online: 'geldzuwendung', paypal: 'geldzuwendung', mitgliedsbeitrag: 'geldzuwendung', sach: 'sachzuwendung', sachspende: 'sachzuwendung', sachzuwendungen: 'sachzuwendung', aufwand: 'aufwandsverzicht', aufwandsspende: 'aufwandsverzicht', verzicht: 'aufwandsverzicht', 'verzicht auf aufwandsersatz': 'aufwandsverzicht', aufwandsentschaedigung: 'aufwandsverzicht', rueckspende: 'aufwandsverzicht' }) },
    ],
    felder: [
      { key: 'datum', label: 'Datum der Zuwendung', typ: 'datum', pflicht: true, alias: ['datum', 'spendendatum', 'datum der zuwendung', 'zuwendungsdatum', 'eingang', 'eingangsdatum', 'buchungsdatum', 'date'] },
      { key: 'spender_name', label: 'Spender', typ: 'text', pflicht: true, hinweis: 'Oder Vorname und Nachname in zwei Spalten — sie werden zusammengesetzt.', alias: ['spender_name', 'spender', 'spendername', 'name', 'zuwendender', 'unterstuetzer', 'unterstützer', 'donor', 'firma'] },
      { key: 'lead_vorname', label: 'Vorname (zum Namen)', typ: 'text', virtuell: 'name_teil', fuellt: 'spender_name', nichtInVorlage: true, alias: ['vorname', 'first name'] },
      { key: 'lead_nachname', label: 'Nachname (zum Namen)', typ: 'text', virtuell: 'name_teil', fuellt: 'spender_name', nichtInVorlage: true, alias: ['nachname', 'last name', 'familienname'] },
      { key: 'spender_anschrift', label: 'Anschrift', typ: 'text', hinweis: 'Oder Straße, PLZ und Ort in eigenen Spalten.', alias: ['spender_anschrift', 'anschrift', 'adresse', 'spenderanschrift', 'address'] },
      { key: 'adresse_strasse', label: 'Straße (zur Anschrift)', typ: 'text', virtuell: 'adresse_teil', fuellt: 'spender_anschrift', nichtInVorlage: true, alias: ['strasse', 'straße', 'str', 'street'] },
      { key: 'adresse_plz', label: 'PLZ (zur Anschrift)', typ: 'text', virtuell: 'adresse_teil', fuellt: 'spender_anschrift', nichtInVorlage: true, alias: ['plz', 'postleitzahl', 'zip'] },
      { key: 'adresse_ort', label: 'Ort (zur Anschrift)', typ: 'text', virtuell: 'adresse_teil', fuellt: 'spender_anschrift', nichtInVorlage: true, alias: ['ort', 'stadt', 'wohnort', 'city'] },
      { key: 'betrag', label: 'Betrag / Wert (€)', typ: 'zahl', pflicht: true, alias: ['betrag', 'spendenbetrag', 'summe', 'wert', 'sachwert', 'zuwendung', 'amount'] },
      { key: 'art', label: 'Art', typ: 'text', standard: 'geldzuwendung', hinweis: 'geldzuwendung · sachzuwendung · aufwandsverzicht', alias: ['art', 'spendenart', 'zuwendungsart', 'typ'] },
      { key: 'sachwert_text', label: 'Bezeichnung der Sachzuwendung', typ: 'text', alias: ['sachwert_text', 'sachzuwendung', 'bezeichnung sachzuwendung', 'gegenstand', 'sachspende'] },
      { key: 'zweck', label: 'Zweck', typ: 'text', alias: ['zweck', 'verwendungszweck', 'projekt', 'spendenzweck'] },
      { key: 'alt_bestaetigung_nr', label: 'Bestätigungsnummer im Altsystem (in die Notiz)', typ: 'text', virtuell: 'anhang', anhangAn: 'notiz', nichtInVorlage: true, alias: ['bestaetigungsnummer', 'bestätigungsnummer', 'bestaetigung nr', 'bestätigung nr', 'zb nr', 'zuwendungsbestaetigung nr', 'zuwendungsbestätigung nr', 'bescheinigungsnummer', 'quittungsnummer', 'beleg nr'] },
      { key: 'alt_bestaetigt', label: 'Bestätigt im Altsystem (in die Notiz)', typ: 'text', virtuell: 'anhang', anhangAn: 'notiz', nichtInVorlage: true, alias: ['bestaetigt', 'bestätigt', 'bescheinigt', 'quittiert', 'zuwendungsbestaetigung', 'zuwendungsbestätigung'] },
      { key: 'alt_bestaetigt_am', label: 'Bestätigt am im Altsystem (in die Notiz)', typ: 'text', virtuell: 'anhang', anhangAn: 'notiz', nichtInVorlage: true, alias: ['bestaetigt am', 'bestätigt am', 'bestaetigungsdatum', 'bestätigungsdatum', 'bescheinigt am'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'kommentar', 'notes'] },
    ],
  },
  // Paket 142: GEMEINSAM freigegeben 27.09.2026 — Aufwand NUR nicht
  // abgerechnet. Schon Abgerechnetes steht in den alten Rechnungen und faellt
  // mit Grund heraus; abgerechnet ist immer false, keine Rechnungs-Verknuepfung.
  {
    key: 'aufwand',
    label: 'Aufwand / Leistungen (offen)',
    icon: '⏱',
    tabelle: 'projektleistungen',
    beschreibung: 'Erfasste, NOCH NICHT abgerechnete Stunden je Projekt — sie erscheinen im Aufwand-Cockpit und in der Projekt-Abrechnung. '
      + 'Bereits abgerechnete Zeilen (Haken „abgerechnet" oder Rechnungsnummer) bleiben in Ihrer Datei.',
    schluesselFelder: ['datum+beschreibung+stunden'],
    eigeneFelderModul: 'projektleistungen',
    nurMitKatalog: true,
    ergebnisHref: '/dashboard/aufwand',
    ausblenden: ['abgerechnet', 'rechnung_id', 'projekt_id'],
    ablehnenWenn: { feld: 'abgerechnet_alt', werte: ['ja', 'j', 'x', 'yes', 'y', 'true', 'wahr', '1', 'abgerechnet', 'berechnet', 'fakturiert', 'verrechnet', 'in rechnung gestellt', 'billed', 'invoiced'], grund: 'Bereits abgerechnet — steht in der alten Rechnung und wird nicht noch einmal übernommen. Die Zeile bleibt in Ihrer Datei.' },
    ablehnenWennGefuellt: { feld: 'rechnung_alt', grund: 'Hat schon eine Rechnungsnummer — bereits abgerechnet, wird nicht noch einmal übernommen. Die Zeile bleibt in Ihrer Datei.' },
    nachschlag: { ausFeld: 'projekt', tabelle: 'projekte', nameSpalte: 'name', spalte: 'projekt_id', textFeld: 'beschreibung', label: 'Projekt' },
    grenzen: [{ feld: 'stunden', groesserAls: 0, grund: 'Keine Stunden (0 oder leer) — ohne Stunden gibt es nichts abzurechnen.' }],
    felder: [
      { key: 'projekt', label: 'Projekt', typ: 'text', virtuell: 'nachschlag', hinweis: 'Name des Projekts wie in ARGONAUT — sonst steht er in der Beschreibung.', alias: ['projekt', 'projektname', 'project', 'auftrag', 'baustelle', 'job'] },
      { key: 'datum', label: 'Datum', typ: 'datum', pflicht: true, alias: ['datum', 'tag', 'leistungsdatum', 'date', 'erfasst am'] },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'text', pflicht: true, alias: ['beschreibung', 'taetigkeit', 'tätigkeit', 'leistung', 'text', 'notiz', 'description', 'task', 'aufgabe'] },
      { key: 'stunden', label: 'Stunden', typ: 'zahl', alias: ['stunden', 'std', 'h', 'hours', 'anzahl stunden', 'menge'] },
      { key: 'dauer', label: 'Dauer (h:mm)', typ: 'text', virtuell: 'rechnen', hinweis: '„1:30" oder „1,5" — wird in Stunden umgerechnet, wenn keine Stunden-Spalte da ist.', alias: ['dauer', 'zeit', 'duration', 'arbeitszeit', 'zeitaufwand'] },
      { key: 'minuten', label: 'Minuten', typ: 'zahl', virtuell: 'rechnen', alias: ['minuten', 'min', 'minutes'] },
      { key: 'stundensatz', label: 'Stundensatz (€ netto)', typ: 'zahl', alias: ['stundensatz', 'satz', 'preis pro stunde', 'euro pro stunde', 'rate', 'hourly rate', 'verrechnungssatz'] },
      { key: 'mwst_satz', label: 'MwSt-Satz', typ: 'zahl', standard: 19, alias: ['mwst', 'mwst satz', 'ust', 'steuersatz'] },
      { key: 'kunde_name', label: 'Kunde', typ: 'text', alias: ['kunde_name', 'kunde', 'kundenname', 'auftraggeber', 'client', 'customer'] },
      { key: 'mitarbeiter_alt', label: 'Mitarbeiter (in die Beschreibung)', typ: 'text', virtuell: 'anhang', anhangAn: 'beschreibung', nichtInVorlage: true, alias: ['mitarbeiter', 'bearbeiter', 'erfasst von', 'user', 'employee', 'wer'] },
      { key: 'leistungsart_alt', label: 'Leistungsart (in die Beschreibung)', typ: 'text', virtuell: 'anhang', anhangAn: 'beschreibung', nichtInVorlage: true, alias: ['leistungsart', 'art', 'kategorie', 'category', 'service'] },
      { key: 'abgerechnet_alt', label: 'Abgerechnet (zum Aussortieren)', typ: 'text', virtuell: 'filter', nichtInVorlage: true, alias: ['abgerechnet', 'berechnet', 'fakturiert', 'verrechnet', 'billed', 'invoiced', 'status', 'abrechnungsstatus'] },
      { key: 'rechnung_alt', label: 'Rechnungsnummer (zum Aussortieren)', typ: 'text', virtuell: 'filter', nichtInVorlage: true, alias: ['rechnungsnummer', 'rechnung nr', 'rechnung', 'rechnungs nr', 'invoice', 'invoice number', 'beleg'] },
    ],
  },
  // Paket 143: GEMEINSAM freigegeben 27.09.2026 — Kautionen, nur Chef.
  // Der STAND wird uebernommen (Soll, eingezahlt, Anlage, Zinsen, Einbehalt,
  // Rueckgabe) — keine Buchungen, keine Mahnlaeufe. Ein Kautionskonto je Vertrag.
  {
    key: 'kautionen',
    label: 'Mietkautionen',
    icon: '🔐',
    tabelle: 'immo_kaution',
    beschreibung: 'Kautionskonto je Mietvertrag: vereinbarte Höhe, bereits eingezahlt, Anlage, Zinsen, Einbehalte und Rückgabe. '
      + 'Vorher die Mietverträge importieren. Es entstehen keine Buchungen. Nur die Geschäftsleitung.',
    // '__nach' (Mietername) erkennt Doppelte schon IN der Datei — vertrag_id kennt erst die Seite (eindeutig je Vertrag).
    schluesselFelder: ['vertrag_id', '__nach'],
    eigeneFelderModul: 'immo_kaution',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/immobilien/mieter',
    nachschlag: { ausFeld: 'mieter', tabelle: 'immo_mietvertraege', nameSpalte: 'mieter_name', spalte: 'vertrag_id', label: 'Mietvertrag', pflicht: true, mehrzahl: 'die Mietverträge' },
    ausblenden: ['eingaenge', 'einbehalte'],
    felder: [
      { key: 'mieter', label: 'Mieter', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Name des Mieters genau wie im Mietvertrag.', alias: ['mieter', 'mietername', 'mieter name', 'name', 'mietpartei', 'vertrag', 'mietvertrag', 'tenant'] },
      { key: 'soll', label: 'Kaution vereinbart (€)', typ: 'zahl', pflicht: true, alias: ['soll', 'kaution', 'kautionshoehe', 'kautionshöhe', 'kaution soll', 'vereinbart', 'mietsicherheit', 'deposit'] },
      { key: 'eingezahlt', label: 'Bereits eingezahlt (€)', typ: 'zahl', virtuell: 'rechnen', alias: ['eingezahlt', 'kaution eingezahlt', 'eingang', 'erhalten', 'ist', 'kaution ist', 'gezahlt'] },
      { key: 'eingezahlt_am', label: 'Eingezahlt am', typ: 'datum', virtuell: 'rechnen', alias: ['eingezahlt am', 'eingang am', 'erhalten am', 'zahlungseingang'] },
      { key: 'anlage', label: 'Angelegt auf', typ: 'text', alias: ['anlage', 'angelegt auf', 'kautionskonto', 'sparbuch', 'konto kaution', 'bank anlage'] },
      { key: 'zinsen', label: 'Zinsen (€)', typ: 'zahl', alias: ['zinsen', 'zinsertrag', 'aufgelaufene zinsen'] },
      { key: 'einbehalt', label: 'Einbehalt (€)', typ: 'zahl', virtuell: 'rechnen', alias: ['einbehalt', 'einbehalten', 'abzug', 'einbehalt betrag'] },
      { key: 'einbehalt_grund', label: 'Grund des Einbehalts', typ: 'text', virtuell: 'rechnen', alias: ['einbehalt grund', 'grund einbehalt', 'grund', 'abzug grund'] },
      { key: 'rueckgabe_am', label: 'Zurückgegeben am', typ: 'datum', alias: ['rueckgabe am', 'rückgabe am', 'rueckgabe', 'rückgabe', 'ausgezahlt am', 'zurueckgezahlt am', 'zurückgezahlt am'] },
      { key: 'ausgezahlt', label: 'Ausgezahlt (€)', typ: 'zahl', alias: ['ausgezahlt', 'auszahlung', 'zurueckgezahlt', 'zurückgezahlt', 'rueckzahlung', 'rückzahlung'] },
    ],
  },
  // Paket 143: GEMEINSAM freigegeben 27.09.2026 — Mietzahlungen NUR als erledigt
  // (bezahlt), nur Chef. Offene/rueckstaendige Mieten fallen mit Grund heraus;
  // keine Buchungen, keine Mahnlaeufe.
  {
    key: 'mietzahlungen',
    label: 'Mietzahlungen (bezahlt)',
    icon: '🏠',
    tabelle: 'immo_zahlungen',
    beschreibung: 'Bereits eingegangene Mieten je Mietvertrag als Verlauf. Nur bezahlte Zeilen mit Zahlungsdatum — Offenes bleibt in Ihrer Datei. '
      + 'Vorher die Mietverträge importieren. Es entstehen keine Buchungen und keine Mahnungen. Nur die Geschäftsleitung.',
    schluesselFelder: ['vertrag_id+monat+betrag+bezahlt_am', '__nach+monat+betrag+bezahlt_am'],
    eigeneFelderModul: 'immo_zahlungen',
    nurMitKatalog: true,
    nurChef: true,
    ergebnisHref: '/dashboard/immobilien',
    nachschlag: { ausFeld: 'mieter', tabelle: 'immo_mietvertraege', nameSpalte: 'mieter_name', spalte: 'vertrag_id', label: 'Mietvertrag', pflicht: true, mehrzahl: 'die Mietverträge' },
    ablehnenWenn: { feld: 'zahlstatus_alt', werte: ['offen', 'unbezahlt', 'nicht bezahlt', 'ausstehend', 'rueckstand', 'rückstand', 'rueckstaendig', 'rückständig', 'faellig', 'fällig', 'ueberfaellig', 'überfällig', 'gemahnt', 'mahnung', 'teilbezahlt', 'teilweise', 'nein', 'open', 'unpaid', 'overdue'], grund: 'Nicht (voll) bezahlt — offene Mieten übernimmt ARGONAUT nicht aus einer Datei. Die Zeile bleibt in Ihrer Datei.' },
    felder: [
      { key: 'mieter', label: 'Mieter', typ: 'text', pflicht: true, virtuell: 'nachschlag', hinweis: 'Name des Mieters genau wie im Mietvertrag.', alias: ['mieter', 'mietername', 'mieter name', 'name', 'mietpartei', 'vertrag', 'mietvertrag', 'tenant', 'zahler'] },
      { key: 'monat', label: 'Monat', typ: 'text', hinweis: '„09/2026", „September 2026" oder ein Datum — gespeichert als 1. des Monats. Fehlt er, gilt der Monat der Zahlung.', alias: ['monat', 'mietmonat', 'zeitraum', 'fuer monat', 'für monat', 'periode', 'month'] },
      { key: 'betrag', label: 'Betrag (€)', typ: 'zahl', pflicht: true, alias: ['betrag', 'miete', 'zahlung', 'gezahlt', 'eingang', 'summe', 'amount'] },
      { key: 'bezahlt_am', label: 'Bezahlt am', typ: 'datum', pflicht: true, alias: ['bezahlt am', 'zahlungsdatum', 'eingang am', 'eingangsdatum', 'wertstellung', 'buchungsdatum', 'gezahlt am', 'datum'] },
      { key: 'zahlstatus_alt', label: 'Status (zum Aussortieren)', typ: 'text', virtuell: 'filter', nichtInVorlage: true, alias: ['status', 'zahlstatus', 'bezahlt', 'zahlungsstatus', 'offen'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'verwendungszweck', 'kommentar'] },
    ],
  },
  // Paket 136: Umzug Schritt 4 Rest — Bestand je Filiale (Handel). Setzt
  // Zaehlstaende per Korrektur (lager_buchen), legt nichts an.
  {
    key: 'bestand_filiale',
    label: 'Bestand je Filiale',
    icon: '🏬',
    tabelle: 'artikel_bestand_standort',
    beschreibung: 'Zählstände je Artikel und Filiale aus dem Altsystem. Jede Zahl wird als Korrektur mit Eintrag im Lager-Verlauf gebucht; '
      + 'die Summe am Artikel rechnet ARGONAUT selbst. Zuerst Artikel und Filialen anlegen — der Artikel-Import dann am besten ohne Bestandsspalte.',
    bestandSetzen: true,
    ergebnisHref: '/dashboard/erp/lager',
    felder: [
      { key: 'artikelnummer', label: 'Artikelnummer', typ: 'text', hinweis: 'Oder EAN oder Bezeichnung — eines davon genügt.', alias: ['artikelnummer', 'artikel nr', 'artikelnr', 'art nr', 'artnr', 'sku', 'item number', 'item no', 'produktnummer', 'materialnummer', 'mat nr'] },
      { key: 'ean', label: 'EAN / GTIN', typ: 'text', alias: ['ean', 'gtin', 'barcode', 'ean code', 'strichcode'] },
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', alias: ['bezeichnung', 'artikel', 'artikelbezeichnung', 'produkt', 'produktname', 'artikelname', 'item', 'description'] },
      { key: 'standort', label: 'Filiale', typ: 'text', hinweis: 'Name der Filiale wie unter Standorte (oder ihr Ort). Leer = bei genau einer Filiale diese.', alias: ['filiale', 'standort', 'niederlassung', 'geschaeft', 'geschäft', 'laden', 'markt', 'shop', 'store', 'location', 'warehouse', 'lager', 'betriebsstaette', 'betriebsstätte'] },
      { key: 'bestand', label: 'Bestand', typ: 'zahl', pflicht: true, streng: true, hinweis: 'Gezählte Menge in dieser Filiale (setzt den Bestand, addiert nicht).', alias: ['bestand', 'lagerbestand', 'aktueller bestand', 'istbestand', 'ist bestand', 'menge', 'stueckzahl', 'stückzahl', 'anzahl', 'on hand', 'quantity', 'qty', 'zaehlmenge', 'zählmenge'] },
      { key: 'notiz', label: 'Notiz', typ: 'text', alias: ['notiz', 'bemerkung', 'kommentar'] },
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
  // Paket 132
  einsaetze: {
    kunde: 'Kevin Stadler|Leon Kaltenbach|Chef',
    titel: 'Zählerschrank tauschen|Wallbox montieren|Abnahme Baustelle',
    beschreibung: 'Material im Fahrzeug||',
    einsatzort: 'Hauptstraße 12, 71032 Böblingen|Industriering 4, 70565 Stuttgart|',
    beginn_am: '05.10.2026 08:00|06.10.2026 13:30|07.10.2026',
    ende_am: '05.10.2026 12:00||',
    status: 'geplant|geplant|erledigt',
    kunde_name: 'Familie Kaya|Muster GmbH|',
    kunde_email: '|info@muster.de|',
    kunde_telefon: '07031 123456||',
  },
  tickets: {
    ticket_nummer: 'TK-2026-0041|TK-2026-0042|TK-2026-0043',
    betreff: 'Sicherung fliegt raus|Rückfrage Angebot Wallbox|Rauchmelder piept',
    beschreibung: 'Seit Montag, Küche|Förderung möglich?|',
    status: 'offen|wartet|geloest',
    prioritaet: 'hoch|mittel|niedrig',
    kategorie: 'support|anfrage|support',
    kanal: 'telefon|email|web',
    kunde_name: 'Familie Kaya|Muster GmbH|Herr Brandl',
    kunde_email: '|info@muster.de|',
    kunde_telefon: '07031 123456||',
    faellig_am: '06.10.2026|10.10.2026|',
    geloest_am: '||02.10.2026',
  },
  inventar: {
    bezeichnung: 'Bohrhammer SDS-Max|Leitungssucher|Stehleiter 8 Stufen',
    inventarnummer: 'INV-0012|INV-0027|INV-0031',
    kategorie: 'Elektrowerkzeug|Messgerät|Leiter',
    seriennummer: 'HX-4471-22||',
    standort: 'Fahrzeug BB-EH 12|Lager|Lager',
    zustand: 'gut|neu|gebraucht',
    anschaffungsdatum: '12.03.2023|01.02.2026|',
    anschaffungswert: '689,00|249,90|',
    naechste_pruefung_am: '12.03.2027|01.02.2027|15.11.2026',
    notizen: 'DGUV V3 geprüft||',
  },
  verleih: {
    bezeichnung: 'Minibagger 1,8 t|Rüttelplatte|Bautrockner',
    kategorie: 'Baumaschinen|Baumaschinen|Trocknung',
    inventar_nr: 'M-01|M-07|T-03',
    tagessatz: '129,00|45,00|25,00',
    wochensatz: '590,00|180,00|',
    kaution: '500,00|100,00|50,00',
    anzahl: '1|2|4',
  },
  // Paket 133
  haccp_plan: {
    kontrollpunkt: 'Kühlhaus 1|Fritteuse|Wareneingang Fleisch',
    sollwert: 'max. 4 °C|max. 175 °C|max. 7 °C',
    intervall_tage: 'täglich|1|wöchentlich',
    letzte_kontrolle: '26.09.2026||',
    aktiv: 'ja|ja|ja',
  },
  haccp: {
    datum: '25.09.2026|25.09.2026|26.09.2026',
    kontrollpunkt: 'Kühlhaus 1|Fritteuse|Kühlhaus 1',
    messwert: '3,5 °C|178 °C|6 °C',
    in_ordnung: 'i.O.|n.i.O.|n.i.O.',
    massnahme: '|Öl gewechselt, Thermostat geprüft|Tür geschlossen, nach 30 min 4 °C',
    pruefer: 'MK|MK|LB',
  },
  kassen: {
    betriebsstaette: 'Hauptstraße 12, 71032 Böblingen|Hauptstraße 12, 71032 Böblingen|Marktplatz 3, 71083 Herrenberg',
    art: 'kasse_pc|kasse_app|registrierkasse',
    hersteller: 'Muster Kassen GmbH|Beispiel POS|Muster Kassen GmbH',
    modell: 'MK 500|Tablet Pro|MK 100',
    software: 'MK-POS 4.2|Beispiel POS 2026|',
    seriennummer: 'MK5-100231|BP-77812|MK1-004411',
    anschaffung_am: '01.03.2024|15.01.2026|01.06.2021',
    gemietet: 'nein|ja|nein',
    ausser_betrieb_am: '||31.08.2026',
    ausser_grund: '||Defekt, ersetzt',
    tse_art: 'USB-TSE|Cloud-TSE|SD-TSE',
    tse_seriennummer: 'TSE-9001|TSE-C-4412|TSE-SD-1177',
    tse_bsi_id: 'BSI-K-TR-0000-2023|BSI-K-TR-0001-2024|BSI-K-TR-0002-2021',
    tse_anschaffung_am: '01.03.2024|15.01.2026|01.06.2021',
    notiz: '||',
  },
  retainer: {
    kunde_name: 'Muster GmbH|Familie Kaya|Beispiel AG',
    bezeichnung: 'Social Media Betreuung|Website-Pflege|Retainer',
    monatsstunden: '20|4|10',
    stundensatz: '95,00|85,00|110,00',
    status: 'aktiv|pausiert|aktiv',
    notiz: 'Monatlich Reporting||',
  },
  duengung: {
    schlag: 'Am Bach|Großer Acker|Am Bach',
    datum: '15.03.2026|20.03.2026|10.04.2026',
    duengemittel: 'KAS 27|Rindergülle|KAS 27',
    art: 'mineralisch|organisch|mineralisch',
    menge: '200|25|150',
    einheit: 'kg/ha|m3/ha|kg/ha',
    n_gesamt: '54|80|40,5',
    n_verfuegbar: '|40|',
    p2o5: '0|35|0',
    anwender: 'M. Huber|M. Huber|',
    notiz: '||',
  },
  forst_objekte: {
    bezeichnung: 'Stadtpark Nord|Schulhof Grundschule|Friedhof Ost',
    adresse: 'Parkstraße 1, 71032 Böblingen|Schulweg 4, 71032 Böblingen|',
    notiz: 'Eigentümer: Stadt||',
  },
  forst_baeume: {
    objekt: 'Stadtpark Nord|Stadtpark Nord|Schulhof Grundschule',
    baum_nr: '1|2|17',
    art: 'Stieleiche|Rotbuche|Bergahorn',
    hoehe_m: '22|18,5|14',
    stammdurchmesser_cm: '65|48|40',
    zustand: 'gut|beobachten|kritisch',
    kontrollintervall_monate: '12|12|6',
    letzte_kontrolle: '15.05.2026|15.05.2026|01.09.2026',
    naechste_kontrolle: '||',
    notiz: '|Totholz in der Krone|Pilzbefall Stammfuß',
  },
  // Paket 134
  psm: {
    schlag: 'Am Bach|Großer Acker|Am Bach',
    datum: '12.04.2026|20.04.2026|05.05.2026',
    startzeit: '07:30|18:00|',
    mittel_name: 'Beispielmittel Herbizid|Beispielmittel Fungizid|Beispielmittel Herbizid',
    zulassungsnr: '000000-00|000001-00|000000-00',
    aufwandmenge: '1,5|0,8|1,5',
    aufwand_einheit: 'l/ha|l/ha|l/ha',
    verwendungsart: 'freiland|freiland|freiland',
    kultur: 'Winterweizen|Wintergerste|Winterweizen',
    flaeche_ha: '4,2|6|4,2',
    eppo_code: 'TRZAW|HORVW|TRZAW',
    bbch_stadium: '25|32|37',
    anwendungsgebiet: 'Unkräuter|Mehltau|Unkräuter',
    wartezeit_tage: '|35|',
    anwender: 'M. Huber|M. Huber|',
    notiz: '||',
  },
  einheiten: {
    objekt: 'Seestraße 5, 71032 Böblingen|Seestraße 5, 71032 Böblingen|Marktplatz 3, 71083 Herrenberg',
    bezeichnung: 'Seestraße 5 · EG links|Seestraße 5 · 1. OG rechts|Marktplatz 3 · Laden',
    flaeche_qm: '62,5|71|85',
    zimmer: '2|3|',
    kaltmiete: '720,00|810,00|1.450,00',
    nebenkosten: '180,00|200,00|260,00',
    status: 'vermietet|frei|vermietet',
    notiz: 'Balkon||',
  },
  mietvertraege: {
    einheit: 'Seestraße 5 · EG links|Marktplatz 3 · Laden|Seestraße 5 · 1. OG rechts',
    mieter_name: 'Familie Kaya|Muster GmbH|Herr Brandl',
    mieter_email: 'kaya@web.de|info@muster.de|',
    beginn: '01.04.2021|01.01.2024|01.05.2019',
    ende: '||31.08.2026',
    kaltmiete: '720,00|1.450,00|780,00',
    nebenkosten: '180,00|260,00|190,00',
    kaution: '2.160,00|4.350,00|2.340,00',
    status: 'aktiv|aktiv|beendet',
    notiz: '||',
  },
  interessenten: {
    expose: 'Helle 3-Zimmer-Wohnung|Helle 3-Zimmer-Wohnung|Baugrundstück Süd',
    name: 'Anna Weiß|Georg Faulhaber|Sven Klein',
    email: 'a.weiss@web.de||s.klein@web.de',
    telefon: '|0151 1234567|',
    status: 'besichtigung|neu|abgesagt',
    notiz: 'Termin 03.10.||',
  },
  anmeldungen: {
    kurs: 'Erste Hilfe Grundkurs|Erste Hilfe Grundkurs|Excel für Einsteiger',
    name: 'Kevin Stadler|Leon Kaltenbach|Anna Weiß',
    email: 'k.stadler@web.de||a.weiss@web.de',
    status: 'bestaetigt|angemeldet|teilgenommen',
  },
  ehrenamt: {
    person: 'Maria Huber|Peter Ott|Maria Huber',
    datum: '06.09.2026|06.09.2026|13.09.2026',
    stunden: '4|2,5|3',
    taetigkeit: 'Vereinsfest Aufbau|Kasse|Jugendtraining',
  },
  // Paket 135
  nutzungsrechte: {
    werk: 'Imagefoto Werkstatt|Logo-Animation|Produktfoto Wallbox',
    kunde: 'Muster GmbH|Muster GmbH|Beispiel AG',
    werkart: 'Foto|Video|Foto',
    recht: 'einfach|ausschliesslich|einfach',
    raum: 'Deutschland|DACH|weltweit',
    medien: 'Print, Website, Social Media|TV/Video, Social Media|Website',
    von: '01.01.2026|01.03.2026|15.06.2026',
    bis: '31.12.2026||14.06.2027',
    bearbeitung: 'nein|ja|nein',
    weiterlizenz: 'nein|nein|nein',
    urheber: 'Fotostudio Beispiel||Bildagentur Muster',
    fremd_recht: 'einfach||einfach',
    fremd_bis: '31.12.2027||14.06.2027',
    fremd_medien: 'Print, Website, Social Media||Website',
    verguetung: '450,00|1.200,00|180,00',
    notiz: '||Nur mit Bildnachweis',
  },
  gutscheine: {
    code: 'GS-2025-A7K2P|GS-2026-M3Q9X|KARTE-0042',
    art: 'Wertgutschein|Wertgutschein|10er-Karte',
    wert: '50,00|100,00|90,00',
    restwert: '20,00||',
    eingeloest_betrag: '|0,00|',
    nutzungen_gesamt: '||10',
    nutzungen_genutzt: '||4',
    nutzungen_rest: '||',
    mwst_typ: 'mehrzweck|mehrzweck|einzweck',
    mwst_satz: '19|19|19',
    leistung_text: '||Massage 30 Minuten',
    empfaenger_name: 'Anna Berger|Muster GmbH|Thomas Klein',
    anlass: 'Geburtstag|Weihnachten|',
    ausgestellt_am: '12.12.2025|01.09.2026|15.03.2026',
    gueltig_bis: '31.12.2028|31.12.2029|31.12.2029',
    status: 'aktiv|aktiv|aktiv',
    notiz: '||',
  },
  foerdervorhaben: {
    programm_name: 'Energieberatung im Mittelstand (EBM)|Landes-Digitalbonus / Digitalisierungsprämie|Innovationsgutschein Musterland',
    status: 'bewilligt|beantragt|interessiert',
    frist: '|30.11.2026|31.03.2027',
    bewilligt_betrag: '6.000,00||',
    verwendet_betrag: '2.400,00||',
    bewilligung_von: '01.03.2026||',
    bewilligung_bis: '28.02.2027||',
    nachweis_frist: '31.05.2027||',
    nachweis_status: 'offen||',
    sachbericht: '||',
    notiz: 'Förderkennzeichen 123-ABC||',
  },
  kautionen: {
    mieter: 'Anna Beispiel|Bernd Muster|Clara Test',
    soll: '2.100,00|1.800,00|2.400,00',
    eingezahlt: '2.100,00|1.200,00|2.400,00',
    eingezahlt_am: '01.03.2024|01.08.2026|15.01.2020',
    anlage: 'Kautionskonto Kreissparkasse|Kautionskonto Kreissparkasse|Sparbuch',
    zinsen: '||35,20',
    einbehalt: '||150,00',
    einbehalt_grund: '||Reparatur Türschloss',
    rueckgabe_am: '||31.07.2026',
    ausgezahlt: '||2.285,20',
  },
  mietzahlungen: {
    mieter: 'Anna Beispiel|Anna Beispiel|Bernd Muster',
    monat: '07/2026|08/2026|08/2026',
    betrag: '850,00|850,00|720,00',
    bezahlt_am: '01.07.2026|03.08.2026|01.08.2026',
    notiz: '||Miete August',
  },
  aufwand: {
    projekt: 'Website Relaunch|Website Relaunch|Wartung Serverpark',
    datum: '05.07.2026|06.07.2026|10.07.2026',
    beschreibung: 'Konzeption & Abstimmung|Umsetzung Startseite|Vor-Ort-Einsatz Netzwerk',
    stunden: '3,5|6|2',
    dauer: '||',
    minuten: '||',
    stundensatz: '95,00|95,00|110,00',
    mwst_satz: '19|19|19',
    kunde_name: 'Mustermann GmbH|Mustermann GmbH|Beispiel AG',
  },
  spenden: {
    datum: '15.03.2026|02.04.2026|10.05.2026',
    spender_name: 'Anna Beispiel|Muster Bau GmbH|Bernd Test',
    spender_anschrift: 'Hauptstraße 5, 71032 Böblingen|Industrieweg 1, 71063 Sindelfingen|Am Anger 3, 71034 Böblingen',
    betrag: '100,00|500,00|250,00',
    art: 'Geldspende|Geldspende|Sachspende',
    sachwert_text: '||2 Fußballtore, gebraucht',
    zweck: 'Jugendarbeit|Vereinsheim|Sportgeräte',
    notiz: '||',
  },
  mitglieder: {
    mitglieds_nr: 'M-1001|M-1002|M-1003',
    name: 'Anna Beispiel|Bernd Muster|Clara Test',
    email: 'anna.beispiel@example.de|bernd.muster@example.de|',
    telefon: '0171 1234567||07031 998877',
    betrag: '39,90|120,00|15,00',
    intervall: 'monatlich|jährlich|vierteljährlich',
    status: 'aktiv|aktiv|gekündigt',
    vertragsart: 'studio|verein|studio',
    beginn_am: '01.02.2025|01.01.2020|01.06.2024',
    abgeschlossen_am: '20.01.2025||15.05.2024',
    erstlaufzeit_monate: '12||6',
    kuendigungsfrist_monate: '1||1',
    verlaengerung_monate: '1||1',
    satzung_frist_monate: '|3|',
    satzung_zum: '|jahresende|',
    kuendigung_eingang: '||10.09.2026',
    kuendigung_zum: '||31.10.2026',
    notiz: 'Tarif Premium||',
  },
  bestand_filiale: {
    artikelnummer: 'L-1001|L-1001|L-1002',
    ean: '2047110000009|2047110000009|',
    bezeichnung: 'Mantelleitung NYM-J 3x1,5 mm², Ring 100 m|Mantelleitung NYM-J 3x1,5 mm², Ring 100 m|Mantelleitung NYM-J 3x2,5 mm², Ring 100 m',
    standort: 'Filiale Böblingen|Filiale Sindelfingen|Filiale Böblingen',
    bestand: '24|6|16',
    notiz: '|Inventur 30.09.|',
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
  // Paket 140: Vorname/Nachname fuellen den Pflicht-Namen
  const gefuellt = new Set(ziel.felder.filter((f) => f.fuellt && zugeordnet.has(f.key)).map((f) => f.fuellt as string));
  return ziel.felder.filter((f) => f.pflicht && !zugeordnet.has(f.key) && !gefuellt.has(f.key));
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
  // Paket 140: Mitgliedsbeitrag (und kuenftig Spende, Kaution) — nie still 0 €
  'betrag',
  // Paket 142: Stundensatz (Aufwand, Retainer)
  'stundensatz',
  // Paket 143: Kaution (Soll, ausgezahlt)
  'soll', 'ausgezahlt',
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
  if (ziel.ablehnenWennGefuellt) {
    const i = kopf.findIndex((sp) => mapping[sp] === ziel.ablehnenWennGefuellt!.feld);
    if (i >= 0 && String(zeile[i] ?? '').trim() !== '') {
      const label = ziel.felder.find((f) => f.key === ziel.ablehnenWennGefuellt!.feld)?.label ?? ziel.ablehnenWennGefuellt.feld;
      return { werte: null, fehler: [{ zeile: nummer, feld: label, meldung: ziel.ablehnenWennGefuellt.grund }], warnungen };
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
      if (f.pflicht) {
        // Paket 140: ein Helfer (Vorname/Nachname) liefert den Wert erst beim Zusammensetzen
        const helfer = ziel.felder.some((h) => h.fuellt === f.key && (roh[h.key] ?? '') !== '');
        if (!helfer) fehler.push({ zeile: nummer, feld: f.label, meldung: 'Pflichtfeld ist leer' });
        continue;
      }
      if (f.standard !== undefined) werte[f.key] = f.standard;
      continue;
    }

    if (f.typ === 'zahl') {
      const n = leseZahl(eingabe, dezimal);
      if (n === null) {
        if (f.streng && !GELDFELDER.includes(f.key)) {
          fehler.push({
            zeile: nummer,
            feld: f.label,
            meldung: `"${eingabe}" ist keine lesbare Menge. Die Zeile wird NICHT übernommen — ` +
              'ein Bestand darf nicht stillschweigend auf 0 gesetzt werden.',
          });
        } else if (GELDFELDER.includes(f.key)) {
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

    if (f.typ === 'datumZeit' || f.typ === 'zeitpunkt') {
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
  // Paket 138: Rechenfelder sind nur Zwischenwerte — nie in die Datenbank.
  for (const f of ziel.felder) if (f.virtuell === 'rechnen') delete werte[f.key];
  // Paket 134: Grenzen der Datenbank (check-Regeln) vorher pruefen
  for (const g of ziel.grenzen ?? []) {
    const v = werte[g.feld];
    if (typeof v !== 'number') continue;
    if ((g.groesserAls !== undefined && !(v > g.groesserAls)) || (g.hoechstens !== undefined && v > g.hoechstens)) {
      const label = ziel.felder.find((f) => f.key === g.feld)?.label ?? g.feld;
      return { werte: null, fehler: [{ zeile: nummer, feld: label, meldung: g.grund }], warnungen };
    }
  }
  // Paket 132: Ortszeit -> Zeitpunkt (erst NACH der Nacharbeit, die mit Ortszeit rechnet)
  for (const f of ziel.felder) {
    if (f.typ !== 'zeitpunkt' || typeof werte[f.key] !== 'string') continue;
    const z = berlinZeitpunkt(werte[f.key] as string);
    if (z) werte[f.key] = z;
  }

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
  // Paket 140: halbjaehrlich/woechentlich VOR der Werteliste umrechnen
  if (zielKey === 'mitglieder') mitgliedIntervall(werte, nummer, warnungen);
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
  if (zielKey === 'reservierung_vorgaenge') reservierungNachbereiten(werte, nummer, warnungen);
  // Paket 132
  if (zielKey === 'einsaetze') einsatzNachbereiten(werte, nummer, warnungen);
  if (zielKey === 'verleih' && typeof werte.anzahl === 'number') werte.anzahl = Math.max(1, Math.round(werte.anzahl));
  // Paket 133
  if (zielKey === 'haccp_plan') werte.intervall_tage = intervallTage(werte.intervall_tage, nummer, warnungen);
  if (zielKey === 'haccp') haccpNachbereiten(werte, nummer, warnungen);
  // Paket 135
  if (zielKey === 'nutzungsrechte') nutzungNachbereiten(werte, nummer, warnungen);
  // Paket 138
  if (zielKey === 'gutscheine') gutscheinNachbereiten(werte, nummer, warnungen);
  // Paket 139
  if (zielKey === 'foerdervorhaben') foerderNachbereiten(werte, nummer, warnungen);
  // Paket 140
  if (zielKey === 'mitglieder') mitgliedNachbereiten(werte, nummer, warnungen);
  // Paket 141
  if (zielKey === 'spenden') spendeNachbereiten(werte, nummer, warnungen);
  // Paket 142
  if (zielKey === 'aufwand') aufwandNachbereiten(werte, nummer, warnungen);
  // Paket 143
  if (zielKey === 'kautionen') kautionNachbereiten(werte, nummer, warnungen);
  if (zielKey === 'mietzahlungen') mietzahlungNachbereiten(werte, nummer, warnungen);
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

/**
 * Paket 130: Reservierungs-Vorgaenge — Status gilt je Art (lib/reservierung.ts
 * STATUS_JE_ART, START_STATUS). Unbekannt -> Startstatus, alter Wert in den
 * Gegenstand. Tischreservierungen brauchen ein Ende nach dem Beginn; ohne
 * Ende: 2 Stunden (Warnung). Andere Arten haben kein Ende.
 */
export const RES_STATUS: Record<string, Record<string, string>> = {
  tischreservierung: liste(['reserviert', 'bestaetigt', 'erschienen', 'no_show', 'storniert'], { bestätigt: 'bestaetigt', 'no show': 'no_show', 'nicht erschienen': 'no_show', da: 'erschienen', abgesagt: 'storniert' }),
  einlagerung: liste(['eingelagert', 'zur_abholung', 'ausgelagert', 'entsorgt'], { 'zur abholung': 'zur_abholung', abholbereit: 'zur_abholung', abgeholt: 'ausgelagert', ausgegeben: 'ausgelagert', verschrottet: 'entsorgt' }),
  vorbestellung: liste(['offen', 'bereit', 'abgeholt', 'storniert'], { neu: 'offen', fertig: 'bereit', abholbereit: 'bereit', erledigt: 'abgeholt', abgesagt: 'storniert' }),
};
export const RES_START: Record<string, string> = { tischreservierung: 'reserviert', einlagerung: 'eingelagert', vorbestellung: 'offen' };

function reservierungNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const art = String(werte.art ?? 'tischreservierung');
  const erlaubt = RES_STATUS[art] ?? RES_STATUS.tischreservierung;
  const roh = typeof werte.status === 'string' ? werte.status.trim() : '';
  if (!roh) werte.status = RES_START[art] ?? 'reserviert';
  else {
    const n = normal(roh);
    const t = erlaubt[n] ?? erlaubt[n.replace(/\s+/g, '')];
    if (t) werte.status = t;
    else {
      werte.status = RES_START[art] ?? 'reserviert';
      warnungen.push({ zeile: nummer, feld: 'Status', meldung: `"${roh}" passt nicht zur Art — auf "${werte.status}" gesetzt (der alte Wert steht im Gegenstand)` });
      const alt = `Status im Altsystem: ${roh}`;
      werte.gegenstand = typeof werte.gegenstand === 'string' && werte.gegenstand.trim() ? `${werte.gegenstand.trim()}\n${alt}` : alt;
    }
  }
  if (art === 'tischreservierung' && typeof werte.von === 'string' && werte.von.includes('T')) {
    if (!(typeof werte.bis === 'string' && werte.bis > werte.von)) {
      const [d, z] = werte.von.split('T');
      const [h, m] = z.split(':').map(Number);
      werte.bis = h + 2 <= 23 ? `${d}T${String(h + 2).padStart(2, '0')}:${String(m).padStart(2, '0')}` : `${d}T23:59`;
      warnungen.push({ zeile: nummer, feld: 'Bis', meldung: 'Kein gültiges Ende — Tischreservierung auf 2 Stunden gesetzt.' });
    }
  } else if (art !== 'tischreservierung') delete werte.bis;
}

/** Paket 132: Ortszeit „YYYY-MM-DDTHH:MM" + Minuten (ohne Zeitzone, reine Kalenderrechnung). */
export function plusMinutenLokal(lokal: string, minuten: number): string {
  const m = lokal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return lokal;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + minuten * 60000);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${z(t.getUTCMonth() + 1)}-${z(t.getUTCDate())}T${z(t.getUTCHours())}:${z(t.getUTCMinutes())}`;
}

/** Paket 133: HACCP-Intervall — Zahl in Tagen oder Wort. Unbekannt -> taeglich (lieber zu oft kontrollieren). */
const INTERVALL_WORT: Record<string, number> = {
  taeglich: 1, 'jeden tag': 1, daily: 1, 'je schicht': 1, schichtweise: 1, 'pro schicht': 1,
  woechentlich: 7, 'jede woche': 7, weekly: 7, '14 taegig': 14, 'alle 2 wochen': 14, zweiwoechentlich: 14,
  monatlich: 30, 'jeden monat': 30, monthly: 30, vierteljaehrlich: 90, quartalsweise: 90, halbjaehrlich: 182, jaehrlich: 365, yearly: 365,
};
export function intervallTage(wert: unknown, nummer = 0, warnungen: ZeilenFehler[] = []): number {
  const roh = String(wert ?? '').trim();
  if (!roh) return 1;
  const n = normal(roh);
  if (INTERVALL_WORT[n] !== undefined) return INTERVALL_WORT[n];
  const z = leseZahl(roh.replace(/\s*(tage?|d)$/i, ''), 'unbekannt');
  if (z !== null && z > 0) return Math.max(1, Math.round(z));
  warnungen.push({ zeile: nummer, feld: 'Intervall', meldung: `"${roh}" ist kein Intervall — auf täglich gesetzt (lieber zu oft als zu selten kontrollieren).` });
  return 1;
}

/**
 * Paket 133: HACCP-Ergebnis. Lebensmittelsicherheit: ein UNKLARES Ergebnis
 * gilt als Abweichung, nie stillschweigend als „in Ordnung".
 */
const HACCP_OK = new Set(['i o', 'io', 'i.o', 'ok', 'ja', 'j', 'x', '1', 'true', 'wahr', 'in ordnung', 'passt', 'gut', 'bestanden', 'erfuellt', 'yes', 'pass']);
const HACCP_NICHT = new Set(['n i o', 'nio', 'nicht ok', 'nein', 'n', '0', 'false', 'falsch', 'abweichung', 'nicht in ordnung', 'mangel', 'maengel', 'nicht bestanden', 'no', 'fail', 'kritisch']);
function haccpNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const roh = String(werte.in_ordnung ?? '').trim();
  const n = normal(roh);
  let ok: boolean;
  if (!roh || HACCP_OK.has(n)) ok = true;
  else if (HACCP_NICHT.has(n)) ok = false;
  else {
    ok = false;
    warnungen.push({ zeile: nummer, feld: 'In Ordnung', meldung: `"${roh}" ist kein klares Ergebnis — als Abweichung übernommen, bitte prüfen.` });
  }
  werte.in_ordnung = ok;
  if (!ok) {
    const alt = roh ? `Ergebnis im Altsystem: ${roh}` : '';
    const m = String(werte.massnahme ?? '').trim();
    werte.massnahme = [m || 'Abweichung aus dem Altsystem übernommen — Maßnahme bitte prüfen', alt].filter(Boolean).join('\n');
  }
}

/** Paket 135: Nutzungsarten wie im Modul (lib/papiereIdentifizierung MEDIEN). */
export const NUTZUNG_MEDIEN = ['Print', 'Website', 'Social Media', 'Online-Werbung', 'TV/Video', 'Außenwerbung', 'Verpackung', 'Messe/Event'] as const;
const MEDIEN_SYN: Record<string, string> = {
  print: 'Print', druck: 'Print', printmedien: 'Print', zeitung: 'Print', zeitschrift: 'Print', flyer: 'Print', broschuere: 'Print', katalog: 'Print',
  website: 'Website', webseite: 'Website', homepage: 'Website', internet: 'Website', web: 'Website', online: 'Website',
  'social media': 'Social Media', socialmedia: 'Social Media', social: 'Social Media', instagram: 'Social Media', facebook: 'Social Media', linkedin: 'Social Media', tiktok: 'Social Media',
  'online werbung': 'Online-Werbung', onlinewerbung: 'Online-Werbung', ads: 'Online-Werbung', banner: 'Online-Werbung', 'google ads': 'Online-Werbung',
  'tv video': 'TV/Video', tv: 'TV/Video', video: 'TV/Video', film: 'TV/Video', fernsehen: 'TV/Video', youtube: 'TV/Video',
  aussenwerbung: 'Außenwerbung', plakat: 'Außenwerbung', ooh: 'Außenwerbung', 'out of home': 'Außenwerbung',
  verpackung: 'Verpackung', packaging: 'Verpackung', etikett: 'Verpackung',
  'messe event': 'Messe/Event', messe: 'Messe/Event', event: 'Messe/Event', veranstaltung: 'Messe/Event',
};
/** „Print, Web; Instagram" -> ['Print', 'Website', 'Social Media'] + Unbekanntes. */
export function leseMedien(wert: unknown): { medien: string[]; unbekannt: string[] } {
  const medien: string[] = [];
  const unbekannt: string[] = [];
  const teile = Array.isArray(wert) ? wert.map(String) : String(wert ?? '').split(/[,;|+]|\s+und\s+|\s*\/\s*(?=[A-Za-zÄÖÜäöü]{3})/);
  for (const t of teile) {
    const roh = t.trim();
    if (!roh) continue;
    const n = normal(roh);
    const m = MEDIEN_SYN[n] ?? MEDIEN_SYN[n.replace(/\s+/g, '')] ?? NUTZUNG_MEDIEN.find((x) => normal(x) === n);
    if (m) { if (!medien.includes(m)) medien.push(m); } else if (!unbekannt.includes(roh)) unbekannt.push(roh);
  }
  return { medien, unbekannt };
}
function nutzungNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const merke = (zeile: string) => {
    werte.notiz = typeof werte.notiz === 'string' && werte.notiz.trim() ? `${werte.notiz.trim()}\n${zeile}` : zeile;
  };
  for (const [feld, label] of [['medien', 'Nutzungsarten'], ['fremd_medien', 'Eigene Nutzungsarten']] as const) {
    if (werte[feld] === undefined) continue;
    const { medien, unbekannt } = leseMedien(werte[feld]);
    werte[feld] = medien;                                         // Liste (Datenbank: text[])
    if (unbekannt.length > 0) {
      merke(`${label} im Altsystem: ${unbekannt.join(', ')}`);
      warnungen.push({ zeile: nummer, feld: label, meldung: `„${unbekannt.join(', ')}" ist keine bekannte Nutzungsart — steht in der Notiz, bitte zuordnen.` });
    }
  }
  const fr = String(werte.fremd_recht ?? '').trim();
  if (fr) {
    const n = normal(fr);
    const t = /exklusiv|ausschliess|exclusive/.test(n) && !/nicht|non/.test(n) ? 'ausschliesslich' : /einfach|nicht exklusiv|non exclusive/.test(n) ? 'einfach' : null;
    if (t) werte.fremd_recht = t;
    else { delete werte.fremd_recht; merke(`Eigenes Recht im Altsystem: ${fr}`); }
  }
  if (typeof werte.von === 'string' && typeof werte.bis === 'string' && werte.bis < werte.von) {
    warnungen.push({ zeile: nummer, feld: 'Bis', meldung: 'Ende liegt vor dem Beginn — bitte prüfen.' });
  }
}

/**
 * Paket 140: halbjaehrliche und woechentliche Beitraege kennt ARGONAUT nicht —
 * sie werden auf den naechsten Rhythmus umgerechnet (halbjaehrlich -> jaehrlich
 * x 2, woechentlich -> monatlich x 52/12). Der alte Wert steht in der Notiz.
 */
function mitgliedIntervall(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const roh = typeof werte.intervall === 'string' ? werte.intervall.trim() : '';
  if (!roh) return;
  const n = normal(roh).replace(/\s+/g, '');
  const umrechnung = /^(halbjaehrlich|halbjahr|halbjahresbeitrag|halbjaehrig|semiannual|semiannually)$/.test(n)
    ? { ziel: 'jahr', faktor: 2, text: 'jährlich' }
    : /^(woechentlich|prowoche|weekly|wochenbeitrag)$/.test(n)
      ? { ziel: 'monat', faktor: 52 / 12, text: 'monatlich' }
      : null;
  if (!umrechnung) return;
  const merke = (zeile: string) => {
    werte.notiz = typeof werte.notiz === 'string' && werte.notiz.trim() ? `${werte.notiz.trim()}\n${zeile}` : zeile;
  };
  const betrag = typeof werte.betrag === 'number' && Number.isFinite(werte.betrag) ? werte.betrag : null;
  werte.intervall = umrechnung.ziel;
  if (betrag !== null) {
    const neu = centRunden(betrag * umrechnung.faktor);
    const eur = (x: number) => `${x.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    werte.betrag = neu;
    merke(`Intervall im Altsystem: ${roh} (${eur(betrag)}) — in ARGONAUT ${umrechnung.text} ${eur(neu)}`);
    warnungen.push({ zeile: nummer, feld: 'Intervall', meldung: `„${roh}" gibt es in ARGONAUT nicht — auf ${umrechnung.text} ${eur(neu)} umgerechnet (bitte prüfen).` });
  } else {
    merke(`Intervall im Altsystem: ${roh}`);
    warnungen.push({ zeile: nummer, feld: 'Intervall', meldung: `„${roh}" gibt es in ARGONAUT nicht — auf ${umrechnung.text} gesetzt (bitte prüfen).` });
  }
}

/**
 * Paket 140: Mitglieder (GEMEINSAM freigegeben 27.09.2026). Nichts wird
 * eingezogen: Bankverbindung und Mandat kommen nicht aus der Datei. Hier nur
 * Plausibilitaet — negative Beitraege, Kuendigung ohne Datum, Ende vor Beginn.
 */
function mitgliedNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  if (typeof werte.betrag === 'number' && werte.betrag < 0) {
    warnungen.push({ zeile: nummer, feld: 'Beitrag', meldung: 'Negativer Beitrag — bitte prüfen.' });
  }
  if (werte.status === 'gekuendigt' && !werte.kuendigung_zum) {
    warnungen.push({ zeile: nummer, feld: 'Kündigung zum', meldung: 'Gekündigt, aber ohne „Kündigung zum" — bitte das Austrittsdatum nachtragen.' });
  }
  if (typeof werte.beginn_am === 'string' && typeof werte.kuendigung_zum === 'string' && werte.kuendigung_zum < werte.beginn_am) {
    warnungen.push({ zeile: nummer, feld: 'Kündigung zum', meldung: 'Kündigung liegt vor dem Beginn — bitte prüfen.' });
  }
}

/**
 * Paket 141: Spenden (GEMEINSAM freigegeben 27.09.2026). IMMER unbestaetigt,
 * keine Bestaetigungsnummer — eine Nummer aus dem Altsystem steht nur in der
 * Notiz. Aufwandsverzicht setzt den Haken wie das Modul.
 */
function spendeNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  werte.bestaetigt = false;
  werte.verzicht_aufwand = werte.art === 'aufwandsverzicht';
  if (typeof werte.betrag === 'number' && werte.betrag <= 0) {
    warnungen.push({ zeile: nummer, feld: 'Betrag', meldung: 'Betrag ist 0 oder negativ — bitte prüfen.' });
  }
  if (werte.art === 'sachzuwendung' && !werte.sachwert_text) {
    warnungen.push({ zeile: nummer, feld: 'Bezeichnung der Sachzuwendung', meldung: 'Sachzuwendung ohne Bezeichnung — bitte vor der Bestätigung nachtragen.' });
  }
  if (spendeAltBestaetigt(werte.notiz)) {
    warnungen.push({ zeile: nummer, feld: 'Bestätigung', meldung: 'Im Altsystem schon bestätigt — in ARGONAUT bitte KEINE zweite Zuwendungsbestätigung ausstellen.' });
  }
}

/**
 * Paket 142: „1:30", „1,5", „90 min" -> Stunden. null = nicht lesbar.
 */
export function dauerInStunden(text: unknown): number | null {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d{1,4}):([0-5]\d)(?::[0-5]\d)?$/);
  if (m) return centRunden(Number(m[1]) + Number(m[2]) / 60);
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(min|minuten|minutes)?$/);
  if (!m) m = t.match(/^(\d+(?:[.,]\d+)?)\s*(h|std|stunden|hours)$/);
  if (!m) return null;
  const n = leseZahlGemeinsam(m[1]);
  if (n === null) return null;
  return centRunden(/^min/.test(m[2] ?? '') ? n / 60 : n);
}

/**
 * Paket 142: Aufwand (GEMEINSAM freigegeben 27.09.2026) — nur nicht
 * abgerechnete Stunden. abgerechnet ist IMMER false; Stunden notfalls aus
 * Dauer oder Minuten.
 */
function aufwandNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  werte.abgerechnet = false;
  if (typeof werte.stunden !== 'number' || werte.stunden === 0) {
    const ausDauer = werte.dauer !== undefined ? dauerInStunden(werte.dauer) : null;
    const ausMinuten = typeof werte.minuten === 'number' ? centRunden(werte.minuten / 60) : null;
    const neu = ausDauer ?? ausMinuten;
    if (neu !== null) werte.stunden = neu;
    else if (werte.dauer !== undefined) warnungen.push({ zeile: nummer, feld: 'Dauer (h:mm)', meldung: `„${werte.dauer}" ist keine lesbare Dauer.` });
  }
  // Ohne lesbare Stunden greift die Grenze (> 0) und die Zeile faellt mit Grund heraus.
  if (typeof werte.stunden !== 'number') werte.stunden = 0;
  if (typeof werte.stunden === 'number' && werte.stunden > 24) {
    warnungen.push({ zeile: nummer, feld: 'Stunden', meldung: `${String(werte.stunden).replace('.', ',')} Stunden in einer Zeile — bitte prüfen (Wochensumme?).` });
  }
  if (werte.stundensatz === undefined || werte.stundensatz === 0) {
    warnungen.push({ zeile: nummer, feld: 'Stundensatz', meldung: 'Kein Stundensatz — bitte vor dem Abrechnen nachtragen.' });
  }
}

/** Paket 143: heutiges Datum (Ortszeit) als JJJJ-MM-TT. */
function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Paket 143: Kaution (GEMEINSAM, nur Chef) — der STAND des Kautionskontos.
 * „Bereits eingezahlt" wird EIN Eingang (mit Datum), ein Einbehalt EIN
 * Einbehalt mit Grund — genau die Form, die das Modul selbst speichert.
 */
function kautionNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const ein = zahl(werte.eingezahlt);
  if (ein !== null && ein > 0) {
    let am = typeof werte.eingezahlt_am === 'string' ? werte.eingezahlt_am : '';
    if (!am) {
      am = heuteIso();
      warnungen.push({ zeile: nummer, feld: 'Eingezahlt am', meldung: 'Kein Eingangsdatum — als heute eingetragen (bitte prüfen).' });
    }
    werte.eingaenge = [{ am, betrag: ein }];
    const soll = zahl(werte.soll);
    if (soll !== null && ein > soll + 0.005) warnungen.push({ zeile: nummer, feld: 'Bereits eingezahlt', meldung: 'Eingezahlt ist mehr als vereinbart — bitte prüfen.' });
  }
  const einb = zahl(werte.einbehalt);
  if (einb !== null && einb > 0) {
    const grund = typeof werte.einbehalt_grund === 'string' && werte.einbehalt_grund.trim() ? werte.einbehalt_grund.trim() : 'Übernommen aus dem Altsystem';
    werte.einbehalte = [{ grund, betrag: einb }];
  }
  const soll = zahl(werte.soll);
  if (soll !== null && soll <= 0) warnungen.push({ zeile: nummer, feld: 'Kaution vereinbart', meldung: 'Kaution 0 oder negativ — bitte prüfen.' });
  if (zahl(werte.ausgezahlt) !== null && !werte.rueckgabe_am) {
    warnungen.push({ zeile: nummer, feld: 'Zurückgegeben am', meldung: 'Ausgezahlt, aber ohne Rückgabedatum — bitte nachtragen.' });
  }
}

const MONATSNAMEN: Record<string, number> = {
  jan: 1, januar: 1, january: 1, jaenner: 1, feb: 2, februar: 2, february: 2, maer: 3, mrz: 3, maerz: 3, mar: 3, march: 3,
  apr: 4, april: 4, mai: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11, dez: 12, dec: 12, dezember: 12, december: 12,
};

/**
 * Paket 143: Mietmonat lesen — „07/2026", „7.2026", „2026-07", „Juli 2026",
 * „Jul 26" oder ein ganzes Datum. Ergebnis: 1. des Monats (JJJJ-MM-01), sonst null.
 */
export function leseMonat(text: unknown): string | null {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const jahr = (j: string) => (j.length === 2 ? 2000 + Number(j) : Number(j));
  const baue = (j: number, m: number) => (m >= 1 && m <= 12 && j >= 1900 && j <= 2100 ? `${j}-${String(m).padStart(2, '0')}-01` : null);
  let m = t.match(/^(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})$/);
  if (m) return baue(jahr(m[2]), Number(m[1]));
  m = t.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return baue(Number(m[1]), Number(m[2]));
  m = normal(t).match(/^([a-z]+)\s+(\d{4}|\d{2})$/);
  if (m && MONATSNAMEN[m[1]]) return baue(jahr(m[2]), MONATSNAMEN[m[1]]);
  const d = leseDatum(t);
  return d ? `${d.slice(0, 7)}-01` : null;
}

/** Paket 143: Mietzahlung — Monat immer der 1.; ohne lesbaren Monat gilt der Monat der Zahlung. */
function mietzahlungNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const roh = werte.monat;
  const monat = leseMonat(roh);
  if (monat) werte.monat = monat;
  else if (typeof werte.bezahlt_am === 'string') {
    werte.monat = `${werte.bezahlt_am.slice(0, 7)}-01`;
    warnungen.push({ zeile: nummer, feld: 'Monat', meldung: roh ? `„${String(roh)}" ist kein lesbarer Monat — Monat der Zahlung genommen.` : 'Kein Monat — Monat der Zahlung genommen.' });
    if (roh) werte.notiz = typeof werte.notiz === 'string' && werte.notiz.trim() ? `${werte.notiz.trim()}\nMonat im Altsystem: ${String(roh)}` : `Monat im Altsystem: ${String(roh)}`;
  }
  if (typeof werte.betrag === 'number' && werte.betrag <= 0) {
    warnungen.push({ zeile: nummer, feld: 'Betrag', meldung: 'Betrag 0 oder negativ — bitte prüfen (Erstattung?).' });
  }
}

/**
 * Paket 138: Gutscheine mit RESTWERT uebernehmen (Martin-Freigabe 27.09.2026).
 * Der Restwert wird der Startwert in ARGONAUT; Ursprungswert und schon
 * Eingeloestes stehen in der Notiz. Es werden KEINE Einloesungen und keine
 * Rechnungen angelegt. Mehrfachkarten: Restnutzungen werden die Nutzungen.
 */
function gutscheinNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const eur = (n: number) => `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const merke = (zeile: string) => {
    werte.notiz = typeof werte.notiz === 'string' && werte.notiz.trim() ? `${werte.notiz.trim()}\n${zeile}` : zeile;
  };
  const wert = zahl(werte.wert);
  if (werte.art === 'mehrfachkarte') {
    const gesamt = zahl(werte.nutzungen_gesamt);
    const genutzt = zahl(werte.nutzungen_genutzt);
    let rest = zahl(werte.nutzungen_rest);
    if (rest === null && gesamt !== null && genutzt !== null) rest = gesamt - genutzt;
    if (rest !== null) {
      rest = Math.round(rest);
      if (rest < 0) {
        warnungen.push({ zeile: nummer, feld: 'Restnutzungen', meldung: `Restnutzungen unter null (${rest}) — mit 0 übernommen.` });
        rest = 0;
      }
      if (gesamt === null || rest !== Math.round(gesamt)) {
        merke(`Im Altsystem: ${gesamt !== null ? `${Math.round(gesamt)} Nutzungen` : 'Nutzungen unbekannt'}${genutzt !== null ? `, davon ${Math.round(genutzt)} genutzt` : ''} — übernommen mit ${rest} verbleibenden Nutzungen.`);
      }
      werte.nutzungen_gesamt = rest;
      if (rest === 0 && (werte.status === undefined || werte.status === 'aktiv')) werte.status = 'eingeloest';
    }
    if (werte.nutzungen_gesamt === undefined) {
      warnungen.push({ zeile: nummer, feld: 'Nutzungen', meldung: 'Mehrfachkarte ohne Anzahl Nutzungen — bitte nach dem Import ergänzen.' });
    }
  } else {
    const eingeloest = zahl(werte.eingeloest_betrag);
    let rest = zahl(werte.restwert);
    if (rest === null && wert !== null && eingeloest !== null) rest = wert - eingeloest;
    if (rest !== null) {
      rest = Math.round(rest * 100) / 100;
      if (rest < 0) {
        warnungen.push({ zeile: nummer, feld: 'Restwert', meldung: `Restwert unter null (${eur(rest)}) — mit 0,00 € übernommen, bitte im Altsystem prüfen.` });
        rest = 0;
      }
      if (wert !== null && rest > wert + 0.005) {
        warnungen.push({ zeile: nummer, feld: 'Restwert', meldung: `Restwert (${eur(rest)}) ist höher als der Ursprungswert (${eur(wert)}) — der Restwert gilt, bitte prüfen.` });
      }
      if (wert === null || Math.abs(rest - wert) > 0.005) {
        merke(`Im Altsystem: Ursprungswert ${wert !== null ? eur(wert) : 'unbekannt'}${eingeloest !== null ? `, bereits eingelöst ${eur(eingeloest)}` : ''} — übernommen mit Restwert ${eur(rest)}.`);
      }
      werte.wert = rest;
      if (rest === 0 && (werte.status === undefined || werte.status === 'aktiv')) werte.status = 'eingeloest';
    }
    if (werte.wert === undefined) {
      warnungen.push({ zeile: nummer, feld: 'Wert', meldung: 'Kein Wert angegeben — mit 0,00 € übernommen, bitte ergänzen.' });
      werte.wert = 0;
    }
  }
  if (!werte.ausgestellt_am) {
    const d = new Date();
    werte.ausgestellt_am = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    warnungen.push({ zeile: nummer, feld: 'Ausgestellt am', meldung: 'Kein Ausstellungsdatum — heute angenommen. Die gesetzliche Frist (3 Jahre ab Jahresende) rechnet ab diesem Jahr.' });
  }
  if (typeof werte.gueltig_bis === 'string' && typeof werte.ausgestellt_am === 'string' && werte.gueltig_bis < werte.ausgestellt_am) {
    warnungen.push({ zeile: nummer, feld: 'Gültig bis', meldung: 'Gültig bis liegt vor dem Ausstellungsdatum — bitte prüfen.' });
  }
}

/**
 * Paket 139: Ein Foerderprogramm aus der Datei dem ARGONAUT-Katalog zuordnen
 * (genauer Name, Schluessel, Kuerzel in Klammern wie „EBM", oder eindeutiger
 * Teil des Namens ab 8 Zeichen). Mehrdeutig oder unbekannt -> null.
 */
export function foerderProgrammFinden(eingabe: unknown): { key: string; name: string } | null {
  const n = normal(String(eingabe ?? ''));
  if (!n) return null;
  const alle = FOERDER_PROGRAMME.map((p) => ({ key: p.key, name: p.name, traeger: p.traeger }));
  const genau = alle.filter((p) => normal(p.name) === n || normal(p.key) === n);
  if (genau.length === 1) return { key: genau[0].key, name: genau[0].name };
  const kuerzel = alle.filter((p) => [...p.name.matchAll(/\(([^)]+)\)/g)].some((m) => normal(m[1]) === n));
  if (kuerzel.length === 1) return { key: kuerzel[0].key, name: kuerzel[0].name };
  const raus = (p: { key: string; name: string }) => ({ key: p.key, name: p.name });
  if (n.length >= 8) {
    const teil = alle.filter((p) => normal(p.name).includes(n));
    if (teil.length === 1) return raus(teil[0]);
  }
  // Alle Woerter der Eingabe (ab 3 Zeichen) stehen in Name + Traeger — und nur bei EINEM Programm.
  const woerter = n.split(' ').filter((w) => w.length >= 3);
  if (woerter.length >= 2) {
    const passt = alle.filter((p) => {
      const heu = new Set(normal(`${p.name} ${p.traeger}`).split(' '));
      return woerter.every((w) => heu.has(w));
    });
    if (passt.length === 1) return raus(passt[0]);
  }
  return null;
}

/** Paket 139: eigener Schluessel fuer ein Programm, das der Katalog nicht kennt. */
export function foerderEigenerKey(name: string): string {
  return 'import-' + normal(name).replace(/\s+/g, '-').slice(0, 60);
}

/**
 * Paket 139: Foerdervorhaben (GEMEINSAM freigegeben 27.09.2026, nur Chef).
 * Programm -> Katalog-Schluessel, sonst eigener Schluessel „import-…" mit
 * Hinweis; der Name aus der Datei bleibt immer stehen.
 */
function foerderNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const name = String(werte.programm_name ?? '').trim();
  if (!werte.programm_key && name) {
    const t = foerderProgrammFinden(name);
    if (t) werte.programm_key = t.key;
    else {
      werte.programm_key = foerderEigenerKey(name);
      warnungen.push({ zeile: nummer, feld: 'Programm', meldung: `„${name}" steht nicht im ARGONAUT-Förderkatalog — als eigenes Vorhaben übernommen.` });
    }
  }
  const zahl = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const bew = zahl(werte.bewilligt_betrag); const verw = zahl(werte.verwendet_betrag);
  if (bew !== null && verw !== null && verw > bew + 0.005) {
    warnungen.push({ zeile: nummer, feld: 'Verwendet', meldung: 'Verwendet ist höher als bewilligt — bitte prüfen (Rückforderung?).' });
  }
  if (typeof werte.bewilligung_von === 'string' && typeof werte.bewilligung_bis === 'string' && werte.bewilligung_bis < werte.bewilligung_von) {
    warnungen.push({ zeile: nummer, feld: 'Bewilligung bis', meldung: 'Bewilligungszeitraum endet vor dem Beginn — bitte prüfen.' });
  }
}

/** Paket 132: So heisst der Chef in Plantafeln — Einsatz der Geschaeftsleitung statt eines Mitarbeiters. */
const CHEF_NAMEN = new Set(['chef', 'chefin', 'inhaber', 'inhaberin', 'geschaeftsfuehrer', 'geschaeftsfuehrerin', 'geschaeftsleitung', 'gf', 'meister', 'meisterin', 'ich']);

/**
 * Paket 132: Einsaetze wie die Dispo — Ende nach Beginn. Nur ein Datum = ganzer
 * Tag 07:00 bis 16:00; kein gueltiges Ende = Beginn + 1 Stunde.
 */
function einsatzNachbereiten(werte: Record<string, unknown>, nummer: number, warnungen: ZeilenFehler[]): void {
  const k = normal(String(werte.__kunde ?? ''));
  if (k && CHEF_NAMEN.has(k)) {
    werte.inhaber_einsatz = true;
    delete werte.__kunde;
    delete werte.__kunde2;
  }
  const b = typeof werte.beginn_am === 'string' ? werte.beginn_am : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    werte.beginn_am = `${b}T07:00`;
    const e = typeof werte.ende_am === 'string' ? werte.ende_am : '';
    if (!e || /^\d{4}-\d{2}-\d{2}$/.test(e)) werte.ende_am = `${/^\d{4}-\d{2}-\d{2}$/.test(e) && e >= b ? e : b}T16:00`;
    warnungen.push({ zeile: nummer, feld: 'Beginn', meldung: 'Nur ein Datum ohne Uhrzeit — als ganzer Tag 07:00 bis 16:00 eingeplant.' });
  }
  const beginn = String(werte.beginn_am ?? '');
  let ende = typeof werte.ende_am === 'string' ? werte.ende_am : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(ende)) ende = `${ende}T16:00`;
  if (beginn.includes('T') && !(ende > beginn)) {
    werte.ende_am = plusMinutenLokal(beginn, 60);
    warnungen.push({ zeile: nummer, feld: 'Ende', meldung: 'Kein gültiges Ende — Einsatz auf 1 Stunde gesetzt.' });
  } else if (ende) werte.ende_am = ende;
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
  // Paket 129: Werte fuer den uebergeordneten Eintrag (Rezept-Typ, Tour-Datum) — Wertelisten gelten auch hier.
  const mit: Record<string, unknown> = {};
  for (const f of ziel.felder) {
    if (f.virtuell !== 'nachschlagMit' || !f.elternSpalte) continue;
    const v = werte[f.key];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    const l = ziel.listen?.find((x) => x.feld === f.key);
    if (l && typeof v === 'string') {
      const n = normal(v);
      mit[f.elternSpalte] = l.liste[n] ?? l.liste[n.replace(/\s+/g, '')] ?? l.standard;
    } else mit[f.elternSpalte] = v;
  }
  if (Object.keys(mit).length > 0) werte.__nachMit = mit;
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
  // Paket 141: Zielfeld aus `fuellt` (Spenden: spender_name), sonst wie bisher „name".
  const namensZiel = virtuelle.find((f) => f.virtuell === 'name_teil' && f.fuellt)?.fuellt ?? 'name';
  if ((vn || nn || fi) && leer(werte[namensZiel])) {
    const person = [vn, nn].filter(Boolean).join(' ');
    werte[namensZiel] = person && fi ? `${person} · ${fi}` : (person || fi);
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
    // Paket 141: Zielfeld aus `fuellt` (Spenden: spender_anschrift), sonst „adresse".
    const adressZiel = virtuelle.find((f) => f.virtuell === 'adresse_teil' && f.fuellt)?.fuellt ?? 'adresse';
    werte[adressZiel] = leer(werte[adressZiel]) ? zusammen : `${String(werte[adressZiel]).trim()}, ${zusammen}`;
  }

  // 'preis' rechnet nachbereiten() um (Stundensatz oder Einheitspreis) und entfernt es dort.
  // Paket 127: 'position' bleibt — gruppiereBestellungen() holt die Positionen heraus.
  // Paket 138: 'rechnen' bleibt bis nach nachbereiten() (Restwert, Restnutzungen) und faellt dann weg.
  for (const f of virtuelle) if (f.virtuell !== 'preis' && f.virtuell !== 'position' && f.virtuell !== 'rechnen') delete werte[f.key];
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
