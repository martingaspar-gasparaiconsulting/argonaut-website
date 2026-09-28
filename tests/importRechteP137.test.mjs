// Paket 137 (27.09.2026) — Import-Center achtet auf die Freigaben der Mitarbeiter.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { zielPfad, zielModul, importErlaubt, leseRechtStand } from '../out/importRechte.js';
import { ZIELE } from '../out/importParser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const MA = (module, schreib) => ({ chef: false, module, schreibModule: schreib });

test('Jedes Import-Ziel hat einen Bereich (sonst koennte es kein Mitarbeiter je importieren)', () => {
  const ohne = ZIELE.filter((z) => !zielModul(z.key)).map((z) => z.key);
  assert.deepEqual(ohne, []);
  assert.equal(zielModul('bestand_filiale'), 'erp');
  assert.equal(zielModul('nutzungsrechte'), 'agentur-kreativ');
  assert.equal(zielPfad('kontakte'), '/dashboard/crm/import');
  assert.equal(zielModul('kontakte'), 'crm');
});

test('Chef darf alles, auch „nur Chef"-Ziele', () => {
  const chef = { chef: true, module: [], schreibModule: null };
  // Paket 153: ausser den Zielen hinter dem Anwalt-Schalter (die sind fuer ALLE zu, siehe anwaltBlockP153)
  for (const z of ZIELE.filter((x) => !x.anwalt)) assert.deepEqual(importErlaubt(z.key, chef), { ok: true }, z.key);
});

test('Mitarbeiter: Bereich UND „darf ändern" noetig', () => {
  assert.deepEqual(importErlaubt('bestand_filiale', MA(['erp'], ['erp'])), { ok: true });
  const nurSehen = importErlaubt('bestand_filiale', MA(['erp'], []));
  assert.equal(nurSehen.ok, false);
  assert.match(nurSehen.grund, /nur ansehen/);
  const ohne = importErlaubt('bestand_filiale', MA(['crm'], ['crm']));
  assert.equal(ohne.ok, false);
  assert.match(ohne.grund, /keinen Zugriff/);
  // Schreibrecht ohne Sehrecht zaehlt nicht
  assert.equal(importErlaubt('bestand_filiale', MA([], ['erp'])).ok, false);
});

test('Ohne Spalte schreib_module gilt wie bisher der Bereich allein (niemand ausgesperrt)', () => {
  assert.deepEqual(importErlaubt('kontakte', MA(['crm'], null)), { ok: true });
  assert.equal(importErlaubt('kontakte', MA([], null)).ok, false);
});

test('„nur Chef"-Ziele bleiben fuer Mitarbeiter zu, auch mit allen Rechten', () => {
  const alles = MA(['personal', 'service', 'kasse', 'immobilien', 'einsaetze'], ['personal', 'service', 'kasse', 'immobilien', 'einsaetze']);
  for (const z of ZIELE.filter((x) => x.nurChef && !x.anwalt)) {
    const r = importErlaubt(z.key, alles);
    assert.equal(r.ok, false, z.key);
    assert.match(r.grund, /Geschäftsleitung/);
  }
});

test('Solange die Rechte laden: nichts frei; unbekanntes Ziel: nein', () => {
  assert.equal(importErlaubt('kontakte', null).ok, false);
  assert.equal(importErlaubt('gibtsnicht', { chef: true, module: [], schreibModule: null }).ok, false);
});

test('leseRechtStand ist vorsichtig', () => {
  assert.deepEqual(leseRechtStand({ module: ['crm', 3], schreib_module: ['crm'] }, true), { chef: false, module: ['crm'], schreibModule: ['crm'] });
  assert.deepEqual(leseRechtStand(null, true), { chef: false, module: [], schreibModule: [] });
  assert.deepEqual(leseRechtStand({ module: ['crm'] }, false), { chef: false, module: ['crm'], schreibModule: null });
});

test('Seite: Pruefung beim Waehlen, Importieren und Rueckgaengig', () => {
  const s = lies('app/dashboard/import/page.tsx');
  const block = (von, bis) => s.slice(s.indexOf(von), s.indexOf(bis, s.indexOf(von) + 1));
  assert.ok(block('function zielWaehlen(', '\n  }\n').includes('importErlaubt(key, rechtStand)'));
  assert.ok(block('async function importieren()', 'if (ziel.kinder)').includes('importErlaubt(ziel.key, rechtStand)'));
  assert.ok(block('async function rueckgaengig(j: Job)', 'const z = zielDef').includes('importErlaubt(j.ziel, rechtStand)'));
  assert.ok(block('async function rueckgaengigBestand(j: Job)', "setBusy('rueck')").includes('importErlaubt(j.ziel, rechtStand)'));
  assert.ok(s.includes('const bereit = bereitKatalog && recht.ok;'));
  assert.ok(s.includes("from('mitarbeiter_rechte').select('module, schreib_module')"));
});
