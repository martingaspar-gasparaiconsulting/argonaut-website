// Paket 242 (06.10.2026): Fachdossiers IT & Technologie Welle 2
// Zurückgestellt: IT-Sicherheit für KMU (Sicherheits- und NIS2-Versprechen), Kassensysteme (TSE), externer Datenschutz.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'IT & Technologie';
const WELLE = ['telekommunikation', 'startups', 'industrieautomation', 'messtechnik-pruefgeraete', 'rechenzentrum-hosting',
  'cloud-dienstleister', 'webhosting-anbieter', 'e-commerce-entwicklung', 'saas-anbieter', 'erp-sap-beratung'];
// Vorsicht IT: keine Verfügbarkeits-, Sicherheits-, Norm- oder Garantiezusagen, keine Fremdmarken
const VORSICHT = [/Verfügbarkeit von/i, /Uptime/i, /99[,.]9/, /ausfallsicher/i, /hochverfügbar/i, /\bsicher\b/i, /Sicherheit/i, /NIS ?2/i,
  /\bBSI\b/, /ISO/, /DIN/, /DAkkS/i, /zertifiz/i, /Kalibrierschein/i, /konform/i, /rechtssicher/i, /Garantie/i, /Haftung/i,
  /Umsatzsteuer|Steuerberat|steuerlich|Steuerkanzlei/i, /\bSAP\b/, /Microsoft|Google|Amazon|AWS|Azure/];
// Nicht im IT-Paket bzw. abgeschaltet
const NICHT = [/Werkstatt-Board/i, /Prüfprotokoll/i, /Wartung/i, /Fernhilfe/i, /Fernwartung/i, /Kasse/i, /Webshop/i, /WhatsApp/i,
  /Bankabruf/i, /Kalkulator/i, /Aufmaß/i, /Marktplatz/i];

test('IT Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('IT-Vorsicht: keine Verfügbarkeits-, Sicherheits- oder Normzusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['it-sicherheit-kmu', 'kassensysteme-pos', 'datenschutzberatung-ext-dsb']) assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 248);
});
