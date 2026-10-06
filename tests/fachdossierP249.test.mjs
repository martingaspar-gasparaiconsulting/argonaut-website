// Paket 249 (07.10.2026): Fachdossiers Kultur, Soziales & Öffentliches Welle 2
// Zurückgestellt bleiben (P233): Behörden, Standesämter, Kirchen, Jugendhilfe, Behindertenhilfe, Migration, Wohnungslosenhilfe,
// Familienberatung, Stiftungen, Wohlfahrtsverbände. Neu zurückgestellt: sozialpädagogische Einrichtungen, Jugendzentren,
// betreutes Wohnen, Tafeln (Sozial-/Gesundheitsdaten, Minderjährige), Genossenschaften (Genossenschaftsrecht),
// Feuerwehren/Hilfsorganisationen und Verkehrsbetriebe (öffentlich, Einsatz-/Gesundheitsdaten), Nachbarschaftshilfe (Pflegenähe).
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Kultur, Soziales & Öffentliches';
const WELLE = ['verbände', 'bibliotheken', 'opern-konzerthaeuser', 'kinos-filmtheater', 'freilichtmuseen-gedenkstaetten',
  'botanische-gaerten', 'buergerinitiativen-umweltverbaende', 'tourismusverbaende-kurverwaltungen',
  'stadtmarketing-wirtschaftsfoerderung', 'tourist-informationen'];
// Vorsicht wie P233 + Kurtaxe, Jugendschutz, politische Aussagen
const VORSICHT = [/Steuer/i, /steuerfrei/i, /Quittung/i, /Bestätigung.*Spend|Spend.*Bestätigung/i, /Zuwendung/i, /gemeinnützig/i,
  /Pauschale/i, /Übungsleiter/i, /Versammlung/i, /Satzung/i, /Wahl/i, /Mehrheit/i, /konform/i, /rechtssicher/i, /Haftung/i,
  /Kurtaxe|Kurbeitrag|Gästebeitrag/i, /Meldeschein/i, /FSK|Jugendschutz|Altersfreigabe/i, /Partei/i, /Klage|Petition/i, /Garantie/i];
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Bankabruf/i, /Wartung/i, /Kalkulator/i, /Aufmaß/i, /Verleih/i, /Academy/i,
  /Beleg-?Eingang/i];

test('Kultur Welle 2: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Kultur-Vorsicht W2: nichts Steuerliches, Fördermittel nur mit Frist, nur Paket-Module', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
    const saetze = s.replace(/Förder(verein|kreis|mitglied)\w*/g, '').split(/[.!?"]/);
    for (const satz of saetze) if (/Förder/.test(satz)) assert.ok(/frist/i.test(satz), slug + ': Förder ohne Frist: ' + satz);
  }
});

test('Bibliothek verspricht keine Ausleihe und keinen Katalog', () => {
  assert.ok(/Katalog und die Ausleihe bleiben in Ihrem Bibliothekssystem/.test(FACH_TEXTE['bibliotheken'].lead));
});

test('Zurückgestellte bleiben ohne Text; Zählung', () => {
  for (const s of ['stadtverwaltungen', 'kirchen-religionsgemeinschaften', 'wohlfahrtsverbaende', 'sozialpaedagogische-einrichtungen',
    'jugendzentren-offene-jugendarbeit', 'betreutes-wohnen-seniorenresidenzen', 'tafeln-lebensmittelausgaben', 'genossenschaften',
    'freiwillige-feuerwehren-hilfsorganisationen', 'verkehrsbetriebe-kommunale-betriebe', 'nachbarschaftshilfe-mehrgenerationenhaeuser'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 317);
});
