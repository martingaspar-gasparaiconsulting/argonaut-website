// ============================================================================
// tests/geldSchichtP27.test.mjs
//
// PUNKT 27 (R1) — Tests fuer die Geld-Schicht, Paket 1:
//   app/dashboard/_components/steuerLogik.ts   (Rechnung, Aufmass)
//   app/dashboard/_components/positionsLogik.ts (Auftrag, Lieferschein, Paket)
//
// Beide Dateien sitzen scharf am Geld und hatten bis heute KEINEN Test:
//   steuerLogik    -> rechnungen/[id]/page.tsx Z. 324, aufmassLogik.ts Z. 268
//   positionsLogik -> auftragLogik.ts Z. 260, paketLogik.ts Z. 155 + 158
//
// Alle Befunde wurden am 20.09.2026 am echten Code gemessen, nicht uebernommen.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  steuerGruppen, cent as steuerCent, weichtAb, satzText,
} from '../out/steuerLogik.js';
import {
  cent, preisGenau, berechnePosition, summiere, verteileFixpreis,
  nummeriere, verschiebe, positionKlartext, steuerAusweisZeilen, eur,
} from '../out/positionsLogik.js';

// ---------------------------------------------------------------------------
// Hilfe
// ---------------------------------------------------------------------------

/** Eine gueltige Position mit sinnvollen Vorgaben. */
function pos(ueber = {}) {
  return {
    art: 'freitext',
    bezeichnung: 'Leistung',
    menge: 1,
    einheit: 'Stk',
    einzelpreis_netto: 100,
    steuersatz_prozent: 19,
    ...ueber,
  };
}

// ===========================================================================
// TEIL 1 — steuerLogik: die Rechenregel nach § 14 Abs. 4 Nr. 7 + 8 UStG
// ===========================================================================

test('Steuer wird auf die GRUPPENSUMME gerechnet, nicht je Position', () => {
  // 3 x 33,33 EUR zu 7 %:
  //   je Position:  3 x 2,33 = 6,99
  //   Gruppensumme: 99,99 x 7 % = 7,00     <- so ist es richtig
  const s = steuerGruppen([
    { netto: 33.33, satz: 7 },
    { netto: 33.33, satz: 7 },
    { netto: 33.33, satz: 7 },
  ]);
  assert.equal(s.netto, 99.99);
  assert.equal(s.steuer, 7.0, 'je Position gerechnet waeren es 6,99 EUR');
  assert.equal(s.brutto, 106.99);
});

test('mehrere Steuersaetze werden getrennt ausgewiesen, nie gemittelt', () => {
  const s = steuerGruppen([
    { netto: 100, satz: 19 },
    { netto: 100, satz: 7 },
  ]);
  assert.equal(s.gruppen.length, 2);
  assert.equal(s.gruppen[0].satz, 7, 'aufsteigend sortiert');
  assert.equal(s.gruppen[0].steuer, 7);
  assert.equal(s.gruppen[1].satz, 19);
  assert.equal(s.gruppen[1].steuer, 19);
  assert.equal(s.steuer, 26);
});

test('eine steuerfreie Position mit echtem Betrag bleibt sichtbar (§ 4 UStG)', () => {
  const s = steuerGruppen([{ netto: 5000, satz: 0 }]);
  assert.equal(s.gruppen.length, 1);
  assert.equal(s.gruppen[0].satz, 0);
  assert.equal(s.gruppen[0].netto, 5000);
  assert.equal(s.steuer, 0);
  assert.equal(s.unlesbar, 0, 'eine ausdrueckliche 0 ist kein unlesbarer Wert');
});

test('eine Position ueber 0,00 EUR erzeugt keine leere Steuerzeile', () => {
  const s = steuerGruppen([{ netto: 0, satz: 19 }, { netto: 100, satz: 19 }]);
  assert.equal(s.gruppen.length, 1);
  assert.equal(s.netto, 100);
});

