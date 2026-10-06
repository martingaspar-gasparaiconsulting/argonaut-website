// Paket 222 (06.10.2026): Fachdossiers Dienstleistungen Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const KAT = 'Dienstleistungen';
const WELLE = ['reinigungsunternehmen', 'hausmeisterservice', 'gartenpflege-gruenanlagen-dienst', 'sicherheitsdienste', 'umzugsunternehmen',
  'facility-management-gebaeudemanagement', 'uebersetzungsbuero-dolmetscher', 'copyshop-druck-grafikservice', 'glas-fassadenreinigung', 'schluesseldienst'];
// Bewusst noch NICHT: Inkasso (Rechtsdienstleistung), Detektei, Seniorenbetreuung (Gesundheitsnähe), Bestattung, Tatortreinigung
const NOCH_NICHT = ['inkasso-forderungsmanagement', 'detektei-ermittlungsbuero', 'seniorenbetreuung-alltagshilfe', 'bestattungsunternehmen', 'tatort-extremreinigung'];

// Module, die ein Dienstleistungs-Betrieb NICHT hat — die Texte dürfen sie nicht versprechen.
const NICHT_IM_PAKET = [/Kalkulator/i, /Aufmaß/i, /Leistungskatalog/i, /Verleih/i, /Bautagebuch/i, /GAEB/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i];

test('Dienstleistungen Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.alltag.filter((a) => a.titel !== 'Die E-Rechnung kommt').length, 5, slug + ': fünf eigene Alltags-Karten');
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Nur Gebautes aus dem Dienstleistungs-Paket, keine Prozent- oder Zeitversprechen', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of NICHT_IM_PAKET) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
    assert.ok(!/garantiert|spart\s+\d/i.test(s), slug + ': Versprechen');
  }
  const paket = baueDossier({ slug: 'x', name: 'x', kategorie: KAT }).paket.map((m) => m.key);
  assert.deepEqual(paket.sort(), ['objektzeiten', 'tour', 'wartung'].sort());
});

test('Heikle Dienstleister sind bewusst noch ohne Text', () => {
  for (const s of NOCH_NICHT) assert.equal(FACH_TEXTE[s], undefined, s);
});

test('Feste Seiten sind branchenneutral (nicht nur Handwerk)', () => {
  const q = fs.readFileSync(path.join(WURZEL, 'lib/fachdossierHtml.ts'), 'utf8');
  const fest = q.slice(q.indexOf('export const TEAM'), q.indexOf('/** Das komplette Dossier'));
  assert.ok(fest.includes('Unterwegs') && fest.includes('Außendienst'), 'neutrale Fassung fehlt');
  assert.ok(!/Baustelle/.test(fest), 'Baustelle');
  assert.ok(!/Monteure/.test(fest), 'Monteure');
  assert.ok(!/im Handwerk/.test(fest), 'im Handwerk');
});

test('Handwerk bleibt bei 50 Texten, Titel passen auf die Titelseite', () => {
  const dl = Object.keys(FACH_TEXTE).filter((s) => WELLE.includes(s)).length;
  assert.equal(dl, 10);
  assert.ok(Object.keys(FACH_TEXTE).length >= 60);
  for (const [slug, t] of Object.entries(FACH_TEXTE)) {
    const kopf = t.titel.replace(/\s*Ein System\.$/, '');
    assert.ok(kopf.length <= 36, slug + ': ' + kopf);
  }
});
