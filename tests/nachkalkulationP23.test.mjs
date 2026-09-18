import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kalkStatus, baueKalkulation, summeKalk, fixpreisHinweise,
} from '../out/nachkalkulation.js';

// ===========================================================================
// PUNKT 23 — Budget-/Fixpreis-Prüfung (18.09.2026)
//
// Am echten Code GEMESSEN, bevor etwas geaendert wurde:
//   Budget "12.500,00" -> budget 0, status 'kein_budget', Auslastung 0,
//     obwohl 6.000 EUR Leistung erbracht waren. Die Pruefung fand nicht statt.
//   Budget 10.000, erbracht 9.000, Kosten 8.000 -> Status 'knapp',
//     obwohl Leistung und Material zusammen 17.000 EUR ausmachen.
//   r2(-2,345) -> -2,34 statt -2,35.
// Die Datei hatte keinen einzigen Test.
// ===========================================================================

// ── 1) Zahlen aus der Datenbank ────────────────────────────────────────────

test('Ein Budget in deutscher Schreibweise wird gelesen, nicht zu 0 gemacht', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: '12.500,00' }],
    [{ projekt_id: '1', stunden: 100, stundensatz: 60 }],
    [],
  )[0];
  assert.equal(k.budget, 12500, 'vorher 0 — und damit gar keine Pruefung');
  assert.equal(k.erbracht, 6000);
  assert.equal(k.status, 'im_budget', 'vorher "kein_budget"');
  assert.equal(k.auslastung, 48);
});

test('Auch Stunden, Stundensatz und Kosten duerfen Text sein', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'P', budget: 10000 }],
    [{ projekt_id: '1', stunden: '12,5', stundensatz: '80,00' }],
    [{ projekt_id: '1', betrag: '1.250,50' }],
  )[0];
  assert.equal(k.stunden, 12.5);
  assert.equal(k.erbracht, 1000);
  assert.equal(k.kosten, 1250.5);
  assert.equal(k.deckungsbeitrag, -250.5);
});

test('Unlesbare Zahlen bleiben 0 — die Datei hat nie geworfen und tut es weiter nicht', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'P', budget: 'kein Budget vereinbart' }],
    [{ projekt_id: '1', stunden: 'viele', stundensatz: 80 }],
    [],
  )[0];
  assert.equal(k.budget, 0);
  assert.equal(k.erbracht, 0);
  assert.equal(k.status, 'kein_budget');
});

// ── 2) Rundung ─────────────────────────────────────────────────────────────

test('Negative Betraege runden symmetrisch um Null', () => {
  // Eine Gutschrift auf Material ist ein negativer Kostenbetrag.
  // Alt: Math.round((-2.345 + EPSILON) * 100) / 100 = -2,34. Richtig: -2,35.
  const k = baueKalkulation(
    [{ id: '1', name: 'P', budget: 0 }],
    [],
    [{ projekt_id: '1', betrag: -2.345 }],
  )[0];
  assert.equal(k.kosten, -2.35, 'vorher -2,34');
  assert.equal(k.deckungsbeitrag, 2.35);
});

test('Die Marge wird auch negativ sauber ausgewiesen', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'P', budget: 5000 }],
    [{ projekt_id: '1', stunden: 10, stundensatz: 100 }],
    [{ projekt_id: '1', betrag: 1200 }],
  )[0];
  assert.equal(k.deckungsbeitrag, -200);
  assert.equal(k.marge, -20);
});

