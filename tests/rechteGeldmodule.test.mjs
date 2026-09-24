// ============================================================================
// ARGONAUT OS · tests/rechteGeldmodule.test.mjs — Punkt 9 (17.09.2026)
//
// Sieben Geldmodule standen ohne `sensibel` in lib/rechte.ts. Damit landeten
// sie in MITARBEITER_ERLAUBT — jeder eingeladene Mitarbeiter konnte sie per
// Direkt-URL oeffnen, ganz ohne Freigabe. Das Menue versteckte nur den Knopf.
//
// Teil 2 (17.09.2026): Kasse und Einkauf folgen als eigener Push. Vorher per
// SQL geprueft: der einzige Mitarbeiter mit Kasse/Einkauf-Freigabe hat einen
// vollen Sitz und behaelt den Zugang. Die drei Standard-Sitze ohne Freigabe
// kamen bisher nur ueber die Luecke hinein.
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
  ['kasse', '/dashboard/kasse'],
  ['einkauf', '/dashboard/einkauf'],
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

test('Kassierer mit Freigabe und vollem Sitz kommt weiter an die Kasse', () => {
  assert.equal(mitarbeiterDarf('/dashboard/kasse', ['kasse']), true);
  assert.equal(pfadErlaubtFuerNutzerTyp('/dashboard/kasse', 'voll'), true);
  assert.equal(mitarbeiterDarf('/dashboard/einkauf', ['einkauf']), true);
});

test('kein anderes Modul hat sich still veraendert', () => {
  // Vor Punkt 9: 22 verschiedene sensible Schluessel. Jetzt genau 9 mehr.
  // Paket PA (24.09.26): +1 bewusst — 'sachbearbeiter' (Behoerdenbriefe,
  // Steuerbescheide). Paket PE (24.09.26): +1 'nachweise' (Versicherungen,
  // Subunternehmer). Jeder weitere neue sensible Schluessel muss hier
  // ausdruecklich eingetragen werden, sonst wird dieser Test rot.
  const BEWUSST_NEU = ['sachbearbeiter', 'nachweise'];
  const alle = new Set(SENSIBLE_MODULE);
  assert.equal(alle.size, 31 + BEWUSST_NEU.length, 'erwartet 22 alte + 9 Geld + die bewusst neuen');
  for (const m of BEWUSST_NEU) assert.ok(alle.has(m), `${m} fehlt`);
  const ohneNeue = [...alle].filter((m) => !GELDMODULE.some(([g]) => g === m) && !BEWUSST_NEU.includes(m));
  assert.equal(ohneNeue.length, 22, 'die 22 bisherigen bleiben unveraendert');
  assert.ok(NAV_LINKS.length > 0);
});
