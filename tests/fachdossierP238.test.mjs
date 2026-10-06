// Paket 238 (06.10.2026): Fachdossiers 🟡 — Sport, Beauty & Lifestyle Teil 2 (9). Schützenverein bewusst zurückgestellt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import { FREI_IN_TEILBEREICH } from '../out/dossierFreigabe.js';

const SPORT = 'Sport, Beauty & Lifestyle';
const WELLE = ['bootcamp-outdoor-fitness', 'reitschule-reitstall', 'tauchschule-tauchcenter', 'schwimmschule-aquafitness',
  'golfclub-golfschule', 'tennis-racketsportcenter', 'kletter-alpinschule', 'ski-snowboardschule', 'kosmetikschule-beauty-akademie'];
// Vorsicht: nichts Gesundheitliches, keine Tierdaten, keine Sicherheits-/Tauglichkeitszusagen, keine Abschlüsse/Zulassungen, nichts Steuerliches
const VORSICHT = [/Gesundheit/i, /Therapie/i, /Behandlung/i, /Attest/i, /tauglich/i, /Verletz/i, /Unfall/i, /sicher(?!ung)/i, /Risiko/i,
  /Tierarzt/i, /Impf/i, /Hufschmied/i, /Futterplan/i, /Zertifi/i, /Brevet/i, /Lizenz/i, /Abschluss/i, /staatlich/i, /anerkannt/i,
  /ZFU/i, /Förder/i, /Bildungsgutschein/i, /(?<!Konflikt)prüfung/i, /Steuer/i, /Übungsleiter/i, /Versammlung/i, /Satzung/i, /Wellness/i,
  /Waffe/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i];
// Nicht im Sport-Paket (Verleih, Kasse, Shop, Gutscheine nicht nennen)
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Gutschein/i, /Zehnerkarte/i, /Verleih/i, /Rückgabe/i,
  /Wartung/i, /Charge/i, /Etikett/i, /Tour\b/i];

test('🟡 Sport Teil 2: neun freie Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    assert.ok(FREI_IN_TEILBEREICH[SPORT].includes(slug), slug + ' steht nicht in der Positivliste');
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: SPORT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Sport-Vorsicht: keine Zusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Alle freien 🟡-Betriebe haben Text — außer dem bewusst zurückgestellten Schützenverein; Zählung', () => {
  for (const [kat, liste] of Object.entries(FREI_IN_TEILBEREICH)) {
    for (const s of liste) {
      if (s === 'schuetzen-schiesssportverein') assert.equal(FACH_TEXTE[s], undefined, s);
      else assert.ok(FACH_TEXTE[s], kat + ': frei ohne Text: ' + s);
    }
  }
  assert.ok(Object.keys(FACH_TEXTE).length >= 208);
});