test('GRENZE von centRunden, hier festgehalten statt uebersehen', () => {
  // -23,45 / 1.000 x 100 ergibt in Gleitkomma NICHT -2,345, sondern
  // -2.3449999999999998. centRunden hebt mit Number.EPSILON genau EINE
  // Einheit an; dieser Wert liegt eine weitere darunter und kippt deshalb
  // auf -2,34. Das ist eine Grenze des Cent-Runders aus Punkt 12 und gilt
  // ueberall im Haus, nicht nur hier. Fuer BETRAEGE spielt es keine Rolle
  // (die kommen bereits auf zwei Stellen gerundet an), fuer aus Divisionen
  // abgeleitete PROZENTWERTE an der halben Cent-Grenze schon.
  const k = baueKalkulation(
    [{ id: '1', name: 'P', budget: 5000 }],
    [{ projekt_id: '1', stunden: 10, stundensatz: 100 }],
    [{ projekt_id: '1', betrag: 1023.45 }],
  )[0];
  assert.equal(k.deckungsbeitrag, -23.45, 'der BETRAG stimmt auf den Cent');
  assert.equal(k.marge, -2.34, 'die PROZENTZAHL kippt an der Grenze — bekannt und festgehalten');
});

// ── 3) Die Ampel bleibt, wie sie ist ───────────────────────────────────────

test('kalkStatus verhaelt sich unveraendert', () => {
  assert.equal(kalkStatus(0, 100), 'kein_budget');
  assert.equal(kalkStatus(1000, 500), 'im_budget');
  assert.equal(kalkStatus(1000, 849), 'im_budget');
  assert.equal(kalkStatus(1000, 850), 'knapp');
  assert.equal(kalkStatus(1000, 1000), 'knapp');
  assert.equal(kalkStatus(1000, 1001), 'ueber_budget');
});

test('Die Sortierung stellt die gefaehrdeten Projekte nach oben', () => {
  const k = baueKalkulation(
    [
      { id: 'a', name: 'Im Budget', budget: 10000 },
      { id: 'b', name: 'Drueber', budget: 1000 },
      { id: 'c', name: 'Ohne', budget: 0 },
    ],
    [
      { projekt_id: 'a', stunden: 10, stundensatz: 100 },
      { projekt_id: 'b', stunden: 20, stundensatz: 100 },
      { projekt_id: 'c', stunden: 5, stundensatz: 100 },
    ],
  );
  assert.deepEqual(k.map((x) => x.name), ['Drueber', 'Im Budget', 'Ohne']);
});

// ── 4) Die neuen Kennzahlen ────────────────────────────────────────────────

test('Leistung plus Material steht jetzt als eigene Zahl da', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: 10000 }],
    [{ projekt_id: '1', stunden: 100, stundensatz: 90 }],
    [{ projekt_id: '1', betrag: 8000 }],
  )[0];
  assert.equal(k.erbracht, 9000);
  assert.equal(k.kosten, 8000);
  assert.equal(k.leistungPlusKosten, 17000);
  assert.equal(k.luft, -7000, 'das Budget deckt es nicht mehr');
  assert.equal(k.status, 'knapp', 'die Ampel bleibt bewusst unveraendert');
});

test('Die Summenzeile stimmt mit den Zeilen ueberein', () => {
  const k = baueKalkulation(
    [{ id: 'a', name: 'A', budget: '5.000,00' }, { id: 'b', name: 'B', budget: 2000 }],
    [{ projekt_id: 'a', stunden: 10, stundensatz: 100, abgerechnet: true }, { projekt_id: 'b', stunden: 30, stundensatz: 100 }],
    [{ projekt_id: 'a', betrag: 200 }],
  );
  const s = summeKalk(k);
  assert.equal(s.budget, 7000);
  assert.equal(s.erbracht, 4000);
  assert.equal(s.abgerechnet, 1000);
  assert.equal(s.offen, 3000);
  assert.equal(s.kosten, 200);
  assert.equal(s.deckungsbeitrag, 3800);
  assert.equal(s.ueberBudget, 1, 'B liegt mit 3.000 ueber 2.000');
  // und die Summe ist wirklich die Summe der Zeilen
  assert.equal(s.erbracht, k.reduce((x, y) => x + y.erbracht, 0));
  assert.equal(s.kosten, k.reduce((x, y) => x + y.kosten, 0));
});

