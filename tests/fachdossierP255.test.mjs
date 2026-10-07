// Paket 255 (07.10.2026): Fachdossiers Fahrzeuge & Mobilität Welle 4 (Boote, Stellplatz, Maschinen-Service, Anhänger)
// Zurückgestellt: Kfz-Sachverständige (P225), Abgasanlagen (Abgasrecht), Luftfahrt, Flugschule, Drohnen (Luftrecht),
// Fahrzeugverwertung (Altfahrzeugrecht), Motorrad- und Nutzfahrzeughandel (Handelsbestand kommt mit dem Kfz-Pilot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Fahrzeuge & Mobilität';
const WELLE = ['bootswerft-bootsservice', 'marina-yachthafen', 'bootsmotoren-antriebsservice', 'segelmacherei-bootszubehoer',
  'wohnmobil-caravan-stellplatz', 'landmaschinen-werkstatt-handel', 'baumaschinen-service-handel',
  'gabelstapler-flurfoerderzeug-service', 'kommunalfahrzeug-kehrmaschinentechnik', 'anhaenger-wohnwagenbau'];
// Vorsicht Fahrzeuge (wie P241/P251) + UVV/Prüfpflichten, Kurtaxe, Charter
const VORSICHT = [/Steuer/i, /Garantie/i, /Gewährleist/i, /Haftung/i, /Versicher/i, /TÜV/, /Zulassung/i, /\bABE\b/, /Eintragung/i,
  /Gutachten/i, /Schaden/i, /Unfall/i, /Finanzier/i, /Leasing/i, /Export/i, /Bargeld/i, /Differenzbesteuer/i, /§/, /25a/,
  /zertifiz/i, /konform/i, /rechtssicher/i, /\bsicher\b|Sicherheit/i, /UVV|DGUV|Prüfpflicht|Sachkunde/i, /Kurtaxe|Meldeschein/i,
  /Charter/i, /Führerschein/i];
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /HACCP/i, /MHD/i, /Etikett/i, /Tour\b/i,
  /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i, /Belegung/i, /je Nacht/i, /Großhändler-Anbindung|direkt angebunden/i];

test('Fahrzeuge Welle 4: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Fahrzeug-Vorsicht W4: keine Rechts-, Prüfpflicht- oder Finanzierungsaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['kfz-sachverstaendige-gutachter', 'auspuff-abgasanlagen-service', 'flugzeugwartung-luftfahrttechnik',
    'flugschule-luftsportbetrieb', 'drohnen-service-uav', 'fahrzeugverwertung-autorecycling', 'motorradhandel-zubehoer',
    'nutzfahrzeug-transporterhandel'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 377);
});
