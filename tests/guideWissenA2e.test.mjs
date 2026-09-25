// Paket A2e (25.09.2026) — Wissensbasis Betrieb & Branchen: 75 Seiten, jede am echten Code geprueft.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WISSEN, wissenFuer } from '../out/guideWissen.js';
import { modulGuide } from '../out/kiGuideModule.js';

const RECHTE = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
const BETRIEB = [...RECHTE.matchAll(/href: '(\/dashboard[^']*)'[^\n]*gruppe: 'betrieb'/g)].map((m) => m[1]);
const NUR_CHEF = new Set([...RECHTE.matchAll(/href: '(\/dashboard[^']*)'[^\n]*nurChef: true/g)].map((m) => m[1]));
const texte = (w) => [w.zweck, w.werText, ...w.schritte, w.probe?.anlegen ?? '', w.probe?.loeschen ?? ''].join(' ');

test('Jede Betriebs-/Branchen-Seite im Menue hat einen Eintrag', () => {
  assert.ok(BETRIEB.length >= 75, `nur ${BETRIEB.length}`);
  for (const href of BETRIEB) assert.ok(WISSEN[href], `fehlt: ${href}`);
});

test('Jetzt hat JEDE Menue-Seite Wissen — kein Einheitssatz mehr', () => {
  const alle = [...RECHTE.matchAll(/\{ label: '[^']+', href: '(\/dashboard[^']*)'/g)].map((m) => m[1]);
  const fehlt = alle.filter((h) => !WISSEN[h]);
  assert.deepEqual(fehlt, []);
});

test('Nur-Chef-Seiten sagen das auch', () => {
  for (const href of BETRIEB) if (NUR_CHEF.has(href)) assert.match(WISSEN[href].werText, /Chef|Geschäftsführung/, href);
});

test('Unterseiten bekommen ihr eigenes Wissen, nicht das der Elternseite', () => {
  for (const href of ['/dashboard/kfz/schaden', '/dashboard/gastro/meldeschein', '/dashboard/tier/got', '/dashboard/bau-lv/ablaeufe']) {
    assert.equal(wissenFuer(href).href, href);
    assert.equal(modulGuide(href, [{ label: 'X', href }]).nachricht, WISSEN[href].zweck, href);
  }
});

test('Kernaussagen stimmen mit dem Code', () => {
  // Aufmass liest „1.234" bewusst als 1,234 (Martins Entscheidung 25.09.)
  assert.match(texte(WISSEN['/dashboard/aufmass']), /1,234/);
  // KFZ: Fahrzeug loeschen hat keine Rueckfrage — der Guide warnt
  assert.match(texte(WISSEN['/dashboard/kfz']), /ohne Rückfrage/);
  // Tankkarten sind nur fuer den Chef
  assert.match(WISSEN['/dashboard/logistik/tankkarten'].werText, /Nur der Chef/);
  // GwG: Mitarbeiter sehen nur eigene Faelle
  for (const h of ['/dashboard/kanzlei/gwg', '/dashboard/immobilien/gwg', '/dashboard/kfz/gwg']) {
    assert.match(WISSEN[h].werText, /nur (ihre|die) eigenen/i, h);
  }
});

test('GOT-Rechner: „In die Tierakte übernehmen" setzt den Betrieb als Besitzer (sonst scheitert das Speichern)', () => {
  const src = fs.readFileSync(new URL('../app/dashboard/tier/got/page.tsx', import.meta.url), 'utf8');
  const insert = src.slice(src.indexOf("from('tier_behandlungen').insert"), src.indexOf("from('tier_behandlungen').insert") + 200);
  assert.match(insert, /owner_user_id: besitzer/);
  assert.match(src, /rpc\('mein_chef_id'\)/);
});
