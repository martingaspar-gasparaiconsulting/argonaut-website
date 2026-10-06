// Paket 229 (06.10.2026): Fachdossiers Immobilien & Verwaltung Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Immobilien & Verwaltung';
const WELLE = ['immobilienmakler', 'hausverwaltungen', 'miet-sondereigentumsverwaltung', 'weg-verwaltung', 'gewerbeimmobilien-verwaltung',
  'bautraeger', 'immobilienbewertung-gutachter', 'bausachverstaendiger-baugutachter', 'self-storage-lagerraumvermietung', 'coworking-space-betreiber'];
// Bereichs-Vorsicht Immobilien: keine Musterschreiben (Mieterhöhung, WEG-Einladung/Protokoll), keine Rechtsfolgen, kein GwG/MaBV
const VORSICHT = [/Mieterhöhung/i, /Indexmiete/i, /Versammlung/i, /Einladung/i, /Beschluss/i, /Musterschreiben/i, /GwG/i, /MaBV/i,
  /rechtssicher/i, /Nachforderung/i, /ausgeschlossen ist/i, /GEG/i];
// Nicht im Immobilien-Paket: Bautagebuch, Mängelliste aus Bau-LV, Foto-Markierung
const NICHT = [/Bautagebuch/i, /Mängelliste/i, /Markierung/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Fernhilfe/i, /Bankabruf/i, /Kalkulator/i];

test('Immobilien Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Immobilien-Vorsicht: keine Musterschreiben, keine Rechtsfolgen, nur Paket-Module', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Franchise und Wohnungsgenossenschaft bleiben vorerst ohne Text', () => {
  assert.equal(FACH_TEXTE['franchise'], undefined);
  assert.equal(FACH_TEXTE['wohnungsgenossenschaft'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 120);
});
