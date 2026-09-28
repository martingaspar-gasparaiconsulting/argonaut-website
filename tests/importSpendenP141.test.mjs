// Paket 141 (28.09.2026) — Spenden (GEMEINSAM, freigegeben 27.09.2026):
// IMMER unbestaetigt, keine Bestaetigungsnummer, alte Nummer in die Notiz
// (nicht in den Zweck — der wird auf die Zuwendungsbestaetigung gedruckt).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, erkennungsFelder, vergleichsText, baueBestandIndex, findeImBestand } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, fehlendePflichtfelder } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';
import { spendeAltBestaetigt } from '../out/spenden.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Spalten von spende live = 16 (p138-Kontrolle), laut Seite + dsgvoDaten (kontakt_id)
const SPALTEN = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['datum', 'date', true], ['spender_name', 'text', true],
  ['spender_anschrift', 'text'], ['betrag', 'numeric', true], ['art', 'text'], ['sachwert_text', 'text'],
  ['verzicht_aufwand', 'boolean'], ['zweck', 'text'], ['bestaetigt', 'boolean'], ['bestaetigt_am', 'date'],
  ['bestaetigung_nr', 'text'], ['notiz', 'text'], ['erstellt_am', 'timestamp with time zone'], ['kontakt_id', 'uuid']];
const DB = SPALTEN.map(([spalte, datentyp, pflicht]) => ({ tabelle: 'spende', spalte, datentyp, pflicht: !!pflicht }));
const ziel = () => katalogFuerZiel('spenden', DB).ziel;
function datei(text) {
  const t = leseCsv(text); const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('spenden', map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 141: 16 Spalten; Karte auf dem Motor; Eigene Felder wie das Modul; Rechte ueber den Bereich', () => {
  assert.equal(SPALTEN.length, 16);
  const q = importQuellen().find((x) => x.key === 'spenden');
  assert.equal(q?.motor, 'spenden');
  assert.equal(q?.musterZiel, 'spenden');
  const z = zielDef('spenden');
  assert.equal(z.eigeneFelderModul, 'spende');
  assert.ok(lies('app/dashboard/spenden/page.tsx').includes("const MODUL = 'spende';"));
  assert.equal(z.nurNeu, true);
  assert.equal(importErlaubt('spenden', { chef: false, module: ['spenden'], schreibModule: ['spenden'] }).ok, true);
  assert.equal(importErlaubt('spenden', { chef: false, module: ['spenden'], schreibModule: [] }).ok, false);
  assert.deepEqual(katalogFuerZiel('spenden', DB).zusatz.map((f) => f.key), []);
});

test('Bestaetigung kommt NIE aus der Datei: Felder ausgeblendet, bestaetigt immer false, keine Nummer', () => {
  const keys = ziel().felder.map((f) => f.key);
  for (const k of ['bestaetigt', 'bestaetigt_am', 'bestaetigung_nr', 'verzicht_aufwand']) assert.ok(!keys.includes(k), k);
  const r = datei('Datum;Spender;Betrag;Bestätigt;Bestätigt am;Bestätigungsnummer;Zweck\n15.03.2025;Anna Beispiel;100;ja;20.03.2025;ZB-2025-003;Jugendarbeit\n');
  const s = r.b.saetze[0];
  assert.equal(s.bestaetigt, false);
  assert.ok(!('bestaetigung_nr' in s) && !('bestaetigt_am' in s));
  assert.equal(s.zweck, 'Jugendarbeit', 'Zweck bleibt sauber (wird gedruckt)');
  assert.match(s.notiz, /^Bestätigungsnummer im Altsystem: ZB-2025-003$/m);
  assert.match(s.notiz, /^Bestätigt im Altsystem: ja$/m);
  assert.match(s.notiz, /^Bestätigt am im Altsystem: 20\.03\.2025$/m);
  assert.ok(r.b.warnungen.some((w) => /KEINE zweite Zuwendungsbestätigung/.test(w.meldung)));
  assert.equal(r.bil.verschluckt, 0);
  assert.ok(!Object.values(r.map).includes(EIGEN));
});

test('spendeAltBestaetigt: Nummer/Datum/ja zaehlt, nein/offen/leer nicht', () => {
  assert.equal(spendeAltBestaetigt('Bestätigungsnummer im Altsystem: ZB-1'), true);
  assert.equal(spendeAltBestaetigt('x\nBestätigt am im Altsystem: 01.01.2025'), true);
  assert.equal(spendeAltBestaetigt('Bestätigt im Altsystem: Ja'), true);
  assert.equal(spendeAltBestaetigt('Bestätigt im Altsystem: nein'), false);
  assert.equal(spendeAltBestaetigt('Bestätigt im Altsystem: offen'), false);
  assert.equal(spendeAltBestaetigt(null), false);
  const r = datei('Datum;Spender;Betrag;Bestätigt\n15.03.2025;Anna;50;nein\n');
  assert.ok(!r.b.warnungen.some((w) => /zweite Zuwendungsbestätigung/.test(w.meldung)));
  assert.equal(r.b.saetze[0].bestaetigt, false);
});

