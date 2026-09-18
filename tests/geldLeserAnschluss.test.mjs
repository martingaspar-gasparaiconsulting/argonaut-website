// ARGONAUT OS · tests/geldLeserAnschluss.test.mjs
// Punkt 24 (18.09.2026): zahlungAufteilung, angebotRabatt und angebotBundle
// haengen am gemeinsamen Zahlen-Leser aus lib/zahlen.ts.
//
// Jeder Test unten beschreibt einen Fall, der VOR dieser Aenderung falsch war.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  teileZahlung,
  summiereZahlungen,
  ermittleErsatzSatz,
  satzVonRechnung,
} from '../out/zahlungAufteilung.js';
import {
  rechneAngebot,
  staffelRabatt,
  positionsNetto,
  effektiverRabattPosition,
  formatEuro,
} from '../out/angebotRabatt.js';
import { nurGefuellte, normalisierePositionen } from '../out/angebotBundle.js';

// ===========================================================================
// zahlungAufteilung — bisher wurde "1.234,56" zu 0,00 Euro
// ===========================================================================

test('DER WICHTIGSTE TEST: eine Zahlung ueber 1.234,56 ist nicht mehr 0 Euro', () => {
  // Vorher: replace(',','.') ergab "1.234.56" -> NaN -> Rueckfall 0.
  const a = teileZahlung('1.234,56', null, 19);
  assert.equal(a.brutto, 1234.56);
  assert.equal(a.netto, 1037.45);
  assert.equal(a.ust, 197.11);
  assert.equal(a.netto + a.ust, a.brutto);
});

test('Betrag mit Euro-Zeichen und Leerzeichen wird gelesen', () => {
  assert.equal(teileZahlung('1 234,56 EUR', null, 19).brutto, 1234.56);
  assert.equal(teileZahlung('119,00 €', null, 19).brutto, 119);
});

test('die 119-Euro-Aufteilung aus dem Dateikopf stimmt weiterhin', () => {
  const a = teileZahlung(119, null, 19);
  assert.deepEqual(a, { brutto: 119, netto: 100, ust: 19, satz: 19, geschaetzt: true });
});

test('Rechnungssummen in deutscher Schreibweise teilen anteilig richtig', () => {
  // Teilzahlung 500 auf eine Rechnung ueber 1.190,00 brutto / 1.000,00 netto.
  const r = { netto_summe: '1.000,00', mwst_summe: '190,00', brutto_summe: '1.190,00' };
  const a = teileZahlung(500, r, 0);
  assert.equal(a.geschaetzt, false);
  assert.equal(a.netto, 420.17);
  assert.equal(a.ust, 79.83);
  assert.equal(a.satz, 19);
});

test('satzVonRechnung erkennt 19 Prozent auch bei deutschen Zahltexten', () => {
  assert.equal(satzVonRechnung({ netto_summe: '1.000,00', mwst_summe: '190,00' }), 19);
  assert.equal(satzVonRechnung({ netto_summe: '2.000,00', mwst_summe: '140,00' }), 7);
  assert.equal(satzVonRechnung({ netto_summe: '5.000,00', mwst_summe: '0,00' }), 0);
});

test('der Ersatzsatz wird nach Umsatz gewichtet, auch mit Tausenderpunkten', () => {
  // Eine grosse 19er-Rechnung gegen zwei kleine 7er — Umsatz entscheidet.
  const e = ermittleErsatzSatz(null, [
    { netto_summe: '10.000,00', mwst_summe: '1.900,00' },
    { netto_summe: '100,00', mwst_summe: '7,00' },
    { netto_summe: '200,00', mwst_summe: '14,00' },
  ]);
  assert.equal(e.satz, 19);
  assert.equal(e.herkunft, 'abgeleitet');
});

test('eine Ruecklastschrift kippt beim Runden nicht in die falsche Richtung', () => {
  // Vorher rundete r2 negative Werte nach oben: -2,345 wurde -2,34.
  const a = teileZahlung(-2.345, null, 0);
  assert.equal(a.brutto, -2.35);
});

test('summiereZahlungen zaehlt deutsche Betraege mit statt sie zu verschlucken', () => {
  const s = summiereZahlungen(
    [
      { betrag: '1.234,56', zahlungsdatum: '2026-03-01', rechnung_id: null },
      { betrag: '765,44', zahlungsdatum: '2026-03-02', rechnung_id: null },
    ],
    {},
    0,
    '2026-01-01',
    '2026-12-31',
  );
  assert.equal(s.anzahl, 2);
  assert.equal(s.brutto, 2000);
  assert.equal(s.geschaetztAnzahl, 2);
  assert.equal(s.geschaetztBetrag, 2000);
});

test('unlesbare Betraege ergeben weiterhin 0 und sperren nichts', () => {
  assert.equal(teileZahlung('keine Zahl', null, 19).brutto, 0);
  assert.equal(teileZahlung(null, null, 19).brutto, 0);
  assert.equal(teileZahlung(undefined, null, 19).brutto, 0);
});

// ===========================================================================
// angebotRabatt — bisher wurde "223.75" zu 22.375 und "7.5 %" zu 75 %
// ===========================================================================

