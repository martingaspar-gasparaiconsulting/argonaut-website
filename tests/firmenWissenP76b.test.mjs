// Paket PG Teil 2 (24.09.2026) — Firmen-Wissen mit Belegen (B14).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mischeTreffer, kontextAus, zitierteNummern, suchwoerter, besteStelle, belegeAus, markiere, REGELN_BELEGE,
} from '../out/firmenWissen.js';

const T = (id, doc, sim, content = 'Text ' + id) => ({ id, document_id: doc, similarity: sim, content });

test('mischen: beste zuerst, ohne Doppelte, Herkunft bleibt erkennbar', () => {
  const m = mischeTreffer([T('a', 'd1', 0.5), T('b', 'd1', 0.3)], [T('c', 'd2', 0.9), T('a', 'd1', 0.5)], 6);
  assert.deepEqual(m.map((x) => x.id), ['c', 'a', 'b']);
  assert.equal(m[0].team, true);
  assert.equal(m[1].team, false);
  assert.equal(mischeTreffer(Array.from({ length: 10 }, (_, i) => T('x' + i, 'd', i / 10)), [], 4).length, 4);
  assert.deepEqual(mischeTreffer(null, undefined), []);
  assert.equal(mischeTreffer([{ id: 'k', document_id: 'd', content: 'x', similarity: NaN }], []).length, 0);
});

test('Kontext nummeriert mit Dateinamen', () => {
  const k = kontextAus([T('a', 'd1', 1, 'Urlaub beantragen'), T('b', 'd2', 1, 'Anfahrt')], { d1: 'Handbuch.pdf' });
  assert.match(k, /^\[1\] Datei: Handbuch\.pdf\nUrlaub beantragen/);
  assert.match(k, /\[2\] Datei: Unbekannt\nAnfahrt/);
});

test('zitierte Nummern lesen, fremde verwerfen', () => {
  assert.deepEqual(zitierteNummern('A [2]. B [1][3]. C [2, 4]. D [9]', 4), [1, 2, 3, 4]);
  assert.deepEqual(zitierteNummern('keine Belege', 3), []);
  assert.deepEqual(zitierteNummern('Datum [2026] und [0]', 5), []);
});

test('Suchwoerter ohne Fuellwoerter', () => {
  assert.deepEqual(suchwoerter('Wie beantrage ich Urlaub bei uns?'), ['beantrage', 'urlaub']);
  assert.deepEqual(suchwoerter(''), []);
});

test('beste Textstelle: der passende Satz, mit Auslassungszeichen', () => {
  const lang = 'Einleitung zum Handbuch. '.repeat(10) + 'Urlaub wird im Portal beantragt und vom Chef bestätigt. ' + 'Schluss mit Grüßen. '.repeat(10);
  const s = besteStelle(lang, 'Wie beantrage ich Urlaub?', 120);
  assert.match(s, /Urlaub wird im Portal beantragt/);
  assert.ok(s.startsWith('… '));
  assert.ok(s.length <= 130);
  assert.equal(besteStelle('Kurz.', 'x'), 'Kurz.');
});

test('Belege: nur zitierte, sonst alle; Team-Kennzeichen', () => {
  const tr = mischeTreffer([T('a', 'd1', 0.8, 'Anfahrt wird pauschal berechnet.')], [T('b', 'd2', 0.9, 'Urlaub im Portal.')]);
  const namen = { d1: 'Preise.pdf', d2: 'Handbuch.pdf' };
  const b = belegeAus(tr, namen, 'Urlaub geht übers Portal [1].', 'Urlaub');
  assert.equal(b.length, 1);
  assert.deepEqual({ nr: b[0].nr, datei: b[0].datei, team: b[0].team }, { nr: 1, datei: 'Handbuch.pdf', team: true });
  assert.equal(belegeAus(tr, namen, 'ohne Nummern', 'x').length, 2);
  assert.equal(belegeAus([], namen, 'Nichts [1]', 'x').length, 0);
});

test('markieren: Suchwoerter hervorgehoben, Text vollstaendig', () => {
  const m = markiere('Urlaub wird im Portal beantragt.', 'Urlaub beantragen Portal');
  assert.equal(m.map((x) => x.t).join(''), 'Urlaub wird im Portal beantragt.');
  assert.deepEqual(m.filter((x) => x.hit).map((x) => x.t), ['Urlaub', 'Portal']);
  assert.deepEqual(markiere('abc', ''), [{ t: 'abc', hit: false }]);
  assert.deepEqual(markiere('a (b) c', '(b)'), [{ t: 'a (b) c', hit: false }]);
});

test('Regel fuer die KI verlangt Belege und verbietet Erfinden', () => {
  assert.match(REGELN_BELEGE, /\[1\]/);
  assert.match(REGELN_BELEGE, /erfinde nichts/);
});

import { sensiblerName } from '../out/firmenWissen.js';

test('vertraulich klingende Dateinamen werden erkannt', () => {
  assert.equal(sensiblerName('Arbeitsvertrag_Mueller.pdf'), 'Vertrag');
  assert.equal(sensiblerName('Lohnliste-2026.xlsx'), 'Lohn/Gehalt');
  assert.equal(sensiblerName('Kontoauszug Mai.pdf'), 'Bank/Finanzen');
  assert.equal(sensiblerName('Steuerbescheid 2025.pdf'), 'Steuer/Buchhaltung');
  assert.equal(sensiblerName('Zeugnis_Brenner.docx'), 'Personalsache');
  assert.equal(sensiblerName('Zugangsdaten WLAN.txt'), 'Zugangsdaten');
  assert.equal(sensiblerName('Firmenhandbuch.pdf'), null);
  assert.equal(sensiblerName('Arbeitsanweisung Silikonfuge.pdf'), null);
  assert.equal(sensiblerName('Preisliste 2026.pdf'), null);
  assert.equal(sensiblerName('Sicherheitsregeln Baustelle.pdf'), null);
});
