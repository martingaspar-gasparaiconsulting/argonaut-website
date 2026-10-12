// ============================================================================
// tests/boxKonfiguratorP344.test.mjs — Paket 344 (12.10.2026)
// BV3b Feinkost Teil 3: Box-Konfigurator mit Saison-Kapazität (Auswahl wie der
// Wächter, Preis, Kapazität je Tag, Bestellschluss, Allergene als Vereinigung,
// Packliste, SQL-Wächter und Seite)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  vorlagePruefen, fachPruefen, optionPruefen, tageImZeitraum, kapazitaetPruefen, auswahlPruefen, boxPreis, abPreis,
  standardAuswahl, vorlageBereit, bestellSchluss, nachSchluss, tagStand, kapazitaetListe, bestellungPruefen,
  boxAllergene, mwstHinweis, packliste, auswahlText, boxUebersicht, euro,
} from '../out/boxKonfigurator.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const V = { id: 'v1', name: 'Weihnachtskiste', grundpreis: 39.9, mwst_satz: 7, bestell_vorlauf_tage: 2, status: 'aktiv' };
const F = [
  { id: 'fk', vorlage_id: 'v1', titel: 'Käse', anzahl: 2, position: 1 },
  { id: 'fw', vorlage_id: 'v1', titel: 'Wein', anzahl: 1, position: 2 },
];
const O = [
  { fach_id: 'fk', artikel_id: 'berg', aufpreis: 0, aktiv: true },
  { fach_id: 'fk', artikel_id: 'ziege', aufpreis: 2.5, aktiv: true },
  { fach_id: 'fk', artikel_id: 'alt', aufpreis: 0, aktiv: false },
  { fach_id: 'fw', artikel_id: 'ries', aufpreis: 4.1, aktiv: true },
];
const A = [{ fach_id: 'fk', artikel_id: 'ziege' }, { fach_id: 'fk', artikel_id: 'berg' }, { fach_id: 'fw', artikel_id: 'ries' }];
const K = [{ vorlage_id: 'v1', tag: '2026-12-22', max_boxen: 3 }, { vorlage_id: 'v1', tag: '2026-12-23', max_boxen: 5 }];
const B = (kunde_name, anzahl, status = 'offen', abhol_tag = '2026-12-22', auswahl = A) => ({ vorlage_id: 'v1', kunde_name, anzahl, status, abhol_tag, auswahl });
const E = { kunde_name: 'Meier', kunde_tel: '0711 1', kunde_mail: '', abhol_tag: '2026-12-22', anzahl: 1, notiz: '' };

test('Auswahl wie der Wächter: je Fach genau „anzahl", nur aktive Optionen des Fachs', () => {
  assert.ok(auswahlPruefen(F, O, A).ok);
  assert.ok(auswahlPruefen(F, O, [...A.slice(0, 1), { fach_id: 'fk', artikel_id: 'ziege' }, A[2]]).ok, 'zweimal derselbe Käse ist erlaubt');
  assert.match(auswahlPruefen(F, O, A.slice(1)).fehler.join(' '), /Käse.*genau 2.*gewählt: 1/);
  assert.match(auswahlPruefen(F, O, [{ fach_id: 'fk', artikel_id: 'ries' }, A[1], A[2]]).fehler.join(' '), /passt nicht/, 'Wein im Käsefach');
  assert.match(auswahlPruefen(F, O, [{ fach_id: 'fk', artikel_id: 'alt' }, A[1], A[2]]).fehler.join(' '), /passt nicht/, 'nicht mehr angeboten');
  assert.match(auswahlPruefen(F, O, [...A, { fach_id: 'fremd', artikel_id: 'x' }]).fehler.join(' '), /passt nicht/, 'fremdes Fach');
  assert.ok(auswahlPruefen([], [], []).ok, 'Box ohne Fächer = fest gepackt');
});

test('Preis: Grundpreis + Aufpreise in Cent genau, ab-Preis mit günstigster Wahl', () => {
  assert.deepEqual(boxPreis(V, O, A), { je_box: 46.5, aufpreise: 6.6 });
  assert.deepEqual(boxPreis({ grundpreis: 0.1 }, [{ fach_id: 'f', artikel_id: 'a', aufpreis: 0.2, aktiv: true }], [{ fach_id: 'f', artikel_id: 'a' }]).je_box, 0.3, 'kein 0,30000000000000004');
  assert.equal(abPreis(V, F, O), 44, '39,90 + 2 × 0 + 4,10');
  assert.equal(euro(46.5), '46,50 €');
  assert.deepEqual(standardAuswahl(F, O), [{ fach_id: 'fk', artikel_id: 'berg' }, { fach_id: 'fk', artikel_id: 'berg' }, { fach_id: 'fw', artikel_id: 'ries' }]);
});