// --- DER BEFUND: Bauart A verschluckte deutsche Betraege -------------------

test('BEFUND: "1.234,56" wurde 0 und die Position fiel aus der Rechnung', () => {
  const s = steuerGruppen([{ netto: '1.234,56', satz: 19 }]);
  assert.equal(s.netto, 1234.56, 'der alte Leser machte daraus 0,00 EUR');
  assert.equal(s.steuer, 234.57);
  assert.equal(s.unlesbar, 0);
});

test('BEFUND: der Steuersatz als Text wird gelesen, nicht zu 0 %', () => {
  const s = steuerGruppen([{ netto: 1000, satz: '19 %' }]);
  assert.equal(s.steuer, 190, 'ein Satz, der zu 0 wird, laesst 190 EUR USt verschwinden');
});

test('eine Gutschrift dreht das Vorzeichen mit, in Netto UND Steuer', () => {
  const s = steuerGruppen([
    { netto: 10000, satz: 19 },
    { netto: -1000, satz: 19 },
  ]);
  assert.equal(s.netto, 9000);
  assert.equal(s.steuer, 1710, 'ohne Gutschrift waeren es 1.900 EUR — 190 EUR zu viel');
});

// --- DER BEFUND: unlesbare Werte wurden still zu 0 -------------------------

test('BEFUND: ein unlesbarer Betrag wird gemeldet statt still verschluckt', () => {
  const s = steuerGruppen([{ netto: 100, satz: 19 }, { netto: 'siehe Anlage', satz: 19 }]);
  assert.equal(s.unlesbar, 1);
  assert.equal(s.hinweise.length, 1);
  assert.match(s.hinweise[0], /Position 2/);
  assert.match(s.hinweise[0], /nicht lesbar/);
  assert.equal(s.netto, 100, 'der lesbare Teil rechnet unveraendert weiter');
});

test('BEFUND: ein unlesbarer Steuersatz laesst den BETRAG stehen', () => {
  // Wichtig: die Summe darf NICHT schrumpfen. Sonst waere die Reparatur
  // schlimmer als der Fehler — eine Rechnung ueber 1.000 EUR wuerde
  // stillschweigend zu einer Rechnung ueber 0,00 EUR.
  const s = steuerGruppen([{ netto: 1000, satz: null }]);
  assert.equal(s.netto, 1000, 'der Betrag darf nicht verschwinden');
  assert.equal(s.steuer, 0);
  assert.equal(s.unlesbar, 1);
  assert.match(s.hinweise[0], /Steuersatz ist nicht lesbar/);
  assert.match(s.hinweise[0], /nachtragen/);
});

test('eine saubere Aufstellung meldet gar keine Hinweise', () => {
  const s = steuerGruppen([{ netto: 100, satz: 19 }, { netto: 50, satz: 7 }]);
  assert.equal(s.unlesbar, 0);
  assert.deepEqual(s.hinweise, []);
});

// --- Rundung ---------------------------------------------------------------

test('steuerLogik.cent rundet symmetrisch um Null', () => {
  assert.equal(steuerCent(2.345), 2.35);
  assert.equal(steuerCent(-2.345), -2.35, 'eine Gutschrift darf nicht anders runden');
  assert.equal(steuerCent(0), 0);
});

test('weichtAb: ein unlesbarer gespeicherter Wert gilt als Abweichung', () => {
  assert.equal(weichtAb(100, 100), false);
  assert.equal(weichtAb('1.234,56', 1234.56), false, 'deutsche Schreibweise stimmt ueberein');
  assert.equal(weichtAb(100, 101), true);
  assert.equal(weichtAb('unbekannt', 100), true, '"kann ich nicht lesen" ist keine Uebereinstimmung');
  assert.equal(weichtAb(0, 0), false);
});

test('satzText bleibt unveraendert lesbar', () => {
  assert.equal(satzText(19), '19');
  assert.equal(satzText(10.7), '10,7');
});

