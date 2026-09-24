// Paket PE (24.09.2026) — EIN Motor fuer Nachweise und Fristen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPPEN, KATALOG, katalogArt, katalogFuer, vorschlaege, plusMonate, tageBis, heuteIso, istIsoDatum,
  bewerte, zaehle, sortiere, unterschriftenStand, unterschriftGueltig, radarKommend, RADAR, HINWEIS_RICHTWERTE,
} from '../out/nachweisMotor.js';

const HEUTE = '2026-09-24';

test('fuenf Mappen, jeder Katalog-Schluessel eindeutig und einer Mappe zugeordnet', () => {
  assert.equal(MAPPEN.length, 5);
  const keys = KATALOG.map((k) => k.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of KATALOG) assert.ok(MAPPEN.some((m) => m.key === k.mappe), k.key);
  for (const m of MAPPEN) assert.ok(katalogFuer(m.key).length > 0, m.key);
  assert.equal(katalogArt('gibtsnicht'), null);
});

test('Unterweisung: jaehrlich und mit Unterschrift', () => {
  const u = katalogArt('unterweisung');
  assert.equal(u.intervall, 12);
  assert.equal(u.unterschrift, true);
  assert.match(u.grundlage, /§ 12 ArbSchG/);
});

test('Monatsrechnung ohne Ueberlauf und ohne Zeitzone', () => {
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2028-01-31', 1), '2028-02-29');
  assert.equal(plusMonate('2026-08-31', 6), '2027-02-28');
  assert.equal(plusMonate('2026-12-15', 12), '2027-12-15');
  assert.equal(plusMonate('2027-01-01', -1), '2026-12-01');
  assert.equal(plusMonate('2026-03-31', -1), '2026-02-28');
  assert.equal(plusMonate('31.01.2026', 1), null);
  assert.equal(istIsoDatum('2026-02-30'), false);
});

test('heute in deutscher Zeit', () => {
  assert.equal(heuteIso(new Date('2026-09-24T22:30:00Z')), '2026-09-25');
  assert.equal(tageBis('2026-09-24', '2026-10-01'), 7);
});

test('ohne Datum: FEHLT (rot), nie still gruen', () => {
  const b = bewerte({ art: 'unterweisung', intervall_monate: 12 }, HEUTE);
  assert.equal(b.status, 'fehlt');
});

test('letzte + Intervall ergibt Faelligkeit, Ampel nach Vorwarnzeit', () => {
  assert.equal(bewerte({ art: 'unterweisung', letzte_am: '2025-10-10', intervall_monate: 12 }, HEUTE).status, 'bald');
  assert.equal(bewerte({ art: 'unterweisung', letzte_am: '2026-03-01', intervall_monate: 12 }, HEUTE).status, 'ok');
  const ue = bewerte({ art: 'unterweisung', letzte_am: '2025-09-01', intervall_monate: 12 }, HEUTE);
  assert.equal(ue.status, 'ueberfaellig');
  assert.equal(ue.faellig, '2026-09-01');
  assert.match(ue.text, /seit 23 Tagen/);
});

test('festes Ablaufdatum schlaegt das Intervall', () => {
  const b = bewerte({ art: 'a1', gueltig_bis: '2026-10-05', letzte_am: '2020-01-01', intervall_monate: 1 }, HEUTE);
  assert.equal(b.faellig, '2026-10-05');
  assert.equal(b.status, 'bald');
});

test('anlassbezogen und erledigt: neutral, nicht rot', () => {
  const b = bewerte({ art: 'betriebsanweisung', letzte_am: '2025-05-01', intervall_monate: null }, HEUTE);
  assert.equal(b.status, 'anlass');
});

test('Versicherung: gelb nach KUENDIGEN BIS, nicht nach Ablauf', () => {
  // Ablauf 01.01.2027, Frist 3 Monate -> kuendigen bis 01.10.2026 -> in 7 Tagen
  const b = bewerte({ art: 'betriebshaftpflicht', gueltig_bis: '2027-01-01', kuendigungsfrist_monate: 3 }, HEUTE);
  assert.equal(b.kuendigenBis, '2026-10-01');
  assert.equal(b.status, 'bald');
  assert.match(b.text, /kündigen bis 01\.10\.2026/);
  // Frist verpasst, Vertrag laeuft noch -> gelb mit Klartext, nicht rot
  const v = bewerte({ art: 'betriebshaftpflicht', gueltig_bis: '2026-12-01', kuendigungsfrist_monate: 3 }, HEUTE);
  assert.equal(v.status, 'bald');
  assert.match(v.text, /Kündigungsfrist verpasst/);
});

