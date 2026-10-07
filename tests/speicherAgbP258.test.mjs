// ============================================================================
// tests/speicherAgbP258.test.mjs — Paket 258 (07.10.2026)
// Speicher-Wächter nach AGB § 9a.1: 100 GB je Mitarbeiter, gepoolt, nie unter
// der alten Grenze der Tarif-Stufe. Die drei Upload-Routen rechnen über
// lib/speicherKontingentServer.ts statt über profiles.stufe/plan allein.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { limitBytesAgb, agbGrundGb, nutzerZahl, AGB_GB_JE_NUTZER, SPEICHER_LIMIT_GB, STANDARD_LIMIT_GB, limitBytes } from '../out/speicher.js';
import { speicherKontingent } from '../out/speicherKontingentServer.js';
import { SPEICHER_INKL_PRO_MA_GB } from '../out/tarif.js';

const GB = 1024 * 1024 * 1024;
const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('AGB-Wert: 100 GB je Nutzer, gleich wie lib/tarif.ts', () => {
  assert.equal(AGB_GB_JE_NUTZER, 100);
  assert.equal(AGB_GB_JE_NUTZER, SPEICHER_INKL_PRO_MA_GB);
});

test('Formel: Nutzer x 100 GB, gepoolt', () => {
  assert.equal(agbGrundGb(null, 1), 100);
  assert.equal(agbGrundGb(null, 3), 300);
  assert.equal(agbGrundGb('mini', 9), 900);
  assert.equal(agbGrundGb('klein', 12), 1200);
  assert.equal(limitBytesAgb(null, 4, 0), 400 * GB);
  assert.equal(limitBytesAgb(null, 4, 200), 600 * GB); // Zusatzblöcke obendrauf
});

test('Nie unter der alten Grenze: für jede Stufe und jede Nutzerzahl', () => {
  for (const [stufe, alt] of Object.entries(SPEICHER_LIMIT_GB)) {
    for (const n of [0, 1, 2, 5, 50, 999]) {
      assert.ok(limitBytesAgb(stufe, n, 0) >= alt * GB, `${stufe}/${n}`);
      assert.ok(limitBytesAgb(stufe, n, 0) >= limitBytes(stufe, 0), `${stufe}/${n}`);
    }
  }
  assert.equal(agbGrundGb('enterprise', 2), 1024); // 1 TB bleibt, auch bei wenigen Nutzern
  assert.ok(agbGrundGb('unbekannt', 1) >= STANDARD_LIMIT_GB);
});

test('Kaputte Eingaben: mindestens 1 Nutzer, kein negativer Zusatz', () => {
  for (const x of [null, undefined, 0, -3, NaN, 'abc']) assert.equal(nutzerZahl(x), 1);
  assert.equal(nutzerZahl(2.9), 2);
  assert.equal(limitBytesAgb(null, 1, -50), 100 * GB);
  assert.equal(limitBytesAgb(null, 1, NaN), 100 * GB);
});

// Kleine Schein-Datenbank für den Server-Teil
function scheinDb({ chefVon = null, mitarbeiter = 0, profil = {}, fehler = false } = {}) {
  const antwort = (data) => {
    const p = Promise.resolve(fehler ? { data: null, error: { message: 'kaputt' } } : { data, error: null });
    return Object.assign(p, { maybeSingle: () => p });
  };
  return {
    from: (t) => ({
      select: (s) => ({
        eq: (k, v) => {
          if (t === 'mitarbeiter' && k === 'auth_user_id') return antwort(chefVon ? { owner_user_id: chefVon } : null);
          if (t === 'mitarbeiter' && k === 'owner_user_id') return antwort(Array.from({ length: mitarbeiter }, (_, i) => ({ id: 'm' + i })));
          if (t === 'profiles') return antwort(profil);
          return antwort(null);
        },
      }),
    }),
  };
}

test('Server: Chef mit 4 Mitarbeitern = 5 Nutzer = 500 GB + Zusatz', async () => {
  const k = await speicherKontingent(scheinDb({ mitarbeiter: 4, profil: { stufe: 'mini', zusatz_speicher_gb: 100 } }), 'chef');
  assert.equal(k.betrieb, 'chef');
  assert.equal(k.nutzer, 5);
  assert.equal(k.limit, 600 * GB);
});

test('Server: Mitarbeiter lädt hoch -> Kontingent des Betriebs seines Chefs', async () => {
  const k = await speicherKontingent(scheinDb({ chefVon: 'chef', mitarbeiter: 2, profil: { plan: 'klein' } }), 'ma1');
  assert.equal(k.betrieb, 'chef');
  assert.equal(k.nutzer, 3);
  assert.equal(k.limit, 300 * GB);
});

test('Server: Datenbank gestört -> sicherer Rest 100 GB, nie 25 GB', async () => {
  const k = await speicherKontingent(scheinDb({ fehler: true }), 'x');
  assert.equal(k.nutzer, 1);
  assert.equal(k.limit, 100 * GB);
  const geworfen = { from: () => { throw new Error('weg'); } };
  const k2 = await speicherKontingent(geworfen, 'y');
  assert.equal(k2.limit, 100 * GB);
});

test('Routen: alle drei Upload-Wege rechnen mit der AGB-Formel', () => {
  for (const p of ['app/api/webseite-foto/route.ts', 'app/api/marketing/freebie/route.ts', 'app/api/marketing/social-video/route.ts']) {
    const s = lies(p);
    assert.match(s, /speicherKontingent\(db, user\.id\)/, p);
    assert.doesNotMatch(s, /limitBytes\(/, p);
    assert.doesNotMatch(s, /select\('(stufe|plan), zusatz_speicher_gb'\)/, p);
  }
});
