// Paket 237 (06.10.2026): Fachdossiers 🟡 — Lebensmittel Rest (2) und Sport, Beauty & Lifestyle Teil 1 (8)
// Dazu: Sport-Dossiers nennen das Modul „Gesundheit & Wellness“ nicht (Anwalt 3.20).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import { FREI_IN_TEILBEREICH, ZUSAETZLICH_OHNE, weglassenImDossier } from '../out/dossierFreigabe.js';

const LM = 'Lebensmittel & Nahversorgung';
const SPORT = 'Sport, Beauty & Lifestyle';
const WELLE = [
  ['vegane-pflanzliche-manufakturen', LM], ['suppen-feinkostmanufakturen', LM],
  ['fitnessstudios', SPORT], ['sportvereine', SPORT], ['yogastudios', SPORT], ['pilatesstudios', SPORT], ['kampfsportschulen', SPORT],
  ['tanzschulen', SPORT], ['ems-personal-training', SPORT], ['crossfit-box-functional-fitness', SPORT],
];
// Vorsicht: nichts Gesundheitliches, keine Wirkversprechen, nichts Steuerliches/Vereinsrechtliches, keine Zusagen
const VORSICHT = [/Gesundheit/i, /Therapie/i, /Behandlung/i, /Patient/i, /Diagnose/i, /Attest/i, /Verletz/i, /Rücken/i, /Abnehm/i,
  /Gewicht/i, /heil/i, /Krankenkasse/i, /Prävention/i, /Wellness/i, /Steuer/i, /Übungsleiter/i, /Versammlung/i, /Satzung/i,
  /Pauschale/i, /Zuwendung/i, /gemeinnützig/i, /Pflicht/i, /zertifiz/i, /Bio\b/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i];
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Gutschein/i, /Zehnerkarte/i, /Wartung/i];
const NICHT_SPORT = [/Charge/i, /Etikett/i, /Tour\b/i, /Rezept/i];

test('🟡 Lebensmittel Rest + Sport Teil 1: zehn freie Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const [slug, kat] of WELLE) {
    assert.ok(FREI_IN_TEILBEREICH[kat].includes(slug), slug + ' steht nicht in der Positivliste');
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: kat });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Vorsicht: keine Gesundheits- oder Wirkversprechen, nur Paket-Module, keine Prozente', () => {
  for (const [slug, kat] of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT, ...(kat === SPORT ? NICHT_SPORT : [])]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Sport-Dossiers ohne „Gesundheit & Wellness“, Kasse und Shop; andere Bereiche behalten ihre Module', () => {
  assert.deepEqual([...ZUSAETZLICH_OHNE[SPORT]], ['wellness']);
  assert.deepEqual([...weglassenImDossier(SPORT)].sort(), ['kasse', 'shop', 'wellness']);
  assert.deepEqual([...weglassenImDossier(LM)].sort(), ['kasse', 'shop']);
  for (const s of FREI_IN_TEILBEREICH[SPORT]) {
    const d = baueDossier({ slug: s, name: s, kategorie: SPORT });
    const keys = d.paket.map((m) => m.key);
    for (const k of ['wellness', 'kasse', 'shop']) assert.ok(!keys.includes(k), s + ': ' + k);
    assert.ok(keys.includes('mitglieder') && keys.includes('buchungen'), s);
  }
});

test('Lebensmittel damit komplett; gesperrte Sport-Branchen ohne Text; Zählung', () => {
  for (const s of FREI_IN_TEILBEREICH[LM]) assert.ok(FACH_TEXTE[s], 'Lebensmittel frei ohne Text: ' + s);
  for (const s of ['friseure', 'kosmetik', 'tattoo-studios', 'day-spa-wellnesscenter', 'schuetzen-schiesssportverein']) assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 199);
});
