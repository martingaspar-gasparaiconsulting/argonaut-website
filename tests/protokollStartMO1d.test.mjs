import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { protokollLink, leseStartObjekt, etikettHtml, NORM_VORLAGEN, normZuVorlage } from '../out/protokollStart.js';
import { pruefeVorlage, ergebnis } from '../out/formularBaukasten.js';
import { PRUEF_NORMEN } from '../out/pruefungen.js';

// ===========================================================================
// MO1 Teil 4 (16.10.2026) — QR am Objekt startet das Protokoll,
// Norm-Startvorlagen aus PRUEF_NORMEN
// ===========================================================================

const ID = 'AAAAAAAA-1111-4111-8111-111111111111';

test('QR-Link nur zur eigenen Adresse und mit echter ID', () => {
  assert.equal(protokollLink('https://argonaut-os.com/', 'fahrzeug', ID), 'https://argonaut-os.com/dashboard/formulare?objekt=fahrzeug:aaaaaaaa-1111-4111-8111-111111111111');
  assert.equal(protokollLink('https://argonaut-os.com', 'rechnung', ID), null);
  assert.equal(protokollLink('https://argonaut-os.com', 'fahrzeug', '1; drop'), null);
  assert.equal(protokollLink('javascript:alert(1)', 'fahrzeug', ID), null);
  assert.equal(protokollLink('https://a.de/pfad', 'fahrzeug', ID), null);
});

test('Start-Objekt aus der Adresse: Hin und zurueck, Unsinn wird ignoriert', () => {
  const link = protokollLink('https://argonaut-os.com', 'anlage', ID);
  assert.deepEqual(leseStartObjekt(new URL(link).search), { typ: 'anlage', id: ID.toLowerCase() });
  assert.equal(leseStartObjekt('?objekt=anlage:kaputt'), null);
  assert.equal(leseStartObjekt('?objekt=konto:' + ID), null);
  assert.equal(leseStartObjekt('?objekt=anlage:' + ID + ':x'), null);
  assert.equal(leseStartObjekt(''), null);
  assert.equal(leseStartObjekt(null), null);
});

test('Etikett maskiert den Titel und nimmt nur ein SVG', () => {
  const h = etikettHtml('<b>Leiter 3</b>', '<svg viewBox="0 0 1 1"></svg>');
  assert.match(h, /&lt;b&gt;Leiter 3&lt;\/b&gt;/);
  assert.match(h, /<svg viewBox/);
  assert.doesNotMatch(etikettHtml('X', '<script>alert(1)</script>'), /<script>/);
});

test('Jede Norm wird eine gueltige Vorlage mit Intervall', () => {
  assert.equal(NORM_VORLAGEN.length, PRUEF_NORMEN.length);
  for (const v of NORM_VORLAGEN) {
    const r = pruefeVorlage(v.titel, v.felder);
    assert.deepEqual(r.fehler, [], v.key);
    assert.equal(r.felder.length, v.felder.length, 'nichts abgeschnitten ' + v.key);
    for (const f of v.felder) assert.ok(f.label.length <= 200, 'Beschriftung zu lang ' + v.key);
    assert.ok(v.intervall_monate >= 1 && v.intervall_monate <= 120);
    assert.equal(v.kategorie, 'pruefung');
    assert.match(v.felder[0].label, /Startwerte/);
  }
});

test('Messungen kommen mit Einheit und Grenzwert, zaehlen ins Ergebnis', () => {
  const n = PRUEF_NORMEN.find((x) => x.key === 'elektro_ortsveraenderlich');
  const v = normZuVorlage(n);
  const iso = v.felder.find((f) => f.label === 'Isolationswiderstand');
  assert.equal(iso.typ, 'messwert');
  assert.equal(iso.einheit, 'MΩ');
  assert.equal(typeof iso.min, 'number');
  const werte = {};
  for (const f of v.felder) if (f.typ === 'pruefpunkt') werte[f.id] = 'io';
  werte[iso.id] = '0,1';
  assert.equal(ergebnis(v.felder, werte).gesamt, 'nio', 'Isolation unter Grenze -> n. i. O.');
});

test('Waechter: Formularseite liest den Start-Link und bietet die Norm-Vorlagen an', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/formulare/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /leseStartObjekt\(/);
  assert.match(seite, /NORM_VORLAGEN/);
  assert.match(seite, /protokollLink\(/);
});
