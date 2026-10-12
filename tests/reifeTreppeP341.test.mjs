// ============================================================================
// tests/reifeTreppeP341.test.mjs — Paket 341 (12.10.2026)
// BV3a Manufaktur Teil 3: Preis-Treppe nach Reife und MHD, Preisschild,
// Start-Schalter reifePreisTreppe
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  reifeStufenAus, mhdStufenAus, treppePruefen, treppeStartwerte, preisHeute, preisschildHtml, preisschildEinheit, mhdPruefen,
} from '../out/reifeTreppe.js';
import { startFrei } from '../out/startSperre.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const C = { start_datum: '2026-10-01', status: 'reift', mhd: '2026-12-10' };
const R = [{ ab_tag: 45, aufschlag: 15 }, { ab_tag: 60, aufschlag: 30 }];
const M = [{ tage_vor: 3, abschlag: 20 }, { tage_vor: 1, abschlag: 40 }];

test('Reife-Stufen: Grundpreis, ab Tag 45 +15 %, ab Tag 60 +30 %', () => {
  let p = preisHeute(C, 64.9, R, M, '2026-11-14');           // Tag 44
  assert.equal(p.ok, true); assert.equal(p.tage, 44); assert.equal(p.preis, 64.9); assert.equal(p.text, 'Grundpreis');
  assert.equal(p.naechste.datum, '2026-11-15'); assert.equal(p.naechste.preis, 74.64, '64,90 × 1,15 = 74,635 -> 74,64');
  p = preisHeute(C, 64.9, R, M, '2026-11-15');                // Tag 45
  assert.equal(p.preis, 74.64); assert.match(p.text, /ab Reifetag 45: \+15 %/);
  p = preisHeute(C, 64.9, R, M, '2026-11-30');                // Tag 60
  assert.equal(p.preis, 84.37, '64,90 × 1,30');
  assert.equal(p.naechste.datum, '2026-12-07', 'danach nur noch MHD-Stufe 3 Tage vorher');
});

test('MHD-Stufen: Abschlag auf den Reife-Preis, größter passender Abschlag', () => {
  let p = preisHeute(C, 64.9, R, M, '2026-12-07');            // 3 Tage vor MHD, Tag 67
  assert.equal(p.reifePreis, 84.37); assert.equal(p.preis, 67.5, '84,37 × 0,8 = 67,496'); assert.equal(p.reduziert, true);
  assert.equal(p.mhdRest, 3);
  p = preisHeute(C, 64.9, R, M, '2026-12-10');                // MHD-Tag
  assert.equal(p.preis, 50.62, '84,37 × 0,6 = 50,622'); assert.match(p.text, /MHD heute: −40 %/);
  assert.equal(p.naechste, null);
});

test('Nach dem MHD kein automatischer Preis; verworfen und ohne Grundpreis auch nicht', () => {
  const p = preisHeute(C, 64.9, R, M, '2026-12-11');
  assert.equal(p.ok, false); assert.equal(p.abgelaufen, true); assert.match(p.grund, /eigenen Prüfung/);
  assert.equal(preisHeute({ ...C, status: 'verworfen' }, 64.9, R, M, '2026-11-01').ok, false);
  assert.equal(preisHeute(C, null, R, M, '2026-11-01').ok, false);
  assert.equal(preisHeute(C, 0, R, M, '2026-11-01').ok, false);
  assert.equal(preisHeute(C, 64.9, R, M, '2026-09-30').ok, false, 'vor dem Start');
});

test('Abgeschlossene Charge reift nicht weiter; MHD-Abschlag gilt trotzdem', () => {
  const fertig = { ...C, status: 'abgeschlossen', end_datum: '2026-11-10' };   // Tag 40
  let p = preisHeute(fertig, 64.9, R, M, '2026-12-01');
  assert.equal(p.tage, 40); assert.equal(p.preis, 64.9, 'keine Reife-Stufe nach Abschluss');
  assert.equal(p.naechste.datum, '2026-12-07', 'nur noch MHD-Stufe');
  p = preisHeute(fertig, 64.9, R, M, '2026-12-08');
  assert.equal(p.preis, 51.92, '64,90 × 0,8');
});

test('Ohne MHD greifen nur Reife-Stufen', () => {
  const p = preisHeute({ start_datum: '2026-10-01', status: 'reift' }, 64.9, R, M, '2026-12-20');
  assert.equal(p.ok, true); assert.equal(p.preis, 84.37); assert.equal(p.mhdRest, null); assert.equal(p.reduziert, false);
});

