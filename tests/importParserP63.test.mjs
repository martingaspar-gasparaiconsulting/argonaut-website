// ============================================================================
// tests/importParserP63.test.mjs
//
// PUNKT 63 — DEN IMPORT-PARSER HAERTEN (21.09.2026)
// lib/importParser.ts hatte bis heute KEINEN Test.
//
// ▄▄▄ ALLE WERTE HIER SIND GEMESSEN ▄▄▄
// Die alte Fassung wurde neben die neue gebaut und beide mit denselben
// Eingaben gefahren. Was in den Kommentaren als "ALT" steht, ist kein
// Gedaechtnis, sondern ein Messwert.
//
// ▄▄▄ DIE FEHLER, DIE DIESE TESTS FESTNAGELN ▄▄▄
//  1. Ein Anfuehrungszeichen mitten im Feld frisst die ganze Datei.
//  2. "5,00 EUR" wird 0,00 EUR — und die Zeile laeuft trotzdem durch.
//  3. "12,345" ist an EINER Zelle nicht entscheidbar.
//  4. Das US-Datum wird nicht leer, sondern still falsch.
//  5. "1.1.69" wird 2069.
//  6. Die Bibliothek hat keine eigene Groessengrenze.
//  7. Gutschriften runden unsymmetrisch (Rest aus Punkt 30).
//  8. Der Steuersatz 19 % steht fest im Code.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  leseCsv, rateTrennzeichen, leseZahl, leseDatum, leseDatumGenau, jahrhundert,
  rateDezimaltrenner, zahlenWerte, pruefeZeile, pruefeAlles, errateMapping,
  GRENZEN, GELDFELDER, STEUERSATZ_STANDARD, ZUKUNFT_JAHRE,
} from '../out/importParser.js';

const HEUTE = new Date('2026-09-21T00:00:00Z');

// ===========================================================================
// TEIL 1 — FEHLER 1: DAS ANFUEHRUNGSZEICHEN MITTEN IM FELD
// ===========================================================================

test('FEHLER 1 — ein Zoll-Zeichen in der Bezeichnung frisst nicht mehr die Datei', () => {
  const csv = 'Bezeichnung;Artikelnummer;Verkaufspreis\nSchraube 5" lang;A-1;1,20\nMutter M8;A-2;0,35\n';
  const t = leseCsv(csv);
  // GEMESSEN an der alten Fassung: dort kam genau EINE Zeile heraus, und in
  // ihrer ersten Zelle stand
  //   'Schraube 5 lang;A-1;1,20\nMutter M8;A-2;0,35'
  // also der komplette Rest der Datei. Der Artikelstamm eines
  // Schraubenhaendlers waere zu einem einzigen Datensatz geworden.
  assert.equal(t.zeilen.length, 2, 'beide Zeilen muessen ankommen');
  assert.deepEqual(t.zeilen[0], ['Schraube 5" lang', 'A-1', '1,20']);
  assert.deepEqual(t.zeilen[1], ['Mutter M8', 'A-2', '0,35']);
});

test('ein Anfuehrungszeichen am FELDANFANG bleibt ein Begrenzer', () => {
  const csv = 'a;b\n"Wert; mit Semikolon";zwei\n';
  const t = leseCsv(csv);
  assert.deepEqual(t.zeilen[0], ['Wert; mit Semikolon', 'zwei']);
});

test('doppelte Anfuehrungszeichen bleiben das Escape', () => {
  const csv = 'a;b\n"Schraube 5"" lang";A-1\n';
  const t = leseCsv(csv);
  assert.deepEqual(t.zeilen[0], ['Schraube 5" lang', 'A-1']);
});

test('ein Zeilenumbruch INNERHALB eines Feldes funktioniert weiter', () => {
  const csv = 'a;b\n"Zeile1\nZeile2";x\n';
  const t = leseCsv(csv);
  assert.equal(t.zeilen.length, 1);
  assert.equal(t.zeilen[0][0], 'Zeile1\nZeile2');
});

test('BOM und Trennzeichen werden weiter erkannt', () => {
  assert.equal(rateTrennzeichen('a,b,c\n1,2,3\n'), ',');
  assert.equal(rateTrennzeichen('a;b;c\n1;2;3\n'), ';');
  const t = leseCsv('﻿a;b\n1;2\n');
  assert.deepEqual(t.kopf, ['a', 'b']);
});

