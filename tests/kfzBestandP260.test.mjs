// ============================================================================
// tests/kfzBestandP260.test.mjs — Paket 260 (07.10.2026) · K1 Fahrzeugbestand Teil 2
// Lebensakte über die FIN, Bestandsliste als PDF, Eigene Felder je Fahrzeug.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { finTreffer, listenZeilen } from '../out/kfzBestand.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const FIN = 'WP0ZZZ99ZNS201447';

test('FIN-Treffer: Werkstatt kennt das Fahrzeug, Aufträge werden gezählt', () => {
  const t = finTreffer(
    [{ id: 'b1', fin: FIN }, { id: 'b2', fin: 'WVWZZZCDZNW118204' }, { id: 'b3', fin: null }],
    [{ id: 'w1', fin: 'wp0zzz99zns 201447' }, { id: 'w2', fin: 'WVWZZZCDZNW118204' }, { id: 'w3', fin: null }],
    [{ fahrzeug_id: 'w1' }, { fahrzeug_id: 'w1' }, { fahrzeug_id: 'w1' }, { fahrzeug_id: 'wX' }, { fahrzeug_id: null }],
  );
  assert.deepEqual(t.b1, { fahrzeugId: 'w1', auftraege: 3 });
  assert.deepEqual(t.b2, { fahrzeugId: 'w2', auftraege: 0 });
  assert.equal(t.b3, undefined, 'ohne FIN nie ein Treffer');
  assert.deepEqual(finTreffer([], [], []), {});
});

test('FIN-Treffer: kurze oder leere FIN in der Werkstatt zählt nicht', () => {
  const t = finTreffer([{ id: 'b1', fin: 'ABC' }], [{ id: 'w1', fin: 'ABC' }], []);
  assert.deepEqual(t, {});
});

test('Listenzeilen: gleiche Reihenfolge, nichts erfunden', () => {
  const z = listenZeilen([
    { id: 'a', interne_nr: 'F-0001', status: 'bestand', marke: 'Porsche', modell: '911', variante: 'S', kennzeichen: 'BB-AM 911', erstzulassung: '2022-03-01', km_stand: 18400, standort_id: 's1', eingang_am: '2026-09-07', verkauft_am: null, vk_brutto: 134900, ek_netto: null },
    { id: 'b', interne_nr: null, status: 'zulauf', marke: null, modell: null, variante: null, kennzeichen: null, erstzulassung: null, km_stand: null, standort_id: null, eingang_am: null, verkauft_am: null, vk_brutto: null, ek_netto: null },
  ], '2026-10-07', (id) => (id === 's1' ? 'Böblingen' : '—'), (k) => (k === 'bestand' ? 'Im Bestand' : 'Im Zulauf'));
  assert.deepEqual(z[0], { nr: 'F-0001', fahrzeug: 'Porsche 911 S', ezKm: '03/2022 · 18.400 km', kennzeichen: 'BB-AM 911', standort: 'Böblingen', standtage: '30', vk: '134.900 €', ek: '—', status: 'Im Bestand' });
  assert.equal(z[1].fahrzeug, '—');
  assert.equal(z[1].standtage, 'Zulauf');
  assert.equal(z[1].vk, '—');
});

test('PDF: Einkaufspreise nur bei eingeblendeter Spalte, Hinweis „intern"', () => {
  const p = lies('lib/kfzBestandPdf.ts');
  assert.match(p, /\.\.\.\(d\.mitEk \? \[\{ k: 'ek'/);
  assert.match(p, /d\.mitEk && d\.summeEk/);
  assert.match(p, /Interne Bestandsliste/);
  const s = lies('app/dashboard/kfz/bestand/page.tsx');
  assert.match(s, /mitEk: sichtbar\('ek'\)/);
  assert.match(s, /listenZeilen\(gefiltert,/, 'PDF druckt genau die gefilterte Liste');
});

test('Seite: Eigene Felder beim Anlegen und Ändern gespeichert, Werkstatt-Abfrage stört nie', () => {
  const s = lies('app/dashboard/kfz/bestand/page.tsx');
  assert.match(s, /insert\(\{ \.\.\.zeile, owner_user_id: besitzer, interne_nr: nr \}\)\.select\('id'\)\.single\(\)/);
  assert.match(s, /speichereWerte\(FELD_MODUL, \(neu as \{ id: string \}\)\.id, besitzer, nmExtra\)/);
  assert.match(s, /speichereWerte\(FELD_MODUL, bearbeite, besitzer, nmExtra\)/);
  assert.match(s, /catch \{ setTreffer\(\{\}\); \}/);
  assert.match(s, /EigeneFelderManager modul=\{FELD_MODUL\}/);
  assert.doesNotMatch(s, /\bdu\b|\bdein|KI-Agent/i);
});
