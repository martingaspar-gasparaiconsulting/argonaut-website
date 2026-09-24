// Paket PL (24.09.2026) — Formular-Baukasten.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FELD_TYPEN, neueFeldId, leseOptionen, pruefeVorlage, pruefeWerte, ergebnis, wertText, fortschritt, STARTVORLAGEN, pdfDateiname,
} from '../out/formularBaukasten.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('Feld-IDs und Optionen', () => {
  assert.equal(neueFeldId([]), 'f1');
  assert.equal(neueFeldId(['f1', 'f2']), 'f3');
  assert.equal(neueFeldId(['f3']), 'f2');
  assert.equal(neueFeldId(['f2', 'f3']), 'f4');
  assert.deepEqual(leseOptionen('ja, nein; ja\nvielleicht,, '), ['ja', 'nein', 'vielleicht']);
  assert.equal(FELD_TYPEN.length, 12);
});

test('Vorlage pruefen: Titel, Beschriftung, Optionen, doppelte IDs, nur Anzeige-Felder', () => {
  const ok = pruefeVorlage('Übergabe', [{ id: 'a', typ: 'text', label: 'Name', pflicht: true }, { id: 'a', typ: 'auswahl', label: 'Tank', optionen: 'voll, halb' }]);
  assert.deepEqual(ok.fehler, []);
  assert.equal(ok.felder[1].id !== 'a', true, 'doppelte ID wird ersetzt');
  assert.deepEqual(ok.felder[1].optionen, ['voll', 'halb']);
  assert.equal(ok.felder[0].pflicht, true);
  const schlecht = pruefeVorlage('', [{ typ: 'quatsch', label: 'x' }, { typ: 'auswahl', label: 'A', optionen: ['nur eins'] }, { typ: 'text', label: '' }]);
  assert.ok(schlecht.fehler.some((f) => /Titel/.test(f)));
  assert.ok(schlecht.fehler.some((f) => /unbekannter Typ/.test(f)));
  assert.ok(schlecht.fehler.some((f) => /zwei Auswahl/.test(f)));
  assert.ok(schlecht.fehler.some((f) => /Beschriftung fehlt/.test(f)));
  assert.ok(pruefeVorlage('X', [{ typ: 'ueberschrift', label: 'Nur Titel' }]).fehler.some((f) => /Eingabefeld/.test(f)));
  assert.ok(pruefeVorlage('X', []).fehler.some((f) => /keine Felder/.test(f)));
  // Pflicht bei reinem Anzeige-Feld wird ignoriert
  assert.equal(pruefeVorlage('X', [{ typ: 'hinweis', label: 'H', pflicht: true }, { typ: 'text', label: 'T' }]).felder[0].pflicht, undefined);
});

test('Werte: Entwurf erlaubt Luecken, Abschluss verlangt Pflichtfelder', () => {
  const { felder } = pruefeVorlage('X', [
    { id: 'n', typ: 'text', label: 'Name', pflicht: true },
    { id: 'z', typ: 'zahl', label: 'km' },
    { id: 'd', typ: 'datum', label: 'Datum' },
    { id: 'a', typ: 'auswahl', label: 'Tank', optionen: ['voll', 'halb'] },
    { id: 'm', typ: 'mehrfach', label: 'Erledigt', optionen: ['A', 'B'] },
    { id: 'p', typ: 'pruefpunkt', label: 'Bremsen' },
    { id: 'u', typ: 'unterschrift', label: 'Unterschrift', pflicht: true },
    { id: 'f', typ: 'foto', label: 'Fotos' },
  ]);
  assert.deepEqual(pruefeWerte(felder, {}, false), []);
  assert.deepEqual(pruefeWerte(felder, {}, true), ['„Name" ist ein Pflichtfeld.', '„Unterschrift" ist ein Pflichtfeld.']);
  const kaputt = pruefeWerte(felder, { n: 'A', z: 'zwölf', d: '24.09.2026', a: 'leer', m: ['A', 'C'], p: 'gut', u: 'data:text/html,<x>', f: ['https://fremd/x.jpg'] }, true);
  assert.equal(kaputt.length, 7);
  assert.deepEqual(pruefeWerte(felder, { n: 'A', z: '1.234,5', d: '2026-09-24', a: 'voll', m: ['B'], p: 'nio', u: PNG, f: ['abc/formulare/1.webp'] }, true), []);
  assert.equal(pruefeWerte(felder, { u: 'data:image/png;base64,' + 'A'.repeat(200_001) }, false).length, 1);
});

test('Ergebnis und Fortschritt', () => {
  const felder = [
    { id: 'a', typ: 'pruefpunkt', label: 'A' }, { id: 'b', typ: 'pruefpunkt', label: 'B' }, { id: 'c', typ: 'pruefpunkt', label: 'C' },
    { id: 'h', typ: 'ueberschrift', label: 'H' }, { id: 't', typ: 'text', label: 'T', pflicht: true },
  ];
  assert.deepEqual(ergebnis(felder, { a: 'io', b: 'entfaellt', c: 'io' }), { pruefpunkte: 3, io: 2, nio: 0, entfaellt: 1, offen: 0, gesamt: 'io' });
  assert.equal(ergebnis(felder, { a: 'io', b: 'nio' }).gesamt, 'nio', 'ein n.i.O. schlaegt alles');
  assert.equal(ergebnis(felder, { a: 'io' }).gesamt, 'offen');
  assert.equal(ergebnis([{ id: 't', typ: 'text', label: 'T' }], {}).gesamt, null);
  assert.deepEqual(fortschritt(felder, { a: 'io', t: '' }), { gefuellt: 1, gesamt: 4, pflichtOffen: 1 });
});

test('Werte lesbar', () => {
  assert.equal(wertText({ id: 'd', typ: 'datum', label: '' }, '2026-09-24'), '24.09.2026');
  assert.equal(wertText({ id: 'p', typ: 'pruefpunkt', label: '' }, 'nio'), 'n. i. O.');
  assert.equal(wertText({ id: 'm', typ: 'mehrfach', label: '' }, ['A', 'B']), 'A, B');
  assert.equal(wertText({ id: 'f', typ: 'foto', label: '' }, ['x', 'y']), '2 Fotos');
  assert.equal(wertText({ id: 'u', typ: 'unterschrift', label: '' }, PNG), 'unterschrieben');
  assert.equal(wertText({ id: 't', typ: 'text', label: '' }, '  '), '—');
});

test('Startvorlagen sind gueltig und in Sie-Form', () => {
  assert.ok(STARTVORLAGEN.length >= 5);
  for (const v of STARTVORLAGEN) {
    const r = pruefeVorlage(v.titel, v.felder);
    assert.deepEqual(r.fehler, [], v.titel);
    assert.doesNotMatch(JSON.stringify(v), /\b(du|dein|dich)\b/i, v.titel);
  }
  assert.ok(STARTVORLAGEN.find((v) => v.kategorie === 'abnahme').felder.some((f) => /Anwalt/.test(f.label)));
  assert.equal(pdfDateiname('Übergabe / Wohnung 3', '2026-09-24T10:00'), 'Übergabe_Wohnung_3_2026-09-24.pdf');
});