test('mehr Spalten als die Kopfzeile werden gemeldet, nicht verschwiegen', () => {
  const t = leseCsv('a;b\n1;2;3\n');
  assert.ok(t.hinweise.some((h) => /mehr Spalten/.test(h)), JSON.stringify(t.hinweise));
});

// ===========================================================================
// TEIL 2 — FEHLER 2: "5,00 EUR"
// ===========================================================================

test('FEHLER 2 — Waehrungswoerter und Buchhalter-Schreibweisen werden gelesen', () => {
  // GEMESSEN: die alte Fassung lieferte fuer JEDEN dieser Werte null,
  // woraus pruefeZeile still eine 0 machte.
  assert.equal(leseZahl('5,00 EUR'), 5);
  assert.equal(leseZahl('1.234,56 EUR'), 1234.56);
  assert.equal(leseZahl('(1.234,56)'), -1234.56, 'Buchhalter-Klammern sind ein Minus');
  assert.equal(leseZahl('1.234,56-'), -1234.56, 'DATEV und SAP setzen das Minus hinten');
});

test('was vorher schon ging, geht weiter', () => {
  assert.equal(leseZahl('5,00 €'), 5);
  assert.equal(leseZahl('1.234,50'), 1234.5);
  assert.equal(leseZahl('1234.50'), 1234.5);
  assert.equal(leseZahl(42), 42);
  assert.equal(leseZahl(''), null);
  assert.equal(leseZahl('siehe Anlage'), null);
});

test('FEHLER 2, zweiter Teil — ein unlesbares GELDFELD ist ein Fehler, keine Warnung', () => {
  const kopf = ['Rechnungsnummer', 'Brutto'];
  const map = { Rechnungsnummer: 'rechnungsnummer', Brutto: 'brutto_summe' };
  const zeilen = [['RE-1', '5.000,00 EUR'], ['RE-2', 'siehe Anlage']];
  const b = pruefeAlles('rechnungen', map, kopf, zeilen, { heute: HEUTE });

  // GEMESSEN an der alten Fassung: dort kamen BEIDE Zeilen durch, beide mit
  // brutto_summe 0. Die 5.000-EUR-Rechnung war damit sofort "bezahlt" und
  // fehlte in Mahnwesen und Cashflow.
  assert.equal(b.gut, 1, 'nur die lesbare Zeile kommt durch');
  assert.equal(b.schlecht, 1);
  assert.equal(b.saetze[0].brutto_summe, 5000, 'und die richtig, nicht als 0');
  assert.ok(b.fehler.some((f) => /kein lesbarer Betrag/.test(f.meldung)));
});

test('die Liste der Geldfelder ist benannt und nicht geraten', () => {
  for (const k of ['netto_summe', 'mwst_summe', 'brutto_summe', 'bezahlter_betrag']) {
    assert.ok(GELDFELDER.includes(k), k + ' fehlt');
  }
});

test('ein unlesbarer BESTAND bleibt eine Warnung — das ist kein Geld', () => {
  const kopf = ['Bezeichnung', 'Bestand'];
  const map = { Bezeichnung: 'bezeichnung', Bestand: 'aktueller_bestand' };
  const b = pruefeAlles('artikel', map, kopf, [['Schraube', 'viele']], { heute: HEUTE });
  assert.equal(b.gut, 1, 'die Zeile kommt durch');
  assert.equal(b.saetze[0].aktueller_bestand, 0);
  assert.ok(b.warnungen.some((w) => /keine Zahl/.test(w.meldung)));
});

// ===========================================================================
// TEIL 3 — FEHLER 3: "12,345"
// ===========================================================================

test('FEHLER 3 — an EINER Zelle ist "12,345" nicht entscheidbar', () => {
  assert.equal(leseZahl('12,345', ','), 12.345, 'deutsch gelesen');
  assert.equal(leseZahl('12,345', '.'), 12345, 'englisch gelesen — Faktor 1000');
});

test('die Datei entscheidet, nicht die Zelle: englische Schreibweise', () => {
  const r = rateDezimaltrenner(['1,234.56', '12,345', '99.90']);
  assert.equal(r.dezimal, '.');
  assert.equal(r.sicher, true);
  assert.match(r.hinweis, /englische Schreibweise/);
});

test('die Datei entscheidet: deutsche Schreibweise', () => {
  const r = rateDezimaltrenner(['1.234,56', '12,345', '99,90']);
  assert.equal(r.dezimal, ',');
  assert.equal(r.sicher, true);
  assert.equal(r.hinweis, null, 'der Normalfall braucht keinen Hinweis');
});

