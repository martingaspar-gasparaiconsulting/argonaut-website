// ============================================================================
// tests/aufmassVobP59.test.mjs
//
// PUNKT 59 / R9 — Aufmass: Klammern, Division, Raumbuch
// PUNKT 60 / R10 — VOB/C-Uebermessung und Abzugsflaechen
// Paket 1 (21.09.2026). Beide Dateien rufen noch NIEMANDEN auf.
//
// ▄▄▄ DER BEFUND ▄▄▄
// Ueber alle Dateien nach raumbuch|VOB|uebermess|abzugsfl gesucht: null
// Treffer. Und rechneMenge in aufmassLogik.ts kann bis heute weder Klammern
// noch Division — "(3,50 + 1,20) x 2,40" ist dort eine Fehlermeldung.
//
// ▄▄▄ DIE FEHLER, DIE DIESE TESTS FESTNAGELN ▄▄▄
//  1. Ein Vorzeichen mitten in der Rechnung ("2*-3") als Zahl durchlassen.
//  2. Teilung durch Null zu Infinity werden lassen.
//  3. Eine offene Klammer still schliessen.
//  4. Die VOB-Grenze als FREIBETRAG statt als FREIGRENZE behandeln.
//  5. Die Grenze auf die SUMME statt auf die EINZELoeffnung anwenden.
//  6. Eine Zahl fuer alle Gewerke nehmen.
//  7. Gegenueber einem VERBRAUCHER uebermessen — der teuerste Fehler,
//     und der einzige, der in keiner DIN steht.
//  8. Die Laibungsflaechen stillschweigend auf die Wandflaeche addieren.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rechneFormel, runde3, leseZahl, formelFehler,
  MAX_ZEICHEN, FORMEL_BEISPIELE,
} from '../out/aufmassFormel.js';

import {
  beurteileOeffnung, flaechenAufmass, laengenAufmass,
  oeffnungsflaeche, laibungsflaeche,
  raumMasse, raumAufmass, raumbuch,
  gewerkRegel, gewerkName, ungepruefteGewerke,
  GEWERKE, ALLGEMEIN, BETON_RAUMMASS, BGB_FUNDSTELLE,
} from '../out/aufmassVob.js';

// ===========================================================================
// TEIL 1 — DER PARSER BLEIBT RUECKWAERTSKOMPATIBEL
// Alles hier steht so schon in tests/aufmassRechnen.test.mjs. Wenn eine
// dieser Zeilen bricht, ist das Anschliessen eine Verhaltensaenderung —
// und die kommt nur mit Ansage.
// ===========================================================================

test('die acht abgebrochenen Formeln vom 16.09. bleiben Fehler, keine Zahl', () => {
  const kaputt = ['8,20 x', '2*', '2**3', '2*-3', '3 x', 'x 4', '5 +', '2 × × 3'];
  for (const e of kaputt) {
    const r = rechneFormel(e);
    assert.equal(r.menge, null, JSON.stringify(e) + ' ergibt die Menge ' + r.menge);
    assert.ok(r.fehler, JSON.stringify(e) + ' meldet keinen Fehler');
  }
});

test('der gemeldete Fall: "8,20 x" ergibt nicht 8,20', () => {
  const r = rechneFormel('8,20 x');
  assert.notEqual(r.menge, 8.2);
  assert.equal(r.menge, null);
});

test('FEHLER 1 — "2*-3" ist ein Tippfehler, nicht minus sechs', () => {
  const r = rechneFormel('2*-3');
  assert.equal(r.menge, null, 'ein negativer Faktor darf keine Menge ergeben');
  assert.notEqual(r.menge, -6, 'ein vollstaendiger Parser wuerde hier -6 rechnen — genau das nicht');
  assert.notEqual(r.menge, -1, 'und der alte Zerschneider rechnete -1');
  assert.match(r.fehler, /Vorzeichen/);
});

test('richtige Formeln rechnen unveraendert weiter', () => {
  const gut = [
    ['12', 12], ['3,5', 3.5], ['3 x 4', 12], ['10 x 2 x 1,5', 30],
    ['2,5 x 1,2 + 3', 6], ['5 + 3 - 2', 6], ['2 × 3', 6], ['4*2,5', 10],
    ['8,20 x 5,77', 47.314], ['12 - 1,5', 10.5], ['7', 7],
  ];
  for (const [e, erwartet] of gut) {
    const r = rechneFormel(e);
    assert.equal(r.fehler, null, JSON.stringify(e) + ' meldet: ' + r.fehler);
    assert.equal(r.menge, erwartet, JSON.stringify(e));
  }
});

test('leere Eingabe bleibt eine eigene, freundliche Meldung', () => {
  const r = rechneFormel('');
  assert.equal(r.menge, null);
  assert.match(r.fehler, /Menge eingeben/);
});

