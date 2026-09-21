// ============================================================================
// tests/abschlagsrechnungP54.test.mjs
//
// PUNKT 54 / R5 — ABSCHLAGS- UND SCHLUSSRECHNUNG, Paket 1 (21.09.2026)
//
// ▄▄▄ DER BEFUND ▄▄▄
// Gesucht wurde im ganzen Haus nach "abschlag", "teilrechnung",
// "schlussrechnung" und "632a": KEIN EINZIGER TREFFER.
//
// ▄▄▄ DIE DREI FEHLER, DIE DIESE DATEI VERHINDERN SOLL ▄▄▄
//
//  1. IN DER SCHLUSSRECHNUNG NUR DIE NETTO-ABSCHLAEGE ABSETZEN.
//     GEMESSEN am Auftrag ueber 100.000 EUR netto / 19 % mit drei
//     Abschlaegen ueber zusammen 90.000 EUR netto: richtig sind 1.900,00 EUR
//     Reststeuer, ohne die Steuerabsetzung waeren es 19.000,00 EUR —
//     17.100,00 EUR zu viel, und zwar ZUSAETZLICH zu den bereits aus den
//     Abschlaegen abgefuehrten 17.100,00 EUR (§ 14c Abs. 1 UStG).
//
//  2. DEN 90-%-DECKEL DES VERBRAUCHERBAUVERTRAGS UEBERGEHEN
//     (§ 650m Abs. 1 BGB). Eine Rechnung darueber muss der Verbraucher
//     nicht zahlen.
//
//  3. DIE SKONTOBASIS RATEN. GEMESSEN: 2 % auf den Restbetrag sind
//     238,00 EUR, 2 % auf die Gesamtleistung 2.380,00 EUR — 2.142,00 EUR
//     Unterschied bei derselben Rechnung.
//
// RUFT NOCH NIEMAND AUF — wie skonto.ts, sicherheitseinbehalt.ts,
// bauleistung.ts und ustIdNr.ts.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rechneAbschlag,
  baueSchlussrechnung,
  absetzungsText,
  abschlagHinweise,
  pruefeAuswahl,
  steuerAus,
  RECHTSGRUNDLAGEN,
  DECKEL_PROZENT,
  VERBRAUCHER_SICHERHEIT_PROZENT,
  STEUERSATZ_STANDARD,
  satzAusBetraegen,
} from '../out/abschlagsrechnung.js';

import { rechneSkonto } from '../out/skonto.js';

// Das Kernbeispiel, an dem die halbe Datei haengt.
const GESAMT = [{ netto: 100000, steuersatz: 19 }];
const DREI_ABSCHLAEGE = [
  { nummer: 'AR-2026-0001', netto: 30000, steuersatz: 19, steuer: 5700 },
  { nummer: 'AR-2026-0002', netto: 40000, steuersatz: 19, steuer: 7600 },
  { nummer: 'AR-2026-0003', netto: 20000, steuersatz: 19, steuer: 3800 },
];

// ===========================================================================
// TEIL 1 — DIE STEUERABSETZUNG (§ 14 Abs. 5 Satz 2 UStG)
// ===========================================================================

test('Kernbeispiel: Entgelt UND Steuer werden abgesetzt', () => {
  const r = baueSchlussrechnung({ gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE });

  assert.equal(r.gesamtNetto, 100000);
  assert.equal(r.gesamtSteuer, 19000);
  assert.equal(r.gesamtBrutto, 119000);

  assert.equal(r.abgesetztNetto, 90000);
  assert.equal(r.abgesetztSteuer, 17100, 'die Steuer der Abschlaege gehoert abgesetzt');
  assert.equal(r.abgesetztBrutto, 107100);

  assert.equal(r.restNetto, 10000);
  assert.equal(r.restSteuer, 1900, 'ohne Steuerabsetzung stuenden hier 19.000,00 EUR');
  assert.equal(r.restBrutto, 11900);
});

test('der Fehlbetrag aus Fehler 1 ist genau die Steuer der Abschlaege', () => {
  const r = baueSchlussrechnung({ gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE });
  const falsch = r.gesamtSteuer;          // Steuer stehen lassen
  const richtig = r.restSteuer;
  assert.equal(falsch - richtig, 17100);
  assert.equal(falsch - richtig, r.abgesetztSteuer);
});

