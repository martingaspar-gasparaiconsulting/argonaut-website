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

// ===========================================================================
// TEIL 6 — PAKET 2: DER VALIDATOR PRUEFT JETZT DIE ZAHLEN, DIE RAUSGEHEN
//
// Der Pruefbefund sagte: "der Validator meldet konform, weil er andere Zahlen
// prueft als der Erzeuger schreibt." An der alten Fassung GEMESSEN:
//
//   Eine vollstaendige, richtige Rechnung, deren Werte als deutscher Text
//   ankommen ("1.000,00"), ergab: konform true, 0 Fehler, 0 Warnungen,
//   KEIN EINZIGER Pruefpunkt. Der Validator hatte intern mit lauter Nullen
//   gerechnet — und zwei Nullen, die zueinander passen, sah er als
//   Uebereinstimmung. Ein kaputtes Rechnungsdatum und ein Steuersatz trotz
//   Kleinunternehmer-Kennzeichen liefen ebenso durch.
// ===========================================================================

import { validiereERechnung } from '../out/erechnung-validator.js';

const V_FIRMA = {
  name: 'Gaspar AI Consulting',
  adresse: { strasse: 'Musterweg 3', plz: '71032', ort: 'Boeblingen' },
  ust_idnr: 'DE123456789',
  email: 'rechnung@example.de',
  telefon: '07031 123456',
  bank_iban: 'DE89 3704 0044 0532 0130 00',
  bank_bic: 'COBADEFF370',
};
const V_KUNDE = { name: 'Kunde GmbH', adresse: { strasse: 'Bahnhofstr. 1', plz: '70173', ort: 'Stuttgart' } };

function pruefe(positionen, rechnung = {}, aussteller = V_FIRMA, profil = 'xrechnung', leitweg = 'X-1') {
  return validiereERechnung({
    rechnung: { rechnungsnummer: 'RE-2026-001', rechnungsdatum: '2026-09-21', waehrung: 'EUR', ...rechnung },
    positionen,
    aussteller,
    empfaenger: V_KUNDE,
    profil,
    leitweg_id: leitweg,
  });
}
const regeln = (erg) => erg.punkte.map((p) => p.regel + ':' + p.stufe);

test('DER KERNBEFUND: der Validator rechnet jetzt mit denselben Zahlen wie das XML', () => {
  // Genau der Fall, an dem sich beide frueher unterschieden: der Rueckfall
  // ohne gesamt_netto. Sechs Zeilen, damit die Rundungsdifferenz ueber die
  // Toleranz von zwei Cent hinauswaechst — bei zwei Zeilen waeren es nur
  // 0,01 gewesen, und die haette die Toleranz verschluckt (siehe die Notiz
  // zur Toleranz weiter unten).
  const pos = Array.from({ length: 6 }, () => (
    { bezeichnung: 'Montage', menge: 1.5, einzelpreis: 66.67, mwst_satz: 19 }
  ));
  const kopf = zeilenUndKopf(baue(pos).xml).kopf;
  assert.equal(kopf, '600.06', 'sechsmal 100,01 — so steht es im XML');

  // Der Validator muss GENAU diese Zahl als Positionssumme sehen. Rechnet er
  // wie frueher ungerundet weiter, kommt er auf 600,03 und meldet an einer
  // richtigen Rechnung eine Abweichung.
  const erg = pruefe(pos, { netto_summe: 600.06, mwst_summe: 114.01, brutto_summe: 714.07 });
  assert.ok(!regeln(erg).some((r) => r.startsWith('BR-CO-10')), 'keine falsche Abweichungsmeldung');
  assert.ok(!regeln(erg).some((r) => r.startsWith('BR-CO-14')), 'auch die Steuer stimmt ueberein');
  assert.equal(erg.konform, true);
});

test('NOTIZ ZUR TOLERANZ: zwei Cent verstecken genau die Art Fehler, um die es geht', () => {
  // Der Validator laesst zwei Cent Abweichung durch. Das ist fuer OCR-Belege
  // sinnvoll und hier trotzdem heikel: bei zwei Positionen betraegt der
  // Rundungsunterschied nur einen Cent und faellt damit unter die Toleranz —
  // der Fehler war also da und blieb trotzdem unsichtbar. Erst ab sechs
  // Zeilen waechst er darueber hinaus. Festgehalten, damit niemand aus einem
  // gruenen Haken schliesst, dass die Zahlen uebereinstimmen.
  const zwei = Array.from({ length: 2 }, () => ({ bezeichnung: 'M', menge: 1.5, einzelpreis: 66.67, mwst_satz: 19 }));
  const ungerundet = 2 * 1.5 * 66.67;               // 200.01 — so rechnete der Validator frueher
  const gerundet = Number(zeilenUndKopf(baue(zwei).xml).kopf); // 200.02 — so steht es im XML
  assert.ok(Math.abs(ungerundet - gerundet) <= 0.02, 'unter der Toleranz, also unsichtbar');
  assert.equal(gerundet, 200.02);
});

