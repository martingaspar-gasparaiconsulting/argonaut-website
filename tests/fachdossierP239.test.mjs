// Paket 239 (06.10.2026): Fachdossiers Dienstleistungen Welle 2
// Zurückgestellt: Schadensanierung (Versicherungsabwicklung), Callcenter (Telefonie nicht gebaut), Personalvermittlung (Bewerberdaten).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Dienstleistungen';
const WELLE = ['archiv-dokumentation', 'schaedlingsbekaempfung', 'entruempelungen', 'bauendreinigung-grundreinigung', 'rohr-kanalreinigung',
  'graffiti-trockeneisreinigung', 'winterdienst-raeumdienst', 'aktenvernichtung-datentraegervernichtung',
  'autoaufbereitung-fahrzeugpflege-dienst', 'eventtechnik-veranstaltungstechnik'];
// Vorsicht Dienstleistungen: keine Haftungs-, Pflicht-, Norm- oder Datenschutzzusagen, keine Versicherungs-/Gift-/Schadstoffthemen
const VORSICHT = [/Haftung/i, /Verkehrssicherung/i, /Räumpflicht/i, /Streupflicht/i, /DIN/, /Schutzklasse/i, /Sicherheitsstufe/i,
  /datenschutzkonform/i, /DSGVO/i, /zertifiz/i, /Versicherung/i, /Gutacht/i, /Biozid/i, /Gift/i, /Sachkunde/i, /Asbest/i, /Schimmel/i,
  /Pauschal/i, /DGUV/i, /Garantie/i, /konform/i, /rechtssicher/i, /Steuer/i, /Arzt|Praxis/i];
// Nicht im Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Prüfprotokoll/i, /Verleih/i, /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i];

test('Dienstleistungen Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Dienstleistungs-Vorsicht: keine Zusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['schadensanierung-wasser-brand', 'callcenter-telefonservice', 'personalvermittlung', 'inkasso-forderungsmanagement',
    'detektei-ermittlungsbuero', 'tatort-extremreinigung', 'bestattungsunternehmen', 'seniorenbetreuung-alltagshilfe'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 218);
});
