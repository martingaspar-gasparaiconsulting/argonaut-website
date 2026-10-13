// Paket 326 (12.10.2026): S2 Gefahr-Angaben im Shop anzeigen — nur bestätigt, nur nach Freigabe, immer deutsch
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gefahrFuerShop } from '../out/shopGefahr.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SHOP = lies('public/shop.js');

const BESTAETIGT = { status: 'bestaetigt', piktogramme: ['GHS02'], signalwort: 'Gefahr', h_saetze: [{ code: 'H225', text: 'Flüssigkeit und Dampf leicht entzündbar.' }], p_saetze: [{ code: 'P210', text: 'Von Hitze fernhalten.' }], un_nummer: 'UN 1993', ufi: null, keine_kennzeichnung: false };

test('Shop bekommt Angaben nur bestätigt und nur nach Freigabe', () => {
  assert.equal(gefahrFuerShop(BESTAETIGT, false), null, 'Schalter aus');
  assert.equal(gefahrFuerShop({ ...BESTAETIGT, status: 'vorschlag' }, true), null, 'nur Vorschlag');
  assert.equal(gefahrFuerShop(null, true), null);
  assert.equal(gefahrFuerShop({ status: 'bestaetigt', keine_kennzeichnung: true, un_nummer: 'UN 1993' }, true), null, 'nicht kennzeichnungspflichtig');
  const g = gefahrFuerShop(BESTAETIGT, true);
  assert.deepEqual(g.piktogramme, [{ key: 'GHS02', label: 'Flamme' }]);
  assert.equal(g.signalwort, 'Gefahr');
  assert.equal(g.h[0].code, 'H225');
  assert.equal(g.p[0].code, 'P210');
  assert.equal(g.un, 'UN 1993');
  // ungültige Codes aus der Datenbank kommen nie durch
  assert.equal(gefahrFuerShop({ ...BESTAETIGT, h_saetze: [{ code: '<script>', text: 'x' }, { code: 'H225', text: 'y' }] }, true).h.length, 1);
});

test('Schnittstelle: Schalter, nur bestätigte, eigener Betrieb, fail-soft', () => {
  const r = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(r, /const gefahrFrei = startFrei\('gefahrstoffShop', freigabe\);/);
  assert.match(r, /if \(gefahrFrei && rows\.length\)/);
  assert.match(r, /\.eq\('owner_user_id', inh\.owner_user_id as string\)\.eq\('status', 'bestaetigt'\)/);
  assert.match(r, /if \(!gzFehler\)/);
  assert.match(r, /gefahrFuerShop\(gefahrJe\[id\]/);
});

test('shop.js: am Produkt und vor dem Bestellknopf, deutsch, alles maskiert', () => {
  assert.match(SHOP, /\+ gefahrHtml\(p\)\n\s+\+ doks\(p\)/);
  const kasse = SHOP.indexOf('h += gefahrKasse(w);');
  const form = SHOP.indexOf("h += '<form class=\"ao-wk-kasse\" novalidate>'");
  assert.ok(kasse > 0 && form > kasse, 'Hinweise vor dem Formular mit dem Bestellknopf');
  assert.match(SHOP, /<div class="ao-gefahr" lang="de" dir="ltr">/);
  assert.match(SHOP, /<div class="ao-gefahr-kasse" lang="de" dir="ltr">/);
  assert.match(SHOP, /esc\(g\.h\[i\]\.code\) \+ '<\/b> ' \+ esc\(g\.h\[i\]\.text\)/);
  assert.match(SHOP, /esc\(g\.p\[i\]\.code\) \+ '<\/b> ' \+ esc\(g\.p\[i\]\.text\)/);
  assert.match(SHOP, /esc\(g\.signalwort\)/);
  assert.match(lies('lib/webBloecke.ts'), /\.ao-gefahr\{/);
});