// ===========================================================================
// TEIL 2 — positionsLogik: eine Position
// ===========================================================================

test('eine gewoehnliche Position rechnet Menge mal Preis', () => {
  const e = berechnePosition(pos({ menge: 8, einzelpreis_netto: 95 }));
  assert.equal(e.ok, true);
  assert.equal(e.grundNetto, 760);
  assert.equal(e.netto, 760);
  assert.deepEqual(e.fehler, []);
});

test('Rabatt mindert das Entgelt VOR der Steuer', () => {
  const e = berechnePosition(pos({ menge: 8, einzelpreis_netto: 95, rabatt_prozent: 5 }));
  assert.equal(e.grundNetto, 760);
  assert.equal(e.rabattBetrag, 38);
  assert.equal(e.netto, 722);
});

test('fehlende Bezeichnung, Menge 0 und negativer Preis sind Fehler', () => {
  assert.equal(berechnePosition(pos({ bezeichnung: '  ' })).ok, false);
  assert.equal(berechnePosition(pos({ menge: 0 })).ok, false);
  assert.equal(berechnePosition(pos({ einzelpreis_netto: -1 })).ok, false);
  assert.equal(berechnePosition(pos({ steuersatz_prozent: 120 })).ok, false);
  assert.equal(berechnePosition(pos({ rabatt_prozent: 101 })).ok, false);
});

test('eine negative Menge ist ein Hinweis, kein Fehler — das ist eine Gutschrift', () => {
  const e = berechnePosition(pos({ menge: -2, einzelpreis_netto: 50 }));
  assert.equal(e.ok, true);
  assert.equal(e.netto, -100);
  assert.ok(e.hinweise.some((h) => /Gutschrift/.test(h)));
});

// --- DER BEFUND: cent() rundete nicht symmetrisch --------------------------

test('BEFUND: cent rundet symmetrisch um Null', () => {
  assert.equal(cent(2.345), 2.35);
  assert.equal(cent(-2.345), -2.35, 'Math.round(-234.5) ist -234 — daher kam der Fehler');
  assert.equal(cent(-0.005), -0.01);
  assert.equal(cent(1.005), 1.01);
});

test('BEFUND: eine Gutschrift verliert keinen halben Cent mehr', () => {
  const e = berechnePosition(pos({ menge: -1, einzelpreis_netto: 2.345 }));
  assert.equal(e.netto, -2.35, 'vorher -2,34 EUR: ein Cent zu wenig gutgeschrieben');
});

test('BEFUND: preisGenau rundet ebenfalls symmetrisch', () => {
  assert.equal(preisGenau(1.23455), 1.2346);
  assert.equal(preisGenau(-1.23455), -1.2346);
});

// --- DER BEFUND: deutsche Zahlen galten als ungueltig ----------------------

test('BEFUND: "1.234,56" aus einem Formularfeld wird gerechnet, nicht verworfen', () => {
  const e = berechnePosition(pos({ menge: 1, einzelpreis_netto: '1.234,56' }));
  assert.equal(e.ok, true, 'vorher: "Der Einzelpreis ist keine gueltige Zahl"');
  assert.equal(e.netto, 1234.56);
});

test('BEFUND: auch die Menge darf deutsch geschrieben sein', () => {
  const e = berechnePosition(pos({ menge: '1.500', einzelpreis_netto: 2 }));
  assert.equal(e.ok, true);
  assert.equal(e.netto, 3000, '"1.500" ist eintausendfuenfhundert, nicht 1,5');
});

test('echter Unsinn bleibt ein Fehler — es wird nichts geraten', () => {
  const e = berechnePosition(pos({ einzelpreis_netto: '8,20 x' }));
  assert.equal(e.ok, false);
  assert.ok(e.fehler.some((f) => /Einzelpreis/.test(f)));
});

