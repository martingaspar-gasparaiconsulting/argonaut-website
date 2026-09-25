// lib/zahlen.ts
// ============================================================================
// DER EINE ZAHLEN-LESER (Punkt 12, 17.09.2026)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT ▄▄▄
// Am 17.09. wurden alle 261 Dateien in lib/ und alle Logik-Dateien in
// app/dashboard/_components/ durchsucht. Ergebnis: mehr als dreissig eigene
// Zahl-Leser, in drei Bauarten, die bei denselben Eingaben verschieden
// antworten:
//
//   Bauart A — nur Komma zu Punkt   (zahlungAufteilung, provision, ustva,
//              pipeline, dealScoring, versand, versandBuchung, reportBaukasten,
//              ustvaExport, angebotBundle, adsInsights, gaeb, document-render,
//              erechnung-parser, steuerLogik)
//              "1.234,56" wird zu "1.234.56" und damit zu 0. Der Kunde sieht
//              eine Zahlung ueber 0,00 Euro.
//
//   Bauart B — Punkte IMMER weg     (angebotRabatt, adsKosten, marketingRoi,
//              marketingCockpit, marketingAnalytics, terminWert, segmente,
//              vertriebsKette, ads, adsAnalytics, belegKennzeichen, datevExtf)
//              "223.75" wird zu 22375 (Faktor 100), "7.5" Prozent werden 75.
//
//   Bauart C — mit Heuristik        (bankAbgleich, kalkulator, automation,
//              importParser, aufmassLogik, sortimentImportLogik)
//              Besser, aber jede anders: bankAbgleich Z. 24 entfernt Punkte nur,
//              wenn auch ein Komma da ist — "1.234" ohne Komma bleibt deshalb
//              1,234 statt 1234, und "1.234.567" wird zu 0.
//
// ▄▄▄ WAS DIESE DATEI ANDERS MACHT ▄▄▄
// 1. Sie raet nicht, sie erkennt Muster. Jede Schreibweise hat eine eigene
//    Regel, und was in keine Regel passt, wird ABGELEHNT (null) statt still zu
//    einer falschen Zahl gemacht.
// 2. Sie putzt keinen Text weg. Die bisherigen Leser entfernen mit
//    replace(/[^0-9.,-]/g,'') alles Stoerende — dadurch wurde aus dem
//    abgebrochenen Aufmass "8,20 x" klammheimlich die Menge 8,20. Hier ist
//    "8,20 x" kein Zahltext und liefert null.
// 3. Erlaubt sind ausdruecklich nur Waehrungs- und Prozentzeichen ("5,00 EUR",
//    "7,5 %"), weil genau die im Haus an Zahlen kleben.
// 4. Deutsche Schreibweise hat Vorrang: "12,345" ist zwoelfkommadreivierfuenf.
//    Wo das Format sicher bekannt ist (Import englischer Dateien), gibt es
//    leseZahlMitTrenner().
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

