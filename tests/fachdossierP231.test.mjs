// Paket 231 (06.10.2026): Fachdossiers Landwirtschaft, Garten & Forst Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Landwirtschaft, Garten & Forst';
const WELLE = ['landwirtschaft', 'gartenbau', 'forstwirtschaft', 'forstserviceunternehmen', 'lohnunternehmen-agrardienstleister',
  'baumpflege-arboristik', 'brennholz-kaminholzhandel', 'obstbaubetriebe-obsthoefe', 'milchviehbetriebe', 'spargel-erdbeerhoefe'];
// Vorsicht Agrar: keine Rechtsfristen in Tagen, kein „konform", keine Verkehrssicherungs-/Haftungsaussage, keine Förderzusage
const VORSICHT = [/\d+\s*Tage/i, /konform/i, /Verkehrssicherung/i, /Haftung/i, /Förder/i, /rechtssicher/i, /Tierarzt/i, /Behandlung/i];
// Nicht im Agrar-Paket: Wartungsverträge, Tour, Leistungskatalog, Kalkulator, Aufmaß; abgeschaltet: Kasse, Shop
const NICHT = [/Wartung/i, /\bTour\b/, /Leistungskatalog/i, /aus dem Katalog/i, /Kalkulator/i, /Aufmaß/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Bankabruf/i];

test('Agrar Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Agrar-Vorsicht: keine Rechtsfristen, keine Haftungsaussagen, nur Paket-Module', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Weitere Agrar-Branchen folgen; Zählung', () => {
  assert.equal(FACH_TEXTE['weinbau-winzerbetriebe'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 140);
});
