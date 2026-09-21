// ============================================================================
// tests/geldBelegP30.test.mjs
//
// PUNKT 30 REST (b) — DIE BELEG-BIBLIOTHEKEN AN lib/geld.ts ANSCHLIESSEN
// (21.09.2026)
//
// ▄▄▄ DER BEFUND ▄▄▄
// lib/geld.ts steht seit dem 20.09. fertig und getestet da — und wurde von
// KEINER einzigen Beleg-Bibliothek aufgerufen. Stattdessen hatte jede ihren
// eigenen Formatierer: SIEBEN Stueck in fuenf verschiedenen Bauarten.
//
// ▄▄▄ WAS DAS AUF DEM PAPIER KOSTET — ALLES GEMESSEN ▄▄▄
//
//   Eingabe "1.234,56" (Text)  -> ALT: "0,00 €"   NEU: "1.234,56 €"
//   Eingabe "5,00 EUR" (Text)  -> ALT: "0,00 €"   NEU: "5,00 €"
//
//     Das ist kein Schoenheitsfehler. Eine numeric-Spalte liefert ihren
//     Wert oft als Text; Number("1.234,56") ist NaN, und `Number(n) || 0`
//     macht daraus stillschweigend eine Null. Derselbe Befund wie in
//     Punkt 53 (zugferd) und Punkt 63 (importParser) — hier stand er auf
//     einem Beleg beim Kunden.
//
//   Eingabe null / undefined / "" / NaN -> ALT: "0,00 €"   NEU: "—"
//
//     "kostet nichts" und "wurde nie erfasst" sahen gleich aus.
//
//   Eingabe Infinity -> ALT auf drei Belegen: "∞ €"   NEU: "—"
//
//   Das Leerzeichen vor dem Euro ist jetzt ueberall geschuetzt (U+00A0).
//   Auf vier der sieben Belege stand dort ein normales Leerzeichen, an dem
//   die Zeile umbrechen konnte.
//
// ▄▄▄ DIE OFFENE FRAGE AUS DEM TESTTAG IST BEANTWORTET ▄▄▄
// Im Testtag stand: "Offen bleibt, ob jsPDF U+00A0 sauber setzt."
// GEMESSEN mit jspdf und der Standardschrift Helvetica, als PDF erzeugt und
// als Bild angesehen:
//
//   U+00A0 (geschuetztes Leerzeichen)        -> rendert sauber
//   U+202F (schmales geschuetztes Leerzeichen) -> jsPDF druckt einen
//                                                 SCHRAEGSTRICH vor das
//                                                 Euro-Zeichen
//
// Sechs der sieben Beleg-Bibliotheken erzeugen ihr PDF mit jsPDF. Deshalb
// nagelt der letzte Test hier fest, dass aus lib/geld.ts niemals ein U+202F
// herauskommt — faellt er eines Tages um, stuende auf jedem Beleg ein
// Schraegstrich, und niemand haette es kommen sehen.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { euro, euroOderNull, PLATZHALTER } from '../out/geld.js';

const NBSP = ' ';
const NNBSP = ' ';

// Die sieben Dateien, die vorher einen eigenen Formatierer hatten.
const BELEGE = [
  'lib/aboRechnungPdf.ts',
  'lib/gutachtenPdf.ts',
  'lib/kvPdf.ts',
  'lib/zuwendungPdf.ts',
  'lib/provisionGutschriftPdf.ts',
  'app/dashboard/_components/inventurProtokollPdf.ts',
  'app/dashboard/_components/umsatzReportPdf.ts',
];

// ===========================================================================
// TEIL 1 — DER TEUERSTE FALL: EIN BETRAG ALS TEXT
// ===========================================================================

test('ein Betrag als Text wird gelesen, nicht zu 0,00 gemacht', () => {
  assert.equal(euro('1.234,56'), '1.234,56' + NBSP + '€',
    'ALT stand hier 0,00 Euro auf dem Beleg');
  assert.equal(euro('5,00 EUR'), '5,00' + NBSP + '€');
  assert.equal(euro('12.345,67'), '12.345,67' + NBSP + '€');
});

