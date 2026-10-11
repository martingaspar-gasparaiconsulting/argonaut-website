// Paket 316 (11.10.2026): S3a Geschäftskunden-Shop — Preise, Staffeln, Gebinde, Kauf auf Rechnung, Link
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preisBasis, bruttoAusNetto, nettoAusBrutto, steuerAus, basisNettoCent, basisBruttoCent,
  staffelnFuer, kundenPreis, schaufensterStaffeln, rabattProzent, preisZeilePruefen,
  mengenRegel, mengeVorschlag, mengePruefen, regelEingabePruefen, baueB2bBestellung,
  zahlartPruefen, zahlungsziel, rahmenPruefen, tokenGueltig, hashGueltig, kundenLink, shopSeite, kundeName,
} from '../out/shopB2b.js';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const X = 'aaaaaaaa-0000-4000-8000-000000000002';
const liste = {
  rabatt_prozent: 10,
  preise: [
    { artikel_id: A, ab_menge: 1, netto_cent: 900 },
    { artikel_id: A, ab_menge: 10, netto_cent: 800 },
    { artikel_id: A, ab_menge: 100, netto_cent: 700 },
    { artikel_id: X, ab_menge: 0, netto_cent: 100 },
  ],
};

test('Preis-Basis: nur „netto" ist netto, alles andere brutto (wie der Shop bisher)', () => {
  assert.equal(preisBasis('netto'), 'netto');
  assert.equal(preisBasis('brutto'), 'brutto');
  assert.equal(preisBasis(undefined), 'brutto');
  assert.equal(preisBasis('NETTO'), 'brutto');
});

test('Cent-Rechnung ganzzahlig und kaufmännisch', () => {
  assert.equal(bruttoAusNetto(1000, 19), 1190);
  assert.equal(bruttoAusNetto(1, 19), 1, '1,19 Cent -> 1');
  assert.equal(bruttoAusNetto(50, 7), 54, '53,5 -> 54');
  assert.equal(nettoAusBrutto(1190, 19), 1000);
  assert.equal(nettoAusBrutto(1199, 19), 1008, '1007,56 -> 1008');
  assert.equal(nettoAusBrutto(1000, 0), 1000);
  assert.equal(steuerAus(1050, 19), 200, '199,5 -> 200');
  assert.equal(steuerAus(1000, 0), 0);
  assert.equal(bruttoAusNetto(0, 19), 0);
  assert.equal(basisNettoCent('11,90', 19, 'brutto'), 1000);
  assert.equal(basisNettoCent(11.9, 19, 'netto'), 1190);
  assert.equal(basisNettoCent(0, 19, 'netto'), null);
  assert.equal(basisNettoCent('abc', 19, 'netto'), null);
  assert.equal(basisBruttoCent(10, 19, 'netto'), 1190);
  assert.equal(basisBruttoCent('4,395', 19, 'brutto'), 440, 'inCent statt Math.round(x*100)');
});

test('Staffeln: sortiert, ungültige Zeilen fallen weg', () => {
  assert.deepEqual(staffelnFuer(A, liste).map((s) => s.ab), [1, 10, 100]);
  assert.deepEqual(staffelnFuer(X, liste), [], 'ab 0 ist ungültig');
  assert.deepEqual(staffelnFuer(A, null), []);
});

