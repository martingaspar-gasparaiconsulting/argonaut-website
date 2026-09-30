// Paket 194 (30.09.2026) — Grundausstattung fuer jeden Betrieb.
// Martin: kein Modul kostet extra, also darf nichts Branchen-Neutrales hinter
// einem Betreiber-Schalter liegen. Branchen-Pakete zeigen nur noch, was wirklich
// branchenspezifisch ist. SQL p194 schaltet die neuen Kern-Module bei bestehenden
// Betrieben nur HINZU (on conflict do nothing, nichts wird entfernt).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { KERN_MODULE, BRANCHEN_PAKETE } from '../out/pakete.js';
import { kategorieModule, KATEGORIE_MODULE } from '../out/branchenkatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const UNIVERSELL = [
  'crm', 'leads', 'angebote', 'auftraege', 'rechnungen', 'termine', 'online-buchung', 'erinnerungen',
  'einsaetze', 'projekte', 'service', 'erp', 'einkauf', 'lager-scanner',
  'mahnwesen', 'zahlungen', 'datev', 'euer', 'banking', 'elster', 'finanzen', 'gobd',
  'personal', 'schichtplan', 'zeit-nachweis', 'team-chat', 'signaturen',
  'marketing', 'bewertungen', 'nachweise', 'dsgvo', 'import',
];
const BRANCHENSPEZIFISCH = ['aufmass', 'bau-lv', 'bautagebuch', 'pruefprotokolle', 'werkstatt', 'kfz', 'gastro', 'kanzlei', 'tier', 'wellness', 'immobilien', 'kasse'];

test('jeder Betrieb bekommt die komplette Grundausstattung', () => {
  for (const m of UNIVERSELL) assert.ok(KERN_MODULE.includes(m), `${m} fehlt im Kern`);
  for (const kat of Object.keys(KATEGORIE_MODULE)) {
    const set = kategorieModule(kat);
    for (const m of UNIVERSELL) assert.ok(set.includes(m), `${kat}: ${m} fehlt`);
  }
});

test('Branchenspezifisches bleibt im Branchen-Paket, nicht im Kern', () => {
  for (const m of BRANCHENSPEZIFISCH) assert.ok(!KERN_MODULE.includes(m), `${m} gehoert nicht in den Kern`);
});

test('Handwerk & Bau: Baustelle, Pruefen, Kalkulator', () => {
  const hw = KATEGORIE_MODULE['Handwerk & Bau'];
  for (const m of ['aufmass', 'bau-lv', 'bautagebuch', 'pruefprotokolle', 'wartung', 'leistungskatalog', 'kalkulator', 'objektzeiten']) assert.ok(hw.includes(m), m);
  const paket = BRANCHEN_PAKETE.find((p) => p.key === 'handwerk');
  assert.ok(paket.module.includes('kalkulator'));
});

test('jeder Kern-Schluessel hat einen Menue-Eintrag, keiner doppelt', () => {
  const rechte = lies('lib/rechte.ts');
  for (const m of KERN_MODULE) assert.match(rechte, new RegExp(`modul: '${m}'`), `${m} ohne Menue`);
  assert.equal(new Set(KERN_MODULE).size, KERN_MODULE.length);
});

test('Command Center zeigt die echte Kern-Zahl statt „12"', () => {
  const s = lies('app/admin/branchen/page.tsx');
  assert.doesNotMatch(s, />\+ 12 Kernbausteine</);
  assert.match(s, /KERN_MODULE\.length/);
});
