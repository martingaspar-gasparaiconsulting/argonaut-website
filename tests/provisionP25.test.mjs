import test from 'node:test';
import assert from 'node:assert/strict';
import {
  istProvisionsfaehig, provisionBetrag, empfaengerName, proEmpfaenger,
  provisionSummen, formatEuro, satzPlausibel, provisionHinweise,
} from '../out/provision.js';

// ===========================================================================
// PUNKT 25 — Provisionen (18.09.2026)
//
// Am echten Code GEMESSEN, bevor etwas geaendert wurde:
//   wert_netto "12.500,00", 5 %  -> 0 EUR        (statt 625 EUR)
//   wert_netto "12.500",    5 %  -> 0,63 EUR     (statt 625 EUR)
//   provision_prozent "7,5 %"    -> 0 EUR        — und die Seite SPEICHERT 7,5
//   150 % auf 1.000 EUR          -> 1.500 EUR, ohne ein Wort
//   formatEuro(1234.56)          -> "1.235 €"    (ganze Euro)
//   r2(-2,345)                   -> -2,34        (statt -2,35)
// Im Dateikopf stand "Node-getestet (provision.test.ts)" — gibt es nicht.
// ===========================================================================

const D = (o) => ({ id: 'x', titel: 'Deal', stufe: 'gewonnen', ...o });

// ── 1) Der Widerspruch zwischen Vorschau und gespeichertem Wert ────────────

test('Ein Prozentsatz mit Komma und Zeichen wird gelesen', () => {
  // Genau das gibt die Seite beim Tippen weiter (page.tsx Z. 159).
  assert.equal(provisionBetrag(D({ wert_netto: 10000, provision_prozent: '7,5 %' })), 750, 'vorher 0');
  assert.equal(provisionBetrag(D({ wert_netto: 10000, provision_prozent: '7,5' })), 750);
  assert.equal(provisionBetrag(D({ wert_netto: 10000, provision_prozent: '7.5' })), 750);
  assert.equal(provisionBetrag(D({ wert_netto: 10000, provision_prozent: 7.5 })), 750);
});

test('Ein Deal-Wert in deutscher Schreibweise wird gelesen', () => {
  assert.equal(provisionBetrag(D({ wert_netto: '12.500,00', provision_prozent: 5 })), 625, 'vorher 0');
  assert.equal(provisionBetrag(D({ wert_netto: '12.500', provision_prozent: 5 })), 625, 'vorher 0,63');
  assert.equal(provisionBetrag(D({ wert_netto: '1.234,56', provision_prozent: 10 })), 123.46);
  assert.equal(provisionBetrag(D({ wert_netto: 12500, provision_prozent: 5 })), 625, 'Zahlen bleiben Zahlen');
});

test('Was nicht lesbar ist, ergibt 0 — und nie NaN', () => {
  for (const w of ['abc', '', null, undefined, NaN]) {
    const b = provisionBetrag(D({ wert_netto: w, provision_prozent: 5 }));
    assert.ok(Number.isFinite(b), `${String(w)} muss eine endliche Zahl ergeben`);
    assert.equal(b, 0);
  }
});

// ── 2) Wer ueberhaupt eine Provision bekommt ───────────────────────────────

test('Nur gewonnene Deals mit Satz erzeugen eine Provision', () => {
  assert.equal(istProvisionsfaehig(D({ provision_prozent: 5 })), true);
  assert.equal(istProvisionsfaehig(D({ stufe: 'verhandlung', provision_prozent: 5 })), false);
  assert.equal(istProvisionsfaehig(D({ provision_prozent: 0 })), false);
  assert.equal(istProvisionsfaehig(D({ provision_prozent: null })), false);
  assert.equal(provisionBetrag(D({ stufe: 'verloren', wert_netto: 10000, provision_prozent: 5 })), 0);
});

test('Ein Satz mit Komma macht einen Deal provisionsfaehig', () => {
  assert.equal(istProvisionsfaehig(D({ provision_prozent: '0,5' })), true, 'vorher NaN und damit nicht faehig');
});

// ── 3) Rundung ─────────────────────────────────────────────────────────────