test('bleibt es mehrdeutig, wird deutsch gelesen UND es wird gesagt', () => {
  const r = rateDezimaltrenner(['12,345', '5,678']);
  assert.equal(r.dezimal, 'unbekannt');
  assert.equal(r.sicher, false);
  assert.deepEqual(r.mehrdeutige, ['12,345', '5,678']);
  assert.match(r.hinweis, /tausendfach zu klein/);
});

test('beide Schreibweisen in einer Datei werden gemeldet', () => {
  const r = rateDezimaltrenner(['1.234,56', '9,876.54']);
  assert.equal(r.sicher, false);
  assert.match(r.hinweis, /BEIDE Schreibweisen/);
});

test('eine Datei ohne Trennzeichen braucht keine Entscheidung', () => {
  const r = rateDezimaltrenner(['100', '250', '3']);
  assert.equal(r.dezimal, 'unbekannt');
  assert.equal(r.sicher, true);
  assert.equal(r.hinweis, null);
});

test('GEMESSEN: eine englische Artikeldatei wird ganz gelesen', () => {
  const csv = 'Bezeichnung;Artikelnummer;Verkaufspreis\n"Schraube 5"" lang";A-1;1,234.56\nWinkel;A-2;99.90\n';
  const t = leseCsv(csv);
  const map = errateMapping(t.kopf, 'artikel');
  const b = pruefeAlles('artikel', map, t.kopf, t.zeilen, { heute: HEUTE });
  assert.equal(b.trenner.dezimal, '.');
  assert.equal(b.saetze[0].verkaufspreis, 1234.56);
  assert.equal(b.saetze[1].verkaufspreis, 99.9);
  assert.ok(b.hinweise.length > 0, 'die Entscheidung steht im Bericht');
});

test('DER EIGENTLICHE PUNKT: die Datei-Entscheidung rettet den mehrdeutigen Wert', () => {
  // "1,234.56" ist fuer sich allein eindeutig — daran laesst sich nicht
  // zeigen, dass die Entscheidung an der DATEI etwas bringt. "12,345" schon:
  // allein gelesen sind es 12,345, in dieser Datei aber 12.345.
  // (Die erste Fassung dieses Tests prüfte nur den eindeutigen Wert; die
  // Gegenprobe blieb deshalb gruen, obwohl der Patch griff — Lehre 8.)
  const csv = 'Bezeichnung;Verkaufspreis;Bestand\nSchraube;1,234.56;12,345\n';
  const t = leseCsv(csv);
  const map = errateMapping(t.kopf, 'artikel');
  const b = pruefeAlles('artikel', map, t.kopf, t.zeilen, { heute: HEUTE });

  assert.equal(b.trenner.dezimal, '.', 'die Datei ist an "1,234.56" als englisch erkannt');
  assert.equal(b.saetze[0].aktueller_bestand, 12345,
    'ohne die Datei-Entscheidung stuenden hier 12,345 Stueck statt 12.345 — Faktor 1000');

  // Zum Vergleich dieselbe Zahl in einer deutschen Datei.
  const deutsch = leseCsv('Bezeichnung;Verkaufspreis;Bestand\nSchraube;1.234,56;12,345\n');
  const bd = pruefeAlles('artikel', errateMapping(deutsch.kopf, 'artikel'), deutsch.kopf, deutsch.zeilen, { heute: HEUTE });
  assert.equal(bd.trenner.dezimal, ',');
  assert.equal(bd.saetze[0].aktueller_bestand, 12.345);
});

test('zahlenWerte sammelt nur die Zahlenspalten', () => {
  const kopf = ['Bezeichnung', 'Verkaufspreis'];
  const map = { Bezeichnung: 'bezeichnung', Verkaufspreis: 'verkaufspreis' };
  const w = zahlenWerte('artikel', map, kopf, [['Schraube', '1,20'], ['Mutter', '0,35']]);
  assert.deepEqual(w, ['1,20', '0,35'], 'die Bezeichnung darf die Entscheidung nicht verfaelschen');
});

// ===========================================================================
// TEIL 4 — FEHLER 4: DAS US-DATUM
// ===========================================================================