test('die Absetzung wird ausdruecklich benannt, mit beiden Zahlen', () => {
  const r = baueSchlussrechnung({ gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE });
  const t = r.hinweise.find((h) => h.feld === 'absetzung');
  assert.ok(t, 'ein Hinweis zur Absetzung muss kommen');
  assert.match(t.text, /90\.000,00 EUR/);
  assert.match(t.text, /17\.100,00 EUR/);
  assert.match(t.text, /14c/);
});

test('die ausgewiesene Steuer eines Abschlags wird NICHT neu gerechnet', () => {
  // Auf dem Beleg stand 190,01 — abgesetzt gehoert, was dort steht.
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 2000, steuersatz: 19 }],
    abschlaege: [{ nummer: 'A1', netto: 1000, steuersatz: 19, steuer: 190.01 }],
  });
  assert.equal(r.abgesetztSteuer, 190.01);
  assert.equal(r.restSteuer, 189.99);
});

test('fehlt die Steuer am Abschlag, wird sie aus dem Satz gerechnet', () => {
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 2000, steuersatz: 19 }],
    abschlaege: [{ nummer: 'A1', netto: 1000, steuersatz: 19 }],
  });
  assert.equal(r.abgesetztSteuer, 190);
});

test('je Steuersatz getrennt — Pflicht nach § 14 Abs. 4 Nr. 7 und 8 UStG', () => {
  const r = baueSchlussrechnung({
    gesamt: [
      { netto: 10000, steuersatz: 19 },
      { netto: 5000, steuersatz: 7 },
    ],
    abschlaege: [
      { nummer: 'A1', netto: 6000, steuersatz: 19, steuer: 1140 },
      { nummer: 'A2', netto: 2000, steuersatz: 7, steuer: 140 },
    ],
  });
  assert.equal(r.gruppen.length, 2);
  const g19 = r.gruppen.find((g) => g.steuersatz === 19);
  const g7 = r.gruppen.find((g) => g.steuersatz === 7);

  assert.equal(g19.gesamtSteuer, 1900);
  assert.equal(g19.abgesetztSteuer, 1140);
  assert.equal(g19.restSteuer, 760);

  assert.equal(g7.gesamtSteuer, 350);
  assert.equal(g7.abgesetztSteuer, 140);
  assert.equal(g7.restSteuer, 210);
});

test('ein Steuersatz, den es nur in den Abschlaegen gibt, wird gemeldet', () => {
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 10000, steuersatz: 19 }],
    abschlaege: [{ nummer: 'A1', netto: 2000, steuersatz: 7, steuer: 140 }],
  });
  const h = r.hinweise.find((x) => x.feld === 'steuersatz');
  assert.ok(h, 'ein Abschlag mit fremdem Steuersatz muss auffallen');
  assert.match(h.text, /7 %/);
});

// ===========================================================================
// TEIL 2 — STORNO UND DER VERGESSENE ABSCHLAG
// ===========================================================================

test('stornierte Abschlaege werden NICHT abgesetzt, aber benannt', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT,
    abschlaege: [
      ...DREI_ABSCHLAEGE,
      { nummer: 'AR-2026-0004', netto: 10000, steuersatz: 19, steuer: 1900, storniert: true },
    ],
  });
  assert.equal(r.abgesetztNetto, 90000, 'der stornierte Abschlag bleibt draussen');
  assert.equal(r.abgesetztSteuer, 17100);
  assert.equal(r.ausgelassen.length, 1);
  const h = r.hinweise.find((x) => x.feld === 'storno');
  assert.ok(h);
  assert.match(h.text, /AR-2026-0004/);
});

test('der vergessene Abschlag wird VOR der Schlussrechnung gemeldet', () => {
  const hinweise = pruefeAuswahl(DREI_ABSCHLAEGE, DREI_ABSCHLAEGE.slice(0, 2));
  const h = hinweise.find((x) => x.feld === 'absetzung');
  assert.ok(h, 'ein nicht ausgewaehlter Abschlag muss auffallen');
  assert.match(h.text, /AR-2026-0003/);
  assert.match(h.text, /14c/);
});

