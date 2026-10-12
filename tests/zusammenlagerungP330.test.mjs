// Paket 330 (12.10.2026): G2c Zusammenlagerungs-Ampel nach TRGS 510 — Tabelle, Ampel je Lagerplatz, Schalter aus bis R49
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ZL_KLASSEN, TABELLE_ROH, zlKlasse, zelle, platzAmpel, konfliktText } from '../out/zusammenlagerung.js';
import { LAGERKLASSEN } from '../out/gefahrstoffLager.js';
import { startFrei } from '../out/startSperre.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Tabelle: 21 × 21, nur +, - oder Ziffer 1–8', () => {
  assert.equal(ZL_KLASSEN.length, 21);
  for (const k of ZL_KLASSEN) {
    const z = TABELLE_ROH[k].split(' ');
    assert.equal(z.length, 21, `Zeile ${k}`);
    for (const c of z) assert.match(c, /^(\+|-|[1-8])$/, `Zeile ${k}: ${c}`);
  }
});

test('Tabelle ist symmetrisch (A mit B = B mit A) — fängt Ablesefehler', () => {
  for (const a of ZL_KLASSEN) for (const b of ZL_KLASSEN) {
    assert.deepEqual(zelle(a, b), zelle(b, a), `${a} / ${b}`);
  }
});

test('Stichproben gegen das Abbild der Tabelle', () => {
  assert.deepEqual(zelle('1', '1'), { art: 'bedingt', nr: 1 });
  assert.deepEqual(zelle('2A', '2A'), { art: 'bedingt', nr: 3 });
  assert.deepEqual(zelle('3', '5.1B'), { art: 'bedingt', nr: 4 });
  assert.deepEqual(zelle('4.1B', '6.1A'), { art: 'bedingt', nr: 8 });
  assert.deepEqual(zelle('5.1B', '8A'), { art: 'bedingt', nr: 7 });
  assert.deepEqual(zelle('3', '6.1D'), { art: 'bedingt', nr: 6 });
  assert.deepEqual(zelle('6.1A', '10'), { art: 'bedingt', nr: 5 });
  assert.deepEqual(zelle('3', '3'), { art: 'erlaubt' });
  assert.deepEqual(zelle('3', '8B'), { art: 'erlaubt' });
  assert.deepEqual(zelle('8A', '12'), { art: 'erlaubt' });
  assert.deepEqual(zelle('3', '5.1A'), { art: 'getrennt' });
  assert.deepEqual(zelle('6.2', '6.2'), { art: 'erlaubt' });
  assert.deepEqual(zelle('6.2', '13'), { art: 'getrennt' });
  assert.deepEqual(zelle('7', '7'), { art: 'bedingt', nr: 1 });
  assert.deepEqual(zelle('5.2', '8A'), { art: 'getrennt' });
  assert.deepEqual(zelle('5.2', '11'), { art: 'bedingt', nr: 1 });
  // „uneingeschränkt zusammenlagerbar" untereinander: 6.1C, 6.1D, 8A, 8B, 10–13
  const frei = ['6.1C', '6.1D', '8A', '8B', '10', '11', '12', '13'];
  for (const a of frei) for (const b of frei) assert.deepEqual(zelle(a, b), { art: 'erlaubt' }, `${a}/${b}`);
});

test('Alle Lagerklassen des Verzeichnisses sind in der Tabelle', () => {
  for (const l of LAGERKLASSEN) assert.ok(zlKlasse(l.key), l.key);
  assert.equal(zlKlasse('11'), '10-13');
  assert.equal(zlKlasse(' 5.1b '), '5.1B');
  assert.equal(zlKlasse('9'), null);
  assert.equal(zlKlasse(null), null);
  assert.equal(zelle('3', null), null);
});

test('Ampel je Lagerplatz: schlechtestes Paar entscheidet, ohne Klasse wird gemeldet', () => {
  assert.equal(platzAmpel([]).stufe, 'grau');
  assert.equal(platzAmpel([{ bezeichnung: 'X' }]).stufe, 'grau');
  assert.deepEqual(platzAmpel([{ bezeichnung: 'X' }]).ohneKlasse, ['X']);
  assert.equal(platzAmpel([{ bezeichnung: 'V', lagerklasse: '3' }]).stufe, 'gruen');
  const g = platzAmpel([{ bezeichnung: 'Verdünnung', lagerklasse: '3' }, { bezeichnung: 'Reiniger', lagerklasse: '8B' }]);
  assert.equal(g.stufe, 'gruen');
  assert.equal(g.konflikte.length, 0);
  const y = platzAmpel([{ bezeichnung: 'Verdünnung', lagerklasse: '3' }, { bezeichnung: 'Kaltreiniger', lagerklasse: '10' }]);
  assert.equal(y.stufe, 'gelb');
  assert.equal(y.konflikte[0].nr, 5);
  const r = platzAmpel([
    { bezeichnung: 'Verdünnung', lagerklasse: '3' },
    { bezeichnung: 'Kaltreiniger', lagerklasse: '10' },
    { bezeichnung: 'Wasserstoffperoxid', lagerklasse: '5.1A' },
    { bezeichnung: 'Unbekannt' },
  ]);
  assert.equal(r.stufe, 'rot');
  assert.equal(r.konflikte[0].stufe, 'rot', 'rot zuerst');
  assert.equal(r.konflikte.filter((k) => k.stufe === 'rot').length, 2);
  assert.deepEqual(r.ohneKlasse, ['Unbekannt']);
  assert.equal(r.anzahl, 4);
  // rotes Paar zuerst, gelbes danach — bleibt rot
  assert.equal(platzAmpel([{ bezeichnung: 'O', lagerklasse: '5.1A' }, { bezeichnung: 'V', lagerklasse: '3' }, { bezeichnung: 'K', lagerklasse: '10' }]).stufe, 'rot');
  // gleiche Klasse zählt (Diagonale): zwei Gase 2A -> Bedingung 3
  assert.equal(platzAmpel([{ bezeichnung: 'a', lagerklasse: '2A' }, { bezeichnung: 'b', lagerklasse: '2A' }]).konflikte[0].nr, 3);
});

test('Texte: keine erfundenen Bedingungen, nur Nummer und Abschnitt', () => {
  const r = platzAmpel([{ bezeichnung: 'A', lagerklasse: '3' }, { bezeichnung: 'B', lagerklasse: '5.1A' }]);
  assert.match(konfliktText(r.konflikte[0]), /Separatlagerung erforderlich \(TRGS 510 Abschnitt 13\)/);
  const y = platzAmpel([{ bezeichnung: 'A', lagerklasse: '3' }, { bezeichnung: 'B', lagerklasse: '10' }]);
  assert.match(konfliktText(y.konflikte[0]), /Bedingung Nr\. 5 der Zusammenlagerungstabelle/);
});

test('Schalter aus bis R49, Sperr-Gedächtnis, Seite zeigt Ampel nur mit Schalter', () => {
  assert.equal(startFrei('zusammenlagerung'), false);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.zusammenlagerung = aus/);
  const s = lies('app/dashboard/nachweise/gefahrstoffe/page.tsx');
  assert.match(s, /const ZL_FREI = startFrei\('zusammenlagerung'\);/);
  assert.match(s, /ZL_FREI \? plaetzeMitAnzahl\(zeilen\)/);
  assert.match(s, /\{!ZL_FREI\s+\? <div[^>]*>\{startSperrGrund\('zusammenlagerung'\)\}/);
});
