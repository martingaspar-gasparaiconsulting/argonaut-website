// Paket 243 (06.10.2026): Fachdossiers Energie & Umwelt Welle 2
// Zurückgestellt: Nachhaltigkeitsberatung (Umweltaussagen/Greenwashing), Sonderabfall/Gefahrgut, Altlasten/Bodensanierung,
// Energieversorger/Stadtwerke und Netzbetrieb (Energierecht, Netzentgelte).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Energie & Umwelt';
const WELLE = ['wasserwirtschaft', 'erneuerbare-energien', 'biogasanlagen-betrieb', 'solarpark-freiflaechen-pv', 'geothermie-erdwaerme',
  'fernwaerme-waermenetze', 'elektroschrott-weee-recycling', 'abwassertechnik-klaeranlagenbau', 'trinkwasseraufbereitung-wassertechnik',
  'wasserstofftechnik-h2'];
// Vorsicht Energie/Umwelt: keine Förderzusagen, keine Rechts-/Normbezüge, keine Grenzwert- oder Klimaversprechen
const VORSICHT = [/Förderung sicher/i, /garantiert/i, /beantragen wir/i, /stellt den Antrag/i, /Zuschuss von/i, /bis zu \d/i,
  /Garantie/i, /Haftung/i, /Umsatzsteuer|Steuerberat|steuerlich/i, /EEG/, /Einspeisevergütung/i, /Grenzwert/i, /Genehmigung/i,
  /Trinkwasserverordnung|TrinkwV/i, /BImSchG|ElektroG|KrWG/, /\bDIN\b/, /\bISO\b/, /DVGW/, /zertifiz/i, /konform/i, /rechtssicher/i,
  /klimaneutral/i, /CO₂-neutral|CO2-neutral/i, /Gefahrstoff/i, /Gefahrgut/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Gutschrift/i, /eANV/i, /Wiegeschein/i];

test('Energie Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Energie-Vorsicht: keine Förder-, Rechts- oder Klimaversprechen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['nachhaltigkeit', 'sonderabfall-gefahrgutentsorgung', 'altlasten-bodensanierung', 'energieversorger-stadtwerke',
    'stromnetze-netzbetrieb']) assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 258);
});
