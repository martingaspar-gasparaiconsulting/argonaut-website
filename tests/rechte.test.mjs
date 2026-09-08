import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NAV_LINKS, MODUL_PFAD, MODUL_PFADE, MITARBEITER_ERLAUBT,
  mitarbeiterDarf, istNurChefPfad, pfadPasst,
} from '../out/rechte.js';

test('das Akquise-Cockpit steht genau einmal im Menü', () => {
  const treffer = NAV_LINKS.filter((l) => l.href === '/dashboard/akquise');
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].immer, true);
  assert.equal(treffer[0].modul, undefined, 'kein Modul-Schlüssel — sonst überschreibt er MODUL_PFAD');
});

test('das Akquise-Cockpit überschreibt keinen bestehenden Modul-Pfad', () => {
  assert.equal(MODUL_PFAD['leads'], '/dashboard/leads');
});

test('jeder darf sein eigenes Cockpit öffnen', () => {
  assert.ok(MITARBEITER_ERLAUBT.includes('/dashboard/akquise'));
  assert.equal(mitarbeiterDarf('/dashboard/akquise', []), true);
  assert.equal(istNurChefPfad('/dashboard/akquise'), false);
});

test('geteilte Modul-Schlüssel: JEDER Pfad zählt, nicht nur der letzte', () => {
  // Der Fund vom 08.09.26: 'provisionen' hängt an zwei Knöpfen.
  const pfade = MODUL_PFADE['provisionen'] || [];
  assert.ok(pfade.length >= 2, 'Erwartet mindestens zwei Pfade für provisionen');
  assert.ok(pfade.includes('/dashboard/provisionen'));
  assert.ok(pfade.includes('/dashboard/partner'));
  assert.equal(mitarbeiterDarf('/dashboard/provisionen', ['provisionen']), true);
  assert.equal(mitarbeiterDarf('/dashboard/partner', ['provisionen']), true);
});

test('MODUL_PFADE deckt jeden Modul-Schlüssel ab', () => {
  for (const l of NAV_LINKS) {
    if (!l.modul) continue;
    assert.ok((MODUL_PFADE[l.modul] || []).includes(l.href), `${l.modul} → ${l.href} fehlt`);
  }
});

test('ohne Recht bleibt zu, was zu bleiben hat', () => {
  assert.equal(mitarbeiterDarf('/dashboard/provisionen', []), false);
  assert.equal(mitarbeiterDarf('/dashboard/finanzen', []), false);
});

test('Präfix-Treffer bleiben scharf abgegrenzt', () => {
  assert.equal(pfadPasst('/dashboard/akquise/x', '/dashboard/akquise'), true);
  assert.equal(pfadPasst('/dashboard/akquisexyz', '/dashboard/akquise'), false);
});