test('eine Formel liefert nie gleichzeitig Menge und Fehler', () => {
  for (const e of ['8,20 x', '3 x 4', '', 'abc', '2**3', '7', '(2+3)*4', '12/0']) {
    const r = rechneFormel(e);
    assert.ok((r.menge === null) !== (r.fehler === null), JSON.stringify(e) + ': ' + JSON.stringify(r));
  }
});

test('der Rechenweg sieht aus wie bisher — eine reine Zahl traegt keinen', () => {
  assert.equal(rechneFormel('47,31').rechenweg, null);
  assert.equal(rechneFormel('-5').rechenweg, null, 'ein fuehrendes Minus ist auch nur eine Zahl');
  assert.equal(rechneFormel('8,20 x 5,77').rechenweg, '8,20 × 5,77');
  assert.equal(rechneFormel('2,5 x 1,2 + 3').rechenweg, '2,5 × 1,2 + 3');
  assert.equal(rechneFormel('5 + 3 - 2').rechenweg, '5 + 3 − 2');
});

// ===========================================================================
// TEIL 2 — WAS NEU DAZUKOMMT: KLAMMERN
// ===========================================================================

test('Klammern: zwei Wandabschnitte mal Hoehe', () => {
  const r = rechneFormel('(3,50 + 1,20) x 2,40');
  assert.equal(r.fehler, null);
  assert.equal(r.menge, 11.28);
  assert.equal(r.rechenweg, '(3,50 + 1,20) × 2,40');
});

test('Klammern aendern das Ergebnis — Punkt vor Strich bleibt sonst bestehen', () => {
  assert.equal(rechneFormel('2 + 3 x 4').menge, 14);
  assert.equal(rechneFormel('(2 + 3) x 4').menge, 20);
});

test('Klammern lassen sich schachteln', () => {
  assert.equal(rechneFormel('((2 + 3) x 2 - 4) x 1,5').menge, 9);
});

test('eckige Klammern gelten genauso — die tippt mancher schneller', () => {
  assert.equal(rechneFormel('[2 + 3] x 4').menge, 20);
});

test('FEHLER 3 — eine offene Klammer wird gemeldet, nicht still geschlossen', () => {
  const r = rechneFormel('(3,50 + 1,20 x 2,40');
  assert.equal(r.menge, null);
  assert.match(r.fehler, /Klammer/);
});

test('eine Klammer zu viel am Ende ist auch ein Fehler', () => {
  const r = rechneFormel('3 + 1)');
  assert.equal(r.menge, null);
  assert.match(r.fehler, /Klammer/);
});

test('eine leere Klammer ist keine Zahl', () => {
  assert.equal(rechneFormel('() x 3').menge, null);
  assert.equal(rechneFormel('2 x ()').menge, null);
});

// ===========================================================================
// TEIL 3 — WAS NEU DAZUKOMMT: DIVISION
// ===========================================================================

test('Division: eine Flaeche auf vier Bahnen geteilt', () => {
  const r = rechneFormel('24 / 4');
  assert.equal(r.menge, 6);
  assert.equal(r.rechenweg, '24 / 4');
});

test('der Doppelpunkt gilt genauso', () => {
  assert.equal(rechneFormel('24 : 4').menge, 6);
});

test('Punkt vor Strich gilt auch fuer die Division', () => {
  assert.equal(rechneFormel('12 + 24 / 4').menge, 18);
  assert.equal(rechneFormel('(12 + 24) / 4').menge, 9);
});

test('Mal und Geteilt werden von links nach rechts gerechnet', () => {
  assert.equal(rechneFormel('12 / 4 x 3').menge, 9, '12/4=3, mal 3 = 9 — nicht 12/(4*3)=1');
  assert.equal(rechneFormel('12 x 4 / 3').menge, 16);
});

test('FEHLER 2 — Teilung durch Null ergibt keine Menge, sondern eine Meldung', () => {
  for (const e of ['12 / 0', '12 : 0', '12 / 0,0', '5 / (3 - 3)']) {
    const r = rechneFormel(e);
    assert.equal(r.menge, null, JSON.stringify(e) + ' ergibt ' + r.menge);
    assert.notEqual(r.menge, Infinity);
    assert.match(r.fehler, /Null/, JSON.stringify(e));
  }
});

test('eine Division mit krummem Ergebnis wird auf drei Stellen gerundet', () => {
  assert.equal(rechneFormel('10 / 3').menge, 3.333);
  assert.equal(rechneFormel('2 / 3').menge, 0.667);
});

// ===========================================================================
// TEIL 4 — RUNDEN, MIT ECHTEM GRENZFALL
// Lehre vom 21.09.: ein Rundungstest ohne echten .xxx5-Fall beweist nichts.
// Die Werte hier wurden per Skript gesucht, nicht geraten.
// ===========================================================================

