// ============================================================================
// tests/geldRestP30.test.mjs
//
// PUNKT 30 — Rest (a): der vollstaendige Suchlauf durch lib/ (21.09.2026)
//
//   lib/cashflow.ts · lib/belegCheck.ts · lib/reportBaukasten.ts
//
// ▄▄▄ WIE DER BEFUND ZUSTANDE KAM ▄▄▄
// Alle 269 Dateien in lib/ wurden durchsucht, nicht nach dem Wort Math.round,
// sondern nach der Frage: KANN dieser Wert negativ werden, und ist er Geld?
// Von 241 Rundungsstellen blieben drei Dateien uebrig. 29 Dateien waren
// bereits an lib/zahlen.ts angeschlossen (Pakete Gruppe 1 und 2 vom 20./21.).
//
// ▄▄▄ EHRLICH: ZWEI FEHLER, UNTERSCHIEDLICH SCHWER ▄▄▄
// In allen drei Dateien steckten ZWEI Fehler in derselben Zeile.
//
//   DER SCHWERE, an echten Werten GEMESSEN: der eigene Zahlen-Leser.
//   Number(n) || 0 und replace(',', '.') machen aus dem Text "1.234,56",
//   wie ihn eine numeric-Spalte oft liefert, still die Zahl 0. Eine
//   Auswertung ueber Brutto-Betraege zeigte 0,00 Euro. Ein Liquiditaets-
//   Startsaldo von 1.234,56 Euro war 0,00 Euro. Ohne jeden Hinweis.
//
//   DER LEICHTE, VORSORGE: die unsymmetrische Cent-Rundung. Sie braucht
//   einen Wert mit drei Nachkommastellen, um ueberhaupt zuzuschlagen, und
//   verschiebt dann einen Cent. In cashflow ist sie ueber den Startsaldo
//   erreichbar, in belegCheck ueber Betraege aus der Belegerkennung. Die
//   Tests dazu stehen hier, damit die Symmetrie nie wieder verloren geht —
//   aber sie werden als das benannt, was sie sind: Vorsorge, kein Vorfall.
//
// Alle "vorher"-Werte sind an der alten Fassung GEMESSEN, nicht geschaetzt.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { liquiditaetsVorschau, fixProWoche } from '../out/cashflow.js';
import { pruefeKonsistenz, istDublette } from '../out/belegCheck.js';
import { baueReport, formatWert, reportCsv } from '../out/reportBaukasten.js';
import { centRunden } from '../out/zahlen.js';

// ===========================================================================
// TEIL 1 — DER SCHWERE BEFUND: DEUTSCHE ZAHLEN WURDEN STILL ZU NULL
// ===========================================================================

test('BEFUND cashflow: ein Startsaldo von 1.234,56 Euro stand als 0,00 da', () => {
  const alsZahl = liquiditaetsVorschau({
    startSaldo: 1234.56, offene: [], fixkostenProMonat: 0,
    jetztIso: '2026-09-21T00:00:00.000Z', wochen: 1,
  });
  const alsText = liquiditaetsVorschau({
    startSaldo: '1.234,56', offene: [], fixkostenProMonat: 0,
    jetztIso: '2026-09-21T00:00:00.000Z', wochen: 1,
  });

  assert.equal(alsZahl.startSaldo, 1234.56);
  assert.equal(alsText.startSaldo, 1234.56, 'vorher 0');
  assert.equal(alsText.endSaldo, 1234.56, 'vorher 0');
  assert.deepEqual(alsText, alsZahl, 'Text und Zahl muessen dasselbe ergeben');
});

test('BEFUND cashflow: eine offene Rechnung als Text wurde nicht eingeplant', () => {
  const e = {
    startSaldo: 0,
    offene: [{ rest: '2.500,00', faelligkeitsdatum: '2026-09-23T00:00:00.000Z' }],
    fixkostenProMonat: 0,
    jetztIso: '2026-09-21T00:00:00.000Z',
    wochen: 1,
  };
  const v = liquiditaetsVorschau(e);
  assert.equal(v.summeZufluss, 2500, 'vorher 0');
  assert.equal(v.endSaldo, 2500, 'vorher 0');
  assert.equal(v.punkte[0].unterdeckung, false, 'vorher true — falscher Alarm');
});

test('BEFUND cashflow: Fixkosten als Text ergaben 0 Euro Abfluss', () => {
  assert.equal(fixProWoche('1.000,00'), fixProWoche(1000), 'vorher 0 statt 230,77');
  assert.equal(fixProWoche(1000), 230.77);
});

