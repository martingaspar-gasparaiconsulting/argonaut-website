// Paket 234 (06.10.2026): Fachdossiers Handel & E-Commerce — freie 🟡-Betriebe (ohne Ladenkasse, ohne Webshop)
// Dazu: In den 🟡-Bereichen nennt das Dossier Kasse und Shop nicht mehr als Paket-Modul.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import { FREI_IN_TEILBEREICH, OHNE_IN_TEILBEREICH, weglassenImDossier } from '../out/dossierFreigabe.js';

const KAT = 'Handel & E-Commerce';
const WELLE = ['grosshandel', 'kuechenstudios', 'badstudios', 'baustoffhandel', 'fliesen-sanitaer-heizungshandel',
  'landmaschinenhandel', 'baumaschinenhandel', 'kaminofen-ofenstudios', 'pool-schwimmbadfachhandel'];
// Vorsicht Handel: keine Finanzierung, keine Garantie-/Gewährleistungs-Zusagen, keine Förderung, keine Abnahme-/Normaussagen
const VORSICHT = [/Garantie/i, /Gewährleist/i, /Finanzier/i, /Leasing/i, /Kredit/i, /Förder/i, /Zuschuss/i, /Abnahme durch/i,
  /Schornsteinfeger/i, /zugelassen/i, /konform/i, /rechtssicher/i, /Haftung/i, /UVV/i, /Rabatt/i, /günstig/i];
// Nicht im Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Gutschein/i, /Wartung/i, /Kalkulator/i, /Aufmaß/i,
  /Bautagebuch/i, /Leistungskatalog/i, /Chargen/i, /Etikett/i, /Großhändler-Anbindung|direkt angebunden/i];

test('Handel 🟡: neun freie Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  assert.deepEqual([...WELLE].sort(), [...FREI_IN_TEILBEREICH[KAT]].sort(), 'Welle = genau die freie Positivliste');
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

test('Handel-Vorsicht: keine Zusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('🟡-Bereiche: Kasse und Shop fehlen im Paket, Kasse-TSE nicht unter „in Vorbereitung"; andere Bereiche unberührt', () => {
  assert.deepEqual([...OHNE_IN_TEILBEREICH].sort(), ['kasse', 'shop']);
  for (const kat of Object.keys(FREI_IN_TEILBEREICH)) {
    // Paket 237 bewusst angepasst: Sport lässt zusätzlich „wellness“ weg — hier nur noch: Shop und Kasse sind immer dabei
    assert.deepEqual([...weglassenImDossier(kat)].slice(0, 2), ['shop', 'kasse'], kat);
    const d = baueDossier({ slug: FREI_IN_TEILBEREICH[kat][0], name: 'x', kategorie: kat });
    const keys = d.paket.map((m) => m.key);
    assert.ok(!keys.includes('kasse') && !keys.includes('shop'), kat + ': ' + keys.join(','));
    assert.ok(!d.vorbereitung.some((v) => /Kasse/.test(v.was)), kat + ': Kasse in Vorbereitung');
    assert.ok(keys.length > 0, kat + ': Paket leer');
  }
  assert.deepEqual([...weglassenImDossier('Handwerk & Bau')], []);
  assert.deepEqual([...weglassenImDossier('')], []);
});

test('Gesperrte Handel-Branchen bleiben gesperrt; Zählung', () => {
  for (const s of ['einzelhandel', 'e-commerce', 'buchhandlungen', 'blumenhandel-floristik']) {
    const d = baueDossier({ slug: s, name: s, kategorie: KAT });
    assert.ok(d.gesperrt, s);
    assert.equal(FACH_TEXTE[s], undefined, s);
  }
  assert.ok(Object.keys(FACH_TEXTE).length >= 169);
});
