// ARGONAUT OS · tests/ustva.test.mjs — Punkt 17 (18.09.2026)
//
// Eine unrichtige Voranmeldung ist nach § 153 AO berichtigungspflichtig.
// lib/ustva.ts hatte keinen Test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueUstva, satzVon, ustvaHinweise, formatEuro } from '../out/ustva.js';
import { ustvaZeilen, ustvaCsv, euroText } from '../out/ustvaExport.js';

const kz = (erg, nummer) => erg.kennziffern.find((k) => k.kz === nummer);

// ===========================================================================
// BEFUND 1 — Gutschriften verschwanden, und der Betrieb zahlte zu viel
// ===========================================================================

test('DER WICHTIGSTE TEST: eine Gutschrift mindert Umsatz UND Umsatzsteuer', () => {
  // Vorher: satzVon gab bei negativem Netto 0 zurueck. Die Gutschrift lief in
  // die steuerfreien Umsaetze, ihre USt wurde nicht abgezogen. Kz 81 zeigte
  // 10.000 statt 9.000, die Zahllast 1.900 statt 1.710 — 190 EUR zu viel.
  const e = baueUstva(
    [
      { netto_summe: 10000, mwst_summe: 1900 },
      { netto_summe: -1000, mwst_summe: -190 },
    ],
    0,
  );
  assert.equal(e.umsatz19, 9000);
  assert.equal(e.ust19, 1710);
  assert.equal(e.umsatz0, 0);
  assert.equal(e.zahllast, 1710);
  assert.equal(kz(e, '81').wert, 9000);
});

test('satzVon erkennt den Steuersatz auch bei negativen Betraegen', () => {
  assert.equal(satzVon(-1000, -190), 19);
  assert.equal(satzVon(-1000, -70), 7);
  assert.equal(satzVon(1000, 190), 19);
  assert.equal(satzVon(1000, 70), 7);
  assert.equal(satzVon(1000, 0), 0);
  assert.equal(satzVon(0, 0), 0);
});

test('eine Gutschrift zu 7 Prozent mindert den 7-Prozent-Umsatz', () => {
  const e = baueUstva(
    [
      { netto_summe: 5000, mwst_summe: 350 },
      { netto_summe: -500, mwst_summe: -35 },
    ],
    0,
  );
  assert.equal(e.umsatz7, 4500);
  assert.equal(e.ust7, 315);
  assert.equal(e.umsatz19, 0);
});

test('eine Gutschrift wird gezaehlt und im Hinweis genannt', () => {
  const e = baueUstva([{ netto_summe: -1000, mwst_summe: -190 }], 0);
  assert.equal(e.gutschriften, 1);
  assert.match(ustvaHinweise(e).join(' '), /Gutschrift mindert/);
});

// ===========================================================================
// BEFUND 2 — Kennziffer 83 verlor das Vorzeichen
// ===========================================================================

test('DER WICHTIGSTE TEST: eine Erstattung steht mit Minus in Kennziffer 83', () => {
  // Vorher: Math.abs(zahllast). Wer 710 statt -710 abtippt, dreht eine
  // Erstattung in eine Zahlung — 1.420 EUR Unterschied.
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 900);
  assert.equal(e.zahllast, -710);
  assert.equal(kz(e, '83').wert, -710);
  assert.match(kz(e, '83').label, /Erstattung/);
  assert.match(kz(e, '83').label, /Minus/);
});

test('eine Zahllast bleibt positiv und heisst weiterhin Vorauszahlung', () => {
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 90);
  assert.equal(kz(e, '83').wert, 100);
  assert.match(kz(e, '83').label, /Vorauszahlung/);
});

test('das Minus kommt bis in Export und CSV durch', () => {
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 900);
  const zeile = ustvaZeilen(e).find((r) => r.kz === '83');
  assert.match(zeile.betrag, /^-710,00/);
  assert.match(ustvaCsv(e, '2026-03-01', '2026-03-31'), /-710,00/);
  assert.equal(euroText(-710), '-710,00 €');
});

test('der Hinweis warnt ausdruecklich vor dem fehlenden Minus', () => {
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 900);
  assert.match(ustvaHinweise(e).join(' '), /MIT Minuszeichen/);
});

// ===========================================================================
// BEFUND 3 — steuerfreie Umsaetze wurden auf eine Kennziffer geraten
// ===========================================================================