test('Kundenpreis: höchste passende Staffel, sonst Rabatt, sonst Basis — nie beides', () => {
  assert.deepEqual(kundenPreis(A, 1000, 1, liste), { netto_cent: 900, quelle: 'liste' });
  assert.deepEqual(kundenPreis(A, 1000, 9, liste), { netto_cent: 900, quelle: 'liste' });
  assert.deepEqual(kundenPreis(A, 1000, 10, liste), { netto_cent: 800, quelle: 'liste' });
  assert.deepEqual(kundenPreis(A, 1000, 250, liste), { netto_cent: 700, quelle: 'liste' });
  assert.deepEqual(kundenPreis('anderer', 1000, 5, liste), { netto_cent: 900, quelle: 'rabatt' }, '10 % Rabatt');
  assert.deepEqual(kundenPreis('anderer', 1005, 5, { rabatt_prozent: 12.5, preise: [] }), { netto_cent: 879, quelle: 'rabatt' }, '879,375 -> 879');
  assert.deepEqual(kundenPreis('anderer', 1000, 5, null), { netto_cent: 1000, quelle: 'standard' });
  assert.equal(kundenPreis('anderer', null, 5, liste), null, 'ohne Basis und ohne Listenpreis kein Preis');
  // nur Staffel ab 10, aber Menge 3: Rabatt auf Basis
  const nur10 = { rabatt_prozent: 0, preise: [{ artikel_id: A, ab_menge: 10, netto_cent: 500 }] };
  assert.deepEqual(kundenPreis(A, 1000, 3, nur10), { netto_cent: 1000, quelle: 'standard' });
  assert.equal(rabattProzent(95), 0);
  assert.equal(rabattProzent('7,5'), 7.5);
  assert.equal(rabattProzent(-1), 0);
});

test('Schaufenster-Staffeln beginnen bei der Mindestmenge', () => {
  assert.deepEqual(schaufensterStaffeln(A, 1000, 1, liste), [{ ab: 1, netto_cent: 900 }, { ab: 10, netto_cent: 800 }, { ab: 100, netto_cent: 700 }]);
  assert.deepEqual(schaufensterStaffeln(A, 1000, 12, liste), [{ ab: 12, netto_cent: 800 }, { ab: 100, netto_cent: 700 }]);
  assert.deepEqual(schaufensterStaffeln('anderer', 1000, 1, null), [{ ab: 1, netto_cent: 1000 }]);
});

test('Staffel-Eingabe prüfen', () => {
  assert.deepEqual(preisZeilePruefen({ ab_menge: '10', netto: '1.234,56' }), { ok: true, ab_menge: 10, netto_cent: 123456 });
  assert.equal(preisZeilePruefen({ ab_menge: '2,5', netto: '1' }).ok, false);
  assert.equal(preisZeilePruefen({ ab_menge: '0', netto: '1' }).ok, false);
  assert.equal(preisZeilePruefen({ ab_menge: '1', netto: '0' }).ok, false);
  assert.equal(preisZeilePruefen({ ab_menge: '1', netto: '2000000' }).ok, false);
});

test('Gebinde und Mindestmenge', () => {
  assert.deepEqual(mengenRegel(6, 10), { gebinde: 6, mindest: 12 }, 'Mindestmenge aufs Gebinde aufgerundet');
  assert.deepEqual(mengenRegel(null, null), { gebinde: 1, mindest: 1 });
  assert.deepEqual(mengenRegel('x', 0), { gebinde: 1, mindest: 1 });
  const r = mengenRegel(6, 12);
  assert.equal(mengeVorschlag(1, r), 12);
  assert.equal(mengeVorschlag(13, r), 18);
  assert.equal(mengeVorschlag(18, r), 18);
  assert.equal(mengePruefen(12, r).ok, true);
  assert.equal(mengePruefen(6, r).ok, false);
  assert.match(mengePruefen(14, r, 'Reiniger').fehler, /Gebinden zu 6/);
  assert.match(mengePruefen(6, r, 'Reiniger').fehler, /Mindestmenge 12/);
  assert.equal(mengePruefen(2.5, mengenRegel(1, 1)).ok, false);
  assert.equal(mengePruefen(100001, mengenRegel(1, 1)).ok, false);
  assert.equal(regelEingabePruefen('6', '12').ok, true);
  assert.equal(regelEingabePruefen('6', '10').ok, false, 'wie die Datenbank-Regel');
  assert.equal(regelEingabePruefen('0', '1').ok, false);
});

