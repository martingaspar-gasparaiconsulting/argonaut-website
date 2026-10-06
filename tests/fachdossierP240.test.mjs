// Paket 240 (06.10.2026): Fachdossiers Industrie & Produktion Welle 2
// Zurückgestellt: Luft- und Raumfahrt (Rüstungsnähe, Exportkontrolle), Bergbau (Bergrecht).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Industrie & Produktion';
const WELLE = ['industrie-produktion', 'textilproduktion', 'elektronik', 'automobilzulieferer', 'lasertechnik-laserbearbeitung',
  'giesserei-metallguss', 'behaelter-apparatebau', 'industrieanlagen-rohrleitungsbau', 'gummi-elastomertechnik', 'verpackungsindustrie'];
// Vorsicht Industrie: keine Normen-/Zertifizierungs-/Zulassungszusagen, keine Exportkontrolle, keine Sicherheitsversprechen
const VORSICHT = [/ISO/, /IATF/, /DIN/, /EN \d/, /zertifiz/i, /Zulassung/i, /\bCE-Kennz/, /Druckgeräte/i, /AD 2000/i, /TÜV/i, /Export/i,
  /Rüstung/i, /Verteidigung/i, /REACH/, /RoHS/, /Gefahrstoff/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i, /Steuer/i];
// Nicht im Industrie-Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /HACCP/i, /MHD/i, /Etikett/i, /Tour\b/i, /Verleih/i,
  /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i, /Großhändler-Anbindung|direkt angebunden/i];

test('Industrie Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Industrie-Vorsicht: keine Norm- oder Zulassungszusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['luft-raumfahrt', 'bergbau', 'lebensmittelproduktion', 'chemische-industrie']) assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 228);
});