test('sind alle ausgewaehlt, kommt keine Meldung', () => {
  const hinweise = pruefeAuswahl(DREI_ABSCHLAEGE, DREI_ABSCHLAEGE);
  assert.equal(hinweise.filter((h) => h.feld === 'absetzung').length, 0);
});

test('ein stornierter Abschlag gilt nicht als vergessen', () => {
  const alle = [...DREI_ABSCHLAEGE, { nummer: 'AR-2026-0009', netto: 5000, storniert: true }];
  const hinweise = pruefeAuswahl(alle, DREI_ABSCHLAEGE);
  assert.equal(hinweise.filter((h) => h.feld === 'absetzung').length, 0);
});

test('ein ausgewaehlter Storno wird eigens gemeldet', () => {
  const alle = [...DREI_ABSCHLAEGE, { nummer: 'AR-2026-0009', netto: 5000, storniert: true }];
  const hinweise = pruefeAuswahl(alle, alle);
  const h = hinweise.find((x) => x.feld === 'storno');
  assert.ok(h);
  assert.match(h.text, /AR-2026-0009/);
});

// ===========================================================================
// TEIL 3 — DER 90-%-DECKEL (§ 650m Abs. 1 BGB)
// ===========================================================================

test('genau 90 % sind noch zulaessig — ueberschritten ist erst mehr', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 10000,
    bisherNetto: 80000,
    gesamtNetto: 100000,
    steuersatz: 19,
    vertragsart: 'verbraucher',
  });
  assert.ok(a.deckel);
  assert.equal(a.deckel.gesamtverguetung, 119000, 'gegenueber Verbrauchern zaehlt der Endpreis');
  assert.equal(a.deckel.hoechstbetrag, 107100);
  assert.equal(a.deckel.bereits, 107100);
  assert.equal(a.deckel.ueberschritten, false);
  assert.equal(a.deckel.frei, 0);
});

test('darueber wird der Ueberschuss beziffert', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 20000,
    bisherNetto: 80000,
    gesamtNetto: 100000,
    steuersatz: 19,
    vertragsart: 'verbraucher',
  });
  assert.equal(a.deckel.bereits, 119000);
  assert.equal(a.deckel.ueberschritten, true);
  assert.equal(a.deckel.ueberschuss, 11900);
  assert.equal(a.deckel.frei, 0);

  const h = a.hinweise.find((x) => x.feld === 'deckel');
  assert.ok(h);
  assert.match(h.text, /11\.900,00 EUR/, 'der Ueberschuss gehoert in den Text');
  assert.match(h.text, /650m/);
});

test('beim UNTERNEHMER gibt es keinen Deckel', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 95000,
    bisherNetto: 0,
    gesamtNetto: 100000,
    steuersatz: 19,
    vertragsart: 'unternehmer',
  });
  assert.equal(a.deckel, null);
  assert.equal(a.hinweise.filter((h) => h.feld === 'deckel').length, 0);
});

test('ungeklaerte Vertragsart gilt NICHT still als Unternehmer', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 95000,
    gesamtNetto: 100000,
    steuersatz: 19,
    vertragsart: 'offen',
  });
  assert.equal(a.deckel, null);
  const h = a.hinweise.find((x) => x.feld === 'vertragsart');
  assert.ok(h, 'die offene Vertragsart muss gemeldet werden');
  assert.match(h.text, /NICHT geprueft/);
});

test('Verbraucher ohne Gesamtsumme: der Deckel wird nicht geraten', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 20000,
    steuersatz: 19,
    vertragsart: 'verbraucher',
  });
  assert.equal(a.deckel, null);
  const h = a.hinweise.find((x) => x.feld === 'deckel');
  assert.ok(h);
  assert.match(h.text, /Gesamtverguetung/);
});

test('deckelBasis netto rechnet vom Netto — und das ist ein anderer Deckel', () => {
  const brutto = rechneAbschlag({
    erbrachtNetto: 10000, bisherNetto: 80000, gesamtNetto: 100000,
    steuersatz: 19, vertragsart: 'verbraucher',
  });
  const netto = rechneAbschlag({
    erbrachtNetto: 10000, bisherNetto: 80000, gesamtNetto: 100000,
    steuersatz: 19, vertragsart: 'verbraucher', deckelBasis: 'netto',
  });
  assert.equal(brutto.deckel.hoechstbetrag, 107100);
  assert.equal(netto.deckel.hoechstbetrag, 90000);
  assert.notEqual(brutto.deckel.hoechstbetrag, netto.deckel.hoechstbetrag);
});

