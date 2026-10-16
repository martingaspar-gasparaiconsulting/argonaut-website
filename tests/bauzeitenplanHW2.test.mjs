import test from 'node:test';
import assert from 'node:assert/strict';
import { planBerechnen, pruefeVorgang, bildetKreis, stand, istArbeitstag } from '../out/bauzeitenplan.js';

// HW-2 (16.10.2026) — Bauzeitenplan: Arbeitstage, Abhängigkeiten, Puffer, kritischer Weg

const FT = new Set(['2026-12-25', '2026-12-26']);
const keine = new Set();

test('Arbeitstage: Wochenende und Feiertage zählen nicht', () => {
  assert.ok(istArbeitstag('2026-10-16', keine)); // Freitag
  assert.ok(!istArbeitstag('2026-10-17', keine)); // Samstag
  assert.ok(!istArbeitstag('2026-12-25', FT));
});

test('Kette Rohbau → Estrich (+5 Tage trocknen) → Fliesen, Elektro parallel', () => {
  const v = [
    { id: 'r', titel: 'Rohbau', dauer_tage: 10 },
    { id: 'e', titel: 'Estrich', dauer_tage: 2, vorgaenger: ['r'] },
    { id: 'f', titel: 'Fliesen', dauer_tage: 3, vorgaenger: ['e'], puffer_tage: 5 },
    { id: 'el', titel: 'Elektro', dauer_tage: 4, vorgaenger: ['r'] },
  ];
  const p = planBerechnen(v, '2026-10-19', keine); // Montag
  assert.equal(p.fehler, null);
  assert.equal(p.zeilen.get('r').start, '2026-10-19');
  assert.equal(p.zeilen.get('r').ende, '2026-10-30'); // 10 Arbeitstage
  assert.equal(p.zeilen.get('e').start, '2026-11-02');
  assert.equal(p.zeilen.get('e').ende, '2026-11-03');
  assert.equal(p.zeilen.get('f').start, '2026-11-11'); // 5 Tage Trocknung: 04.–10.11.
  assert.equal(p.ende, '2026-11-13');
  assert.ok(p.zeilen.get('r').kritisch && p.zeilen.get('e').kritisch && p.zeilen.get('f').kritisch);
  assert.ok(!p.zeilen.get('el').kritisch, 'Elektro hat Luft');
  assert.equal(p.zeilen.get('el').luft, 6);
});

test('Baubeginn am Wochenende → erster Arbeitstag; Feiertage verschieben', () => {
  const p = planBerechnen([{ id: 'a', titel: 'A', dauer_tage: 2 }], '2026-12-24', FT); // Do, dann 25./26. Feiertag, 27. So
  assert.equal(p.zeilen.get('a').start, '2026-12-24');
  assert.equal(p.zeilen.get('a').ende, '2026-12-28');
  const q = planBerechnen([{ id: 'a', titel: 'A', dauer_tage: 1 }], '2026-10-17', keine);
  assert.equal(q.zeilen.get('a').start, '2026-10-19');
});

test('Wunschtermin schiebt nach hinten, nie nach vorn vor den Vorgänger', () => {
  const v = [
    { id: 'a', titel: 'A', dauer_tage: 5 },
    { id: 'b', titel: 'B', dauer_tage: 1, vorgaenger: ['a'], start_wunsch: '2026-10-20' },
    { id: 'c', titel: 'C', dauer_tage: 1, start_wunsch: '2026-11-02' },
  ];
  const p = planBerechnen(v, '2026-10-19', keine);
  assert.equal(p.zeilen.get('b').start, '2026-10-26');
  assert.equal(p.zeilen.get('c').start, '2026-11-02');
});

test('Kreis und fehlender Vorgänger werden gemeldet, nicht gerechnet', () => {
  const kreis = planBerechnen([
    { id: 'a', titel: 'A', dauer_tage: 1, vorgaenger: ['b'] },
    { id: 'b', titel: 'B', dauer_tage: 1, vorgaenger: ['a'] },
  ], '2026-10-19', keine);
  assert.match(kreis.fehler, /im Kreis/);
  assert.match(planBerechnen([{ id: 'a', titel: 'A', dauer_tage: 1, vorgaenger: ['x'] }], '2026-10-19', keine).fehler, /nicht mehr gibt/);
  assert.ok(bildetKreis([{ id: 'a', titel: 'A', dauer_tage: 1 }, { id: 'b', titel: 'B', dauer_tage: 1, vorgaenger: ['a'] }], 'a', ['b']));
  assert.ok(!bildetKreis([{ id: 'a', titel: 'A', dauer_tage: 1 }, { id: 'b', titel: 'B', dauer_tage: 1 }], 'a', ['b']));
});

