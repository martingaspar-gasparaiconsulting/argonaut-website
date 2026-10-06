// Paket 247 (06.10.2026): Fachdossiers Landwirtschaft, Garten & Forst Welle 2
// Zurückgestellt: Tierhaltung (Rinder, Schweine, Geflügel, Fisch, Alm — Tierschutz/Tierarzneimittel), Wein (Alkohol),
// Kräuter/Heilpflanzen (Gesundheitsaussagen), Landhandel und Saatgut (Pflanzenschutz-/Saatgutrecht), Kompost (Abfallrecht).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Landwirtschaft, Garten & Forst';
const WELLE = ['gaertnereien-baumschulen', 'gartengestaltung', 'pilzzucht', 'gemuesebaubetriebe', 'zierpflanzen-staudengaertnereien',
  'hopfenanbau', 'weihnachtsbaumkulturen', 'ackerbaubetriebe', 'rollrasen-rasenproduktion', 'teichbau-teichanlagen'];
// Vorsicht Agrar (wie P231) + keine Rechts-/Bio-/Gesundheitsaussagen
const VORSICHT = [/\d+\s*Tage/i, /konform/i, /Verkehrssicherung/i, /Haftung/i, /Förder/i, /rechtssicher/i, /Tierarzt/i, /Behandlung/i,
  /Pflicht/i, /DüV|Düngeverordnung/i, /Bio-?zertifiz|\bÖko-?Kontrolle/i, /Heil/i, /Garantie/i, /Alkohol/i];
const NICHT = [/Wartung/i, /\bTour\b/, /Leistungskatalog/i, /aus dem Katalog/i, /Kalkulator/i, /Aufmaß/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Bankabruf/i];

test('Agrar Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Agrar-Vorsicht: keine Pflicht-, Fristen- oder Gesundheitsaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['schweinezucht-mast', 'gefluegelhoefe-legehennen', 'rinderzucht-mutterkuhhaltung', 'weinbau-winzerbetriebe',
    'kraeuter-heilpflanzenanbau', 'agrar-landhandel', 'kompost-erdenwerke']) assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 297);
});