// ── 5) Die Hinweise ────────────────────────────────────────────────────────

test('Ohne Budget sagt der Hinweis ausdruecklich, dass nicht geprueft wird', () => {
  const k = baueKalkulation([{ id: '1', name: 'Halle', budget: 0 }], [{ projekt_id: '1', stunden: 10, stundensatz: 100 }]);
  const h = fixpreisHinweise(k).join(' | ');
  assert.ok(h.includes('ohne hinterlegtes Budget'), h);
  assert.ok(h.includes('keine Prüfung'), h);
  assert.ok(h.includes('Halle'), h);
});

test('Mehr abgerechnet als Budget wird beim Namen genannt', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: 1000 }],
    [{ projekt_id: '1', stunden: 15, stundensatz: 100, abgerechnet: true }],
  );
  const h = fixpreisHinweise(k).join(' | ');
  assert.ok(h.includes('über das Budget hinaus abgerechnet'), h);
  assert.ok(h.includes('1.500,00 EUR') && h.includes('1.000,00 EUR'), h);
});

test('Leistung plus Material ueber Budget wird mit dem Fehlbetrag genannt', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: 10000 }],
    [{ projekt_id: '1', stunden: 100, stundensatz: 90 }],
    [{ projekt_id: '1', betrag: 8000 }],
  );
  const h = fixpreisHinweise(k).join(' | ');
  assert.ok(h.includes('Leistung und Material zusammen'), h);
  assert.ok(h.includes('17.000,00 EUR'), h);
  assert.ok(h.includes('7.000,00 EUR darüber'), h);
});

test('Negativer Deckungsbeitrag wird gemeldet', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: 50000 }],
    [{ projekt_id: '1', stunden: 10, stundensatz: 100 }],
    [{ projekt_id: '1', betrag: 3000 }],
  );
  const h = fixpreisHinweise(k).join(' | ');
  assert.ok(h.includes('negativem Deckungsbeitrag'), h);
  assert.ok(h.includes('-2.000,00 EUR'), h);
});

test('Nicht abrechenbare Restleistung bei vollem Budget wird gemeldet', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: 1000 }],
    [
      { projekt_id: '1', stunden: 10, stundensatz: 100, abgerechnet: true },
      { projekt_id: '1', stunden: 5, stundensatz: 100 },
    ],
  );
  const h = fixpreisHinweise(k).join(' | ');
  assert.ok(h.includes('Budget bereits voll fakturiert'), h);
  assert.ok(h.includes('500,00 EUR offen'), h);
});

test('Ein sauberes Projekt erzeugt keine Hinweise', () => {
  const k = baueKalkulation(
    [{ id: '1', name: 'Halle', budget: 10000 }],
    [{ projekt_id: '1', stunden: 10, stundensatz: 100, abgerechnet: true }],
    [{ projekt_id: '1', betrag: 200 }],
  );
  assert.deepEqual(fixpreisHinweise(k), []);
});

// ── 6) Die Kette ───────────────────────────────────────────────────────────

test('KETTE: ein Projekt mit Text-Budget wird jetzt wirklich geprueft', () => {
  // Vorher: budget 0 -> 'kein_budget' -> keine Warnung, obwohl das Projekt
  // sein Budget um 3.000 EUR ueberzieht.
  const k = baueKalkulation(
    [{ id: '1', name: 'Dachsanierung', budget: '12.500,00' }],
    [{ projekt_id: '1', stunden: 150, stundensatz: '100,00' }],
    [{ projekt_id: '1', betrag: '3.000,00' }],
  );
  assert.equal(k[0].status, 'ueber_budget');
  assert.equal(k[0].differenz, -2500);
  assert.equal(k[0].luft, -5500);
  const h = fixpreisHinweise(k).join(' | ');
  assert.ok(h.includes('Dachsanierung'), h);
  assert.ok(h.includes('Leistung und Material zusammen'), h);
});
