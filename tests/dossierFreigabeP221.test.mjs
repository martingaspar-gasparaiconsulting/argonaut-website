// Paket 221 (06.10.2026): Dossiers „in rechtlicher Vorbereitung"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dossierRecht, GESPERRTE_BEREICHE, FREI_IN_TEILBEREICH } from '../out/dossierFreigabe.js';
import { baueDossier, dossierStand, dossierFertig, FACH_TEXTE } from '../out/fachdossier.js';
import { fachdossierCacheName, vorbereitungsSeite } from '../out/dossierAuslieferung.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('🔴 Gesundheit, Recht/Steuern/Finanzen und Tiere sind komplett gesperrt', () => {
  for (const kat of ['Gesundheit & Wellness', 'Recht, Steuern & Finanzen', 'Tiere']) {
    assert.ok(GESPERRTE_BEREICHE[kat], kat);
    const r = dossierRecht({ slug: 'irgendwas', kategorie: kat });
    assert.equal(r.frei, false); assert.equal(r.art, 'bereich');
  }
});

test('🟡 Teilbereiche: nur ausdrücklich genannte Betriebe sind frei, Unbekanntes ist gesperrt', () => {
  assert.equal(dossierRecht({ slug: 'friseure', kategorie: 'Sport, Beauty & Lifestyle' }).frei, false);
  assert.equal(dossierRecht({ slug: 'fitnessstudios', kategorie: 'Sport, Beauty & Lifestyle' }).frei, true);
  assert.equal(dossierRecht({ slug: 'einzelhandel', kategorie: 'Handel & E-Commerce' }).frei, false);
  assert.equal(dossierRecht({ slug: 'e-commerce', kategorie: 'Handel & E-Commerce' }).frei, false);
  assert.equal(dossierRecht({ slug: 'grosshandel', kategorie: 'Handel & E-Commerce' }).frei, true);
  assert.equal(dossierRecht({ slug: 'gastronomie', kategorie: 'Gastronomie, Hotellerie & Tourismus' }).frei, false);
  assert.equal(dossierRecht({ slug: 'hotels', kategorie: 'Gastronomie, Hotellerie & Tourismus' }).frei, true);
  assert.equal(dossierRecht({ slug: 'baeckereien', kategorie: 'Lebensmittel & Nahversorgung' }).frei, false);
  assert.equal(dossierRecht({ slug: 'neu-erfunden', kategorie: 'Handel & E-Commerce' }).frei, false);
  for (const liste of Object.values(FREI_IN_TEILBEREICH)) assert.equal(new Set(liste).size, liste.length);
});

test('Alle anderen Bereiche sind frei — das komplette Handwerk eingeschlossen', () => {
  for (const kat of ['Handwerk & Bau', 'Dienstleistungen', 'Industrie & Produktion', 'IT & Technologie']) {
    assert.equal(dossierRecht({ slug: 'x', kategorie: kat }).frei, true, kat);
  }
  for (const slug of Object.keys(FACH_TEXTE)) {
    assert.equal(dossierFertig({ slug, name: slug, kategorie: 'Handwerk & Bau' }), true, slug);
  }
});

test('Gesperrtes Dossier: nie fertig, Lücke benannt, zählt als gesperrt', () => {
  const zahn = { slug: 'zahnaerzte', name: 'Zahnärzte', kategorie: 'Gesundheit & Wellness' };
  const d = baueDossier(zahn);
  assert.ok(d.gesperrt); assert.equal(d.entwurf, true);
  assert.match(d.luecken[0], /In rechtlicher Vorbereitung/);
  assert.equal(dossierFertig(zahn), false);
  const s = dossierStand([zahn, { slug: 'elektriker', name: 'E', kategorie: 'Handwerk & Bau' }, { slug: 'x', name: 'X', kategorie: 'IT & Technologie' }]);
  assert.deepEqual([s.gesperrt, s.fertig, s.entwurf], [1, 1, 1]);
});

test('Cache-Name wechselt mit jedem Text — nie eine alte Fassung aus dem Speicher', () => {
  const a = fachdossierCacheName('elektriker', 'fd1', 'Text A');
  assert.match(a, /^fach-fd1-elektriker-[a-z0-9]+\.pdf$/);
  assert.notEqual(a, fachdossierCacheName('elektriker', 'fd1', 'Text B'));
  assert.equal(a, fachdossierCacheName('elektriker', 'fd1', 'Text A'));
  assert.doesNotMatch(fachdossierCacheName('../x', 'fd1', ''), /\.\./);
});

test('Hinweisseite: escaped, ohne Skript', () => {
  const h = vorbereitungsSeite('<b>Zahnärzte</b>', 'Grund', 'In rechtlicher Vorbereitung');
  assert.doesNotMatch(h, /<b>Zahn/);
  assert.doesNotMatch(h, /<script/);
  assert.match(h, /In rechtlicher Vorbereitung/);
});

test('Verdrahtung: öffentliche Route sperrt zuerst, liefert dann das Fachdossier', () => {
  const r = lies('app/api/oeffentlich/dossier-pdf/route.ts');
  assert.ok(r.indexOf('dossierRecht(b)') < r.indexOf('dossierFertig('), 'Sperre vor Auslieferung');
  assert.match(r, /fachdossierHtml\(baueDossier/);
  assert.match(lies('lib/fachdossierHtml.ts'), /IN RECHTLICHER VORBEREITUNG/);
});
