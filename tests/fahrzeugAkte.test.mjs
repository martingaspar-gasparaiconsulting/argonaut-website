import test from 'node:test';
import assert from 'node:assert/strict';
import {
  istDatum, pruefeStammdaten, stammdatenNutzlast, offenerHalter, halterWechselPlan,
} from '../out/fahrzeugAkte.js';

// ============================================================================
// Punkt 3.7 — die Fahrzeugakte kann jetzt schreiben.
//
// Diese Tests halten die beiden Regeln fest, bei denen ein Fehler teuer waere:
//   1) Stammdaten duerfen die FIN nie anfassen — sie ist der Schluessel der
//      Akte. Ein Fahrzeug mit geaenderter FIN verliert seine Geschichte.
//   2) Ein Halterwechsel loescht nichts. Der bisherige Halter wird mit
//      bis_datum abgeschlossen; scheitert eine Pruefung, entsteht GAR KEIN
//      Plan statt eines halben.
// ============================================================================

const leer = {
  kennzeichen: '', hersteller: '', modell: '', erstzulassung: '',
  farbe: '', kraftstoff: '', naechste_hu: '', notiz: '',
};

// ---------------------------------------------------------------- istDatum

test('istDatum: leer erlaubt, echtes Datum ja, erfundenes nein', () => {
  assert.equal(istDatum(''), true, 'leer heisst: Feld nicht gefuellt');
  assert.equal(istDatum('2026-09-12'), true);
  assert.equal(istDatum('2026-02-31'), false, 'den 31. Februar gibt es nicht');
  assert.equal(istDatum('2026-13-01'), false, 'Monat 13');
  assert.equal(istDatum('12.09.2026'), false, 'deutsches Format ist hier falsch');
  assert.equal(istDatum('2026-9-1'), false, 'ohne fuehrende Null');
});

// -------------------------------------------------------- pruefeStammdaten

test('leere Stammdaten sind in Ordnung — nichts ist Pflicht', () => {
  assert.deepEqual(pruefeStammdaten(leer, '2026-09-12'), []);
});

test('Erstzulassung kann nicht in der Zukunft liegen', () => {
  const f = pruefeStammdaten({ ...leer, erstzulassung: '2027-01-01' }, '2026-09-12');
  assert.equal(f.length, 1);
  assert.match(f[0], /Zukunft/);
});

test('HU kann nicht vor der Erstzulassung liegen', () => {
  const f = pruefeStammdaten({ ...leer, erstzulassung: '2020-05-01', naechste_hu: '2019-01-01' }, '2026-09-12');
  assert.equal(f.length, 1);
  assert.match(f[0], /vor der Erstzulassung/);
});

test('HU nach der Erstzulassung ist in Ordnung', () => {
  assert.deepEqual(
    pruefeStammdaten({ ...leer, erstzulassung: '2020-05-01', naechste_hu: '2027-01-01' }, '2026-09-12'),
    [],
  );
});

test('ein kaputtes Datum wird als solches gemeldet', () => {
  const f = pruefeStammdaten({ ...leer, naechste_hu: '01.01.2027' }, '2026-09-12');
  assert.equal(f.length, 1);
  assert.match(f[0], /JJJJ-MM-TT/);
});

test('zu lange Felder werden gemeldet', () => {
  assert.match(pruefeStammdaten({ ...leer, kennzeichen: 'X'.repeat(21) }, '2026-09-12')[0], /Kennzeichen/);
  assert.match(pruefeStammdaten({ ...leer, hersteller: 'X'.repeat(81) }, '2026-09-12')[0], /Hersteller/);
});

// ------------------------------------------------------ stammdatenNutzlast

test('leere Felder werden null, nicht Leerstring', () => {
  const n = stammdatenNutzlast({ ...leer, kennzeichen: '  BB-AB 123 ' }, '2026-09-12T10:00:00.000Z');
  assert.equal(n.kennzeichen, 'BB-AB 123', 'wird getrimmt');
  assert.equal(n.hersteller, null);
  assert.equal(n.naechste_hu, null);
  assert.equal(n.aktualisiert_am, '2026-09-12T10:00:00.000Z');
});

