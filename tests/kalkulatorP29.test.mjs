// ============================================================================
// tests/kalkulatorP29.test.mjs
//
// PUNKT 29c (R2b) — Tests fuer die Branchen-Rechner, Gruppe 3:
//   lib/kalkulator.ts  (Zuschlagskalkulation, Skonto im Hundert)
//
// Diese Datei beantwortet die Frage vor jedem Angebot: "Was kostet mich das
// und was muss ich verlangen?" Der Rechenweg selbst ist richtig gebaut —
// besonders die Skonto-Behandlung, an der sich Handwerker reihenweise
// verrechnen. Genau deshalb wird er hier festgenagelt.
//
// Drei Befunde am 20.09.2026 am echten Code GEMESSEN und repariert.
//
// ABGRENZUNG: kalkulatorLernen liest nur gespeicherte Kalkulationen, also
// die eigenen Schaetzungen — ein selbstbestaetigender Kreis. Das ist Punkt
// 61 (Ausbau: aus Ist-Zeiten lernen, Stundensatz herleiten) und wird hier
// NICHT gebaut.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zahl, cent, euro, inMinuten, postenJeEinheit, rechne, beiWunschpreis,
  pruefeKalkulation, befund, ausVorlage, gewerkDef,
  GEWERKE, ZUSCHLAEGE_STANDARD,
} from '../out/kalkulator.js';

/** Eine Kalkulation mit abschaltbaren Zuschlaegen — damit Zahlen nachrechenbar bleiben. */
function kalk(posten, zuschlaege = {}, menge = 1) {
  return {
    menge, einheit: 'Stk',
    posten: posten.map((p, i) => ({ id: String(i), einheit: 'Stk', ...p })),
    zuschlaege: {
      gemeinkosten_prozent: 0, wagnis_gewinn_prozent: 0,
      skonto_prozent: 0, rabatt_prozent: 0, mwst_satz: 19,
      ...zuschlaege,
    },
  };
}
const M = (preis, ueber = {}) => ({ art: 'material', bezeichnung: 'Material', menge_je_einheit: 1, preis_je_einheit: preis, ...ueber });

// ===========================================================================
// TEIL 1 — DIE BEFUNDE
// ===========================================================================

test('BEFUND: "12.500" wird nicht mehr zu 12,50 EUR', () => {
  // GEMESSEN vorher: der eigene Leser entfernte Tausenderpunkte NUR, wenn
  // auch ein Komma dastand. Ein Materialpreis von 12.500 EUR wurde 12,50 —
  // Faktor 1000 zu niedrig.
  assert.equal(zahl('12.500'), 12500, 'vorher 12,5');
  assert.equal(zahl('1.234'), 1234, 'vorher 1,234');
  assert.equal(zahl('1.234,56'), 1234.56, 'war schon richtig');
  assert.equal(rechne(kalk([M('12.500')])).einzelkosten, 12500);
});

test('BEFUND: ein Preis mit "EUR" wird gelesen, nicht zu 0', () => {
  // Der alte Leser entfernte nur das Zeichen €, nicht die Buchstaben.
  assert.equal(zahl('5,00 EUR'), 5, 'vorher 0');
  assert.equal(zahl('5,00 €'), 5, 'war schon richtig');
});

test('BEFUND: ein Skontosatz als Text fiel ersatzlos weg', () => {
  // GEMESSEN: mit skonto_prozent "3 %" bot ARGONAUT 1.000,00 EUR an statt
  // 1.030,93 — der Betrieb verschenkte die drei Prozent.
  assert.equal(zahl('3 %'), 3, 'vorher 0');
  assert.equal(zahl('7,5 %'), 7.5, 'und NICHT 75');
  const e = rechne(kalk([M(1000)], { skonto_prozent: '3 %' }));
  assert.equal(e.angebotspreis_netto, 1030.93, 'vorher 1.000,00 EUR');
});

test('BEFUND: cent rundet symmetrisch um Null', () => {
  assert.equal(cent(2.675), 2.68);
  assert.equal(cent(-2.675), -2.68, 'vorher -2,67');
  assert.equal(cent(1.005), 1.01);
  assert.equal(cent(-1.005), -1.01, 'vorher -1,00');
});

