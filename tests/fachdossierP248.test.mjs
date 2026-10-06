// Paket 248 (06.10.2026): Fachdossiers Bildung & Wissenschaft Welle 2
// Zurückgestellt (wie P232): Kitas, Waldkindergärten, Schulen, Hochschulen, Fernschulen.
// Neu zurückgestellt: Berufsakademien/Duale Hochschulen (Hochschulrecht), Berufskollegs/Fachschulen (Schulrecht),
// Berufsförderungs- und Berufsbildungswerke (Reha, Gesundheitsdaten). Bildung frei damit komplett.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Bildung & Wissenschaft';
const WELLE = ['life-coaching-persoenlichkeitsentwicklung', 'volkshochschulen-erwachsenenbildung', 'e-learning-plattformen',
  'ihk-hwk-bildungszentren', 'bildungstraeger-umschulungstraeger', 'fahrsicherheitstraining', 'segel-wassersportschulen',
  'schauspielschulen-filmakademien', 'forschungsinstitute-think-tanks', 'bildungs-studienberatung'];
// Vorsicht Bildung (wie P232) + keine Therapie-/Gesundheits-, Prüfungs-, Anerkennungs- oder Behördenaussagen
const VORSICHT = [/ZFU/, /Zulassung/i, /zertifiziert/i, /Zertifikat/i, /Förder/i, /Bildungsgutschein/i, /Prüfungsanmeld/i,
  /Verjähr/i, /Steuer/i, /konform/i, /rechtssicher/i, /Kinderdaten/i, /\bKita\b/i,
  /Therap/i, /Heil/i, /Psych/i, /Diagnos/i, /Krank/i, /Gesundheit/i, /Burnout/i, /Abschlussprüfung|Prüfungstermin/i,
  /anerkannt/i, /AZAV/, /Jobcenter/i, /Agentur für Arbeit/i, /Studienplatz/i, /Garantie/i, /Versicher/i, /Unfall/i,
  /Führerschein/i, /Drittmittel/i, /\bIHK\b|\bHWK\b/];
// Nicht im Bildungs-Paket bzw. abgeschaltet
const NICHT = [/Lizenz/i, /Wartung/i, /Leistungskatalog/i, /Kalkulator/i, /Aufmaß/i, /Kasse/i, /Webshop/i, /WhatsApp/i,
  /Bankabruf/i, /Academy/i, /Verleih/i, /Charter/i, /Video/i];

test('Bildung Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Bildung-Vorsicht W2: keine Therapie-, Prüfungs- oder Förderaussagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Lernplattform verspricht kein Hosting von Lerninhalten', () => {
  const s = JSON.stringify(FACH_TEXTE['e-learning-plattformen']);
  assert.ok(/Lerninhalte bleiben auf Ihrer Plattform/.test(s));
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['kinderbetreuung', 'waldkindergaerten', 'schulen', 'universitaeten', 'fernschulen-fernstudium',
    'berufsakademien-duale-hochschulen', 'berufskollegs-fachschulen', 'berufsfoerderungs-berufsbildungswerke'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 307);
});
