// Paket 324 (11.10.2026): S4 Shop mehrsprachig Teil 2 — Schaufenster, Bestellung, Mail
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { TEXT_DE, TEXT_KEYS, mailTexte, fuellen, bestellSprache, platzhalter } from '../out/shopSprachen.js';
import { shopDokumente } from '../out/produktDokumente.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SHOP = lies('public/shop.js');

test('shop.js: deutscher Rückfall entspricht genau TEXT_DE', () => {
  const m = /var DE = (\{[\s\S]*?\n  \});/.exec(SHOP);
  assert.ok(m, 'DE-Wörterbuch fehlt');
  const de = JSON.parse(JSON.stringify(vm.runInNewContext('(' + m[1] + ')')));
  assert.deepEqual(de, { ...TEXT_DE });
});

test('shop.js: jeder benutzte Text-Schlüssel existiert', () => {
  const keys = new Set();
  for (const m of SHOP.matchAll(/\bTH?\(\s*(?:konto \? )?'([a-z_]+)'(?!\s*\+)(?: : '([a-z_]+)')?/g)) { keys.add(m[1]); if (m[2]) keys.add(m[2]); }
  for (const m of SHOP.matchAll(/kontoHinweis = '([a-z_]+)'/g)) keys.add(m[1]);
  assert.ok(keys.size >= 40, 'zu wenige Schlüssel gefunden: ' + keys.size);
  const fehlt = [...keys].filter((k) => !TEXT_KEYS.includes(k));
  assert.deepEqual(fehlt, []);
  // Dokument-Arten: dok_<art_key> für jede Art
  for (const a of ['sdb', 'tdb', 'leistungserklaerung', 'konformitaet', 'spezifikation', 'zertifikat', 'anleitung', 'sonstiges']) assert.ok(TEXT_KEYS.includes('dok_' + a), a);
});

test('shop.js: Platzhalter mit Schrägstrich ({/link}), Sprache an der Bestellung, Zahlen westlich, Richtung', () => {
  assert.equal((SHOP.match(/t\.replace\(\/\\\{\(\\\/\?\[a-z_\]\+\)\\\}\/g/g) || []).length, 2);
  assert.match(SHOP, /firma_hp: '', sprache: sprache \}/);
  assert.match(SHOP, /'-u-nu-latn'/);
  assert.match(SHOP, /T\('dok_' \+ x\.art_key\)/);
  assert.match(SHOP, /setAttribute\('dir', rtl \? 'rtl' : 'ltr'\)/);
  assert.match(SHOP, /if \(sprache !== 'de'\) h \+= '<div class="ao-wk-rechtshinweis">' \+ TH\('rechtstexte'\)/);
  assert.match(SHOP, /if \(!sprachen \|\| sprachen\.length < 2\) return;/);
  // keine festen deutschen Kundentexte mehr außerhalb des Wörterbuchs
  const ohneDe = SHOP.replace(/var DE = \{[\s\S]*?\n  \};/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const w of ['Warenkorb öffnen', 'Zahlungspflichtig bestellen', 'In den Warenkorb', 'Bitte Ihren Namen', 'inkl. MwSt', 'Mindestmenge ']) {
    assert.ok(!ohneDe.includes(w), 'fest im Code: ' + w);
  }
});

test('Schnittstelle: Sprache nur aus den angebotenen, Texte nur freigegeben, Dokumente sortiert', () => {
  const r = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(r, /const angeboten = angeboteneSprachen\(sprachZeilen\);/);
  assert.match(r, /waehleSprache\(url\.searchParams\.get\('sprache'\), hl, angeboten\)/);
  assert.match(r, /\.eq\('sprache', sprache\)\.eq\('status', 'freigegeben'\)/);
  assert.match(r, /produktText\(\{ name: r\.bezeichnung, beschreibung: r\.shop_beschreibung \}, ueJe\[r\.id\]\)/);
  assert.match(r, /dokumente: shopDokumente\(dokJe\[r\.id\] \?\? \[\], heute, sprache\)/);
  assert.match(r, /\.eq\('owner_user_id', inh\.owner_user_id as string\)\.eq\('sprache', sprache\)/);
  // Preise bleiben unberührt
  assert.match(r, /preis: endkundenPreis\(r\.verkaufspreis, r\.shop_mwst, basis\)/);
});

test('Bestellung: Sprache geprüft gespeichert, ohne Spalte trotzdem gespeichert, Mail je Sprache', () => {
  const r = lies('app/api/oeffentlich/shop-bestellung/route.ts');
  assert.match(r, /const kSprache = bestellSprache\(b\.sprache\);/);
  assert.match(r, /if \(insErr && kSprache\) \{\s+delete zeile\.sprache;/);
  assert.match(r, /const m = mailTexte\(kSprache\);/);
  assert.match(r, /const summenZeilen = summenIn\(mailTexte\('de'\), null\);/);
  assert.equal(bestellSprache('EN'), 'en');
  assert.equal(bestellSprache('de'), null);
  assert.equal(bestellSprache('xx'), null);
  assert.equal(bestellSprache('<script>'), null);
});

test('Mail-Texte: Englisch fest, sonst Deutsch, Platzhalter gleich', () => {
  const de = mailTexte('de'), en = mailTexte('en');
  assert.equal(mailTexte('fr'), de);
  assert.equal(mailTexte(null), de);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const k of Object.keys(de)) assert.equal(platzhalter(en[k]).join(' '), platzhalter(de[k]).join(' '), k);
  assert.equal(fuellen(en.betreffBei, { firma: 'Chemie GmbH' }), 'Your order with Chemie GmbH');
  assert.equal(fuellen(de.aufRechnung, { n: 30 }), 'auf Rechnung (30 Tage)');
  assert.equal(fuellen('{x} {n}', { n: 1 }), '{x} 1');
  assert.equal(de.anredeName, 'Guten Tag {name},');
});

test('Produkt-Dokumente: Art-Schlüssel, Titel und Version für den Namen in Kundensprache', () => {
  const s = shopDokumente([{ id: '1', art: 'sdb', sprache: 'en', version: ' 3.1 ', im_shop: true, aktuell: true }, { id: '2', art: 'quatsch', titel: 'ISO 9001', im_shop: true }], '2026-10-11');
  const sdb = s.find((d) => d.id === '1'), anderes = s.find((d) => d.id === '2');
  assert.equal(sdb.art_key, 'sdb');
  assert.equal(sdb.version, '3.1');
  assert.equal(sdb.titel, null);
  assert.equal(anderes.art_key, 'sonstiges');
  assert.equal(anderes.titel, 'ISO 9001');
});

test('Produkt-Dokumente: je Art die Kundensprache vorn, dann Deutsch — ohne Sprache wie bisher', () => {
  const d = [
    { id: 't-de', art: 'tdb', sprache: 'de', im_shop: true }, { id: 's-fr', art: 'sdb', sprache: 'fr', im_shop: true },
    { id: 's-de', art: 'sdb', sprache: 'de', im_shop: true }, { id: 's-en', art: 'sdb', sprache: 'en', im_shop: true },
    { id: 't-en', art: 'tdb', sprache: 'en', im_shop: true },
  ];
  assert.deepEqual(shopDokumente(d, '2026-10-11', 'en').map((x) => x.id), ['s-en', 's-de', 's-fr', 't-en', 't-de']);
  assert.deepEqual(shopDokumente(d, '2026-10-11', 'fr').map((x) => x.id), ['s-fr', 's-de', 's-en', 't-de', 't-en']);
  assert.deepEqual(shopDokumente(d, '2026-10-11').map((x) => x.id), ['s-de', 's-en', 's-fr', 't-de', 't-en']);
});

test('Umschalter-Stil im Seiten-Baustein', () => {
  assert.match(lies('lib/webBloecke.ts'), /'\.ao-sprache\{display:flex/);
});
