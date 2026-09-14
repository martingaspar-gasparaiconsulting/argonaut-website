import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBetrag, parseUmsaetzeCsv, normNummer, matchTransaktion, matchAlle, zaehleMatches,
} from '../out/bankAbgleich.js';
import { parseUmsaetze } from '../out/bankFormate.js';

// lib/bankAbgleich.ts trug im Kopf „Node-getestet", hatte aber keine Testdatei.
// Nachgeholt am 14.09.26 — die Quelldatei bleibt dabei UNVERAENDERT.

// ── Betraege ────────────────────────────────────────────────────────────────

test('Deutsche Betragsschreibweise wird verstanden', () => {
  assert.equal(parseBetrag('1.234,56'), 1234.56);
  assert.equal(parseBetrag('1234,56'), 1234.56);
  assert.equal(parseBetrag('1926,00'), 1926);
  assert.equal(parseBetrag(1926), 1926);
});

test('Minus wird in jeder Schreibweise erkannt', () => {
  assert.equal(parseBetrag('-50,00'), -50);
  assert.equal(parseBetrag('50,00-'), -50);      // Nachstelliges Minus (SAP/DATEV)
  assert.equal(parseBetrag('(50,00)'), -50);     // Klammer-Minus
});

test('Aus Unsinn wird 0, nie NaN', () => {
  // NaN in einer Geldspalte laesst spaeter jeden Vergleich still fehlschlagen.
  for (const x of ['', null, undefined, 'abc', NaN, Infinity]) {
    const v = parseBetrag(x);
    assert.ok(Number.isFinite(v), `${String(x)} muss eine endliche Zahl ergeben`);
    assert.equal(v, 0);
  }
});

// ── CSV ─────────────────────────────────────────────────────────────────────

test('CSV: Semikolon und Komma als Trennzeichen', () => {
  const semi = 'Buchungstag;Name;Verwendungszweck;Betrag\n20.07.2026;Stadtwerke;RE-2026-0001;1926,00';
  const komma = 'Buchungstag,Name,Verwendungszweck,Betrag\n20.07.2026,Stadtwerke,RE-2026-0001,1926.00';
  assert.equal(parseUmsaetzeCsv(semi)[0].betrag, 1926);
  assert.equal(parseUmsaetzeCsv(komma)[0].betrag, 1926);
});

test('CSV: Spalten werden ueber die Kopfzeile gefunden, egal in welcher Reihenfolge', () => {
  const t = parseUmsaetzeCsv('Betrag;Verwendungszweck;Buchungstag;Auftraggeber\n99,00;Test;01.02.2026;Muster')[0];
  assert.equal(t.betrag, 99);
  assert.equal(t.verwendungszweck, 'Test');
  assert.equal(t.datum, '01.02.2026');
  assert.equal(t.name, 'Muster');
});

test('CSV: Anfuehrungszeichen schuetzen ein Semikolon im Text', () => {
  const t = parseUmsaetzeCsv('Buchungstag;Verwendungszweck;Betrag\n01.02.2026;"Rechnung 1; Rechnung 2";10,00')[0];
  assert.equal(t.verwendungszweck, 'Rechnung 1; Rechnung 2');
});

test('CSV: ohne Datenzeile kommt eine leere Liste', () => {
  assert.deepEqual(parseUmsaetzeCsv('Buchungstag;Betrag'), []);
  assert.deepEqual(parseUmsaetzeCsv(''), []);
});

// ── Nummern-Normierung ──────────────────────────────────────────────────────

test('Rechnungsnummern werden vergleichbar gemacht', () => {
  assert.equal(normNummer('RE-2026-0001'), 'RE20260001');
  assert.equal(normNummer('re 2026/0001'), 'RE20260001');
  assert.equal(normNummer('RE.2026_0001'), 'RE20260001');
  assert.equal(normNummer(null), '');
});

// ── Zuordnung ───────────────────────────────────────────────────────────────

const OFFEN = [
  { id: 'a', nummer: 'RE-2026-0001', brutto: 1926 },
  { id: 'b', nummer: 'RE-2026-0002', brutto: 500 },
  { id: 'c', nummer: 'RE-2026-0003', brutto: 500 },
];

test('Rechnungsnummer im Verwendungszweck gilt als SICHER', () => {
  const m = matchTransaktion({ datum: '', betrag: 1926, verwendungszweck: 'Zahlung RE 2026 0001', name: '' }, OFFEN);
  assert.equal(m.rechnungId, 'a');
  assert.equal(m.sicher, true);
});

