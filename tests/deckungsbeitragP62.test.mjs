// ============================================================================
// tests/deckungsbeitragP62.test.mjs
//
// PUNKT 62 — DIE NACHKALKULATION EHRLICH MACHEN (21.09.2026)
//
// ▄▄▄ DER BEFUND, an lib/nachkalkulation.ts selbst belegt ▄▄▄
// Der ausgewiesene "Deckungsbeitrag" war erbracht minus Material.
// `erbracht` ist Stunden mal VERKAUFSPREIS. Die LOHNKOSTEN fehlten
// vollstaendig — was dort stand, war Umsatz minus Material.
//
// ▄▄▄ WIE REPARIERT ▄▄▄
// REIN ADDITIV. `deckungsbeitrag` und `marge` bleiben Zeichen fuer Zeichen,
// was sie waren; die Ampel bleibt auch. NEU daneben: lohnkosten,
// deckungsbeitragEcht, margeEcht, lohnkostenAngesetzt.
// Ohne uebergebenen Selbstkostensatz aendert sich GAR NICHTS.
//
// ▄▄▄ DIE FEHLER, DIE DIESE TESTS FESTNAGELN ▄▄▄
//  1. Den Lohn weiter weglassen.
//  2. Ohne hinterlegten Satz so tun, als waere der Lohn null.
//  3. Den VERKAUFS-Stundensatz als Selbstkosten abziehen (ergaebe immer null).
//  4. Die bestehende Anzeige still umdefinieren.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  baueKalkulation, summeKalk, lohnHinweise, margeKlartext, kalkStatus,
} from '../out/nachkalkulation.js';

// Der Fall aus der Bauliste: 100 Stunden zu 75 EUR, Material 2.000 EUR.
const PROJEKTE = [{ id: 'p1', name: 'Bad Mueller', budget: 9000 }];
const LEISTUNGEN = [{ projekt_id: 'p1', stunden: 100, stundensatz: 75, abgerechnet: false }];
const KOSTEN = [{ projekt_id: 'p1', betrag: 2000 }];

// ===========================================================================
// TEIL 1 — DER GEMESSENE FALL
// ===========================================================================

test('GEMESSEN: was heute angezeigt wird', () => {
  const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN);
  assert.equal(k.erbracht, 7500);
  assert.equal(k.kosten, 2000);
  assert.equal(k.deckungsbeitrag, 5500);
  assert.equal(k.marge, 73.33, 'so steht es heute auf der Seite');
});

test('GEMESSEN: was mit 38 EUR Selbstkosten je Stunde wirklich bleibt', () => {
  const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 38 });
  assert.equal(k.lohnkosten, 3800, '100 Stunden mal 38 EUR');
  assert.equal(k.deckungsbeitragEcht, 1700, '7.500 minus 2.000 Material minus 3.800 Lohn');
  assert.equal(k.margeEcht, 22.67);
  assert.equal(k.lohnkostenAngesetzt, true);
});

test('GEMESSEN: mit dem aus Punkt 61 hergeleiteten Satz von 44,77 EUR', () => {
  const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 44.77 });
  assert.equal(k.lohnkosten, 4477);
  assert.equal(k.deckungsbeitragEcht, 1023);
  assert.equal(k.margeEcht, 13.64, 'aus angezeigten 73,3 Prozent werden 13,6');
});

test('FEHLER 4 — die alten Felder bleiben unveraendert, egal welcher Satz kommt', () => {
  const ohne = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN)[0];
  const mit = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 38 })[0];
  for (const feld of ['budget', 'erbracht', 'abgerechnet', 'offen', 'stunden', 'kosten',
    'deckungsbeitrag', 'marge', 'differenz', 'auslastung', 'status', 'leistungPlusKosten', 'luft']) {
    assert.deepEqual(mit[feld], ohne[feld], 'Feld ' + feld + ' hat sich geaendert');
  }
});

test('die Ampel bleibt, wie sie ist — Entscheidung aus Punkt 23', () => {
  const mit = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 200 })[0];
  assert.equal(mit.status, kalkStatus(9000, 7500));
  assert.ok(mit.deckungsbeitragEcht < 0, 'auch bei tiefroter Rechnung');
  assert.equal(mit.status, 'im_budget', '7.500 von 9.000 sind 83,3 Prozent — unter der 85-Prozent-Schwelle');
});

