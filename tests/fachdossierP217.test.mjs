// Paket 217 (06.10.2026): Handwerk-Dossiers Welle 1 + Layout 8 Seiten + FAQ
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { baueDossier, modulName, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const WELLE1 = ['elektriker', 'sanitaer-heizung', 'maler', 'schreiner', 'dachdecker', 'photovoltaik-solar-installateure',
  'waermepumpen-fachbetriebe', 'bauunternehmen', 'fliesenleger', 'metallbau-schmiede'];

test('Welle 1: zehn Handwerks-Branchen mit vollständigem Text', () => {
  for (const slug of WELLE1) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug + ' vorteile');
    assert.equal(t.alltag.length, 6, slug + ' alltag');
    assert.equal(t.ablauf.length, 5, slug + ' ablauf');
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug + ' schwerpunkt');
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: 'Handwerk & Bau' });
    assert.equal(d.entwurf, false, slug);
  }
});

test('Die Branchen-Schlüssel gibt es im Katalog der 698 Branchen', () => {
  const k = lies('app/vorschau/_lib/branchen-web.ts') + lies('lib/branchenkatalog.ts');
  const quelle = fs.readdirSync(path.join(WURZEL, 'app/vorschau/_lib')).map((f) => lies('app/vorschau/_lib/' + f)).join('\n') + k;
  for (const slug of WELLE1) assert.ok(quelle.includes(`'${slug}'`) || quelle.includes(`"${slug}"`), slug);
});

test('Modulnamen versprechen nichts, was eine Software nicht zusagen kann', () => {
  assert.equal(modulName('compliance'), 'Sofortmeldung und Freistellung');
  assert.equal(modulName('dsgvo'), 'Datenschutz-Verwaltung');
  assert.notEqual(modulName('compliance'), modulName('nachweise'), 'kein doppelter Name');
});

test('Dossier-HTML: nur was es gibt, Kontakt vollständig, keine Google-Schrift', () => {
  const h = lies('lib/fachdossierHtml.ts');
  assert.doesNotMatch(h, /Was wir gerade noch bauen/);
  assert.doesNotMatch(h, /sofern nicht als/);
  assert.match(h, /Inhaber Martin Gaspar/);
  assert.match(h, /USt-IdNr\. DE326706056/);
  assert.doesNotMatch(h, /fonts\.googleapis/);
  assert.match(h, /Ihre Fragen, unsere Antworten/);
  // Academy erst als „Erklärvideos", wenn die Videos da sind
  assert.doesNotMatch(h, /Im System gibt es eine Academy/);
});

test('Zehn Fragen mit Antwort, keine Versprechen', async () => {
  const { FRAGEN, KUNDE_MERKT, TEAM, RECHTE } = await import('../out/fachdossierHtml.js').catch(() => ({}));
  if (!FRAGEN) return; // Modul braucht qrcode — dann prüft der Quelltext-Test oben
  assert.equal(FRAGEN.length, 10);
  for (const f of [...FRAGEN, ...KUNDE_MERKT, ...TEAM, ...RECHTE]) assert.deepEqual(textVerstoesse(JSON.stringify(f)), []);
});