test('Zaehlen und Sortieren: fehlt und ueberfaellig oben', () => {
  const zeilen = [
    { id: 'ok', art: 'unterweisung', letzte_am: '2026-06-01', intervall_monate: 12 },
    { id: 'fehlt', art: 'gefaehrdungsbeurteilung', intervall_monate: 12 },
    { id: 'ueber', art: 'feuerloescher', letzte_am: '2024-01-01', intervall_monate: 24 },
    { id: 'bald', art: 'unterweisung', letzte_am: '2025-10-01', intervall_monate: 12 },
  ];
  assert.deepEqual(sortiere(zeilen, HEUTE).map((z) => z.id), ['fehlt', 'ueber', 'bald', 'ok']);
  assert.deepEqual(zaehle(zeilen, HEUTE), { gesamt: 4, fehlt: 1, ueberfaellig: 1, bald: 1, ok: 1 });
});

test('Vorschlaege je Branche: Grundausstattung fuer alle, Branchenpflichten nur passend', () => {
  const gastro = vorschlaege('Gastronomie, Hotellerie & Tourismus', []).map((k) => k.key);
  assert.ok(gastro.includes('unterweisung'));
  assert.ok(gastro.includes('infektionsschutz'));
  assert.ok(!gastro.includes('leitern'));
  const bau = vorschlaege('Handwerk & Bau', ['unterweisung']).map((k) => k.key);
  assert.ok(!bau.includes('unterweisung'), 'schon angelegt');
  assert.ok(bau.includes('leitern'));
  assert.ok(!bau.includes('infektionsschutz'));
  assert.ok(!vorschlaege('Handwerk & Bau', []).some((k) => k.mappe === 'versicherung'));
  const ohne = vorschlaege(null, []).map((k) => k.key);
  assert.ok(ohne.includes('gefaehrdungsbeurteilung'));
  assert.ok(!ohne.includes('infektionsschutz'));
});

test('Unterschriften: nur nach dem Unterweisungsdatum zaehlen', () => {
  const personen = [{ id: 'm1', name: 'Anna Maier' }, { id: 'm2', name: 'Bernd Kurz' }, { id: 'm3', name: 'Cem Yilmaz' }];
  const u = [
    { mitarbeiter_id: 'm1', name: 'Anna Maier', unterschrieben_am: '2026-09-20T08:00:00Z' },
    { mitarbeiter_id: 'm2', name: 'Bernd Kurz', unterschrieben_am: '2025-09-20T08:00:00Z' },
    { mitarbeiter_id: null, name: 'cem yilmaz', unterschrieben_am: '2026-09-21T08:00:00Z' },
  ];
  const s = unterschriftenStand('2026-09-15', personen, u);
  assert.equal(s.unterschrieben, 2);
  assert.deepEqual(s.fehlend.map((p) => p.id), ['m2']);
});

test('Unterschrift: nur PNG, nicht leer, nicht riesig', () => {
  assert.equal(unterschriftGueltig('data:image/png;base64,' + 'A'.repeat(500)), true);
  assert.equal(unterschriftGueltig('data:image/svg+xml;base64,' + 'A'.repeat(500)), false);
  assert.equal(unterschriftGueltig('data:image/png;base64,AA'), false);
  assert.equal(unterschriftGueltig('data:image/png;base64,' + 'A'.repeat(300000)), false);
});

test('Gesetzes-Radar: nur Kommendes, nach Datum, mit Quelle', () => {
  const r = radarKommend(HEUTE);
  assert.ok(r.length >= 3);
  assert.equal(r[0].ab <= r[r.length - 1].ab, true);
  for (const e of RADAR) assert.ok(e.quelle.length > 5);
  assert.equal(radarKommend('2029-01-01').length, 0);
  assert.ok(RADAR.some((e) => /14,60/.test(e.titel)));
});

test('Hinweis auf Richtwerte ist da', () => {
  assert.match(HINWEIS_RICHTWERTE, /Keine Rechtsberatung/);
});