/** Leerzeichen aller Art plus der Schweizer Tausender-Apostroph. */
const WEG = /[\s    '’]/g;

/** Waehrungszeichen, die vor oder hinter der Zahl stehen duerfen. */
const WAEHRUNG_VORNE = /^(?:€|EUR|\$|USD|CHF|£|GBP)/i;
const WAEHRUNG_HINTEN = /(?:€|EUR|\$|USD|CHF|£|GBP|%|‰)$/i;

// --- Muster, nach dem Saeubern geprueft (s besteht dann nur aus 0-9 . ,) ----
/** 1234 */
const NUR_ZIFFERN = /^[0-9]+$/;
/** 1.234,56 · 12.345.678,90 — deutsche Tausenderpunkte, Dezimalkomma */
const DE_VOLL = /^[1-9][0-9]{0,2}(?:\.[0-9]{3})+,[0-9]+$/;
/** 1,234.56 · 12,345,678.90 — englische Tausenderkommas, Dezimalpunkt */
const EN_VOLL = /^[1-9][0-9]{0,2}(?:,[0-9]{3})+\.[0-9]+$/;
/** 1.234 · 12.345.678 — deutsche Tausenderpunkte ohne Nachkomma */
const DE_TAUSEND = /^[1-9][0-9]{0,2}(?:\.[0-9]{3})+$/;
/** 1,234 · 12,345,678 — englische Tausenderkommas ohne Nachkomma */
const EN_TAUSEND = /^[1-9][0-9]{0,2}(?:,[0-9]{3})+$/;
/** 12,5 · 0,75 · ,5 — Dezimalkomma */
const DEZ_KOMMA = /^[0-9]*,[0-9]+$/;
/** 1234.56 · 0.75 · .5 — Dezimalpunkt */
const DEZ_PUNKT = /^[0-9]*\.[0-9]+$/;

/**
 * Liest eine Zahl aus einer beliebigen Eingabe.
 * Gibt null zurueck, wenn die Eingabe keine eindeutige Zahl ist — NIE still 0.
 *
 * Erkannt werden: 1234 · 1.234 · 1.234,56 · 12,5 · 1234.56 · 1,234.56 ·
 * -1.234,56 · 1.234,56- (DATEV/SAP) · (1.234,56) (Buchhaltung) · 5,00 EUR ·
 * 7,5 % · 1'234.56 (Schweiz) · 1 234,56 (mit Leerzeichen).
 */
export function leseZahl(wert: unknown): number | null {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : null;
  if (typeof wert === 'bigint') {
    const n = Number(wert);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof wert !== 'string') return null;

  let s = wert.replace(WEG, '');
  if (s === '') return null;

  s = s.replace(WAEHRUNG_VORNE, '').replace(WAEHRUNG_HINTEN, '');
  if (s === '') return null;

  // --- Vorzeichen, in genau dieser Reihenfolge ---
  let negativ = false;
  if (s.length > 2 && s.startsWith('(') && s.endsWith(')')) {
    negativ = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) { negativ = true; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }
  if (s.endsWith('-')) { negativ = true; s = s.slice(0, -1); }   // DATEV, SAP
  if (s === '') return null;

  // Ab hier duerfen nur noch Ziffern und Trennzeichen stehen. Alles andere —
  // "8,20 x", "ca. 5", "1.234 Stueck" — ist KEIN Zahltext.
  if (!/^[0-9.,]+$/.test(s)) return null;

  const roh = normalisieren(s);
  if (roh === null) return null;

  const n = Number(roh);
  if (!Number.isFinite(n)) return null;
  return negativ ? -n : n;
}

/** Setzt die erkannte Schreibweise in einen Zahltext um, den Number() versteht. */
function normalisieren(s: string): string | null {
  if (NUR_ZIFFERN.test(s)) return s;

  // Beide Trennzeichen: die Schreibweise ist eindeutig.
  if (DE_VOLL.test(s)) return s.replace(/\./g, '').replace(',', '.');
  if (EN_VOLL.test(s)) return s.replace(/,/g, '');

  // Mehr als ein Komma: nur als englische Tausender lesbar ("1,234,567").
  if (EN_TAUSEND.test(s) && s.split(',').length > 2) return s.replace(/,/g, '');

  // Genau ein Komma: in deutscher Schreibweise das Dezimaltrennzeichen.
  // "12,345" ist zwoelfkommadreivierfuenf, nicht zwoelftausend. Wer es anders
  // meint, nimmt leseZahlMitTrenner(wert, '.').
  if (DEZ_KOMMA.test(s)) return (s.startsWith(',') ? '0' + s : s).replace(',', '.');

  // Nur Punkte. Mehrdeutig bei genau einem: "1.234" ist deutscher
  // Tausenderpunkt, "0.75" und "1234.56" sind Dezimalpunkte. Tausender nur,
  // wenn die Gruppen wirklich dreistellig sind und vorne keine Null steht.
  if (DE_TAUSEND.test(s)) return s.replace(/\./g, '');
  if (DEZ_PUNKT.test(s)) return s.startsWith('.') ? '0' + s : s;

  return null;
}

/**
 * Wie leseZahl, liefert aber bei nicht lesbarer Eingabe den Standardwert.
 * Fuer Stellen, die heute schon 0 erwarten und keinen null-Fall kennen.
 */
export function leseZahlOder(wert: unknown, standard = 0): number {
  const n = leseZahl(wert);
  return n === null ? standard : n;
}

/**
 * Liest eine Zahl, wenn das Dezimaltrennzeichen SICHER bekannt ist — etwa beim
 * Import einer englischen Datei, wo "12,345" zwoelftausenddreihundertfuenf-
 * undvierzig heisst. Ohne diesen Hinweis gilt die deutsche Lesart.
 */
export function leseZahlMitTrenner(wert: unknown, dezimal: ',' | '.'): number | null {
  if (typeof wert === 'number') return Number.isFinite(wert) ? wert : null;
  if (typeof wert !== 'string') return leseZahl(wert);

  let s = wert.replace(WEG, '');
  if (s === '') return null;
  s = s.replace(WAEHRUNG_VORNE, '').replace(WAEHRUNG_HINTEN, '');
  if (s === '') return null;

  let negativ = false;
  if (s.length > 2 && s.startsWith('(') && s.endsWith(')')) { negativ = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negativ = true; s = s.slice(1); }
  else if (s.startsWith('+')) { s = s.slice(1); }
  if (s.endsWith('-')) { negativ = true; s = s.slice(0, -1); }
  if (s === '' || !/^[0-9.,]+$/.test(s)) return null;

  const tausender = dezimal === ',' ? '.' : ',';
  // Das Dezimaltrennzeichen darf hoechstens einmal vorkommen.
  const teile = s.split(dezimal);
  if (teile.length > 2) return null;
  const ganz = teile[0];
  const nach = teile.length === 2 ? teile[1] : null;
  if (nach !== null && !/^[0-9]+$/.test(nach)) return null;

  // Der Ganzteil ist entweder eine reine Ziffernfolge oder eine saubere
  // Tausendergruppierung. "1.2.3" ist beides nicht und wird abgelehnt.
  const gruppen = tausender === '.'
    ? /^[0-9]{1,3}(?:\.[0-9]{3})+$/
    : /^[0-9]{1,3}(?:,[0-9]{3})+$/;
  let ganzRoh: string;
  if (/^[0-9]*$/.test(ganz)) ganzRoh = ganz;
  else if (gruppen.test(ganz)) ganzRoh = ganz.split(tausender).join('');
  else return null;

  let roh = nach === null ? ganzRoh : ganzRoh + '.' + nach;
  if (roh.startsWith('.')) roh = '0' + roh;
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(roh)) return null;

  const n = Number(roh);
  if (!Number.isFinite(n)) return null;
  return negativ ? -n : n;
}

