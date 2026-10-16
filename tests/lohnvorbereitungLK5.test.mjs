import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fensterEinerSitzung, monatsZeile, arbeitstage, abwesenheitTage, csvExport, stunden, monatsGrenzen } from '../out/lohnvorbereitung.js';

// LK5 Teil 1 (16.10.2026) — Lohnvorbereitung: Zeitfenster, Soll/Ist, Export

const keine = new Set();
const s = (kommen, gehen, pause = 0, datum = kommen.slice(0, 10)) => ({ mitarbeiter_id: 'm1', datum, kommen_um: kommen, gehen_um: gehen, pause_minuten: pause });

test('Tagschicht: keine Zuschlagsfenster, Pause abgezogen', () => {
  // 07:00–16:00 MESZ = 05:00–14:00Z, Mittwoch 14.10.2026
  const f = fensterEinerSitzung(s('2026-10-14T05:00:00Z', '2026-10-14T14:00:00Z', 30), keine);
  assert.equal(f.gesamt, 510);
  assert.equal(f.nacht, 0); assert.equal(f.sonntag, 0); assert.equal(f.feiertag, 0);
});

test('Nachtschicht ueber Mitternacht: 22–6 Uhr, davon 0–4 Uhr', () => {
  // Di 13.10. 22:00 MESZ bis Mi 14.10. 06:00 MESZ
  const f = fensterEinerSitzung(s('2026-10-13T20:00:00Z', '2026-10-14T04:00:00Z'), keine);
  assert.equal(f.gesamt, 480);
  assert.equal(f.nacht, 480);
  assert.equal(f.nachtTief, 240);
});

test('Schicht ab 0 Uhr: kein 0–4-Fenster (Beginn nicht vor Mitternacht)', () => {
  const f = fensterEinerSitzung(s('2026-10-13T22:00:00Z', '2026-10-14T02:00:00Z'), keine); // 00–04 MESZ
  assert.equal(f.nacht, 240);
  assert.equal(f.nachtTief, 0);
});

test('Sonntag, Feiertag, 31.12. ab 14 Uhr, 24.12. ab 14 Uhr', () => {
  const so = fensterEinerSitzung(s('2026-10-18T06:00:00Z', '2026-10-18T10:00:00Z'), keine); // So 08–12
  assert.equal(so.sonntag, 240);
  const fe = new Set(['2026-10-03']);
  const tde = fensterEinerSitzung(s('2026-10-03T06:00:00Z', '2026-10-03T10:00:00Z'), fe); // Sa 03.10. Feiertag
  assert.equal(tde.feiertag, 240); assert.equal(tde.sonntag, 0);
  const fs27 = fensterEinerSitzung(s('2027-10-03T06:00:00Z', '2027-10-03T10:00:00Z'), new Set(['2027-10-03'])); // So 03.10.2027
  assert.equal(fs27.feiertag, 240); assert.equal(fs27.sonntag, 0, 'Sonntag und Feiertag nie doppelt');
  const sil = fensterEinerSitzung(s('2026-12-31T11:00:00Z', '2026-12-31T15:00:00Z'), keine); // 12–16 MEZ
  assert.equal(sil.feiertag, 120);
  const hl = fensterEinerSitzung(s('2026-12-24T11:00:00Z', '2026-12-24T15:00:00Z'), keine);
  assert.equal(hl.feiertagHoch, 120); assert.equal(hl.feiertag, 0);
  const mai = fensterEinerSitzung(s('2027-05-01T06:00:00Z', '2027-05-01T10:00:00Z'), new Set(['2027-05-01']));
  assert.equal(mai.feiertagHoch, 240); assert.equal(mai.feiertag, 0, 'nie doppelt');
});