test('BEFUND: ein negativer Posten rundet wie ein positiver', () => {
  // Erster Entwurf dieses Tests lag daneben: bei beiWunschpreis wird der
  // Preis ZUERST auf Cent gerundet, die Differenz zweier Cent-Werte liegt
  // danach nie mehr auf einer halben Cent-Grenze. Der tragende Fall ist
  // ein negativer Posten — ein Nachlass, der in der Kalkulation steht.
  assert.equal(rechne(kalk([M(-2.675)])).material, -2.68, 'vorher -2,67');
  assert.equal(rechne(kalk([M(2.675)])).material, 2.68, 'und spiegelbildlich dazu');
});

test('BEFUND: die Kostenarten summieren sich auf die Einzelkosten', () => {
  // GEMESSEN vorher: Material 0,01 + Zeit 0,01 stand ueber einer Summe
  // von 0,01. Jede Kostenart wurde einzeln gerundet, die Summe aber aus
  // den ungerundeten Werten gebildet.
  const e = rechne(kalk([
    M(0.005),
    { art: 'zeit', bezeichnung: 'Z', menge_je_einheit: 1, einheit: 'min', preis_je_einheit: 0.005 },
  ]));
  assert.equal(cent(e.material + e.zeit + e.energie + e.fremd), e.einzelkosten,
    'die Anzeige darf sich nicht selbst widersprechen');
  assert.equal(e.einzelkosten, 0.02, 'vorher 0,01 unter zwei Posten zu je 0,01');
});

test('die Kostenarten gehen bei jeder Vorlage auf', () => {
  for (const g of GEWERKE) {
    const k = ausVorlage(g.key, (() => { let i = 0; return () => String(i++); })());
    const e = rechne(k);
    assert.equal(cent(e.material + e.zeit + e.energie + e.fremd), e.einzelkosten, g.key);
  }
});

test('echter Unsinn bleibt 0 — es wird nichts geraten', () => {
  assert.equal(zahl('8,20 x'), 0);
  assert.equal(zahl('ca. 5'), 0);
  assert.equal(zahl(''), 0);
  assert.equal(zahl(null), 0);
  assert.equal(zahl(undefined, 7), 7, 'der Standardwert bleibt');
  assert.equal(zahl(Number.NaN, 3), 3);
});

// ===========================================================================
// TEIL 2 — SKONTO UND RABATT: DIE KERNFORMEL
// ===========================================================================

test('DIE INVARIANTE: nach Skontoabzug bleibt genau der Barverkaufspreis', () => {
  // Der Punkt, an dem sich Handwerker verrechnen: Skonto wird NICHT
  // aufgeschlagen, sondern herausgerechnet.
  for (const skonto of [2, 3, 5, 10]) {
    const e = rechne(kalk([M(1000)], { skonto_prozent: skonto }));
    const nachAbzug = cent(e.angebotspreis_netto * (1 - skonto / 100));
    assert.ok(Math.abs(nachAbzug - e.barverkaufspreis) <= 0.01,
      `${skonto} % Skonto: nach Abzug ${nachAbzug}, gebraucht ${e.barverkaufspreis}`);
  }
});

test('3 % Skonto auf 1.000 EUR ergeben 1.030,93 — nicht 1.030,00', () => {
  const e = rechne(kalk([M(1000)], { skonto_prozent: 3 }));
  assert.equal(e.barverkaufspreis, 1000);
  assert.equal(e.angebotspreis_netto, 1030.93);
  assert.notEqual(e.angebotspreis_netto, 1030, 'aufgeschlagen statt herausgerechnet waere falsch');
});

test('Skonto und Rabatt wirken zusammen, nicht nacheinander addiert', () => {
  const e = rechne(kalk([M(1000)], { skonto_prozent: 3, rabatt_prozent: 10 }));
  // 1000 / (0,97 x 0,90) = 1145,48 — nicht 1000 / 0,87 = 1149,43
  assert.equal(e.angebotspreis_netto, 1145.48);
});

test('ohne Skonto und Rabatt ist der Angebotspreis der Barverkaufspreis', () => {
  const e = rechne(kalk([M(1000)]));
  assert.equal(e.angebotspreis_netto, e.barverkaufspreis);
});

// ===========================================================================
// TEIL 3 — DER RECHENWEG
// ===========================================================================

test('der Weg von den Einzelkosten zum Angebotspreis stimmt Schritt fuer Schritt', () => {
  const e = rechne(kalk([M(1000)], { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 10 }));
  assert.equal(e.einzelkosten, 1000);
  assert.equal(e.gemeinkosten, 150, '15 % auf die Einzelkosten');
  assert.equal(e.selbstkosten, 1150);
  assert.equal(e.wagnis_gewinn, 115, '10 % auf die SELBSTkosten, nicht auf die Einzelkosten');
  assert.equal(e.barverkaufspreis, 1265);
  assert.equal(e.angebotspreis_netto, 1265);
  assert.equal(e.mwst, 240.35);
  assert.equal(e.angebotspreis_brutto, 1505.35);
});