test('§ 650m Abs. 2: die 5 % Sicherheit laufen in die GEGENRICHTUNG', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 20000, bisherNetto: 0, gesamtNetto: 100000,
    steuersatz: 19, vertragsart: 'verbraucher', nr: 1,
  });
  assert.equal(a.deckel.sicherheitFuerVerbraucher, 5950);
  const h = a.hinweise.find((x) => x.feld === 'sicherheit');
  assert.ok(h, 'bei der ersten Abschlagszahlung muss die Sicherheit genannt werden');
  assert.match(h.text, /5\.950,00 EUR/);
  assert.match(h.text, /GEGENRICHTUNG/);
});

test('ab dem zweiten Abschlag wird die Sicherheit nicht erneut verlangt', () => {
  const a = rechneAbschlag({
    erbrachtNetto: 20000, bisherNetto: 20000, gesamtNetto: 100000,
    steuersatz: 19, vertragsart: 'verbraucher', nr: 2,
  });
  assert.equal(a.hinweise.filter((h) => h.feld === 'sicherheit').length, 0);
});

test('§ 632a Abs. 1 Satz 2: der Leistungsnachweis wird immer verlangt', () => {
  const a = rechneAbschlag({ erbrachtNetto: 5000, vertragsart: 'unternehmer' });
  const h = a.hinweise.find((x) => x.feld === 'nachweis');
  assert.ok(h);
  assert.match(h.text, /Aufstellung/);
});

test('ein Abschlag ueber 0 EUR ergibt keine Forderung', () => {
  const a = rechneAbschlag({ erbrachtNetto: 0, vertragsart: 'unternehmer' });
  const h = a.hinweise.find((x) => x.feld === 'betrag');
  assert.ok(h);
  assert.match(h.text, /632a/);
});

// ===========================================================================
// TEIL 4 — SKONTO, EINBEHALT UND IHRE REIHENFOLGE
// ===========================================================================

test('die Skontobasis aendert den Betrag um das Zehnfache', () => {
  const rest = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'restbetrag',
  });
  const ganz = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'gesamtleistung',
  });
  assert.equal(rest.skonto, 238);
  assert.equal(ganz.skonto, 2380);
  assert.equal(ganz.skonto - rest.skonto, 2142);
});

test('die jeweils ANDERE Basis kommt immer mit zurueck', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'restbetrag',
  });
  assert.equal(r.skonto, 238);
  assert.equal(r.skontoAlternative, 2380, 'ohne die Alternative sieht niemand den Unterschied');
});

test('ohne festgelegte Basis wird vom Restbetrag gerechnet UND gesagt', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    skontoProzent: 2, skontoTage: 14,
  });
  assert.equal(r.skonto, 238);
  const h = r.hinweise.find((x) => x.feld === 'skonto' && /nicht festgelegt/.test(x.text));
  assert.ok(h, 'die geratene Basis muss benannt werden');
  assert.match(h.text, /2\.142,00 EUR/);
});

test('dasselbe Skonto wie lib/skonto.ts — kein zweiter Rechenweg', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'restbetrag',
  });
  const s = rechneSkonto(11900, { prozent: 2, tage: 14 });
  assert.equal(r.skonto, s.abzug);
});

test('Einbehalt und Skonto rechnen BEIDE vom vollen Restbetrag', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    einbehalt: { prozent: 5 },
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'restbetrag',
  });
  assert.equal(r.restBrutto, 11900);
  assert.equal(r.einbehalt, 595);
  assert.equal(r.skonto, 238, 'vom gekuerzten Betrag waeren es nur 226,10 EUR');
  assert.equal(r.zahlbetrag, 11067);
  assert.equal(r.spaeterFaellig, 595);
});

test('der Einbehalt mindert das Entgelt nicht', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    einbehalt: { prozent: 5 },
  });
  assert.equal(r.restNetto, 10000);
  assert.equal(r.restSteuer, 1900, 'volle Umsatzsteuer trotz Einbehalt');
});