test('Umstellung Sommer-/Winterzeit: echte Minuten, deutsche Uhrzeit', () => {
  // So 25.10.2026: 23:00 MESZ (21:00Z) bis 05:00 MEZ (04:00Z) = 7 echte Stunden
  const f = fensterEinerSitzung(s('2026-10-24T21:00:00Z', '2026-10-25T04:00:00Z', 0, '2026-10-24'), keine);
  assert.equal(f.gesamt, 420);
  assert.equal(f.nacht, 420);
});

test('Offene oder unsinnige Schicht zaehlt nicht', () => {
  assert.equal(fensterEinerSitzung(s('2026-10-14T05:00:00Z', null), keine), null);
  assert.equal(fensterEinerSitzung(s('2026-10-14T05:00:00Z', '2026-10-14T04:00:00Z'), keine), null);
  assert.equal(fensterEinerSitzung(s('2026-10-14T05:00:00Z', '2026-10-16T05:00:00Z'), keine), null);
});

test('Monat: Arbeitstage, Abwesenheit, Soll, Mehrarbeit, Hinweise', () => {
  const fe = new Set(['2026-10-03']);
  assert.equal(arbeitstage('2026-10', fe), 22); // Oktober 2026: 22 Werktage, 03.10. ist Samstag
  assert.deepEqual(monatsGrenzen('2026-02'), { von: '2026-02-01', bis: '2026-02-28' });
  const abw = [
    { mitarbeiter_id: 'm1', typ: 'urlaub', von: '2026-09-28', bis: '2026-10-02', status: 'genehmigt' },
    { mitarbeiter_id: 'm1', typ: 'urlaub', von: '2026-10-20', bis: '2026-10-20', status: 'beantragt' },
    { mitarbeiter_id: 'm1', typ: 'krankheit', von: '2026-10-12', bis: '2026-10-13', status: 'erfasst' },
  ];
  assert.deepEqual(abwesenheitTage(abw, '2026-10', fe), { urlaub: 2, krank: 2 }, 'nur Tage im Monat, beantragt zaehlt nicht');
  const sitz = [s('2026-10-14T05:00:00Z', '2026-10-14T14:00:00Z', 60), s('2026-10-15T05:00:00Z', null)];
  const z = monatsZeile({ id: 'm1', vorname: 'Eva', nachname: 'Muster', wochenstunden: 40 }, sitz, abw, [{ reisender: 'Eva Muster', abreise: '2026-10-05T07:00:00Z', gesamt: 28 }], '2026-10', fe);
  assert.equal(z.fenster.gesamt, 480);
  assert.equal(z.sollMin, 22 * 8 * 60);
  assert.equal(z.mehrMin, 480 + 4 * 480 - 22 * 480);
  assert.equal(z.spesen, 28);
  assert.match(z.hinweise.join(), /ohne „Gehen"/);
  const ohneWs = monatsZeile({ id: 'm1', vorname: 'Eva' }, [], [], [], '2026-10', fe);
  assert.equal(ohneWs.sollMin, null);
  assert.match(ohneWs.hinweise.join(), /Wochenstunden/);
});

test('CSV: Semikolon, deutsche Zahlen, keine Formel-Einschleusung', () => {
  const z = monatsZeile({ id: 'm1', vorname: '=HYPERLINK("x")', nachname: 'A;B', wochenstunden: '40' }, [s('2026-10-14T05:00:00Z', '2026-10-14T14:00:00Z', 30)], [], [], '2026-10', keine);
  const csv = csvExport([z], '2026-10');
  assert.ok(csv.startsWith('﻿Personalnummer;Name;'));
  const zeile = csv.split('\r\n')[1];
  assert.match(zeile, /"'=HYPERLINK\(""x""\) A;B"/);
  assert.match(zeile, /;8,50;/);
  assert.equal(stunden(90), '1,50');
});

test('Waechter: Seite rechnet keinen Lohn und nutzt die Logik', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/personal/lohnvorbereitung/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /monatsZeile\(/);
  assert.match(seite, /csvExport\(/);
  assert.match(seite, /keine Lohnabrechnung/i);
});
