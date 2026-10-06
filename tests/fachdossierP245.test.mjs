// Paket 245 (06.10.2026): Fachdossiers Immobilien & Verwaltung Welle 2 (9 Branchen)
// Zurückgestellt: Franchise (Franchiserecht), Immobilien-Asset-Management (Kapitalanlage-Nähe),
// Wohnungsgenossenschaft (seit P229 bewusst ohne Text). Damit sind alle freien Immobilien-Betriebe ohne Sonderfall durch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Immobilien & Verwaltung';
const WELLE = ['immobilien-entwicklung', 'facility-management-immo', 'home-staging', 'immobilienfotografie', 'serviced-apartments-vermietung',
  'ferienimmobilien-vermittlung', 'immobilienberatung-consulting', 'wohnungsbaugesellschaft', 'baubetreuung-bauherrenberatung'];
// Vorsicht Immobilien (wie P229) + keine Rendite-/Kapitalanlage-Aussagen, keine Provision, keine Melde-/Kurtaxe-Pflichten
const VORSICHT = [/Mieterhöhung/i, /Indexmiete/i, /Versammlung/i, /Einladung/i, /Beschluss/i, /Musterschreiben/i, /GwG/i, /MaBV/i,
  /rechtssicher/i, /Nachforderung/i, /ausgeschlossen ist/i, /GEG/, /Energieausweis/i, /Rendite/i, /Kapitalanlage/i, /Wertsteigerung/i,
  /Provision/i, /Kurtaxe/i, /Meldeschein/i, /Dividende/i, /Garantie/i, /Haftung/i, /\bsicher\b/i, /Mietpreisbremse/i];
const NICHT = [/Bautagebuch/i, /Mängelliste/i, /Markierung/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i,
  /Housekeeping/i, /als Aufgabe/i];

test('Immobilien Welle 2: neun Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Immobilien-Vorsicht: keine Musterschreiben, Rendite- oder Pflichtaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['franchise', 'immobilien-asset-management', 'wohnungsgenossenschaft']) assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 277);
});
