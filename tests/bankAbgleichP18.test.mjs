import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBetrag, betragOderNull, parseUmsaetzeCsv, leseUmsaetzeCsv, erkenneSpalten,
  genannteRechnungen, matchTransaktion, matchAlle, zaehleMatches, bankHinweise,
} from '../out/bankAbgleich.js';
import { parseUmsaetze } from '../out/bankFormate.js';

// ===========================================================================
// PUNKT 18 — Bankabgleich repariert (18.09.2026)
//
// Jeder Befund wurde vorher am echten Code GEMESSEN. Was hier steht, ist die
// Gegenrichtung zu dem, was die Datei vorher getan hat:
//   1. 100 EUR Abschlag galten als SICHER bezahlte 1.926-EUR-Rechnung
//   2. Sammelzahlung 2.426 EUR traf nur die erste Rechnung, mit vollem Betrag
//   3. "Wertstellung" gewann als Betragsspalte -> 0,00 EUR
//      "Lastschrift Ursprungsbetrag" gewann -> NULL Zeilen aus der ganzen Datei
//      "Buchungstext" gewann gegen "Verwendungszweck" -> Nummer kam nie an
//   4. "1.234" wurde 1,23 EUR und "1.234.567" wurde 0
// ===========================================================================

const OFFEN = [
  { id: 'a', nummer: 'RE-2026-0001', brutto: 1926 },
  { id: 'b', nummer: 'RE-2026-0002', brutto: 500 },
  { id: 'c', nummer: 'RE-2026-0003', brutto: 500 },
];

// ── 1) Teilzahlung ─────────────────────────────────────────────────────────

test('Ein Abschlag macht die Rechnung NICHT bezahlt', () => {
  const m = matchTransaktion({ datum: '', betrag: 100, verwendungszweck: 'Abschlag RE-2026-0001', name: '' }, OFFEN);
  assert.equal(m.art, 'teil');
  assert.equal(m.rechnungId, null, 'ohne rechnungId kann die Seite keinen "als bezahlt"-Knopf anbieten');
  assert.equal(m.sicher, false);
  assert.equal(m.rechnungNummer, 'RE-2026-0001', 'die gemeinte Rechnung wird trotzdem genannt');
  assert.equal(m.rechnungBrutto, 1926);
  assert.equal(m.differenz, -1826);
  assert.ok(m.grund.includes('Teilzahlung'));
  assert.ok(m.grund.includes('1.826,00'), 'der offene Rest steht im Klartext: ' + m.grund);
});

test('Ein Cent zu wenig ist schon eine Teilzahlung, ein halber Cent nicht', () => {
  const knapp = matchTransaktion({ datum: '', betrag: 1925.99, verwendungszweck: 'RE-2026-0001', name: '' }, OFFEN);
  assert.equal(knapp.art, 'teil');
  const rundung = matchTransaktion({ datum: '', betrag: 1926.004, verwendungszweck: 'RE-2026-0001', name: '' }, OFFEN);
  assert.equal(rundung.art, 'voll', 'Rundungsstaub darf keine Vollzahlung zerreissen');
  assert.equal(rundung.sicher, true);
});

test('Eine Vollzahlung mit Nummer bleibt sicher und buchbar', () => {
  const m = matchTransaktion({ datum: '', betrag: 1926, verwendungszweck: 'Zahlung RE 2026 0001', name: '' }, OFFEN);
  assert.equal(m.art, 'voll');
  assert.equal(m.rechnungId, 'a');
  assert.equal(m.sicher, true);
  assert.equal(m.differenz, 0);
});

test('Zahlt jemand MEHR als die Rechnung, wird das gemeldet statt gebucht', () => {
  const m = matchTransaktion({ datum: '', betrag: 2000, verwendungszweck: 'RE-2026-0001', name: '' }, OFFEN);
  assert.equal(m.art, 'ueber');
  assert.equal(m.rechnungId, null);
  assert.equal(m.differenz, 74);
  assert.ok(m.grund.includes('74,00'));
});

// ── 2) Sammelzahlung ───────────────────────────────────────────────────────

test('Eine Sammelzahlung wird nicht der ersten Rechnung zugeschlagen', () => {
  const m = matchTransaktion({ datum: '', betrag: 2426, verwendungszweck: 'RE-2026-0001 und RE-2026-0002', name: '' }, OFFEN);
  assert.equal(m.art, 'sammel');
  assert.equal(m.rechnungId, null);
  assert.equal(m.genannte.length, 2);
  assert.deepEqual(m.genannte.map((r) => r.id), ['a', 'b']);
  assert.equal(m.differenz, 0, '1926 + 500 = 2426, die Summe stimmt');
  assert.ok(m.grund.includes('Summe'), m.grund);
});

test('Sammelzahlung mit unpassender Summe sagt beide Betraege', () => {
  const m = matchTransaktion({ datum: '', betrag: 2000, verwendungszweck: 'RE-2026-0001 RE-2026-0002', name: '' }, OFFEN);
  assert.equal(m.art, 'sammel');
  assert.equal(m.differenz, -426);
  assert.ok(m.grund.includes('2.426,00') && m.grund.includes('2.000,00'), m.grund);
});