test('Eingaben: Reihenfolge, Grenzen, doppelte Stufen, leere Zeilen', () => {
  const ok = treppePruefen([{ ab_tag: 60, aufschlag: 30 }, { ab_tag: null, aufschlag: null }, { ab_tag: 45, aufschlag: 15 }], [{ tage_vor: 1, abschlag: 40 }, { tage_vor: 3, abschlag: 20 }]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.reife.map((x) => x.ab_tag), [45, 60]);
  assert.deepEqual(ok.mhd.map((x) => x.tage_vor), [3, 1]);
  assert.equal(treppePruefen([{ ab_tag: 45, aufschlag: 30 }, { ab_tag: 60, aufschlag: 15 }], []).ok, false, 'später kleinerer Aufschlag');
  assert.equal(treppePruefen([], [{ tage_vor: 3, abschlag: 40 }, { tage_vor: 1, abschlag: 20 }]).ok, false, 'näher am MHD kleinerer Abschlag');
  assert.equal(treppePruefen([{ ab_tag: 45, aufschlag: 10 }, { ab_tag: 45, aufschlag: 20 }], []).ok, false);
  assert.equal(treppePruefen([{ ab_tag: 4.5, aufschlag: 10 }], []).ok, false);
  assert.equal(treppePruefen([], [{ tage_vor: 2, abschlag: 95 }]).ok, false, 'Abschlag höchstens 90 %');
  assert.equal(treppePruefen([{ ab_tag: 10, aufschlag: null }], []).ok, false, 'halbe Zeile');
  assert.deepEqual(reifeStufenAus([{ ab_tag: 60, aufschlag: 30 }, 'quatsch', { ab_tag: -1, aufschlag: 5 }, { ab_tag: 45, aufschlag: 15 }]), [{ ab_tag: 45, aufschlag: 15 }, { ab_tag: 60, aufschlag: 30 }]);
  assert.deepEqual(mhdStufenAus({ a: 1 }), []);
  assert.equal(treppeStartwerte('dry_aged').reife.length, 2);
  assert.equal(treppeStartwerte('wein').mhd.length, 0);
});

test('MHD prüfen', () => {
  assert.deepEqual(mhdPruefen('', '2026-10-01'), { ok: true, mhd: null });
  assert.deepEqual(mhdPruefen('2026-12-10', '2026-10-01'), { ok: true, mhd: '2026-12-10' });
  assert.equal(mhdPruefen('2026-09-30', '2026-10-01').ok, false);
  assert.equal(mhdPruefen('2026-02-30', '2026-01-01').ok, false);
});

test('Preisschild: ohne Freigabe ENTWURF und kein Streichpreis; Text sicher', () => {
  const basis = { produkt: 'Rücken <b>Färse</b>', nummer: 'RF-2026-001', einheit: 'kg', preis: 67.5, streichpreis: 84.37, tage: 67, mhd: '2026-12-10' };
  const aus = preisschildHtml({ ...basis, frei: false });
  assert.match(aus, /ENTWURF/);
  assert.doesNotMatch(aus, /<s>/);
  assert.doesNotMatch(aus, /<b>Färse/, 'Produktname wird maskiert');
  assert.match(aus, /&lt;b&gt;Färse/);
  assert.match(aus, /je 1 kg/); assert.match(aus, /67 Tage gereift/); assert.match(aus, /10\.12\.2026/);
  const an = preisschildHtml({ ...basis, frei: true });
  assert.doesNotMatch(an, /ENTWURF/);
  assert.match(an, /statt <s>84,37 €<\/s>/); assert.match(an, /kurzer Haltbarkeit/);
  assert.doesNotMatch(preisschildHtml({ ...basis, streichpreis: null, frei: true }), /<s>/);
  assert.deepEqual(preisschildEinheit('g'), { je: '1 kg', grundpreisNoetig: true });
  assert.deepEqual(preisschildEinheit('Stk'), { je: 'Stück', grundpreisNoetig: false });
});

test('Start-Schalter reifePreisTreppe ist aus und im Sperr-Gedächtnis', () => {
  assert.equal(startFrei('reifePreisTreppe'), false);
  assert.equal(startFrei('reifePreisTreppe', { reifePreisTreppe: true }), true);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.reifePreisTreppe = aus/);
  const box = lies('app/dashboard/lebensmittel/reife/ReifeKalkBox.tsx');
  assert.match(box, /startFrei\('reifePreisTreppe'\)/);
  assert.match(box, /frei: FREI/);
  const sql = lies('supabase-sql/p341-reife-preistreppe.sql');
  assert.match(sql, /add column if not exists mhd date/);
  assert.match(sql, /jsonb_array_length\(preis_treppe\) <= 8/);
  assert.doesNotMatch(sql, /drop table|drop column/i);
  assert.doesNotMatch(lies('lib/reifeTreppe.ts'), /Math\.round/);
});
