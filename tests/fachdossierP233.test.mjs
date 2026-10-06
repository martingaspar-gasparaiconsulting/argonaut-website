// Paket 233 (06.10.2026): Fachdossiers Kultur, Soziales & Öffentliches Welle 1
// Vereine, Kultur und Verbände. Behörden, Kirchen und Bereiche mit Sozialdaten bewusst zurückgestellt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueDossier, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';

const KAT = 'Kultur, Soziales & Öffentliches';
const WELLE = ['kulturvereine-foerdervereine', 'musik-gesangvereine', 'heimat-trachtenvereine', 'museen-kultur', 'theater-buehnen',
  'konzert-veranstaltungsveranstalter', 'kunstgalerien-ausstellungsraeume', 'soziokulturelle-zentren-buergerhaeuser', 'berufsverbände',
  'freiwilligenagenturen-ehrenamt'];
// Vorsicht Vereine/Kultur: nichts Steuerliches (Spendenquittung, Zuwendungsbestätigung, Gemeinnützigkeit, Pauschalen),
// keine Versammlungs-/Satzungs-/Wahlregeln, keine Förderzusagen
const VORSICHT = [/Steuer/i, /steuerfrei/i, /Quittung/i, /Bestätigung.*Spend|Spend.*Bestätigung/i, /Zuwendung/i, /gemeinnützig/i,
  /Pauschale/i, /Übungsleiter/i, /Versammlung/i, /Satzung/i, /Wahl/i, /Mehrheit/i, /konform/i, /rechtssicher/i, /Haftung/i];
// Nicht im Paket bzw. abgeschaltet
const NICHT = [/Kasse/i, /Webshop/i, /WhatsApp/i, /Bankabruf/i, /Wartung/i, /Kalkulator/i, /Aufmaß/i, /Verleih/i, /Academy/i];

test('Kultur Welle 1: zehn Branchen vollständig, ohne Verstöße, kein Entwurf', () => {
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

test('Kultur-Vorsicht: nichts Steuerliches, Fördermittel nur als Fristen, nur Paket-Module', () => {
  for (const slug of WELLE) {
    const s = JSON.stringify(FACH_TEXTE[slug]);
    for (const r of [...VORSICHT, ...NICHT]) assert.ok(!r.test(s), slug + ': ' + r.source);
    assert.ok(!/\d+\s*(%|Prozent)/.test(s), slug + ': Prozent');
    // Jede Erwähnung von Förder… (außer Förderverein/Förderkreis/Fördermitglied) steht neben „Frist"
    const saetze = s.replace(/Förder(verein|kreis|mitglied)\w*/g, '').split(/[.!?"]/);
    for (const satz of saetze) if (/Förder/.test(satz)) assert.ok(/frist/i.test(satz), slug + ': Förder ohne Frist: ' + satz);
  }
});

test('Behörden, Kirchen und Sozialdaten-Bereiche bewusst zurückgestellt; Zählung', () => {
  for (const s of ['stadtverwaltungen', 'standesaemter-buergerbueros', 'kirchen-religionsgemeinschaften', 'jugendhilfe-erziehungshilfetraeger',
    'behindertenhilfe-werkstaetten-wfbm', 'migrations-integrationsdienste', 'obdachlosen-wohnungslosenhilfe', 'familien-erziehungsberatung',
    'stiftungen-foerderstiftungen', 'wohlfahrtsverbaende'])
    assert.equal(FACH_TEXTE[s], undefined, s);
  assert.ok(Object.keys(FACH_TEXTE).length >= 160);
});
