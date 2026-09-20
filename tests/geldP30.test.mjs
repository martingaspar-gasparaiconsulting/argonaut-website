// ============================================================================
// tests/geldP30.test.mjs
//
// PUNKT 30 — Doppelarbeit zusammenfuehren, Paket 1: lib/geld.ts
//
// Der Suchlauf ueber alle 220 Logik-Dateien am 20.09.2026 fand
// FUENFUNDZWANZIG eigene Geld-Formatierer und FUENFUNDDREISSIG eigene
// Cent-Runder. Bei derselben Eingabe antworten sie bis zu SECHSFACH
// verschieden — alles gemessen, siehe Dateikopf von lib/geld.ts.
//
// Diese Datei nagelt die EINE Fassung fest. Sie ruft noch niemand auf:
// das Umstellen kommt getrennt, Gruppe fuer Gruppe, damit jede sichtbare
// Aenderung einzeln nachvollziehbar bleibt. Genau wie bei Punkt 12.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { euro, euroOderNull, euroKurz, prozent, menge, istBetrag, PLATZHALTER } from '../out/geld.js';

/** Das geschuetzte Leerzeichen, das die deutsche Schreibweise verlangt. */
const NBSP = ' ';

// ===========================================================================
// TEIL 1 — DIE REGEL, UM DIE ES GEHT
// ===========================================================================

test('DIE REGEL: ein fehlender Wert ist KEINE Null', () => {
  // Das war der gefaehrlichste Unterschied zwischen den alten Fassungen:
  // manche machten aus "ich weiss es nicht" ein "0,00 €". Auf einer
  // Rechnung sieht dann niemand mehr den Unterschied zwischen
  // "kostet nichts" und "wurde nie erfasst".
  for (const leer of [null, undefined, '', '   ', 'Unsinn', Number.NaN, {}, []]) {
    assert.equal(euro(leer), PLATZHALTER, JSON.stringify(leer) + ' ergibt keinen Platzhalter');
  }
  assert.notEqual(euro(null), euro(0), 'nicht erfasst und null Euro duerfen nie gleich aussehen');
});

test('eine echte Null bleibt eine echte Null', () => {
  assert.match(euro(0), /^0,00/);
  assert.match(euro('0'), /^0,00/);
  assert.match(euro('0,00'), /^0,00/);
});

test('es gibt nie "NaN €" und es stuerzt nie ab', () => {
  for (const kaputt of [Number.NaN, Infinity, -Infinity, null, undefined, 'abc', Symbol]) {
    const t = euro(kaputt);
    assert.ok(!t.includes('NaN'), JSON.stringify(kaputt) + ' ergibt ' + t);
    assert.ok(!t.includes('Infinity'), JSON.stringify(kaputt) + ' ergibt ' + t);
  }
});

test('Geld hat immer genau zwei Nachkommastellen', () => {
  // Eine alte Fassung zeigte "1.234,5 €" — eine Stelle fehlte.
  assert.match(euro(1234.5), /1\.234,50/);
  assert.match(euro(1000), /1\.000,00/);
  assert.match(euro(0.5), /^0,50/);
  assert.match(euro(7), /^7,00/);
});

test('das Leerzeichen vor dem Euro ist geschuetzt', () => {
  // Sonst bricht die Zeile zwischen Betrag und Zeichen um.
  assert.ok(euro(1234.5).includes(NBSP + '€'), JSON.stringify(euro(1234.5)));
  assert.ok(!euro(1234.5).includes(' €'), 'kein gewoehnliches Leerzeichen');
});

test('deutsche Zahltexte werden gelesen', () => {
  assert.match(euro('1.234,56'), /1\.234,56/);
  assert.match(euro('5,00 EUR'), /^5,00/);
  assert.match(euro('12.500'), /12\.500,00/, 'und zwar als zwoelftausendfuenfhundert');
});

test('negative Betraege behalten ihr Vorzeichen', () => {
  assert.match(euro(-99.9), /^-99,90/);
  assert.match(euro(-1234.56), /^-1\.234,56/);
});

test('gerundet wird symmetrisch', () => {
  assert.match(euro(2.675), /2,68/);
  assert.match(euro(-2.675), /-2,68/, 'eine Gutschrift rundet wie eine Rechnung');
});

// ===========================================================================
// TEIL 2 — WO EINE NULL RICHTIG IST
// ===========================================================================

