// ============================================================================
// tests/dispoZiehenP212.test.mjs — Paket 212 (Stufe 3 · B6 Plantafel per Ziehen und Ablegen)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { verschiebePlan, zeileVon, tagIso, CHEF_ZEILE, UNZUGEORDNET } from '../out/dispoZiehen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const lokal = (j, m, t, h, mi) => new Date(j, m - 1, t, h, mi, 0, 0).toISOString();
const E = (x = {}) => ({ id: 'e1', mitarbeiter_id: 'ma1', inhaber_einsatz: false, beginn_am: lokal(2026, 10, 5, 9, 30), ende_am: lokal(2026, 10, 5, 12, 0), status: 'geplant', ...x });

test('Zeile eines Einsatzes', () => {
  assert.equal(zeileVon(E()), 'ma1');
  assert.equal(zeileVon(E({ mitarbeiter_id: null, inhaber_einsatz: true })), CHEF_ZEILE);
  assert.equal(zeileVon(E({ mitarbeiter_id: null })), UNZUGEORDNET);
});

test('Anderer Tag: Uhrzeit und Dauer bleiben', () => {
  const r = verschiebePlan(E(), { zeile: 'ma1', datum: '2026-10-07' });
  assert.equal(r.ok, true);
  const b = new Date(r.patch.beginn_am), en = new Date(r.patch.ende_am);
  assert.equal(tagIso(b), '2026-10-07');
  assert.equal(b.getHours(), 9); assert.equal(b.getMinutes(), 30);
  assert.equal(en.getTime() - b.getTime(), 150 * 60000);
  assert.equal(r.patch.mitarbeiter_id, 'ma1');
  assert.equal(r.aenderung, 'Tag');
});

test('Anderer Monteur am selben Tag: Zeit bleibt unangetastet', () => {
  const r = verschiebePlan(E(), { zeile: 'ma2', datum: '2026-10-05' });
  assert.equal(r.ok, true);
  assert.equal(r.patch.mitarbeiter_id, 'ma2');
  assert.equal(r.patch.inhaber_einsatz, false);
  assert.equal(r.patch.beginn_am, undefined);
  assert.equal(r.aenderung, 'Zuständigkeit');
  const zwei = verschiebePlan(E(), { zeile: 'ma2', datum: '2026-10-06' });
  assert.equal(zwei.aenderung, 'Zuständigkeit und Tag');
});

test('Chef-Zeile und Unzugeordnet', () => {
  const c = verschiebePlan(E(), { zeile: CHEF_ZEILE, datum: '2026-10-05' });
  assert.deepEqual([c.patch.mitarbeiter_id, c.patch.inhaber_einsatz], [null, true]);
  const u = verschiebePlan(E(), { zeile: UNZUGEORDNET });
  assert.equal(u.ok, true);
  assert.deepEqual(u.patch, { mitarbeiter_id: null, inhaber_einsatz: false });
  const zurueck = verschiebePlan(E({ mitarbeiter_id: null }), { zeile: UNZUGEORDNET });
  assert.equal(zurueck.ok, false);
  assert.equal(zurueck.nichts, true);
});

test('Ohne Zeit: 08:00–09:00 am Zieltag', () => {
  const r = verschiebePlan(E({ mitarbeiter_id: null, beginn_am: null, ende_am: null }), { zeile: 'ma1', datum: '2026-10-08' });
  const b = new Date(r.patch.beginn_am);
  assert.equal(tagIso(b), '2026-10-08');
  assert.equal(b.getHours(), 8);
  assert.equal(new Date(r.patch.ende_am).getTime() - b.getTime(), 3600000);
});

test('Gesperrt: erledigt, abgesagt, unterwegs, vor Ort; Unsinn abgewiesen', () => {
  for (const s of ['erledigt', 'abgesagt', 'unterwegs', 'vor_ort']) {
    const r = verschiebePlan(E({ status: s }), { zeile: 'ma2', datum: '2026-10-06' });
    assert.equal(r.ok, false, s);
    assert.ok(!r.nichts);
  }
  assert.equal(verschiebePlan(E(), { zeile: 'ma1', datum: '2026-10-05' }).nichts, true);
  assert.equal(verschiebePlan(E(), { zeile: 'ma2', datum: '05.10.2026' }).ok, false);
  assert.equal(verschiebePlan(E(), { zeile: '' }).ok, false);
});

test('Verdrahtung Dispo-Board', () => {
  const s = lies('app/dashboard/dispo/page.tsx');
  assert.match(s, /verschiebePlan\(e, \{ zeile/);
  assert.match(s, /pruefeZuweisung\(anf, qualis, zielMa, zielTag\)/);
  assert.match(s, /ueberschneidungen\(tag, beginn, ende, e\.id\)/);
  assert.match(s, /window\.confirm\(`\$\{warn\.join/);
  assert.match(s, /draggable: darf/);
  assert.match(s, /const darf = st === 'geplant'/);
});
