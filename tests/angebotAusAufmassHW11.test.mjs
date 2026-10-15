import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aufmassZuPosten, kontaktLabel, kontaktZuName } from '../out/aufmassZuAngebot.js';

// ===========================================================================
// HW-11 (15.10.2026) — Angebot aus Aufmass, Kunde am Aufmass
// ===========================================================================

test('Positionen: Menge mit Rechenweg, Pauschale als 1 Psch, Steuersatz je Position', () => {
  const r = aufmassZuPosten([
    { bezeichnung: 'Pflaster', menge: 47.314, einheit: 'm²', einzelpreis_netto: 40, rechenweg: '8,20 × 5,77', mwst_satz: 19 },
    { bezeichnung: 'Baustelleneinrichtung', menge: 47.31, einheit: 'm²', festpreis_netto: 800, mwst_satz: 19 },
    { bezeichnung: 'PV-Unterbau', menge: 1, einzelpreis_netto: 100, mwst_satz: 0 },
  ]);
  assert.deepEqual(r.ohnePreis, []);
  assert.equal(r.posten[0].bezeichnung, 'Pflaster (8,20 × 5,77)');
  assert.equal(r.posten[0].menge, 47.31);
  assert.equal(r.posten[0].gesamt_netto, 1892.4);
  assert.deepEqual([r.posten[1].menge, r.posten[1].einheit, r.posten[1].einzelpreis], [1, 'Psch', 800]);
  assert.equal(r.posten[2].mwst_satz, 0);
  assert.equal(r.summen.netto, 2792.4);
  assert.equal(r.summen.mwst, 511.56);
});

test('Position ohne Preis wird gemeldet', () => {
  const r = aufmassZuPosten([{ bezeichnung: 'Aushub', menge: 10 }]);
  assert.deepEqual(r.ohnePreis, ['Aushub']);
});

test('Kontakt nur bei genau einem Treffer', () => {
  const k = [
    { id: '1', vorname: 'Anna', nachname: 'Müller' },
    { id: '2', firma: 'Bau GmbH' },
    { id: '3', vorname: 'Peter', nachname: 'Schmidt' },
    { id: '4', anzeigename: 'Peter Schmidt' },
  ];
  assert.equal(kontaktLabel(k[0]), 'Anna Müller');
  assert.equal(kontaktZuName(' anna müller ', k), '1');
  assert.equal(kontaktZuName('Bau GmbH', k), '2');
  assert.equal(kontaktZuName('Peter Schmidt', k), null, 'mehrdeutig = nie verknuepfen');
  assert.equal(kontaktZuName('Unbekannt', k), null);
  assert.equal(kontaktZuName('', k), null);
});

test('Waechter: Route mit Doppelschutz, Preispruefung und Rueckbau; Seite mit Knopf und Kontakt', () => {
  const r = fs.readFileSync('app/api/angebot-aus-aufmass/route.ts', 'utf8');
  assert.match(r, /aufmass\.angebot_id/);
  assert.match(r, /ohnePreis\.length/);
  assert.match(r, /from\("angebote"\)\.delete\(\)/);
  const s = fs.readFileSync('app/dashboard/aufmass/page.tsx', 'utf8');
  assert.match(s, /\/api\/angebot-aus-aufmass/);
  assert.match(s, /kontaktZuName\(form\.kunde_name, kontakte\)/);
});
