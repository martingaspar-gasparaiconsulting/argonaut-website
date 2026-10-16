import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mengenLink, leseVorbelegung, bezugFuerSpeichern, anStorniertenRechnungen, freigabePruefen } from '../out/mengenWeiter.js';

// MO4 Teil 3 (16.10.2026) — Mengen am Auftrag erfassen, Storno gibt Leistungen frei

const A = '11111111-1111-4111-8111-111111111111';
const K = '22222222-2222-4222-8222-222222222222';

test('Link vom Auftrag: Bezug + Kontakt, Hin- und Rückweg', () => {
  const url = mengenLink({ typ: 'auftrag', id: A, kontakt_id: K, kunde: 'Müller', label: 'A-2026-001 · Dach' });
  assert.ok(url.startsWith('/dashboard/mengen?'));
  const v = leseVorbelegung(url.split('?')[1]);
  assert.deepEqual(v, { bezug_typ: 'auftrag', bezug_id: A, kontakt_id: K, empfaenger_name: '', bezug_label: 'A-2026-001 · Dach' });
  assert.deepEqual(bezugFuerSpeichern(v), { bezug_typ: 'auftrag', bezug_id: A });
});

test('Ohne Kontakt kommt der Name, unbekannte Typen und falsche IDs fallen weg', () => {
  const v = leseVorbelegung('bezug=rechnung:' + A + '&kunde=Bauer%20GmbH');
  assert.equal(v.bezug_typ, null);
  assert.equal(v.empfaenger_name, 'Bauer GmbH');
  assert.deepEqual(bezugFuerSpeichern(v), { bezug_typ: null, bezug_id: null });
  assert.equal(leseVorbelegung('bezug=auftrag:123&kontakt=abc'), null);
  assert.equal(leseVorbelegung(''), null);
  assert.equal(mengenLink({ typ: 'auftrag', id: 'x' }), '/dashboard/mengen');
});

test('Stornierte Rechnungen: nur storniert zählt, gruppiert je Rechnung', () => {
  const rows = [
    { id: 'a', abgerechnet: true, rechnung_id: 'r1' },
    { id: 'b', abgerechnet: true, rechnung_id: 'r1' },
    { id: 'c', abgerechnet: true, rechnung_id: 'r2' },
    { id: 'd', abgerechnet: false, rechnung_id: null },
  ];
  const g = anStorniertenRechnungen(rows, [
    { id: 'r1', zahlungsstatus: 'storniert', rechnungsnummer: 'RE-7' },
    { id: 'r2', zahlungsstatus: 'bezahlt' },
  ]);
  assert.deepEqual(g, [{ rechnung_id: 'r1', nummer: 'RE-7', ids: ['a', 'b'] }]);
  assert.deepEqual(anStorniertenRechnungen(rows, []), []);
});

test('Server-Prüfung: nur eigene, nur stornierte Rechnung', () => {
  assert.equal(freigabePruefen({ owner_user_id: 'b', zahlungsstatus: 'storniert' }, 'b'), null);
  assert.match(freigabePruefen({ owner_user_id: 'b', zahlungsstatus: 'offen' }, 'b'), /stornieren/);
  assert.match(freigabePruefen({ owner_user_id: 'x', zahlungsstatus: 'storniert' }, 'b'), /nicht gefunden/);
  assert.match(freigabePruefen(null, 'b'), /nicht gefunden/);
});

test('Wächter: Freigabe-Route prüft Recht, Betrieb und Storno', () => {
  const src = fs.readFileSync(new URL('../app/api/mengen-freigeben/route.ts', import.meta.url), 'utf8');
  assert.match(src, /abrechnungPruefen/);
  assert.match(src, /freigabePruefen\(/);
  assert.match(src, /\.eq\("owner_user_id", betrieb\)/);
});
