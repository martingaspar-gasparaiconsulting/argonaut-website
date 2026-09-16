// ============================================================================
// tests/tarifStufen.test.mjs — Stufenzuordnung von lib/tarif.ts
//
// Anlass: Der Rueckfall in stufeFuerMitarbeiter war ENTERPRISE. Alles, was
// durch die Baender fiel, bekam die teuerste Stufe — im oeffentlichen
// Preisrechner 7.900 EUR/Monat statt 499 oder 790 EUR.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stufeFuerMitarbeiter, STUFEN } from '../out/tarif.js';

const KLEINSTE = STUFEN[0];
const GROESSTE = STUFEN[STUFEN.length - 1];

test('die Baender treffen genau', () => {
  const erwartet = [
    [1, 'solo'], [2, 'solo'],
    [3, 'mini'], [9, 'mini'],
    [10, 'klein'], [24, 'klein'],
    [25, 'mittel'], [99, 'mittel'],
    [100, 'gross'], [499, 'gross'],
    [500, 'enterprise'], [5000, 'enterprise'],
  ];
  for (const [anzahl, key] of erwartet) {
    assert.equal(stufeFuerMitarbeiter(anzahl).key, key, anzahl + ' Mitarbeiter');
  }
});

test('Fehleingaben landen NIE bei ENTERPRISE', () => {
  for (const wert of [0, -1, -3, NaN, Infinity, -Infinity, null, undefined, '']) {
    const s = stufeFuerMitarbeiter(wert);
    assert.notEqual(s.key, GROESSTE.key, String(wert) + ' ergibt die teuerste Stufe');
    assert.equal(s.key, KLEINSTE.key, String(wert) + ' sollte die kleinste Stufe ergeben');
  }
});

test('Bruchzahlen fallen nicht zwischen zwei Baender', () => {
  assert.equal(stufeFuerMitarbeiter(2.5).key, 'mini');
  assert.equal(stufeFuerMitarbeiter(9.2).key, 'klein');
  assert.equal(stufeFuerMitarbeiter(24.5).key, 'mittel');
  assert.equal(stufeFuerMitarbeiter(99.9).key, 'gross');
  assert.equal(stufeFuerMitarbeiter(499.5).key, 'enterprise');
  assert.equal(stufeFuerMitarbeiter(1.5).key, 'solo');
});

test('keine Luecke: jede ganze Zahl von 1 bis 600 bekommt eine Stufe', () => {
  for (let n = 1; n <= 600; n++) {
    const s = stufeFuerMitarbeiter(n);
    assert.ok(s && s.key, n + ' hat keine Stufe');
    assert.ok(n >= s.minMa, n + ' liegt unter dem Band ' + s.key);
    if (s.maxMa !== null) assert.ok(n <= s.maxMa, n + ' liegt ueber dem Band ' + s.key);
  }
});

test('die Grundgebuehr steigt mit der Mitarbeiterzahl, nie umgekehrt', () => {
  let letzte = 0;
  for (let n = 1; n <= 600; n++) {
    const g = stufeFuerMitarbeiter(n).grundgebuehr;
    assert.ok(g >= letzte, 'bei ' + n + ' Mitarbeitern faellt die Grundgebuehr von ' + letzte + ' auf ' + g);
    letzte = g;
  }
});

test('ENTERPRISE bekommt nur, wer wirklich gross ist', () => {
  assert.equal(stufeFuerMitarbeiter(499).key, 'gross');
  assert.equal(stufeFuerMitarbeiter(500).key, 'enterprise');
});