test('FEHLER 4 — der gefaehrliche Fall ist nicht "leer", sondern "still falsch"', () => {
  // GEMESSEN: die alte Fassung las "05/08/2026" klaglos als 5. August.
  // Gemeint war in einer US-Datei der 8. Mai — drei Monate daneben, ohne
  // jede Meldung.
  const g = leseDatumGenau('05/08/2026', HEUTE);
  assert.equal(g.datum, '2026-08-05', 'die deutsche Lesart bleibt die Voreinstellung');
  assert.equal(g.mehrdeutig, true, 'aber sie wird als mehrdeutig gemeldet');
  assert.equal(g.andereLesart, '2026-05-08');
});

test('der Punkt ist in Deutschland eindeutig — dort gibt es keine Meldung', () => {
  const g = leseDatumGenau('05.08.2026', HEUTE);
  assert.equal(g.datum, '2026-08-05');
  assert.equal(g.mehrdeutig, false);
});

test('"08/15/2026" ist eindeutig ein US-Datum und wird jetzt gelesen', () => {
  // GEMESSEN: die alte Fassung gab hier null — das Feld blieb leer.
  const g = leseDatumGenau('08/15/2026', HEUTE);
  assert.equal(g.datum, '2026-08-15');
  assert.equal(g.mehrdeutig, false, 'Monat 15 gibt es nicht, also ist nichts offen');
});

test('ISO bleibt ISO', () => {
  assert.equal(leseDatum('2026-08-15', HEUTE), '2026-08-15');
});

test('der 31. Februar faellt weiter durch', () => {
  assert.equal(leseDatum('31.02.2026', HEUTE), null);
  assert.equal(leseDatum('32.01.2026', HEUTE), null);
});