test('Ein eindeutiger Betrag ohne Nummer gilt nur als WAHRSCHEINLICH', () => {
  const m = matchTransaktion({ datum: '', betrag: 1926, verwendungszweck: 'Ueberweisung', name: '' }, OFFEN);
  assert.equal(m.rechnungId, 'a');
  assert.equal(m.sicher, false);
});

test('Zwei Rechnungen mit gleichem Betrag werden NICHT geraten', () => {
  // Der wichtigste Schutz der Datei: lieber nichts zuordnen als falsch buchen.
  const m = matchTransaktion({ datum: '', betrag: 500, verwendungszweck: 'Zahlung', name: '' }, OFFEN);
  assert.equal(m.rechnungId, null);
  assert.ok(m.grund.includes('manuell'));
});

test('Steht die Nummer dabei, entscheidet sie auch bei gleichem Betrag', () => {
  const m = matchTransaktion({ datum: '', betrag: 500, verwendungszweck: 'RE-2026-0003', name: '' }, OFFEN);
  assert.equal(m.rechnungId, 'c');
  assert.equal(m.sicher, true);
});

test('Ein Zahlungsausgang wird nie einer Rechnung zugeordnet', () => {
  const m = matchTransaktion({ datum: '', betrag: -89.9, verwendungszweck: 'RE-2026-0001', name: '' }, OFFEN);
  assert.equal(m.rechnungId, null);
  assert.equal(m.grund, 'Kein Zahlungseingang');
});

test('matchAlle laesst Ausgaenge ganz weg', () => {
  const zeilen = matchAlle([
    { datum: '', betrag: 1926, verwendungszweck: 'RE-2026-0001', name: '' },
    { datum: '', betrag: -89.9, verwendungszweck: 'Hostinger', name: '' },
  ], OFFEN);
  assert.equal(zeilen.length, 1);
});

test('zaehleMatches trennt sicher, wahrscheinlich und ohne Treffer', () => {
  const zeilen = matchAlle([
    { datum: '', betrag: 1926, verwendungszweck: 'RE-2026-0001', name: '' },  // sicher
    { datum: '', betrag: 500, verwendungszweck: 'Zahlung', name: '' },        // zwei gleiche -> offen
    { datum: '', betrag: 42, verwendungszweck: 'Fremd', name: '' },           // offen
  ], OFFEN);
  const k = zaehleMatches(zeilen);
  assert.equal(k.sicher, 1);
  assert.equal(k.wahrscheinlich, 0);
  assert.equal(k.offen, 2);
});

// ── Die Kette: Datei rein, Zuordnung raus ───────────────────────────────────

test('KETTE: dieselbe Zahlung wird aus CSV, CAMT und MT940 gleich zugeordnet', () => {
  const csv = 'Buchungstag;Name;Verwendungszweck;Betrag\n20.07.2026;Stadtwerke;Rechnung RE-2026-0001;1926,00';
  const camt = `<Document><Ntry><Amt Ccy="EUR">1926.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-07-20</Dt></BookgDt><RmtInf><Ustrd>Rechnung RE-2026-0001</Ustrd></RmtInf></Ntry></Document>`;
  const mt = ':20:X\n:61:2607200720C1926,00NTRFNONREF\n:86:166?00GUTSCHRIFT?20Rechnung RE-2026-?210001?32Stadtwerke\n:62F:C260731EUR0,00';

  for (const [name, inhalt] of [['CSV', csv], ['CAMT', camt], ['MT940', mt]]) {
    const zeilen = matchAlle(parseUmsaetze(inhalt), OFFEN);
    assert.equal(zeilen.length, 1, `${name}: genau eine Zeile`);
    assert.equal(zeilen[0].rechnungId, 'a', `${name}: findet Rechnung a`);
    assert.equal(zeilen[0].sicher, true, `${name}: sicher, weil die Nummer dabeisteht`);
  }
});

test('KETTE: eine Ruecklastschrift aus MT940 markiert nichts als bezahlt', () => {
  const storno = ':20:X\n:61:2607230723RC1926,00NTRFNONREF\n:86:169?00STORNO?20Rechnung RE-2026-?210001\n:62F:C260731EUR0,00';
  const zeilen = matchAlle(parseUmsaetze(storno), OFFEN);
  assert.equal(zeilen.length, 0, 'ein negativer Betrag darf gar nicht erst im Abgleich landen');
});
