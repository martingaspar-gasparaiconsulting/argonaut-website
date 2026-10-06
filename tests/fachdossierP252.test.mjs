// Paket 252 (07.10.2026): Fachdossiers Industrie & Produktion Welle 3
// Zurückgestellt: Luft- und Raumfahrt, Bergbau, Lebensmittelproduktion, Chemie (P240), dazu Brauerei/Mälzerei (Alkohol),
// Molkerei und Mühlen (Lebensmittelrecht), Galvanik (Gefahrstoffe), Batterie/Speicher (Gefahrgut), Halbleiter (Exportkontrolle).
// Industrie frei damit komplett.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Industrie & Produktion';
const WELLE = ['papier-zellstoffindustrie', 'betonfertigteile-betonwerk', 'baustoff-ziegelindustrie', 'glasindustrie',
  'keramik-feuerfestindustrie', 'feinoptik-photonik', 'pumpen-armaturenbau', 'antriebs-getriebetechnik', 'landtechnik-hersteller',
  'schiffbau-werften'];
// Vorsicht Industrie (wie P240) + Klassifikation, Druckgeräte, Lebensmittel
const VORSICHT = [/ISO/, /IATF/, /DIN/, /EN \d/, /zertifiz/i, /Zulassung/i, /\bCE-Kennz/, /Druckgeräte/i, /AD 2000/i, /TÜV/i, /Export/i,
  /Rüstung/i, /Verteidigung/i, /Marine/i, /REACH/, /RoHS/, /Gefahrstoff/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i,
  /Steuer/i, /Klassifikation|Klassengesellschaft/i, /Trinkwasser/i, /Lebensmittel/i];
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /HACCP/i, /MHD/i, /Etikett/i, /Tour\b/i, /Verleih/i,
  /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i, /Großhändler-Anbindung|direkt angebunden/i, /Teilrechnung/i];

test('Industrie Welle 3: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.ok(t.titel.length <= 36, slug + ': Titel zu lang');
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Industrie-Vorsicht W3: keine Normen-, Export- oder Zulassungsaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['luft-raumfahrt', 'bergbau', 'lebensmittelproduktion', 'chemische-industrie', 'brauerei-maelzerei',
    'molkerei-milchverarbeitung', 'muehlen-getreideverarbeitung', 'oberflaechentechnik-galvanik', 'batterie-speichertechnik',
    'halbleiter-mikroelektronik'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 347);
});