test('die Mehrdeutigkeit landet als Warnung in der Zeile', () => {
  const kopf = ['Nr', 'Datum'];
  const map = { Nr: 'rechnungsnummer', Datum: 'rechnungsdatum' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-1', '05/08/2026']], { heute: HEUTE });
  assert.equal(b.gut, 1);
  assert.equal(b.saetze[0].rechnungsdatum, '2026-08-05');
  assert.ok(b.warnungen.some((w) => /mehrdeutig/.test(w.meldung) && /2026-05-08/.test(w.meldung)));
});

// ===========================================================================
// TEIL 5 — FEHLER 5: "1.1.69"
// ===========================================================================

test('FEHLER 5 — "1.1.69" ist 1969, nicht 2069', () => {
  // GEMESSEN: die alte Fassung lieferte 2069-01-01.
  assert.equal(leseDatum('1.1.69', HEUTE), '1969-01-01');
});

test('KEINE VERSCHLECHTERUNG — was alt richtig war, bleibt richtig', () => {
  // Alle Werte an der alten Fassung gemessen; die ersten vier waren dort
  // schon richtig und muessen es bleiben.
  assert.equal(leseDatum('1.1.25', HEUTE), '2025-01-01');
  assert.equal(leseDatum('1.1.28', HEUTE), '2028-01-01', 'eine Faelligkeit 2028 darf nicht 1928 werden');
  assert.equal(leseDatum('1.1.99', HEUTE), '1999-01-01');
  assert.equal(leseDatum('1.1.00', HEUTE), '2000-01-01');
  assert.equal(leseDatum('1.1.70', HEUTE), '1970-01-01');
});

test('die Grenze haengt am laufenden Jahr, nicht an einer festen Zahl', () => {
  assert.equal(ZUKUNFT_JAHRE, 10);
  // 2026 + 10 = 2036 -> Grenze 36
  assert.equal(jahrhundert(36, HEUTE), 2036);
  assert.equal(jahrhundert(37, HEUTE), 1937);
  // Zehn Jahre spaeter verschiebt sich die Grenze von selbst mit.
  const spaeter = new Date('2036-01-01T00:00:00Z');
  assert.equal(jahrhundert(46, spaeter), 2046);
  assert.equal(jahrhundert(47, spaeter), 1947);
});

test('ein vierstelliges Jahr bleibt unangetastet', () => {
  assert.equal(jahrhundert(1969, HEUTE), 1969);
  assert.equal(jahrhundert(2026, HEUTE), 2026);
});

// ===========================================================================
// TEIL 6 — FEHLER 6: DIE GROESSENGRENZE
// ===========================================================================

test('FEHLER 6, EHRLICH — die Route hat Grenzen, die Bibliothek hatte keine', () => {
  // app/api/import/lesen/route.ts Z.20-21 begrenzt auf 12 MB und 5.000
  // Zeilen. Der Befund in der Liste ("es gibt keine Groessengrenze") stimmte
  // also nur fuer die Bibliothek — und dort greift die Route erst NACH dem
  // Parsen. Jetzt hat auch leseCsv eigene Grenzen.
  assert.ok(GRENZEN.zeilen > 0 && GRENZEN.spalten > 0 && GRENZEN.zeichen > 0);
});

test('zu viele Zeilen werden abgeschnitten UND gemeldet', () => {
  const viele = 'a;b\n' + '1;2\n'.repeat(GRENZEN.zeilen + 10);
  const t = leseCsv(viele);
  assert.ok(t.zeilen.length <= GRENZEN.zeilen);
  assert.ok(t.hinweise.some((h) => /abgeschnitten/.test(h)), JSON.stringify(t.hinweise));
});

test('ein nie geschlossenes Anfuehrungszeichen laeuft nicht ewig', () => {
  const kaputt = 'a;b\n"' + 'x'.repeat(GRENZEN.feldZeichen + 100) + '\n';
  const t = leseCsv(kaputt);
  assert.ok(t.hinweise.some((h) => /zu lang/.test(h)), JSON.stringify(t.hinweise));
});

test('eine leere Datei ergibt keine Ausnahme', () => {
  const t = leseCsv('');
  assert.deepEqual(t.kopf, []);
  assert.deepEqual(t.zeilen, []);
});

// ===========================================================================
// TEIL 7 — FEHLER 7: DIE GUTSCHRIFT (Rest aus Punkt 30)
// ===========================================================================

test('FEHLER 7 — eine Gutschrift rundet jetzt symmetrisch', () => {
  const kopf = ['Nr', 'Netto', 'MwSt'];
  const map = { Nr: 'rechnungsnummer', Netto: 'netto_summe', MwSt: 'mwst_summe' };
  const b = pruefeAlles('rechnungen', map, kopf, [['GS-1', '-12,345', '0,00']], { heute: HEUTE });
  // GEMESSEN: die alte Fassung schrieb hier brutto_summe -12,34.
  assert.equal(b.saetze[0].brutto_summe, -12.35);
});

test('EHRLICH: nicht jeder negative Wert trifft den Grenzfall', () => {
  // -2,345 mal 100 ist in Gleitkomma -234,50000000000002 und damit KLEINER
  // als -234,5 — da rundet auch Math.round schon auf -2,35. Der Test haelt
  // das fest, damit niemand die Gegenprobe an diesem Wert versucht und
  // glaubt, die Reparatur wirke nicht. Brauchbare Grenzfaelle: 12,345 ·
  // 1234,565 · 2,675 · 1,005 · 99,995.
  assert.equal(Math.round(-2.345 * 100) / 100, -2.35);
  assert.notEqual(Math.round(-12.345 * 100) / 100, -12.35);
});

test('eine Gutschrift wird als solche benannt', () => {
  const kopf = ['Nr', 'Brutto'];
  const map = { Nr: 'rechnungsnummer', Brutto: 'brutto_summe' };
  const b = pruefeAlles('rechnungen', map, kopf, [['GS-1', '-119,00']], { heute: HEUTE });
  assert.ok(b.warnungen.some((w) => /Gutschrift/.test(w.meldung)));
  assert.equal(b.saetze[0].zahlungsstatus, 'offen', 'kein automatischer Status bei negativem Betrag');
});

// ===========================================================================
// TEIL 8 — FEHLER 8: DER STEUERSATZ
// ===========================================================================

test('FEHLER 8 — der Steuersatz ist eine Eingabe, keine Konstante im Code', () => {
  const kopf = ['Nr', 'Brutto'];
  const map = { Nr: 'rechnungsnummer', Brutto: 'brutto_summe' };
  // GEMESSEN: die alte Fassung rechnete IMMER mit 19 % und lieferte fuer
  // 107,00 EUR netto 89,92 und MwSt 17,08 — bei einem Buchhaendler falsch.
  const mitSieben = pruefeAlles('rechnungen', map, kopf, [['RE-9', '107,00']], { steuersatz: 7, heute: HEUTE });
  assert.equal(mitSieben.saetze[0].netto_summe, 100);
  assert.equal(mitSieben.saetze[0].mwst_summe, 7);

  const ohneAngabe = pruefeAlles('rechnungen', map, kopf, [['RE-9', '107,00']], { heute: HEUTE });
  assert.equal(ohneAngabe.saetze[0].netto_summe, 89.92, 'ohne Angabe bleibt es bei 19 Prozent');
  assert.equal(STEUERSATZ_STANDARD, 19);
});

test('die Warnung nennt den verwendeten Satz', () => {
  const kopf = ['Nr', 'Brutto'];
  const map = { Nr: 'rechnungsnummer', Brutto: 'brutto_summe' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-9', '107,00']], { steuersatz: 7, heute: HEUTE });
  assert.ok(b.warnungen.some((w) => /mit 7 % zurückgerechnet/.test(w.meldung)), JSON.stringify(b.warnungen));
});

test('ein Kleinunternehmer mit 0 Prozent rechnet nicht zurueck', () => {
  const kopf = ['Nr', 'Brutto'];
  const map = { Nr: 'rechnungsnummer', Brutto: 'brutto_summe' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-9', '100,00']], { steuersatz: 0, heute: HEUTE });
  assert.equal(b.saetze[0].netto_summe, 100);
  assert.equal(b.saetze[0].mwst_summe, 0);
});

// ===========================================================================
// TEIL 9 — WAS UNVERAENDERT WEITERLAUFEN MUSS
// ===========================================================================

test('die Spaltenerkennung arbeitet wie bisher', () => {
  const map = errateMapping(['Firmenname', 'E-Mail', 'Telefonnummer'], 'kontakte');
  assert.equal(map['Firmenname'], 'firma');
  assert.equal(map['E-Mail'], 'email');
  assert.equal(map['Telefonnummer'], 'telefon');
});

test('Pflichtfelder bleiben Pflicht', () => {
  const kopf = ['Artikelnummer'];
  const map = { Artikelnummer: 'artikelnummer' };
  const e = pruefeZeile('artikel', map, kopf, ['A-1'], 2);
  assert.equal(e.werte, null);
  assert.ok(e.fehler.some((f) => /Pflichtfeld/.test(f.meldung)));
});

test('Dubletten in der Datei werden weiter erkannt', () => {
  const kopf = ['Nr', 'Titel'];
  const map = { Nr: 'rechnungsnummer', Titel: 'titel' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-1', 'a'], ['RE-1', 'b']], { heute: HEUTE });
  assert.equal(b.dubletten_in_datei, 1);
  assert.equal(b.gut, 1);
});

test('eine unbrauchbare E-Mail wird weiter geleert', () => {
  const kopf = ['Nachname', 'Mail'];
  const map = { Nachname: 'nachname', Mail: 'email' };
  const b = pruefeAlles('kontakte', map, kopf, [['Berger', 'keine-mail']], { heute: HEUTE });
  assert.equal(b.saetze[0].email, undefined);
  assert.ok(b.warnungen.some((w) => /E-Mail-Adresse/.test(w.meldung)));
});

test('der Status wird weiter auf bekannte Werte gebracht', () => {
  const kopf = ['Nachname', 'Status'];
  const map = { Nachname: 'nachname', Status: 'status' };
  const b = pruefeAlles('kontakte', map, kopf, [['Berger', 'VIP']], { heute: HEUTE });
  assert.equal(b.saetze[0].status, 'interessent');
  assert.ok(b.warnungen.some((w) => /kein bekannter Status/.test(w.meldung)));
});

test('Brutto wird weiter aus Netto und MwSt gerechnet', () => {
  const kopf = ['Nr', 'Netto', 'MwSt'];
  const map = { Nr: 'rechnungsnummer', Netto: 'netto_summe', MwSt: 'mwst_summe' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-1', '1000,00', '190,00']], { heute: HEUTE });
  assert.equal(b.saetze[0].brutto_summe, 1190);
});

test('eine Teilzahlung setzt weiter den Status', () => {
  const kopf = ['Nr', 'Brutto', 'Bezahlt'];
  const map = { Nr: 'rechnungsnummer', Brutto: 'brutto_summe', Bezahlt: 'bezahlter_betrag' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-1', '1000,00', '200,00']], { heute: HEUTE });
  assert.equal(b.saetze[0].zahlungsstatus, 'teilbezahlt');
});

test('der Bericht traegt die neuen Felder, ohne die alten zu verlieren', () => {
  const kopf = ['Nr'];
  const map = { Nr: 'rechnungsnummer' };
  const b = pruefeAlles('rechnungen', map, kopf, [['RE-1']], { heute: HEUTE });
  for (const feld of ['gesamt', 'gut', 'schlecht', 'saetze', 'fehler', 'warnungen', 'dubletten_in_datei']) {
    assert.ok(feld in b, 'Feld ' + feld + ' fehlt');
  }
  assert.ok('trenner' in b);
  assert.ok(Array.isArray(b.hinweise));
});
