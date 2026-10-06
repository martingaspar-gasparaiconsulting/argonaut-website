// Paket 253 (07.10.2026): Fachdossiers gemischt — Dienstleistungen Welle 3 (6), Marketing Rest (2), Logistik Rest (2)
// Zurückgestellt Dienstleistungen: Personalvermittlung, Callcenter, Schadensanierung (P239), dazu Bestattung, Tatortreinigung,
// Seniorenbetreuung, Haushaltshilfe- und Babysitter-Vermittlung, Wachdienste/§34a/Ordnerdienst, Hausnotruf, Detektei, Inkasso.
// Logistik weiter zurück: Krankenfahrten, Gefahrgut, Entsorgung, Silo, Wert-, Schwer-, Lebendtier-, Zoll-, Luft/See, Taxi (PBefG).
// Damit sind Dienstleistungen, Marketing und Logistik frei komplett.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const WELLE = {
  'grabpflege-friedhofsgaertnerei': 'Dienstleistungen', 'hochzeits-weddingplaner': 'Dienstleistungen',
  'trauredner-zeremonienservice': 'Dienstleistungen', 'dj-musikservice': 'Dienstleistungen', 'messebau-standbau': 'Dienstleistungen',
  'ballon-dekorationsservice': 'Dienstleistungen', 'kuenstler': 'Marketing, Medien & Kreativ',
  'messe-ausstellungen': 'Marketing, Medien & Kreativ', 'winterdienst-raeumlogistik': 'Logistik & Transport',
  'schienengueterverkehr': 'Logistik & Transport',
};
// Vorsicht wie P239/P244/P246 + Rechte, Trauung als Amtshandlung, Bestattungsrecht
const VORSICHT = [/Haftung/i, /Verkehrssicherung/i, /Räumpflicht/i, /Streupflicht/i, /DIN/, /DSGVO/i, /zertifiz/i, /Versicherung/i,
  /Pauschal/i, /DGUV/i, /Garantie/i, /konform/i, /rechtssicher/i, /Steuer/i, /GEMA|GVL|Künstlersozial|KSK/, /Nutzungsrecht|Urheber|Lizenz/i,
  /Standesamt|standesamtlich|rechtsgültig/i, /Bestattung|Friedhofsordnung|Ruhefrist/i, /Gefahrgut|Eisenbahn-Bundesamt|Zulassung/i, /\d+\s*Tage/i];
const NICHT = [/Kasse/i, /Shop/i, /Marktplatz/i, /WhatsApp/i, /Bankabruf/i, /Verleih/i, /Kalkulator/i, /Aufmaß/i, /Bautagebuch/i,
  /Gutscheine/i, /Restwert/i, /Teilrechnung/i];

test('Gemischte Welle 253: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Vorsicht 253: keine Pflicht-, Rechte- oder Amtsaussagen, nur vorhandene Module, keine Prozente', () => {
  for (const slug of Object.keys(WELLE)) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
  }
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['personalvermittlung', 'callcenter-telefonservice', 'schadensanierung-wasser-brand', 'bestattungsunternehmen',
    'tatort-extremreinigung', 'seniorenbetreuung-alltagshilfe', 'haushaltshilfe-reinigungskraft-vermittlung',
    'kinderbetreuung-babysitter-vermittlung', 'wachdienst-objektschutz', 'hausnotruf-sicherheitstechnik', 'detektei-ermittlungsbuero',
    'personen-objektschutz-paragraph34a', 'veranstaltungssicherheit-ordnerdienst', 'inkasso-forderungsmanagement',
    'taxi-mietwagenunternehmen', 'entsorgungslogistik-abfalltransport', 'fahrdienste-krankenfahrten'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 357);
});
