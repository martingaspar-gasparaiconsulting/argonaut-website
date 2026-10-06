// Paket 236 (06.10.2026): Fachdossiers 🟡 — Gastronomie Rest (4) und Lebensmittel & Nahversorgung Teil 1 (6)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import { FREI_IN_TEILBEREICH } from '../out/dossierFreigabe.js';

const GASTRO = 'Gastronomie, Hotellerie & Tourismus';
const LM = 'Lebensmittel & Nahversorgung';
const WELLE = [
  ['reiseveranstalter-pauschalreisen', GASTRO], ['bus-gruppenreiseunternehmen', GASTRO], ['stadtfuehrung-gaestefuehrer', GASTRO],
  ['kochschule-erlebniskueche', GASTRO], ['partyservice', LM], ['sektkellereien', LM], ['nudel-pastamanufakturen', LM],
  ['oelmuehlen-speiseoelmanufakturen', LM], ['senf-essigmanufakturen', LM], ['marmeladen-fermentationsmanufakturen', LM],
];
// Vorsicht: kein Reiserecht, keine Abgaben/Steuern, keine Zusagen zu Kontrollen, Bio, Zulassungen oder Lenkzeiten
const VORSICHT = [/Reiserecht/i, /Sicherungsschein/i, /Insolvenz/i, /Pauschalreiserecht/i, /Kurtaxe/i, /Steuer/i, /Pflicht/i, /amtlich/i,
  /Lebensmittelkontrolle/i, /Bio\b/i, /zertifiz/i, /zugelassen/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i, /Lenk/i, /Ruhezeit/i,
  /TÜV/i, /Storno/i, /Rückruf/i, /Alkohol/i];
// Nicht im Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Gutschein/i, /Wartung/i, /Provision/i, /Veranstaltungen\b/];
const NICHT_GASTRO = [/Charge/i, /Tour\b/i, /MHD/i];

test('🟡 Gastro Rest + Lebensmittel Teil 1: zehn freie Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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
    assert.ok(!d.paket.some((m) => m.key === 'kasse' || m.key === 'shop'), slug);
  }
});

test('Vorsicht: keine Zusagen, nur Paket-Module, keine Prozente', () => {
  for (const [slug, kat] of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT, ...(kat === GASTRO ? NICHT_GASTRO : [])]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Gastro ist damit komplett frei-mit-Text; gesperrte Lebensmittel-Branchen ohne Text; Zählung', () => {
  for (const s of FREI_IN_TEILBEREICH[GASTRO]) assert.ok(FACH_TEXTE[s], 'Gastro frei ohne Text: ' + s);
  for (const s of ['baeckereien', 'metzgereien', 'hofladen-direktvermarktung']) {
    if (!FREI_IN_TEILBEREICH[LM].includes(s)) assert.equal(FACH_TEXTE[s], undefined, s);
  }
  assert.ok(Object.keys(FACH_TEXTE).length >= 189);
});
