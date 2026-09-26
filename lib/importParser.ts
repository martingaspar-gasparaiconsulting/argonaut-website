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

export type FeldTyp = 'text' | 'zahl' | 'datum' | 'jaNein';

export type ZielFeld = {
  key: string;
  label: string;
  typ: FeldTyp;
  pflicht?: boolean;
  hinweis?: string;
  /** Schreibweisen, unter denen dieses Feld in fremden Dateien auftaucht. */
  alias: string[];
  standard?: string | number | boolean;
};

export type ImportZiel = {
  key: string;
  label: string;
  icon: string;
  tabelle: string;
  beschreibung: string;
  /** Feld, ueber das Dubletten erkannt werden (leer = keine Dublettenpruefung). */
  schluessel?: string;
  felder: ZielFeld[];
};

export const ZIELE: ImportZiel[] = [
  {
    key: 'kontakte',
    label: 'Kunden & Kontakte',
    icon: '🤝',
    tabelle: 'kontakte',
    beschreibung: 'Kundenliste aus der alten Software oder aus Excel ins CRM übernehmen.',
    schluessel: 'email',
    felder: [
      { key: 'firma', label: 'Firma', typ: 'text', alias: ['firma', 'firmenname', 'unternehmen', 'company', 'kunde', 'kundenname', 'name der firma', 'organisation'] },
      { key: 'vorname', label: 'Vorname', typ: 'text', alias: ['vorname', 'first name', 'firstname', 'rufname'] },
      { key: 'nachname', label: 'Nachname', typ: 'text', alias: ['nachname', 'name', 'last name', 'lastname', 'familienname', 'ansprechpartner'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e mail', 'emailadresse', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone', 'festnetz', 'mobil', 'handy'] },
      { key: 'position', label: 'Position', typ: 'text', alias: ['position', 'funktion', 'rolle', 'titel'] },
      { key: 'status', label: 'Status', typ: 'text', standard: 'interessent', hinweis: 'interessent · aktiv · kunde · inaktiv', alias: ['status', 'kundenstatus'] },
      { key: 'quelle', label: 'Quelle', typ: 'text', alias: ['quelle', 'herkunft', 'source', 'kanal'] },
      { key: 'notizen', label: 'Notizen', typ: 'text', alias: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar', 'anmerkung'] },
    ],
  },
  {
    key: 'artikel',
    label: 'Artikel & Preise',
    icon: '📦',
    tabelle: 'artikel',
    beschreibung: 'Sortiment, Preise und Lagerbestände ins ERP laden.',
    schluessel: 'artikelnummer',
    felder: [
      { key: 'bezeichnung', label: 'Bezeichnung', typ: 'text', pflicht: true, alias: ['bezeichnung', 'artikel', 'artikelbezeichnung', 'name', 'produkt', 'produktname', 'beschreibung kurz', 'titel'] },
      { key: 'artikelnummer', label: 'Artikelnummer', typ: 'text', alias: ['artikelnummer', 'artikelnr', 'artikel-nr', 'art nr', 'artnr', 'nummer', 'sku', 'nr'] },
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
    felder: [
      { key: 'name', label: 'Name', typ: 'text', pflicht: true, alias: ['name', 'lieferant', 'firma', 'firmenname', 'unternehmen'] },
      { key: 'ansprechpartner', label: 'Ansprechpartner', typ: 'text', alias: ['ansprechpartner', 'kontakt', 'kontaktperson', 'zustaendig'] },
      { key: 'email', label: 'E-Mail', typ: 'text', alias: ['email', 'e-mail', 'mail', 'e-mail-adresse'] },
      { key: 'telefon', label: 'Telefon', typ: 'text', alias: ['telefon', 'tel', 'telefonnummer', 'phone'] },
      { key: 'adresse', label: 'Adresse', typ: 'text', alias: ['adresse', 'anschrift', 'strasse', 'straße', 'ort'] },
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
    felder: [
      { key: 'rechnungsnummer', label: 'Rechnungsnummer', typ: 'text', pflicht: true, alias: ['rechnungsnummer', 'rechnungsnr', 'rg-nr', 'rgnr', 'belegnummer', 'beleg-nr', 'nummer', 'nr'] },
      { key: 'titel', label: 'Titel / Betreff', typ: 'text', alias: ['titel', 'betreff', 'bezeichnung', 'leistung', 'text', 'buchungstext'] },
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
    rechnungsnummer: 'RE-2025-0142|RE-2025-0143|RE-2025-0144',
    titel: 'Wartung Anlage Halle 2|Montage Tuerelement|Materiallieferung KW 22',
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
  const kopf = ziel.felder.map((f) => f.label + (f.pflicht ? ' *' : ''));

  const zeilen: string[][] = Array.from({ length: ZEILEN_JE_MUSTERVORLAGE }, () => [] as string[]);
  for (const f of ziel.felder) {
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
  const map: Mapping = {};
  if (!ziel) return map;

  const vergeben = new Set<string>();

  const kandidaten = ziel.felder.map((f) => ({
    key: f.key,
    begriffe: [normal(f.key), normal(f.label), ...f.alias.map(normal)].filter((x) => x.length > 0),
  }));

  // Stufe 1: exakte Treffer
  for (const spalte of kopf) {
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
      if (vergeben.has(k.key)) continue;
      for (const b of k.begriffe) {
        if (b.length < 3) continue;
        if (n === b || n.includes(b) || b.includes(n)) {
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
export function fehlendePflichtfelder(mapping: Mapping, zielKey: string): ZielFeld[] {
  const ziel = zielDef(zielKey);
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
];

export type ZeilenOptionen = {
  /** Dezimaltrennzeichen der Datei, aus rateDezimaltrenner(). */
  dezimal?: Dezimaltrenner;
  /** Steuersatz fuer die Brutto-Rueckrechnung, wenn nur Brutto geliefert wird. */
  steuersatz?: number;
  /** Bezugsdatum fuer zweistellige Jahreszahlen. */
  heute?: Date;
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
  const ziel = zielDef(zielKey);
  const fehler: ZeilenFehler[] = [];
  const warnungen: ZeilenFehler[] = [];
  if (!ziel) return { werte: null, fehler: [{ zeile: nummer, feld: '', meldung: 'Unbekanntes Import-Ziel' }], warnungen };
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

  nachbereiten(zielKey, werte, nummer, warnungen, opt.steuersatz ?? STEUERSATZ_STANDARD);

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
): void {
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

  if (zielKey === 'kontakte') {
    const erlaubt = ['interessent', 'aktiv', 'kunde', 'inaktiv'];
    if (typeof werte.status === 'string' && !erlaubt.includes(werte.status.toLowerCase())) {
      warnungen.push({ zeile: nummer, feld: 'Status', meldung: `"${werte.status}" ist kein bekannter Status — auf "interessent" gesetzt` });
      werte.status = 'interessent';
    } else if (typeof werte.status === 'string') {
      werte.status = werte.status.toLowerCase();
    }
  }
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
export function zahlenWerte(zielKey: string, mapping: Mapping, kopf: string[], zeilen: string[][]): string[] {
  const ziel = zielDef(zielKey);
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
  const ziel = zielDef(zielKey);
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
    : rateDezimaltrenner(zahlenWerte(zielKey, mapping, kopf, zeilen));
  if (trenner.hinweis) hinweise.push(trenner.hinweis);

  const zeilenOpt: ZeilenOptionen = { ...opt, dezimal: trenner.dezimal };

  zeilen.forEach((z, i) => {
    const nummer = i + 2;                       // +2: Kopfzeile ist Zeile 1
    const e = pruefeZeile(zielKey, mapping, kopf, z, nummer, zeilenOpt);
    warnungen.push(...e.warnungen);
    if (!e.werte) { fehler.push(...e.fehler); return; }

    if (ziel?.schluessel) {
      const s = String(e.werte[ziel.schluessel] ?? '').trim().toLowerCase();
      if (s) {
        if (gesehen.has(s)) {
          dubletten++;
          warnungen.push({ zeile: nummer, feld: ziel.felder.find((f) => f.key === ziel.schluessel)?.label ?? ziel.schluessel, meldung: `"${s}" kommt in der Datei mehrfach vor — nur der erste Eintrag wird übernommen` });
          return;
        }
        gesehen.add(s);
      }
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
