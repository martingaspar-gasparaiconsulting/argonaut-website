// ============================================================================
// tests/einsatzVorlageP313.test.mjs — Paket 313 (11.10.2026) · BV2 Einsätze
// Dispo-Board nach Branchen-Vorlage: Status-Wörter und Personen-Wort je
// Branche, Schlüssel fest, Schnellsuche über alle Wochen (Berliner Kalendertag).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vorlageFuer, mitKunde, feinschliffName, bekannteModule } from '../out/branchenVorlage.js';
import { einsatzTag, offen, suchePasst, treffer } from '../out/einsatzVorlage.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const H = '2026-10-11';
const KEYS = ['geplant', 'unterwegs', 'vor_ort', 'erledigt', 'abgesagt'];

test('Einsätze-Vorlage: Grund wie bisher, Schlüssel überall gleich', () => {
  assert.ok(bekannteModule().includes('einsaetze'));
  const g = vorlageFuer('einsaetze', '');
  assert.deepEqual(g.status.map((s) => s.label), ['Geplant', 'Unterwegs', 'Vor Ort', 'Erledigt', 'Abgesagt']);
  assert.equal(g.personWort, 'Mitarbeiter');
  for (const b of ['', 'Maler', 'Gebäudereinigung', 'Hochzeitsplanung', 'IT-Dienstleister', 'Bäckerei', 'Steuerberatung']) {
    assert.deepEqual(vorlageFuer('einsaetze', b).status.map((s) => s.key), KEYS, b);
  }
});

test('Feinschliff: Monteur, Reinigungskraft, Crew, Techniker', () => {
  const hw = vorlageFuer('einsaetze', 'Sanitär, Heizung, Klima');
  assert.equal(hw.personWort, 'Monteur');
  assert.equal(hw.personPlural, 'Monteure');
  assert.equal(hw.status[2].label, 'Auf der Baustelle');
  for (const b of ['Gebäudereinigung', 'Hausmeisterservice', 'Facility Management', 'Glas- und Gebäudereinigung']) {
    assert.equal(feinschliffName('einsaetze', b), 'Reinigung und Gebäudedienste', b);
  }
  assert.equal(vorlageFuer('einsaetze', 'Gebäudereinigung').status[2].label, 'Im Objekt');
  assert.equal(vorlageFuer('einsaetze', 'Gebäudereinigung').personWort, 'Reinigungskraft');
  assert.equal(vorlageFuer('einsaetze', 'Catering').personPlural, 'Crew');
  assert.equal(vorlageFuer('einsaetze', 'Systemhaus').personWort, 'Techniker');
  assert.equal(feinschliffName('einsaetze', 'Kanzlei'), null);
  // Projekte erkennen Gebäudereinigung weiter nicht als Handwerk
  assert.equal(feinschliffName('projekte', 'Gebäudereinigung'), null);
});

test('Kunde gewinnt: Personen-Wort begrenzt, andere Module unberührt', () => {
  const v = mitKunde(vorlageFuer('einsaetze', 'Maler'), { personWort: '  Geselle  ', personPlural: '', statusLabels: { vor_ort: 'Am Objekt' } });
  assert.equal(v.personWort, 'Geselle');
  assert.equal(v.personPlural, 'Monteure');
  assert.equal(v.status[2].label, 'Am Objekt');
  assert.equal(mitKunde(vorlageFuer('einsaetze', ''), { personWort: 'x'.repeat(50) }).personWort.length, 30);
  assert.equal(mitKunde(vorlageFuer('auftraege', ''), { personWort: 'X' }).personWort, undefined);
});

test('Kalendertag in Berlin, offene Einsätze', () => {
  assert.equal(einsatzTag('2026-10-10T22:30:00Z'), '2026-10-11'); // 00:30 Berliner Zeit
  assert.equal(einsatzTag('2026-10-11T21:59:00Z'), '2026-10-11');
  assert.equal(einsatzTag('Quatsch'), null);
  assert.equal(einsatzTag(null), null);
  assert.equal(offen({}), true);
  assert.equal(offen({ status: 'vor_ort' }), true);
  assert.equal(offen({ status: 'erledigt' }), false);
  assert.equal(offen({ status: 'abgesagt' }), false);
});

test('Suchen: vorbei, heute, nicht abgerechnet; Unbekanntes trifft nichts', () => {
  assert.equal(suchePasst('ampel=rot', { status: 'unterwegs', beginn_am: '2026-10-10T08:00:00Z' }, H), true);
  assert.equal(suchePasst('ampel=rot', { status: 'geplant', beginn_am: '2026-10-11T06:00:00Z' }, H), false);
  assert.equal(suchePasst('ampel=rot', { status: 'erledigt', beginn_am: '2026-10-01T08:00:00Z' }, H), false);
  assert.equal(suchePasst('ampel=rot', { status: 'geplant' }, H), false);
  assert.equal(suchePasst('tag=heute', { status: 'geplant', beginn_am: '2026-10-10T22:30:00Z' }, H), true);
  assert.equal(suchePasst('tag=heute', { status: 'abgesagt', beginn_am: '2026-10-11T08:00:00Z' }, H), false);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'erledigt', rechnung_id: null }, H), true);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'erledigt', rechnung_id: 'r' }, H), false);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'erledigt', rechnung_id: '  ' }, H), true);
  assert.equal(suchePasst('abgerechnet=nein', { status: 'vor_ort' }, H), false);
  assert.equal(suchePasst('irgendwas', { status: 'geplant' }, H), false);
  const liste = [
    { id: 'b', status: 'erledigt', beginn_am: '2026-10-05T08:00:00Z' },
    { id: 'c', status: 'erledigt' },
    { id: 'a', status: 'erledigt', beginn_am: '2026-10-01T08:00:00Z', rechnung_id: '' },
  ];
  assert.deepEqual(treffer(liste, 'abgerechnet=nein', H).map((e) => e.id), ['a', 'b', 'c']);
  for (const b of ['', 'Maler', 'Gebäudereinigung', 'Event']) for (const s of vorlageFuer('einsaetze', b).suchen) {
    assert.ok(/^(ampel=rot|tag=heute|abgerechnet=nein)$/.test(s.regel), s.regel);
  }
});

test('Code-Wächter: Dispo-Board und Meine Einsätze nutzen die Vorlage', () => {
  const seite = lies('app/dashboard/dispo/page.tsx');
  assert.match(seite, /useBranchenVorlage\(supabase, EINSATZ_MODUL\)/);
  assert.equal((seite.match(/statusInfo\(e\.status, statusLabel\)/g) || []).length, 3);
  assert.match(seite, /<Feld label=\{person\}>/);
  assert.match(seite, /treffer\(einsaetze, regel, heuteTag\)/);
  const ohneKommentare = seite.split('\n').filter((z) => !/^\s*\/\//.test(z)).join('\n');
  assert.doesNotMatch(ohneKommentare, /"Dem Monteur fehlt|>Monteur<|ohne Monteur|Monteur & Tag/);
  const ma = lies('app/dashboard/meine-einsaetze/page.tsx');
  assert.match(ma, /useBranchenVorlage\(supabase, 'einsaetze'\)/);
  assert.match(ma, /statusInfo\(e\.status, statusLabel\)/);
  const ansicht = lies('app/dashboard/dispo/EinsatzAnsicht.tsx');
  assert.match(ansicht, /EINSATZ_MODUL = 'einsaetze'/);
  assert.match(ansicht, /owner_user_id: betrieb, modul: EINSATZ_MODUL/);
  assert.equal((ansicht.match(/disabled=\{!istChef\}/g) || []).length, 3);
});
