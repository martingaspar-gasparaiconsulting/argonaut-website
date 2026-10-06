// Paket 223 (06.10.2026): Fachdossiers Industrie & Produktion Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Industrie & Produktion';
const WELLE = ['zerspanungstechnik-cnc', 'maschinenbau', 'moebel', 'druckereien', 'kunststofftechnik-spritzguss', 'werkzeug-formenbau',
  'blech-umformtechnik', 'schaltanlagen-steuerungsbau', 'elektronikfertigung-leiterplatten', 'saegewerk-holzindustrie'];
// Module, die ein Industrie-Betrieb NICHT hat — die Texte dürfen sie nicht versprechen.
const NICHT_IM_PAKET = [/Kalkulator/i, /Aufmaß/i, /Leistungskatalog/i, /Verleih/i, /Bautagebuch/i, /GAEB/i, /Kasse/i, /Webshop/i,
  /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /\bTour\b/, /Objektzeit/i, /HACCP/i, /Maschinenanbindung/i];

test('Industrie Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Nur Gebautes aus dem Industrie-Paket, keine Prozent- oder Zeitversprechen', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of NICHT_IM_PAKET) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
    assert.ok(!/garantiert|spart\s+\d/i.test(s), slug + ': Versprechen');
  }
  const paket = baueDossier({ slug: 'x', name: 'x', kategorie: KAT }).paket.map((m) => m.key).sort();
  assert.deepEqual(paket, ['bde', 'chargen', 'fertigung', 'pruefprotokolle', 'wartung', 'zuschnitt']);
});

test('Lebensmittelproduktion bleibt ohne Text (HACCP liegt nicht im Industrie-Paket)', () => {
  assert.equal(FACH_TEXTE['lebensmittelproduktion'], undefined);
  assert.equal(FACH_TEXTE['chemische-industrie'], undefined);
});

test('Copyshop und Druckerei sind eigenständig', () => {
  const a = FACH_TEXTE['copyshop-druck-grafikservice'];
  const b = FACH_TEXTE['druckereien'];
  for (const f of ['titel', 'rolle', 'lead', 'ablaufTitel']) assert.notEqual(a[f], b[f], f);
  assert.ok(Object.keys(FACH_TEXTE).length >= 70);
});