/** Auf Cent runden — symmetrisch um Null, damit -0,005 nicht nach oben kippt. */
export function centRunden(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
  return n < 0 ? -v : v;
}

/**
 * Geldbetrag: wie leseZahl, aber auf Cent gerundet. Null bleibt null —
 * ein nicht lesbarer Betrag darf NIE still zu 0,00 Euro werden.
 */
export function leseBetrag(wert: unknown): number | null {
  const n = leseZahl(wert);
  return n === null ? null : centRunden(n);
}

/**
 * Prozentsatz. "7,5 %" und "7.5" ergeben beide 7.5 — NICHT 75.
 * Der Wertebereich wird nicht beschnitten; das entscheidet der Aufrufer.
 */
export function leseProzent(wert: unknown): number | null {
  return leseZahl(wert);
}

/** Ist die Eingabe ueberhaupt als Zahl lesbar? */
export function istZahlText(wert: unknown): boolean {
  return leseZahl(wert) !== null;
}

// ============================================================================
// EINGABEFELDER (Punkt Zahlen-Querschnitt, 25.09.2026)
//
// WARUM NOCH ZWEI FUNKTIONEN
// Am 17.09. wurde lib/ umgestellt, die SEITEN (app/**) aber nicht. Dort lagen
// am 25.09. noch ueber hundert eigene Zahl-Leser — num(), zahl(), zahlAus(),
// parseZahl() und Dutzende Number(x.replace(',', '.')). Folge u. a.:
//   "1.200,00" -> 1,20   ·   "1.500" -> 1,5   ·   "1.000,00" -> NaN oder 1
// Ab jetzt lesen ALLE Eingabefelder ueber diese Datei. Der Waechter-Test
// tests/zahlenWaechter.test.mjs schlaegt an, sobald irgendwo wieder ein
// eigener Leser auftaucht — damit derselbe Fehler nicht zum dritten Mal kommt.
//
// DIE REGEL (deutsch):  1.500 = eintausendfuenfhundert · 1.500,50 · 12,5
// ============================================================================

/**
 * Wie Number(), aber in deutscher Schreibweise: ein leeres Feld ist 0,
 * ein nicht lesbares NaN. Gedacht als 1:1-Ersatz fuer die alten
 * Number(s.replace(',', '.'))-Stellen, damit deren Pruefungen (isNaN, || 0,
 * Number.isFinite) unveraendert weiter greifen.
 */
export function zahlAusFeld(wert: unknown): number {
  if (typeof wert === 'string' && wert.trim() === '') return 0;
  if (wert === null || wert === undefined) return 0;
  const n = leseZahl(wert);
  return n === null ? NaN : n;
}

/**
 * Das Gegenstueck zum Vorbelegen eines Eingabefeldes: 2.125 wird "2,125",
 * 1500 bleibt "1500". Ohne das stuende nach "Bearbeiten" "2.125" im Feld —
 * und das ist nach deutscher Regel zweitausendeinhundertfuenfundzwanzig.
 * Alles, was keine Zahl ist, kommt unveraendert als Text zurueck
 * (null/undefined als leerer Text).
 */
export function zahlFeld(wert: unknown): string {
  if (wert === null || wert === undefined) return '';
  if (typeof wert === 'number') {
    if (!Number.isFinite(wert)) return '';
    const s = String(wert);
    return /e/i.test(s) ? s : s.replace('.', ',');
  }
  return String(wert);
}

/**
 * Zahl fuer die ANZEIGE mit fester Nachkommazahl, deutsch: 1.234,5.
 * Ersetzt n.toFixed(1), das "1234.5" mit Punkt zeigt.
 */
export function zahlText(wert: unknown, stellen = 2): string {
  const n = typeof wert === 'number' ? wert : leseZahl(wert);
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}
