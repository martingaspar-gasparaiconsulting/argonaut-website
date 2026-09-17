// ARGONAUT OS · tests/churnSperre.test.mjs — Punkt 11 (17.09.2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import { churnEntscheidung, CHURN_ZIEL } from '../out/churnSperre.js';

test('eine Zeile in der Sperrliste sperrt', () => {
  assert.deepEqual(churnEntscheidung([{ id: 'x' }], null), { gesperrt: true, protokoll: null });
});

test('ein Doppeleintrag sperrt ebenfalls (kein .single()-Aushebeln)', () => {
  assert.equal(churnEntscheidung([{ id: 'a' }, { id: 'b' }], null).gesperrt, true);
});

test('DER WICHTIGSTE TEST: leere Liste laesst den zahlenden Kunden rein', () => {
  assert.deepEqual(churnEntscheidung([], null), { gesperrt: false, protokoll: null });
  assert.equal(churnEntscheidung(null, null).gesperrt, false);
  assert.equal(churnEntscheidung(undefined, undefined).gesperrt, false);
});

test('Datenbankfehler sperrt NICHT, wird aber laut protokolliert', () => {
  const e = churnEntscheidung(null, { message: 'permission denied' });
  assert.equal(e.gesperrt, false);
  assert.match(e.protokoll, /churn-lock.*permission denied/);
  assert.match(churnEntscheidung(null, {}).protokoll, /unbekannter Fehler/);
});

test('Muell statt Liste sperrt nicht', () => {
  assert.equal(churnEntscheidung('ja', null).gesperrt, false);
  assert.equal(churnEntscheidung({ length: 3 }, null).gesperrt, false);
});

test('das Ziel liegt ausserhalb von /dashboard — sonst Endlosschleife', () => {
  assert.equal(CHURN_ZIEL, '/auth/gesperrt');
  assert.ok(!CHURN_ZIEL.startsWith('/dashboard'));
});