test('Bestellung: Preise nur aus Artikel + Liste, Steuer je Satz auf die Summe', () => {
  const artikel = [
    { id: A, bezeichnung: 'Reiniger 10 l', verkaufspreis: 11.9, shop_mwst: 19, shop_gebinde: 1, shop_mindestmenge: 1, artikelnummer: 'R10', einheit: 'Kanister' },
    { id: 'b', bezeichnung: 'Fachbuch', verkaufspreis: 21.4, shop_mwst: 7 },
    { id: 'c', bezeichnung: 'Inaktiv', verkaufspreis: 5, aktiv: false },
    { id: 'd', bezeichnung: 'Palette', verkaufspreis: 100, shop_gebinde: 6, shop_mindestmenge: 6 },
  ];
  const w = new Map([[A, 10], ['b', 2], ['c', 1], ['d', 4], ['fremd', 3]]);
  const e = baueB2bBestellung(artikel, w, liste, 'brutto');
  assert.equal(e.positionen.length, 2);
  assert.deepEqual(e.fehler, ['Palette: Mindestmenge 6.']);
  const p1 = e.positionen[0];
  assert.equal(p1.einzelpreis_netto, 8, 'Staffel ab 10');
  assert.equal(p1.einzelpreis, 9.52);
  assert.equal(p1.preis_quelle, 'liste');
  assert.equal(p1.einheit, 'Kanister');
  const p2 = e.positionen[1];
  assert.equal(p2.einzelpreis_netto, 18, '21,40 brutto 7 % = 20,00 netto, 10 % Rabatt');
  assert.equal(p2.mwst, 7);
  assert.equal(e.netto_cent, 8000 + 3600);
  assert.equal(e.steuer_cent, 1520 + 252);
  assert.equal(e.brutto_cent, 11600 + 1772);
  const ku = baueB2bBestellung(artikel, new Map([[A, 1]]), null, 'netto', true);
  assert.equal(ku.positionen[0].mwst, 0, 'Kleinunternehmer');
  assert.equal(ku.positionen[0].einzelpreis_netto, 11.9);
  assert.equal(ku.steuer_cent, 0);
});

test('Kauf auf Rechnung, Zahlungsziel, Kreditrahmen', () => {
  assert.equal(zahlartPruefen('rechnung', true), 'rechnung');
  assert.equal(zahlartPruefen('rechnung', false), 'vorkasse', 'nicht freigegeben');
  assert.equal(zahlartPruefen('bar', true), 'vorkasse');
  assert.equal(zahlungsziel(30), 30);
  assert.equal(zahlungsziel(120), 14);
  assert.equal(zahlungsziel('x'), 14);
  assert.deepEqual(rahmenPruefen(null, 999999, 1), { ok: true, frei_cent: null });
  assert.deepEqual(rahmenPruefen(100000, 60000, 40000), { ok: true, frei_cent: 40000 });
  assert.deepEqual(rahmenPruefen(100000, 60000, 40001), { ok: false, frei_cent: 40000 });
  assert.deepEqual(rahmenPruefen(100000, 150000, 1), { ok: false, frei_cent: 0 });
});

test('Kundenkonto-Link: Token nur im #-Teil, Seite mit Produkt-Baustein', () => {
  const t = 'abcdefghijABCDEFGHIJ0123456789-_';
  assert.equal(tokenGueltig(t), true);
  assert.equal(tokenGueltig(t + 'x'), false);
  assert.equal(tokenGueltig('abc def'), false);
  assert.equal(hashGueltig('a'.repeat(64)), true);
  assert.equal(hashGueltig('A'.repeat(64)), false);
  assert.equal(kundenLink('https://argonaut-os.com/', 'ab12', t), `https://argonaut-os.com/p/ab12#konto=${t}`);
  assert.equal(shopSeite([
    { oeffentlich_id: 'x', status: 'entwurf', bloecke: [{ typ: 'produkte' }] },
    { oeffentlich_id: 'y', status: 'live', bloecke: [{ typ: 'hero' }] },
    { oeffentlich_id: 'z', status: 'live', bloecke: [{ typ: 'hero' }, { typ: 'produkte' }] },
  ]), 'z');
  assert.equal(shopSeite([]), null);
  assert.equal(kundeName({ firma: ' Chemie AG ', vorname: 'Max' }), 'Chemie AG');
  assert.equal(kundeName({ vorname: 'Max', nachname: 'Muster' }), 'Max Muster');
  assert.equal(kundeName(null), 'Kunde');
});
