// Paket PA (24.09.2026) — EINE Preistabelle fuer alle KI-Kosten.
// Preise laut offizieller Liste, geprueft 24.09.2026:
//   Opus 5.5 $4/$20 · Sonnet 5 $2/$10 · Haiku 4.5 $1/$5 · Stapel = halber Preis
import test from 'node:test';
import assert from 'node:assert/strict';
import { preisFuer, kostenUsd, schaetzeUsd, familieVon } from '../out/kiPreise.js';
import { schaetzeKosten } from '../out/inhaltPrompt.js';

const nah = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('die drei Familien werden am Namen erkannt', () => {
  assert.equal(familieVon('claude-haiku-4-5'), 'haiku');
  assert.equal(familieVon('claude-sonnet-5'), 'sonnet');
  assert.equal(familieVon('claude-opus-5-5'), 'opus');
  assert.equal(familieVon('CLAUDE-SONNET-5'), 'sonnet');
  assert.equal(familieVon('gpt-irgendwas'), null);
  assert.equal(familieVon(undefined), null);
});

test('Sonnet 5 kostet $2 / $10 — NICHT $3 / $15 (der alte Fehler ab 01.09.)', () => {
  const p = preisFuer('claude-sonnet-5');
  assert.equal(p.rein, 2);
  assert.equal(p.raus, 10);
  assert.equal(p.cacheWrite, 2.5);
  nah(p.cacheRead, 0.2);
});

test('Opus 5.5 kostet $4 / $20 — NICHT $3 / $15', () => {
  const p = preisFuer('claude-opus-5-5');
  assert.equal(p.rein, 4);
  assert.equal(p.raus, 20);
  assert.equal(p.cacheWrite, 5);
  nah(p.cacheRead, 0.4);
});

test('Haiku 4.5 bleibt bei $1 / $5', () => {
  const p = preisFuer('claude-haiku-4-5');
  assert.deepEqual(p, { rein: 1, raus: 5, cacheWrite: 1.25, cacheRead: 0.1 });
});

test('unbekanntes Modell wird mit dem TEUERSTEN Satz gerechnet', () => {
  assert.deepEqual(preisFuer('irgendein-modell'), preisFuer('claude-opus-5-5'));
  assert.deepEqual(preisFuer(''), preisFuer('claude-opus-5-5'));
});

test('Stapel-Schnittstelle halbiert alles, auch die Cache-Anteile', () => {
  const p = preisFuer('claude-sonnet-5', true);
  assert.deepEqual(p, { rein: 1, raus: 5, cacheWrite: 1.25, cacheRead: 0.1 });
});

test('Kosten eines echten Sonnet-Aufrufs: 1000 rein, 500 raus = 0,007 USD', () => {
  // 1000 * 2 + 500 * 10 = 7000 -> / 1 Mio = 0,007. Mit dem alten Satz waeren es 0,0105.
  nah(kostenUsd('claude-sonnet-5', { input_tokens: 1000, output_tokens: 500 }), 0.007);
});

test('Cache-Tokens werden mit ihren eigenen Saetzen gerechnet', () => {
  const k = kostenUsd('claude-haiku-4-5', {
    input_tokens: 100, output_tokens: 200,
    cache_creation_input_tokens: 4000, cache_read_input_tokens: 10000,
  });
  // 100*1 + 200*5 + 4000*1,25 + 10000*0,1 = 100 + 1000 + 5000 + 1000 = 7100
  nah(k, 0.0071);
});

test('kaputte oder fehlende usage-Werte ergeben 0, nie NaN', () => {
  assert.equal(kostenUsd('claude-haiku-4-5', null), 0);
  assert.equal(kostenUsd('claude-haiku-4-5', {}), 0);
  const k = kostenUsd('claude-haiku-4-5', { input_tokens: 'abc', output_tokens: -50 });
  assert.equal(k, 0);
  assert.ok(Number.isFinite(k));
});

test('Schaetzung vor dem Absenden rechnet den Stapelpreis', () => {
  // 10 Kapitel * (700 * 1 + 1200 * 5) / 2 = 10 * 6700 / 2 = 33500 -> 0,0335
  nah(schaetzeUsd(10, 'claude-haiku-4-5', 700, 1200, true), 0.0335);
  assert.equal(schaetzeUsd(-3, 'claude-haiku-4-5', 700, 1200, true), 0);
});

test('E-Book-Werkstatt: Schaetzung haengt an derselben Tabelle', () => {
  const haiku = schaetzeKosten(10, 'claude-haiku-4-5');
  nah(haiku.usd, 0.0335);
  const sonnet = schaetzeKosten(10, 'claude-sonnet-5');
  nah(sonnet.usd, 0.067);
  // unbekannt war vorher $3/$15 -> jetzt Opus $4/$20 (teuerster Satz)
  const fremd = schaetzeKosten(10, 'unbekannt');
  nah(fremd.usd, 0.134);
  assert.match(sonnet.hinweis, /10 Kapitel/);
});