test('runde3 rundet symmetrisch um Null — mit einem echten Grenzfall', () => {
  // 0,75 x 0,75 = 0,5625 ist eine quadratische Revisionsklappe 75 x 75 cm.
  // Math.round allein macht daraus als Abzug -0,562 statt -0,563.
  assert.equal(runde3(0.5625), 0.563);
  assert.equal(runde3(-0.5625), -0.563, 'Math.round wuerde hier -0.562 liefern');
  assert.equal(runde3(0.8925), 0.893);
  assert.equal(runde3(-0.8925), -0.893);
  assert.equal(runde3(0.5225), 0.523);
  assert.equal(runde3(-0.5225), -0.523);
});

test('der Grenzfall kommt auch durch die Formel hindurch an', () => {
  // Eine Klappe als Abzugsmenge, wie sie im Aufmassfeld stehen wuerde.
  assert.equal(rechneFormel('0 - 0,75 x 0,75').menge, -0.563);
  assert.equal(rechneFormel('0,75 x 0,75').menge, 0.563);
});

test('EHRLICH: Gleitkomma verfehlt den Grenzfall oft von selbst', () => {
  // 99,995 - 100 ist -0,004999999999995, nicht -0,005. Da rundet JEDE
  // Fassung auf -0,005 bzw. -0,005. Der Test haelt fest, dass das kein
  // Fehler ist, damit es spaeter niemand dafuer haelt.
  const roh = 99.995 - 100;
  assert.ok(roh > -0.005, 'der Wert liegt knapp ueber dem halben Schritt: ' + roh);
  assert.equal(runde3(roh), -0.005);
});

test('runde3 haelt unbrauchbare Zahlen auf', () => {
  assert.equal(runde3(NaN), 0);
  assert.equal(runde3(Infinity), 0);
});

// ===========================================================================
// TEIL 5 — ZAHLEN LESEN
// ===========================================================================

test('deutsche Zahlen werden gelesen wie bisher', () => {
  assert.equal(leseZahl('8,20').wert, 8.2);
  assert.equal(leseZahl('1.234,50').wert, 1234.5);
  assert.equal(leseZahl('8.2').wert, 8.2);
  assert.equal(leseZahl('12').wert, 12);
});

test('ein Punkt ohne Komma bleibt ein Dezimaltrenner — wird aber gemeldet', () => {
  const z = leseZahl('1.234');
  assert.equal(z.wert, 1.234, 'das Verhalten aendert sich NICHT — sonst waere es eine stille Mengenaenderung');
  assert.equal(z.mehrdeutig, true);

  const r = rechneFormel('1.234 x 2');
  assert.equal(r.menge, 2.468);
  assert.ok(r.hinweise.some((h) => /Punkt/.test(h)), 'der Hinweis muss stehen');
  assert.equal(r.fehler, null, 'ein Hinweis blockiert nichts');
});

test('1.234,50 ist eindeutig und bekommt keinen Hinweis', () => {
  assert.equal(leseZahl('1.234,50').mehrdeutig, false);
  assert.deepEqual(rechneFormel('1.234,50').hinweise, []);
});

test('Unsinn ist keine Zahl', () => {
  assert.equal(leseZahl('1,2,3'), null);
  assert.equal(leseZahl('1.2.3'), null);
  assert.equal(leseZahl(''), null);
  assert.equal(leseZahl('..'), null);
});

test('eine negative Gesamtmenge wird gemeldet, aber nicht verboten', () => {
  const r = rechneFormel('12 - 15');
  assert.equal(r.menge, -3);
  assert.equal(r.fehler, null);
  assert.ok(r.hinweise.some((h) => /negative/.test(h)));
});

test('eine viel zu lange Eingabe wird abgewiesen', () => {
  const lang = '1+'.repeat(MAX_ZEICHEN) + '1';
  const r = rechneFormel(lang);
  assert.equal(r.menge, null);
  assert.match(r.fehler, /zu lang/);
});

test('fremde Zeichen werden benannt, nicht verschluckt', () => {
  const r = rechneFormel('3 m x 4');
  assert.equal(r.menge, null);
  assert.match(r.fehler, /"m"/);
});

test('formelFehler ist die Kurzform fuer die Live-Rueckmeldung im Feld', () => {
  assert.equal(formelFehler('3 x 4'), null);
  assert.ok(formelFehler('3 x'));
});

test('die Beispiele im Hilfefeld rechnen alle wirklich', () => {
  for (const b of FORMEL_BEISPIELE) {
    const r = rechneFormel(b.formel);
    assert.equal(r.fehler, null, b.formel + ' meldet: ' + r.fehler);
    assert.ok(typeof r.menge === 'number', b.formel);
  }
});

// ===========================================================================
// TEIL 6 — VOB/C: DIE FREIGRENZE
// ===========================================================================

const FENSTER_KLEIN = { bezeichnung: 'Fenster Kueche', art: 'oeffnung', breite: 1.2, hoehe: 1.4 };   // 1,68 m²
const FENSTER_GROSS = { bezeichnung: 'Fenster Wohnen', art: 'oeffnung', breite: 1.8, hoehe: 1.5 };   // 2,70 m²