// ===========================================================================
// TEIL 3 — positionsLogik: die Summe
// ===========================================================================

test('die Summe weist die Steuer je Gruppe aus und rundet einmal', () => {
  const s = summiere([
    pos({ menge: 3, einzelpreis_netto: 33.33, steuersatz_prozent: 7 }),
    pos({ menge: 1, einzelpreis_netto: 100, steuersatz_prozent: 19 }),
  ]);
  assert.equal(s.ok, true);
  assert.equal(s.gruppen.length, 2);
  assert.equal(s.gruppen[0].steuerBetrag, 7.0, '99,99 x 7 % = 7,00');
  assert.equal(s.netto, 199.99);
  assert.equal(s.steuerBetrag, 26.0);
  assert.equal(s.brutto, 225.99);
});

test('netto plus Steuer ergibt immer genau das Brutto', () => {
  for (const preis of [33.33, 0.01, 1234.56, 99.995]) {
    const s = summiere([pos({ menge: 3, einzelpreis_netto: preis, steuersatz_prozent: 19 })]);
    assert.equal(cent(s.netto + s.steuerBetrag), s.brutto, 'Preis ' + preis);
  }
});

test('eine fehlerhafte Position macht die ganze Summe ungueltig', () => {
  const s = summiere([pos(), pos({ menge: 0 })]);
  assert.equal(s.ok, false, 'sonst zeigt der Beleg eine zu niedrige Summe als gueltig an');
  assert.ok(s.fehler.some((f) => /Position 2/.test(f)));
});

test('eine leere Liste ist nicht "in Ordnung"', () => {
  const s = summiere([]);
  assert.equal(s.ok, false);
  assert.ok(s.hinweise.some((h) => /Keine Positionen/.test(h)));
});

test('der Gesamtrabatt wird mitgefuehrt', () => {
  const s = summiere([pos({ menge: 8, einzelpreis_netto: 95, rabatt_prozent: 5 })]);
  assert.equal(s.rabattGesamt, 38);
  assert.equal(s.netto, 722);
});

// ===========================================================================
// TEIL 4 — positionsLogik: Fixpreis verteilen
// ===========================================================================

test('ein Fixpreis wird anteilig verteilt und trifft den Preis cent-genau', () => {
  const r = verteileFixpreis(
    [pos({ menge: 1, einzelpreis_netto: 200 }), pos({ menge: 1, einzelpreis_netto: 100 })],
    249,
  );
  assert.equal(r.ok, true);
  const s = summiere(r.positionen);
  assert.equal(s.netto, 249, 'die Summe der Zeilen MUSS den Fixpreis treffen');
});

test('der Fixpreis trifft auch bei krummen Mengen und drei Zeilen', () => {
  const r = verteileFixpreis(
    [
      pos({ menge: 3, einzelpreis_netto: 33.33 }),
      pos({ menge: 7, einzelpreis_netto: 12.5 }),
      pos({ menge: 2, einzelpreis_netto: 99.99 }),
    ],
    500,
  );
  assert.equal(r.ok, true);
  assert.equal(summiere(r.positionen).netto, 500);
});

test('gemischte Steuersaetze werden benannt, nicht stillschweigend verteilt', () => {
  const r = verteileFixpreis(
    [pos({ steuersatz_prozent: 19 }), pos({ steuersatz_prozent: 7 })],
    150,
  );
  assert.ok(r.hinweise.some((h) => /Steuerberatung/.test(h)));
});

// --- DER BEFUND: ungueltiger Fixpreis sah aus wie Erfolg -------------------

test('BEFUND: ein Fixpreis von null meldet ok=false statt still den vollen Preis', () => {
  const eingabe = [pos({ einzelpreis_netto: 200 }), pos({ einzelpreis_netto: 100 })];
  const r = verteileFixpreis(eingabe, null);
  assert.equal(r.ok, false, 'ohne dieses Feld gilt das Paket als in Ordnung');
  assert.equal(summiere(r.positionen).netto, 300, 'die Positionen tragen weiter ihre Einzelpreise');
  assert.ok(r.hinweise.some((h) => /KEIN Festpreis/.test(h)));
});

