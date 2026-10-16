import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VORLAGEN_HW } from '../out/protokollVorlagenHW.js';
import { pruefeVorlage, ergebnis } from '../out/formularBaukasten.js';

// MO1v-HW (16.10.2026) — Protokoll-Vorlagen Handwerk/Energie

const NOETIG = ['geruest_freigabe', 'heizung_wartung', 'lueftung_wartung', 'trinkwasser_kontrolle', 'kaeltemittel_dichtheit',
  'sicherheitsmappe_baustelle', 'heizlast_aufnahme', 'pv_anmeldemappe', 'kanal_tv', 'pruefmittel'];

test('Alle zehn Vorlagen da, Schluessel eindeutig', () => {
  assert.deepEqual(VORLAGEN_HW.map((v) => v.key).sort(), [...NOETIG].sort());
});

test('Jede Vorlage besteht die Pruefung des Baukastens ohne Verlust', () => {
  for (const v of VORLAGEN_HW) {
    const r = pruefeVorlage(v.titel, v.felder);
    assert.deepEqual(r.fehler, [], v.key);
    assert.equal(r.felder.length, v.felder.length, v.key);
    assert.deepEqual(r.felder.map((f) => f.id), v.felder.map((f) => f.id), 'IDs stabil ' + v.key);
    for (const f of v.felder) assert.ok(f.label.length <= 200 && (f.hilfe ?? '').length <= 300, v.key + ' ' + f.label);
    assert.ok(v.intervall_monate === null || (v.intervall_monate >= 1 && v.intervall_monate <= 120), v.key);
  }
});

test('Fachwerte als Startwerte gekennzeichnet', () => {
  for (const v of VORLAGEN_HW) {
    assert.equal(v.felder[0].typ, 'hinweis', v.key);
    assert.match(v.felder[0].label, /Startwerte/, v.key);
  }
});

test('Grenzwert greift: Abgasverlust 12 % -> n. i. O., Trinkwasser 58 °C -> n. i. O.', () => {
  const h = VORLAGEN_HW.find((v) => v.key === 'heizung_wartung');
  const ab = h.felder.find((f) => f.label === 'Abgasverlust');
  assert.equal(ab.max, 11);
  const w = {}; for (const f of h.felder) if (f.typ === 'pruefpunkt') w[f.id] = 'io';
  w[ab.id] = '12';
  assert.equal(ergebnis(h.felder, w).gesamt, 'nio');
  w[ab.id] = '8,5';
  assert.equal(ergebnis(h.felder, w).gesamt, 'offen', 'Anlagendruck noch leer');
  w[h.felder.find((f) => f.label === 'Anlagendruck Heizwasser').id] = '1,6';
  assert.equal(ergebnis(h.felder, w).gesamt, 'io');
  const t = VORLAGEN_HW.find((v) => v.key === 'trinkwasser_kontrolle');
  const ww = t.felder.find((f) => f.label === 'Warmwasser am Speicheraustritt');
  const w2 = {}; for (const f of t.felder) if (f.typ === 'pruefpunkt') w2[f.id] = 'io';
  w2[ww.id] = '58';
  assert.equal(ergebnis(t.felder, w2).gesamt, 'nio');
});

test('Messwert ohne Grenze zaehlt nie ins Ergebnis, auch leer nicht', () => {
  const felder = [{ id: 'a', typ: 'pruefpunkt', label: 'P' }, { id: 'b', typ: 'messwert', label: 'Zaehler', einheit: 'kWh' }];
  assert.equal(ergebnis(felder, { a: 'io' }).gesamt, 'io');
  assert.equal(ergebnis(felder, { a: 'io' }).pruefpunkte, 1);
});

test('Waechter: Formularseite bietet die Vorlagen an', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/formulare/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /VORLAGEN_HW\.map/);
});
