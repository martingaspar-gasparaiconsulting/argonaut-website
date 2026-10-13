// ============================================================================
// tests/tierArzneiP357.test.mjs — Paket 357 (13.10.2026)
// A4d Fachpaket Tierhaltung: Arzneimittel-Bestandsbuch (Erwerb, Anwendung,
// Wartezeiten, Fristen, Antibiotika-Übersicht, Druck).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mengeLesen, wartezeitLesen, anzahlLesen, tageDazu, freiAb, behandlungsTage, eingangPruefen, anwendungPruefen,
  sperrStand, gesperrt, halbjahr, mitteilungsFrist, antibiotikaHalbjahr, fristen, aufbewahrenBis, kennzahlen,
  bestandsbuchHtml, antibiotikaCsv, mengeText,
} from '../out/tierArznei.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const A = (id, extra = {}) => ({
  id, gruppe_id: 'g1', gruppe_bezeichnung: 'Milchkühe', tierart: 'rind', tier_kennung: 'DE 01 234 56789', anzahl_tiere: 2, arzneimittel: 'Mittel X',
  eingang_id: null, beleg_nr: 'AuA-1', menge: 20, einheit: 'ml', dosierung: null, datum_von: '2026-10-10', datum_bis: '2026-10-12',
  wartezeit_fleisch: 28, wartezeit_milch: 5, wartezeit_eier: null, antibiotikum: false, tierarzt: 'Praxis Huf', anwender_name: 'Eva', notiz: null,
  status: 'gueltig', storno_grund: null, erfasst_am: '2026-10-10T08:00:00Z', erfasst_name: 'Eva Stall', ...extra,
});
const E = (id, extra = {}) => ({
  id, datum: '2026-10-01', arzneimittel: 'Mittel X', zulassungs_nr: null, charge: 'C1', menge: 100, einheit: 'ml', lieferant: 'Praxis Huf',
  beleg_nr: 'L-1', verfall: null, notiz: null, status: 'gueltig', storno_grund: null, erfasst_am: '2026-10-01T08:00:00Z', erfasst_name: 'Chef', ...extra,
});

test('Eingaben lesen wie die Datenbank', () => {
  assert.equal(mengeLesen('2,5'), 2.5);
  assert.equal(mengeLesen('1.234,567'), 1234.567);
  assert.equal(mengeLesen('1,2345'), undefined);
  assert.equal(mengeLesen('0'), undefined);
  assert.equal(mengeLesen(''), null);
  assert.equal(wartezeitLesen('28'), 28);
  assert.equal(wartezeitLesen('0'), 0, '0 Tage ist eine gültige Wartezeit');
  assert.equal(wartezeitLesen(''), null);
  assert.equal(wartezeitLesen('1000'), undefined);
  assert.equal(wartezeitLesen('2,5'), undefined);
  assert.equal(anzahlLesen('1.200'), 1200);
  assert.equal(anzahlLesen('0'), undefined);
  assert.equal(anzahlLesen('100001'), undefined);
  assert.equal(anzahlLesen('2,5'), undefined, 'nur ganze Tiere');
  assert.equal(anzahlLesen(''), undefined);
  assert.equal(mengeText(1234.5, 'ml'), '1.234,5 ml');
});

test('Frei ab = letzter Behandlungstag + Wartezeit (wie date + integer)', () => {
  assert.equal(freiAb('2026-10-12', 28), '2026-11-09');
  assert.equal(freiAb('2026-10-12', 0), '2026-10-12');
  assert.equal(freiAb('2026-10-12', null), null);
  assert.equal(tageDazu('2026-03-28', 2), '2026-03-30', 'über die Zeitumstellung');
  assert.equal(tageDazu('2028-02-28', 1), '2028-02-29');
  assert.equal(behandlungsTage('2026-10-10', '2026-10-12'), 3);
  assert.equal(behandlungsTage('2026-10-12', '2026-10-10'), 0);
});

