import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kopfSummen } from '../out/rechnungKopf.js';

// ===========================================================================
// HW-5 (15.10.2026) — § 13b: gespeicherte Summen ohne Umsatzsteuer
// Vorher: Seite speicherte Brutto mit 19 %, PDF zeigte nur Netto.
// ===========================================================================

const posten = [{ netto: 1000, satz: 19 }, { netto: 200, satz: 7 }];

test('Normale Rechnung: Steuer je Satz, Brutto = Netto + Steuer', () => {
  const s = kopfSummen(posten, {});
  assert.equal(s.netto, 1200);
  assert.equal(s.mwst, 204);
  assert.equal(s.brutto, 1404);
  assert.equal(s.gruppen.length, 2);
  assert.equal(s.ohneSteuer, null);
});

test('§ 13b: Steuer 0, Brutto = Netto — Mahnung fordert keine 19 % zu viel', () => {
  const s = kopfSummen(posten, { reverseCharge: true });
  assert.equal(s.netto, 1200);
  assert.equal(s.mwst, 0, 'vorher 204 € Steuer gespeichert');
  assert.equal(s.brutto, 1200, 'vorher 1.404 € Brutto gespeichert');
  assert.equal(s.ohneSteuer, 'reverse_charge');
  assert.equal(s.gruppen.length, 2, 'Gruppen bleiben fuer Schlussrechnung/Abschlaege');
});

test('Kleinunternehmer: alles 0, keine Gruppen — und geht vor § 13b', () => {
  for (const rc of [false, true]) {
    const s = kopfSummen(posten, { kleinunternehmer: true, reverseCharge: rc });
    assert.equal(s.mwst, 0);
    assert.equal(s.brutto, 1200);
    assert.deepEqual(s.gruppen, []);
    assert.equal(s.ohneSteuer, 'kleinunternehmer');
  }
});

test('Cent-genau: 19 % auf 0,99 € einzeln, Brutto bei § 13b exakt Netto', () => {
  const p = [{ netto: 0.99, satz: 19 }, { netto: 0.99, satz: 19 }];
  assert.equal(kopfSummen(p, {}).brutto, 2.36);
  assert.equal(kopfSummen(p, { reverseCharge: true }).brutto, 1.98);
});

test('Waechter: Rechnungsseite rechnet die Kopfsummen ueber kopfSummen mit reverseCharge', () => {
  const src = fs.readFileSync('app/dashboard/rechnungen/[id]/page.tsx', 'utf8');
  assert.match(src, /kopfSummen\(posten, \{ kleinunternehmer, reverseCharge: zusatz\.reverseCharge \}\)/);
  assert.doesNotMatch(src, /\bsteuerGruppen\(/, 'eigene Summenrechnung ohne § 13b darf nicht zurueckkommen');
});