test('DER WICHTIGSTE TEST: ein Einzelpreis 223.75 bleibt 223,75 Euro', () => {
  // Vorher: replace(/\./g,'') machte 22375 daraus — Faktor 100.
  const a = rechneAngebot([{ menge: '1', einzelpreis: '223.75', mwst_satz: '19', rabatt: '0' }], 0);
  assert.equal(a.netto, 223.75);
  assert.equal(a.mwst, 42.51);
  assert.equal(a.brutto, 266.26);
});

test('7.5 Prozent Rabatt bleiben 7,5 Prozent und werden nicht 75', () => {
  const a = rechneAngebot([{ menge: '1', einzelpreis: '1000', mwst_satz: '19', rabatt: '7.5' }], 0);
  assert.equal(a.positionen[0].effektivProzent, 7.5);
  assert.equal(a.netto, 925);
});

test('deutsche Schreibweise im Angebot rechnet richtig', () => {
  const a = rechneAngebot(
    [{ menge: '2', einzelpreis: '1.234,56', mwst_satz: '19', rabatt: '0' }],
    '0',
  );
  assert.equal(a.zwischenNetto, 2469.12);
  assert.equal(a.netto, 2469.12);
});

test('Mengenstaffeln lesen ihre Schwellen in deutscher Schreibweise', () => {
  const staffeln = [{ abMenge: '1.000', rabatt: '10' }, { abMenge: '10.000', rabatt: '15' }];
  assert.equal(staffelRabatt(999, staffeln), 0);
  assert.equal(staffelRabatt(1000, staffeln), 10);
  assert.equal(staffelRabatt(10000, staffeln), 15);
});

test('positionsNetto rechnet mit deutschen Texten dasselbe wie mit Zahlen', () => {
  assert.equal(positionsNetto('2', '1.234,56', 0), positionsNetto(2, 1234.56, 0));
  assert.equal(positionsNetto('2', '1.234,56', 10), 2222.21);
});

test('effektiverRabattPosition faltet Positions- und Gesamtrabatt', () => {
  // 10 % auf die Position, 10 % auf das Angebot -> 19 %, nicht 20 %.
  assert.equal(effektiverRabattPosition({ menge: '5', rabatt: '10' }, 10), 19);
});

test('formatEuro zeigt deutsche Betraege statt 0,00 Euro', () => {
  assert.match(formatEuro('1.234,56'), /1\.234,56/);
  assert.match(formatEuro(0), /0,00/);
});

test('unlesbare Angebotswerte ergeben weiterhin 0', () => {
  const a = rechneAngebot([{ menge: '8,20 x', einzelpreis: 'Preis auf Anfrage', mwst_satz: '19' }], 0);
  assert.equal(a.netto, 0);
  assert.equal(a.brutto, 0);
});

// ===========================================================================
// angebotBundle — bisher flogen teure Positionen still aus dem Baustein
// ===========================================================================

test('DER WICHTIGSTE TEST: eine Position ueber 1.234,56 fliegt nicht mehr raus', () => {
  // Vorher: "1.234,56" -> NaN -> 0 -> galt als leer und wurde verworfen.
  const p = [
    { bezeichnung: '', menge: '1', einheit: 'Stk', einzelpreis: '1.234,56', mwst_satz: '19', rabatt: '0' },
  ];
  assert.equal(nurGefuellte(p).length, 1);
});

test('wirklich leere Positionen fliegen weiterhin raus', () => {
  const p = [
    { bezeichnung: '', menge: '1', einheit: 'Stk', einzelpreis: '', mwst_satz: '19', rabatt: '0' },
    { bezeichnung: '   ', menge: '1', einheit: 'Stk', einzelpreis: '0,00', mwst_satz: '19', rabatt: '0' },
    { bezeichnung: '', menge: '1', einheit: 'Stk', einzelpreis: 'auf Anfrage', mwst_satz: '19', rabatt: '0' },
  ];
  assert.equal(nurGefuellte(p).length, 0);
});

test('eine Position mit Bezeichnung bleibt auch ohne Preis drin', () => {
  const p = [
    { bezeichnung: 'Anfahrt', menge: '1', einheit: 'Stk', einzelpreis: '', mwst_satz: '19', rabatt: '0' },
  ];
  assert.equal(nurGefuellte(p).length, 1);
});

test('normalisierePositionen bleibt unveraendert', () => {
  const r = normalisierePositionen([{ bezeichnung: 'Montage' }]);
  assert.deepEqual(r, [
    { bezeichnung: 'Montage', menge: '1', einheit: 'Stk', einzelpreis: '', mwst_satz: '19', rabatt: '0' },
  ]);
  assert.deepEqual(normalisierePositionen(null), []);
});

// ===========================================================================
// Die Kette: Angebot und Rechnung muessen auf denselben Cent kommen
// ===========================================================================

test('Angebotssumme und Rechnungssumme stimmen Cent-genau ueberein', () => {
  const positionen = [
    { menge: '3', einzelpreis: '1.234,56', mwst_satz: '19', rabatt: '7,5' },
    { menge: '1', einzelpreis: '99,99', mwst_satz: '7', rabatt: '0' },
  ];
  const a = rechneAngebot(positionen, '10');
  // Die Rechnung-Route rechnet jede Position mit positionsNetto und dem
  // effektiven Prozentsatz nach. Beides muss zusammenpassen.
  let summe = 0;
  positionen.forEach((p, i) => {
    summe += positionsNetto(p.menge, p.einzelpreis, a.positionen[i].effektivProzent);
  });
  assert.equal(Math.round(summe * 100) / 100, Math.round(a.netto * 100) / 100);
});
