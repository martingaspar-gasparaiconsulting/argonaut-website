// ============================================================================
// tests/kfzChefBlickP280.test.mjs — Paket 280 (09.10.2026) · K14 Chef-Blick Fahrzeughandel
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  zeitraum, vorjahrTag, imZeitraum, verkaufsZeilen, kennzahlen, veraenderung, filterZeitraum, gruppen, preisklasse,
  rangliste, ranglisteAn, monatsReihe, zulaufLage, summenWaechter, markeSchluessel, CHEF_MODUL,
} from '../out/kfzChefBlick.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-09';
const EINST = { standkostenTag: 0, gemeinkostenProzent: 0 };

function fz(id, o = {}) {
  return { id, interne_nr: 'F-' + id, marke: 'VW', modell: 'Golf', status: 'verkauft', eingang_am: '2026-08-01', verkauft_am: '2026-10-01', ek_netto: 10000, vk_brutto: 15000, besteuerung: 'regel', ...o };
}

test('Zeitraum: laufend bis heute, Vorjahr gleicher Abschnitt, 29. Februar', () => {
  const m = zeitraum('monat', HEUTE);
  assert.deepEqual([m.von, m.bis, m.vjVon, m.vjBis], ['2026-10-01', '2026-10-09', '2025-10-01', '2025-10-09']);
  assert.match(m.label, /Oktober 2026/);
  assert.match(m.vjLabel, /Oktober 2025/);
  const q = zeitraum('quartal', HEUTE);
  assert.equal(q.von, '2026-10-01');
  assert.equal(zeitraum('quartal', '2026-08-15').von, '2026-07-01');
  assert.match(zeitraum('quartal', '2026-08-15').label, /3\. Quartal 2026/);
  const j = zeitraum('jahr', HEUTE);
  assert.deepEqual([j.von, j.vjVon, j.vjBis], ['2026-01-01', '2025-01-01', '2025-10-09']);
  assert.equal(vorjahrTag('2028-02-29'), '2027-02-28');
  assert.equal(imZeitraum('2026-10-09T10:00:00Z', '2026-10-01', '2026-10-09'), true);
  assert.equal(imZeitraum(null, '2026-10-01', '2026-10-09'), false);
  assert.equal(imZeitraum('2026-10-10', '2026-10-01', '2026-10-09'), false);
});

test('Verkaufs-Zeilen: Erlös-Quelle erzielt > Kaufvertrag > Listenpreis, nur verkaufte mit Datum', () => {
  const fahrzeuge = [
    fz('a'), fz('b'), fz('c'), fz('d', { status: 'bestand', verkauft_am: null }), fz('e', { verkauft_am: null }),
  ];
  const kalk = [{ bestand_id: 'a', vk_erzielt: 14280, verkaeufer: ' Max ', prov_v_art: 'fest', prov_v_wert: 200, prov_h_art: null, prov_h_wert: null }];
  const verkaeufe = [
    { bestand_id: 'a', status: 'uebergeben', preis_brutto: 99999 },
    { bestand_id: 'b', status: 'vertrag', preis_brutto: 11900 },
    { bestand_id: 'c', status: 'storniert', preis_brutto: 5000 },
  ];
  const kosten = [
    { bestand_id: 'a', art: 'fremd', betrag_netto: 500, plan: false },
    { bestand_id: 'a', art: 'lack', betrag_netto: 999, plan: true },
  ];
  const z = verkaufsZeilen({ fahrzeuge, kalk, verkaeufe, kosten, einst: EINST });
  assert.deepEqual(z.map((x) => x.id).sort(), ['a', 'b', 'c']);
  const a = z.find((x) => x.id === 'a'), b = z.find((x) => x.id === 'b'), c = z.find((x) => x.id === 'c');
  assert.equal(a.vkQuelle, 'erzielt'); assert.equal(a.vk, 14280);
  assert.equal(a.k.erloesNetto, 12000);
  assert.equal(a.k.kosten, 500, 'nur Ist-Kosten (inkl. übernommener Partner-Rechnung), kein Plan');
  assert.equal(a.k.rohertrag, 1500);
  assert.equal(a.k.deckungsbeitrag, 1300, 'feste Provision abgezogen');
  assert.equal(a.verkaeufer, 'Max');
  assert.equal(a.standtage, 61);
  assert.equal(b.vkQuelle, 'vertrag'); assert.equal(b.vk, 11900);
  assert.equal(c.vkQuelle, 'liste', 'stornierter Vertrag zählt nicht');
});

