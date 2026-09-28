// Paket 152 (28.09.2026) — Umzug Schritt 7, DATEV-Rest: Debitoren/Kreditoren im Umzug-Stapel
// (eine Datei -> Kunden UND Lieferanten) und klare Gruende fuer die uebrigen DATEV-Kategorien.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { datevStapel, datevKategorie, erkenneSonderweg, erkenneDatei } from '../out/umzugPlan.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const kopf = (kat, name) => `"EXTF";700;${kat};"${name}";5;20260927101500000;;"RE";"";"";1001;2002;20260101;4;;;"";"";;;;"EUR"`;
const DATEV = [
  '﻿' + kopf(16, 'Debitoren/Kreditoren'),
  'Konto;Name (Adressattyp Unternehmen);Name (Adressattyp natürl. Person);Vorname (Adressattyp natürl. Person);Straße;Postleitzahl;Ort;E-Mail',
  '10001;"Müller GmbH";;;"Hauptstr. 1";70173;Stuttgart;info@mueller.de',
  '10002;;"Berg";"Anna";"Ringweg 4";71032;Böblingen;anna@berg.de',
  '70001;"Großhandel Süd AG";;;"Industriestr. 9";80939;München;bestellung@gh-sued.de',
  '1200;"Bank";;;;;;',
].join('\r\n');

test('DATEV-Kategorie aus dem Kopf (auch mit Anfuehrungszeichen)', () => {
  assert.equal(datevKategorie(kopf(16, 'Debitoren/Kreditoren')), 16);
  assert.equal(datevKategorie('"EXTF";"700";"46";"Zahlungsbedingungen"'), 46);
  assert.equal(datevKategorie('Kundennummer;Firma'), null);
});

test('Debitoren/Kreditoren zaehlen — eine Datei, zwei Ziele', () => {
  const d = datevStapel(DATEV);
  assert.equal(d.debitoren, 2);
  assert.equal(d.kreditoren, 1);
  assert.equal(d.sonst, 1, 'Sachkonto 1200');
  assert.equal(d.kopf[0], 'Konto');
  assert.equal(datevStapel('Kundennummer;Firma\r\nK1;A'), null);
  assert.equal(datevStapel(kopf(21, 'Buchungsstapel') + '\r\nUmsatz;Soll/Haben\r\n1;S'), null);
});

test('Uebrige DATEV-Kategorien: Sonderweg mit eigenem Grund, 16 ist keiner', () => {
  const s = (kat, name) => erkenneSonderweg('export.csv', [], kopf(kat, name));
  assert.equal(s(21, 'Buchungsstapel').art, 'datev_buchungen');
  assert.equal(s(65, 'Wiederkehrende Buchungen').art, 'datev_buchungen');
  assert.match(s(20, 'Kontenbeschriftungen').grund, /Kontenplan/);
  assert.match(s(46, 'Zahlungsbedingungen').grund, /Zahlungsbedingungen/);
  assert.match(s(48, 'Diverse Adressen').grund, /Hauptadresse/);
  assert.equal(s(48, 'Diverse Adressen').titel, 'DATEV: Diverse Adressen');
  assert.equal(s(99, 'Irgendwas').art, 'datev_andere');
  assert.equal(s(16, 'Debitoren/Kreditoren'), null);
  assert.equal(erkenneDatei('EXTF_Zahlungsbedingungen.csv', ['x'], [], { ersteZeile: kopf(46, 'Zahlungsbedingungen') }).sonder.art, 'datev_andere');
});

test('Umzug-Stapel: DATEV-Datei als Kunden und als Lieferanten eingeplant', () => {
  const u = lies('app/dashboard/import/UmzugStapel.tsx');
  assert.ok(u.includes('const dv = datevStapel('));
  assert.ok(u.includes('`${f.name} (Kreditoren)`'));
  assert.ok(u.includes("props.erlaubt('lieferanten') ? 'lieferanten' : ''"));
});
