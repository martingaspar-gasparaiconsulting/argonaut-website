// Paket 142 (28.09.2026) — Aufwand (GEMEINSAM, freigegeben 27.09.2026): NUR nicht abgerechnete Stunden.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, dauerInStunden, GELDFELDER } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import { importErlaubt } from '../out/importRechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// projektleistungen live = 12 Spalten (buendel10), laut p138-Kontrolle
const SPALTEN = [['id', 'uuid'], ['owner_user_id', 'uuid'], ['projekt_id', 'uuid'], ['kunde_name', 'text'], ['datum', 'date'],
  ['beschreibung', 'text', true], ['stunden', 'numeric'], ['stundensatz', 'numeric'], ['mwst_satz', 'numeric'],
  ['abgerechnet', 'boolean'], ['rechnung_id', 'uuid'], ['erstellt_am', 'timestamp with time zone']];
const DB = SPALTEN.map(([spalte, datentyp, pflicht]) => ({ tabelle: 'projektleistungen', spalte, datentyp, pflicht: !!pflicht }));
const ziel = () => katalogFuerZiel('aufwand', DB).ziel;
function datei(text) {
  const t = leseCsv(text); const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('aufwand', map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 142: Karte auf dem Motor, Bereich Aufwand, keine Abrechnungs-Felder', () => {
  assert.equal(SPALTEN.length, 12);
  const q = importQuellen().find((x) => x.key === 'aufwand');
  assert.equal(q?.motor, 'aufwand');
  assert.equal(q?.vorlage, undefined);
  assert.equal(importErlaubt('aufwand', { chef: false, module: ['aufwand'], schreibModule: ['aufwand'] }).ok, true);
  assert.equal(importErlaubt('aufwand', { chef: false, module: ['aufwand'], schreibModule: [] }).ok, false);
  const keys = ziel().felder.map((f) => f.key);
  for (const k of ['abgerechnet', 'rechnung_id', 'projekt_id']) assert.ok(!keys.includes(k), k);
  assert.deepEqual(katalogFuerZiel('aufwand', DB).zusatz.map((f) => f.key), []);
  assert.ok(GELDFELDER.includes('stundensatz'));
});

test('Abgerechnetes faellt mit Grund heraus: Haken, Status, Rechnungsnummer', () => {
  const r = datei('Datum;Tätigkeit;Stunden;Abgerechnet;Rechnungsnummer\n01.09.2026;A;2;nein;\n02.09.2026;B;3;ja;\n03.09.2026;C;1;;RE-2026-0042\n04.09.2026;D;4;x;\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.saetze[0].beschreibung, 'A');
  assert.equal(r.b.saetze[0].abgerechnet, false);
  assert.ok(r.b.fehler.some((f) => f.zeile === 3 && /Bereits abgerechnet/.test(f.meldung)));
  assert.ok(r.b.fehler.some((f) => f.zeile === 4 && /Rechnungsnummer/.test(f.meldung)));
  assert.ok(r.b.fehler.some((f) => f.zeile === 5 && /Bereits abgerechnet/.test(f.meldung)));
  assert.equal(r.bil.verschluckt, 0);
  assert.ok(!('abgerechnet_alt' in r.b.saetze[0]) && !('rechnung_alt' in r.b.saetze[0]));
  const s = datei('Datum;Beschreibung;Stunden;Status\n01.09.2026;A;2;offen\n01.09.2026;B;2;Fakturiert\n');
  assert.equal(s.b.gut, 1);
});

test('Dauer „1:30" / Minuten -> Stunden; ohne Stunden faellt die Zeile heraus', () => {
  assert.equal(dauerInStunden('1:30'), 1.5);
  assert.equal(dauerInStunden('0:20'), 0.33);
  assert.equal(dauerInStunden('2,25'), 2.25);
  assert.equal(dauerInStunden('90 min'), 1.5);
  assert.equal(dauerInStunden('viel'), null);
  const r = datei('Datum;Beschreibung;Dauer\n01.09.2026;A;1:45\n01.09.2026;B;\n01.09.2026;C;viel\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.saetze[0].stunden, 1.75);
  assert.ok(!('dauer' in r.b.saetze[0]));
  assert.ok(r.b.fehler.some((f) => f.zeile === 3 && /Keine Stunden/.test(f.meldung)));
  assert.ok(r.b.fehler.some((f) => f.zeile === 4 && /Keine Stunden/.test(f.meldung)));
  const m = datei('Datum;Beschreibung;Minuten\n01.09.2026;A;45\n');
  assert.equal(m.b.saetze[0].stunden, 0.75);
});

test('Warnungen: > 24 Stunden, fehlender Stundensatz; unlesbarer Satz = Zeile raus', () => {
  const r = datei('Datum;Beschreibung;Stunden;Stundensatz\n01.09.2026;Woche;38;95\n01.09.2026;X;2;\n01.09.2026;Y;2;teuer\n');
  assert.equal(r.b.gut, 2);
  assert.ok(r.b.warnungen.some((w) => w.zeile === 2 && /Wochensumme/.test(w.meldung)));
  assert.ok(r.b.warnungen.some((w) => w.zeile === 3 && /Kein Stundensatz/.test(w.meldung)));
  assert.ok(r.b.fehler.some((f) => f.zeile === 4 && /kein lesbarer Betrag/.test(f.meldung)));
});

test('Mitarbeiter und Leistungsart landen in der Beschreibung; Projekt als Nachschlag', () => {
  const r = datei('Projekt;Datum;Tätigkeit;Stunden;Mitarbeiter;Leistungsart\nHaldenberg Neubau;01.09.2026;Kabel verlegt;4;Tom Berger;Montage\n');
  const s = r.b.saetze[0];
  assert.match(s.beschreibung, /^Kabel verlegt\nMitarbeiter: Tom Berger\nLeistungsart: Montage$/);
  assert.equal(s.__nach, 'Haldenberg Neubau');
  assert.equal(zielDef('aufwand').nachschlag.tabelle, 'projekte');
  assert.equal(zielDef('aufwand').nachschlag.anlegen, undefined, 'Projekte werden nie angelegt');
});

test('Erkennung Datum+Beschreibung+Stunden; alte Vorlage und Mustervorlage laufen rund', () => {
  assert.deepEqual(erkennungsFelder(ziel()), ['datum+beschreibung+stunden']);
  const alt = datei(lies('public/vorlagen/aufwand-import-vorlage.csv'));
  assert.equal(alt.bil.verschluckt, 0);
  assert.ok(!Object.values(alt.map).includes(EIGEN));
  assert.equal(alt.b.gut, 3);
  assert.equal(alt.b.saetze[0].stunden, 3.5);
  assert.equal(alt.b.saetze[2].stundensatz, 110);
  const m = datei(baueMustervorlage('aufwand').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.equal(m.b.gut, 3);
  assert.ok(m.b.saetze.every((s) => s.abgerechnet === false));
  const d = datei('Datum;Beschreibung;Stunden\n01.09.2026;A;2\n01.09.2026;A;2\n');
  assert.equal(d.b.dubletten_in_datei, 1);
});
