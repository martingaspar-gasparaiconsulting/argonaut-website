// ============================================================================
// tests/abschlagXmlP54.test.mjs
//
// PUNKT 54 / R5 — PAKET 4: die E-Rechnung (21.09.2026)
//
// ▄▄▄ DER BEFUND ▄▄▄
// lib/zugferd.ts setzte `DuePayableAmount` IMMER gleich `GrandTotalAmount`,
// und ein `TotalPrepaidAmount` (BT-113) gab es gar nicht. Eine
// Schlussrechnung, die 107.100 EUR Abschlaege abzieht, haette im XML
// trotzdem 119.000 EUR als zahlbar ausgewiesen.
//
// DAS IST DER GEFAEHRLICHERE HALBTEIL DER RECHNUNG: das PDF liest ein
// Mensch, das XML liest die Buchhaltungssoftware des Kunden — und die
// zahlt, was in DuePayableAmount steht.
//
// ▄▄▄ WAS SONST FEHLTE ▄▄▄
//  · § 13b UStG kannte das XML nicht. Kategorie AE, Satz 0 und der
//    Pflichthinweis nach § 14a Abs. 5 UStG fehlten vollstaendig.
//  · Skonto stand nirgends strukturiert. BR-DE-18 verlangt genau die
//    Schreibweise #SKONTO#TAGE=14#PROZENT=2.00#.
//
// ▄▄▄ DIE WICHTIGSTE GRUPPE HIER IST TEIL 1 ▄▄▄
// Alles Neue haengt an neuen, optionalen Feldern. Eine Rechnung, die sie
// nicht setzt, muss dasselbe XML erzeugen wie vorher — sonst aendert sich
// bei JEDEM Bestandskunden die E-Rechnung.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baueZugferdXml } from '../out/zugferd.js';

const AUSSTELLER = {
  name: 'Musterbau GmbH',
  ust_idnr: 'DE136695976',
  anschrift: { strasse: 'Hauptstr. 1', plz: '71032', ort: 'Böblingen', land: 'DE' },
};
const EMPFAENGER = {
  name: 'Bauherr AG',
  anschrift: { strasse: 'Weg 2', plz: '70173', ort: 'Stuttgart', land: 'DE' },
};

function baue(extra = {}, rechnungExtra = {}) {
  return baueZugferdXml({
    rechnung: {
      rechnungsnummer: 'RE-2026-0001',
      rechnungsdatum: '2026-09-21',
      faelligkeitsdatum: '2026-10-05',
      waehrung: 'EUR',
      ...rechnungExtra,
    },
    positionen: [
      { bezeichnung: 'Rohbau', menge: 1, einzelpreis: 100000, mwst_satz: 19, gesamt_netto: 100000 },
    ],
    aussteller: AUSSTELLER,
    empfaenger: EMPFAENGER,
    ...extra,
  });
}

// ===========================================================================
// TEIL 1 — WAS SICH FUER BESTANDSRECHNUNGEN NICHT AENDERN DARF
// ===========================================================================

test('ohne die neuen Felder gibt es KEIN TotalPrepaidAmount', () => {
  const { xml } = baue();
  assert.ok(!xml.includes('TotalPrepaidAmount'), 'ein leeres Feld gehoert nicht ins XML');
});

test('ohne Abschlaege bleibt zahlbar gleich dem Gesamtbetrag', () => {
  const { xml } = baue();
  assert.match(xml, /<ram:GrandTotalAmount>119000\.00<\/ram:GrandTotalAmount>/);
  assert.match(xml, /<ram:DuePayableAmount>119000\.00<\/ram:DuePayableAmount>/);
});

test('ohne § 13b bleibt die Steuerkategorie S', () => {
  const { xml } = baue();
  assert.match(xml, /<ram:CategoryCode>S<\/ram:CategoryCode>/);
  assert.ok(!xml.includes('<ram:CategoryCode>AE</ram:CategoryCode>'));
  assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">19000\.00<\/ram:TaxTotalAmount>/);
});

test('ohne Skonto steht keine Description in den Zahlungsbedingungen', () => {
  const { xml } = baue();
  assert.ok(!xml.includes('<ram:Description>'), 'eine leere Description waere ein neues Feld');
  assert.match(xml, /<ram:DueDateDateTime>/);
});

// ===========================================================================
// TEIL 2 — DIE ABSCHLAEGE IM XML (BT-113)
// ===========================================================================

test('Kernbeispiel: 107.100 EUR Abschlaege senken den Zahlbetrag', () => {
  const { xml } = baue({ vorausgezahlt: 107100 });
  assert.match(xml, /<ram:GrandTotalAmount>119000\.00<\/ram:GrandTotalAmount>/);
  assert.match(xml, /<ram:TotalPrepaidAmount>107100\.00<\/ram:TotalPrepaidAmount>/);
  assert.match(xml, /<ram:DuePayableAmount>11900\.00<\/ram:DuePayableAmount>/,
    'vorher stand hier IMMER der volle Betrag');
});

test('die Reihenfolge im Summenblock stimmt — das CII-Schema ist streng', () => {
  const { xml } = baue({ vorausgezahlt: 107100 });
  const grand = xml.indexOf('GrandTotalAmount');
  const prepaid = xml.indexOf('TotalPrepaidAmount');
  const due = xml.indexOf('DuePayableAmount');
  assert.ok(grand < prepaid, 'TotalPrepaidAmount steht NACH GrandTotalAmount');
  assert.ok(prepaid < due, 'DuePayableAmount steht ganz zuletzt');
});