test('Ein Storno rundet symmetrisch um Null', () => {
  // Negativer Deal-Wert = Rueckbelastung. 100 % auf -2,345 muss -2,35 sein.
  assert.equal(provisionBetrag(D({ wert_netto: -2.345, provision_prozent: 100 })), -2.35, 'vorher -2,34');
});

test('Die uebliche Rundung bleibt', () => {
  assert.equal(provisionBetrag(D({ wert_netto: 1000, provision_prozent: 3.333 })), 33.33);
  assert.equal(provisionBetrag(D({ wert_netto: 999.99, provision_prozent: 10 })), 100);
});

// ── 4) Die Anzeige ─────────────────────────────────────────────────────────

test('Euro-Betraege werden mit Cent angezeigt', () => {
  // toLocaleString setzt ein SCHMALES GESCHUETZTES Leerzeichen vor das Zeichen.
  const NBSP = '\u00A0';
  assert.equal(formatEuro(1234.56), `1.234,56${NBSP}€`, 'vorher "1.235 €"');
  assert.equal(formatEuro(0), `0,00${NBSP}€`);
  assert.equal(formatEuro('1.234,56'), `1.234,56${NBSP}€`);
  assert.equal(formatEuro('abc'), `0,00${NBSP}€`);
  assert.equal(formatEuro(-2.345), `-2,35${NBSP}€`);
  assert.ok(formatEuro(1234.56).includes(',56'), 'die Cents muessen dastehen');
});

// ── 5) Gruppierung und Summen ──────────────────────────────────────────────

const DEALS = [
  D({ id: '1', titel: 'A', wert_netto: 10000, provision_prozent: 5, provision_empfaenger: 'Meier' }),
  D({ id: '2', titel: 'B', wert_netto: '2.500,00', provision_prozent: '4', provision_empfaenger: 'Meier', provision_ausgezahlt: true }),
  D({ id: '3', titel: 'C', wert_netto: 4000, provision_prozent: 2.5, provision_empfaenger: 'Schulz' }),
  D({ id: '4', titel: 'D', wert_netto: 9000, provision_prozent: 3 }),                       // ohne Empfaenger
  D({ id: '5', titel: 'E', stufe: 'verloren', wert_netto: 50000, provision_prozent: 10 }),  // nicht faehig
];

test('Die Empfaenger-Tabelle stimmt', () => {
  const g = proEmpfaenger(DEALS);
  assert.deepEqual(g.map((x) => x.empfaenger), ['Meier', 'Ohne Empfänger', 'Schulz']);
  const meier = g.find((x) => x.empfaenger === 'Meier');
  assert.equal(meier.anzahl, 2);
  assert.equal(meier.gesamt, 600, '500 + 100 — der zweite Deal war vorher 0');
  assert.equal(meier.offen, 500);
  assert.equal(meier.ausgezahlt, 100);
});

test('Die Summenzeile stimmt mit der Tabelle ueberein', () => {
  const g = proEmpfaenger(DEALS);
  const s = provisionSummen(DEALS);
  assert.equal(s.anzahlDeals, 4);
  assert.equal(s.anzahlEmpfaenger, 3);
  assert.equal(s.gesamt, g.reduce((a, b) => a + b.gesamt, 0), 'Tabelle und Kachel muessen dasselbe sagen');
  assert.equal(s.offen, g.reduce((a, b) => a + b.offen, 0));
  assert.equal(s.ausgezahlt, g.reduce((a, b) => a + b.ausgezahlt, 0));
  assert.equal(s.gesamt, 970, '500 + 100 + 100 + 270');
  assert.equal(s.offen, 870);
  assert.equal(s.ausgezahlt, 100);
});

test('Offen plus ausgezahlt ergibt immer die Gesamtsumme', () => {
  const s = provisionSummen(DEALS);
  assert.equal(Math.round((s.offen + s.ausgezahlt) * 100) / 100, s.gesamt);
});

test('Ohne Empfaenger laufen Provisionen unter einem gemeinsamen Namen', () => {
  assert.equal(empfaengerName(D({ provision_empfaenger: '  ' })), 'Ohne Empfänger');
  assert.equal(empfaengerName(D({ provision_empfaenger: ' Meier ' })), 'Meier');
});

