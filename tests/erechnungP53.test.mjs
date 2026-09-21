// ============================================================================
// tests/erechnungP53.test.mjs
//
// PUNKT 53 — Die E-Rechnung reparieren, Paket 1 (21.09.2026)
//
//   lib/zugferd.ts — der XML-Kern fuer XRechnung und ZUGFeRD
//
// ▄▄▄ WAS DER PRUEFBEFUND SAGTE UND WAS DAVON STIMMT ▄▄▄
// Der Befund nannte fuenf Punkte. Vier davon sind am echten Code bestaetigt,
// einer stimmt nur zur Haelfte — und das steht hier, nicht im Kleingedruckten:
//
//  1. BG-16 (IBAN) fehlt ganz            -> BESTAETIGT. Im XML stand nie eine
//     Bankverbindung. Die Rechnungsseite LAEDT sie (firma_iban, firma_bic)
//     und schickt sie an /api/rechnung-pdf — nur an die E-Rechnung ging sie
//     nie mit. Die IBAN stand also auf dem PDF und fehlte im XML.
//  2. BG-6 (Kontakt) fehlt ganz          -> BESTAETIGT. Kein DefinedTradeContact.
//  3. Leitweg-ID als Platzhalter         -> BESTAETIGT. Im Feld stand woertlich
//     "LEITWEG-ID-FEHLT". Syntaktisch gueltig, also lief die Rechnung durch
//     und wurde erst bei der Behoerde abgelehnt.
//  4. Kopf- und Zeilensummen runden
//     unterschiedlich                    -> HALB BESTAETIGT, und das ist wichtig:
//     Auf dem normalen Weg ueber die Rechnungsseite passiert es NICHT. Die
//     Seite rechnet `gesamt_netto` selbst mit cent() (page.tsx `zeileNetto`,
//     Z.313) und schickt den gerundeten Wert mit. Betroffen war nur der
//     RUECKFALL menge * einzelpreis, wenn ein Aufrufer gesamt_netto weglaesst.
//     GEMESSEN an der alten Fassung, genau dort: zweimal 1,5 Std a 66,67 EUR
//     ergab Zeilen 100,00 + 100,00 = 200,00 und im Kopf 200,01.
//  5. Der Validator prueft andere Zahlen als der Erzeuger schreibt
//                                        -> BESTAETIGT, aber NICHT in diesem
//     Paket repariert. erechnung-validator.ts prueft die Rechnungszeile aus
//     der Datenbank, nicht das erzeugte XML. Das ist Paket 2.
//
// ▄▄▄ ZWEI FEHLER, DIE IM BEFUND GAR NICHT STANDEN ▄▄▄
//  6. n2() las mit Number(v). Eine Position als Text "1.234,56" wurde im XML
//     zu 0.00 — und das XML war in sich schluessig, also meldete kein
//     Validator etwas. Eine Rechnung ueber null Euro beim Kunden.
//  7. dat102() las das Datum in der Zeitzone des Servers und fiel bei einem
//     unlesbaren Datum still auf HEUTE zurueck. Beides GEMESSEN.
//
// ▄▄▄ EHRLICH ZU DEN GEGENPROBEN ▄▄▄
// Neun Gegenproben wurden gefahren, alle neun faerben rot. Eine Einschraenkung
// gehoert trotzdem dazu: Der Zahlen-LESER in n2() liesse sich fuer sich allein
// nicht rot bekommen. Nach dieser Reparatur wird jeder Wert bereits eine Ebene
// hoeher gelesen (zeilenNetto, leseZahlOder), n2 sieht also nur noch fertige
// Zahlen. Rot wird die Gegenprobe erst, weil sie mit dem Leser auch centRunden
// entfernt. Der Leser bleibt trotzdem stehen: n2 ist eine oeffentliche
// Rundungsstelle, und der naechste Aufrufer reicht vielleicht wieder einen
// Rohwert herein.
//
// Alle "vorher"-Werte sind an der alten Fassung gemessen, nicht geschaetzt.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { baueZugferdXml } from '../out/zugferd.js';

// --------------------------------------------------------------- Werkzeug
const FIRMA = {
  name: 'Gaspar AI Consulting',
  adresse: { strasse: 'Musterweg 3', plz: '71032', ort: 'Boeblingen', land: 'DE' },
  ust_idnr: 'DE123456789',
  email: 'rechnung@example.de',
  telefon: '07031 123456',
  bank_iban: 'DE89 3704 0044 0532 0130 00',
  bank_bic: 'cobadeff370',
  bank_name: 'Gaspar AI Consulting',
};
const KUNDE = { name: 'Kunde GmbH', adresse: { strasse: 'Bahnhofstr. 1', plz: '70173', ort: 'Stuttgart' } };