test('Erwerb prüfen', () => {
  const g = { datum: '2026-10-13', arzneimittel: 'Mittel X', menge: '100', einheit: 'ml', lieferant: 'Praxis Huf', beleg_nr: 'L-1' };
  const ok = eingangPruefen(g, '2026-10-13');
  assert.equal(ok.ok, true);
  assert.equal(ok.werte.menge, 100);
  assert.deepEqual(ok.hinweise, []);
  assert.match(eingangPruefen({ ...g, datum: '2026-10-14' }, '2026-10-13').fehler.join(' '), /Zukunft/);
  assert.match(eingangPruefen({ ...g, lieferant: '' }, '2026-10-13').fehler.join(' '), /Tierarztpraxis oder Apotheke/);
  assert.match(eingangPruefen({ ...g, einheit: 'fass' }, '2026-10-13').fehler.join(' '), /Einheit/);
  assert.match(eingangPruefen({ ...g, beleg_nr: '' }, '2026-10-13').hinweise.join(' '), /Belegnummer/);
  assert.match(eingangPruefen({ ...g, verfall: '2026-10-01' }, '2026-10-13').hinweise.join(' '), /überschritten/);
});

test('Anwendung prüfen: Wartezeit Pflicht, Zeitraum, Hinweise', () => {
  const g = { gruppe_id: 'g1', anzahl_tiere: '2', arzneimittel: 'Mittel X', menge: '20', einheit: 'ml', datum_von: '2026-10-10', datum_bis: '2026-10-12',
    wartezeit_fleisch: '28', wartezeit_milch: '5', wartezeit_eier: '', anwender_name: 'Eva', beleg_nr: 'AuA-1', tier_kennung: 'DE 01' };
  const ok = anwendungPruefen(g, '2026-10-13', 'rind');
  assert.equal(ok.ok, true);
  assert.equal(ok.werte.wartezeit_eier, null);
  assert.equal(ok.werte.datum_bis, '2026-10-12');
  assert.equal(anwendungPruefen({ ...g, datum_bis: '' }, '2026-10-13').werte.datum_bis, '2026-10-10', 'leeres Bis = ein Behandlungstag');
  assert.match(anwendungPruefen({ ...g, wartezeit_fleisch: '', wartezeit_milch: '' }, '2026-10-13').fehler.join(' '), /mindestens eine Wartezeit/);
  assert.equal(anwendungPruefen({ ...g, wartezeit_fleisch: '0', wartezeit_milch: '' }, '2026-10-13').ok, true);
  assert.match(anwendungPruefen({ ...g, datum_von: '2026-10-14', datum_bis: '2026-10-14' }, '2026-10-13').fehler.join(' '), /Zukunft/);
  assert.match(anwendungPruefen({ ...g, datum_bis: '2026-10-09' }, '2026-10-13').fehler.join(' '), /vor dem ersten/);
  assert.match(anwendungPruefen({ ...g, datum_von: '2025-01-01', datum_bis: '2026-10-01' }, '2026-10-13').fehler.join(' '), /höchstens ein Jahr/);
  assert.match(anwendungPruefen({ ...g, anwender_name: '' }, '2026-10-13').fehler.join(' '), /angewendet/);
  assert.match(anwendungPruefen({ ...g, wartezeit_milch: '5,5' }, '2026-10-13').fehler.join(' '), /Wartezeit Milch/);
  assert.match(anwendungPruefen({ ...g, tier_kennung: '' }, '2026-10-13', 'rind').hinweise.join(' '), /Ohrmarken/);
  assert.equal(anwendungPruefen({ ...g, tier_kennung: '' }, '2026-10-13', 'gefluegel').hinweise.length, 0);
  assert.match(anwendungPruefen({ ...g, antibiotikum: true }, '2026-10-13').hinweise.join(' '), /Tierarztpraxis/);
});

