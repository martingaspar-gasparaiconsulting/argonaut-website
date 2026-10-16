import test from 'node:test';
import assert from 'node:assert/strict';
import { brancheModule, kategorieModule, gruenHandwerkZusatz, GRUEN_HANDWERK_MODULE } from '../out/branchenkatalog.js';

// ===========================================================================
// MO0a (16.10.2026) — Modul-Zuordnung je Kategorie
// ===========================================================================

const LAWI = 'Landwirtschaft, Garten & Forst';

test('Garten- und Landschaftsbau und Baumpflege bekommen Aufmass, Kalkulator, Wartung, Touren, Objekte', () => {
  for (const b of ['Gartenbau & Landschaftsbau', 'Garten- und Landschaftsbau', 'Baumpflege & Arboristik', 'GaLaBau Müller']) {
    assert.equal(gruenHandwerkZusatz(b), true, b);
    const set = brancheModule(LAWI, b);
    for (const m of GRUEN_HANDWERK_MODULE) assert.ok(set.includes(m), `${b}: ${m}`);
  }
});

test('Andere Landwirtschafts-Branchen bleiben unveraendert (nur additiv, kein Aufmass fuer Obsthoefe)', () => {
  assert.equal(gruenHandwerkZusatz('Obstbaubetriebe & Obsthöfe'), false);
  assert.equal(gruenHandwerkZusatz('Gartencenter & Gartenmärkte'), false);
  assert.deepEqual(brancheModule(LAWI, 'Obstbaubetriebe & Obsthöfe'), kategorieModule(LAWI));
  assert.ok(!brancheModule(LAWI, 'Obstbaubetriebe & Obsthöfe').includes('aufmass'));
});

test('Gesundheit: Kasse und Mitglieder · Sport/Beauty: Kurse · Tiere: Belegung', () => {
  const g = kategorieModule('Gesundheit & Wellness');
  assert.ok(g.includes('kasse') && g.includes('mitglieder'));
  assert.ok(kategorieModule('Sport, Beauty & Lifestyle').includes('bildung'));
  assert.ok(kategorieModule('Tiere').includes('belegung'));
});

test('Schichtplan hat jede Kategorie (steckt im Kern), keine Doppelten im Set', () => {
  for (const k of ['Handwerk & Bau', 'Tiere', 'Recht, Steuern & Finanzen', 'Gesundheit & Wellness']) {
    const set = kategorieModule(k);
    assert.ok(set.includes('schichtplan'), k);
    assert.equal(new Set(set).size, set.length, k);
  }
  const gala = brancheModule(LAWI, 'Gartenbau & Landschaftsbau');
  assert.equal(new Set(gala).size, gala.length);
});
