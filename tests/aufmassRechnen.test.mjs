// ============================================================================
// tests/aufmassRechnen.test.mjs
//
// Zwei Befunde aus dem Pruefbefund vom 15.09.2026:
//  (1) Eine abgebrochene Aufmass-Formel lieferte still eine falsche Menge.
//  (2) Aus dem Kalkulator uebernommene Leistungen kosteten 0,00 EUR.
// Beides fliesst ueber "Rechnung aus Aufmass" direkt in eine Rechnung.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rechneMenge, katalogNachAufmassPosition, positionsBetrag, aufmassSumme } from '../out/aufmassLogik.js';
import { katalogNachPosition, positionsBetrag as leistungBetrag, istMengenLeistung } from '../out/leistungLogik.js';
import { alsKatalogEintrag } from '../out/kalkulatorUebergabe.js';

// --- (1) Abgebrochene Formeln ----------------------------------------------

test('abgebrochene Formeln liefern einen Fehler, keine Zahl', () => {
  const kaputt = ['8,20 x', '2*', '2**3', '2*-3', '3 x', 'x 4', '5 +', '2 × × 3'];
  for (const e of kaputt) {
    const r = rechneMenge(e);
    assert.equal(r.menge, null, JSON.stringify(e) + ' ergibt die Menge ' + r.menge);
    assert.ok(r.fehler, JSON.stringify(e) + ' meldet keinen Fehler');
  }
});

test('der gemeldete Fall: "8,20 x" ergibt nicht mehr 8,20', () => {
  const r = rechneMenge('8,20 x');
  assert.notEqual(r.menge, 8.2);
  assert.equal(r.menge, null);
});

test('richtige Formeln rechnen unveraendert weiter', () => {
  const gut = [
    ['12', 12], ['3,5', 3.5], ['3 x 4', 12], ['10 x 2 x 1,5', 30],
    ['2,5 x 1,2 + 3', 6], ['5 + 3 - 2', 6], ['2 × 3', 6], ['4*2,5', 10],
  ];
  for (const [e, erwartet] of gut) {
    const r = rechneMenge(e);
    assert.equal(r.fehler, null, JSON.stringify(e) + ' meldet einen Fehler: ' + r.fehler);
    assert.equal(r.menge, erwartet, JSON.stringify(e));
  }
});

test('leere Eingabe bleibt eine eigene, freundliche Meldung', () => {
  const r = rechneMenge('');
  assert.equal(r.menge, null);
  assert.match(r.fehler, /Menge eingeben/);
});

test('eine Formel liefert nie gleichzeitig Menge und Fehler', () => {
  for (const e of ['8,20 x', '3 x 4', '', 'abc', '2**3', '7']) {
    const r = rechneMenge(e);
    assert.ok((r.menge === null) !== (r.fehler === null), JSON.stringify(e) + ': ' + JSON.stringify(r));
  }
});

// --- (2) Die 0,00-Euro-Kette ------------------------------------------------

const KALKULIERT = { name: 'Wand streichen', einheit: 'm²', preisJeEinheit: 14.36 };

test('der Kalkulator schreibt eine gueltige Erfassungsart', () => {
  const k = alsKatalogEintrag(KALKULIERT);
  assert.ok(['minuten', 'stunden', 'aw', 'stueck'].includes(k.erfassungsart),
    'erfassungsart "' + k.erfassungsart + '" gibt es nicht');
  assert.equal(k.erfassungsart, 'stueck');
  assert.equal(alsKatalogEintrag({ name: 'Montage', einheit: 'h', preisJeEinheit: 95 }).erfassungsart, 'stunden');
});

test('uebernommene Leistungen kosten ihren Preis, nicht 0,00 EUR', () => {
  const k = alsKatalogEintrag(KALKULIERT);
  const pos = katalogNachAufmassPosition(k);
  assert.equal(pos.einzelpreis_netto, 14.36);
  assert.equal(pos.festpreis_netto, null, 'ein Festpreis von 0 darf nicht als Pauschale gelten');
  assert.equal(positionsBetrag({ ...pos, menge: 10 }), 143.6);
});

test('dieselbe Kette ueber den Leistungskatalog', () => {
  const p = katalogNachPosition(alsKatalogEintrag(KALKULIERT));
  assert.equal(p.einzelpreis_netto, 14.36);
  assert.equal(leistungBetrag({ ...p, menge: 10 }), 143.6);
});

test('Stundensatz-Leistungen rechnen weiterhin als Zeit', () => {
  const k = alsKatalogEintrag({ name: 'Montage', einheit: 'h', preisJeEinheit: 95 });
  const p = katalogNachPosition(k);
  assert.equal(p.einzelpreis_netto, 95);
  assert.equal(leistungBetrag({ ...p, menge: 2 }), 190);
});

test('eine ECHTE Pauschale bleibt unangetastet', () => {
  const pos = katalogNachAufmassPosition({ bezeichnung: 'Anfahrt', festpreis_netto: 250, mwst_satz: 19 });
  assert.equal(pos.festpreis_netto, 250);
  assert.equal(positionsBetrag({ ...pos, menge: 3 }), 250, 'eine Pauschale wird nicht mit der Menge multipliziert');
});

test('Altlast: erfassungsart "menge" aus alten Katalogeintraegen rechnet richtig', () => {
  assert.equal(istMengenLeistung('menge'), true);
  assert.equal(istMengenLeistung('stueck'), true);
  assert.equal(istMengenLeistung('stunden'), false);
  assert.equal(
    leistungBetrag({ art: 'leistung', erfassungsart: 'menge', menge: 10, einzelpreis_netto: 14.36, festpreis_netto: null }),
    143.6);
});

test('ohne Preis bleibt es ehrlich leer, nicht 0,00 EUR', () => {
  const pos = { bezeichnung: 'X', menge: 5, einzelpreis_netto: null, festpreis_netto: null, mwst_satz: 19 };
  assert.equal(positionsBetrag(pos), null);
  const s = aufmassSumme([pos]);
  assert.equal(s.netto, 0);
  assert.equal(s.betragUnvollstaendig, true, 'eine Position ohne Preis muss als unvollstaendig gemeldet werden');
});

test('die Summe eines uebernommenen Aufmasses ist vollstaendig und richtig', () => {
  const pos = katalogNachAufmassPosition(alsKatalogEintrag(KALKULIERT));
  const s = aufmassSumme([{ ...pos, menge: 10 }]);
  assert.equal(s.netto, 143.6);
  assert.equal(s.betragUnvollstaendig, false);
  assert.deepEqual(s.ohnePreis, []);
});