function baue(positionen, extra = {}) {
  return baueZugferdXml({
    rechnung: { rechnungsnummer: 'RE-2026-001', rechnungsdatum: '2026-09-21', ...(extra.rechnung || {}) },
    positionen,
    aussteller: extra.aussteller !== undefined ? extra.aussteller : FIRMA,
    empfaenger: KUNDE,
    profil: extra.profil || 'xrechnung',
    ...(extra.leitweg_id ? { leitweg_id: extra.leitweg_id } : {}),
  });
}
function zeilenUndKopf(xml) {
  const alle = [...xml.matchAll(/<ram:LineTotalAmount>([-0-9.]+)<\/ram:LineTotalAmount>/g)].map((m) => m[1]);
  const zeilen = alle.slice(0, -1);
  return {
    zeilen,
    summe: zeilen.reduce((a, b) => a + Number(b), 0).toFixed(2),
    kopf: alle.at(-1),
  };
}
const feld = (xml, tag) => (xml.match(new RegExp('<ram:' + tag + '[^>]*>(.*?)</ram:' + tag + '>'))||[])[1];

// ===========================================================================
// TEIL 1 — BR-CO-10: DIE ZEILEN MUESSEN DEN KOPF ERGEBEN
// ===========================================================================

test('BEFUND: zweimal 1,5 Std a 66,67 EUR ergaben 200,00 in den Zeilen und 200,01 im Kopf', () => {
  const pos = [
    { bezeichnung: 'Montage', menge: 1.5, einzelpreis: 66.67, mwst_satz: 19 },
    { bezeichnung: 'Montage', menge: 1.5, einzelpreis: 66.67, mwst_satz: 19 },
  ];
  const { zeilen, summe, kopf } = zeilenUndKopf(baue(pos).xml);
  assert.deepEqual(zeilen, ['100.01', '100.01'], 'vorher 100.00 + 100.00');
  assert.equal(summe, kopf, 'BR-CO-10: Summe der Zeilen = Kopfsumme');
  assert.equal(kopf, '200.02');
});

test('BEFUND: drei halbe Cent ergaben 0,03 in den Zeilen und 0,02 im Kopf', () => {
  const pos = [1, 2, 3].map(() => ({ menge: 0.5, einzelpreis: 0.01, mwst_satz: 19 }));
  const { summe, kopf } = zeilenUndKopf(baue(pos).xml);
  assert.equal(summe, kopf, 'vorher 0.03 gegen 0.02');
});

test('der normale Weg ueber die Rechnungsseite war NIE betroffen', () => {
  // Die Seite schickt gesamt_netto bereits gerundet mit. Genau diese Werte:
  const pos = [
    { menge: 1.5, einzelpreis: 66.67, mwst_satz: 19, gesamt_netto: 100.01 },
    { menge: 1.5, einzelpreis: 66.67, mwst_satz: 19, gesamt_netto: 100.01 },
  ];
  const { summe, kopf } = zeilenUndKopf(baue(pos).xml);
  assert.equal(summe, '200.02');
  assert.equal(kopf, '200.02');
});

test('gemischte Steuersaetze bleiben je Satz getrennt und stimmig', () => {
  const erg = baue([
    { menge: 1, einzelpreis: 100, mwst_satz: 19 },
    { menge: 1, einzelpreis: 100, mwst_satz: 7 },
  ]);
  // Nur die Steueraufschluesselung im Kopf ansehen — die Positionszeilen
  // tragen ihre eigene ApplicableTradeTax und wuerden das Bild verfaelschen.
  const settle = erg.xml.match(/<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<\/ram:ApplicableHeaderTradeSettlement>/)[0];
  const saetze = [...settle.matchAll(/<ram:RateApplicablePercent>([0-9.]+)</g)].map((m) => m[1]);
  assert.deepEqual(saetze, ['7', '19'], 'aufsteigend, je Satz eine Gruppe');
  assert.equal(feld(erg.xml, 'TaxTotalAmount'), '26.00', '19,00 + 7,00');
  assert.equal(feld(erg.xml, 'GrandTotalAmount'), '226.00');
});

// ===========================================================================
// TEIL 2 — DIE ZAHL IM XML MUSS DIE ZAHL AUF DER RECHNUNG SEIN
// ===========================================================================