test('Sperr-Stand: längste Wartezeit zählt, Stornierte nicht, am Frei-Tag frei', () => {
  const liste = [A('a1'), A('a2', { arzneimittel: 'Mittel Y', datum_bis: '2026-10-13', wartezeit_fleisch: 3, wartezeit_milch: 7 }), A('a3', { status: 'storniert', wartezeit_milch: 90 })];
  const s = sperrStand(liste, '2026-10-13');
  assert.equal(s.length, 2);
  const milch = gesperrt(s, 'g1', 'milch');
  assert.equal(milch.frei_ab, '2026-10-20');
  assert.deepEqual(milch.mittel, ['Mittel X', 'Mittel Y']);
  assert.equal(gesperrt(s, 'g1', 'fleisch').frei_ab, '2026-11-09');
  assert.equal(gesperrt(s, 'g1', 'eier'), null);
  assert.equal(gesperrt(sperrStand(liste, '2026-11-09'), 'g1', 'fleisch'), null, 'am Frei-Tag nicht mehr gesperrt');
  assert.equal(gesperrt(sperrStand(liste, '2026-11-08'), 'g1', 'fleisch').rest_tage, 1);
  assert.equal(gesperrt(sperrStand([A('d', { frei_fleisch_ab: '2027-01-01' })], '2026-12-01'), 'g1', 'fleisch').frei_ab, '2027-01-01', 'Datenbank-Wert hat Vorrang');
});

test('Halbjahr, Mitteilungsfrist, Antibiotika-Übersicht mit Teilung an der Grenze', () => {
  assert.deepEqual(halbjahr('2026-06-30'), { jahr: 2026, h: 1 });
  assert.deepEqual(halbjahr('2026-07-01'), { jahr: 2026, h: 2 });
  assert.equal(mitteilungsFrist(2026, 1), '2026-07-14');
  assert.equal(mitteilungsFrist(2026, 2), '2027-01-14');
  const liste = [
    A('b1', { antibiotikum: true, datum_von: '2026-06-29', datum_bis: '2026-07-02', menge: 40 }),
    A('b2', { antibiotikum: true, datum_von: '2026-03-01', datum_bis: '2026-03-01', menge: 5 }),
    A('b3', { antibiotikum: false, datum_von: '2026-03-01', datum_bis: '2026-03-01' }),
    A('b4', { antibiotikum: true, status: 'storniert', datum_von: '2026-03-02', datum_bis: '2026-03-02' }),
  ];
  const h1 = antibiotikaHalbjahr(liste, 2026, 1);
  assert.equal(h1.length, 1);
  assert.equal(h1[0].anwendungen, 2);
  assert.equal(h1[0].behandlungstage, 3, '2 Tage im Juni + 1 Tag im März');
  assert.equal(h1[0].menge, 25, '20 von 40 ml anteilig + 5 ml');
  assert.equal(h1[0].tiere, 4);
  const h2 = antibiotikaHalbjahr(liste, 2026, 2);
  assert.equal(h2[0].behandlungstage, 2);
  assert.equal(h2[0].menge, 20);
  const csv = antibiotikaCsv([{ ...h1[0], gruppe: '=HYPERLINK("x")' }]);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(!/;=HYPERLINK/.test(csv), 'Formel-Schutz');
});

test('Fristen: Wartezeit-Ende, Antibiotika-Mitteilung nur mit Anwendungen, Verfall', () => {
  const anw = [A('a1'), A('b1', { antibiotikum: true, datum_von: '2026-05-02', datum_bis: '2026-05-04', wartezeit_milch: null })];
  const ein = [E('e1', { verfall: '2026-08-01' }), E('e2', { verfall: '2027-06-01' }), E('e3', { verfall: '2026-08-02', status: 'storniert' })];
  const f = fristen(anw, ein, '2026-07-10');
  assert.ok(f.some((x) => x.art === 'antibiotika' && x.datum === '2026-07-14' && x.dringend));
  assert.ok(f.some((x) => x.art === 'verfall' && x.datum === '2026-08-01'));
  assert.ok(!f.some((x) => x.art === 'verfall' && x.datum !== '2026-08-01'));
  assert.ok(!fristen(anw, [], '2026-07-15').some((x) => x.art === 'antibiotika'), 'nach der Frist nicht mehr');
  assert.ok(!fristen([A('a1')], [], '2026-07-10').some((x) => x.art === 'antibiotika'), 'ohne Antibiotika keine Mitteilung');
  const w = fristen([A('a1')], [], '2026-10-13');
  assert.ok(w.some((x) => x.art === 'wartezeit' && x.datum === '2026-10-17'), 'Milch endet in 4 Tagen');
  assert.ok(!w.some((x) => x.datum === '2026-11-09'), 'Fleisch erst in 27 Tagen — nicht in der 14-Tage-Liste');
  const k = kennzahlen([A('a1'), A('b1', { antibiotikum: true })], [], '2026-10-13');
  assert.equal(k.gesperrteGruppen, 1);
  assert.equal(k.antibiotikaJahr, 1);
  assert.equal(aufbewahrenBis('2026-10-13'), '2031-10-13');
  assert.equal(aufbewahrenBis('2028-02-29'), '2033-02-28');
});