test('Kapazität je Tag: belegt zählt offen, gepackt, abgeholt — Storno und nicht abgeholt geben frei', () => {
  const bs = [B('A', 1), B('B', 1, 'bereit'), B('C', 1, 'storniert'), B('D', 1, 'nicht_abgeholt'), B('E', 2, 'offen', '2026-12-23')];
  assert.deepEqual(tagStand(K[0], bs), { tag: '2026-12-22', max: 3, belegt: 2, frei: 1, prozent: 67 });
  const l = kapazitaetListe('v1', K, bs, '2026-12-23');
  assert.equal(l.length, 1, 'vergangene Tage nicht'); assert.equal(l[0].frei, 3);
  const p = bestellungPruefen({ ...E, anzahl: 2 }, V, F, O, A, K, bs, '2026-12-01');
  assert.match(p.fehler.join(' '), /nur noch 1 von 3/);
  assert.ok(bestellungPruefen(E, V, F, O, A, K, bs, '2026-12-01').ok);
  assert.match(bestellungPruefen({ ...E, abhol_tag: '2026-12-24' }, V, F, O, A, K, [], '2026-12-01').fehler.join(' '), /keine Kapazität/);
  assert.match(bestellungPruefen(E, { ...V, status: 'entwurf' }, F, O, A, K, [], '2026-12-01').fehler.join(' '), /nicht zum Bestellen/);
});

test('Bestellschluss: Abholtag minus Vorlauf, an der Theke nur Hinweis', () => {
  assert.equal(bestellSchluss('2026-12-22', 2), '2026-12-20');
  assert.equal(nachSchluss('2026-12-22', 2, '2026-12-20'), false, 'am Schlusstag noch');
  assert.equal(nachSchluss('2026-12-22', 2, '2026-12-21'), true);
  const p = bestellungPruefen(E, V, F, O, A, K, [], '2026-12-21');
  assert.ok(p.ok, 'Theke darf'); assert.match(p.hinweise.join(' '), /Bestellschluss war am 20\.12\.2026/);
  assert.match(bestellungPruefen(E, V, F, O, A, K, [], '2026-12-23').fehler.join(' '), /Vergangenheit/);
  assert.match(bestellungPruefen({ ...E, kunde_tel: '' }, V, F, O, A, K, [], '2026-12-01').hinweise.join(' '), /nicht erreichen/);
});

test('Zeitraum anlegen: nur gewählte Wochentage, höchstens 120 Tage', () => {
  // 21.12.2026 ist ein Montag
  assert.deepEqual(tageImZeitraum('2026-12-21', '2026-12-27', [1, 3, 6]), ['2026-12-21', '2026-12-23', '2026-12-26']);
  assert.deepEqual(tageImZeitraum('2026-12-27', '2026-12-21', [1]), []);
  assert.equal(tageImZeitraum('2026-01-01', '2026-12-31', [1, 2, 3, 4, 5, 6, 7]).length, 0, 'zu lang');
  assert.match(kapazitaetPruefen('2026-12-21', '2026-12-27', [], 5).fehler.join(' '), /Wochentag/);
  assert.match(kapazitaetPruefen('2026-12-21', '2026-12-21', [2], 5).fehler.join(' '), /keiner der gewählten/);
  assert.match(kapazitaetPruefen('2026-12-21', '2026-12-27', [1], 2.5).fehler.join(' '), /ganze Zahl/);
  assert.ok(kapazitaetPruefen('2026-12-21', '2026-12-27', [1], 5).ok);
});

test('Allergene der Box = Vereinigung; ohne Etikett wird genannt', () => {
  const et = [
    { artikel_id: 'berg', status: 'aktiv', allergene: 'milch' },
    { artikel_id: 'ziege', status: 'aktiv', allergene: 'milch, schalenfruechte', spuren: 'Kann Spuren von Sesam enthalten' },
    { artikel_id: 'ries', status: 'archiv', allergene: 'sulfite' },
  ];
  const r = boxAllergene(A, et, { ries: 'Riesling' });
  assert.deepEqual(r.keys, ['milch', 'schalenfruechte']);
  assert.ok(r.namen.length === 2);
  assert.deepEqual(r.spuren, ['Kann Spuren von Sesam enthalten']);
  assert.deepEqual(r.ohneEtikett, ['Riesling'], 'archiviertes Etikett zählt nicht');
});