test('die Nutzlast enthaelt NIEMALS FIN, id oder owner_user_id', () => {
  const n = stammdatenNutzlast(leer, '2026-09-12T10:00:00.000Z');
  assert.equal('fin' in n, false, 'die FIN ist der Schluessel der Akte');
  assert.equal('id' in n, false);
  assert.equal('owner_user_id' in n, false);
  assert.equal('archiviert' in n, false);
});

// --------------------------------------------------------- Halter-Historie

const log = [
  { id: 'b', halter_name: 'Meier GmbH', von_datum: '2024-03-01', bis_datum: null },
  { id: 'a', halter_name: 'Schulz', von_datum: '2020-01-01', bis_datum: '2024-03-01' },
];

test('offenerHalter ist der ohne bis_datum', () => {
  assert.equal(offenerHalter(log).id, 'b');
  assert.equal(offenerHalter([]), null);
  assert.equal(offenerHalter([{ id: 'x', halter_name: 'A', von_datum: '2020-01-01', bis_datum: '2021-01-01' }]), null);
});

test('sauberer Wechsel: alten Eintrag schliessen, neuen anlegen', () => {
  const p = halterWechselPlan(log, '  Neuhalter AG ', '2026-09-01');
  assert.equal(p.fehler, null);
  assert.deepEqual(p.schliessen, { id: 'b', bis_datum: '2026-09-01' });
  assert.deepEqual(p.neu, { halter_name: 'Neuhalter AG', von_datum: '2026-09-01' });
});

test('ohne Namen entsteht gar kein Plan', () => {
  const p = halterWechselPlan(log, '   ', '2026-09-01');
  assert.match(p.fehler, /Namen/);
  assert.equal(p.schliessen, null);
  assert.equal(p.neu, null);
});

test('ohne Datum entsteht gar kein Plan', () => {
  const p = halterWechselPlan(log, 'Neu', '');
  assert.match(p.fehler, /Datum/);
  assert.equal(p.neu, null);
});

test('kaputtes Datum entsteht gar kein Plan', () => {
  const p = halterWechselPlan(log, 'Neu', '01.09.2026');
  assert.match(p.fehler, /JJJJ-MM-TT/);
  assert.equal(p.neu, null);
});

test('ein Datum vor dem Beginn des aktuellen Halters wird abgelehnt', () => {
  const p = halterWechselPlan(log, 'Neu', '2023-01-01');
  assert.match(p.fehler, /vor dem Beginn/);
  assert.equal(p.schliessen, null, 'es wird NICHTS geschlossen');
  assert.equal(p.neu, null);
});

test('derselbe Halter wird abgelehnt, auch in anderer Schreibweise', () => {
  const p = halterWechselPlan(log, 'meier gmbh', '2026-09-01');
  assert.match(p.fehler, /bereits/);
  assert.equal(p.neu, null);
});

test('gleiches Datum wie der Beginn des Vorgaengers ist erlaubt', () => {
  const p = halterWechselPlan(log, 'Neu', '2024-03-01');
  assert.equal(p.fehler, null);
  assert.deepEqual(p.schliessen, { id: 'b', bis_datum: '2024-03-01' });
});

test('leere Akte: nur der neue Eintrag, nichts zu schliessen', () => {
  const p = halterWechselPlan([], 'Erster Halter', '2026-09-01');
  assert.equal(p.fehler, null);
  assert.equal(p.schliessen, null);
  assert.deepEqual(p.neu, { halter_name: 'Erster Halter', von_datum: '2026-09-01' });
});

test('der Plan kennt keine Loesch-Anweisung — er kann nur schliessen und anlegen', () => {
  const p = halterWechselPlan(log, 'Neu', '2026-09-01');
  assert.equal(Object.keys(p).sort().join(','), 'fehler,neu,schliessen');
  assert.equal('loeschen' in p, false);
});