// ===========================================================================
// TEIL 2 — FEHLER 2: OHNE SATZ NICHT SO TUN, ALS WAERE DER LOHN NULL
// ===========================================================================

test('FEHLER 2 — ohne Satz wird das ausdruecklich gemeldet, nicht mit null gerechnet', () => {
  const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN);
  assert.equal(k.lohnkostenAngesetzt, false);
  assert.equal(k.lohnkosten, 0);
  assert.equal(k.deckungsbeitragEcht, k.deckungsbeitrag, 'ohne Satz bleibt es beim alten Wert');

  const h = lohnHinweise([k]);
  assert.ok(h.some((s) => /kein Selbstkostensatz/.test(s)));
  assert.ok(h.some((s) => /Lohnkosten fehlen/.test(s)));
});

test('ein Satz von 0 oder Unsinn zaehlt als NICHT hinterlegt', () => {
  for (const satz of [0, -5, null, undefined, NaN, 'abc']) {
    const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: satz });
    assert.equal(k.lohnkostenAngesetzt, false, 'Satz ' + String(satz));
    assert.equal(k.lohnkosten, 0, 'Satz ' + String(satz));
  }
});

test('ein deutscher Zahltext als Satz wird gelesen', () => {
  const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: '44,77' });
  assert.equal(k.lohnkosten, 4477, 'der gemeinsame Leser aus lib/zahlen.ts greift');
});

// ===========================================================================
// TEIL 3 — FEHLER 3: NICHT DEN VERKAUFSSATZ ABZIEHEN
// ===========================================================================

test('FEHLER 3 — der Verkaufssatz als Selbstkosten ergaebe immer genau null', () => {
  // 75 EUR ist der VERKAUFSpreis. Wer ihn als Selbstkosten einsetzt, bekommt
  // erbracht − Lohn = 0 und haelt das womoeglich fuer ein Ergebnis.
  const [k] = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 75 });
  assert.equal(k.lohnkosten, 7500);
  assert.equal(k.deckungsbeitragEcht, -2000, 'genau die Materialkosten bleiben uebrig');
  // Der Test steht hier, damit die Bedeutung des Parameters festgenagelt ist:
  // er ist NICHT der Satz aus projektleistungen.
  assert.notEqual(k.deckungsbeitragEcht, 0);
});

// ===========================================================================
// TEIL 4 — DIE HINWEISE
// ===========================================================================

test('ein Projekt, das sich nach Lohn nicht mehr traegt, wird benannt', () => {
  const h = lohnHinweise(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 60 }));
  assert.ok(h.some((s) => /trägt sich .* nicht/.test(s)), JSON.stringify(h));
  assert.ok(h.some((s) => /Bad Mueller/.test(s)));
});

test('der wichtigste Hinweis: gut aussehende Marge, duenne Wirklichkeit', () => {
  const h = lohnHinweise(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 44.77 }));
  assert.ok(h.some((s) => /deutlich besser aus, als sie ist/.test(s)), JSON.stringify(h));
  assert.ok(h.some((s) => /73,3 % gegen 13,6 %/.test(s)), JSON.stringify(h));
});

test('eine duenne, aber positive Marge wird auch gemeldet', () => {
  const h = lohnHinweise(baueKalkulation(
    [{ id: 'p2', name: 'Kleinauftrag', budget: 1000 }],
    [{ projekt_id: 'p2', stunden: 10, stundensatz: 50 }],
    [{ projekt_id: 'p2', betrag: 30 }],
    { selbstkostenJeStunde: 46 },
  ));
  // 500 erbracht, 30 Material, 460 Lohn -> 10 EUR, 2 Prozent
  assert.ok(h.some((s) => /unter 5 % echter Marge/.test(s)), JSON.stringify(h));
});

test('ein gesundes Projekt bekommt keinen Hinweis', () => {
  const h = lohnHinweise(baueKalkulation(
    [{ id: 'p3', name: 'Gut', budget: 10000 }],
    [{ projekt_id: 'p3', stunden: 100, stundensatz: 95 }],
    [{ projekt_id: 'p3', betrag: 500 }],
    { selbstkostenJeStunde: 44.77 },
  ));
  assert.deepEqual(h, []);
});

test('ohne erbrachte Leistung gibt es nichts zu melden', () => {
  assert.deepEqual(lohnHinweise([]), []);
  assert.deepEqual(lohnHinweise(baueKalkulation(PROJEKTE, [], [])), []);
});

// ===========================================================================
// TEIL 5 — DIE SUMME
// ===========================================================================