test('Wagnis und Gewinn rechnen auf die Selbstkosten, nicht auf die Einzelkosten', () => {
  // Ein haeufiger Denkfehler: 10 % auf 1.000 waeren 100, richtig sind 115.
  const e = rechne(kalk([M(1000)], { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 10 }));
  assert.equal(e.wagnis_gewinn, 115);
  assert.notEqual(e.wagnis_gewinn, 100);
});

test('Verschnitt wird nur auf Material gerechnet, nicht auf Zeit', () => {
  // postenJeEinheit rundet BEWUSST nicht: der Wert ist ein Faktor je
  // Einheit, der noch mit der Menge multipliziert wird. Frueh zu runden
  // kostet Genauigkeit. Deshalb hier mit Toleranz statt auf den Cent —
  // 1 x 1,1 x 100 ergibt in Gleitkomma 110.00000000000001.
  assert.ok(Math.abs(postenJeEinheit(M(100, { verschnitt_prozent: 10 })) - 110) < 1e-9);
  assert.equal(
    postenJeEinheit({ art: 'zeit', menge_je_einheit: 1, preis_je_einheit: 100, verschnitt_prozent: 10, einheit: 'min' }),
    100, 'Zeit hat keinen Verschnitt');
  // Im Ergebnis ist es dann sauber auf Cent:
  assert.equal(rechne(kalk([M(100, { verschnitt_prozent: 10 })])).material, 110);
});

test('die Menge multipliziert jeden Posten', () => {
  const e = rechne(kalk([M(10)], {}, 25));
  assert.equal(e.einzelkosten, 250);
  assert.equal(e.je_einheit.einzelkosten, 10);
});

test('Menge 0 rechnet nichts und teilt nicht durch null', () => {
  const e = rechne(kalk([M(10)], {}, 0));
  assert.equal(e.einzelkosten, 0);
  assert.equal(e.je_einheit.einzelkosten, 0);
  assert.equal(e.zeit_minuten_je_einheit, 0);
  assert.equal(e.marge_prozent, 0);
});

test('eine negative Menge wird wie 0 behandelt', () => {
  assert.equal(rechne(kalk([M(10)], {}, -5)).einzelkosten, 0);
});

test('Zeitangaben landen unabhaengig von der Einheit in Minuten', () => {
  assert.equal(inMinuten(1.2, 'h'), 72);
  assert.equal(inMinuten(2, 'Std'), 120);
  assert.equal(inMinuten(90, 'sek'), 1.5);
  assert.equal(inMinuten(45, 'min'), 45);
  assert.equal(inMinuten(45, ''), 45, 'ohne Angabe gilt Minuten');
});

test('Zeit und Energie werden getrennt ausgewiesen', () => {
  const e = rechne(kalk([
    { art: 'zeit', bezeichnung: 'Arbeit', menge_je_einheit: 30, einheit: 'min', preis_je_einheit: 1 },
    { art: 'energie', bezeichnung: 'Strom', menge_je_einheit: 0.5, einheit: 'kWh', preis_je_einheit: 0.32 },
    { art: 'fremd', bezeichnung: 'Entsorgung', menge_je_einheit: 1, einheit: 'Stk', preis_je_einheit: 20 },
  ], {}, 10));
  assert.equal(e.zeit, 300);
  assert.equal(e.zeit_minuten, 300);
  assert.equal(e.zeit_minuten_je_einheit, 30);
  assert.equal(e.energie, 1.6);
  assert.equal(e.energie_kwh, 5);
  assert.equal(e.energie_kwh_je_einheit, 0.5);
  assert.equal(e.fremd, 200);
});

test('Energie zaehlt nur als kWh, wenn sie auch in kWh erfasst ist', () => {
  const e = rechne(kalk([{ art: 'energie', bezeichnung: 'Diesel', menge_je_einheit: 4, einheit: 'l', preis_je_einheit: 1.7 }]));
  assert.equal(e.energie, 6.8, 'die Kosten zaehlen');
  assert.equal(e.energie_kwh, 0, 'die kWh-Anzeige aber nicht');
});

test('negative Zuschlaege werden auf 0 gesetzt, uebergrosse gedeckelt', () => {
  const minus = rechne(kalk([M(1000)], { gemeinkosten_prozent: -50 }));
  assert.equal(minus.gemeinkosten, 0, 'ein negativer Gemeinkostenzuschlag ergibt keinen Sinn');
  const viel = rechne(kalk([M(1000)], { skonto_prozent: 150 }));
  assert.ok(Number.isFinite(viel.angebotspreis_netto), 'kein Unendlich, auch bei Unsinn');
});

