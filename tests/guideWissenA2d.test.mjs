// Paket A2d (25.09.2026) — Wissensbasis Verwaltung: jede Verwaltungs-Seite am echten Code geprueft.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WISSEN } from '../out/guideWissen.js';
import { modulGuide, MODUL_TEXTE } from '../out/kiGuideModule.js';

const RECHTE = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
const VERWALTUNG = [...RECHTE.matchAll(/href: '(\/dashboard[^']*)'[^\n]*gruppe: 'verwaltung'/g)].map((m) => m[1]);
const NUR_CHEF = new Set([...RECHTE.matchAll(/href: '(\/dashboard[^']*)'[^\n]*nurChef: true/g)].map((m) => m[1]));
const texte = (w) => [w.zweck, w.werText, ...w.schritte, w.probe?.anlegen ?? '', w.probe?.loeschen ?? ''].join(' ');

test('Jede Verwaltungs-Seite im Menue hat einen Eintrag', () => {
  assert.ok(VERWALTUNG.length >= 15, `nur ${VERWALTUNG.length}`);
  for (const href of VERWALTUNG) assert.ok(WISSEN[href], `fehlt: ${href}`);
});

test('Nur-Chef-Seiten sagen das auch', () => {
  for (const href of VERWALTUNG) if (NUR_CHEF.has(href)) assert.match(WISSEN[href].werText, /Chef/, href);
});

test('Alte Guide-Texte der Verwaltung sind raus, der Guide spricht aus der Wissensbasis', () => {
  for (const href of ['/dashboard/filialvergleich', '/dashboard/wer-sieht-was', '/dashboard/schnittstellen', '/dashboard/datensicherung', '/dashboard/automationen']) {
    assert.equal(MODUL_TEXTE[href], undefined, href);
    assert.equal(modulGuide(href, [{ label: 'X', href }]).nachricht, WISSEN[href].zweck, href);
  }
});

test('Kernaussagen stimmen mit dem Code', () => {
  assert.match(texte(WISSEN['/dashboard/webseiten']), /Offline nehmen/);
  // F2 (26.09.2026): Speichern nimmt die Seite nicht mehr offline
  assert.doesNotMatch(texte(WISSEN['/dashboard/webseiten']), /wieder offline/);
  assert.match(texte(WISSEN['/dashboard/webseiten']), /sofort live/);
  assert.match(texte(WISSEN['/dashboard/rechte']), /darf ändern/);
  assert.match(texte(WISSEN['/dashboard/rechte']), /sensibel/);
  assert.match(texte(WISSEN['/dashboard/import']), /nicht/);
  // F7/F8 (26.09.2026): Automation startet pausiert, Sicherung ist vollständig
  assert.match(texte(WISSEN['/dashboard/automationen']), /PAUSIERT/);
  assert.match(texte(WISSEN['/dashboard/datensicherung']), /Zugangsdaten/);
  assert.match(texte(WISSEN['/dashboard/filialleitung']), /ohne Rückfrage/);
  // Der Knopf „Alle Module hier wieder aktivieren" wird NICHT empfohlen (Befund: blendet andere Module aus)
  assert.doesNotMatch(texte(WISSEN['/dashboard/filial-module']), /wieder aktivieren/);
});
