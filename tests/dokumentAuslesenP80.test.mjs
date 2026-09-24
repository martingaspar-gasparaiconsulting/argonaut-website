// Paket PG3 (24.09.2026) — Dokumente selbst auslesen + Wissens-Notizen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leserFuer, saeubereText, teileInAbschnitte, stapel, notizDatei, speicherPfad, ZIEL_ZEICHEN, MAX_ABSCHNITTE,
} from '../out/dokumentAuslesen.js';

test('Leser nach Endung oder Typ', () => {
  assert.equal(leserFuer('Handbuch.PDF'), 'pdf');
  assert.equal(leserFuer('a.docx'), 'docx');
  assert.equal(leserFuer('liste.xlsx'), 'xlsx');
  assert.equal(leserFuer('notiz.txt'), 'text');
  assert.equal(leserFuer('x.md'), 'text');
  assert.equal(leserFuer('ohne_endung', 'PDF'), 'pdf');
  assert.equal(leserFuer('bild.jpg', 'JPG'), null);
  assert.equal(leserFuer('alt.doc'), null);
});

test('Text saeubern: Trennstriche, Leerraum, Steuerzeichen', () => {
  assert.equal(saeubereText('Sicher-\nheit  am\u0000 Bau\r\n\r\n\r\n\r\nEnde'), 'Sicherheit am Bau\n\nEnde');
  assert.equal(saeubereText('Baden-\nWürttemberg'), 'Baden-\nWürttemberg'); // Grossbuchstabe: echter Bindestrich bleibt
  assert.equal(saeubereText(null), '');
});

test('Abschnitte: Groesse, Reihenfolge, nichts geht verloren', () => {
  const absatz = (n) => `Absatz ${n}. ` + 'Das ist ein Satz über Silikonfugen im Bad. '.repeat(8);
  const text = Array.from({ length: 12 }, (_, i) => absatz(i + 1)).join('\n\n');
  const a = teileInAbschnitte(text);
  assert.ok(a.length > 1);
  for (const x of a) assert.ok(x.length <= ZIEL_ZEICHEN + 200, `zu lang: ${x.length}`);
  for (let i = 1; i <= 12; i++) assert.ok(a.some((x) => x.includes(`Absatz ${i}.`)), `Absatz ${i} fehlt`);
  assert.ok(a[0].startsWith('Absatz 1.'));
  assert.ok(a[1].startsWith('… '));
  assert.deepEqual(teileInAbschnitte(''), []);
  assert.deepEqual(teileInAbschnitte('Kurz.'), ['Kurz.']);
});

test('Abschnitte: ein Riesenabsatz ohne Satzzeichen wird hart geteilt', () => {
  const a = teileInAbschnitte('x'.repeat(5000), 1000, 0);
  assert.equal(a.length, 5);
  assert.ok(a.every((s) => s.length === 1000));
});

test('Abschnitte: Obergrenze', () => {
  const a = teileInAbschnitte(Array.from({ length: 2000 }, (_, i) => `Satz ${i}.`).join('\n\n'), 50, 0);
  assert.equal(a.length, MAX_ABSCHNITTE);
});

test('Stapel', () => {
  assert.deepEqual(stapel([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(stapel([], 3), []);
  assert.deepEqual(stapel([1, 2], 0), [[1], [2]]);
});

test('Wissens-Notiz und sicherer Speicherpfad', () => {
  assert.equal(notizDatei('ab', 'x'.repeat(30)), null);
  assert.equal(notizDatei('Anfahrt berechnen', 'kurz'), null);
  const n = notizDatei('Anfahrt: so berechnen wir', 'Pauschal 35 € im Umkreis 20 km, darüber 0,90 € je km.');
  assert.equal(n.name, 'Wissen - Anfahrt- so berechnen wir.txt');
  assert.ok(n.inhalt.startsWith('Anfahrt: so berechnen wir\n\nPauschal'));
  assert.equal(speicherPfad('u1', 'Wissen - Größe & Maß.txt', 5), 'u1/5_Wissen_-_Grosse_Mass.txt');
});
