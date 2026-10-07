// Paket 256 (07.10.2026): Fachdossiers letzte freie Branchen — Fahrzeuge (4) und IT (4)
// Damit haben alle Branchen einen Text, die nicht bewusst zurückgestellt oder bis zur Anwaltsprüfung gesperrt sind.
// Neu zurückgestellt: Zahntechniker und Orthopädie-Schuhmacher (Medizinprodukte).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WELLE = {
  'fahrzeug-aufbautenbau': 'Fahrzeuge & Mobilität', 'verkehrstechnik-fahrzeugbeschilderung': 'Fahrzeuge & Mobilität',
  'schienenfahrzeug-bahntechnik': 'Fahrzeuge & Mobilität', 'e-mobilitaet-ladeinfrastruktur-wallbox': 'Fahrzeuge & Mobilität',
  'robotik-automatisierung': 'IT & Technologie', 'smart-home-gebaeudeautomation-knx': 'IT & Technologie',
  'gis-geoinformatik': 'IT & Technologie', 'glasfaser-netzausbau': 'IT & Technologie',
};
// Vorsicht Fahrzeuge (P241/P251) + IT (P242/P254) + Elektro-/Netzrecht
const VORSICHT = [/Steuer/i, /Garantie/i, /Gewährleist/i, /Haftung/i, /Versicher/i, /TÜV/, /Zulassung/i, /\bABE\b/, /Eintragung/i,
  /Gutachten/i, /Schaden/i, /Unfall/i, /Finanzier/i, /Leasing/i, /Förder/i, /§/, /zertifiz/i, /konform/i, /rechtssicher/i,
  /\bsicher\b|Sicherheit/i, /Uptime|ausfallsicher|hochverfügbar/i, /ISO|DIN|VDE|KNX/, /Microsoft|Google|Amazon|AWS|Azure/,
  /Netzbetreiber-Anmeldung|Anmeldepflicht|Elektrofachkraft|Genehmigung/i, /CE-Kennz|Maschinenrichtlinie/i, /StVO|Anordnung/i];
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i,
  /Wartung/i, /Prüfprotokoll/i, /Belegung/i, /Teilrechnung/i, /Gutscheine/i];

test('Letzte Welle 256: acht Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const [slug, kat] of Object.entries(WELLE)) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.ok(t.titel.length <= 36, slug + ': Titel zu lang');
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: kat });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Vorsicht 256: keine Rechts-, Norm- oder Sicherheitsaussagen, nur vorhandene Module, keine Prozente', () => {
  for (const slug of Object.keys(WELLE)) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['zahntechniker', 'orthopaedie-schuhmacher', 'kfz-sachverstaendige-gutachter', 'it-sicherheit-kmu',
    'ki-machine-learning-dienstleister', 'drohnen-service-uav'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 385);
});
