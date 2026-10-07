// ============================================================================
// tests/ustvaSonderfallP269.test.mjs — Paket 269 (07.10.2026)
// UStVA: § 25a-Marge in Kz 81 (Verkaufspreis nicht), EU-Lieferung Kz 41,
// Ausfuhr Kz 43; alte Rechnungen ohne Sonderfall unverändert.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { baueUstva, ustvaHinweise } from '../out/ustva.js';

const kz = (erg, k) => erg.kennziffern.find((x) => x.kz === k)?.wert;
const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('§ 25a: Marge netto in Kz 81, Differenzsteuer in der Zahllast, Verkaufspreis nicht gemeldet', () => {
  // Fahrzeug 20.000 (0 %), Zulassung 125,21 netto + 23,79 USt; Marge 5.000 -> 4.201,68 + 798,32
  const erg = baueUstva([{ netto_summe: 20125.21, mwst_summe: 23.79, steuer_sonderfall: 'diff25a', diff_bemessung: 4201.68, diff_steuer: 798.32, netto0: 20000 }], 0);
  assert.equal(kz(erg, '81'), 4326);           // 4.201,68 + 125,21 -> volle Euro
  assert.equal(erg.ust19, 822.11);
  assert.equal(erg.zahllast, 822.11);
  assert.equal(erg.umsatz0, 0);
  assert.equal(erg.uneindeutig, 0);
  assert.equal(erg.diff25aSteuer, 798.32);
  assert.ok(ustvaHinweise(erg).some((h) => /Differenzbesteuerung \(§ 25a\)/.test(h)));
  // ohne Differenz: offen, laut gesagt
  const offen = baueUstva([{ netto_summe: 20000, mwst_summe: 0, steuer_sonderfall: 'diff25a', diff_bemessung: null, netto0: 20000 }], 0);
  assert.equal(offen.diff25aOffen, 1);
  assert.equal(offen.umsatz0, 0);
  assert.ok(ustvaHinweise(offen).some((h) => /zu WENIG gemeldet/.test(h)));
  // Verlust: Differenz 0 -> nichts gemeldet, aber nicht „offen"
  const verlust = baueUstva([{ netto_summe: 20000, mwst_summe: 0, steuer_sonderfall: 'diff25a', diff_bemessung: 0, diff_steuer: 0, netto0: 20000 }], 0);
  assert.equal(verlust.diff25aOffen, 0);
  assert.equal(verlust.zahllast, 0);
});

test('EU-Lieferung Kz 41, Ausfuhr Kz 43, gemischt mit normalen Rechnungen', () => {
  const erg = baueUstva([
    { netto_summe: 20100, mwst_summe: 0, steuer_sonderfall: 'eu_ig', netto0: 20100 },
    { netto_summe: 23800, mwst_summe: 0, steuer_sonderfall: 'ausfuhr', netto0: 23800 },
    { netto_summe: 1000, mwst_summe: 190 },
  ], 50);
  assert.equal(kz(erg, '41'), 20100);
  assert.equal(kz(erg, '43'), 23800);
  assert.equal(kz(erg, '81'), 1000);
  assert.equal(erg.zahllast, 140);
  assert.equal(kz(erg, '?'), undefined);
  assert.ok(ustvaHinweise(erg).some((h) => /Zusammenfassende Meldung/.test(h)));
  // Reihenfolge: 41 und 43 vor der Vorsteuer
  const reihe = erg.kennziffern.map((k) => k.kz);
  assert.ok(reihe.indexOf('41') < reihe.indexOf('66') && reihe.indexOf('43') < reihe.indexOf('66'));
  // ohne Positionen, aber ohne Steuer: ganze Rechnung ist der Sonderfall
  assert.equal(kz(baueUstva([{ netto_summe: 500, mwst_summe: 0, steuer_sonderfall: 'eu_ig' }], 0), '41'), 500);
  // ohne Positionen MIT Steuer: unklar, wie bisher gerechnet
  const unklar = baueUstva([{ netto_summe: 20125.21, mwst_summe: 23.79, steuer_sonderfall: 'diff25a', diff_bemessung: 1, diff_steuer: 1 }], 0);
  assert.equal(unklar.sonderfallUnklar, 1);
  assert.ok(ustvaHinweise(unklar).some((h) => /nicht aufgeteilt/.test(h)));
});

test('Ohne Sonderfall bleibt alles wie bisher', () => {
  const alt = [{ netto_summe: 1000, mwst_summe: 190 }, { netto_summe: 500, mwst_summe: 35 }, { netto_summe: 300, mwst_summe: 0 }];
  const a = baueUstva(alt, 10);
  const b = baueUstva(alt.map((r) => ({ ...r, steuer_sonderfall: null, netto0: null })), 10);
  assert.deepEqual(a.kennziffern, b.kennziffern);
  assert.equal(kz(a, '?'), 300);
  assert.equal(a.umsatz41, 0);
});

test('ELSTER-Seite lädt Sonderfall und 0-%-Anteil aus den Positionen', () => {
  const s = lies('app/dashboard/elster/page.tsx');
  assert.ok(s.includes("supabase.from('rechnung_positionen').select('rechnung_id, mwst_satz, gesamt_netto').in('rechnung_id', sonder)"));
  assert.ok(s.includes("steuer_sonderfall: typeof x.steuer_sonderfall === 'string'"));
  assert.ok(s.includes(".eq('zahlungsstatus', 'bezahlt')"));
  // nur Positionen mit 0 % zählen zum Sonderfall-Anteil
  assert.ok(s.includes('if (leseZahlOder(z.mwst_satz, -1) !== 0) continue;'));
});
