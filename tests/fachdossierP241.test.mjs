// Paket 241 (06.10.2026): Fachdossiers Fahrzeuge & Mobilität Welle 2
// Zurückgestellt: KFZ-Sachverständige & Gutachter (Schadenabwicklung, Versicherungsnähe, Anwalt R23).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Fahrzeuge & Mobilität';
const WELLE = ['autowaesche-autopflege', 'caravan-wohnmobil', 'boots-yachthandel', 'transporter-lkw-vermietung', 'wohnmobilvermietung',
  'selbsthilfe-mietwerkstatt', 'autoteile-zubehoerhandel', 'oldtimer-restauration-handel', 'tuning-fahrzeugveredelung', 'fahrzeugfolierung-car-wrapping'];
// Vorsicht Fahrzeuge: keine Steuer-, Gewährleistungs-, Versicherungs-, Zulassungs- oder Abnahme-Zusagen
const VORSICHT = [/Steuer/i, /Garantie/i, /Gewährleist/i, /Haftung/i, /Versicher/i, /TÜV/, /Zulassung/i, /\bABE\b/, /Eintragung/i,
  /Gutachten/i, /Schaden/i, /Unfall/i, /Finanzier/i, /Leasing/i, /Export/i, /Bargeld/i, /Differenzbesteuer/i, /§/, /25a/,
  /Gasprüf/i, /Leistungssteigerung/i, /Chiptuning/i, /zertifiz/i, /konform/i, /rechtssicher/i];
// Nicht im Fahrzeug-Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /HACCP/i, /MHD/i, /Etikett/i, /Tour\b/i,
  /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i, /Großhändler-Anbindung|direkt angebunden/i];

test('Fahrzeuge Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Fahrzeug-Vorsicht: keine Steuer-, Zulassungs- oder Versicherungszusagen, nur Paket-Module, keine Prozente', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  assert.equal(FACH_TEXTE['kfz-sachverstaendige-gutachter'], undefined);
  assert.ok(Object.keys(FACH_TEXTE).length >= 238);
});