test('Skonto mindert das Entgelt erst beim Ziehen — § 17 UStG steht dabei', () => {
  const r = baueSchlussrechnung({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'restbetrag',
  });
  assert.equal(r.restSteuer, 1900);
  assert.ok(r.hinweise.some((h) => /17 Abs. 1 UStG/.test(h.text)));
});

// ===========================================================================
// TEIL 5 — UEBERZAHLUNG UND § 13b
// ===========================================================================

test('mehr Abschlaege als Leistung: der Kunde bekommt Geld zurueck', () => {
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 100000, steuersatz: 19 }],
    abschlaege: [{ nummer: 'A1', netto: 120000, steuersatz: 19, steuer: 22800 }],
  });
  assert.equal(r.restNetto, -20000);
  assert.equal(r.restSteuer, -3800);
  assert.equal(r.restBrutto, -23800);
  assert.equal(r.ueberzahlt, true);
  const h = r.hinweise.find((x) => x.feld === 'ueberzahlung');
  assert.ok(h);
  assert.match(h.text, /23\.800,00 EUR/);
});

test('§ 13b: keine Steuer, weder gesamt noch abgesetzt', () => {
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 50000, steuersatz: 19 }],
    abschlaege: [{ nummer: 'A1', netto: 20000, steuersatz: 19 }],
    reverseCharge: true,
  });
  assert.equal(r.gesamtSteuer, 0);
  assert.equal(r.abgesetztSteuer, 0);
  assert.equal(r.restSteuer, 0);
  assert.equal(r.restBrutto, 30000);
});

test('§ 13b mit steuertragenden Abschlaegen ist ein Widerspruch und wird gemeldet', () => {
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 50000, steuersatz: 19 }],
    abschlaege: [{ nummer: 'A1', netto: 20000, steuersatz: 19, steuer: 3800 }],
    reverseCharge: true,
  });
  const h = r.hinweise.find((x) => x.feld === 'reverse');
  assert.ok(h, 'eine der beiden Einstufungen ist falsch — das muss auffallen');
  assert.match(h.text, /13b/);
});

// ===========================================================================
// TEIL 6 — ZAHLEN, RUNDUNG, EINGABEN
// ===========================================================================

test('unter 1 EUR faengt centRunden den Grenzfall ab', () => {
  // 1,50 * 19 / 100 = 0,285. In Gleitkomma ist 0.285*100 = 28.499999999999996.
  // Ein nacktes Math.round liefert 0,28 — centRunden 0,29.
  assert.equal(steuerAus(1.5, 19), 0.29);
});

test('BEFUND: ueber 1 EUR faengt centRunden ihn NICHT ab', () => {
  // Diese Tests halten fest, was lib/zahlen.ts HEUTE tut — nicht, was
  // richtig waere. centRunden addiert Number.EPSILON (2,22e-16) als
  // ABSOLUTEN Wert. Bei 8,075 ist der Abstand zweier Gleitkommazahlen
  // aber schon 1,78e-15, also achtmal so gross: das Epsilon wird
  // verschluckt, und centRunden verhaelt sich wie Math.round.
  //
  // GEMESSEN ueber alle Nettobetraege von 0,01 bis 2.000,00 bei 19 %:
  // in 122 von 200.000 Faellen wird ein Cent zu WENIG Steuer gerechnet.
  //
  // NICHT hier repariert: centRunden haengt an der gesamten Geld-Schicht
  // (P30, P53 zugferd, P63 importParser, P65 gaeb). Eine Aenderung dort
  // verschiebt Betraege auf jedem Beleg und gehoert in ein eigenes Paket
  // mit Ansage. Faellt einer dieser Tests eines Tages um, ist das der
  // Beweis, dass jemand die Rundung angefasst hat — dann bewusst.
  assert.equal(steuerAus(42.5, 19), 8.07);   // 8,075 -> richtig waere 8,08
  assert.equal(steuerAus(97.5, 19), 18.52);  // 18,525 -> richtig waere 18,53
  assert.equal(steuerAus(182.5, 19), 34.67); // 34,675 -> richtig waere 34,68
});