test('BEFUND: deutsche Zahlen machten den Validator blind', () => {
  // Diese Rechnung IST falsch: die Positionen ergeben 1.000,00, gespeichert
  // sind 2.000,00. Die alte Fassung las beide Werte als 0 und meldete
  // "konform, keine Beanstandung".
  const erg = pruefe(
    [{ bezeichnung: 'Leistung', menge: '1', einzelpreis: '1.000,00', mwst_satz: '19', gesamt_netto: '1.000,00' }],
    { netto_summe: '2.000,00', mwst_summe: '380,00', brutto_summe: '2.380,00' },
  );
  assert.equal(erg.konform, false, 'vorher true');
  assert.ok(regeln(erg).includes('BR-CO-10:fehler'), 'die Abweichung wird jetzt gefunden');
});

test('eine richtige Rechnung in deutscher Schreibweise bleibt konform', () => {
  const erg = pruefe(
    [{ bezeichnung: 'Leistung', menge: '1', einzelpreis: '1.000,00', mwst_satz: '19', gesamt_netto: '1.000,00' }],
    { netto_summe: '1.000,00', mwst_summe: '190,00', brutto_summe: '1.190,00' },
  );
  assert.equal(erg.konform, true);
  assert.equal(erg.fehlerAnzahl, 0);
});

test('BEFUND: fehlende Bankverbindung wurde verschwiegen', () => {
  const ohne = { ...V_FIRMA, bank_iban: '' };
  const erg = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    { netto_summe: 100, mwst_summe: 19, brutto_summe: 119 }, ohne);
  assert.ok(regeln(erg).includes('BG-16:warnung'), 'vorher kam dazu kein Wort');
  assert.equal(erg.konform, true, 'WICHTIG: es bleibt eine Warnung, kein Fehler — sonst waere der Knopf rot geworden');
});

test('BEFUND: fehlender Pflichtkontakt wurde verschwiegen — aber nur bei XRechnung', () => {
  const ohne = { ...V_FIRMA, telefon: '', email: '' };
  const xr = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    { netto_summe: 100, mwst_summe: 19, brutto_summe: 119 }, ohne, 'xrechnung');
  assert.equal(regeln(xr).filter((r) => r.startsWith('BG-6')).length, 2, 'Telefon und E-Mail');

  const zf = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    { netto_summe: 100, mwst_summe: 19, brutto_summe: 119 }, ohne, 'zugferd');
  assert.equal(regeln(zf).filter((r) => r.startsWith('BG-6')).length, 0, 'ZUGFeRD verlangt BG-6 nicht');
});

test('BEFUND: ein unlesbares Rechnungsdatum lief durch', () => {
  const erg = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    { rechnungsdatum: 'kaputt', netto_summe: 100, mwst_summe: 19, brutto_summe: 119 });
  assert.ok(regeln(erg).includes('BR-03:warnung'), 'vorher kam keine einzige Meldung');
  assert.equal(erg.konform, true);

  const leerDatum = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    { rechnungsdatum: '', netto_summe: 100, mwst_summe: 19, brutto_summe: 119 });
  assert.ok(regeln(leerDatum).includes('BR-03:fehler'), 'ganz fehlend bleibt ein Fehler wie bisher');
});

test('BEFUND: Kleinunternehmer mit Steuersatz in der Position lief durch', () => {
  const erg = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }],
    { kleinunternehmer: true, netto_summe: 100, brutto_summe: 100 });
  assert.ok(regeln(erg).includes('BR-E-Klein:warnung'), 'der Satz verschwindet im XML still — jetzt mit Ansage');
  assert.equal(erg.konform, true);
});

test('BEFUND: Positionen ohne gespeicherte Summe wurden gar nicht geprueft', () => {
  const erg = pruefe([{ bezeichnung: 'X', menge: 1, einzelpreis: 100, mwst_satz: 19, gesamt_netto: 100 }], {});
  assert.ok(regeln(erg).includes('BR-CO-10:warnung'), 'vorher wurde die Pruefung stillschweigend uebersprungen');
  assert.equal(erg.konform, true);
});

test('was schon vorher ein Fehler war, bleibt einer', () => {
  const erg = validiereERechnung({
    rechnung: {}, positionen: [], aussteller: {}, empfaenger: {}, profil: 'xrechnung',
  });
  const r = regeln(erg);
  for (const soll of ['BR-02:fehler', 'BR-03:fehler', 'BR-06:fehler', 'BR-07:fehler', 'BR-CO-26:fehler', 'BR-16:fehler']) {
    assert.ok(r.includes(soll), 'fehlt: ' + soll);
  }
  assert.equal(erg.konform, false);
  assert.ok(r.includes('BR-DE-15:warnung'), 'Leitweg-ID bleibt Warnung');
});
