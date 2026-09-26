// Paket F, Punkt F1 (26.09.2026) — Filial-Module: Sperrliste statt Positivliste.
// Eigene Datei, weil F1 als eigene Bat (_p112) ausgeliefert wird.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { abgeschalteteModuleAmStandort, istModulAmStandortAktiv, nurStandortAktiveLinks } from '../out/standortModule.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- F1
test('F1 Filial-Module: Sperrliste — Aus/An blendet nichts anderes aus', () => {
  // Modul aus- und wieder eingeschaltet: eine Zeile aktiv=true
  const nachWiederAn = abgeschalteteModuleAmStandort([{ modul_key: 'kasse', aktiv: true }]);
  assert.equal(nachWiederAn, null);
  assert.equal(istModulAmStandortAktiv('rechnungen', nachWiederAn), true);
  // Nur abgeschaltet: wirkt jetzt wirklich
  const aus = abgeschalteteModuleAmStandort([{ modul_key: 'kasse', aktiv: false }, { modul_key: 'lager', aktiv: true }]);
  assert.equal(istModulAmStandortAktiv('kasse', aus), false);
  assert.equal(istModulAmStandortAktiv('lager', aus), true);
  assert.equal(istModulAmStandortAktiv('rechnungen', aus), true);
  // Infra-Links (ohne Modul) nie abschaltbar
  assert.equal(istModulAmStandortAktiv(undefined, aus), true);
  const links = [{ label: 'a', href: '/a', modul: 'kasse' }, { label: 'b', href: '/b' }, { label: 'c', href: '/c', modul: 'lager' }];
  assert.deepEqual(nurStandortAktiveLinks(links, aus).map((l) => l.href), ['/b', '/c']);
  assert.equal(abgeschalteteModuleAmStandort([]), null);
  assert.equal(abgeschalteteModuleAmStandort(null), null);
});

test('F1 Filial-Module-Seite und Standorte haben keinen Modul-Schlüssel (Chef kommt immer zurück)', () => {
  const r = lies('lib/rechte.ts');
  for (const href of ['/dashboard/filial-module', '/dashboard/standorte']) {
    const zeile = r.split('\n').find((z) => z.includes(`href: '${href}'`));
    assert.ok(zeile, href);
    assert.ok(!/modul:/.test(zeile), href + ' darf keinen Modul-Schlüssel haben');
  }
  assert.ok(lies('proxy.ts').includes('abgeschalteteModuleAmStandort('));
  assert.ok(lies('app/dashboard/DashboardNav.tsx').includes('abgeschalteteModuleAmStandort('));
});

