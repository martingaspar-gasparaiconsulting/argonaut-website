// ============================================================================
// tests/fotoMarkierungP213.test.mjs — Paket 213 (Stufe 3 · B6b Foto-Markierung)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  zielGroesse, strichstaerke, schriftgroesse, aufBild, pfeilspitze, ellipse, formGueltig, textSaeubern,
  markiertName, markiertPfad, MAX_KANTE, MAX_TEXT,
} from '../out/fotoMarkierung.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Zielgröße: verkleinert große Handyfotos, vergrößert nie', () => {
  assert.deepEqual(zielGroesse(4000, 3000), { breite: MAX_KANTE, hoehe: 1800, faktor: 0.6 });
  assert.deepEqual(zielGroesse(3000, 4000), { breite: 1800, hoehe: MAX_KANTE, faktor: 0.6 });
  assert.deepEqual(zielGroesse(800, 600), { breite: 800, hoehe: 600, faktor: 1 });
  assert.equal(zielGroesse(0, 0).breite, 1);
});

test('Strich- und Schriftgröße wachsen mit dem Bild', () => {
  assert.equal(strichstaerke(2400, 1800), 11);
  assert.equal(strichstaerke(300, 200), 3);
  assert.equal(schriftgroesse(2400, 1800), 86);
  assert.equal(schriftgroesse(200, 100), 16);
});

test('Bildschirm → Bild-Koordinaten, am Rand begrenzt', () => {
  const bild = { breite: 2400, hoehe: 1800 };
  assert.deepEqual(aufBild({ x: 300, y: 225 }, { breite: 600, hoehe: 450 }, bild), { x: 1200, y: 900 });
  assert.deepEqual(aufBild({ x: -10, y: 999 }, { breite: 600, hoehe: 450 }, bild), { x: 0, y: 1800 });
});

test('Pfeilspitze liegt hinter der Spitze, symmetrisch', () => {
  const [a, b] = pfeilspitze({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 30);
  assert.ok(a.x < 100 && b.x < 100);
  assert.equal(a.x, b.x);
  assert.equal(a.y, -b.y);
  assert.equal(Math.round(Math.hypot(100 - a.x, a.y)), 20);
});

test('Ellipse aus zwei Ecken', () => {
  assert.deepEqual(ellipse({ x: 10, y: 20 }, { x: 110, y: 80 }), { cx: 60, cy: 50, rx: 50, ry: 30 });
  assert.deepEqual(ellipse({ x: 110, y: 80 }, { x: 10, y: 20 }), { cx: 60, cy: 50, rx: 50, ry: 30 });
});

test('Versehentliches Tippen wird verworfen, Text gesäubert', () => {
  assert.equal(formGueltig({ art: 'pfeil', farbe: 'rot', von: { x: 0, y: 0 }, bis: { x: 3, y: 3 } }), false);
  assert.equal(formGueltig({ art: 'kreis', farbe: 'rot', von: { x: 0, y: 0 }, bis: { x: 30, y: 3 } }), true);
  assert.equal(formGueltig({ art: 'stift', farbe: 'rot', punkte: [{ x: 1, y: 1 }] }), false);
  assert.equal(formGueltig({ art: 'text', farbe: 'rot', bei: { x: 1, y: 1 }, text: '   ' }), false);
  assert.equal(textSaeubern('  Riss\n  in   Fuge \u0007 '), 'Riss in Fuge');
  assert.equal(textSaeubern('x'.repeat(200)).length, MAX_TEXT);
});

test('Markierte Fassung: eigener Name und Pfad, Original bleibt', () => {
  assert.equal(markiertName('IMG_2041.JPG'), 'IMG_2041-markiert.jpg');
  assert.equal(markiertName('Wand Nord-markiert.jpg'), 'Wand Nord-markiert.jpg');
  assert.equal(markiertName(null), 'foto-markiert.jpg');
  assert.equal(markiertName('../../böse<>.png'), '.._.._böse__-markiert.jpg');
  const orig = 'b1/e1/1791200000000.jpg';
  const neu = markiertPfad(orig, 1791209999999);
  assert.equal(neu, 'b1/e1/1791209999999-markiert.jpg');
  assert.notEqual(neu, orig);
  assert.equal(markiertPfad('nur.jpg', 1), null);
  assert.equal(markiertPfad('b1/../x.jpg', 1), null);
});

test('Verdrahtung: Original wird nicht überschrieben, Fehler räumt auf', () => {
  const s = lies('app/dashboard/bautagebuch/page.tsx');
  assert.match(s, /storage\.from\('baustellen-fotos'\)\.download\(f\.pfad\)/);
  assert.match(s, /upload\(pfad, jpeg, \{ upsert: false, contentType: 'image\/jpeg' \}\)/);
  assert.match(s, /remove\(\[pfad\]\)/);
  assert.match(s, /<FotoMarkierung quelle=/);
  const k = lies('app/dashboard/bautagebuch/FotoMarkierung.tsx');
  assert.match(k, /touchAction: 'none'/);
  assert.match(k, /toBlob\(res, 'image\/jpeg', 0\.9\)/);
});
