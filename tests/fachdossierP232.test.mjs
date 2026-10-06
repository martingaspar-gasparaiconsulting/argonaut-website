// Paket 232 (06.10.2026): Fachdossiers Bildung & Wissenschaft Welle 1 (Top 10 nach Betriebszahl)
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Bildung & Wissenschaft';
const WELLE = ['bildung-weiterbildung', 'fahrschulen', 'nachhilfeinstitute', 'musikschulen', 'sprachschulen',
  'business-fuehrungskraefte-coaching', 'erste-hilfe-kursanbieter', 'kochschulen-kulinarik-workshops', 'kunstschulen', 'it-programmier-bootcamps'];
// Vorsicht Bildung: keine Zulassungs-/Zertifizierungs-/Förderversprechen, keine Prüfungsanmeldung, keine Aussagen zu Gutschein-Fristen oder Steuer
const VORSICHT = [/ZFU/, /Zulassung/i, /zertifiziert/i, /Zertifikat/i, /Förder/i, /Bildungsgutschein/i, /Prüfungsanmeld/i,
  /Verjähr/i, /Steuer/i, /konform/i, /rechtssicher/i, /Kinderdaten/i, /\bKita\b/i];
// Nicht im Bildungs-Paket bzw. abgeschaltet
const NICHT = [/Lizenz/i, /Wartung/i, /Leistungskatalog/i, /Kalkulator/i, /Aufmaß/i, /Kasse/i, /Webshop/i, /WhatsApp/i, /Bankabruf/i, /Academy/i];

test('Bildung Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
  for (const slug of WELLE) {
    const t = FACH_TEXTE[slug];
    assert.ok(t, slug);
    assert.equal(t.vorteile.length, 6, slug);
    assert.equal(t.alltag.filter((a) => a.titel !== 'Die E-Rechnung kommt').length, 5, slug);
    assert.equal(t.alltag.length, 6, slug);
    assert.equal(t.ablauf.length, 5, slug);
    assert.equal(t.schwerpunkt?.punkte.length, 4, slug);
    assert.deepEqual(textVerstoesse(JSON.stringify(t)), [], slug);
    const d = baueDossier({ slug, name: slug, kategorie: KAT });
    assert.equal(d.entwurf, false, slug);
    assert.equal(d.gesperrt, null, slug);
  }
});

test('Bildung-Vorsicht: keine Zulassungs-, Förder- oder Steueraussagen, nur Paket-Module', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Kitas, Schulen, Hochschulen und Fernschulen bewusst zurückgestellt; Zählung', () => {
  for (const s of ['kinderbetreuung', 'waldkindergaerten', 'schulen', 'universitaeten', 'fernschulen-fernstudium'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 150);
});