test('euroOderNull zeigt bewusst 0,00 statt eines Platzhalters', () => {
  assert.equal(euroOderNull(null), euro(0));
  assert.equal(euroOderNull(undefined), euro(0));
  assert.equal(euroOderNull('Unsinn'), euro(0));
  assert.match(euroOderNull(null), /^0,00/);
  assert.equal(euroOderNull(1234.5), euro(1234.5), 'echte Werte unveraendert');
});

test('der Aufruf sagt, was gemeint ist', () => {
  // Der ganze Sinn der Trennung: am Aufruf muss man sehen, ob eine Null
  // eine Aussage ist oder eine Luecke.
  assert.notEqual(euro(null), euroOderNull(null));
});

// ===========================================================================
// TEIL 3 — GANZE EURO, ABER MIT ANSAGE
// ===========================================================================

test('euroKurz rundet auf ganze Euro — und heisst deshalb so', () => {
  // Eine alte Fassung tat das STILL mit maximumFractionDigits: 0. Am
  // Aufruf war nicht zu sehen, dass ein halber Euro verschwindet.
  assert.match(euroKurz(1234.5), /1\.235/);
  assert.match(euroKurz(1234.4), /1\.234/);
  assert.ok(!euroKurz(1234.5).includes(','), 'keine Nachkommastellen');
  assert.equal(euroKurz(null), PLATZHALTER);
});

test('euroKurz und euro widersprechen sich nicht bei ganzen Betraegen', () => {
  for (const n of [0, 7, 1000, -50]) {
    assert.equal(
      euroKurz(n).replace(/[^\d,.-]/g, ''),
      euro(n).replace(/[^\d,.-]/g, '').replace(/,00$/, ''),
      'Betrag ' + n,
    );
  }
});

// ===========================================================================
// TEIL 4 — PROZENT UND MENGE
// ===========================================================================

test('Prozentsaetze werden deutsch und mit geschuetztem Leerzeichen gesetzt', () => {
  assert.equal(prozent(7.5), '7,5' + NBSP + '%');
  assert.equal(prozent(19), '19' + NBSP + '%');
  assert.equal(prozent(0), '0' + NBSP + '%');
  assert.equal(prozent('7,5 %'), '7,5' + NBSP + '%', 'und lesen ihren eigenen Text');
  assert.equal(prozent(null), PLATZHALTER);
});

test('ein Prozentsatz wird nicht mit 100 verwechselt', () => {
  assert.equal(prozent(0.075), '0,1' + NBSP + '%', 'sieben Komma fuenf Prozent waeren 7,5');
  assert.equal(prozent(0.075, 3), '0,075' + NBSP + '%');
});

test('Mengen tragen ihre Einheit, wenn sie eine haben', () => {
  assert.equal(menge(8, 'SRM'), '8,00' + NBSP + 'SRM');
  assert.equal(menge(8), '8,00');
  assert.equal(menge(1234.5, 'kg'), '1.234,50' + NBSP + 'kg');
  assert.equal(menge(0.075, 'kg', 3), '0,075' + NBSP + 'kg');
  assert.equal(menge(null, 'SRM'), PLATZHALTER, 'ohne Menge keine Einheit');
});

test('istBetrag unterscheidet Luecke von Null', () => {
  assert.equal(istBetrag(0), true);
  assert.equal(istBetrag('0,00'), true);
  assert.equal(istBetrag(-5), true);
  assert.equal(istBetrag(null), false);
  assert.equal(istBetrag(''), false);
  assert.equal(istBetrag('Unsinn'), false);
  assert.equal(istBetrag(Number.NaN), false);
});

// ===========================================================================
// TEIL 5 — DER VERGLEICH MIT DEM BESTAND
// ===========================================================================

test('WAECHTER: die Regeln stehen fest', () => {
  // Wer hieran etwas aendert, aendert jede Geldanzeige im Haus.
  assert.equal(PLATZHALTER, '—');
  assert.equal(euro(1234.5), '1.234,50' + NBSP + '€');
  assert.equal(euroKurz(1234.5), '1.235' + NBSP + '€');
  assert.equal(euro(0), '0,00' + NBSP + '€');
});

test('dieselbe Eingabe ergibt IMMER dieselbe Ausgabe', () => {
  // Genau das war vorher nicht so: bis zu sechs verschiedene Antworten
  // auf denselben Wert, je nachdem welche Datei gerade formatierte.
  for (const wert of [1234.5, 0, null, undefined, Number.NaN, -99.9, '1.234,56']) {
    const a = euro(wert), b = euro(wert), c = euro(wert);
    assert.equal(a, b);
    assert.equal(b, c);
  }
});