test('die Summe traegt die Lohn-Felder mit', () => {
  const s = summeKalk(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 38 }));
  assert.equal(s.lohnkosten, 3800);
  assert.equal(s.deckungsbeitragEcht, 1700);
  assert.equal(s.margeEcht, 22.67);
  assert.equal(s.lohnkostenAngesetzt, true);
  assert.equal(s.deckungsbeitrag, 5500, 'die alte Summe bleibt daneben stehen');
  assert.equal(s.marge, 73.33);
});

test('angesetzt heisst BEI ALLEN — eine halbe Summe waere irrefuehrend', () => {
  const gemischt = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 38 });
  gemischt.push({ ...gemischt[0], id: 'p9', name: 'Ohne', lohnkostenAngesetzt: false, lohnkosten: 0 });
  assert.equal(summeKalk(gemischt).lohnkostenAngesetzt, false);
});

test('eine leere Liste ist nicht angesetzt und ergibt keine NaN', () => {
  const s = summeKalk([]);
  assert.equal(s.lohnkostenAngesetzt, false);
  assert.equal(s.margeEcht, 0);
  assert.equal(s.deckungsbeitragEcht, 0);
});

// ===========================================================================
// TEIL 6 — DER KLARTEXT
// ===========================================================================

test('ohne Satz sagt der Klartext ausdruecklich, dass es KEINE Marge ist', () => {
  const t = margeKlartext(summeKalk(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN)));
  assert.match(t, /NICHT die Marge/);
  assert.match(t, /Umsatz minus Material/);
});

test('mit Satz nennt der Klartext beide Zahlen nebeneinander', () => {
  const t = margeKlartext(summeKalk(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 44.77 })));
  assert.match(t, /4\.477,00 EUR Lohn/);
  assert.match(t, /1\.023,00 EUR/);
  assert.match(t, /13,6 %/);
  assert.match(t, /73,3 %/, 'die alte Zahl steht daneben, damit der Sprung erklaerbar ist');
});

test('ohne Leistung bleibt der Klartext kurz', () => {
  assert.match(margeKlartext(summeKalk([])), /Noch keine erbrachte Leistung/);
});

// ===========================================================================
// TEIL 7 — MEHRERE PROJEKTE UND RUNDEN
// ===========================================================================

test('mehrere Projekte werden einzeln gerechnet und dann summiert', () => {
  const k = baueKalkulation(
    [{ id: 'a', name: 'A', budget: 5000 }, { id: 'b', name: 'B', budget: 5000 }],
    [
      { projekt_id: 'a', stunden: 40, stundensatz: 80 },
      { projekt_id: 'b', stunden: 60, stundensatz: 70 },
    ],
    [{ projekt_id: 'a', betrag: 500 }],
    { selbstkostenJeStunde: 45 },
  );
  const a = k.find((x) => x.id === 'a');
  const b = k.find((x) => x.id === 'b');
  assert.equal(a.lohnkosten, 1800);
  assert.equal(a.deckungsbeitragEcht, 900, '3.200 erbracht minus 500 Material minus 1.800 Lohn');
  assert.equal(b.lohnkosten, 2700);
  assert.equal(b.deckungsbeitragEcht, 4200 - 2700);
  const s = summeKalk(k);
  assert.equal(s.lohnkosten, 4500);
});

test('Stunden als deutscher Text werden gelesen und fliessen in den Lohn', () => {
  const [k] = baueKalkulation(
    [{ id: 'p', name: 'P', budget: 1000 }],
    [{ projekt_id: 'p', stunden: '10,5', stundensatz: '80,00' }],
    [],
    { selbstkostenJeStunde: 44.77 },
  );
  assert.equal(k.stunden, 10.5);
  assert.equal(k.lohnkosten, 470.09, '10,5 mal 44,77');
});

test('ein negativer echter Deckungsbeitrag wird symmetrisch gerundet', () => {
  const [k] = baueKalkulation(
    [{ id: 'p', name: 'P', budget: 100 }],
    [{ projekt_id: 'p', stunden: 1, stundensatz: 10 }],
    [{ projekt_id: 'p', betrag: 12.345 }],
    { selbstkostenJeStunde: 0.01 },
  );
  // 10 − 12,35 (Material, symmetrisch gerundet) − 0,01 = −2,36
  assert.equal(k.kosten, 12.35);
  assert.equal(k.deckungsbeitragEcht, -2.36);
});