test('der Verlust im alten Verhalten ist genau der ganze Betrag', () => {
  // So rechnete der alte Formatierer: Number("1.234,56") ist NaN -> 0.
  const alt = (n) => (Number(n) || 0).toLocaleString('de-DE',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  assert.equal(alt('1.234,56'), '0,00 €');
  assert.notEqual(euro('1.234,56'), alt('1.234,56'));
});

// ===========================================================================
// TEIL 2 — UNBEKANNT IST NICHT NULL
// ===========================================================================

test('null, undefined, leerer Text und NaN ergeben den Platzhalter', () => {
  for (const w of [null, undefined, '', '   ', NaN, 'siehe Anlage']) {
    assert.equal(euro(w), PLATZHALTER,
      'aus ' + JSON.stringify(w) + ' darf keine stille Null werden');
  }
});

test('eine echte Null bleibt eine Null', () => {
  assert.equal(euro(0), '0,00' + NBSP + '€');
  assert.equal(euro('0'), '0,00' + NBSP + '€');
  assert.equal(euro('0,00'), '0,00' + NBSP + '€');
});

test('Unendlich landet nicht als Zeichen auf dem Beleg', () => {
  // GEMESSEN: drei der sieben Belege schrieben hier "∞ €".
  assert.equal(euro(Infinity), PLATZHALTER);
  assert.equal(euro(-Infinity), PLATZHALTER);
});

test('wo die Null fachlich stimmt, gibt es euroOderNull', () => {
  assert.equal(euroOderNull(null), '0,00' + NBSP + '€');
  assert.equal(euroOderNull(undefined), '0,00' + NBSP + '€');
  assert.equal(euroOderNull(5), '5,00' + NBSP + '€');
});

test('negative Betraege und Rundung', () => {
  assert.equal(euro(-12.5), '-12,50' + NBSP + '€');
  assert.equal(euro(1234.5), '1.234,50' + NBSP + '€');
  assert.equal(euro(0.005), '0,01' + NBSP + '€');
});

// ===========================================================================
// TEIL 3 — DAS LEERZEICHEN, DAS jsPDF VERTRAEGT
// ===========================================================================

test('vor dem Euro steht ein GESCHUETZTES Leerzeichen', () => {
  const s = euro(1234.5);
  assert.ok(s.includes(NBSP), 'sonst bricht die Zeile zwischen Betrag und Euro um');
  assert.ok(!s.includes(' €'), 'ein normales Leerzeichen darf da nicht stehen');
});

test('es steht NIEMALS ein schmales geschuetztes Leerzeichen darin', () => {
  // GEMESSEN mit jspdf/Helvetica: U+202F wird als Schraegstrich gedruckt.
  // Faellt dieser Test, stuende auf jedem Beleg "1.234,50 /€".
  for (const w of [1234.5, 0, -7.25, '1.234,56', 1e9]) {
    assert.ok(!String(euro(w)).includes(NNBSP),
      'U+202F in der Ausgabe — jsPDF macht daraus einen Schraegstrich');
  }
});

// ===========================================================================
// TEIL 4 — DIE DOPPELARBEIT BLEIBT WEG
// ===========================================================================

test('keine Beleg-Bibliothek hat wieder einen eigenen Geld-Formatierer', () => {
  const eigenbau = [
    /style:\s*'currency'/,                 // eigenes Intl-Currency
    /minimumFractionDigits:\s*2[\s\S]{0,60}€/,  // Handbau mit Euro dahinter
  ];
  for (const datei of BELEGE) {
    const quelle = readFileSync(new URL('../' + datei, import.meta.url), 'utf8');
    for (const muster of eigenbau) {
      assert.ok(!muster.test(quelle),
        datei + ' baut wieder selbst Geld — das gehoert in lib/geld.ts');
    }
  }
});

test('jede Beleg-Bibliothek holt sich euro wirklich aus lib/geld', () => {
  for (const datei of BELEGE) {
    const quelle = readFileSync(new URL('../' + datei, import.meta.url), 'utf8');
    assert.match(quelle, /import \{ euro[^}]*\} from '(\.\/geld|@\/lib\/geld)'/,
      datei + ' importiert lib/geld nicht');
  }
});
