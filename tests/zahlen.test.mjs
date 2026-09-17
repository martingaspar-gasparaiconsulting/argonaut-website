// ARGONAUT OS · tests/zahlen.test.mjs — Punkt 12: der eine Zahlen-Leser (17.09.2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  leseZahl,
  leseZahlOder,
  leseZahlMitTrenner,
  leseBetrag,
  leseProzent,
  centRunden,
  istZahlText,
} from '../out/zahlen.js';

// ---------------------------------------------------------------------------
// Die Faelle, an denen die alten Leser gescheitert sind
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE TEST: 1.234,56 ist tausendzweihundertvierunddreissig Komma 56', () => {
  // Bauart A (replace(',','.') allein) machte daraus "1.234.56" und damit 0.
  assert.equal(leseZahl('1.234,56'), 1234.56);
  assert.equal(leseZahl('12.345.678,90'), 12345678.9);
  assert.equal(leseZahl('1.234,56 EUR'), 1234.56);
});

test('223,75 bleibt 223,75 und wird nicht zu 22375', () => {
  // Bauart B (Punkte IMMER weg) erzeugte hier das teuerste Angebot im Haus.
  assert.equal(leseZahl('223,75'), 223.75);
  assert.equal(leseZahl('223.75'), 223.75);
});

test('7,5 Prozent bleiben 7,5 und werden nicht zu 75', () => {
  assert.equal(leseProzent('7,5'), 7.5);
  assert.equal(leseProzent('7.5'), 7.5);
  assert.equal(leseProzent('7,5 %'), 7.5);
  assert.equal(leseProzent('7,5%'), 7.5);
});

test('1.234 ohne Nachkomma ist tausendzweihundertvierunddreissig', () => {
  // bankAbgleich Z. 24 entfernt Punkte nur bei vorhandenem Komma und lieferte
  // hier 1,234 — also den tausendsten Teil des Gemeinten.
  assert.equal(leseZahl('1.234'), 1234);
  assert.equal(leseZahl('12.345.678'), 12345678);
});

test('abgebrochener Text ist KEINE Zahl — der Aufmass-Fehler', () => {
  // ".filter(Boolean)" plus wegputzende Leser machten aus "8,20 x" die Menge 8,20.
  assert.equal(leseZahl('8,20 x'), null);
  assert.equal(leseZahl('ca. 5'), null);
  assert.equal(leseZahl('1.234 Stueck'), null);
  assert.equal(leseZahl('12,5 m2'), null);
  assert.equal(leseZahl('rund 100'), null);
});

test('5,00 EUR wird 5 und nicht 0', () => {
  assert.equal(leseZahl('5,00 EUR'), 5);
  assert.equal(leseZahl('5,00EUR'), 5);
  assert.equal(leseZahl('€ 5,00'), 5);
  assert.equal(leseZahl('5,00 €'), 5);
  assert.equal(leseZahl('CHF 1234.50'), 1234.5);
});

// ---------------------------------------------------------------------------
// Schreibweisen
// ---------------------------------------------------------------------------

test('reine Ziffern', () => {
  assert.equal(leseZahl('0'), 0);
  assert.equal(leseZahl('7'), 7);
  assert.equal(leseZahl('1234567'), 1234567);
});

test('deutsches Dezimalkomma', () => {
  assert.equal(leseZahl('12,5'), 12.5);
  assert.equal(leseZahl('0,75'), 0.75);
  assert.equal(leseZahl('0,001'), 0.001);
  assert.equal(leseZahl(',5'), 0.5);
});

test('englische Tausenderkommas nur bei mehr als einem Komma', () => {
  assert.equal(leseZahl('1,234,567'), 1234567);
  assert.equal(leseZahl('1,234.56'), 1234.56);
  assert.equal(leseZahl('12,345,678.90'), 12345678.9);
  // Genau ein Komma bleibt deutsch — das ist die bewusste Entscheidung.
  assert.equal(leseZahl('12,345'), 12.345);
});

test('Dezimalpunkt bleibt Dezimalpunkt, wo keine Tausendergruppe passt', () => {
  assert.equal(leseZahl('1234.56'), 1234.56);
  assert.equal(leseZahl('0.75'), 0.75);
  assert.equal(leseZahl('0.750'), 0.75);      // fuehrende Null: kein Tausender
  assert.equal(leseZahl('.5'), 0.5);
  assert.equal(leseZahl('1234.567'), 1234.567); // vier Vorstellen: kein Tausender
});

test('Leerzeichen und Schweizer Apostroph', () => {
  assert.equal(leseZahl('1 234,56'), 1234.56);
  assert.equal(leseZahl('1 234,56'), 1234.56);
  assert.equal(leseZahl("1'234.56"), 1234.56);
  assert.equal(leseZahl('  42  '), 42);
});

// ---------------------------------------------------------------------------
// Vorzeichen
// ---------------------------------------------------------------------------

