// ============================================================================
// tests/sicherheitsKopfzeilen.test.mjs
//
// Befund vom 15.09.2026: next.config.ts hatte keine einzige Sicherheits-
// Kopfzeile. Ohne Referrer-Policy koennen Magic-Link- und Wiederherstellungs-
// Token ueber den Referer an fremde Server abfliessen.
//
// Die Tests halten auch fest, was BEWUSST NICHT gesetzt ist — sonst traegt es
// irgendwann jemand nach und der Berater auf fremden Kundenseiten ist tot.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SICHERHEITS_KOPFZEILEN, kopfzeilenRegel, kopfzeile } from '../out/sicherheitsKopfzeilen.js';

test('die Referrer-Policy ist gesetzt und schuetzt den Token', () => {
  const wert = kopfzeile('Referrer-Policy');
  assert.equal(wert, 'strict-origin-when-cross-origin');
  assert.ok(wert !== 'unsafe-url' && wert !== 'no-referrer-when-downgrade',
    'diese Werte wuerden die volle Adresse nach draussen geben');
});

test('nosniff ist gesetzt', () => {
  assert.equal(kopfzeile('X-Content-Type-Options'), 'nosniff');
});

test('HSTS ist gesetzt — aber ohne preload und ohne includeSubDomains', () => {
  const wert = kopfzeile('Strict-Transport-Security');
  assert.ok(/^max-age=\d+$/.test(wert), 'unerwarteter Wert: ' + wert);
  assert.ok(!/preload/i.test(wert), 'preload ist praktisch unumkehrbar');
  assert.ok(!/includeSubDomains/i.test(wert), 'wuerde jede kuenftige Subdomain binden');
  const jahre = Number(wert.split('=')[1]) / 31536000;
  assert.ok(jahre >= 1, 'zu kurz, um zu wirken: ' + jahre.toFixed(1) + ' Jahre');
});

test('WAECHTER: nichts setzt frame-ancestors oder X-Frame-Options', () => {
  // Der oeffentliche Berater laeuft auf FREMDEN Kundenwebsites, und der
  // Vorfuehr-/Kiosk-Modus wird eingebettet. Wer das hier nachtraegt, schaltet
  // beides ab — und merkt es erst beim Kunden.
  for (const k of SICHERHEITS_KOPFZEILEN) {
    assert.ok(!/x-frame-options/i.test(k.key),
      'X-Frame-Options wuerde den Berater auf fremden Seiten abschalten');
    assert.ok(!/frame-ancestors/i.test(k.value),
      'frame-ancestors wuerde den Berater auf fremden Seiten abschalten');
  }
});

test('WAECHTER: nichts setzt eine Permissions-Policy', () => {
  // Eine zu enge Regel schaltet das Diktat (Mikrofon) und die Beleg-Erkennung
  // (Kamera) ab.
  assert.equal(kopfzeile('Permissions-Policy'), null);
  assert.equal(kopfzeile('Feature-Policy'), null);
});

test('WAECHTER: keine vollstaendige Content-Security-Policy', () => {
  assert.equal(kopfzeile('Content-Security-Policy'), null);
  assert.equal(kopfzeile('Content-Security-Policy-Report-Only'), null);
});

test('jede Kopfzeile hat einen Namen und einen Wert, keine Doppelten', () => {
  const namen = new Set();
  for (const k of SICHERHEITS_KOPFZEILEN) {
    assert.ok(typeof k.key === 'string' && k.key.trim() !== '', 'Kopfzeile ohne Namen');
    assert.ok(typeof k.value === 'string' && k.value.trim() !== '', k.key + ' hat keinen Wert');
    assert.ok(!/[\r\n]/.test(k.key + k.value), k.key + ' enthaelt einen Zeilenumbruch');
    const klein = k.key.toLowerCase();
    assert.ok(!namen.has(klein), k.key + ' steht doppelt');
    namen.add(klein);
  }
});

test('die Regel gilt fuer die ganze Seite', () => {
  const r = kopfzeilenRegel();
  assert.equal(r.source, '/:pfad*');
  assert.equal(r.headers.length, SICHERHEITS_KOPFZEILEN.length);
  assert.ok(r.headers.length >= 3);
});

test('kopfzeile() ist unempfindlich gegen Gross- und Kleinschreibung', () => {
  assert.equal(kopfzeile('referrer-policy'), kopfzeile('Referrer-Policy'));
  assert.equal(kopfzeile('REFERRER-POLICY'), kopfzeile('Referrer-Policy'));
  assert.equal(kopfzeile('gibt-es-nicht'), null);
  assert.equal(kopfzeile(''), null);
  assert.equal(kopfzeile(null), null);
});
