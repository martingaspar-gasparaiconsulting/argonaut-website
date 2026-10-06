// Paket 244 (06.10.2026): Fachdossiers Logistik & Transport Welle 2
// Zurückgestellt (zusätzlich zu P228): Luft-/Seefracht und Zoll (Außenwirtschaft), Werttransport, Schwer-/Großraumtransport
// (Genehmigungen), Silo-/Tanktransport (Gefahrgutnähe), Tiertransport (Tierschutz). Taxi/Mietwagen und Winterdienst später.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Logistik & Transport';
const WELLE = ['kuehl-tiefkuehllogistik', 'kran-hebetechnik-verleih', 'kontraktlogistik', 'getraenke-lebensmittellogistik',
  'automobil-fahrzeuglogistik', 'binnenschifffahrt-hafenlogistik', 'intralogistik-materialflussplanung',
  'palettendienst-ladungstraeger-management', 'distributions-stueckgutnetzwerk', 'busreise-reisebusverkehr'];
const VORSICHT = [/Tankkarte/i, /Fahrerverhalten/i, /Lenkzeit/i, /Ruhezeit/i, /CMR/i, /Maut/i, /Telematik/i, /GPS-Ortung/i,
  /Gefahrgut/i, /\bADR\b/, /Zoll/i, /HACCP/i, /Kühlkette/i, /Temperatur/i, /garantiert/i, /Garantie/i, /Haftung/i, /Versicher/i,
  /PBefG/, /Fahrgastrecht/i, /\bsicher\b/i, /\bUVV\b/, /DGUV/, /rechtssicher/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Marktpl/i, /Krankenfahrt/i, /Verleih/i];

test('Logistik Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Logistik-Vorsicht: keine Rechts-, Kühlketten- oder Sicherheitszusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['fahrdienste-krankenfahrten', 'gefahrguttransport-adr', 'luftfracht-seefracht-spedition', 'zoll-aussenhandelslogistik',
    'werttransport-geldlogistik', 'schwer-grossraumtransport', 'silo-tanktransport', 'lebendtier-tiertransport'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 268);
});
