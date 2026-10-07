// ARGONAUT OS · tests/argonautZeichenL1.test.mjs
// Logo-Tausch L1 (07.10.2026): das neue Segel-A-Zeichen.
// Prueft, dass der Pfad so gebaut ist, wie ihn sowohl SVG als auch der
// jsPDF-Zeichner im Zertifikat (lib/onboardingZertifikat.ts) erwarten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZEICHEN_PFAD, ZEICHEN_VERHAELTNIS } from '../out/argonautZeichen.js';

const teile = ZEICHEN_PFAD.match(/[MLCZ][^MLCZ]*/g) || [];
const zahlen = (t) => (t.slice(1).match(/-?\d*\.?\d+/g) || []).map(Number);

test('nur absolute Befehle M, C, Z (das versteht der PDF-Zeichner)', () => {
  assert.equal(/[^MCZ0-9.\s-]/.test(ZEICHEN_PFAD), false);
  assert.ok(teile.length > 20);
});

test('vier Teilflaechen: oben/unten je links und rechts der Mittelfuge', () => {
  assert.equal(teile.filter((t) => t[0] === 'M').length, 4);
  assert.equal(teile.filter((t) => t[0] === 'Z').length, 4);
});

test('jedes M hat genau einen Punkt, jedes C volle Sechsergruppen', () => {
  for (const t of teile) {
    if (t[0] === 'M') assert.equal(zahlen(t).length, 2, t);
    if (t[0] === 'C') assert.equal(zahlen(t).length % 6, 0, t.slice(0, 40));
  }
});

test('auf Hoehe 1 normiert, Breite = ZEICHEN_VERHAELTNIS', () => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of teile) {
    const z = zahlen(t);
    for (let i = 0; i + 1 < z.length; i += 2) {
      minX = Math.min(minX, z[i]); maxX = Math.max(maxX, z[i]);
      minY = Math.min(minY, z[i + 1]); maxY = Math.max(maxY, z[i + 1]);
    }
  }
  assert.ok(minX > -0.01 && minY > -0.01, `min ${minX} ${minY}`);
  assert.ok(Math.abs(maxY - 1) < 0.01, `maxY ${maxY}`);
  assert.ok(Math.abs(maxX - ZEICHEN_VERHAELTNIS) < 0.01, `maxX ${maxX}`);
  assert.ok(ZEICHEN_VERHAELTNIS > 1.3 && ZEICHEN_VERHAELTNIS < 1.45);
});

test('Mittelfuge ist frei: keine Flaeche ueberquert die senkrechte Mitte', () => {
  const mitte = ZEICHEN_VERHAELTNIS / 2;
  let flaeche = [];
  const seiten = [];
  for (const t of teile) {
    if (t[0] === 'M') flaeche = [];
    const z = zahlen(t);
    for (let i = 0; i < z.length; i += 2) flaeche.push(z[i]);
    if (t[0] === 'Z') {
      const links = flaeche.every((x) => x < mitte);
      const rechts = flaeche.every((x) => x > mitte - 0.02);
      assert.ok(links || rechts, 'Teilflaeche ueberquert die Mitte');
      seiten.push(links ? 'L' : 'R');
    }
  }
  assert.deepEqual(seiten.sort(), ['L', 'L', 'R', 'R']);
});

// ---- L1 Teil 2: zeichenSvg fuer HTML-Texte (Dossier, E-Book, Abmeldeseite) ----
import { zeichenSvg } from '../out/argonautZeichen.js';

test('zeichenSvg: Breite folgt dem Verhaeltnis, Pfad ist drin', () => {
  const s = zeichenSvg(20);
  assert.match(s, /^<svg [^>]*width="27\.4" height="20"/);
  assert.ok(s.includes(ZEICHEN_PFAD));
  assert.match(s, /fill="#C9A84C"/);
});

test('zeichenSvg: unsichere Farbe/Stil werden nicht durchgereicht', () => {
  const s = zeichenSvg(10, '"><script>x</script>', 'a"b<c>');
  assert.equal(s.includes('<script'), false);
  assert.match(s, /fill="#C9A84C"/);
  assert.match(s, /style="abc"/);
});

test('zeichenSvg: Unsinns-Hoehe faellt auf 24 zurueck', () => {
  assert.match(zeichenSvg(NaN), /height="24"/);
  assert.match(zeichenSvg(-5), /height="24"/);
});
