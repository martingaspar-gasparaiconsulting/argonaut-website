// Paket G, Punkte G3 bis G5 (26.09.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pflichtangabenFuss, istRegisterpflichtig } from '../out/rechnungFuss.js';
import { naechsteZbNummer } from '../out/spenden.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('G3a Stornieren und Reaktivieren fragen nach', () => {
  const s = lies('app/dashboard/rechnungen/[id]/page.tsx');
  const i = s.indexOf('async function stornoUmschalten(');
  const teil = s.slice(i, s.indexOf('.from("rechnungen")', i));
  assert.ok(teil.includes('window.confirm(frage)'));
});

test('G3b Pflichtangaben im Rechnungsfuß', () => {
  const g = pflichtangabenFuss({ name: 'Elektro Bauer', rechtsform: 'GmbH', ort: 'Böblingen', geschaeftsfuehrer: 'Max Bauer', registergericht: 'Amtsgericht Stuttgart', hrb: 'HRB 12345' });
  assert.equal(g.zeile, 'Elektro Bauer GmbH · Sitz: Böblingen · Registergericht: Amtsgericht Stuttgart · HRB 12345 · Geschäftsführung: Max Bauer');
  assert.deepEqual(g.fehlt, []);
  const leer = pflichtangabenFuss({ name: 'Elektro Bauer GmbH', rechtsform: 'GmbH' });
  assert.deepEqual(leer.fehlt, ['Registergericht', 'Registernummer', 'Sitz', 'Geschäftsführung']);
  assert.ok(leer.zeile.startsWith('Elektro Bauer GmbH'), 'Rechtsform nicht doppelt');
  assert.deepEqual(pflichtangabenFuss({ name: 'Maler Huber', rechtsform: 'Einzelunternehmen' }).fehlt, []);
  assert.equal(istRegisterpflichtig('e.K.'), true);
  assert.equal(istRegisterpflichtig('GbR'), false);
  assert.ok(pflichtangabenFuss({ name: 'X', rechtsform: 'AG', geschaeftsfuehrer: 'A. B.' }).zeile.includes('Vorstand: A. B.'));
  const r = lies('app/api/rechnung-pdf/route.ts');
  assert.ok(r.includes('pflichtangabenFuss(') && r.includes('fussPflicht.zeile'));
  const p = lies('app/dashboard/rechnungen/[id]/page.tsx');
  assert.ok(p.includes('firma_registergericht, firma_hrb') && p.includes('registergericht: p.firma_registergericht'));
});

test('G3c Logo lässt sich hochladen', () => {
  const w = lies('app/dashboard/webauftritt/page.tsx');
  assert.ok(w.includes("fetch('/api/webseite-foto'") && w.includes("setF('logo_url', j.url)"));
  assert.ok(!w.includes('direkter Upload folgt'));
});

test('G4 Angebote: Rückfrage, angenommene bleiben', () => {
  const s = lies('app/dashboard/angebote/page.tsx');
  const i = s.indexOf('async function loeschen(');
  const teil = s.slice(i, s.indexOf('.delete()', i));
  assert.ok(teil.includes('window.confirm(') && teil.includes('angebotLoeschbar(a)'));
  assert.ok(s.includes("a.status !== 'angenommen' && !a.rechnung_id"));
});

test('G5 Spenden-Nummer je Jahr, höchste plus 1', () => {
  assert.equal(naechsteZbNummer([], 2027), 'ZB-2027-001');
  assert.equal(naechsteZbNummer(['ZB-2026-001', 'ZB-2026-046', null], 2027), 'ZB-2027-001');
  assert.equal(naechsteZbNummer(['ZB-2027-001', 'ZB-2027-003', 'ZB-2026-099'], 2027), 'ZB-2027-004');
  assert.equal(naechsteZbNummer(['ZB-2027-009'], 2027), 'ZB-2027-010');
  assert.ok(lies('app/dashboard/spenden/page.tsx').includes('naechsteZbNummer(spenden.map((x) => x.bestaetigung_nr), JAHR)'));
});
