// Paket 147 (28.09.2026) — Umzug Schritt 6: mehrere Dateien auf einmal — Ziel erkennen, Reihenfolge, Sonderwege.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { leseCsv } from '../out/importParser.js';
import { erkenneDatei, erkenneSonderweg, abhaengigkeiten, umzugReihenfolge, umzugPlan } from '../out/umzugPlan.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const DIR = 'tests/fixtures/umzug/';
function erkenne(name, opt) { const t = leseCsv(lies(DIR + name).replace(/^﻿/, '')); return erkenneDatei(name, t.kopf, t.zeilen, opt); }

// Musterbetrieb Elektro Haldenberg: jede Datei muss am richtigen Ziel landen
const ERWARTET = {
  '01-Kunden.csv': 'kontakte', '02-Lieferanten.csv': 'lieferanten', '03-Artikel-und-Lager.csv': 'artikel',
  '04-Offene-Posten.csv': 'rechnungen', '05-Leistungskatalog.csv': 'leistungskatalog', '07-Mitarbeiter.csv': 'mitarbeiter',
  '08-CRM-Leads.csv': 'leads', '09-CRM-Verkaufschancen.csv': 'verkaufschancen', '10-CRM-Aktivitaeten.csv': 'kontakt_aktivitaeten',
  '11-Auftraege-und-Angebote.csv': 'auftraege', '12-Wartungsvertraege.csv': 'wartungsvertraege', '13-Bestellungen.csv': 'bestellungen',
  'klein-03-qualifikationen.csv': 'mitarbeiter_qualifikation', 'klein-07-anlagen.csv': 'anlagegueter',
  'klein-09-eingangsrechnungen.csv': 'eingangsbelege', 'klein-10-laufende-kosten.csv': 'vertraege',
};

test('Haldenberg: alle 16 Listen am richtigen Ziel, Kontoauszug als Sonderweg Bank', () => {
  for (const [datei, ziel] of Object.entries(ERWARTET)) assert.equal(erkenne(datei).ziel, ziel, datei);
  const bank = erkenne('06-Kontoauszug-September-2026.csv');
  assert.equal(bank.ziel, null);
  assert.equal(bank.sonder?.art, 'bank');
  assert.equal(bank.sonder?.href, '/dashboard/banking'); // P301: die Seite heißt Banking
  const sicher = Object.keys(ERWARTET).filter((d) => erkenne(d).sicher).length;
  assert.ok(sicher >= 13, `nur ${sicher} sicher erkannt`);
});

test('Ohne Dateinamen-Hilfe (neutraler Name) tragen die Spalten allein', () => {
  for (const d of ['01-Kunden.csv', '03-Artikel-und-Lager.csv', '08-CRM-Leads.csv', '13-Bestellungen.csv']) {
    const t = leseCsv(lies(DIR + d).replace(/^﻿/, ''));
    assert.equal(erkenneDatei('export.csv', t.kopf, t.zeilen).ziel, ERWARTET[d], d);
  }
});

test('Fehlt einem Ziel ein Pflichtfeld, wird es abgewertet und nie gewaehlt', () => {
  const e = erkenne('01-Kunden.csv');
  const mitLuecke = e.kandidaten.length ? erkenneDatei('liste.csv', ['Titel', 'Kunde', 'Wert netto'], [['A', 'B', '1']]) : null;
  for (const k of [...e.kandidaten, ...(mitLuecke?.kandidaten ?? [])]) {
    if (k.pflichtFehlt.length > 0) assert.ok(k.punkte <= k.erkannt / k.spalten + 0.35 - 0.5 + 1e-9, k.ziel);
  }
  if (mitLuecke?.ziel) assert.deepEqual(mitLuecke.kandidaten.find((k) => k.ziel === mitLuecke.ziel).pflichtFehlt, []);
});

test('Nicht erlaubte Ziele werden nie vorgeschlagen (Mitarbeiter ohne Chef)', () => {
  const e = erkenne('07-Mitarbeiter.csv', { erlaubt: (k) => k !== 'mitarbeiter' });
  assert.notEqual(e.ziel, 'mitarbeiter');
  assert.ok(!e.kandidaten.some((k) => k.ziel === 'mitarbeiter'));
});

