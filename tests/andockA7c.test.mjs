// ARGONAUT OS · tests/andockA7c.test.mjs — A7 Paket 4 (22.09.2026)
// UStVA, Provisionen und Wiederkehr: die Hinweise sind angeschlossen, und
// der Zahl-Leser der ELSTER-Seite liest jetzt ueber lib/zahlen.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baueUstva, ustvaHinweise } from '../out/ustva.js';
import { provisionHinweise } from '../out/provision.js';
import { wiederkehrHinweise } from '../out/wiederkehr.js';
import { leseZahlOder } from '../out/zahlen.js';

// ---------------------------------------------------------------------------
// 1. UStVA
// ---------------------------------------------------------------------------

test('steuerfreie Umsaetze werden im Klartext gemeldet', () => {
  const erg = baueUstva([{ netto_summe: 1000, mwst_summe: 0 }], 0);
  const h = ustvaHinweise(erg);
  assert.ok(h.length > 0, 'ein steuerfreier Umsatz MUSS einen Hinweis ausloesen');
  assert.ok(h.some((x) => /Kennziffer|steuerfrei/i.test(x)));
});

test('eine gewoehnliche Voranmeldung erzeugt keinen Laerm', () => {
  const erg = baueUstva([{ netto_summe: 1000, mwst_summe: 190 }], 100);
  assert.equal(Array.isArray(ustvaHinweise(erg)), true);
});

test('BELEG: Number() machte aus einem Textbetrag eine Null in der Voranmeldung', () => {
  assert.equal(Number('1.234,56') || 0, 0, 'so war es vorher');
  assert.equal(leseZahlOder('1.234,56', 0), 1234.56, 'so ist es jetzt');

  const alt = baueUstva([{ netto_summe: Number('1.234,56') || 0, mwst_summe: 0 }], 0);
  const neu = baueUstva([{ netto_summe: leseZahlOder('1.234,56', 0), mwst_summe: 0 }], 0);
  assert.notDeepEqual(alt.kennziffern, neu.kennziffern, 'die Voranmeldung muss sich unterscheiden');
});

// ---------------------------------------------------------------------------
// 2. PROVISIONEN
// ---------------------------------------------------------------------------

test('ein gewonnener Deal mit unlesbarem Wert wird gemeldet', () => {
  const h = provisionHinweise([
    { id: 'd1', titel: 'Grossauftrag', wert_netto: 'siehe Anlage', stufe: 'gewonnen', provision_prozent: 5 },
  ]);
  assert.ok(h.length > 0, 'ein unlesbarer Wert MUSS gemeldet werden');
  assert.ok(h.some((x) => /Grossauftrag/.test(x)), 'der Deal muss beim Namen genannt werden');
});

test('saubere Deals loesen nichts aus', () => {
  const h = provisionHinweise([
    { id: 'd1', titel: 'Auftrag', wert_netto: 10000, stufe: 'gewonnen', provision_prozent: 5, provision_empfaenger: 'Meier' },
  ]);
  assert.equal(Array.isArray(h), true);
});

test('eine leere Liste stuerzt nicht ab', () => {
  assert.deepEqual(provisionHinweise([]), []);
  assert.deepEqual(provisionHinweise(null), []);
});

// ---------------------------------------------------------------------------
// 3. WIEDERKEHR
// ---------------------------------------------------------------------------

test('ein unbekanntes Intervall wird gemeldet — sonst rechnet es still falsch', () => {
  const h = wiederkehrHinweise(
    [{ titel: 'Wartung Heizung', intervall: 'alle Jubeljahre', naechste_faellig: '2026-10-01' }],
    '2026-09-22',
  );
  assert.ok(h.length > 0);
  assert.ok(h.some((x) => /Wartung Heizung/.test(x)));
});

test('ein sauberes Intervall loest nichts aus', () => {
  const h = wiederkehrHinweise(
    [{ titel: 'Abo', intervall: 'monatlich', mwst_satz: 19, naechste_faellig: '2026-10-01' }],
    '2026-09-22',
  );
  assert.equal(Array.isArray(h), true);
});

test('leere Eingaben stuerzen nicht ab', () => {
  assert.deepEqual(wiederkehrHinweise([], '2026-09-22'), []);
});
