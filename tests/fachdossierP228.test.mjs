// Paket 228 (06.10.2026): Fachdossiers Logistik & Transport Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Logistik & Transport';
const WELLE = ['logistik', 'transport', 'postdienste', 'express-same-day-kurierdienst', 'umzugslogistik-moebelspedition',
  'container-dienst-containervermietung', 'baustellenlogistik-baustoff-transport', 'lagerlogistik-fulfillment',
  'chauffeur-limousinenservice', 'autotransport-ueberfuehrungsdienst'];
// Bereichs-Vorsicht Logistik: kein Tankkarten-Abgleich, kein Fahrerverhalten, keine Lenk-/Ruhezeiten, kein CMR-Versprechen, keine Maut
const VORSICHT = [/Tankkarte/i, /Fahrerverhalten/i, /Lenkzeit/i, /Ruhezeit/i, /CMR/i, /Maut/i, /Telematik/i, /GPS-Ortung/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i, /Marktpl/i, /Krankenfahrt/i];

test('Logistik Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Logistik-Vorsicht: keine Fahrerüberwachung, keine Tankkarten, nur Gebautes', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Krankenfahrten und Gefahrgut bleiben vorerst ohne Text', () => {
  assert.equal(FACH_TEXTE['fahrdienste-krankenfahrten'], undefined);
  assert.equal(FACH_TEXTE['gefahrguttransport-adr'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 110);
});