test('Maler: ein Fenster unter der Grenze wird uebermessen', () => {
  const u = beurteileOeffnung(FENSTER_KLEIN, 'maler', 'vob');
  assert.equal(u.einzelflaeche, 1.68);
  assert.equal(u.abziehen, false);
  assert.equal(u.grenze, 2.5);
  assert.match(u.grund, /Übermessen/);
});

test('Maler: ein Fenster ueber der Grenze wird abgezogen', () => {
  const u = beurteileOeffnung(FENSTER_GROSS, 'maler', 'vob');
  assert.equal(u.einzelflaeche, 2.7);
  assert.equal(u.abziehen, true);
  assert.match(u.grund, /Abgezogen/);
});

test('FEHLER 4 — die Grenze ist eine FREIGRENZE, kein Freibetrag', () => {
  // 2,60 m² bei einer Grenze von 2,50: abgezogen werden 2,60, nicht 0,10.
  const u = beurteileOeffnung({ art: 'oeffnung', flaeche: 2.6 }, 'maler', 'vob');
  assert.equal(u.abziehen, true);
  assert.equal(u.gesamtflaeche, 2.6, 'die GANZE Flaeche wird abgezogen');
  assert.notEqual(u.gesamtflaeche, 0.1, 'nur der Teil ueber der Grenze waere ein Freibetrag');

  const f = flaechenAufmass(30, [{ art: 'oeffnung', flaeche: 2.6 }], 'maler', 'vob');
  assert.equal(f.abzug, 2.6);
  assert.equal(f.ergebnis, 27.4);
});

test('genau auf der Grenze wird noch uebermessen', () => {
  assert.equal(beurteileOeffnung({ art: 'oeffnung', flaeche: 2.5 }, 'maler', 'vob').abziehen, false);
  assert.equal(beurteileOeffnung({ art: 'oeffnung', flaeche: 2.501 }, 'maler', 'vob').abziehen, true);
});

test('FEHLER 5 — die Grenze gilt je Einzeloeffnung, nicht fuer die Summe', () => {
  // Drei Fenster zu je 2,00 m² sind zusammen 6,00 m². Wer summiert und dann
  // vergleicht, zieht dem Betrieb 6,00 m² ab, die ihm zustehen.
  const drei = [
    { bezeichnung: 'Fenster 1', art: 'oeffnung', flaeche: 2 },
    { bezeichnung: 'Fenster 2', art: 'oeffnung', flaeche: 2 },
    { bezeichnung: 'Fenster 3', art: 'oeffnung', flaeche: 2 },
  ];
  const f = flaechenAufmass(45, drei, 'maler', 'vob');
  assert.equal(f.abzug, 0, 'keine einzelne liegt ueber 2,50 m²');
  assert.equal(f.uebermessen, 6);
  assert.equal(f.ergebnis, 45);
});

test('dasselbe mit anzahl statt drei Zeilen', () => {
  const f = flaechenAufmass(45, [{ art: 'oeffnung', flaeche: 2, anzahl: 3 }], 'maler', 'vob');
  assert.equal(f.abzug, 0);
  assert.equal(f.uebermessen, 6);
});

// ===========================================================================
// TEIL 7 — FEHLER 6: NICHT EINE ZAHL FUER ALLE GEWERKE
// ===========================================================================

test('Fliesen unterscheiden Wandoeffnung und Aussparung — zwei verschiedene Grenzen', () => {
  const tuer = beurteileOeffnung({ art: 'oeffnung', breite: 0.9, hoehe: 2.1 }, 'fliesen', 'vob');
  assert.equal(tuer.einzelflaeche, 1.89);
  assert.equal(tuer.abziehen, false, 'eine Wohnungstuer liegt unter 2,50 m²');

  const dose = beurteileOeffnung({ art: 'aussparung', breite: 0.4, hoehe: 0.4 }, 'fliesen', 'vob');
  assert.equal(dose.einzelflaeche, 0.16);
  assert.equal(dose.abziehen, true, '0,16 m² liegt ueber der Aussparungsgrenze von 0,10 m²');
  assert.equal(dose.grenze, 0.1);
});

test('dieselbe Aussparung beim Maler wird uebermessen — die Grenze ist eine andere', () => {
  const beimMaler = beurteileOeffnung({ art: 'aussparung', breite: 0.4, hoehe: 0.4 }, 'maler', 'vob');
  assert.equal(beimMaler.abziehen, false, 'Maler hat keine eigene Aussparungsgrenze, es gelten 2,50 m²');
  assert.equal(beimMaler.grenze, 2.5);
});

test('Trockenbau: im Boden gilt 0,50 m², an der Wand 2,50 m²', () => {
  const wand = beurteileOeffnung({ art: 'oeffnung', flaeche: 1.0 }, 'trockenbau', 'vob');
  assert.equal(wand.abziehen, false);
  assert.equal(wand.grenze, 2.5);

  const boden = beurteileOeffnung({ art: 'oeffnung', flaeche: 1.0, imBoden: true }, 'trockenbau', 'vob');
  assert.equal(boden.abziehen, true, '1,00 m² liegt ueber der Bodengrenze von 0,50 m²');
  assert.equal(boden.grenze, 0.5);
});