test('Art-Liste; Aufwandsverzicht setzt den Haken; Sachspende ohne Bezeichnung warnt', () => {
  const r = datei('Datum;Spender;Betrag;Art;Gegenstand\n01.01.2026;A;10;Überweisung;\n01.01.2026;B;20;Aufwandsspende;\n01.01.2026;C;30;Sachspende;\n01.01.2026;D;40;Tombola;\n');
  const [a, b, c, d] = r.b.saetze;
  assert.equal(a.art, 'geldzuwendung'); assert.equal(a.verzicht_aufwand, false);
  assert.equal(b.art, 'aufwandsverzicht'); assert.equal(b.verzicht_aufwand, true);
  assert.equal(c.art, 'sachzuwendung');
  assert.ok(r.b.warnungen.some((w) => w.zeile === 4 && /ohne Bezeichnung/.test(w.meldung)));
  assert.equal(d.art, 'geldzuwendung'); assert.match(d.notiz, /Art im Altsystem: Tombola/);
});

test('Vor-/Nachname -> Spender, Strasse/PLZ/Ort -> Anschrift; Pflicht Datum, Spender, Betrag', () => {
  const r = datei('Datum;Vorname;Nachname;Straße;PLZ;Ort;Betrag\n15.03.2026;Anna;Beispiel;Hauptstraße 5;71032;Böblingen;100\n;Bernd;Test;;;;50\n16.03.2026;Clara;X;;;;zehn\n');
  assert.deepEqual(fehlendePflichtfelder(r.map, 'spenden', r.z), []);
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.saetze[0].spender_name, 'Anna Beispiel');
  assert.equal(r.b.saetze[0].spender_anschrift, 'Hauptstraße 5, 71032 Böblingen');
  assert.ok(!('lead_vorname' in r.b.saetze[0]) && !('adresse_strasse' in r.b.saetze[0]));
  assert.ok(r.b.fehler.some((f) => f.zeile === 3 && f.feld === 'Datum der Zuwendung'));
  assert.ok(r.b.fehler.some((f) => f.zeile === 4 && /kein lesbarer Betrag/.test(f.meldung)));
});

test('Andere Ziele unveraendert: Leads-Name und Adresse wie bisher', () => {
  const l = zielDef('leads');
  assert.ok(l.felder.filter((f) => f.virtuell === 'name_teil').every((f) => !f.fuellt));
});

test('Erkennung Spender+Datum+Betrag; Datenbank-Betrag als Text „100.00" wird erkannt', () => {
  assert.deepEqual(erkennungsFelder(ziel()), ['spender_name+datum+betrag']);
  assert.equal(vergleichsText('100.00'), '100');
  assert.equal(vergleichsText(100), '100');
  assert.equal(vergleichsText('007'), '007', 'ganze Nummern bleiben Text');
  const idx = baueBestandIndex([{ id: 'x1', spender_name: 'Anna Beispiel', datum: '2026-03-15', betrag: '100.00' }], erkennungsFelder(ziel()));
  const r = datei('Datum;Spender;Betrag\n15.03.2026;Anna Beispiel;100\n15.03.2026;Anna Beispiel;100,00\n15.03.2026;Anna Beispiel;25\n');
  assert.equal(r.b.gut, 2);
  assert.equal(r.b.dubletten_in_datei, 1);
  assert.equal(findeImBestand(r.b.saetze[0], erkennungsFelder(ziel()), idx), 'x1');
  assert.equal(findeImBestand(r.b.saetze[1], erkennungsFelder(ziel()), idx), undefined);
});

test('Seite: nurNeu ueberschreibt nie; Spenden-Seite warnt vor zweiter Bestaetigung', () => {
  const imp = lies('app/dashboard/import/page.tsx');
  assert.ok(imp.includes("if (beiDublette === 'aktualisieren' && !ziel.nurNeu) zuAendern.push("));
  assert.ok(imp.includes('Vorhandene Einträge werden hier nie überschrieben'));
  const sp = lies('app/dashboard/spenden/page.tsx');
  assert.ok(sp.includes('!s.bestaetigt && spendeAltBestaetigt(s.notiz)'));
});

test('Alte Vorlage und Mustervorlage laufen rund', () => {
  const alt = datei(lies('public/vorlagen/spenden-import-vorlage.csv'));
  assert.equal(alt.bil.verschluckt, 0);
  assert.ok(!Object.values(alt.map).includes(EIGEN));
  assert.equal(alt.b.gut, 3);
  assert.equal(alt.b.saetze[2].art, 'sachzuwendung');
  const m = datei(baueMustervorlage('spenden').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.ok(!Object.values(m.map).includes(EIGEN));
  assert.equal(m.b.gut, 3);
  assert.equal(m.b.saetze[1].betrag, 500);
  assert.equal(m.b.saetze[2].sachwert_text, '2 Fußballtore, gebraucht');
  assert.ok(m.b.saetze.every((s) => s.bestaetigt === false));
});
