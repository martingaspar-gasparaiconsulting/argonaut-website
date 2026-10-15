import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { doppelWarnung, zaehlendeRechnungen, trotzdemGewollt } from '../out/doppelabrechnung.js';

// ===========================================================================
// HW-8 (15.10.2026) — derselbe Auftrag wird nie aus Versehen doppelt abgerechnet
// ===========================================================================

test('Keine Rechnungen -> keine Warnung', () => {
  assert.equal(doppelWarnung([], 'diesem Auftrag'), null);
  assert.equal(doppelWarnung(null, 'diesem Auftrag'), null);
});

test('Stornierte Rechnungen zaehlen nicht', () => {
  const rows = [{ rechnungsnummer: 'RE-1', zahlungsstatus: 'storniert' }];
  assert.equal(zaehlendeRechnungen(rows).length, 0);
  assert.equal(doppelWarnung(rows, 'diesem Auftrag'), null);
});

test('Vorhandene Rechnung -> Warnung mit Nummer', () => {
  const w = doppelWarnung([{ rechnungsnummer: 'RE-2026-0007', rechnungsart: 'normal', zahlungsstatus: 'offen' }], 'diesem Auftrag');
  assert.match(w, /Rechnung RE-2026-0007/);
  assert.match(w, /doppelt/);
});

test('Abschlagsrechnung -> Hinweis auf Schlussrechnung', () => {
  const w = doppelWarnung([{ rechnungsnummer: 'RE-3', rechnungsart: 'abschlag', zahlungsstatus: 'bezahlt' }], 'diesem Auftrag');
  assert.match(w, /Abschlagsrechnung RE-3/);
  assert.match(w, /Schlussrechnung/);
});

test('Nur ein ausdrueckliches trotzdem: true zaehlt', () => {
  assert.equal(trotzdemGewollt({ trotzdem: true }), true);
  for (const b of [{}, { trotzdem: 'true' }, { trotzdem: 1 }, null, undefined]) assert.equal(trotzdemGewollt(b), false);
});

test('Waechter: beide Routen pruefen vor dem Anlegen und antworten mit 409', () => {
  for (const f of ['app/api/rechnung-aus-auftrag/route.ts', 'app/api/rechnung-aus-einsatz/route.ts']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /doppelWarnung\(/, f);
    assert.match(src, /trotzdemGewollt\(body\)/, f);
    assert.match(src, /status: 409/, f);
    assert.ok(src.indexOf('doppelWarnung(') < src.indexOf('.from("rechnungen")\n      .insert') || src.indexOf('doppelWarnung(') < src.indexOf('from("rechnungen").insert') || src.indexOf('doppelWarnung(') < src.lastIndexOf('.insert('), f + ': Pruefung vor dem Insert');
  }
});

test('Waechter: alle drei Knoepfe fragen bei 409 nach und senden trotzdem', () => {
  for (const f of ['app/dashboard/_components/EinsatzRechnungButton.tsx', 'app/dashboard/dispo/page.tsx', 'app/dashboard/auftraege/[id]/page.tsx']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /status === 409 && \w+\?\.doppelt/, f);
    assert.match(src, /senden\(true\)/, f);
  }
});