test('beim Maler gibt es keine eigene Bodengrenze — dort gelten weiter 2,50 m²', () => {
  const boden = beurteileOeffnung({ art: 'oeffnung', flaeche: 1.0, imBoden: true }, 'maler', 'vob');
  assert.equal(boden.grenze, 2.5);
  assert.equal(boden.abziehen, false);
});

test('ein Gewerk ohne geregelte Oeffnungsgrenze zieht ab und sagt es', () => {
  // Estrich kennt in der hinterlegten Tabelle keine Oeffnungsgrenze, nur
  // eine Aussparungsgrenze. Ohne belegte Grenze wird NICHT uebermessen.
  const u = beurteileOeffnung({ art: 'oeffnung', flaeche: 0.3 }, 'estrich', 'vob');
  assert.equal(u.abziehen, true);
  assert.equal(u.grenze, null);
  assert.equal(u.pruefen, true);
});

test('ein unbekanntes Gewerk uebermisst nie', () => {
  const u = beurteileOeffnung({ art: 'oeffnung', flaeche: 0.1 }, 'gibtsnicht', 'vob');
  assert.equal(u.abziehen, true);
  assert.equal(u.pruefen, true);
});

// ===========================================================================
// TEIL 8 — FEHLER 7: DER VERBRAUCHER
// Der teuerste Fall, und der einzige, der in keiner DIN steht.
// ===========================================================================

test('FEHLER 7 — ohne vereinbarte VOB/C wird jede Oeffnung abgezogen', () => {
  const u = beurteileOeffnung(FENSTER_KLEIN, 'maler', 'bgb');
  assert.equal(u.abziehen, true, 'gegenueber einem Verbraucher gibt es keine Uebermessung');
  assert.equal(u.grenze, null);
  assert.match(u.grund, /OLG Stuttgart/);
});

test('die Fundstelle steht im Klartext, nicht nur im Kommentar', () => {
  assert.match(BGB_FUNDSTELLE, /OLG Stuttgart/);
  assert.match(BGB_FUNDSTELLE, /2 U 84\/07/);
  const u = beurteileOeffnung(FENSTER_KLEIN, 'maler', 'bgb');
  assert.ok(u.grund.includes(BGB_FUNDSTELLE));
});

test('GEMESSEN: derselbe Raum, einmal VOB und einmal BGB', () => {
  // Wohnzimmer 5,00 x 4,00 x 2,50 m, vier Fenster zu je 1,68 m².
  const vierFenster = [{ art: 'oeffnung', flaeche: 1.68, anzahl: 4 }];
  const nachVob = flaechenAufmass(45, vierFenster, 'maler', 'vob');
  const nachBgb = flaechenAufmass(45, vierFenster, 'maler', 'bgb');

  assert.equal(nachVob.ergebnis, 45, 'nach VOB/C bleiben alle vier drin');
  assert.equal(nachBgb.ergebnis, 38.28, 'nach BGB werden 6,72 m² abgezogen');
  assert.equal(Math.round((nachVob.ergebnis - nachBgb.ergebnis) * 1000) / 1000, 6.72);
  // Bei 12,00 EUR je m² sind das 80,64 EUR Unterschied an EINER Wand.
});

test('auch im Laengenmass gibt es ohne VOB/C keine Uebermessung', () => {
  const l = laengenAufmass(18, [{ bezeichnung: 'Tuerzarge', laenge: 0.9 }], 'bgb');
  assert.equal(l.abzug, 0.9);
  assert.equal(l.ergebnis, 17.1);
  assert.match(l.urteile[0].grund, /OLG Stuttgart/);
});

// ===========================================================================
// TEIL 9 — NISCHEN, UNTERBRECHUNGEN, LAENGENMASS
// ===========================================================================

test('eine Nische wird unabhaengig von ihrer Groesse gesondert gerechnet', () => {
  const klein = beurteileOeffnung({ art: 'nische', flaeche: 0.2 }, 'maler', 'vob');
  assert.equal(klein.abziehen, true, 'auch eine winzige Nische wird nicht uebermessen');
  assert.equal(klein.laibungGesondert, true);
});

test('ein stabfoermiges Bauteil bis 30 cm Breite wird uebermessen', () => {
  const schmal = beurteileOeffnung({ art: 'unterbrechung', breite: 0.25 }, 'maler', 'vob');
  assert.equal(schmal.abziehen, false);
  assert.equal(schmal.grenze, ALLGEMEIN.unterbrechungBreiteBisM);
  assert.equal(schmal.grenzeEinheit, 'm');

  const breit = beurteileOeffnung({ art: 'unterbrechung', breite: 0.4 }, 'maler', 'vob');
  assert.equal(breit.abziehen, true);
});