test('BEFUND: eine Position als deutscher Text stand mit 0,00 EUR im XML', () => {
  const erg = baue([{ bezeichnung: 'Leistung', menge: '1', einzelpreis: '1.234,56', mwst_satz: '19' }]);
  assert.equal(feld(erg.xml, 'ChargeAmount'), '1234.56', 'vorher 0.00');
  assert.equal(feld(erg.xml, 'GrandTotalAmount'), '1469.13', 'vorher 0.00');
  assert.equal(feld(erg.xml, 'RateApplicablePercent'), '19', 'vorher 0');
});

test('eine Gutschrift-Position rundet symmetrisch um Null', () => {
  const erg = baue([{ menge: 1, einzelpreis: -1234.565, mwst_satz: 0 }]);
  assert.equal(feld(erg.xml, 'LineTotalAmount'), '-1234.57', 'toFixed allein haette -1234.56 geschrieben');
});

test('auch der Einzelpreis (BT-146) rundet kaufmaennisch — und das trifft auch normale Rechnungen', () => {
  // ChargeAmount bekommt den Einzelpreis direkt. Ein Stueckpreis mit drei
  // Stellen ist am Bau normal (Meterware, Schuettgut, Umrechnungen).
  //
  // Das hier ist KEIN Gutschrift-Sonderfall: 2,675 als Gleitkommazahl liegt
  // knapp UNTER der Mitte, deshalb schreibt toFixed allein "2.67" — einen
  // Cent zu wenig, auf einer ganz gewoehnlichen Rechnung. centRunden gleicht
  // das mit Number.EPSILON aus und schreibt "2.68".
  const plus = baue([{ menge: 4, einzelpreis: 2.675, mwst_satz: 19 }]);
  assert.equal(feld(plus.xml, 'ChargeAmount'), '2.68', 'toFixed allein haette 2.67 geschrieben');

  const minus = baue([{ menge: 4, einzelpreis: -2.675, mwst_satz: 19 }]);
  assert.equal(feld(minus.xml, 'ChargeAmount'), '-2.68', 'toFixed allein haette -2.67 geschrieben');
});

// ===========================================================================
// TEIL 3 — BG-16 ZAHLUNGSDATEN UND BG-6 KONTAKT
// ===========================================================================

test('BEFUND: die IBAN stand auf dem PDF und fehlte im XML', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }]);
  assert.ok(erg.xml.includes('<ram:SpecifiedTradeSettlementPaymentMeans>'), 'vorher gar nicht vorhanden');
  assert.equal(feld(erg.xml, 'IBANID'), 'DE89370400440532013000', 'Leerzeichen raus, gross');
  assert.equal(feld(erg.xml, 'BICID'), 'COBADEFF370');
  assert.equal(feld(erg.xml, 'TypeCode'), '380', 'Rechnung bleibt 380');
});

test('ohne IBAN kommt eine Warnung und KEIN erfundener Wert', () => {
  const ohne = { ...FIRMA, bank_iban: '', bank_bic: '' };
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }], { aussteller: ohne });
  assert.ok(!erg.xml.includes('PaymentMeans'), 'lieber gar nichts als ein Platzhalter');
  assert.ok(erg.warnungen.some((w) => w.includes('IBAN')), 'aber der Nutzer erfaehrt es');
});

test('BEFUND: der Kontaktblock BG-6 fehlte ganz', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }]);
  assert.ok(erg.xml.includes('<ram:DefinedTradeContact>'), 'vorher gar nicht vorhanden');
  assert.equal(feld(erg.xml, 'CompleteNumber'), '07031 123456');
  assert.ok(erg.xml.includes('<ram:EmailURIUniversalCommunication>'));
});

test('die XSD-Reihenfolge stimmt — sonst weist der Pruefer das XML ab', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }]);
  const seller = erg.xml.match(/<ram:SellerTradeParty>[\s\S]*?<\/ram:SellerTradeParty>/)[0];
  assert.ok(seller.indexOf('DefinedTradeContact') < seller.indexOf('PostalTradeAddress'),
    'BG-6 steht vor der Anschrift');
  assert.ok(seller.indexOf('PostalTradeAddress') < seller.indexOf('SpecifiedTaxRegistration'));

  const settle = erg.xml.match(/<ram:ApplicableHeaderTradeSettlement>[\s\S]*?<\/ram:ApplicableHeaderTradeSettlement>/)[0];
  assert.ok(settle.indexOf('InvoiceCurrencyCode') < settle.indexOf('PaymentMeans'));
  assert.ok(settle.indexOf('PaymentMeans') < settle.indexOf('ApplicableTradeTax'),
    'BG-16 steht vor der Steueraufschluesselung');
  assert.ok(settle.indexOf('ApplicableTradeTax') < settle.indexOf('MonetarySummation'));
});