test('die Steuer bleibt voll ausgewiesen, auch wenn Abschlaege abgehen', () => {
  const { xml } = baue({ vorausgezahlt: 107100 });
  assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">19000\.00<\/ram:TaxTotalAmount>/,
    'TotalPrepaidAmount ist eine ZAHLUNG, keine Entgeltminderung');
  assert.match(xml, /<ram:TaxBasisTotalAmount>100000\.00<\/ram:TaxBasisTotalAmount>/);
});

test('Abschlaege ueber dem Rechnungsbetrag ergeben eine Rueckzahlung und eine Warnung', () => {
  const r = baue({ vorausgezahlt: 130000 });
  assert.match(r.xml, /<ram:DuePayableAmount>-11000\.00<\/ram:DuePayableAmount>/);
  assert.ok(r.warnungen.some((w) => /uebersteigen/.test(w)), 'das muss auffallen');
});

test('ein negativer Wert wird nicht stillschweigend geschluckt', () => {
  const r = baue({ vorausgezahlt: -500 });
  assert.ok(r.warnungen.some((w) => /negativ/.test(w)));
});

test('Abschlaege als Text mit Tausenderpunkt werden gelesen (Punkt 12)', () => {
  const { xml } = baue({ vorausgezahlt: '107.100,00' });
  assert.match(xml, /<ram:TotalPrepaidAmount>107100\.00<\/ram:TotalPrepaidAmount>/);
});

// ===========================================================================
// TEIL 3 — § 13b UStG
// ===========================================================================

test('§ 13b: Kategorie AE, Satz 0, keine Steuer', () => {
  const { xml } = baue({}, { reverse_charge: true });
  assert.match(xml, /<ram:CategoryCode>AE<\/ram:CategoryCode>/);
  assert.ok(!xml.includes('<ram:CategoryCode>S</ram:CategoryCode>'),
    'Kopf UND Zeile muessen dieselbe Kategorie tragen');
  assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">0\.00<\/ram:TaxTotalAmount>/);
  assert.match(xml, /<ram:GrandTotalAmount>100000\.00<\/ram:GrandTotalAmount>/);
});

test('§ 13b: der Pflichthinweis nach § 14a Abs. 5 UStG steht im XML', () => {
  const { xml } = baue({}, { reverse_charge: true });
  assert.match(xml, /Steuerschuldnerschaft des Leistungsempfängers/);
});

test('§ 19 geht vor § 13b — wer keine Steuer ausweist, kann sie nicht uebertragen', () => {
  const { xml } = baue({}, { reverse_charge: true, kleinunternehmer: true });
  assert.match(xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/);
  assert.ok(!xml.includes('AE'));
  assert.match(xml, /Kleinunternehmer/);
});

test('§ 13b zusammen mit Abschlaegen rechnet beides richtig', () => {
  const { xml } = baue({ vorausgezahlt: 60000 }, { reverse_charge: true });
  assert.match(xml, /<ram:GrandTotalAmount>100000\.00<\/ram:GrandTotalAmount>/);
  assert.match(xml, /<ram:TotalPrepaidAmount>60000\.00<\/ram:TotalPrepaidAmount>/);
  assert.match(xml, /<ram:DuePayableAmount>40000\.00<\/ram:DuePayableAmount>/);
});

// ===========================================================================
// TEIL 4 — SKONTO NACH BR-DE-18
// ===========================================================================

test('Skonto steht in genau der Schreibweise, die BR-DE-18 verlangt', () => {
  const { xml } = baue({ skonto: { prozent: 2, tage: 14 } });
  assert.match(xml, /#SKONTO#TAGE=14#PROZENT=2\.00#BASISBETRAG=119000\.00#/);
});

test('der Basisbetrag ist der ZAHLBARE Betrag, nicht der Gesamtbetrag', () => {
  // Sonst bekaeme der Kunde Skonto auf Betraege, die er laengst gezahlt hat.
  const { xml } = baue({ vorausgezahlt: 107100, skonto: { prozent: 2, tage: 14 } });
  assert.match(xml, /BASISBETRAG=11900\.00#/);
  assert.ok(!xml.includes('BASISBETRAG=119000.00#'));
});

test('die Description steht VOR dem Faelligkeitsdatum — CII ist da streng', () => {
  const { xml } = baue({ skonto: { prozent: 2, tage: 14 } });
  const d = xml.indexOf('<ram:Description>');
  const f = xml.indexOf('<ram:DueDateDateTime>');
  assert.ok(d > -1 && f > -1);
  assert.ok(d < f, 'sonst faellt das XML beim Validator durch');
});

test('Skonto mit Nachkommastelle wird zweistellig geschrieben', () => {
  const { xml } = baue({ skonto: { prozent: 2.5, tage: 10 } });
  assert.match(xml, /#PROZENT=2\.50#/);
});

test('unsinnige Skontoangaben erzeugen gar keine Zeile', () => {
  assert.ok(!baue({ skonto: { prozent: 0, tage: 14 } }).xml.includes('#SKONTO#'));
  assert.ok(!baue({ skonto: { prozent: 2, tage: 0 } }).xml.includes('#SKONTO#'));
  assert.ok(!baue({ skonto: { prozent: 120, tage: 14 } }).xml.includes('#SKONTO#'));
});

test('Skonto ohne Faelligkeitsdatum steht trotzdem drin', () => {
  const { xml } = baueZugferdXml({
    rechnung: { rechnungsnummer: 'RE-1', rechnungsdatum: '2026-09-21', waehrung: 'EUR' },
    positionen: [{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    aussteller: AUSSTELLER,
    empfaenger: EMPFAENGER,
    skonto: { prozent: 3, tage: 7 },
  });
  assert.match(xml, /#SKONTO#TAGE=7#PROZENT=3\.00#/);
  assert.match(xml, /<ram:SpecifiedTradePaymentTerms>/);
});