test('genau 30 cm werden noch uebermessen', () => {
  assert.equal(beurteileOeffnung({ art: 'unterbrechung', breite: 0.3 }, 'maler', 'vob').abziehen, false);
  assert.equal(beurteileOeffnung({ art: 'unterbrechung', breite: 0.301 }, 'maler', 'vob').abziehen, true);
});

test('Sockelleiste: eine Tuerzarge bleibt drin, eine Terrassentuer nicht', () => {
  const l = laengenAufmass(18, [
    { bezeichnung: 'Zimmertuer', laenge: 0.9 },
    { bezeichnung: 'Terrassentuer', laenge: 2.4 },
  ], 'vob');
  assert.equal(l.uebermessen, 0.9);
  assert.equal(l.abzug, 2.4);
  assert.equal(l.ergebnis, 15.6);
});

test('genau 1,00 m Unterbrechung wird noch uebermessen', () => {
  assert.equal(laengenAufmass(10, [{ laenge: 1.0 }], 'vob').abzug, 0);
  assert.equal(laengenAufmass(10, [{ laenge: 1.001 }], 'vob').abzug, 1.001);
});

// ===========================================================================
// TEIL 10 — FEHLER 8: DIE LAIBUNGEN
// ===========================================================================

test('Laibungen werden nur gerechnet, wenn die Oeffnung ABGEZOGEN wurde', () => {
  const ohneAbzug = beurteileOeffnung(
    { ...FENSTER_KLEIN, laibungstiefe: 0.25 }, 'maler', 'vob');
  assert.equal(ohneAbzug.abziehen, false);
  assert.equal(ohneAbzug.laibungsflaeche, 0, 'wer uebermisst, bekommt die Laibung nicht zusaetzlich');

  const mitAbzug = beurteileOeffnung(
    { ...FENSTER_GROSS, laibungstiefe: 0.25 }, 'maler', 'vob');
  assert.equal(mitAbzug.abziehen, true);
  // Umfang 2 x (1,80 + 1,50) = 6,60 m, mal 0,25 m Tiefe = 1,65 m²
  assert.equal(mitAbzug.laibungsflaeche, 1.65);
});

test('eine Tuer hat drei Laibungsseiten, ein Fenster vier', () => {
  const fenster = laibungsflaeche({ art: 'oeffnung', breite: 1.8, hoehe: 1.5, laibungstiefe: 0.25 });
  assert.equal(fenster, 1.65);
  const tuer = laibungsflaeche({ art: 'oeffnung', breite: 1.8, hoehe: 1.5, laibungstiefe: 0.25, laibungSeiten: 3 });
  // 1,80 + 2 x 1,50 = 4,80 m, mal 0,25 = 1,20 m²
  assert.equal(tuer, 1.2);
});

test('FEHLER 8 — die Laibungen landen NICHT im Flaechenergebnis', () => {
  const f = flaechenAufmass(45, [{ ...FENSTER_GROSS, laibungstiefe: 0.25 }], 'maler', 'vob');
  assert.equal(f.abzug, 2.7);
  assert.equal(f.ergebnis, 42.3, '45 minus 2,70 — die Laibung ist nicht dazuaddiert');
  assert.equal(f.laibungen, 1.65, 'sie steht als eigene Groesse daneben');
  assert.match(f.klartext, /eigene Position/);
});

test('ohne Laibungstiefe gibt es keine erfundene Laibungsflaeche', () => {
  const u = beurteileOeffnung(FENSTER_GROSS, 'maler', 'vob');
  assert.equal(u.laibungGesondert, true);
  assert.equal(u.laibungsflaeche, 0, 'null statt einer geschaetzten Tiefe');
});

// ===========================================================================
// TEIL 11 — EHRLICHKEIT DER TABELLE
// ===========================================================================

test('jedes Gewerk traegt eine Belegstufe und eine Quelle', () => {
  for (const g of GEWERKE) {
    assert.ok(['belegt', 'pruefen'].includes(g.beleg), g.schluessel);
    assert.ok(g.quelle && g.quelle.length > 20, g.schluessel + ' hat keine brauchbare Quelle');
    assert.match(g.atv, /^DIN 18\d{3}$/, g.schluessel);
  }
});

test('die noch zu pruefenden Gewerke sind benannt, nicht versteckt', () => {
  const offen = ungepruefteGewerke().map((g) => g.schluessel);
  assert.ok(offen.includes('fliesen'), 'Fliesen: Quellen widersprechen sich');
  assert.ok(offen.includes('estrich'), 'Estrich: 0,10 gegen 1,00 m²');
  assert.ok(offen.includes('bodenbelag'), 'Bodenbelag: auch die DIN-Nummer ist strittig');
  assert.ok(offen.length >= 3);
});

test('die Maler-Grenze ist belegt, die Bodenbelag-Grenze nicht', () => {
  assert.equal(gewerkRegel('maler').beleg, 'belegt');
  assert.equal(gewerkRegel('bodenbelag').beleg, 'pruefen');
});