test('die EINGABE wird vor der Steuer auf Cent gerundet', () => {
  // Etwas anderes als der Grenzfall oben: hier geht es um den Betrag,
  // der hereinkommt, nicht um das Produkt.
  assert.equal(steuerAus('12,345', 19), 2.35);   // 12,35 netto -> 2,3465
  assert.equal(steuerAus('1.234,565', 19), 234.57);
});

test('Steuersatz 0 ist gueltig und wird nicht durch 19 ersetzt', () => {
  assert.equal(steuerAus(1000, 0), 0);
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 1000, steuersatz: 0 }],
    abschlaege: [],
  });
  assert.equal(r.gesamtSteuer, 0);
  assert.equal(r.gruppen[0].steuersatz, 0);
});

test('ein FEHLENDER Steuersatz wird zum Standard, ein genullter nicht', () => {
  assert.equal(steuerAus(1000, undefined), 190);
  assert.equal(steuerAus(1000, ''), 190);
  assert.equal(steuerAus(1000, 0), 0);
  assert.equal(STEUERSATZ_STANDARD, 19);
});

test('Betraege als TEXT mit Tausenderpunkt werden gelesen (Punkt 12)', () => {
  const r = baueSchlussrechnung({
    gesamt: [{ netto: '100.000,00', steuersatz: '19' }],
    abschlaege: [{ nummer: 'A1', netto: '30.000,00 EUR', steuersatz: '19', steuer: '5.700,00' }],
  });
  assert.equal(r.gesamtNetto, 100000, 'ein eigener Zahl-Leser haette hier 0 geliefert');
  assert.equal(r.abgesetztNetto, 30000);
  assert.equal(r.abgesetztSteuer, 5700);
});

test('leere Eingaben stuerzen nicht ab', () => {
  const r = baueSchlussrechnung({ gesamt: [], abschlaege: [] });
  assert.equal(r.gesamtBrutto, 0);
  assert.equal(r.restBrutto, 0);
  assert.equal(r.zahlbetrag, 0);
});

// ===========================================================================
// TEIL 7 — KLARTEXT UND RECHTSGRUNDLAGEN
// ===========================================================================

test('der Absetzungsblock nennt Entgelt und Steuer getrennt', () => {
  const zeilen = absetzungsText({ gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE });
  const text = zeilen.join('\n');
  assert.match(text, /Gesamtbetrag der Leistung: 100\.000,00 EUR netto/);
  assert.match(text, /19 % USt auf 100\.000,00 EUR: 19\.000,00 EUR/);
  assert.match(text, /Entgelt 90\.000,00 EUR zzgl\. 19 % USt 17\.100,00 EUR/);
  assert.match(text, /Verbleibender Betrag: 10\.000,00 EUR netto zzgl\. 1\.900,00 EUR USt = 11\.900,00 EUR/);
});

test('der Absetzungsblock zeigt Einbehalt, Skonto und Zahlbetrag', () => {
  const zeilen = absetzungsText({
    gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE,
    einbehalt: { prozent: 5 },
    skontoProzent: 2, skontoTage: 14, skontoBasis: 'restbetrag',
  });
  const text = zeilen.join('\n');
  assert.match(text, /Sicherheitseinbehalt: 595,00 EUR/);
  assert.match(text, /abzueglich 238,00 EUR/);
  assert.match(text, /Zahlbetrag: 11\.067,00 EUR/);
});

test('abschlagHinweise liefert den Andockpunkt als reine Texte', () => {
  const texte = abschlagHinweise({ gesamt: GESAMT, abschlaege: DREI_ABSCHLAEGE });
  assert.ok(Array.isArray(texte));
  assert.ok(texte.every((t) => typeof t === 'string'));
  assert.ok(texte.some((t) => /14c/.test(t)));
});