test('Eine Nummer, die in einer laengeren steckt, zaehlt nicht als zweite', () => {
  // RE-2026-0001 ist Teilzeichenkette von RE-2026-00011. Ohne diese Regel
  // waere jede Zahlung auf die lange Nummer eine Sammelzahlung.
  const offen = [{ id: 'a', nummer: 'RE-2026-0001', brutto: 100 }, { id: 'x', nummer: 'RE-2026-00011', brutto: 200 }];
  const g = genannteRechnungen('Zahlung RE-2026-00011', offen);
  assert.equal(g.length, 1);
  assert.equal(g[0].id, 'x');
});

// ── 3) Spaltensuche ────────────────────────────────────────────────────────

test('"Wertstellung" wird nicht mehr fuer die Betragsspalte gehalten', () => {
  const kopf = 'Buchungstag;Wertstellung;Buchungstext;Auftraggeber;Verwendungszweck;Betrag (EUR)';
  const sp = erkenneSpalten(kopf);
  assert.equal(sp.betrag, 5, 'Betrag (EUR), nicht Wertstellung');
  assert.equal(sp.zweck, 4, 'Verwendungszweck, nicht Buchungstext');
  assert.equal(sp.datum, 0);
  const t = parseUmsaetzeCsv(kopf + '\n20.07.2026;20.07.2026;Gutschrift;Stadtwerke;Rechnung RE-2026-0001;1.926,00');
  assert.equal(t.length, 1);
  assert.equal(t[0].betrag, 1926);
  assert.equal(t[0].verwendungszweck, 'Rechnung RE-2026-0001');
});

test('"Lastschrift Ursprungsbetrag" leert die Datei nicht mehr', () => {
  const kopf = 'Auftragskonto;Buchungstag;Buchungstext;Verwendungszweck;Lastschrift Ursprungsbetrag;Beguenstigter/Zahlungspflichtiger;Betrag;Waehrung';
  const sp = erkenneSpalten(kopf);
  assert.equal(sp.betrag, 6, 'Betrag, nicht Lastschrift Ursprungsbetrag');
  const t = parseUmsaetzeCsv(kopf + '\nDE12;20.07.2026;GUTSCHRIFT;Rechnung RE-2026-0001;;Stadtwerke;1.926,00;EUR');
  assert.equal(t.length, 1, 'vorher kam hier eine leere Liste heraus');
  assert.equal(t[0].betrag, 1926);
  assert.equal(t[0].name, 'Stadtwerke');
});

test('Die Kette haelt: aus so einer Datei wird die Rechnung sicher zugeordnet', () => {
  const kopf = 'Buchungstag;Wertstellung;Buchungstext;Auftraggeber;Verwendungszweck;Betrag (EUR)';
  const zeilen = matchAlle(parseUmsaetzeCsv(kopf + '\n20.07.2026;20.07.2026;Gutschrift;Stadtwerke;Rechnung RE-2026-0001;1.926,00'), OFFEN);
  assert.equal(zeilen.length, 1);
  assert.equal(zeilen[0].rechnungId, 'a');
  assert.equal(zeilen[0].sicher, true);
});

test('Ein Soll/Haben-Kennzeichen dreht das Vorzeichen', () => {
  const kopf = 'Buchungstag;Verwendungszweck;Betrag;Soll/Haben';
  const t = parseUmsaetzeCsv(kopf + '\n01.02.2026;Miete;800,00;S\n02.02.2026;RE-2026-0002;500,00;H');
  assert.equal(t[0].betrag, -800, 'S = Soll = Abgang');
  assert.equal(t[1].betrag, 500);
  // und ein Abgang landet gar nicht erst im Abgleich
  assert.equal(matchAlle(t, OFFEN).length, 1);
});

test('Eine unlesbare Geldzelle wird gemeldet statt als 0,00 EUR gebucht', () => {
  const e = leseUmsaetzeCsv('Buchungstag;Verwendungszweck;Betrag\n01.02.2026;RE-2026-0002;500,00\n02.02.2026;Unklar;1.926,00 H');
  assert.equal(e.transaktionen.length, 1);
  assert.equal(e.unlesbar, 1);
  assert.ok(e.hinweise.some((h) => h.includes('ohne lesbaren Betrag')), e.hinweise.join(' | '));
});

test('Fehlt die Betragsspalte ganz, sagt die Datei das', () => {
  const e = leseUmsaetzeCsv('Buchungstag;Verwendungszweck;Waehrung\n01.02.2026;RE-2026-0002;EUR');
  assert.equal(e.transaktionen.length, 0);
  assert.ok(e.hinweise.some((h) => h.includes('Keine Betragsspalte')), e.hinweise.join(' | '));
});

// ── 4) Betraege ueber lib/zahlen.ts ────────────────────────────────────────

