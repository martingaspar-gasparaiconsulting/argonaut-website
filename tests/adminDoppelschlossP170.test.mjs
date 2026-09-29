// Paket 170 (29.09.2026) — Admin-Doppelschloss (Pruefung K4): jede Route unter app/api/admin und das
// Admin-Layout pruefen Rolle admin UND ANALYSE_BETREIBER_ID (und Zwei-Faktor) ueber lib/betreiberGuard.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

function routen(dir) {
  const aus = [];
  for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) aus.push(...routen(p));
    else if (e.name === 'route.ts') aus.push(p);
  }
  return aus;
}

test('Jede Admin-Route nutzt das Doppelschloss, keine prueft nur die Rolle', () => {
  const liste = routen('app/api/admin');
  assert.ok(liste.length >= 18, 'Admin-Routen gefunden: ' + liste.length);
  for (const p of liste) {
    const s = lies(p).replace(/^\s*\/\/.*$/gm, '');
    assert.match(s, /betreiberGuard\(\)|betreiberPruefung\(\)/, p + ': ohne betreiberGuard/betreiberPruefung');
    assert.ok(!/\.role\s*!==\s*['"]admin['"]/.test(s), p + ': eigene Rollenpruefung statt Doppelschloss');
    assert.ok(!/if\s*\(\s*betreiber\s*&&/.test(s), p + ': Betreiber-Pruefung nur "falls gesetzt"');
  }
});

test('Admin-Layout verlangt die Betreiber-Kennung, ohne Variable niemand', () => {
  const s = lies('app/admin/layout.tsx');
  assert.match(s, /const betreiber = process\.env\.ANALYSE_BETREIBER_ID;\s*if \(!betreiber \|\| user\.id !== betreiber\) redirect\('\/admin-login'\);/);
});

test('betreiberGuard selbst: Rolle, Kennung (zu ohne Variable) und Zwei-Faktor', () => {
  const s = lies('lib/betreiberGuard.ts');
  assert.match(s, /role !== 'admin'/);
  assert.match(s, /if \(!betreiber \|\| user\.id !== betreiber\)/);
  assert.match(s, /zweiFaktorStand\(/);
});