test('BEFUND: ein negativer Fixpreis wird nicht verteilt', () => {
  const r = verteileFixpreis([pos()], -5);
  assert.equal(r.ok, false);
});

test('BEFUND: "12.500,00" als Fixpreis wird jetzt gelesen und verteilt', () => {
  const r = verteileFixpreis(
    [pos({ menge: 1, einzelpreis_netto: 8000 }), pos({ menge: 1, einzelpreis_netto: 4000 })],
    '12.500,00',
  );
  assert.equal(r.ok, true, 'vorher: "Ungueltiger Fixpreis", Paket kostete 12.000 EUR');
  assert.equal(summiere(r.positionen).netto, 12500);
});

test('ohne Einzelpreise wird gleichmaessig geteilt und das gesagt', () => {
  const r = verteileFixpreis(
    [pos({ einzelpreis_netto: 0 }), pos({ einzelpreis_netto: 0 })],
    100,
  );
  assert.equal(r.ok, true);
  assert.ok(r.hinweise.some((h) => /gleichmaessig|gleichmäßig/.test(h)));
  assert.equal(summiere(r.positionen).netto, 100);
});

test('der Fixpreis ersetzt jeden Zeilenrabatt', () => {
  const r = verteileFixpreis([pos({ rabatt_prozent: 20 }), pos({ rabatt_prozent: 10 })], 150);
  for (const p of r.positionen) assert.equal(p.rabatt_prozent, 0, 'der Fixpreis IST der Rabatt');
});

// ===========================================================================
// TEIL 5 — Reihenfolge und Klartext
// ===========================================================================

test('Nummerierung und Verschieben bleiben lueckenlos', () => {
  const liste = nummeriere([pos({ bezeichnung: 'A' }), pos({ bezeichnung: 'B' }), pos({ bezeichnung: 'C' })]);
  assert.deepEqual(liste.map((p) => p.position_nr), [1, 2, 3]);
  const v = verschiebe(liste, 2, 0);
  assert.deepEqual(v.map((p) => p.bezeichnung), ['C', 'A', 'B']);
  assert.deepEqual(v.map((p) => p.position_nr), [1, 2, 3]);
});

test('ein Verschieben ins Leere aendert nichts', () => {
  const liste = nummeriere([pos(), pos()]);
  assert.deepEqual(verschiebe(liste, 0, 0).map((p) => p.position_nr), [1, 2]);
  assert.deepEqual(verschiebe(liste, 5, 0).length, 2);
});

test('der Steuerausweis nennt Satz, Bemessungsgrundlage und Betrag', () => {
  const s = summiere([pos({ menge: 8, einzelpreis_netto: 95, rabatt_prozent: 5 })]);
  const zeilen = steuerAusweisZeilen(s);
  assert.equal(zeilen.length, 1);
  assert.match(zeilen[0], /19 % USt/);
  assert.match(zeilen[0], /722,00/);
  assert.match(zeilen[0], /137,18/);
});

test('BEFUND: der Klartext zeigt einen deutsch geschriebenen Preis richtig an', () => {
  const e = berechnePosition(pos({ menge: '8', einheit: 'SRM', bezeichnung: 'Buche 33 cm', einzelpreis_netto: '1.234,56' }));
  const text = positionKlartext(e);
  assert.match(text, /8,00 SRM/, 'vorher stand hier ein Gedankenstrich');
  assert.match(text, /1\.234,56 €/);
  assert.ok(!text.includes('—'), text);
});

test('eur bleibt bei Unsinn ehrlich leer', () => {
  assert.equal(eur(Number.NaN), '—');
  assert.equal(eur(1234.5), '1.234,50 €');
});
