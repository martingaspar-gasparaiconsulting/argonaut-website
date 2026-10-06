// Paket 218 (06.10.2026): Handwerk-Dossiers Welle 2 — jede Branche eigenständig
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WELLE2 = ['zimmerei-holzbau', 'trockenbau-innenausbau', 'maurer-betonbauer', 'fensterbau-bauelemente', 'schlosserei',
  'kaelteanlagenbau', 'rollladen-sonnenschutz', 'stuckateur-fassadenbau', 'bodenleger-raumausstatter', 'haustechnik-gebaeudeautomation'];

test('Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE2) {
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

test('Jede Branche eigenständig: Titel, Rolle und Beispiel-Auftrag nie doppelt', () => {
  const alle = Object.values(FACH_TEXTE);
  for (const feld of ['titel', 'rolle', 'ablaufTitel', 'lead']) {
    const werte = alle.map((t) => t[feld]);
    assert.equal(new Set(werte).size, werte.length, feld + ' doppelt');
  }
  // Schwerpunkt-Titel dürfen sich bei eng verwandten Gewerken gleichen (Maler/Fliesen), sonst nicht
  for (const slug of WELLE2) {
    const eigene = FACH_TEXTE[slug].alltag.filter((a) => a.titel !== 'Die E-Rechnung kommt');
    assert.equal(eigene.length, 5, slug + ': fünf eigene Alltags-Karten');
  }
});
