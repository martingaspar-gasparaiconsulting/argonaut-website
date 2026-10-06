// Paket 230 (06.10.2026): Fachdossiers Marketing, Medien & Kreativ Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Marketing, Medien & Kreativ';
const WELLE = ['marketing-agenturen', 'werbeagenturen', 'fotografen', 'grafikdesign-grafikstudio', 'webdesign-agentur',
  'social-media-agentur', 'videoproduktion-imagefilm', 'eventagentur', 'pr-agenturen', 'copywriting-texterstellung'];
// Vorsicht Kreativ: keine Nutzungsrechte-Klauseln (Anwalt), kein Posten auf Plattformen per Login (in Vorbereitung),
// keine Reichweiten- oder Erfolgsversprechen, kein Influencer-Marketing
const VORSICHT = [/Nutzungsrecht/i, /Urheber/i, /Lizenzvertrag/i, /automatisch veröffentlich/i, /direkt posten/i, /Reichweite garantiert/i,
  /mehr Follower/i, /Influencer/i, /Klicks? steigern/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Veranstaltungs-Modul/i];

test('Kreativ Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Kreativ-Vorsicht: keine Rechte-Klauseln, kein Plattform-Posting, keine Erfolgsversprechen', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
  const paket = baueDossier({ slug: 'x', name: 'x', kategorie: KAT }).paket.map((m) => m.key).sort();
  assert.deepEqual(paket, ['agentur-kreativ', 'freigaben', 'projekt-abrechnung']);
});

test('Webdesign (Kreativ) und Webagentur (IT) sind eigenständig', () => {
  for (const f of ['titel', 'rolle', 'lead', 'ablaufTitel']) assert.notEqual(FACH_TEXTE['webdesign-agentur'][f], FACH_TEXTE['webentwicklung-webagentur'][f], f);
  assert.equal(FACH_TEXTE['influencer-marketing-agentur'], undefined);
  assert.equal(FACH_TEXTE['modelagentur'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 130);
});
