import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pruefeVorlage, pruefeWerte, ergebnis, wertText, messAmpel, grenzeText, pdfText, FELD_TYPEN } from '../out/formularBaukasten.js';

// ===========================================================================
// MO1 Teil 1 (16.10.2026) — Feldtyp „Messwert": Einheit, Grenzen, Ampel
// ===========================================================================

const vorlage = (felder) => pruefeVorlage('Kühlkontrolle', felder);

test('Messwert ist ein Eingabe-Feldtyp', () => {
  assert.ok(FELD_TYPEN.some((t) => t.key === 'messwert' && t.eingabe));
});

test('Vorlage: Einheit und Grenzen in deutscher Schreibweise, Fehler bei Unsinn', () => {
  const r = vorlage([{ id: 'f1', typ: 'messwert', label: 'Kühlraum', einheit: '°C', min: '2', max: '7,5' }]);
  assert.deepEqual(r.fehler, []);
  assert.equal(r.felder[0].einheit, '°C');
  assert.equal(r.felder[0].min, 2);
  assert.equal(r.felder[0].max, 7.5);
  assert.match(vorlage([{ id: 'f1', typ: 'messwert', label: 'X', min: '9', max: '3' }]).fehler.join(), /untere Grenze/);
  assert.match(vorlage([{ id: 'f1', typ: 'messwert', label: 'X', max: 'abc' }]).fehler.join(), /keine gültige Zahl/);
  // ohne Grenzen erlaubt
  const o = vorlage([{ id: 'f1', typ: 'messwert', label: 'Zählerstand', einheit: 'kWh' }]);
  assert.deepEqual(o.fehler, []);
  assert.equal(o.felder[0].min, undefined);
  // Grenzen nur beim Messwert
  assert.equal(vorlage([{ id: 'f1', typ: 'text', label: 'T', min: '1' }]).felder[0].min, undefined);
});

test('Ampel: innen gruen, aussen rot, Grenzen inklusive', () => {
  const f = { id: 'f1', typ: 'messwert', label: 'K', einheit: '°C', min: 2, max: 7 };
  assert.equal(messAmpel(f, '4,5'), 'ok');
  assert.equal(messAmpel(f, '7'), 'ok');
  assert.equal(messAmpel(f, '2'), 'ok');
  assert.equal(messAmpel(f, '7,1'), 'mangel');
  assert.equal(messAmpel(f, '-1'), 'mangel');
  assert.equal(messAmpel(f, ''), 'leer');
  assert.equal(messAmpel({ ...f, min: undefined, max: undefined }, '5'), 'ohne_grenze');
  assert.equal(messAmpel({ id: 'i', typ: 'messwert', label: 'Iso', einheit: 'MΩ', min: 1 }, '0,5'), 'mangel');
});

test('Ergebnis: Messwert mit Grenze zaehlt wie Pruefpunkt, ohne Grenze nicht', () => {
  const felder = [
    { id: 'a', typ: 'messwert', label: 'K', min: 2, max: 7 },
    { id: 'b', typ: 'messwert', label: 'Zähler' },
    { id: 'c', typ: 'pruefpunkt', label: 'Tür dicht' },
  ];
  let e = ergebnis(felder, { a: '5', b: '123', c: 'io' });
  assert.equal(e.pruefpunkte, 2); assert.equal(e.gesamt, 'io');
  e = ergebnis(felder, { a: '9', b: '123', c: 'io' });
  assert.equal(e.nio, 1); assert.equal(e.gesamt, 'nio');
  e = ergebnis(felder, { c: 'io' });
  assert.equal(e.gesamt, 'offen');
});

test('Werte pruefen, Text fuer Anzeige und PDF', () => {
  const f = { id: 'a', typ: 'messwert', label: 'K', einheit: '°C', min: 2, max: 7 };
  assert.deepEqual(pruefeWerte([f], { a: '4,5' }, true), []);
  assert.match(pruefeWerte([f], { a: 'kalt' }, false).join(), /keine gültige Zahl/);
  assert.equal(wertText(f, '4,5'), '4,5 °C (Grenze 2 – 7 °C) · i. O.');
  assert.equal(wertText(f, '8'), '8 °C (Grenze 2 – 7 °C) · n. i. O.');
  assert.equal(wertText({ id: 'b', typ: 'messwert', label: 'Z', einheit: 'kWh' }, '1234,5'), '1234,5 kWh');
  assert.equal(grenzeText({ id: 'i', typ: 'messwert', label: 'Iso', einheit: 'MΩ', min: 1 }), '≥ 1 MΩ');
  assert.equal(pdfText('≥ 1 MΩ, ≤ 0,3 Ω'), '>= 1 MOhm, <= 0,3 Ohm');
});

test('WAECHTER: PDF nutzt pdfText, Seite zeigt Ampel', () => {
  const pdf = fs.readFileSync('lib/formularPdf.ts', 'utf8');
  assert.ok(pdf.includes('pdfText(wertText(f, v))'));
  const s = fs.readFileSync('app/dashboard/formulare/page.tsx', 'utf8');
  assert.ok(s.includes("case 'messwert':") && s.includes('messAmpel(feld, wert)'));
});
