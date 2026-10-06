// Paket 225 (06.10.2026): Fachdossiers Fahrzeuge & Mobilität Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Fahrzeuge & Mobilität';
const WELLE = ['kfz-werkstaetten', 'kfz-handel', 'autolackiererei-karosseriebau', 'fahrradhandel-werkstatt', 'reifenhandel',
  'motorradwerkstatt', 'abschleppdienst-pannenhilfe', 'autovermietung', 'nutzfahrzeug-lkw-werkstatt', 'autoglas-steinschlagreparatur'];
// Bereichs-Vorsicht Kfz: keine Schadenabwicklung, keine Haftungsargumente, keine Verwertung, kein GwG-Versprechen
const KFZ_VERBOTEN = [/Schaden/i, /Versicher/i, /Haftung/i, /verwert/i, /GwG/i, /Gutacht/i];
const NICHT_IM_PAKET = [/Kalkulator/i, /Aufmaß/i, /Bautagebuch/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Leasing/i];

test('Fahrzeuge Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Kfz-Vorsicht: keine Schadenabwicklung, Haftung, Verwertung, Gutachten oder GwG in den Texten', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...KFZ_VERBOTEN, ...NICHT_IM_PAKET]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Sachverständige und Autowäsche bleiben vorerst ohne Text', () => {
  assert.equal(FACH_TEXTE['kfz-sachverstaendige-gutachter'], undefined);
  assert.equal(FACH_TEXTE['autowaesche-autopflege'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 80);
});
