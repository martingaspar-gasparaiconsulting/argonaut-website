// Paket 254 (07.10.2026): Fachdossiers IT & Technologie Welle 3
// Zurückgestellt (wie P242): IT-Sicherheit, Kassensysteme, externer Datenschutz; dazu KI-Dienstleister (KI-Verordnung),
// IT-Forensik (Ermittlungen), Datenrettung (Datenschutz). Noch frei: Robotik, Smart-Home, GIS, Glasfaser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'IT & Technologie';
const WELLE = ['crm-beratung', 'data-science-business-intelligence', 'iot-dienstleister', 'embedded-elektronikentwicklung',
  'cad-konstruktionsbuero', '3d-druck-dienstleister', 'software-testing-qa', 'devops-cloud-engineering', 'it-schulung-edv-schulung',
  'vr-ar-entwicklung'];
// Vorsicht IT (wie P242) + KI-Verordnung, Datenschutz-Zusagen, Kurse/Teilnahmebescheinigung (Bildungsmodul nicht im IT-Paket)
const VORSICHT = [/Verfügbarkeit von/i, /Uptime/i, /99[,.]9/, /ausfallsicher/i, /hochverfügbar/i, /\bsicher\b/i, /Sicherheit/i, /NIS ?2/i,
  /\bBSI\b/, /ISO/, /DIN/, /DAkkS/i, /zertifiz/i, /Kalibrierschein/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i,
  /Umsatzsteuer|Steuerberat|steuerlich|Steuerkanzlei/i, /\bSAP\b/, /Microsoft|Google|Amazon|AWS|Azure|KNX/,
  /KI-Verordnung|AI Act/i, /DSGVO|datenschutzkonform/i, /Warteliste|Teilnahmebescheinigung|Teilnahmezertifikat/i];
const NICHT = [/Werkstatt-Board/i, /Prüfprotokoll/i, /Wartung/i, /Fernhilfe/i, /Fernwartung/i, /Kasse/i, /Webshop/i, /WhatsApp/i,
  /Bankabruf/i, /Kalkulator/i, /Aufmaß/i, /Marktplatz/i, /Bildung und Kurse/i, /Teilrechnung/i];

test('IT Welle 3: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('IT-Vorsicht W3: keine Sicherheits-, Norm- oder Markenaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['it-sicherheit-kmu', 'kassensysteme-pos', 'datenschutzberatung-ext-dsb', 'ki-machine-learning-dienstleister',
    'it-forensik', 'datenrettung'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 367);
});