test('BEFUND belegCheck: ein stimmiger Beleg als Text wurde als falsch gemeldet', () => {
  // Netto 1.000,00 + USt 190,00 = Brutto 1.190,00. Passt.
  const alsZahl = pruefeKonsistenz(1000, 190, 1190);
  const alsText = pruefeKonsistenz('1.000,00', '190,00', '1.190,00');

  assert.equal(alsZahl.stimmt, true);
  assert.equal(alsText.stimmt, true, 'vorher false — Warnung an einem richtigen Beleg');
  assert.equal(alsText.bruttoSoll, 1190, 'vorher 0');
  assert.equal(alsText.differenz, 0, 'vorher 0 minus 0 gleich 0, aber aus falschen Zahlen');
  assert.deepEqual(alsText, alsZahl);
});

test('BEFUND belegCheck: ein WIRKLICH falscher Beleg wird weiter gemeldet', () => {
  // Gegenrichtung: die Pruefung darf nicht blind werden.
  const k = pruefeKonsistenz('1.000,00', '190,00', '1.500,00');
  assert.equal(k.geprueft, true);
  assert.equal(k.stimmt, false);
  assert.equal(k.bruttoSoll, 1190);
  assert.equal(k.differenz, 310);
});

test('BEFUND reportBaukasten: eine Umsatz-Auswertung zeigte 0,00 Euro', () => {
  const rows = [
    { brutto_summe: '1.234,56', zahlungsstatus: 'offen' },
    { brutto_summe: '2.000,00', zahlungsstatus: 'offen' },
    { brutto_summe: 500, zahlungsstatus: 'bezahlt' },
  ];
  const erg = baueReport(rows, { metrik: 'summe', summeFeld: 'brutto_summe', gruppeFeld: 'zahlungsstatus' });

  assert.equal(erg.gesamt, 3734.56, 'vorher 500 — die beiden Textwerte fielen still aus');
  const offen = erg.zeilen.find((z) => z.gruppe === 'offen');
  assert.equal(offen.wert, 3234.56, 'vorher 0');
  assert.equal(offen.anteil, 87);
});

test('reportBaukasten: der Schweizer und der englische Schreibstil werden mitgelesen', () => {
  const erg = baueReport(
    [{ w: "1'234.56" }, { w: '1,234.56' }],
    { metrik: 'summe', summeFeld: 'w', gruppeFeld: null },
  );
  assert.equal(erg.gesamt, 2469.12, 'vorher 0');
});

test('reportBaukasten: was keine Zahl ist, bleibt 0 — nicht geraten', () => {
  const erg = baueReport(
    [{ w: 'siehe Anlage' }, { w: null }, { w: '8,20 x' }, { w: 100 }],
    { metrik: 'summe', summeFeld: 'w', gruppeFeld: null },
  );
  assert.equal(erg.gesamt, 100);
});

test('reportBaukasten: Anzahl-Auswertungen bleiben unveraendert', () => {
  const rows = [{ status: 'a' }, { status: 'a' }, { status: 'b' }];
  const erg = baueReport(rows, { metrik: 'anzahl', gruppeFeld: 'status' });
  assert.equal(erg.gesamt, 3);
  assert.equal(erg.istGeld, false);
  assert.equal(erg.zeilen[0].wert, 2);
});

// ===========================================================================
// TEIL 2 — DIE VORSORGE: RUNDUNG SYMMETRISCH UM NULL
// ===========================================================================

test('VORSORGE: die Cent-Rundung kippt negative Betraege nicht mehr nach oben', () => {
  // Die alte Formel Math.round((n + EPSILON) * 100) / 100 — gemessen:
  const alt = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  assert.equal(alt(-0.005), -0);
  assert.equal(alt(-1234.565), -1234.56);

  // So rechnet die eine Stelle in lib/zahlen.ts:
  assert.equal(centRunden(-0.005), -0.01);
  assert.equal(centRunden(-1234.565), -1234.57);
  assert.equal(centRunden(0.005), 0.01);
  assert.equal(centRunden(1234.565), 1234.57);
});

test('VORSORGE cashflow: ein negativer Startsaldo rundet symmetrisch', () => {
  const v = liquiditaetsVorschau({
    startSaldo: -1234.565, offene: [], fixkostenProMonat: 0,
    jetztIso: '2026-09-21T00:00:00.000Z', wochen: 1,
  });
  assert.equal(v.startSaldo, -1234.57, 'vorher -1234.56');
});

test('VORSORGE belegCheck: eine Gutschrift rundet symmetrisch', () => {
  // Eine Gutschrift mit einem Netto aus Menge mal Stueckpreis: -1.234,565.
  const k = pruefeKonsistenz(-1234.565, 0, -1234.57);
  assert.equal(k.bruttoSoll, -1234.57, 'vorher -1234.56');
  assert.equal(k.differenz, 0, 'vorher -0.01 — eine Warnung aus dem Nichts');
  assert.equal(k.stimmt, true);
});

