// Paket 235 (06.10.2026): Fachdossiers Gastronomie, Hotellerie & Tourismus — freie 🟡-Betriebe, Teil 1 (10 von 14)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import { FREI_IN_TEILBEREICH } from '../out/dossierFreigabe.js';

const KAT = 'Gastronomie, Hotellerie & Tourismus';
const WELLE = ['hotels', 'catering', 'reisebueros', 'eventmanagement', 'ferienwohnung-ferienhaus', 'hostel-jugendherberge',
  'boardinghouse-serviced-apartments', 'campingplatz-wohnmobilstellplatz', 'ferienpark-feriendorf', 'tagungs-konferenzhotel'];
// Vorsicht Gastro/Tourismus: keine Melde-, Abgaben- und Steuerthemen, kein Reiserecht, keine Pflicht-/Hygiene-Zusagen
const VORSICHT = [/Kurtaxe/i, /Meldeschein/i, /Trinkgeld/i, /Steuer/i, /Mindestlohn/i, /Minijob/i, /(?<!Grund)gebühr/i, /Pauschal/i,
  /Pflicht/i, /Reiserecht/i, /Sicherungsschein/i, /Insolvenz/i, /Hygiene/i, /HACCP/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i,
  /Buchungsportal/i, /Channel/i, /Storno/i];
// Nicht im Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Gutschein/i, /Tour\b/i, /Wartung/i, /Provision/i,
  /Charge/i, /Lieferdienst/i];

test('Gastro 🟡 Teil 1: zehn freie Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    assert.ok(FREI_IN_TEILBEREICH[KAT].includes(slug), slug + ' steht nicht in der Positivliste');
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
    assert.ok(!d.paket.some((m) => m.key === 'kasse'), slug + ': Kasse im Paket');
  }
});

test('Gastro-Vorsicht: keine Abgaben, kein Reiserecht, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Gesperrte Gastro-Branchen bleiben ohne Text; Zählung', () => {
  for (const s of ['restaurants', 'cafes', 'baeckereien', 'bars-kneipen']) {
    if (!FREI_IN_TEILBEREICH[KAT].includes(s)) assert.equal(FACH_TEXTE[s], undefined, s);
  }
  const d = baueDossier({ slug: 'restaurants', name: 'Restaurants', kategorie: KAT });
  assert.ok(d.gesperrt);
  assert.ok(Object.keys(FACH_TEXTE).length >= 179);
});
