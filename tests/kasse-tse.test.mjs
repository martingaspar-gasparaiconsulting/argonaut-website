import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signiereBeleg } from '../out/kasse-tse.js';

function fakeDb(zeile) {
  const kette = {
    select: () => kette,
    eq: () => kette,
    maybeSingle: async () => ({ data: zeile, error: null }),
  };
  return { from: () => kette };
}

test('ohne Integration: Demo-Signatur', async () => {
  const r = await signiereBeleg(fakeDb(null), 'u1', '1001', 15);
  assert.equal(r.modus, 'demo');
  assert.equal(r.seriennummer, 'DEMO-TSE');
  assert.ok(r.signatur.startsWith('DEMO-'));
});

test('Demo-Anbieter aktiv: Demo-Signatur', async () => {
  const zeile = { typ: 'tse', anbieter: 'demo', config: {}, aktiv: true };
  const r = await signiereBeleg(fakeDb(zeile), 'u1', '1001', 15);
  assert.equal(r.modus, 'demo');
});

test('ECHTER Anbieter aktiv: meldet trotzdem demo, nie live', async () => {
  const zeile = { typ: 'tse', anbieter: 'fiskaly', config: { tss_id: 'TSS-123' }, aktiv: true };
  const r = await signiereBeleg(fakeDb(zeile), 'u1', '1001', 15);
  assert.equal(r.modus, 'demo', 'der Live-Zweig darf nie mehr live melden');
  assert.equal(r.anbieterHinterlegt, true);
  assert.ok(r.signatur.startsWith('DEMO-'));
});

test('ECHTER Anbieter: echte TSS-ID landet NICHT auf dem Beleg', async () => {
  const zeile = { typ: 'tse', anbieter: 'fiskaly', config: { tss_id: 'TSS-123' }, aktiv: true };
  const r = await signiereBeleg(fakeDb(zeile), 'u1', '1001', 15);
  assert.equal(r.seriennummer, 'DEMO-TSE');
  assert.ok(!JSON.stringify(r).includes('TSS-123'));
});

test('alle drei echten Anbieter melden demo', async () => {
  for (const a of ['fiskaly', 'deutsche-fiskal', 'epson']) {
    const r = await signiereBeleg(fakeDb({ typ: 'tse', anbieter: a, config: {}, aktiv: true }), 'u1', '1', 1);
    assert.equal(r.modus, 'demo', a + ' meldet live');
  }
});

test('Hinweis nennt den Anbieter und sagt klar, dass keine gueltige Signatur vorliegt', async () => {
  const zeile = { typ: 'tse', anbieter: 'fiskaly', config: {}, aktiv: true };
  const r = await signiereBeleg(fakeDb(zeile), 'u1', '1001', 15);
  assert.ok(r.hinweis.includes('fiskaly'));
  assert.ok(/KEINE g.ltige TSE-Signatur/.test(r.hinweis));
});

test('Datenbankfehler sperrt die Kasse nicht', async () => {
  const db = { from: () => { throw new Error('DB weg'); } };
  const r = await signiereBeleg(db, 'u1', '1001', 15);
  assert.equal(r.modus, 'demo');
});
