// Paket 227 (06.10.2026): Fachdossiers Energie & Umwelt Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Energie & Umwelt';
const WELLE = ['photovoltaik-solarteure', 'waermepumpen-fachbetriebe-energie', 'gebaeudeenergieberatung', 'recycling-entsorgung',
  'abfallwirtschaft-muellentsorgung', 'schrott-metallrecycling', 'kanalsanierung-rohrreinigung', 'windkraft-service-wartung',
  'blockheizkraftwerke-kwk', 'schadstoff-asbestsanierung'];
// Fördermittel nur als Fristen-Überblick: keine Zusage, keine Beträge, keine Antragstellung durch ARGONAUT
const FOERDER_VERBOTEN = [/Förderung sicher/i, /garantiert/i, /beantragen wir/i, /stellt den Antrag/i, /Zuschuss von/i, /bis zu \d/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Gutschrift/i, /eANV/i, /Wiegeschein/i];

test('Energie Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.filter((a) => a.titel !== 'Die E-Rechnung kommt').length, 5, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Fördermittel nur als Fristen-Überblick, nur Gebautes, keine Prozentversprechen', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...FOERDER_VERBOTEN, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Energie-Fassungen von PV und Wärmepumpe unterscheiden sich vom Handwerk', () => {
  for (const [a, b] of [['photovoltaik-solarteure', 'photovoltaik-solar-installateure'], ['waermepumpen-fachbetriebe-energie', 'waermepumpen-fachbetriebe']]) {
    for (const f of ['titel', 'rolle', 'lead', 'ablaufTitel']) assert.notEqual(FACH_TEXTE[a][f], FACH_TEXTE[b][f], a + ' ' + f);
  }
  assert.ok(Object.keys(FACH_TEXTE).length >= 100);
});