test('Kennzahlen: unvollständige zählen als Verkauf, nicht in Geld; Cent-genau; Vorjahr', () => {
  const zeilen = verkaufsZeilen({
    fahrzeuge: [fz('a', { ek_netto: 10000.01 }), fz('b', { ek_netto: 10000.02 }), fz('c', { ek_netto: null }), fz('d', { vk_brutto: null })],
    kalk: [], verkaeufe: [], kosten: [], einst: EINST,
  });
  const k = kennzahlen(zeilen);
  assert.equal(k.anzahl, 4); assert.equal(k.eingerechnet, 2);
  assert.equal(k.erloesNetto, 25210.08);
  assert.equal(k.rohertrag, 5210.05);
  assert.equal(k.rohertragSchnitt, 2605.03);
  assert.equal(k.standtageSchnitt, 61);
  assert.equal(kennzahlen([]).rohertragSchnitt, null);
  assert.equal(kennzahlen([]).margeProzent, null);
  assert.equal(veraenderung(120, 100), 20);
  assert.equal(veraenderung(-50, -100), 50, 'Verlust halbiert = besser');
  assert.equal(veraenderung(5, 0), null, 'ohne Vorjahr keine erfundene Prozentzahl');
  assert.equal(veraenderung(null, 3), null);
});

test('Gruppen: Marke vereinheitlicht, Preisklassen-Grenzen, Reihenfolge', () => {
  assert.equal(markeSchluessel(' vw '), markeSchluessel('VW'));
  assert.equal(preisklasse(9999.99).key, 'k1');
  assert.equal(preisklasse(10000).key, 'k2', 'Grenze gehört zur höheren Klasse');
  assert.equal(preisklasse(50000).key, 'k5');
  assert.equal(preisklasse(null).key, 'k0');
  const zeilen = verkaufsZeilen({
    fahrzeuge: [fz('a', { marke: 'vw' }), fz('b', { marke: 'VW ' }), fz('c', { marke: 'BMW', vk_brutto: 59500, ek_netto: 40000 }), fz('d', { marke: '' })],
    kalk: [], verkaeufe: [], kosten: [], einst: EINST,
  });
  const m = gruppen(zeilen, 'marke');
  assert.deepEqual(m.map((g) => [g.name, g.anzahl]), [['BMW', 1], ['vw', 2], ['Ohne Marke', 1]]);
  const kl = gruppen(zeilen, 'preisklasse');
  assert.deepEqual(kl.map((g) => g.key), ['k2', 'k5']);
});

test('Rangliste: nur eingeschaltet, Nicht zugeordnet am Ende ohne Platz', () => {
  assert.equal(CHEF_MODUL, 'kfz-chef');
  assert.equal(ranglisteAn(null), false, 'Standard AUS');
  assert.equal(ranglisteAn({ rangliste: 'true' }), false);
  assert.equal(ranglisteAn({ rangliste: true }), true);
  const zeilen = verkaufsZeilen({
    fahrzeuge: [fz('a'), fz('b'), fz('c'), fz('d')],
    kalk: [
      { bestand_id: 'a', vk_erzielt: null, verkaeufer: 'Anna', prov_v_art: null, prov_v_wert: null, prov_h_art: null, prov_h_wert: null },
      { bestand_id: 'b', vk_erzielt: null, verkaeufer: 'Ben', prov_v_art: null, prov_v_wert: null, prov_h_art: null, prov_h_wert: null },
      { bestand_id: 'c', vk_erzielt: null, verkaeufer: 'anna', prov_v_art: null, prov_v_wert: null, prov_h_art: null, prov_h_wert: null },
    ],
    verkaeufe: [], kosten: [], einst: EINST,
  });
  const r = rangliste(zeilen);
  assert.deepEqual(r.map((g) => [g.name, g.anzahl, g.platz]), [['Anna', 2, 1], ['Ben', 1, 2], ['Nicht zugeordnet', 1, null]]);
});