test('DER WICHTIGSTE TEST: steuerfrei bekommt KEINE geratene Kennziffer', () => {
  // Der Pruefbefund wollte 48 durch 41 ersetzen. Beides waere geraten: aus
  // netto und mwst laesst sich nicht ableiten, WARUM etwas steuerfrei ist.
  const e = baueUstva([{ netto_summe: 5000, mwst_summe: 0 }], 0);
  assert.equal(kz(e, '48'), undefined);
  assert.equal(kz(e, '41'), undefined);
  const frei = kz(e, '?');
  assert.ok(frei, 'die steuerfreie Zeile fehlt ganz');
  assert.equal(frei.wert, 5000);
  assert.match(frei.label, /Steuerberater/);
});

test('ein negativer steuerfreier Saldo verschwindet nicht mehr aus der Anzeige', () => {
  // Vorher: die Zeile erschien nur bei einem Wert GROESSER null.
  const e = baueUstva([{ netto_summe: -5000, mwst_summe: 0 }], 0);
  assert.equal(kz(e, '?').wert, -5000);
});

test('ohne steuerfreie Umsaetze gibt es die Zeile gar nicht', () => {
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 0);
  assert.equal(kz(e, '?'), undefined);
  assert.equal(ustvaHinweise(e).some((h) => h.includes('steuerfreie Umsätze')), false);
});

// ===========================================================================
// Beim Reparieren gefunden: Bemessungsgrundlage lief durch Math.floor
// ===========================================================================

test('die Bemessungsgrundlage rundet in Richtung Null, nicht nach unten', () => {
  // Math.floor machte aus -1000,50 die -1001 und meldete einen Euro zu viel
  // als Minderung. Jetzt Math.trunc.
  const minus = baueUstva([{ netto_summe: -1000.5, mwst_summe: -190.1 }], 0);
  assert.equal(kz(minus, '81').wert, -1000);
  const plus = baueUstva([{ netto_summe: 1000.9, mwst_summe: 190.17 }], 0);
  assert.equal(kz(plus, '81').wert, 1000);
});

// ===========================================================================
// Was unveraendert bleiben MUSS
// ===========================================================================

test('der einfache Regelfall rechnet wie vorher', () => {
  const e = baueUstva(
    [
      { netto_summe: 10000, mwst_summe: 1900 },
      { netto_summe: 2000, mwst_summe: 140 },
    ],
    500,
  );
  assert.equal(kz(e, '81').wert, 10000);
  assert.equal(kz(e, '86').wert, 2000);
  assert.equal(kz(e, '66').wert, 500);
  assert.equal(e.zahllast, 1540);
  assert.equal(kz(e, '83').wert, 1540);
});

test('leere Eingaben ergeben Nullen, keinen Absturz', () => {
  const e = baueUstva([], 0);
  assert.equal(e.zahllast, 0);
  assert.equal(kz(e, '81').wert, 0);
  assert.equal(baueUstva(null, null).zahllast, 0);
  assert.equal(baueUstva(undefined, undefined).zahllast, 0);
});

test('deutsche Zahltexte werden gelesen statt zu 0 zu werden', () => {
  // Der alte Leser ersetzte nur das erste Komma: "1.234,56" wurde NaN -> 0.
  const e = baueUstva([{ netto_summe: '10.000,00', mwst_summe: '1.900,00' }], '500,00');
  assert.equal(e.umsatz19, 10000);
  assert.equal(e.ust19, 1900);
  assert.equal(e.vorsteuer, 500);
  assert.equal(e.zahllast, 1400);
});

test('der Hinweis nennt die Ist-Versteuerung immer', () => {
  assert.match(ustvaHinweise(baueUstva([], 0)).join(' '), /Ist-Versteuerung/);
});

test('formatEuro und die Exportzeilen bleiben formgleich', () => {
  assert.match(formatEuro(1234.5), /1\.234,50/);
  const e = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 0);
  const zeilen = ustvaZeilen(e);
  assert.equal(zeilen.length, e.kennziffern.length);
  assert.deepEqual(Object.keys(zeilen[0]), ['kz', 'position', 'betrag']);
  const csv = ustvaCsv(e, '2026-03-01', '2026-03-31');
  assert.ok(csv.startsWith('﻿'), 'UTF-8-BOM fehlt');
  assert.ok(csv.includes('\r\n'), 'CRLF fehlt');
});