test('belegCheck: eine glatte Gutschrift bleibt stimmig', () => {
  const k = pruefeKonsistenz(-1000, -190, -1190);
  assert.equal(k.geprueft, true);
  assert.equal(k.stimmt, true);
  assert.equal(k.bruttoSoll, -1190);
  assert.equal(k.differenz, 0);
});

test('WARUM DER CENT-FEHLER SELTEN ZUSCHLAEGT — und warum er trotzdem weg muss', () => {
  // Gleitkomma sorgt oft von selbst dafuer, dass der Grenzfall knapp
  // verfehlt wird: 99,995 minus 100 ist in JavaScript nicht -0,005,
  // sondern -0,004999999999995. Dann rundet JEDE Fassung auf -0,00.
  assert.notEqual(99.995 - 100, -0.005);
  assert.equal(centRunden(99.995 - 100), -0);

  // Kommt der Wert dagegen direkt so aus der Datenbank, schlaegt er zu.
  assert.equal(centRunden(-0.005), -0.01);
});

test('VORSORGE reportBaukasten: eine Gutschrift-Summe rundet symmetrisch', () => {
  const erg = baueReport(
    [{ w: -1234.565 }],
    { metrik: 'summe', summeFeld: 'w', gruppeFeld: null },
  );
  assert.equal(erg.gesamt, -1234.57, 'vorher -1234.56');
});

// ===========================================================================
// TEIL 3 — WAS UNVERAENDERT BLEIBEN MUSS
// ===========================================================================

test('cashflow: die Unterdeckungs-Warnung arbeitet wie bisher', () => {
  const v = liquiditaetsVorschau({
    startSaldo: 300, offene: [], fixkostenProMonat: 1000,
    jetztIso: '2026-09-21T00:00:00.000Z', wochen: 3,
  });
  assert.equal(v.fixkostenProWoche, 230.77);
  assert.equal(v.punkte[0].saldo, 69.23);
  assert.equal(v.punkte[1].saldo, -161.54);
  assert.equal(v.punkte[1].unterdeckung, true);
  assert.equal(v.ersteUnterdeckung, v.punkte[1].start);
});

test('cashflow: Rechnungen ohne Termin bleiben aussen vor und werden ausgewiesen', () => {
  const v = liquiditaetsVorschau({
    startSaldo: 0,
    offene: [{ rest: '1.000,00', faelligkeitsdatum: null }],
    fixkostenProMonat: 0,
    jetztIso: '2026-09-21T00:00:00.000Z', wochen: 2,
  });
  assert.equal(v.offeneOhneTermin, 1000, 'vorher 0 — auch der Ausweis war falsch');
  assert.equal(v.summeZufluss, 0, 'konservativ: nicht eingeplant');
  assert.equal(v.endSaldo, 0);
});

test('cashflow: fehlt Netto oder Brutto, wird gar nicht geprueft', () => {
  assert.equal(pruefeKonsistenz(null, 19, 119).geprueft, false);
  assert.equal(pruefeKonsistenz(100, 19, null).geprueft, false);
  assert.equal(pruefeKonsistenz(null, 19, 119).stimmt, true, 'keine Warnung ohne Grundlage');
});

test('belegCheck: die Dubletten-Erkennung ist unangetastet', () => {
  const liste = [{ id: 'a', belegnummer: 'RE-100', lieferant: 'Meier GmbH' }];
  assert.equal(istDublette({ belegnummer: 're 100', lieferant: 'meier  gmbh' }, liste), true);
  assert.equal(istDublette({ belegnummer: 'RE-101', lieferant: 'Meier GmbH' }, liste), false);
  assert.equal(istDublette({ belegnummer: '', lieferant: 'Meier GmbH' }, liste), false);
  assert.equal(istDublette({ id: 'a', belegnummer: 'RE-100', lieferant: 'Meier GmbH' }, liste, 'a'), false);
});

test('reportBaukasten: Anzeige und CSV sind unangetastet', () => {
  assert.equal(formatWert(1234.5, false), '1.234,5');
  assert.ok(formatWert(1234.5, true).includes('1.234,50'));
  const erg = baueReport([{ w: 10, g: 'A' }], { metrik: 'summe', summeFeld: 'w', gruppeFeld: 'g' });
  const csv = reportCsv(erg, 'Gruppe', 'Summe');
  assert.ok(csv.startsWith('Gruppe;Summe;Anteil %'));
  assert.ok(csv.includes('Gesamt;10;100'));
});