// ===========================================================================
// TEIL 4 — WUNSCHPREIS, PRUEFUNG, KLARTEXT
// ===========================================================================

test('beim Wunschpreis passt die Marge zur Rechnung', () => {
  const k = kalk([M(1000)], { gemeinkosten_prozent: 15 });
  const w = beiWunschpreis(k, 1500);
  assert.equal(w.selbstkosten, 1150);
  assert.equal(w.gewinn, 350);
  assert.equal(w.marge_prozent, 23.3);
  assert.equal(w.traegt_sich, true);
});

test('ein zu niedriger Wunschpreis wird als Verlust ausgewiesen', () => {
  const w = beiWunschpreis(kalk([M(1000)], { gemeinkosten_prozent: 15 }), 900);
  assert.equal(w.gewinn, -250);
  assert.equal(w.traegt_sich, false);
  assert.ok(w.marge_prozent < 0);
});

test('genau kostendeckend traegt sich gerade noch', () => {
  const w = beiWunschpreis(kalk([M(1000)], { gemeinkosten_prozent: 0 }), 1000);
  assert.equal(w.gewinn, 0);
  assert.equal(w.traegt_sich, true);
});

test('die Pruefung nennt jeden Fehler im Klartext', () => {
  assert.ok(pruefeKalkulation(kalk([M(10)], {}, 0)).some((f) => /Menge angeben/.test(f)));
  assert.ok(pruefeKalkulation(kalk([])).some((f) => /keine Position/.test(f)));
  assert.ok(pruefeKalkulation(kalk([M(10, { bezeichnung: '  ' })])).some((f) => /Bezeichnung fehlt/.test(f)));
  assert.ok(pruefeKalkulation(kalk([M(-5)])).some((f) => /Preis kann nicht negativ/.test(f)));
  assert.ok(pruefeKalkulation(kalk([M(10, { menge_je_einheit: -1 })])).some((f) => /Verbrauch kann nicht negativ/.test(f)));
});

test('Skonto und Rabatt zusammen ab 100 Prozent werden abgefangen', () => {
  assert.ok(pruefeKalkulation(kalk([M(10)], { skonto_prozent: 60, rabatt_prozent: 40 }))
    .some((f) => /nichts übrig/.test(f)));
  assert.equal(pruefeKalkulation(kalk([M(10)], { skonto_prozent: 3, rabatt_prozent: 10 })).length, 0);
});

test('eine saubere Kalkulation meldet keine Fehler', () => {
  assert.deepEqual(pruefeKalkulation(kalk([M(10)], {}, 25)), []);
});

test('der Befund spricht Klartext statt Prozentzahlen', () => {
  assert.equal(befund(rechne(kalk([]))).ton, 'achtung');
  assert.match(befund(rechne(kalk([]))).text, /Positionen erfassen/);

  const gut = rechne(kalk([M(1000)], { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 25 }));
  assert.equal(befund(gut).ton, 'gut');
  assert.match(befund(gut).text, /Marge/);
});

test('BEFUND: rechne() kann gar keine negative Marge liefern', () => {
  // GEMESSEN ueber alle Zuschlagskombinationen: Skonto und Rabatt werden
  // herausgerechnet, ERHOEHEN also den Preis. Die Marge kann dadurch nie
  // unter 0 fallen — der Zweig "Bei diesem Preis zahlen Sie drauf" ist
  // ueber den normalen Weg unerreichbar. Wer einen Verlust sehen will,
  // braucht beiWunschpreis().
  for (const z of [
    { gemeinkosten_prozent: 0, wagnis_gewinn_prozent: 0 },
    { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 0, rabatt_prozent: 20 },
    { gemeinkosten_prozent: 40, wagnis_gewinn_prozent: 0, skonto_prozent: 5, rabatt_prozent: 30 },
  ]) {
    const e = rechne(kalk([M(1000)], z));
    assert.ok(e.marge_prozent >= 0, JSON.stringify(z) + ' ergibt ' + e.marge_prozent + ' %');
    assert.ok(e.angebotspreis_netto >= e.selbstkosten, 'der Preis deckt immer die Selbstkosten');
  }
});