test('Sonderwege: E-Rechnung, GAEB, camt, DATEV-Buchungsstapel; normale Liste = keiner', () => {
  assert.equal(erkenneSonderweg('Rechnung-4711.xml', [], '<rsm:CrossIndustryInvoice xmlns:rsm=')?.art, 'erechnung');
  assert.equal(erkenneSonderweg('beleg-4711.xml', [], '<rsm:CrossIndustryInvoice xmlns:rsm=')?.art, 'erechnung', 'am Inhalt, nicht nur am Namen');
  assert.equal(erkenneSonderweg('LV-Neubau.x83', [])?.art, 'gaeb');
  assert.equal(erkenneSonderweg('umsaetze.xml', [], '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">')?.art, 'bank');
  assert.equal(erkenneSonderweg('EXTF_Buchungsstapel.csv', [], '"EXTF";700;21;"Buchungsstapel";')?.art, 'datev_buchungen');
  assert.equal(erkenneSonderweg('kunden.csv', ['Kundennummer', 'Firma']), null);
  const haldenberg = fs.readdirSync(path.join(WURZEL, 'tests/fixtures')).length; assert.ok(haldenberg > 0);
});

test('Abhaengigkeiten aus den Ziel-Definitionen: Verweise und Nachschlag ohne Anlegen', () => {
  assert.deepEqual(abhaengigkeiten('kontakte'), []);
  assert.ok(abhaengigkeiten('verkaufschancen').includes('kontakte'));
  assert.ok(abhaengigkeiten('mitarbeiter_qualifikation').includes('mitarbeiter'));
  assert.deepEqual(abhaengigkeiten('bestellungen').sort(), ['artikel', 'lieferanten']);
  assert.ok(abhaengigkeiten('kautionen').includes('mietvertraege'));
  assert.ok(abhaengigkeiten('anmeldungen').includes('kurse'));
  assert.ok(!abhaengigkeiten('tour_stopps').includes('tour'), 'Touren werden angelegt — keine Abhaengigkeit');
});

test('Reihenfolge: Grundlagen zuerst, Fehlendes gemeldet, jede Datei genau einmal', () => {
  const r = umzugReihenfolge(['kautionen', 'bestellungen', 'mietvertraege', 'artikel', 'lieferanten', 'verkaufschancen', 'kontakte', 'einheiten']);
  const pos = (k) => r.reihenfolge.indexOf(k);
  assert.ok(pos('kontakte') < pos('verkaufschancen'));
  assert.ok(pos('artikel') < pos('bestellungen') && pos('lieferanten') < pos('bestellungen'));
  assert.ok(pos('einheiten') < pos('mietvertraege') && pos('mietvertraege') < pos('kautionen'));
  assert.equal(r.reihenfolge.length, 8);
  const f = umzugReihenfolge(['anmeldungen']);
  assert.deepEqual(f.fehlend, [{ ziel: 'anmeldungen', braucht: 'kurse' }]);
});

test('Plan: Haldenberg-Stapel nummeriert, Sonderweg ohne Nummer am Ende', () => {
  const alle = fs.readdirSync(path.join(WURZEL, DIR)).map((d) => erkenne(d));
  const p = umzugPlan(alle);
  assert.equal(p.eintraege.length, alle.length);
  const nr = (d) => p.eintraege.find((e) => e.datei === d)?.schritt;
  assert.ok(nr('01-Kunden.csv') < nr('09-CRM-Verkaufschancen.csv'));
  assert.ok(nr('07-Mitarbeiter.csv') < nr('klein-03-qualifikationen.csv'));
  assert.ok(nr('03-Artikel-und-Lager.csv') < nr('13-Bestellungen.csv') && nr('02-Lieferanten.csv') < nr('13-Bestellungen.csv'));
  assert.equal(nr('06-Kontoauszug-September-2026.csv'), null);
  assert.equal(p.eintraege.at(-1).datei, '06-Kontoauszug-September-2026.csv');
  assert.deepEqual(p.fehlend, []);
});

test('Seite: Stapel liest nur den Kopf im Browser; Oeffnen waehlt Ziel und liest dann die Datei', () => {
  const k = lies('app/dashboard/import/UmzugStapel.tsx');
  assert.ok(k.includes('f.slice(0, 256 * 1024)'));
  assert.ok(!/fetch\(/.test(k), 'nichts wird hochgeladen');
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('if (!wartend || zielKey !== wartend.ziel || busy) return;'));
  assert.ok(s.includes('onOeffnen={(d, k) => { zielWaehlen(k); setWartend({ datei: d, ziel: k });'));
});