// ===========================================================================
// TEIL 4 — LEITWEG-ID UND DATUM
// ===========================================================================

test('BEFUND: ohne Leitweg-ID stand woertlich LEITWEG-ID-FEHLT im XML', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }]);
  assert.ok(!erg.xml.includes('LEITWEG-ID-FEHLT'), 'ein Platzhalter laeuft durch und faellt erst bei der Behoerde auf');
  assert.ok(!erg.xml.includes('<ram:BuyerReference>'), 'das Feld bleibt leer');
  assert.ok(erg.warnungen.some((w) => w.includes('Leitweg-ID')));
});

test('mit Leitweg-ID steht sie drin', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }], { leitweg_id: '04011000-1234512345-06' });
  assert.equal(feld(erg.xml, 'BuyerReference'), '04011000-1234512345-06');
  assert.ok(!erg.warnungen.some((w) => w.includes('Leitweg-ID')));
});

test('BEFUND: ein unlesbares Rechnungsdatum wurde stillschweigend HEUTE', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }], { rechnung: { rechnungsdatum: 'kaputt' } });
  assert.ok(erg.warnungen.some((w) => w.includes('Rechnungsdatum')), 'vorher kam keine einzige Warnung');
});

test('BEFUND: deutsche Mitternacht rutschte auf einem UTC-Server in den Vormonat', () => {
  // 31.08.2026 22:00 UTC ist in Deutschland der 1. September, 00:00 Uhr.
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }],
    { rechnung: { rechnungsdatum: '2026-09-01T00:00:00.000Z' } });
  const datum = (erg.xml.match(/format="102">(\d{8})</) || [])[1];
  assert.equal(datum, '20260901');
  assert.ok(!erg.warnungen.some((w) => w.includes('Rechnungsdatum')));
});

test('ein gueltiges Datum loest keine Warnung aus', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }]);
  assert.ok(!erg.warnungen.some((w) => w.includes('Rechnungsdatum')));
});

// ===========================================================================
// TEIL 5 — WAS UNVERAENDERT BLEIBEN MUSS
// ===========================================================================

test('Kleinunternehmer nach § 19 UStG bleibt unveraendert', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }], { rechnung: { kleinunternehmer: true } });
  assert.ok(erg.xml.includes('Kleinunternehmer gem'), 'Befreiungsgrund steht drin');
  assert.ok(erg.xml.includes('<ram:CategoryCode>E</ram:CategoryCode>'));
  assert.equal(feld(erg.xml, 'TaxTotalAmount'), '0.00');
  assert.equal(feld(erg.xml, 'GrandTotalAmount'), '100.00');
});

test('das ZUGFeRD-Profil bekommt weiter die richtige Kennung und keinen Leitweg-Zwang', () => {
  const erg = baue([{ menge: 1, einzelpreis: 100, mwst_satz: 19 }], { profil: 'zugferd' });
  assert.ok(erg.xml.includes('urn:cen.eu:en16931:2017'));
  assert.ok(!erg.xml.includes('xrechnung_3.0'));
  assert.ok(!erg.warnungen.some((w) => w.includes('Leitweg-ID')), 'nur XRechnung braucht sie');
  assert.equal(erg.dateiname, 'ZUGFeRD_RE-2026-001.xml');
});

test('Einheiten, Dateiname und Pflichtfeld-Warnungen sind unangetastet', () => {
  const erg = baue([{ bezeichnung: 'Arbeit', menge: 2, einheit: 'Std', einzelpreis: 50, mwst_satz: 19 }]);
  assert.ok(erg.xml.includes('unitCode="HUR"'));
  assert.equal(erg.dateiname, 'XRechnung_RE-2026-001.xml');

  const leer = baueZugferdXml({ rechnung: {}, positionen: [], aussteller: {}, empfaenger: {}, profil: 'xrechnung' });
  for (const t of ['Verkäufer-Name', 'Käufer-Name', 'Rechnungsnummer']) {
    assert.ok(leer.warnungen.some((w) => w.includes(t)), 'Warnung fehlt: ' + t);
  }
  assert.ok(leer.xml.includes('FIRMENNAME-FEHLT'), 'sichtbarer Platzhalter im Pflichtfeld bleibt');
});

test('Sonderzeichen werden weiter XML-sicher geschrieben', () => {
  const erg = baue([{ bezeichnung: 'Rohr <50mm> & "Dichtung"', menge: 1, einzelpreis: 10, mwst_satz: 19 }]);
  assert.ok(erg.xml.includes('&lt;50mm&gt; &amp; &quot;Dichtung&quot;'));
  assert.ok(!erg.xml.includes('<50mm>'));
});
