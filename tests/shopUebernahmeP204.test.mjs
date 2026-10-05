// ============================================================================
// tests/shopUebernahmeP204.test.mjs — Paket 204 (Stufe 3 · B4 „Shop aus Inventar")
//   Übernahme nur verkaufsfähiger Artikel, Auswahl, MwSt je Artikel, Kassen-Summe
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  shopHindernisse, shopTauglich, planeUebernahme, uebernahmeMeldung, hatBestand,
  shopMwst, oeffentlichBestellbar, baueBestellung, leseMenge, SHOP_MWST_SAETZE,
} from '../out/shopUebernahme.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Verkaufsfähig nur mit Preis über 0, aktiv und Bezeichnung', () => {
  assert.deepEqual(shopHindernisse({ id: '1', bezeichnung: 'Schraube', verkaufspreis: 1.2, aktiv: true }), []);
  assert.deepEqual(shopHindernisse({ id: '1', bezeichnung: 'Schraube', verkaufspreis: 0 }), ['kein_preis']);
  assert.deepEqual(shopHindernisse({ id: '1', bezeichnung: 'Schraube', verkaufspreis: null }), ['kein_preis']);
  assert.deepEqual(shopHindernisse({ id: '1', bezeichnung: 'Schraube', verkaufspreis: '-3' }), ['kein_preis']);
  assert.deepEqual(shopHindernisse({ id: '1', bezeichnung: 'Schraube', verkaufspreis: '4,50' }), [], 'deutsches Komma');
  assert.deepEqual(shopHindernisse({ id: '1', bezeichnung: ' ', verkaufspreis: 0, aktiv: false }), ['kein_preis', 'inaktiv', 'ohne_name']);
  assert.equal(shopTauglich({ id: '1', bezeichnung: 'X', verkaufspreis: 2, aktiv: null }), true, 'aktiv unbekannt = aktiv');
});

test('Sammel-Übernahme überspringt mit Grund und zählt doppelte nicht', () => {
  const plan = planeUebernahme([
    { id: 'a', bezeichnung: 'A', verkaufspreis: 5 },
    { id: 'a', bezeichnung: 'A', verkaufspreis: 5 },
    { id: 'b', bezeichnung: 'B', verkaufspreis: 0 },
    { id: 'c', bezeichnung: 'C', verkaufspreis: 3, aktiv: false },
    { id: 'd', bezeichnung: 'D', verkaufspreis: 3, im_shop: true },
    { id: 'e', bezeichnung: '', verkaufspreis: 3 },
  ]);
  assert.deepEqual(plan, { neu: ['a'], schonDrin: 1, ohnePreis: 1, inaktiv: 1, ohneName: 1 });
  const m = uebernahmeMeldung(plan);
  assert.match(m, /^1 Artikel in den Shop übernommen\./);
  assert.match(m, /1 war schon im Shop/);
  assert.match(m, /Übersprungen: 1 ohne Verkaufspreis, 1 inaktiv, 1 ohne Bezeichnung\./);
  assert.match(m, /ERP → Preisliste/);
  assert.equal(uebernahmeMeldung(planeUebernahme([])), 'Keine neuen Artikel übernommen.');
});

test('Bestand-Filter', () => {
  assert.equal(hatBestand({ id: 'x', aktueller_bestand: 3 }), true);
  assert.equal(hatBestand({ id: 'x', aktueller_bestand: 0 }), false);
  assert.equal(hatBestand({ id: 'x', aktueller_bestand: null }), false);
});

test('MwSt nur 19, 7 oder 0 — sonst 19', () => {
  assert.deepEqual([...SHOP_MWST_SAETZE], [19, 7, 0]);
  assert.equal(shopMwst(7), 7);
  assert.equal(shopMwst('7'), 7);
  assert.equal(shopMwst(0), 0);
  assert.equal(shopMwst(16), 19);
  assert.equal(shopMwst(null), 19);
  assert.equal(shopMwst(undefined), 19);
});

test('Kasse: Preise nur vom Server, nicht bestellbare fallen weg, Cent exakt', () => {
  assert.equal(oeffentlichBestellbar({ id: '1', bezeichnung: 'A', verkaufspreis: 0 }), false);
  assert.equal(oeffentlichBestellbar({ id: '1', bezeichnung: 'A', verkaufspreis: 2, aktiv: false }), false);
  const wunsch = new Map([['a', 3], ['b', 1], ['c', 2], ['z', 9]]);
  const { positionen, brutto } = baueBestellung([
    { id: 'a', bezeichnung: 'Brot', verkaufspreis: 1.15, shop_mwst: 7, artikelnummer: 'B1' },
    { id: 'b', bezeichnung: 'Gratis', verkaufspreis: 0 },
    { id: 'c', bezeichnung: 'Kabel', verkaufspreis: '0.10' },
  ], wunsch);
  assert.deepEqual(positionen, [
    { bezeichnung: 'Brot', menge: 3, einzelpreis: 1.15, mwst: 7, artikelnummer: 'B1' },
    { bezeichnung: 'Kabel', menge: 2, einzelpreis: 0.1, mwst: 19 },
  ]);
  assert.equal(brutto, 3.65, '3 × 1,15 = 3,45 (Gleitkomma 3,4499…) + 0,20');
});

test('Menge aus dem Warenkorb', () => {
  assert.equal(leseMenge(2), 2);
  assert.equal(leseMenge('3'), 3);
  assert.equal(leseMenge(0), 0, '0 wird verworfen, nicht zu 1');
  assert.equal(leseMenge(-1), 0);
  assert.equal(leseMenge('x'), 0);
  assert.equal(leseMenge(50000), 9999);
});

test('Verdrahtung: Seite, öffentliche Routen, SQL', () => {
  const seite = lies('app/dashboard/shop/produkte/page.tsx');
  assert.match(seite, /planeUebernahme\(quelle\)/, 'Sammel-Übernahme über den Plan');
  assert.match(seite, /shopTauglich\(a\)/, 'Einzel-Übernahme geprüft');
  assert.match(seite, /Auswahl übernehmen/);
  assert.match(seite, /\/api\/marketing\/lp-medien/, 'Foto-Upload');
  const produkte = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(produkte, /filter\(oeffentlichBestellbar\)/);
  const kasse = lies('app/api/oeffentlich/shop-bestellung/route.ts');
  assert.match(kasse, /baueBestellung\(artikel, wunsch\)/);
  assert.doesNotMatch(kasse, /mwst: 19/, 'kein pauschaler Satz mehr');
  const sql = lies('supabase-sql/p204-shop-aus-inventar.sql');
  assert.match(sql, /add column if not exists shop_mwst smallint not null default 19/);
  assert.match(sql, /check \(shop_mwst in \(0, 7, 19\)\)/);
  assert.doesNotMatch(sql, /^\s*(drop|delete|truncate)\b/im, 'nichts Destruktives ausserhalb von Kommentaren');
});