test('BEFUND: genau 0 % Marge heisst nicht "Sie zahlen drauf"', () => {
  // Der alte Text behauptete das. Mit Wagnis und Gewinn auf 0 ist 0 %
  // sogar der Normalfall — der Satz wird also oft gelesen.
  const null0 = rechne(kalk([M(1000)], { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 0 }));
  assert.equal(null0.marge_prozent, 0);
  const b = befund(null0);
  assert.equal(b.ton, 'schlecht', 'eine Warnung bleibt es');
  assert.match(b.text, /halten genau die Null/);
  assert.ok(!b.text.includes('zahlen Sie drauf'), 'aber die Aussage muss stimmen');
});

test('eine echte Unterdeckung zeigt beiWunschpreis', () => {
  const w = beiWunschpreis(kalk([M(1000)], { gemeinkosten_prozent: 15 }), 800);
  assert.equal(w.traegt_sich, false);
  assert.equal(w.gewinn, -350);
});

test('WAECHTER: absurde Zuschlaege werden von der Pruefung gefangen', () => {
  // Skonto 99 % und Rabatt 99 % ergeben in rechne() ein Angebot ueber
  // 10.000.000 EUR bei 1.000 EUR Kosten — und befund() nennt das "gut".
  // Aufgehalten wird das NUR von pruefeKalkulation. Wer den Befund ohne
  // die Pruefung anzeigt, zeigt Unsinn als Erfolg.
  const k = kalk([M(1000)], { skonto_prozent: 99, rabatt_prozent: 99 });
  assert.ok(rechne(k).angebotspreis_netto > 1000000, 'die Rechnung selbst bremst nicht');
  assert.ok(pruefeKalkulation(k).length > 0, 'die Pruefung MUSS es fangen');
});

test('knappe Margen werden als Warnung benannt, nicht als Erfolg', () => {
  const knapp = rechne(kalk([M(1000)], { gemeinkosten_prozent: 15, wagnis_gewinn_prozent: 3 }));
  assert.equal(befund(knapp).ton, 'achtung');
  assert.ok(knapp.marge_prozent > 0 && knapp.marge_prozent < 5);
});

test('euro formatiert deutsch und faengt Unsinn ab', () => {
  assert.equal(euro(1234.5), '1.234,50 €');
  assert.equal(euro(Number.NaN), '0,00 €');
  assert.equal(euro(Infinity), '0,00 €');
});

// ===========================================================================
// TEIL 5 — DIE BRANCHEN-VORLAGEN
// ===========================================================================

test('jede Vorlage laesst sich rechnen und ergibt einen sinnvollen Preis', () => {
  let i = 0;
  const id = () => String(i++);
  for (const g of GEWERKE) {
    const k = ausVorlage(g.key, id);
    assert.ok(k, g.key + ' fehlt');
    assert.deepEqual(pruefeKalkulation(k), [], g.key + ' ist nicht rechenbar');
    const e = rechne(k);
    assert.ok(e.angebotspreis_netto > 0, g.key + ' ergibt keinen Preis');
    assert.ok(e.angebotspreis_netto > e.selbstkosten, g.key + ' deckt die Selbstkosten nicht');
    assert.ok(e.marge_prozent > 0, g.key + ' hat keine Marge');
  }
});

test('alle acht Gewerke sind da und eindeutig', () => {
  assert.equal(GEWERKE.length, 8);
  const keys = GEWERKE.map((g) => g.key);
  assert.equal(new Set(keys).size, 8, 'doppelte Schluessel');
  for (const g of GEWERKE) {
    assert.ok(g.posten.length > 0, g.key);
    assert.ok(g.beispielMenge > 0, g.key);
    assert.ok(g.einheit, g.key);
  }
});

test('eine unbekannte Vorlage liefert null statt zu raten', () => {
  assert.equal(ausVorlage('gibtsnicht', () => 'x'), null);
  assert.equal(gewerkDef('gibtsnicht'), undefined);
});

test('die Vorlage bringt die Standardzuschlaege mit', () => {
  const k = ausVorlage('maler', () => 'x');
  assert.deepEqual(k.zuschlaege, ZUSCHLAEGE_STANDARD);
  assert.equal(ZUSCHLAEGE_STANDARD.gemeinkosten_prozent, 15);
  assert.equal(ZUSCHLAEGE_STANDARD.wagnis_gewinn_prozent, 10);
  assert.equal(ZUSCHLAEGE_STANDARD.mwst_satz, 19);
});

test('jeder Posten einer Vorlage bekommt eine eigene id', () => {
  let i = 0;
  const k = ausVorlage('metallbau', () => String(i++));
  const ids = k.posten.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'doppelte ids');
});
