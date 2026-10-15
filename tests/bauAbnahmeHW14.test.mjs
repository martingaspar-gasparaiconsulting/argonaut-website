import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  pruefeAbnahme, startetGewaehrleistung, gewaehrleistungsKandidaten, lvZuAbnahme,
  mangelUmschalten, maengelStand, abnahmeProtokollHtml, artLabel,
} from '../out/bauAbnahme.js';

// ===========================================================================
// HW-14 (15.10.2026) — Abnahme vollstaendig
// ===========================================================================

const H = '2026-10-15';
const m = (beschreibung, frist = '') => ({ beschreibung, frist, behoben: false });

test('Verweigert und unter Vorbehalt nur mit mindestens einem Mangel', () => {
  assert.equal(pruefeAbnahme({ datum: H, art: 'verweigert', maengel: [] }, H).ok, false);
  assert.equal(pruefeAbnahme({ datum: H, art: 'unter_vorbehalt', maengel: [] }, H).ok, false);
  assert.equal(pruefeAbnahme({ datum: H, art: 'verweigert', maengel: [m('Fliesen gesprungen')] }, H).ok, true);
  assert.equal(pruefeAbnahme({ datum: H, art: 'voll', maengel: [] }, H).ok, true);
});

test('Datum Pflicht, nicht in der Zukunft, Art bekannt, Frist nicht vor Abnahmetag', () => {
  assert.equal(pruefeAbnahme({ datum: '', art: 'voll', maengel: [] }, H).ok, false);
  assert.equal(pruefeAbnahme({ datum: '2026-02-30', art: 'voll', maengel: [] }, H).ok, false);
  assert.equal(pruefeAbnahme({ datum: '2026-10-16', art: 'voll', maengel: [] }, H).ok, false);
  assert.equal(pruefeAbnahme({ datum: H, art: 'irgendwas', maengel: [] }, H).ok, false);
  const r = pruefeAbnahme({ datum: H, art: 'voll', maengel: [m('Silikonfuge', '2026-10-01')] }, H);
  assert.equal(r.ok, false); assert.match(r.fehler, /vor dem Abnahmetag/);
  assert.equal(pruefeAbnahme({ datum: H, art: 'voll', maengel: [m('   ')] }, H).ok, false);
  assert.equal(pruefeAbnahme({ datum: H, art: 'voll', maengel: [m('Fuge', '2026-11-01')] }, H).ok, true);
});

test('Gewaehrleistung beginnt nie bei verweigerter Abnahme; Kandidaten ohne verweigert und ohne schon uebernommene', () => {
  assert.equal(startetGewaehrleistung('voll'), true);
  assert.equal(startetGewaehrleistung('unter_vorbehalt'), true);
  assert.equal(startetGewaehrleistung('verweigert'), false);
  assert.equal(startetGewaehrleistung(undefined), false);
  const ab = [{ id: 'a', art: 'voll' }, { id: 'b', art: 'verweigert' }, { id: 'c', art: 'unter_vorbehalt' }];
  assert.deepEqual(gewaehrleistungsKandidaten(ab, [{ abnahme_id: 'c' }, { abnahme_id: null }]).map((x) => x.id), ['a']);
});

test('LV gewaehlt: lv_id, Projekt aus dem LV, Titel und Ort vorbelegt', () => {
  const v = lvZuAbnahme({ id: 'lv1', titel: 'Bad Huber', projekt_id: 'p1' });
  assert.deepEqual(v, { lv_id: 'lv1', projekt_id: 'p1', titel: 'Abnahme Bad Huber', ort: 'Bad Huber' });
  assert.equal(lvZuAbnahme({ id: 'lv2', titel: 'X', projekt_id: null }).projekt_id, '');
  assert.equal(lvZuAbnahme(null).lv_id, '');
});

test('Mangel abhaken setzt behoben_am, wieder oeffnen loescht es; Stand zaehlt ueberfaellige', () => {
  const l = [m('A', '2026-10-10'), m('B', '2026-10-20')];
  const n = mangelUmschalten(l, 0, H);
  assert.equal(n[0].behoben, true); assert.equal(n[0].behoben_am, H);
  assert.equal(l[0].behoben, false, 'Original unveraendert');
  assert.equal(mangelUmschalten(n, 0, H)[0].behoben_am, null);
  assert.deepEqual(maengelStand(l, H), { gesamt: 2, offen: 2, behoben: 0, ueberfaellig: 1 });
  assert.deepEqual(maengelStand(n, H), { gesamt: 2, offen: 1, behoben: 1, ueberfaellig: 0 });
});

test('Protokoll: maskiert, Gewaehrleistungs-Satz je Art, Maengel nummeriert', () => {
  const h = abnahmeProtokollHtml(
    { titel: '<b>Bad</b>', datum: H, art: 'unter_vorbehalt', maengel: [m('Fuge & Silikon', '2026-11-01')], unterschrift_name: 'Huber' },
    { firma: 'Muster GmbH', lvTitel: 'LV Bad', kunde: 'Familie Huber' });
  assert.ok(!h.includes('<b>Bad</b>')); assert.match(h, /&lt;b&gt;Bad/);
  assert.match(h, /Fuge &amp; Silikon/);
  assert.match(h, /Vorbehaltene Mängel/);
  assert.match(h, /Gewährleistungsfrist beginnt mit dem 15\.10\.2026/);
  assert.match(h, /01\.11\.2026/);
  const v = abnahmeProtokollHtml({ titel: 'X', datum: H, art: 'verweigert', maengel: [m('Y')] }, { firma: 'F' });
  assert.match(v, /beginnt nicht/); assert.match(v, /Grund der Verweigerung/);
  assert.equal(artLabel('voll'), 'Abnahme ohne Vorbehalt');
});

test('Waechter: Seiten nutzen die Logik (lv_id/projekt_id gespeichert, verweigerte nicht zur Gewaehrleistung)', () => {
  const lv = fs.readFileSync(new URL('../app/dashboard/bau-lv/page.tsx', import.meta.url), 'utf8');
  assert.match(lv, /pruefeAbnahme\(/);
  assert.match(lv, /lv_id: ab\.lv_id \|\| null/);
  assert.match(lv, /projekt_id: ab\.projekt_id \|\| null/);
  assert.match(lv, /abnahmeProtokollHtml\(/);
  const ab = fs.readFileSync(new URL('../app/dashboard/bau-lv/ablaeufe/page.tsx', import.meta.url), 'utf8');
  assert.match(ab, /gewaehrleistungsKandidaten\(/);
  assert.doesNotMatch(ab, /abnahmen\.filter\(\(a\) => !gws\.some/);
});
