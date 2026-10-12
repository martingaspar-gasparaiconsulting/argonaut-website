// ============================================================================
// tests/einzelstueckFreischaltungP337.test.mjs — Paket 337 (12.10.2026)
// BV2b Teil 6: Freischaltung für Händler von Einzelstücken, Menü- und Seitenwörter
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { einzelstueckHandelZusatz, kfzMenueLabel, hubNachArt } from '../out/einzelstueckBestand.js';
import { brancheModule, brancheZusatz, kategorieModule, kategorieZusatz } from '../out/branchenkatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const H = 'Handel & E-Commerce';

test('Zusatz nur für Einzelstück-Händler in Handel, Kultur und Werften', () => {
  for (const b of ['Uhrmacher & Juweliere', 'Antiquitätenhandel', 'Second-Hand & Vintage', 'Kunsthandel & Galerien', 'Landmaschinenhandel', 'Baumaschinenhandel']) {
    assert.equal(einzelstueckHandelZusatz(H, b), true, b);
  }
  assert.equal(einzelstueckHandelZusatz('Kultur, Soziales & Öffentliches', 'Kunstgalerien & Ausstellungsräume'), true);
  assert.equal(einzelstueckHandelZusatz('Industrie & Produktion', 'Schiffbau & Werften'), true);
  assert.equal(einzelstueckHandelZusatz('Industrie & Produktion', 'Landtechnik-Hersteller'), false, 'Hersteller, kein Handel');
  assert.equal(einzelstueckHandelZusatz('Gastronomie, Hotellerie & Tourismus', 'Boots- & Fahrradverleih'), false, 'Verleih, kein Handel');
  assert.equal(einzelstueckHandelZusatz(H, 'Modehandel'), false);
  assert.equal(einzelstueckHandelZusatz(H, null), false);
  assert.equal(einzelstueckHandelZusatz('Fahrzeuge & Mobilität', 'Boots- & Yachthandel'), false, 'hat kfz schon über die Kategorie');
});

test('Modul-Set der Branche: additiv, Kategorie unverändert', () => {
  const juw = brancheModule(H, 'Uhrmacher & Juweliere');
  assert.ok(juw.includes('kfz'));
  for (const m of kategorieModule(H)) assert.ok(juw.includes(m), m);
  assert.equal(juw.length, kategorieModule(H).length + 1);
  assert.ok(!kategorieModule(H).includes('kfz'), 'Kategorie-Set selbst bleibt ohne kfz');
  assert.deepEqual(brancheModule(H, 'Modehandel'), kategorieModule(H));
  assert.ok(brancheZusatz(H, 'Kunsthandel & Galerien').includes('kfz'));
  assert.deepEqual(brancheZusatz(H, 'Modehandel'), kategorieZusatz(H));
  const fz = brancheModule('Fahrzeuge & Mobilität', 'Boots- & Yachthandel');
  assert.equal(fz.filter((m) => m === 'kfz').length, 1, 'kein doppeltes kfz');
});

test('Menü- und Seitenwörter je Art', () => {
  assert.equal(kfzMenueLabel('kfz'), '🚗 KFZ-Fachpaket');
  assert.equal(kfzMenueLabel(undefined), '🚗 KFZ-Fachpaket');
  assert.equal(kfzMenueLabel('boot'), '⛵ Bootsbestand');
  assert.equal(kfzMenueLabel('uhr_schmuck'), '⌚ Uhren und Schmuck');
  const k = hubNachArt('kfz');
  assert.deepEqual([k.probefahrt, k.tresor, k.schaden, k.werkstatt], [true, true, true, true]);
  const u = hubNachArt('uhr_schmuck');
  assert.deepEqual([u.probefahrt, u.tresor, u.schaden, u.werkstatt], [false, false, false, false]);
  assert.equal(u.titel, '⌚ Uhren und Schmuck');
  const m = hubNachArt('maschine');
  assert.deepEqual([m.probefahrt, m.tresor, m.schaden, m.werkstatt], [true, true, false, false]);
});

test('Seiten nutzen die Branche', () => {
  const a = lies('app/admin/branchen/page.tsx');
  assert.match(a, /module: brancheModule\(sel\.kategorie, sel\.name\)/);
  const n = lies('app/dashboard/DashboardNav.tsx');
  assert.match(n, /link\.href === '\/dashboard\/kfz' && kfzLabel \? kfzLabel : link\.label/);
  assert.match(n, /catch \{ \/\* Menü bleibt wie bisher \*\/ \}/);
  const h = lies('app/dashboard/kfz/page.tsx');
  assert.match(h, /const h = hubNachArt\(vorlageFuer\('kfz-bestand', branche\)\?\.art\)/);
  assert.match(h, /\{werkstattSicht && <>/);
  assert.match(h, /\{h\.probefahrt && <a href="\/dashboard\/kfz\/probefahrt"/);
  assert.match(h, /\{h\.tresor && <a href="\/dashboard\/kfz\/tresor"/);
  assert.doesNotMatch(h, /\bdu\b|\bdein|KI-Agent/i);
});
