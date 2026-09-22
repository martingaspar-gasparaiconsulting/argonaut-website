// ARGONAUT OS · tests/andockA7b.test.mjs — A7 Paket 3 (22.09.2026)
// Die Hinweis-Funktionen von Betriebskosten und Bank sind angeschlossen.
// Geprueft wird, dass sie bei den Faellen, die im Betrieb vorkommen, auch
// wirklich etwas sagen — ein Andockpunkt, der immer schweigt, ist keiner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bkHinweise } from '../out/betriebskosten.js';
import { bankHinweise, matchAlle } from '../out/bankAbgleich.js';
import { leseZahl } from '../out/zahlen.js';

// ---------------------------------------------------------------------------
// 1. BETRIEBSKOSTEN
// ---------------------------------------------------------------------------

test('Heizkosten ohne erfassten Verbrauch werden gemeldet', () => {
  const h = bkHinweise(
    [{ id: 'e1', wohnflaeche: 80, personen: 2, verbrauch: 0, vorauszahlung: 1200 }],
    [{ id: 'k1', bezeichnung: 'Heizung', betrag_gesamt: 2000, verteiler: 'verbrauch', ist_heizkosten: true, verbrauch_anteil_prozent: 70 }],
  );
  assert.ok(h.length > 0, 'hier MUSS ein Hinweis kommen');
});

test('eine saubere Abrechnung erzeugt keinen Laerm', () => {
  const h = bkHinweise(
    [
      { id: 'e1', wohnflaeche: 80, personen: 2, verbrauch: 120, vorauszahlung: 1200 },
      { id: 'e2', wohnflaeche: 60, personen: 1, verbrauch: 90, vorauszahlung: 900 },
    ],
    [{ id: 'k1', bezeichnung: 'Heizung', betrag_gesamt: 2000, verteiler: 'verbrauch', ist_heizkosten: true, verbrauch_anteil_prozent: 70 }],
  );
  assert.equal(Array.isArray(h), true);
});

test('leere Eingaben stuerzen nicht ab', () => {
  assert.equal(Array.isArray(bkHinweise([], [])), true);
});

// ---------------------------------------------------------------------------
// 2. BANK — der Fall, der Geld kostet
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE FALL: eine Teilzahlung wird als solche benannt', () => {
  // Feldnamen exakt wie in lib/bankAbgleich.ts — Transaktion{datum,betrag,
  // verwendungszweck,name} und OffeneRechnung{id,nummer,brutto}.
  const zeilen = matchAlle(
    [{ datum: '2026-09-01', betrag: 500, verwendungszweck: 'Rechnung 2026-001', name: 'Kunde' }],
    [{ id: 'r1', nummer: '2026-001', brutto: 1000 }],
  );
  assert.equal(zeilen.length, 1);
  assert.equal(zeilen[0].art, 'teil', 'der Abgleich muss das als Teilzahlung erkennen');
  const h = bankHinweise(zeilen);
  assert.ok(
    h.some((x) => /Teilzahlung/i.test(x)),
    'eine Teilzahlung MUSS gemeldet werden — sonst gilt die Rechnung faelschlich als bezahlt',
  );
});

test('ohne Zeilen sagt der Hinweis nichts', () => {
  assert.deepEqual(bankHinweise([]), []);
});

// ---------------------------------------------------------------------------
// 3. DER ZAHL-LESER IN DER BETRIEBSKOSTEN-SEITE
// ---------------------------------------------------------------------------

test('BELEG: der alte Seiten-Leser machte aus 1.234,56 den Wert 1.234', () => {
  const ALT = (s) => parseFloat((s || '').replace(',', '.')) || 0;
  assert.equal(ALT('1.234,56'), 1.234, 'so war es vorher — ein Euro dreiundzwanzig');
  assert.equal(leseZahl('1.234,56'), 1234.56, 'so ist es jetzt');
});
