// Paket 251 (07.10.2026): Fachdossiers Fahrzeuge & Mobilität Welle 3 (Werkstatt-nahe Betriebe)
// Weiter zurückgestellt: kfz-sachverstaendige-gutachter (P225/P241). Für spätere Wellen offen: Handel (Motorrad, Nutzfahrzeuge),
// Aufbauten/Anhänger, Abgasanlagen, Boote/Marina, Luftfahrt, Drohnen, Schiene, Verwertung, Ladeinfrastruktur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Fahrzeuge & Mobilität';
const WELLE = ['scheibentoenung-sonnenschutzfolie', 'autosattlerei-fahrzeuginnenausstattung', 'standheizung-klimaservice',
  'achsvermessung-fahrwerkservice', 'autoelektrik-fahrzeugelektronik', 'roller-mofawerkstatt', 'e-bike-pedelec-spezialist',
  'fahrradmanufaktur-rahmenbau', 'lastenrad-cargobike-anbieter', 'fahrzeugaufbereitung-smart-repair'];
// Vorsicht Fahrzeuge (wie P241) + Kältemittel-/Abgas-/Tönungsrecht, keine Sicherheitsversprechen
const VORSICHT = [/Steuer/i, /Garantie/i, /Gewährleist/i, /Haftung/i, /Versicher/i, /TÜV/, /Zulassung/i, /\bABE\b/, /Eintragung/i,
  /Gutachten/i, /Schaden/i, /Unfall/i, /Finanzier/i, /Leasing/i, /Export/i, /Bargeld/i, /Differenzbesteuer/i, /§/, /25a/,
  /Gasprüf/i, /Leistungssteigerung/i, /Chiptuning/i, /zertifiz/i, /konform/i, /rechtssicher/i,
  /Kältemittel|F-Gas|Sachkunde/i, /StVZO|erlaubt|zulässig/i, /Hagel/i, /\bsicher\b|Sicherheit/i, /Dienstrad-?Leasing|Gehaltsumwandlung/i];
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /HACCP/i, /MHD/i, /Etikett/i, /Tour\b/i,
  /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i, /Großhändler-Anbindung|direkt angebunden/i];

test('Fahrzeuge Welle 3: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Fahrzeug-Vorsicht W3: keine Rechts-, Sicherheits- oder Finanzierungsaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['kfz-sachverstaendige-gutachter', 'auspuff-abgasanlagen-service', 'flugzeugwartung-luftfahrttechnik',
    'fahrzeugverwertung-autorecycling'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 337);
});