test('Tausenderpunkte ohne Nachkomma werden endlich richtig gelesen', () => {
  assert.equal(parseBetrag('1.234'), 1234);        // war 1.234
  assert.equal(parseBetrag('1.234.567'), 1234567); // war 0
  assert.equal(parseBetrag('1.000'), 1000);        // war 1
  assert.equal(parseBetrag('1.234,56'), 1234.56);
  assert.equal(parseBetrag('1926.00'), 1926);
});

test('betragOderNull unterscheidet null Euro von nicht lesbar', () => {
  assert.equal(betragOderNull('0,00'), 0);
  assert.equal(betragOderNull(''), null);
  assert.equal(betragOderNull('abc'), null);
  assert.equal(betragOderNull('8,20 x'), null, 'Text an der Zahl ist kein Betrag');
  assert.equal(betragOderNull('1926,'), 1926, 'SWIFT schreibt glatte Betraege mit Schlusskomma');
  assert.equal(parseBetrag('abc'), 0, 'parseBetrag bleibt bei seiner Zusage: nie NaN');
});

test('CAMT-Betraege mit drei Nachkommastellen werden nicht zu Tausendern', () => {
  const camt = '<Document><Ntry><Amt Ccy="EUR">123.456</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>' +
    '<BookgDt><Dt>2026-07-20</Dt></BookgDt><RmtInf><Ustrd>Test</Ustrd></RmtInf></Ntry></Document>';
  assert.equal(parseUmsaetze(camt)[0].betrag, 123.456);
});

test('MT940 mit glattem Betrag ohne Nachkommastellen', () => {
  const mt = ':20:X\n:61:2607200720C1926,NTRFNONREF\n:86:166?00GUTSCHRIFT?20RE-2026-0001\n:62F:C260731EUR0,00';
  assert.equal(parseUmsaetze(mt)[0].betrag, 1926);
});

// ── Zaehler und Hinweise ───────────────────────────────────────────────────

test('zaehleMatches zaehlt Teil- und Sammelzahlungen getrennt mit', () => {
  const zeilen = matchAlle([
    { datum: '', betrag: 1926, verwendungszweck: 'RE-2026-0001', name: '' },              // voll, sicher
    { datum: '', betrag: 100, verwendungszweck: 'Abschlag RE-2026-0002', name: '' },      // teil
    { datum: '', betrag: 2426, verwendungszweck: 'RE-2026-0001 RE-2026-0002', name: '' }, // sammel
    { datum: '', betrag: 42, verwendungszweck: 'Fremd', name: '' },                       // nichts
  ], OFFEN);
  const k = zaehleMatches(zeilen);
  assert.equal(k.sicher, 1);
  assert.equal(k.wahrscheinlich, 0);
  assert.equal(k.teil, 1);
  assert.equal(k.sammel, 1);
  assert.equal(k.offen, 3, 'Teil, Sammel und Fremd sind alle nicht buchbar');
});

test('bankHinweise nennt im Klartext, was Aufmerksamkeit braucht', () => {
  const zeilen = matchAlle([
    { datum: '', betrag: 100, verwendungszweck: 'RE-2026-0001', name: '' },
    { datum: '', betrag: 2426, verwendungszweck: 'RE-2026-0001 RE-2026-0002', name: '' },
    { datum: '', betrag: 2000, verwendungszweck: 'RE-2026-0001', name: '' },
    { datum: '', betrag: 1926, verwendungszweck: 'ohne Nummer', name: '' },
  ], OFFEN);
  const h = bankHinweise(zeilen).join(' | ');
  assert.ok(h.includes('Teilzahlung'), h);
  assert.ok(h.includes('Sammelzahlung'), h);
  assert.ok(h.includes('ueber dem Rechnungsbetrag'), h);
  assert.ok(h.includes('ohne Rechnungsnummer'), h);
});

test('Ohne Auffaelligkeiten bleibt die Hinweisliste leer', () => {
  const zeilen = matchAlle([{ datum: '', betrag: 1926, verwendungszweck: 'RE-2026-0001', name: '' }], OFFEN);
  assert.deepEqual(bankHinweise(zeilen), []);
});

test('Ist die EINZIGE betragsaehnliche Spalte die falsche, wird lieber gar keine genommen', () => {
  // Hier traegt nicht die Rangfolge, sondern die Ausschlussliste: "Lastschrift
  // Ursprungsbetrag" ist der Betrag VOR einer Ruecklastschrift und meist leer.
  // Ohne Ausschluss waere sie hier der einzige Kandidat, und die ganze Datei
  // ergaebe still null Umsaetze — genau der gemessene Sparkassen-Fall.
  const kopf = 'Buchungstag;Buchungstext;Verwendungszweck;Lastschrift Ursprungsbetrag;Waehrung';
  const sp = erkenneSpalten(kopf);
  assert.equal(sp.betrag, -1);
  const e = leseUmsaetzeCsv(kopf + '\n20.07.2026;GUTSCHRIFT;Rechnung RE-2026-0001;;EUR');
  assert.equal(e.transaktionen.length, 0);
  assert.ok(e.hinweise.some((h) => h.includes('Keine Betragsspalte')), e.hinweise.join(' | '));
});