test('ein pruefen-Wert wird im Klartext mitgeteilt, nicht verschwiegen', () => {
  const f = flaechenAufmass(20, [{ art: 'aussparung', flaeche: 0.2 }], 'bodenbelag', 'vob');
  assert.equal(f.pruefen, true);
  assert.match(f.klartext, /Normtext/);
});

test('bei belegten Werten steht kein unnoetiger Warnsatz', () => {
  const f = flaechenAufmass(45, [FENSTER_KLEIN], 'maler', 'vob');
  assert.equal(f.pruefen, false);
  assert.ok(!/Normtext/.test(f.klartext));
});

test('Bodenbelag traegt die DIN 18365, nicht die 18356', () => {
  assert.equal(gewerkRegel('bodenbelag').atv, 'DIN 18365');
  assert.match(gewerkRegel('bodenbelag').quelle, /18356/, 'der Irrtum steht als Warnung dabei');
  assert.match(gewerkName('maler'), /DIN 18363/);
});

test('die Betonarbeiten rechnen nach Raummass und sagen das', () => {
  assert.equal(BETON_RAUMMASS.aussparungBisM3, 0.5);
  assert.equal(BETON_RAUMMASS.schlitzBisM3JeMeter, 0.1);
  assert.equal(gewerkRegel('beton').oeffnungBisQm, null, 'Flaechenmass ist dort nicht geregelt');
  assert.match(gewerkRegel('beton').quelle, /m³/);
});

// ===========================================================================
// TEIL 12 — DAS RAUMBUCH
// ===========================================================================

const WOHNZIMMER = {
  name: 'Wohnzimmer',
  laenge: 5, breite: 4, hoehe: 2.5,
  tuerbreitenSumme: 0.9,
  oeffnungen: [
    { bezeichnung: 'Fenster Sued', art: 'oeffnung', breite: 1.2, hoehe: 1.4, anzahl: 2 },
    { bezeichnung: 'Terrassentuer', art: 'oeffnung', breite: 2.0, hoehe: 2.1, laibungstiefe: 0.3, laibungSeiten: 3 },
  ],
};

test('raumMasse rechnet Boden, Decke, Umfang, Wandflaeche und Sockel', () => {
  const m = raumMasse(WOHNZIMMER);
  assert.equal(m.boden, 20);
  assert.equal(m.decke, 20);
  assert.equal(m.umfang, 18);
  assert.equal(m.wandBrutto, 45);
  assert.equal(m.sockelLaenge, 17.1, 'Umfang minus Tuerbreite');
  assert.deepEqual(m.fehlt, []);
});

test('fehlende Masse werden GEMELDET, nicht geschaetzt', () => {
  const m = raumMasse({ name: 'Flur', laenge: 3, breite: 1.2 });
  assert.equal(m.boden, 3.6);
  assert.equal(m.wandBrutto, 0, 'ohne Hoehe keine Wandflaeche');
  assert.ok(m.fehlt.some((f) => /Raumhöhe/.test(f)));
});

test('ein unregelmaessiger Raum darf Flaeche und Umfang direkt tragen', () => {
  const m = raumMasse({ name: 'Erker', bodenflaeche: 12.5, umfang: 15.2, hoehe: 2.4 });
  assert.equal(m.boden, 12.5);
  assert.equal(m.umfang, 15.2);
  assert.equal(m.wandBrutto, 36.48);
  assert.deepEqual(m.fehlt, []);
});

test('das Wandaufmass des Wohnzimmers nach VOB', () => {
  const r = raumAufmass(WOHNZIMMER, 'wand', 'maler', 'vob');
  assert.equal(r.aufmass.roh, 45);
  // 2 x 1,68 = 3,36 uebermessen; Terrassentuer 4,20 m² > 2,50 -> abgezogen
  assert.equal(r.aufmass.uebermessen, 3.36);
  assert.equal(r.aufmass.abzug, 4.2);
  assert.equal(r.aufmass.ergebnis, 40.8);
  // Laibung der Tuer: 2,00 + 2 x 2,10 = 6,20 m, mal 0,30 = 1,86 m²
  assert.equal(r.aufmass.laibungen, 1.86);
});

test('dasselbe Zimmer fuer einen Privatkunden — 3,36 m² weniger', () => {
  const vob = raumAufmass(WOHNZIMMER, 'wand', 'maler', 'vob').aufmass.ergebnis;
  const bgb = raumAufmass(WOHNZIMMER, 'wand', 'maler', 'bgb').aufmass.ergebnis;
  assert.equal(vob, 40.8);
  assert.equal(bgb, 37.44);
  assert.equal(Math.round((vob - bgb) * 100) / 100, 3.36);
});

