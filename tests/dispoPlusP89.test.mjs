// Paket PO (24.09.2026) — Dispo mit Route und Qualifikation (B29).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALIFIKATIONEN, saubereAnforderungen, giltAm, pruefeZuweisung, ueberschneidungen, engePuffer, tagesStunden,
  vorschlaege, qualiAmpel, ablaufWarnungen, tageZwischen,
} from '../out/dispoPlus.js';

const T = (h, m = 0) => `2026-09-24T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;

test('Katalog und Anforderungen saeubern', () => {
  const keys = QUALIFIKATIONEN.map((q) => q.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(saubereAnforderungen(['gas', 'quatsch', 'elektrofachkraft', 'gas']), ['elektrofachkraft', 'gas']);
  assert.deepEqual(saubereAnforderungen(null), []);
});

test('Gueltigkeit: unbefristet, Ablauftag noch gueltig, danach nicht', () => {
  assert.equal(giltAm({ gueltig_bis: null }, '2026-09-24'), true);
  assert.equal(giltAm({ gueltig_bis: '2026-09-24' }, '2026-09-24'), true);
  assert.equal(giltAm({ gueltig_bis: '2026-09-23' }, '2026-09-24'), false);
});

test('Zuweisung pruefen: fehlt vs. abgelaufen', () => {
  const q = [
    { mitarbeiter_id: 'a', art: 'elektrofachkraft' },
    { mitarbeiter_id: 'a', art: 'psa_absturz', gueltig_bis: '2026-01-01' },
    { mitarbeiter_id: 'b', art: 'gas' },
  ];
  assert.deepEqual(pruefeZuweisung(['elektrofachkraft', 'psa_absturz', 'gas'], q, 'a', '2026-09-24'), { fehlt: ['gas'], abgelaufen: ['psa_absturz'] });
  assert.deepEqual(pruefeZuweisung([], q, 'a', '2026-09-24'), { fehlt: [], abgelaufen: [] });
  assert.deepEqual(pruefeZuweisung(['elektrofachkraft'], q, 'b', '2026-09-24').fehlt, ['elektrofachkraft'], 'Qualifikation eines anderen zaehlt nicht');
});

test('Ueberschneidung: echte, anstossende, abgesagte, eigener Einsatz', () => {
  const l = [
    { id: '1', beginn_am: T(8), ende_am: T(10) },
    { id: '2', beginn_am: T(10), ende_am: T(12), status: 'abgesagt' },
    { id: '3', beginn_am: T(13), ende_am: T(14) },
  ];
  assert.deepEqual(ueberschneidungen(l, T(9), T(11)).map((x) => x.id), ['1']);
  assert.deepEqual(ueberschneidungen(l, T(10), T(13)), [], 'anstossend ist keine Ueberschneidung');
  assert.deepEqual(ueberschneidungen(l, T(8), T(9), '1'), [], 'sich selbst nicht');
  assert.deepEqual(ueberschneidungen(l, T(11), T(10)), [], 'kaputte Zeiten');
});

test('Puffer: verschiedene Orte zu knapp, gleicher Ort egal', () => {
  const l = [{ id: '1', beginn_am: T(8), ende_am: T(10), einsatzort: 'Hauptstr. 1, Böblingen' }];
  assert.deepEqual(engePuffer(l, { beginn_am: T(10, 10), ende_am: T(11), einsatzort: 'Bahnhofstr 5' }).map((x) => x.minuten), [10]);
  assert.deepEqual(engePuffer(l, { beginn_am: T(10, 10), ende_am: T(11), einsatzort: ' hauptstr.  1, böblingen' }), []);
  assert.deepEqual(engePuffer(l, { beginn_am: T(10, 30), ende_am: T(11), einsatzort: 'Bahnhofstr 5' }), []);
  assert.deepEqual(engePuffer(l, { beginn_am: T(7), ende_am: T(7, 50), einsatzort: 'X' }).map((x) => x.minuten), [10], 'auch davor');
});

test('Tagesstunden ohne Abgesagte und ohne den eigenen Einsatz', () => {
  const l = [
    { id: '1', beginn_am: T(8), ende_am: T(10) },
    { id: '2', beginn_am: T(11), ende_am: T(12, 30), status: 'abgesagt' },
    { id: '3', beginn_am: T(13), ende_am: T(14, 30) },
  ];
  assert.equal(tagesStunden(l), 3.5);
  assert.equal(tagesStunden(l, '3'), 2);
});

test('Vorschlaege: qualifiziert und frei zuerst, dann wenig Last, Gruende', () => {
  const monteure = [
    { id: 'a', name: 'Anton', wochenstunden: 40 },
    { id: 'b', name: 'Bernd', wochenstunden: 40 },
    { id: 'c', name: 'Cem', wochenstunden: 20 },
  ];
  const qualis = [
    { mitarbeiter_id: 'a', art: 'elektrofachkraft' },
    { mitarbeiter_id: 'b', art: 'elektrofachkraft' },
    { mitarbeiter_id: 'c', art: 'elektrofachkraft', gueltig_bis: '2025-12-31' },
  ];
  const einsaetzeJeMonteur = {
    a: [{ id: 'x', beginn_am: T(6), ende_am: T(9) }],
    b: [],
    c: [],
  };
  const v = vorschlaege({ anforderungen: ['elektrofachkraft'], beginn: T(10), ende: T(12), datum: '2026-09-24', monteure, qualis, einsaetzeJeMonteur });
  assert.deepEqual(v.map((x) => x.id), ['b', 'a', 'c']);
  assert.equal(v[0].passt, true);
  assert.equal(v[2].passt, false);
  assert.match(v[2].gruende[0], /abgelaufen: Elektrofachkraft/);
  assert.equal(v[1].stunden, 3);
  assert.equal(v[1].tagesziel, 8);
  const konflikt = vorschlaege({ anforderungen: [], beginn: T(8), ende: T(9), datum: '2026-09-24', monteure, qualis, einsaetzeJeMonteur });
  assert.equal(konflikt.find((x) => x.id === 'a').passt, false);
  assert.match(konflikt.find((x) => x.id === 'a').gruende.join(), /Überschneidung/);
  // Anton (3 h) haette weniger Last als Bernd (5 h), hat aber nur 5 Min. Puffer -> Bernd zuerst
  const knapp = vorschlaege({ anforderungen: [], beginn: T(9, 5), ende: T(10), datum: '2026-09-24', einsatzort: 'Y', monteure: monteure.slice(0, 2), qualis,
    einsaetzeJeMonteur: { a: einsaetzeJeMonteur.a, b: [{ id: 'y', beginn_am: T(11), ende_am: T(16) }] } });
  assert.deepEqual(knapp.map((x) => x.id), ['b', 'a'], 'knapper Puffer rutscht nach hinten');
  assert.match(knapp[1].gruende.join(), /5 Min/);
});

test('Ampel und Ablauf-Warnungen', () => {
  const h = '2026-09-24';
  assert.equal(tageZwischen('2026-09-24', '2026-10-24'), 30);
  assert.equal(qualiAmpel(null, h), 'unbefristet');
  assert.equal(qualiAmpel('2026-09-23', h), 'rot');
  assert.equal(qualiAmpel('2026-11-01', h), 'gelb');
  assert.equal(qualiAmpel('2027-06-01', h), 'gruen');
  const w = ablaufWarnungen([
    { mitarbeiter_id: 'a', art: 'erste_hilfe', gueltig_bis: '2026-11-01' },
    { mitarbeiter_id: 'b', art: 'stapler', gueltig_bis: '2026-09-01' },
    { mitarbeiter_id: 'c', art: 'gas', gueltig_bis: null },
    { mitarbeiter_id: 'd', art: 'gas', gueltig_bis: '2028-01-01' },
  ], h);
  assert.deepEqual(w.map((x) => [x.mitarbeiter_id, x.ampel, x.tage]), [['b', 'rot', -23], ['a', 'gelb', 38]]);
});