test('jede Rechtsgrundlage traegt eine Belegstufe — beide pruefen einzeln', () => {
  assert.ok(RECHTSGRUNDLAGEN.length >= 8);
  for (const g of RECHTSGRUNDLAGEN) {
    assert.ok(g.norm && g.inhalt, 'Norm und Inhalt sind Pflicht');
    assert.ok(g.stufe === 'gesichert' || g.stufe === 'pruefen');
  }
  // Jeden der beiden offenen Punkte EINZELN beim Namen pruefen —
  // ein some() ueber die Liste beweist nichts (Lehre aus P65-3).
  const deckelBasis = RECHTSGRUNDLAGEN.find((g) => /Bemessung/.test(g.norm));
  const skontoBezug = RECHTSGRUNDLAGEN.find((g) => /Skontobezug/.test(g.norm));
  assert.ok(deckelBasis, 'die Deckel-Bemessung muss als Rechtsgrundlage stehen');
  assert.ok(skontoBezug, 'der Skontobezug muss als Rechtsgrundlage stehen');
  assert.equal(deckelBasis.stufe, 'pruefen');
  assert.equal(skontoBezug.stufe, 'pruefen');
});

test('die Kennzahlen stehen als Konstanten, nicht im Text vergraben', () => {
  assert.equal(DECKEL_PROZENT, 90);
  assert.equal(VERBRAUCHER_SICHERHEIT_PROZENT, 5);
});

// ===========================================================================
// TEIL 8 — DEN STEUERSATZ AUS DEN BETRAEGEN HERLEITEN
// Die Tabelle rechnungen speichert netto_summe und mwst_summe, aber keinen
// Satz. Ein fest verdrahtetes 19 waere derselbe Fehler wie in Punkt 63.
// ===========================================================================

test('19 % und 7 % werden sauber erkannt', () => {
  assert.deepEqual(satzAusBetraegen(30000, 5700), { satz: 19, eingerastet: true });
  assert.deepEqual(satzAusBetraegen(2000, 140), { satz: 7, eingerastet: true });
  assert.deepEqual(satzAusBetraegen(1000, 50), { satz: 5, eingerastet: true });
  assert.deepEqual(satzAusBetraegen(1000, 160), { satz: 16, eingerastet: true });
});

test('ein Cent Rundungsunterschied kippt den Satz NICHT', () => {
  // Einzeln gerundete Positionen ergeben nie exakt 19,00 % der Kopfsumme.
  assert.deepEqual(satzAusBetraegen(100, 19.01), { satz: 19, eingerastet: true });
  assert.deepEqual(satzAusBetraegen(100, 18.99), { satz: 19, eingerastet: true });
});

test('ein echter Fehler rastet NICHT ein und wird als solcher gemeldet', () => {
  // 50 % Umsatzsteuer gibt es nicht — derselbe Befund wie im Beleg-Check P65-2.
  const r = satzAusBetraegen(100, 50);
  assert.equal(r.eingerastet, false, 'das darf nicht als gueltiger Satz durchgehen');
  assert.equal(r.satz, 50);
});

test('ohne Steuer ist der Satz 0 — und das ist eingerastet, nicht geraten', () => {
  assert.deepEqual(satzAusBetraegen(1000, 0), { satz: 0, eingerastet: true });
});

test('ohne Entgelt gibt es keinen Satz', () => {
  assert.deepEqual(satzAusBetraegen(0, 0), { satz: 0, eingerastet: true });
  assert.equal(satzAusBetraegen(0, 100).eingerastet, false, 'Steuer ohne Entgelt ist ein Fehler');
});

test('die Toleranz waechst nicht ins Uferlose — Lehre aus P65-2', () => {
  // Bei 100.000 EUR netto sind 0,1 % schon 100 EUR. Ein Fehler von 200 EUR
  // muss auffallen, sonst versteckt die Toleranz genau das, was sie finden soll.
  assert.equal(satzAusBetraegen(100000, 19000).eingerastet, true);
  assert.equal(satzAusBetraegen(100000, 19200).eingerastet, false);
});

test('der hergeleitete Satz gruppiert die Absetzung richtig', () => {
  // Ohne Herleitung landete ein 7-%-Abschlag in der 19-%-Gruppe.
  const a = satzAusBetraegen(2000, 140);
  const r = baueSchlussrechnung({
    gesamt: [{ netto: 5000, steuersatz: 7 }],
    abschlaege: [{ nummer: 'A1', netto: 2000, steuersatz: a.satz, steuer: 140 }],
  });
  assert.equal(r.gruppen.length, 1, 'ein falscher Satz haette zwei Gruppen erzeugt');
  assert.equal(r.gruppen[0].steuersatz, 7);
  assert.equal(r.restSteuer, 210);
});
