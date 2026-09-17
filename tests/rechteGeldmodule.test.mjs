// ============================================================================
// ARGONAUT OS · tests/rechteGeldmodule.test.mjs — Punkt 9 (17.09.2026)
//
// Sieben Geldmodule standen ohne `sensibel` in lib/rechte.ts. Damit landeten
// sie in MITARBEITER_ERLAUBT — jeder eingeladene Mitarbeiter konnte sie per
// Direkt-URL oeffnen, ganz ohne Freigabe. Das Menue versteckte nur den Knopf.
//
// Kasse und Einkauf sind BEWUSST noch offen (operative Module, ein Kassierer
// muss kassieren). Sie kommen als eigener Schritt nach einem Klicktest.
// Der Waechter-Test unten haelt das fest: wer die beiden umstellt, muss den
// Test mit Absicht mitaendern.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_LINKS, MITARBEITER_ERLAUBT, SENSIBLE_MODULE, MODUL_EBENE,
  mitarbeiterDarf, istSensibel, pfadErlaubtFuerNutzerTyp, verteilbareModule,
} from '../out/rechte.js';

const GELDMODULE = [
  ['reisekosten', '/dashboard/reisekosten'],
  ['spenden', '/dashboard/spenden'],
  ['foerdermittel', '/dashboard/foerdermittel'],
  ['projekt-abrechnung', '/dashboard/projekt-abrechnung'],
  ['betriebskosten', '/dashboard/betriebskosten'],
  ['gutscheine', '/dashboard/gutscheine'],
  ['foerder-angebot', '/dashboard/foerder-angebot'],
];

for (const [modul, pfad] of GELDMODULE) {
  test(`${modul}: ohne Freigabe kommt kein Mitarbeiter hinein`, () => {
    assert.equal(istSensibel(modul), true, `${modul} muss sensibel sein`);
    assert.ok(!MITARBEITER_ERLAUBT.includes(pfad), `${pfad} darf nicht fuer jeden offen stehen`);
    assert.equal(mitarbeiterDarf(pfad, []), false);
    assert.equal(mitarbeiterDarf(pfad + '/unterseite', []), false, 'auch Unterseiten bleiben zu');
  });

  test(`${modul}: MIT Freigabe kommt der Mitarbeiter weiterhin hinein`, () => {
    assert.equal(mitarbeiterDarf(pfad, [modul]), true);
  });
}

test('ein fremdes Recht oeffnet kein Geldmodul', () => {
  assert.equal(mitarbeiterDarf('/dashboard/reisekosten', ['spenden']), false);
});

test('die Ebene bleibt 3 — Abteilungsleiter duerfen die Module weiter vergeben', () => {
  for (const [modul] of GELDMODULE) assert.equal(MODUL_EBENE[modul], 3, modul);
  const eigene = GELDMODULE.map(([m]) => m);
  assert.deepEqual(verteilbareModule('abteilungsleiter', eigene).sort(), [...eigene].sort());
});

test('Sitz-Typ standard: Geldmodule sind gesperrt, voll bleibt offen', () => {
  // Bewusste Folge von sensibel: ein Standard-Sitz sieht sie auch mit Freigabe nicht.
  assert.equal(pfadErlaubtFuerNutzerTyp('/dashboard/reisekosten', 'standard'), false);
  assert.equal(pfadErlaubtFuerNutzerTyp('/dashboard/reisekosten', 'voll'), true);
});

test('WAECHTER: Kasse und Einkauf sind in diesem Schritt noch NICHT sensibel', () => {
  assert.equal(istSensibel('kasse'), false);
  assert.equal(istSensibel('einkauf'), false);
  assert.equal(mitarbeiterDarf('/dashboard/kasse', []), true);
  assert.equal(mitarbeiterDarf('/dashboard/einkauf', []), true);
});

test('kein anderes Modul hat sich still veraendert', () => {
  // Vor Punkt 9: 22 verschiedene sensible Schluessel. Jetzt genau 7 mehr.
  const alle = new Set(SENSIBLE_MODULE);
  assert.equal(alle.size, 29, 'erwartet 22 alte + 7 neue sensible Schluessel');
  const ohneNeue = [...alle].filter((m) => !GELDMODULE.some(([g]) => g === m));
  assert.equal(ohneNeue.length, 22, 'die 22 bisherigen bleiben unveraendert');
  assert.ok(NAV_LINKS.length > 0);
});