test('Steuersatz-Hinweis nur bei abweichenden Sätzen; Prüfungen der Stammdaten', () => {
  assert.equal(mwstHinweis(V, ['berg'], { berg: 7 }), null);
  assert.match(mwstHinweis(V, ['berg', 'ries'], { berg: 7, ries: 19 }), /19 %.*Steuerberatung/);
  assert.ok(vorlagePruefen({ name: 'Kiste', grundpreis: 0, mwst_satz: 7, bestell_vorlauf_tage: 0, beschreibung: '' }).ok);
  assert.equal(vorlagePruefen({ name: '', grundpreis: null, mwst_satz: 16, bestell_vorlauf_tage: 1.5, beschreibung: '' }).fehler.length, 4);
  assert.match(fachPruefen('Käse', 0).fehler.join(' '), /1 bis 20/);
  assert.match(optionPruefen('berg', 0, ['berg']).fehler.join(' '), /schon zur Wahl/);
  assert.deepEqual(vorlageBereit(V, F, O.filter((o) => o.fach_id === 'fk'), K, '2026-12-01'), ['Im Fach „Wein" steht kein Artikel zur Wahl.']);
  assert.match(vorlageBereit(V, F, O, K, '2026-12-24').join(' '), /Keine Kapazität ab heute/);
});

test('Packliste je Tag: Menge = gewählt × Boxen, nur offen und gepackt', () => {
  const bs = [B('A', 2), B('B', 1, 'bereit', '2026-12-22', [{ fach_id: 'fk', artikel_id: 'berg' }, { fach_id: 'fk', artikel_id: 'berg' }, A[2]]), B('C', 5, 'abgeholt'), B('D', 3, 'storniert')];
  const p = packliste(bs, { berg: 'Bergkäse', ziege: 'Ziegenkäse', ries: 'Riesling' });
  assert.equal(p.length, 1); assert.equal(p[0].boxen, 3);
  assert.deepEqual(p[0].artikel.map((z) => [z.name, z.menge]), [['Bergkäse', 4], ['Riesling', 3], ['Ziegenkäse', 2]]);
  assert.equal(auswahlText([{ fach: 'Käse', artikel_id: 'b', name: 'Bergkäse' }, { fach: 'Käse', artikel_id: 'b', name: 'Bergkäse' }, { fach: 'Wein', artikel_id: 'r', name: 'Riesling' }]), 'Käse: 2 × Bergkäse · Wein: Riesling');
  assert.deepEqual(boxUebersicht([{ ...B('A', 2), gesamt: 93 }, { ...B('B', 1, 'offen', '2026-12-01'), gesamt: 46.5 }, { ...B('C', 1, 'abgeholt'), gesamt: 46.5 }], '2026-12-01'), { offen: 3, heuteAbholen: 1, umsatzOffen: 139.5 });
});

test('SQL p344: Preis aus der Datenbank, Kapazität mit Sperre, Rechte wie Paket 342, additiv', () => {
  const sql = lies('supabase-sql/p344-box-konfigurator.sql');
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b(?!.*where)/i);
  assert.match(sql, /new\.preis_je_box := v\.grundpreis \+ v_auf/, 'Preis in der Datenbank');
  assert.match(sql, /new\.preis_je_box := old\.preis_je_box/, 'Preis nicht von außen änderbar');
  assert.match(sql, /new\.gesamt := new\.preis_je_box \* new\.anzahl/);
  assert.match(sql, /box_kapazitaet x where x\.vorlage_id = new\.vorlage_id and x\.tag = new\.abhol_tag for update/, 'Tag beim Buchen sperren');
  assert.match(sql, /new\.quelle = 'shop'[\s\S]{0,200}Bestellschluss/);
  assert.match(sql, /before delete on public\.box_kapazitaet/);
  assert.equal((sql.match(/darf_ich_modul_aendern\(''lebensmittel''\)/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /for delete to authenticated/, 'Mitarbeiter löschen nicht');
  assert.match(sql, /tabellen = 5 \| regeln = 20 \| ausloeser = 11 \| rls_an = 5/);
});

test('Seite: Preis kommt nicht aus dem Formular, Menü, Lebensmittel-Link, DSGVO, Guide', () => {
  const seite = lies('app/dashboard/lebensmittel/boxen/page.tsx');
  const insert = seite.slice(seite.indexOf('const felder = {\n      vorlage_id'), seite.indexOf("supabase.from('box_bestellung').insert"));
  assert.ok(insert.length > 50);
  assert.doesNotMatch(insert, /preis_je_box|gesamt/, 'kein Preis im Insert');
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/lebensmittel\/boxen'/);
  assert.match(lies('app/dashboard/lebensmittel/page.tsx'), /href="\/dashboard\/lebensmittel\/boxen"/);
  assert.match(lies('lib/dsgvoDaten.ts'), /tabelle: 'box_bestellung'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/lebensmittel\/boxen': \{/);
});
