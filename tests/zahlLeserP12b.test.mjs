// ARGONAUT OS · tests/zahlLeserP12b.test.mjs — Punkt 12, Restposten (22.09.2026)
// Vier echte Geldfelder lasen Zahlen selbst und falsch. Jetzt liest
// lib/zahlen.ts. Die Werte unten sind GEMESSEN, nicht ausgedacht: jeder
// "vorher"-Wert stammt aus der alten Formel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zahl as terminZahl } from '../out/terminWert.js';
import { leseZahl, leseZahlOder } from '../out/zahlen.js';

// Die alten Leser, woertlich nachgebaut — damit der Unterschied belegt ist
// und nicht behauptet.
const ALT_BAUART_A = (x) => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(String(x).replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
};
const ALT_BAUART_B = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// ---------------------------------------------------------------------------
// 1. BAUART A — versandBuchung und dealScoring
// ---------------------------------------------------------------------------

test('BELEG: der alte Leser machte aus 1.234,56 eine Null', () => {
  assert.equal(ALT_BAUART_A('1.234,56'), 0, 'so war es vorher');
  assert.equal(leseZahlOder('1.234,56', 0), 1234.56, 'so ist es jetzt');
});

test('der neue Leser versteht die Schreibweisen, die im Haus vorkommen', () => {
  assert.equal(leseZahlOder('25.000,00', 0), 25000);
  assert.equal(leseZahlOder('1234,5', 0), 1234.5);
  assert.equal(leseZahlOder('1234.5', 0), 1234.5);
  assert.equal(leseZahlOder('99,90 EUR', 0), 99.9);
  assert.equal(leseZahlOder(1234.56, 0), 1234.56);
});

test('was nicht lesbar ist, bleibt 0 — der Vertrag der Aufrufer aendert sich nicht', () => {
  assert.equal(leseZahlOder('siehe Anlage', 0), 0);
  assert.equal(leseZahlOder(null, 0), 0);
  assert.equal(leseZahlOder(undefined, 0), 0);
  assert.equal(leseZahlOder(NaN, 0), 0);
  assert.equal(leseZahlOder({}, 0), 0);
});

// ---------------------------------------------------------------------------
// 2. BAUART B — terminWert und segmente (Faktor 100)
// ---------------------------------------------------------------------------

test('BELEG: der alte Leser machte aus 223.75 den Wert 22375 — Faktor hundert', () => {
  assert.equal(ALT_BAUART_B('223.75'), 22375, 'so war es vorher');
  assert.equal(terminZahl('223.75'), 223.75, 'so ist es jetzt');
});

test('BELEG: aus 7.5 Prozent wurden 75 Prozent', () => {
  assert.equal(ALT_BAUART_B('7.5'), 75, 'so war es vorher');
  assert.equal(leseZahl('7.5'), 7.5);
});

test('der deutsche Tausenderpunkt bleibt ein Tausenderpunkt', () => {
  assert.equal(terminZahl('1.234'), 1234);
  assert.equal(terminZahl('1.234,56'), 1234.56);
  assert.equal(leseZahl('1.234'), 1234);
});

test('terminWert bleibt bei seiner Regel: nur positive Werte, sonst 0', () => {
  assert.equal(terminZahl(0), 0);
  assert.equal(terminZahl(-5), 0);
  assert.equal(terminZahl('-1.234,56'), 0);
  assert.equal(terminZahl(''), 0);
  assert.equal(terminZahl('kein Wert'), 0);
  assert.equal(terminZahl(null), 0);
});

test('segmente: ein unlesbarer Filterwert bleibt null und vergleicht NICHT gegen 0', () => {
  // Ein Filter "Umsatz groesser als <unlesbar>" darf nicht plötzlich jeden
  // Kunden treffen, weil der Vergleichswert still zu 0 wurde.
  assert.equal(leseZahl('unbekannt'), null);
  assert.equal(leseZahl(''), null);
  assert.equal(leseZahl('8,20 x'), null);
});

// ---------------------------------------------------------------------------
// 3. DIE VIER DATEIEN LESEN JETZT ALLE GLEICH
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE TEST: dieselbe Eingabe, dasselbe Ergebnis', () => {
  for (const eingabe of ['1.234,56', '25.000,00', '7,5', '0,01', '1234']) {
    const erwartet = leseZahl(eingabe);
    assert.equal(leseZahlOder(eingabe, -1), erwartet, `leseZahlOder weicht ab bei ${eingabe}`);
    if (erwartet !== null && erwartet > 0) {
      assert.equal(terminZahl(eingabe), erwartet, `terminWert weicht ab bei ${eingabe}`);
    }
  }
});