test('negative Zahlen in allen drei Schreibweisen', () => {
  assert.equal(leseZahl('-1.234,56'), -1234.56);
  assert.equal(leseZahl('1.234,56-'), -1234.56);   // DATEV, SAP
  assert.equal(leseZahl('(1.234,56)'), -1234.56);  // Buchhaltung
  assert.equal(leseZahl('-0,01'), -0.01);
  assert.equal(leseZahl('+42'), 42);
  assert.equal(leseZahl('-5,00 EUR'), -5);
});

test('doppelte oder innenliegende Minuszeichen werden abgelehnt', () => {
  assert.equal(leseZahl('--5'), null);
  assert.equal(leseZahl('1-2'), null);
  assert.equal(leseZahl('-'), null);
});

// ---------------------------------------------------------------------------
// Ablehnung statt stiller Null
// ---------------------------------------------------------------------------

test('Leeres und Unsinniges ergibt null, nicht 0', () => {
  assert.equal(leseZahl(''), null);
  assert.equal(leseZahl('   '), null);
  assert.equal(leseZahl(null), null);
  assert.equal(leseZahl(undefined), null);
  assert.equal(leseZahl({}), null);
  assert.equal(leseZahl([]), null);
  assert.equal(leseZahl(true), null);
  assert.equal(leseZahl('abc'), null);
  assert.equal(leseZahl('EUR'), null);
  assert.equal(leseZahl(','), null);
  assert.equal(leseZahl('.'), null);
  assert.equal(leseZahl('1,2,3'), null);
  assert.equal(leseZahl('1.2.3'), null);
  assert.equal(leseZahl('1,23,456'), null);
});

test('NaN und Unendlich sind keine Zahlen', () => {
  assert.equal(leseZahl(NaN), null);
  assert.equal(leseZahl(Infinity), null);
  assert.equal(leseZahl(-Infinity), null);
  assert.equal(leseZahl('NaN'), null);
  assert.equal(leseZahl('Infinity'), null);
});

test('echte Zahlen werden durchgereicht', () => {
  assert.equal(leseZahl(42), 42);
  assert.equal(leseZahl(-0.5), -0.5);
  assert.equal(leseZahl(0), 0);
  assert.equal(leseZahl(10n), 10);
});

test('leseZahlOder liefert den Standardwert statt null', () => {
  assert.equal(leseZahlOder('8,20 x'), 0);
  assert.equal(leseZahlOder('', 7), 7);
  assert.equal(leseZahlOder('1.234,56', 7), 1234.56);
  assert.equal(leseZahlOder(null, -1), -1);
});

// ---------------------------------------------------------------------------
// Bekanntes Format (Import)
// ---------------------------------------------------------------------------

test('leseZahlMitTrenner loest die 12,345-Mehrdeutigkeit auf', () => {
  assert.equal(leseZahlMitTrenner('12,345', '.'), 12345);
  assert.equal(leseZahlMitTrenner('12,345', ','), 12.345);
  assert.equal(leseZahlMitTrenner('1,234,567.89', '.'), 1234567.89);
  assert.equal(leseZahlMitTrenner('1.234.567,89', ','), 1234567.89);
  assert.equal(leseZahlMitTrenner('-1,234.50', '.'), -1234.5);
});

test('leseZahlMitTrenner lehnt zwei Dezimaltrenner ab', () => {
  assert.equal(leseZahlMitTrenner('1.2.3', ','), null);
  assert.equal(leseZahlMitTrenner('1,2,3', '.'), null);
  assert.equal(leseZahlMitTrenner('abc', ','), null);
});

// ---------------------------------------------------------------------------
// Geld
// ---------------------------------------------------------------------------

test('leseBetrag rundet auf Cent, laesst null aber null', () => {
  assert.equal(leseBetrag('1.234,567'), 1234.57);
  assert.equal(leseBetrag('1.234,564'), 1234.56);
  assert.equal(leseBetrag('8,20 x'), null);
  assert.equal(leseBetrag(''), null);
});

test('centRunden rundet symmetrisch um Null', () => {
  assert.equal(centRunden(2.345), 2.35);
  assert.equal(centRunden(-2.345), -2.35);
  assert.equal(centRunden(0.005), 0.01);
  assert.equal(centRunden(-0.005), -0.01);
  assert.equal(centRunden(1.005), 1.01);   // der klassische Gleitkomma-Fall
  assert.equal(centRunden(0), 0);
  assert.equal(centRunden(NaN), 0);
});

test('istZahlText sagt ehrlich, ob etwas lesbar ist', () => {
  assert.equal(istZahlText('1.234,56'), true);
  assert.equal(istZahlText('8,20 x'), false);
  assert.equal(istZahlText(''), false);
  assert.equal(istZahlText(0), true);
});

// ---------------------------------------------------------------------------
// Runden bleibt verlustfrei bei wiederholter Anwendung
// ---------------------------------------------------------------------------

test('zweimal runden aendert nichts mehr', () => {
  for (const v of [1234.565, -0.005, 19.99, 0.1 + 0.2]) {
    assert.equal(centRunden(centRunden(v)), centRunden(v));
  }
});
