// Paket 226 (06.10.2026): Fachdossiers IT & Technologie Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'IT & Technologie';
const WELLE = ['it-dienstleister', 'edv-pc-reparatur-computerservice', 'softwareentwicklung', 'webentwicklung-webagentur', 'it-systemhaus',
  'it-beratung-consulting', 'managed-service-provider-msp', 'netzwerktechnik', 'app-entwicklung-mobile', 'voip-telefonanlagen'];
// Nicht im IT-Paket bzw. abgeschaltet: Werkstatt-Board, Prüfprotokolle, Wartungsvertrags-Vorlagen, Fernhilfe/Fernwartung, Kasse
const NICHT = [/Werkstatt-Board/i, /Prüfprotokoll/i, /Wartungsvertrag/i, /Fernhilfe/i, /Fernwartung/i, /Bildschirm teilen/i, /Kasse/i,
  /Webshop/i, /WhatsApp/i, /Bankabruf/i, /Kalkulator/i, /Aufmaß/i];

test('IT Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Nur Gebautes aus dem IT-Paket, keine Prozentversprechen', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of NICHT) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
  const paket = baueDossier({ slug: 'x', name: 'x', kategorie: KAT }).paket.map((m) => m.key).sort();
  assert.deepEqual(paket, ['itassets', 'it-msp', 'projekt-abrechnung'].sort());
});

test('Kassensysteme und externe Datenschutzberatung bleiben vorerst ohne Text', () => {
  assert.equal(FACH_TEXTE['kassensysteme-pos'], undefined);
  assert.equal(FACH_TEXTE['datenschutzberatung-ext-dsb'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 90);
});
