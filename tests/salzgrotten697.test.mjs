import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { websiteBranchen, branchenAnzahl, websiteBrancheBySlug } from '../out/branchen-web.js';

// ===========================================================================
// 16.10.2026 (Martin): „Floating- & Salzgrotten" stand doppelt — jetzt EIN
// Eintrag „Salzgrotten" in Gesundheit & Wellness. 698 -> 697 Branchen.
// ===========================================================================

test('697 Branchen, jeder Slug genau einmal', () => {
  const alle = websiteBranchen();
  assert.equal(branchenAnzahl(), 697);
  assert.equal(new Set(alle.map((b) => b.slug)).size, alle.length);
});

test('Salzgrotten: ein Eintrag in Gesundheit & Wellness, kein Floating mehr', () => {
  const s = websiteBrancheBySlug('salzgrotten');
  assert.ok(s, 'salzgrotten fehlt');
  assert.equal(s.name, 'Salzgrotten');
  assert.equal(s.kategorie, 'Gesundheit & Wellness');
  assert.equal(websiteBrancheBySlug('floating-salzgrotten'), undefined);
  assert.equal(websiteBrancheBySlug('floating-salzgrotten-gesundheit'), undefined);
  assert.equal(websiteBranchen().filter((b) => /floating/i.test(b.name + b.slug)).length, 0);
  const seo = fs.readFileSync('app/vorschau/_lib/branchen-seo.ts', 'utf8');
  assert.ok(seo.includes('"salzgrotten": {'));
  assert.doesNotMatch(seo, /floating/i);
});

test('WAECHTER: alte Adressen leiten um, feste Zahl im Footer stimmt', () => {
  const nc = fs.readFileSync('next.config.ts', 'utf8');
  assert.ok(nc.includes('source: "/branchen/floating-salzgrotten-gesundheit", destination: "/branchen/salzgrotten"'));
  assert.ok(nc.includes('source: "/branchen/floating-salzgrotten", destination: "/branchen/salzgrotten"'));
  const f = fs.readFileSync('components/Footer.tsx', 'utf8');
  const m = /Alle (\d+) Branchen/.exec(f);
  assert.ok(m, 'Footer-Zahl nicht gefunden');
  assert.equal(Number(m[1]), branchenAnzahl(), 'Footer nennt eine andere Zahl als branchenAnzahl()');
});
