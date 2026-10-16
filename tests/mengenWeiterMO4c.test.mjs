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

// MO4 Teil 4 — Monatslauf
import { vormonat, istMonat, offeneImMonat, laufText } from '../out/mengenWeiter.js';

test('Monatslauf: Vormonat auch über den Jahreswechsel', () => {
  assert.equal(vormonat('2026-10-16'), '2026-09');
  assert.equal(vormonat('2027-01-03'), '2026-12');
  assert.equal(vormonat('quatsch'), '');
  assert.ok(istMonat('2026-12'));
  assert.ok(!istMonat('2026-13'));
});

test('Monatslauf: nur offene Leistungen des Monats (oder bis Monatsende)', () => {
  const rows = [
    { id: 'a', datum: '2026-09-02', abgerechnet: false, rechnung_id: null },
    { id: 'b', datum: '2026-09-30', abgerechnet: true, rechnung_id: 'r' },
    { id: 'c', datum: '2026-08-15', abgerechnet: false, rechnung_id: null },
    { id: 'd', datum: '2026-10-01', abgerechnet: false, rechnung_id: null },
  ];
  assert.deepEqual(offeneImMonat(rows, '2026-09').map((r) => r.id), ['a']);
  assert.deepEqual(offeneImMonat(rows, '2026-09', true).map((r) => r.id), ['a', 'c']);
  assert.deepEqual(offeneImMonat(rows, '2026-9'), []);
});

test('Monatslauf: Ergebnis ehrlich zählen', () => {
  assert.match(laufText([{ schluessel: 'a', name: 'A', ok: true }, { schluessel: 'b', name: 'B', ok: false }]), /1 von 2.*1 nicht/);
  assert.match(laufText([{ schluessel: 'a', name: 'A', ok: true }]), /1 Rechnung erstellt/);
});

test('Freischaltung: Landwirtschaft, Logistik, Recht/Steuern haben das Modul der Mengen-Abrechnung', () => {
  const src = fs.readFileSync(new URL('../lib/branchenkatalog.ts', import.meta.url), 'utf8');
  for (const kat of ['Landwirtschaft, Garten & Forst', 'Logistik & Transport', 'Recht, Steuern & Finanzen']) {
    const zeile = src.split('\n').find((z) => z.includes(`'${kat}': [`));
    assert.ok(zeile && zeile.includes("'objektzeiten'"), kat);
  }
  const nav = fs.readFileSync(new URL('../lib/rechte.ts', import.meta.url), 'utf8');
  assert.match(nav, /href: '\/dashboard\/mengen', modul: 'objektzeiten'/);
});
