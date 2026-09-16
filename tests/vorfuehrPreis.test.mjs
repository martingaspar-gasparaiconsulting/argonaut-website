// ============================================================================
// tests/vorfuehrPreis.test.mjs — oeffentlicher Preisrechner der Vorfuehrung
//
// Anlass: 11 Standorte waren billiger als 10. Ursache waren Standorte mit
// 0 Mitarbeitern, die tarif.firmenweit() herauswirft — damit fiel der
// Standort-Zuschlag weg. Das sieht ein Interessent sofort.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preisFuerGroesse, sitzMixFuer } from '../out/vorfuehrPreis.js';

test('mehr Standorte kosten nie weniger', () => {
  for (const ma of [1, 2, 5, 10, 24, 40, 120, 600]) {
    let letzterMonat = 0;
    let letzteEinrichtung = 0;
    for (let s = 1; s <= 30; s++) {
      const p = preisFuerGroesse(ma, s);
      assert.ok(p.monat >= letzterMonat,
        ma + ' Mitarbeiter: bei ' + s + ' Standorten faellt der Monatspreis von ' + letzterMonat + ' auf ' + p.monat);
      assert.ok(p.einrichtung >= letzteEinrichtung,
        ma + ' Mitarbeiter: bei ' + s + ' Standorten faellt die Einrichtung von ' + letzteEinrichtung + ' auf ' + p.einrichtung);
      letzterMonat = p.monat;
      letzteEinrichtung = p.einrichtung;
    }
  }
});

test('der gemeldete Fall: 10 Mitarbeiter, 10 gegen 11 Standorte', () => {
  const zehn = preisFuerGroesse(10, 10);
  const elf = preisFuerGroesse(10, 11);
  assert.ok(elf.monat > zehn.monat, '11 Standorte kosten ' + elf.monat + ', 10 kosten ' + zehn.monat);
  assert.ok(elf.einrichtung > zehn.einrichtung);
});

test('mehr Standorte als Mitarbeiter: jeder Standort zaehlt, MA wird angehoben', () => {
  const p = preisFuerGroesse(3, 8);
  assert.equal(p.standorte, 8, 'kein Standort darf verschwinden');
  assert.equal(p.mitarbeiter, 8, 'jeder Standort hat mindestens einen Menschen');
});

test('mehr Mitarbeiter kosten nie weniger — ausser an der ENTERPRISE-Kante', () => {
  for (const standorte of [1, 3, 7]) {
    let letzter = 0;
    for (let ma = 1; ma <= 700; ma++) {
      const p = preisFuerGroesse(ma, standorte);
      // 500 ist die einzige bekannte Ausnahme, siehe den naechsten Test.
      if (ma !== 500) {
        assert.ok(p.monat >= letzter,
          standorte + ' Standorte: bei ' + ma + ' Mitarbeitern faellt der Preis von ' + letzter + ' auf ' + p.monat);
      }
      letzter = p.monat;
    }
  }
});

// ---------------------------------------------------------------------------
// OFFENE PREISENTSCHEIDUNG, kein Code-Fehler.
//
// Beim Sprung von 499 auf 500 Mitarbeiter wechselt die Stufe von GROSS auf
// ENTERPRISE. Die Grundgebuehr steigt dabei von 4.900 auf 7.900 EUR, die
// Sitzpreise fallen aber staerker (340/150/19 -> 290/125/14). Unter dem Strich
// wird der Betrieb mit einem Mitarbeiter MEHR rund 7.081 EUR im Monat
// GUENSTIGER. Das ist im oeffentlichen Rechner sichtbar.
//
// Ob das gewollt ist (Mengenrabatt, ENTERPRISE ist ohnehin "ab"-Preis und
// verhandelbar) oder nicht, entscheidet Martin — nicht dieser Test. Der Test
// haelt den gemessenen Sprung nur fest, damit er nicht unbemerkt waechst.
// ---------------------------------------------------------------------------
test('die ENTERPRISE-Kante bei 500 Mitarbeitern ist bekannt und unveraendert', () => {
  const vorher = preisFuerGroesse(499, 1);
  const nachher = preisFuerGroesse(500, 1);
  assert.equal(vorher.stufe, 'GROSS');
  assert.equal(nachher.stufe, 'ENTERPRISE');
  const sprung = nachher.monat - vorher.monat;
  assert.equal(sprung, -7081,
    'Der Sprung an der ENTERPRISE-Kante hat sich geaendert: ' + vorher.monat + ' -> ' + nachher.monat +
    ' (' + sprung + '). Wenn das Absicht war, diesen Wert anpassen.');
});

test('Fehleingaben zeigen nie den Hoechstpreis', () => {
  for (const wert of [0, -5, NaN, Infinity, null, undefined, '']) {
    const p = preisFuerGroesse(wert, 1);
    assert.equal(p.stufe, 'SOLO', String(wert) + ' ergibt Stufe ' + p.stufe);
    assert.equal(p.monat, 499);
  }
});

test('2,5 Mitarbeiter ergeben MINI, nicht ENTERPRISE', () => {
  const p = preisFuerGroesse(2.5, 1);
  assert.equal(p.stufe, 'MINI');
  assert.ok(p.monat < 2000, 'MINI darf nicht vierstellig sein: ' + p.monat);
});

test('kaputte Standortzahl sperrt den Rechner nicht', () => {
  for (const wert of [0, -4, NaN, null, undefined]) {
    const p = preisFuerGroesse(10, wert);
    assert.equal(p.standorte, 1, String(wert) + ' Standorte ergibt ' + p.standorte);
    assert.ok(Number.isFinite(p.monat));
  }
});

test('der Sitz-Mix bleibt vollstaendig und ohne Unsinn', () => {
  for (const ma of [1, 2, 3, 9, 10, 25, 100, 500]) {
    const m = sitzMixFuer(ma);
    assert.equal(m.voll + m.standard + m.self, ma, ma + ' Mitarbeiter ergeben einen anderen Sitz-Mix');
    assert.ok(m.voll >= 1, ma + ': mindestens ein Voll-Nutzer');
    assert.ok(m.standard >= 0 && m.self >= 0);
  }
  for (const wert of [0, -3, NaN, null]) {
    const m = sitzMixFuer(wert);
    assert.ok(Number.isFinite(m.voll + m.standard + m.self), String(wert) + ' ergibt NaN im Sitz-Mix');
  }
});

test('SOLO schlaegt keine Sitze auf', () => {
  const p = preisFuerGroesse(2, 1);
  assert.equal(p.monat, 499);
  assert.ok(p.posten.some((x) => x.betrag === 0));
});

test('alle ausgewiesenen Betraege sind echte Zahlen', () => {
  for (const [ma, st] of [[1, 1], [10, 3], [250, 12], [0, 0], [NaN, NaN]]) {
    const p = preisFuerGroesse(ma, st);
    for (const feld of ['monat', 'einrichtung', 'jeMitarbeiter', 'monat36', 'ersparnis36', 'rabatt36']) {
      assert.ok(Number.isFinite(p[feld]), feld + ' ist keine Zahl bei ' + ma + '/' + st);
    }
    for (const pos of p.posten) assert.ok(Number.isFinite(pos.betrag), 'Posten ohne Zahl: ' + pos.label);
  }
});
