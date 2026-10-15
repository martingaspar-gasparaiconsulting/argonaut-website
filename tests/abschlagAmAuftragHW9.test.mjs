import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { abschlagAusAuftrag, leistungsstandLesen, rechnungsartLesen, gueltigeAbschlaege, abschlaegeNetto } from '../out/rechnungAusAuftrag.js';
import { doppelWarnung } from '../out/doppelabrechnung.js';

// ===========================================================================
// HW-9 (15.10.2026) — Abschlags- und Schlussrechnung direkt am Auftrag
// ===========================================================================

const pos = [
  { position: 1, bezeichnung: 'Fliesen verlegen', menge: 40, einzelpreis: 55, mwst_satz: 19 },
  { position: 2, bezeichnung: 'Material', menge: 1, einzelpreis: 1000, mwst_satz: 19 },
];

test('Abschlag 40 %: jede Position mit Anteil, Summen je Satz', () => {
  const a = abschlagAusAuftrag(pos, 40);
  assert.equal(a.auftragNetto, 3200);
  assert.equal(a.posten.length, 2);
  assert.equal(a.posten[0].gesamt_netto, 880);
  assert.equal(a.posten[1].gesamt_netto, 400);
  assert.match(a.posten[0].bezeichnung, /Pos\. 1 Fliesen verlegen – Leistungsstand 40 %/);
  assert.equal(a.summen.netto, 1280);
  assert.equal(a.summen.mwst, 243.2);
  assert.equal(a.summen.brutto, 1523.2);
});

test('Abschlag behaelt den Steuersatz je Position (auch 0 %)', () => {
  const a = abschlagAusAuftrag([{ menge: 1, einzelpreis: 1000, mwst_satz: 0 }, { menge: 1, einzelpreis: 1000, mwst_satz: 19 }], 50);
  assert.deepEqual(a.posten.map((p) => p.mwst_satz), [0, 19]);
  assert.equal(a.summen.mwst, 95);
});

test('Leistungsstand: 0 < p <= 100, deutsches Komma', () => {
  assert.equal(leistungsstandLesen('40'), 40);
  assert.equal(leistungsstandLesen('33,5'), 33.5);
  for (const v of ['0', '-5', '101', '', 'abc', null]) assert.equal(leistungsstandLesen(v), null, String(v));
});

test('Rechnungsart: nur normal | abschlag | schluss', () => {
  assert.equal(rechnungsartLesen('abschlag'), 'abschlag');
  assert.equal(rechnungsartLesen('schluss'), 'schluss');
  assert.equal(rechnungsartLesen('irgendwas'), 'normal');
});

test('Bisherige Abschlaege: stornierte zaehlen nicht', () => {
  const rows = [
    { id: 'a', rechnungsart: 'abschlag', zahlungsstatus: 'bezahlt', netto_summe: 1000 },
    { id: 'b', rechnungsart: 'abschlag', zahlungsstatus: 'storniert', netto_summe: 500 },
    { id: 'c', rechnungsart: 'normal', zahlungsstatus: 'offen', netto_summe: 9999 },
  ];
  assert.equal(gueltigeAbschlaege(rows).length, 1);
  assert.equal(abschlaegeNetto(rows), 1000);
});

test('HW-8 + HW-9: Abschlaege stoeren Abschlag/Schluss nicht, eine Endrechnung schon', () => {
  const nurAbschlag = [{ rechnungsnummer: 'RE-1', rechnungsart: 'abschlag', zahlungsstatus: 'bezahlt' }];
  assert.equal(doppelWarnung(nurAbschlag, 'x', 'abschlag'), null);
  assert.equal(doppelWarnung(nurAbschlag, 'x', 'schluss'), null);
  assert.notEqual(doppelWarnung(nurAbschlag, 'x', 'normal'), null, 'volle Rechnung neben Abschlag warnt');
  const mitEnde = [...nurAbschlag, { rechnungsnummer: 'RE-2', rechnungsart: 'schluss', zahlungsstatus: 'offen' }];
  assert.notEqual(doppelWarnung(mitEnde, 'x', 'abschlag'), null);
  assert.notEqual(doppelWarnung(mitEnde, 'x', 'schluss'), null);
});

test('Waechter: Route setzt Abschlaege in der Schlussrechnung ab und deckelt die Summe', () => {
  const src = fs.readFileSync('app/api/rechnung-aus-auftrag/route.ts', 'utf8');
  assert.match(src, /from\("rechnung_abschlaege"\)\.insert/);
  assert.match(src, /rechnungsart: art/);
  assert.match(src, /bisher \+ ab\.summen\.netto > voll\.summen\.netto/);
  assert.match(src, /doppelWarnung\(andere, "diesem Auftrag", art\)/);
});

test('Waechter: Auftragsseite hat Abschlag- und Schluss-Knopf', () => {
  const src = fs.readFileSync('app/dashboard/auftraege/[id]/page.tsx', 'utf8');
  assert.match(src, /rechnungOeffnen\("abschlag"\)/);
  assert.match(src, /rechnungOeffnen\("schluss"\)/);
});