test('beim Boden und bei der Decke gilt die Bodengrenze', () => {
  const raum = {
    name: 'Technik',
    laenge: 4, breite: 3, hoehe: 2.5,
    oeffnungen: [{ bezeichnung: 'Schacht', art: 'oeffnung', flaeche: 1.0 }],
  };
  const wand = raumAufmass(raum, 'wand', 'trockenbau', 'vob');
  assert.equal(wand.aufmass.abzug, 0, 'an der Wand gelten 2,50 m²');

  const boden = raumAufmass(raum, 'boden', 'trockenbau', 'vob');
  assert.equal(boden.aufmass.roh, 12);
  assert.equal(boden.aufmass.abzug, 1, 'im Boden gelten 0,50 m²');
  assert.equal(boden.aufmass.ergebnis, 11);
});

test('eine Oeffnung, die imBoden selbst mitbringt, wird nicht ueberschrieben', () => {
  const raum = {
    name: 'X', laenge: 4, breite: 3, hoehe: 2.5,
    oeffnungen: [{ art: 'oeffnung', flaeche: 1.0, imBoden: false }],
  };
  const boden = raumAufmass(raum, 'boden', 'trockenbau', 'vob');
  assert.equal(boden.aufmass.urteile[0].grenze, 2.5, 'die eigene Angabe gilt');
});

test('das Raumbuch summiert mehrere Raeume', () => {
  const b = raumbuch([
    WOHNZIMMER,
    { name: 'Schlafen', laenge: 4, breite: 3.5, hoehe: 2.5, oeffnungen: [{ art: 'oeffnung', flaeche: 1.68 }] },
  ], 'wand', 'maler', 'vob');

  assert.equal(b.raeume.length, 2);
  assert.equal(b.roh, 45 + 37.5);
  assert.equal(b.abzug, 4.2);
  assert.equal(b.uebermessen, 3.36 + 1.68);
  assert.equal(b.ergebnis, 40.8 + 37.5);
  assert.deepEqual(b.unvollstaendig, []);
});

test('das Raumbuch meldet Raeume, bei denen Masse fehlen', () => {
  const b = raumbuch([
    WOHNZIMMER,
    { name: 'Abstellraum', laenge: 2, breite: 1.5 },
  ], 'wand', 'maler', 'vob');
  assert.deepEqual(b.unvollstaendig, ['Abstellraum']);
  assert.match(b.klartext, /UNVOLLSTÄNDIG/);
});

test('ein leeres Raumbuch ergibt null, nicht NaN', () => {
  const b = raumbuch([], 'wand', 'maler', 'vob');
  assert.equal(b.ergebnis, 0);
  assert.equal(b.roh, 0);
  assert.equal(b.pruefen, false);
});

// ===========================================================================
// TEIL 13 — WAS NICHT PASSIEREN DARF
// ===========================================================================

test('eine Flaeche wird nie negativ, auch wenn zu viel abgezogen wird', () => {
  const f = flaechenAufmass(2, [{ art: 'oeffnung', flaeche: 5 }], 'maler', 'vob');
  assert.equal(f.abzug, 5);
  assert.equal(f.ergebnis, 0, 'nicht -3');
});

test('eine Oeffnung ohne Masse ist 0 und nicht NaN', () => {
  assert.equal(oeffnungsflaeche({ art: 'oeffnung' }), 0);
  assert.equal(oeffnungsflaeche({ art: 'oeffnung', breite: 1.2 }), 0, 'ohne Hoehe keine Flaeche');
  const f = flaechenAufmass(20, [{ art: 'oeffnung' }], 'maler', 'vob');
  assert.equal(f.ergebnis, 20);
});

test('eine direkt angegebene Flaeche schlaegt Breite mal Hoehe', () => {
  assert.equal(oeffnungsflaeche({ art: 'oeffnung', breite: 1, hoehe: 1, flaeche: 2.2 }), 2.2);
});

test('anzahl 0 laesst die Oeffnung verschwinden, statt sie einmal zu rechnen', () => {
  const u = beurteileOeffnung({ art: 'oeffnung', flaeche: 3, anzahl: 0 }, 'maler', 'vob');
  assert.equal(u.gesamtflaeche, 0);
});

test('jedes Urteil traegt einen Grund im Klartext', () => {
  const faelle = [
    [FENSTER_KLEIN, 'maler', 'vob'],
    [FENSTER_GROSS, 'maler', 'vob'],
    [FENSTER_KLEIN, 'maler', 'bgb'],
    [{ art: 'nische', flaeche: 0.3 }, 'putz', 'vob'],
    [{ art: 'unterbrechung', breite: 0.5 }, 'putz', 'vob'],
    [{ art: 'aussparung', flaeche: 0.05 }, 'fliesen', 'vob'],
  ];
  for (const [o, g, v] of faelle) {
    const u = beurteileOeffnung(o, g, v);
    assert.ok(u.grund && u.grund.length > 20, JSON.stringify([g, v, o]));
    assert.ok(/Übermessen|Abgezogen/.test(u.grund), u.grund);
  }
});