test('Monatsreihe und Zulauf', () => {
  const zeilen = verkaufsZeilen({
    fahrzeuge: [fz('a', { verkauft_am: '2026-01-15' }), fz('b', { verkauft_am: '2025-10-08' }), fz('c', { verkauft_am: '2025-10-20' }), fz('d', { verkauft_am: '2026-10-09' })],
    kalk: [], verkaeufe: [], kosten: [], einst: EINST,
  });
  const m = monatsReihe(zeilen, HEUTE);
  assert.equal(m.length, 12);
  assert.equal(m[0].anzahl, 1);
  assert.equal(m[9].anzahl, 1);
  assert.equal(m[9].vjAnzahl, 1, 'laufender Monat: Vorjahr nur bis zum gleichen Tag');
  assert.equal(m[10].zukunft, true);
  const z = zulaufLage([
    fz('z1', { status: 'zulauf', eingang_am: null, ek_netto: 8000, vk_brutto: 12000 }),
    fz('z2', { status: 'zulauf', eingang_am: null, ek_netto: null, vk_brutto: null }),
    fz('b1', { status: 'bestand', eingang_am: '2026-06-01', verkauft_am: null }),
    fz('b2', { status: 'bestand', eingang_am: '2026-10-02', verkauft_am: null, ek_netto: null }),
    fz('v1', { eingang_am: '2025-10-05' }),
  ], HEUTE, 90, zeitraum('monat', HEUTE));
  assert.deepEqual([z.zulaufAnzahl, z.zulaufEk, z.zulaufVk], [2, 8000, 12000]);
  assert.deepEqual([z.bestandAnzahl, z.bestandEk, z.ohneEk, z.langsteher], [2, 10000, 1, 1]);
  assert.equal(z.standtageSchnitt, 69);
  assert.deepEqual([z.hereinJetzt, z.hereinVj], [1, 1]);
  assert.equal(zulaufLage([], HEUTE, 90, zeitraum('monat', HEUTE)).bestandEk, null, 'nie 0 erfinden');
});

test('Summen-Wächter: grün bei stimmigen Summen, rot bei Abweichung, Klartext-Hinweise', () => {
  const fahrzeuge = [fz('a', { marke: 'Audi' }), fz('b', { ek_netto: null }), fz('c', { verkauft_am: '2026-02-01', vk_brutto: 33000 }), fz('d', { verkauft_am: null })];
  const verkaeufe = [{ bestand_id: 'x', status: 'vertrag', preis_brutto: 1000 }];
  const alle = verkaufsZeilen({ fahrzeuge, kalk: [], verkaeufe, kosten: [], einst: EINST });
  const jahr = filterZeitraum(alle, '2026-01-01', HEUTE);
  const gesamt = kennzahlen(jahr);
  const w = summenWaechter({
    gesamt, marken: gruppen(jahr, 'marke'), klassen: gruppen(jahr, 'preisklasse'), verkaeufer: rangliste(jahr),
    monate: monatsReihe(alle, HEUTE), jahr: gesamt, zeilen: jahr, fahrzeuge, verkaeufe,
  });
  assert.equal(w.ok, true, JSON.stringify(w.pruefungen));
  assert.equal(w.pruefungen.length, 4);
  assert.ok(w.hinweise.some((h) => /1 verkauftes Fahrzeug hat keinen Einkaufspreis/.test(h)));
  assert.ok(w.hinweise.some((h) => /3 Fahrzeuge mit Listenpreis/.test(h)));
  assert.ok(w.hinweise.some((h) => /1 Kaufvertrag ist erfasst/.test(h)));
  assert.ok(w.hinweise.some((h) => /ohne Verkaufsdatum/.test(h)));
  const kaputt = gruppen(jahr, 'marke').slice(1);
  const w2 = summenWaechter({ gesamt, marken: kaputt, klassen: gruppen(jahr, 'preisklasse'), verkaeufer: rangliste(jahr), zeilen: jahr, fahrzeuge, verkaeufe: [] });
  assert.equal(w2.ok, false);
  assert.equal(w2.pruefungen[0].ok, false);
  assert.equal(w2.pruefungen.length, 3, 'ohne Monatsreihe keine Monatsprüfung');
});

test('Einbau: Seite nur Chef, Rangliste abschaltbar, Menü, Hub, Chef-Blick, Report-Baukasten, Guide', () => {
  const seite = lies('app/dashboard/kfz/chef/page.tsx');
  assert.match(seite, /mein_chef_id/);
  assert.match(seite, /CHEF_MODUL/);
  assert.match(seite, /ranglisteAn\(/);
  assert.match(seite, /summenWaechter\(/);
  assert.match(seite, /§ 87/);
  assert.doesNotMatch(seite, /kiFetch|\/api\/ki/, 'keine KI');
  const rechte = lies('lib/rechte.ts');
  assert.match(rechte, /href: '\/dashboard\/kfz\/chef', nurChef: true/);
  assert.match(lies('app/dashboard/kfz/page.tsx'), /\/dashboard\/kfz\/chef/);
  assert.match(lies('app/dashboard/chef-blick/page.tsx'), /\/dashboard\/kfz\/chef/);
  assert.match(lies('lib/reportBaukasten.ts'), /table: 'kfz_bestand', datumFeld: 'verkauft_am'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/kfz\/chef': \{/);
});