test('Eingabe prüfen: Dauer ganze Arbeitstage, Puffer begrenzt, nie auf sich selbst', () => {
  assert.equal(pruefeVorgang({ titel: 'Dach', dauer_tage: '4' }).fehler, null);
  assert.match(pruefeVorgang({ titel: 'Dach', dauer_tage: '1,5' }).fehler, /ganze Zahl/);
  assert.match(pruefeVorgang({ titel: 'Dach', dauer_tage: '0' }).fehler, /ganze Zahl/);
  assert.match(pruefeVorgang({ titel: 'Dach', dauer_tage: '2', puffer_tage: '99' }).fehler, /0 bis 60/);
  assert.match(pruefeVorgang({ titel: 'Dach', dauer_tage: '2', vorgaenger: ['x'] }, 'x').fehler, /selbst/);
  assert.match(pruefeVorgang({ titel: 'D', dauer_tage: '2' }).fehler, /benennen/);
});

test('Stand: fertig, überfällig, hinter Plan, läuft, geplant', () => {
  const p = planBerechnen([{ id: 'a', titel: 'A', dauer_tage: 10 }], '2026-10-19', keine).zeilen.get('a');
  assert.equal(stand(p, 100, '2026-11-20', keine), 'fertig');
  assert.equal(stand(p, 50, '2026-11-02', keine), 'ueberfaellig');
  assert.equal(stand(p, 0, '2026-10-16', keine), 'geplant');
  assert.equal(stand(p, 10, '2026-10-28', keine), 'hinter_plan'); // Soll 80 %
  assert.equal(stand(p, 70, '2026-10-28', keine), 'laeuft');
});

import { PLAN_VORLAGEN, vorlageReihenfolge } from '../out/bauzeitenplan.js';

test('Vorlagen: jede ist rechenbar, ohne Kreis, Vorgänger kommen zuerst', () => {
  for (const v of PLAN_VORLAGEN) {
    const r = vorlageReihenfolge(v);
    assert.ok(r && r.length === v.schritte.length, v.name);
    const pos = new Map(r.map((x, i) => [x.key, i]));
    for (const x of r) for (const n of x.nach ?? []) assert.ok(pos.get(n) < pos.get(x.key), `${v.name}: ${n} vor ${x.key}`);
    const plan = planBerechnen(r.map((x) => ({ id: x.key, titel: x.titel, dauer_tage: x.dauer, puffer_tage: x.puffer ?? 0, vorgaenger: x.nach ?? [] })), '2027-03-01', keine);
    assert.equal(plan.fehler, null, v.name);
    for (const x of r) assert.ok(pruefeVorgang({ titel: x.titel, gewerk: x.gewerk, dauer_tage: String(x.dauer), puffer_tage: String(x.puffer ?? 0) }).fehler === null, x.titel);
  }
  assert.equal(vorlageReihenfolge({ id: 'k', name: 'K', schritte: [{ key: 'a', titel: 'A', gewerk: '', dauer: 1, nach: ['b'] }, { key: 'b', titel: 'B', gewerk: '', dauer: 1, nach: ['a'] }] }), null);
});

import { termineJeFirma } from '../out/bauzeitenplan.js';

test('Termine je Firma: gruppiert, sortiert, gesiezt, fertige Vorgänge weg, Rückfall Gewerk', () => {
  const v = [
    { id: 'r', titel: 'Rohbau', dauer_tage: 10, firma: 'Bau Maier' },
    { id: 'e', titel: 'Estrich', dauer_tage: 2, vorgaenger: ['r'], gewerk: 'Estrichleger' },
    { id: 'z', titel: 'Zweiter Einsatz', dauer_tage: 1, vorgaenger: ['e'], firma: 'Bau Maier' },
    { id: 'x', titel: 'Erledigt', dauer_tage: 1, firma: 'Alt GmbH', fortschritt: 100 },
  ];
  const plan = planBerechnen(v, '2026-10-19', keine);
  const t = termineJeFirma(v, plan, 'Haus Müller', 'Schreinerei Beispiel');
  assert.deepEqual(t.map((x) => x.firma), ['Bau Maier', 'Estrichleger']);
  assert.equal(t[0].zeilen.length, 2);
  assert.match(t[0].text, /Rohbau: 19\.10\.2026 bis 30\.10\.2026/);
  assert.match(t[0].text, /Bitte geben Sie uns/);
  assert.doesNotMatch(t[0].text, /\bdu\b|\bdein/i);
  assert.ok(!t.some((x) => x.firma === 'Alt GmbH'));
  assert.deepEqual(termineJeFirma(v, { zeilen: new Map(), ende: null, fehler: 'x' }, '', ''), []);
});