// ── 6) Plausibilitaet und Hinweise ─────────────────────────────────────────

test('satzPlausibel deckelt nicht, es urteilt nur', () => {
  assert.equal(satzPlausibel(5), true);
  assert.equal(satzPlausibel('7,5'), true);
  assert.equal(satzPlausibel(100), true);
  assert.equal(satzPlausibel(150), false);
  assert.equal(satzPlausibel(0), false);
  assert.equal(satzPlausibel('abc'), false);
  // und der Betrag wird trotzdem ungekuerzt gerechnet
  assert.equal(provisionBetrag(D({ wert_netto: 1000, provision_prozent: 150 })), 1500);
});

test('Ein Satz ueber 100 Prozent wird gemeldet, nicht gekuerzt', () => {
  const h = provisionHinweise([D({ titel: 'Grossauftrag', wert_netto: 1000, provision_prozent: 150, provision_empfaenger: 'Meier' })]).join(' | ');
  assert.ok(h.includes('über 100 %'), h);
  assert.ok(h.includes('Grossauftrag'), h);
  assert.ok(h.includes('NICHT gedeckelt'), h);
});

test('Nicht lesbare Werte und Saetze werden beim Namen genannt', () => {
  const h = provisionHinweise([
    D({ titel: 'Wert kaputt', wert_netto: 'ca. 10000', provision_prozent: 5, provision_empfaenger: 'Meier' }),
    D({ titel: 'Satz kaputt', wert_netto: 1000, provision_prozent: 'fuenf', provision_empfaenger: 'Meier' }),
  ]).join(' | ');
  assert.ok(h.includes('nicht lesbarem Wert'), h);
  assert.ok(h.includes('Wert kaputt'), h);
  assert.ok(h.includes('nicht lesbarem Provisionssatz'), h);
  assert.ok(h.includes('Satz kaputt'), h);
});

test('Faellige Provision ohne Empfaenger wird gemeldet', () => {
  const h = provisionHinweise([D({ titel: 'Ohne Namen', wert_netto: 9000, provision_prozent: 3 })]).join(' | ');
  assert.ok(h.includes('ohne Empfänger'), h);
  assert.ok(h.includes('Ohne Namen'), h);
});

test('Ein Storno wird als solches gemeldet', () => {
  const h = provisionHinweise([D({ titel: 'Rueckbelastung', wert_netto: -5000, provision_prozent: 5, provision_empfaenger: 'Meier' })]).join(' | ');
  assert.ok(h.includes('negativem Wert'), h);
  assert.ok(h.includes('Rueckbelastung'), h);
});

test('Ein gewonnener Deal ohne Satz wird gemeldet', () => {
  const h = provisionHinweise([D({ titel: 'Kein Satz', wert_netto: 9000, provision_prozent: null })]).join(' | ');
  assert.ok(h.includes('ohne Provisionssatz'), h);
});

test('Eine saubere Liste erzeugt keine Hinweise', () => {
  assert.deepEqual(provisionHinweise([
    D({ titel: 'Sauber', wert_netto: 10000, provision_prozent: 5, provision_empfaenger: 'Meier' }),
    D({ titel: 'Verloren', stufe: 'verloren', wert_netto: 10000, provision_prozent: null }),
  ]), []);
});

// ── 7) Die Kette ───────────────────────────────────────────────────────────

test('KETTE: so, wie die Seite beim Tippen rechnet', () => {
  // page.tsx Z. 159 gibt den Rohtext aus dem Eingabefeld weiter,
  // Z. 82 speichert mit parseFloat. Beide muessen dasselbe ergeben.
  const deal = { id: '1', titel: 'Halle', stufe: 'gewonnen', wert_netto: 24000 };
  for (const getippt of ['7,5', '7.5', '7,5 %', ' 7,5 ']) {
    const vorschau = provisionBetrag({ ...deal, provision_prozent: getippt });
    const gespeichert = provisionBetrag({ ...deal, provision_prozent: parseFloat(getippt.replace(',', '.')) });
    assert.equal(vorschau, 1800, `Vorschau bei "${getippt}"`);
    assert.equal(vorschau, gespeichert, `Vorschau und gespeicherter Wert bei "${getippt}"`);
  }
});
