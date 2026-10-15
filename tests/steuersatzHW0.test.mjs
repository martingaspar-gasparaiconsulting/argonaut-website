import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { steuersatz, MWST_STANDARD } from '../out/steuersatz.js';

// ===========================================================================
// HW-0 (15.10.2026) — 0 % Umsatzsteuer darf beim Weiterreichen nie 19 % werden
// ===========================================================================

test('0 % bleibt 0 % — als Zahl und als Text', () => {
  assert.equal(steuersatz(0), 0, 'Number(0) || 19 machte daraus 19 %');
  assert.equal(steuersatz('0'), 0);
  assert.equal(steuersatz('0,0'), 0);
});

test('7 % und 19 % bleiben, auch als deutscher Text', () => {
  assert.equal(steuersatz(7), 7);
  assert.equal(steuersatz('7'), 7);
  assert.equal(steuersatz('19,00'), 19);
  assert.equal(steuersatz(19), 19);
});

test('Fehlender oder unlesbarer Satz ergibt den Standard 19 %', () => {
  assert.equal(MWST_STANDARD, 19);
  for (const w of [null, undefined, '', '   ', 'abc', -7, '-19']) {
    assert.equal(steuersatz(w), 19, `Eingabe ${JSON.stringify(w)}`);
  }
});

test('Eigener Standard wird respektiert', () => {
  assert.equal(steuersatz(null, 7), 7);
  assert.equal(steuersatz(0, 7), 0);
});

// Waechter: kein Steuersatz-Feld darf wieder mit "|| 19" oder "|| MWST_STD"
// gelesen werden — dieses Muster frisst 0 %.
test('Waechter: kein "|| 19" bei Steuersaetzen im Code', () => {
  const wurzel = path.resolve(process.cwd());
  const funde = [];
  const muster = /(mwst|steuersatz|satz)[^\n]{0,60}\|\|\s*(19\b|MWST_STD\b)/i;
  const lauf = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (/\.(ts|tsx)$/.test(e.name)) {
        const zeilen = fs.readFileSync(p, 'utf8').split('\n');
        zeilen.forEach((z, i) => {
          if (z.trim().startsWith('//') || z.trim().startsWith('*')) return;
          if (muster.test(z)) funde.push(`${path.relative(wurzel, p)}:${i + 1}`);
        });
      }
    }
  };
  lauf(path.join(wurzel, 'app'));
  lauf(path.join(wurzel, 'lib'));
  assert.deepEqual(funde, [], 'Steuersatz mit || 19 gelesen — steuersatz() aus lib/steuersatz.ts nutzen');
});
