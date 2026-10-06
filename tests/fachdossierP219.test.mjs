// Paket 219 (06.10.2026): Handwerk-Dossiers Welle 3
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WELLE3 = ['estrich-fliesen', 'geruestbau', 'glaserei', 'bauklempnerei-spenglerei', 'parkettleger', 'kaminkehrer',
  'pflasterbau', 'zaunbau', 'baggerbetriebe-erdbau', 'werbetechnik-schilderbau'];

test('Welle 3: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE3) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    assert.equal(baueDossier({ slug, name: slug, kategorie: 'Handwerk & Bau' }).entwurf, false, slug);
  }
});

test('Stand nach Welle 3: 30 Handwerks-Branchen mit geprüftem Text', () => {
  assert.ok(Object.keys(FACH_TEXTE).length >= 30);
});