test('Druck: Bestandsbuch maskiert, Storno sichtbar, frei ab, ohne Gruppe mit Erwerb', () => {
  const firma = { name: 'Hof <Huber>', strasse: 'Weg 1', plz: '71032', ort: 'Böblingen', telefon: null, email: null };
  const html = bestandsbuchHtml({ firma, von: '2026-10-01', bis: '2026-10-31', eingaenge: [E('e1')], anwendungen: [A('a1'), A('a2', { status: 'storniert', storno_grund: 'Tippfehler' })], gedrucktAm: '2026-10-13T10:00:00Z' });
  assert.ok(html.includes('Hof &lt;Huber&gt;'));
  assert.ok(!html.includes('<Huber>'));
  assert.ok(html.includes('Fleisch: 28 T. → 09.11.2026'));
  assert.ok(html.includes('Storno: Tippfehler'));
  assert.ok(html.includes('Erwerb (1)'));
  assert.ok(bestandsbuchHtml({ firma, von: '2026-10-01', bis: '2026-10-31', eingaenge: [], anwendungen: [A('g', { anzahl_tiere: 1200 })], gedrucktAm: '2026-10-13T10:00:00Z' }).includes('>1.200<'), 'Tausenderpunkt');
  const nurGruppe = bestandsbuchHtml({ firma, von: '2026-10-01', bis: '2026-10-31', gruppe: 'Milchkühe', eingaenge: [E('e1')], anwendungen: [A('a1')], gedrucktAm: '2026-10-13T10:00:00Z' });
  assert.ok(!nurGruppe.includes('Erwerb ('));
});

test('Verdrahtung: SQL, Seite, Menü, Sicherung, Guide', () => {
  const sql = lies('supabase-sql/p357-tier-arznei-bestandsbuch.sql');
  assert.match(sql, /frei_fleisch_ab\s+date generated always as \(datum_bis \+ wartezeit_fleisch\) stored/);
  assert.match(sql, /new := old;/);
  assert.match(sql, /darf_ich_modul_aendern\(''tierbestand''\)/);
  assert.ok(!/p357_ma_update|p357_ma_delete/.test(sql), 'Mitarbeiter ändern und löschen nichts');
  const sicher = lies('lib/sicherungTabellen.ts');
  for (const t of ['tier_arznei_eingang', 'tier_arznei_anwendung']) assert.ok(sicher.includes(`'${t}'`), t);
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/tierbestand\/arznei', modul: 'tierbestand'/);
  assert.ok(lies('lib/guideWissen.ts').includes('/dashboard/tierbestand/arznei'));
  const seite = lies('app/dashboard/tierbestand/arznei/page.tsx');
  assert.ok(!/frei_fleisch_ab\s*:/.test(seite.replace(/\/\/.*$/gm, '')), 'Seite schreibt nie die gerechnete Spalte');
  assert.ok(!/\.delete\(/.test(seite), 'kein Löschen');
  assert.ok(lies('app/dashboard/tierbestand/page.tsx').includes('/dashboard/tierbestand/arznei'), 'Link vom Tierbestand');
});
