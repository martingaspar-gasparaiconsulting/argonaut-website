// Paket 332 (12.10.2026): BV2b Teil 1 — Einzelstück-Arten, Merkmal-Sätze, Begriffe, Branche → Art, GwG-Schwelle
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARTEN, artDef, artFuerBranche, merkmaleSauber, merkmalText, oeffentlicheMerkmale,
  seriennrPruefen, betriebsstundenPruefen, gwgPruefung,
} from '../out/einzelstueck.js';
import { vorlageFuer, feinschliffName } from '../out/branchenVorlage.js';
import { regelPasst } from '../out/kfzBestand.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Jede Art hat Begriffe, eindeutige Merkmal-Schlüssel und gültige Optionen', () => {
  assert.deepEqual([...ARTEN], ['kfz', 'boot', 'maschine', 'uhr_schmuck', 'kunst_antik', 'fahrrad', 'sonstig']);
  for (const a of ARTEN) {
    const d = artDef(a);
    assert.equal(d.art, a);
    assert.ok(d.begriffe.einheit && d.begriffe.titel && d.begriffe.ident, a);
    const keys = d.merkmale.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length, `${a}: doppelte Schlüssel`);
    for (const m of d.merkmale) {
      assert.match(m.key, /^[a-z_]+$/);
      if (m.typ === 'auswahl') assert.ok(m.optionen && m.optionen.length >= 2, `${a}.${m.key}`);
    }
  }
  assert.equal(artDef(null).art, 'kfz', 'alter Bestand ohne Art = kfz');
  assert.equal(artDef('quatsch').art, 'kfz');
});

test('Nur Straßenfahrzeuge haben FIN, Zulassung, CO₂; Uhr/Kunst keine Probefahrt', () => {
  assert.equal(artDef('kfz').kfzTeile.fin, true);
  for (const a of ['boot', 'maschine', 'uhr_schmuck', 'kunst_antik', 'fahrrad', 'sonstig']) {
    assert.equal(artDef(a).kfzTeile.fin, false, a);
    assert.equal(artDef(a).kfzTeile.co2, false, a);
  }
  assert.equal(artDef('uhr_schmuck').kfzTeile.probefahrt, false);
  assert.equal(artDef('kunst_antik').kfzTeile.probefahrt, false);
  assert.equal(artDef('maschine').begriffe.zaehler, 'betriebsstunden');
  assert.equal(artDef('boot').begriffe.zaehler, 'betriebsstunden');
});

test('Branche → Art: Kfz bleibt Kfz, Einzelstück-Branchen bekommen ihre Art', () => {
  const faelle = {
    'Autohaus': 'kfz', 'Motorradhandel': 'kfz', 'Zweiradhandel': 'kfz', 'Caravan & Wohnmobile': 'kfz', 'Oldtimerhandel': 'kfz', '': 'kfz',
    'Boots- & Yachthandel': 'boot', 'Bootshandel': 'boot', 'Bootcamp Fitness': 'kfz',
    'Landmaschinenhandel': 'maschine', 'Baumaschinenhandel': 'maschine', 'Gabelstapler-Service': 'maschine',
    'Juwelier': 'uhr_schmuck', 'Uhrmacher': 'uhr_schmuck', 'Goldankauf': 'uhr_schmuck',
    'Antiquitätenhandel': 'kunst_antik', 'Kunsthandel & Galerie': 'kunst_antik', 'Autoauktion': 'kfz',
    'Fahrradhandel': 'fahrrad', 'E-Bike-Shop': 'fahrrad',
    'Second-Hand-Laden': 'sonstig', 'Autoankauf': 'kfz',
  };
  for (const [b, a] of Object.entries(faelle)) assert.equal(artFuerBranche(b), a, b);
});

test('Vorlage: Feinschliff setzt art und Begriffe; Bootcamp ist kein Bootshandel', () => {
  assert.equal(vorlageFuer('kfz-bestand', 'Autohaus').art, undefined);
  assert.equal(vorlageFuer('kfz-bestand', 'Boots- & Yachthandel').art, 'boot');
  assert.equal(vorlageFuer('kfz-bestand', 'Bootcamp').art, undefined);
  assert.equal(vorlageFuer('kfz-bestand', 'Baumaschinenhandel').titel, 'Maschinenbestand');
  assert.equal(vorlageFuer('kfz-bestand', 'Juwelier').art, 'uhr_schmuck');
  assert.equal(vorlageFuer('kfz-bestand', 'Antiquitätenhandel').einheit, 'Objekt');
  assert.equal(vorlageFuer('kfz-bestand', 'Fahrradhandel').art, 'fahrrad');
  assert.equal(feinschliffName('kfz-bestand', 'Motorradhandel'), 'Motorradhandel', 'Motorrad bleibt vorne');
  // Gleiche Art in Vorlage und artFuerBranche
  for (const b of ['Boots- & Yachthandel', 'Landmaschinenhandel', 'Juwelier', 'Kunsthandel', 'Fahrradhandel', 'Second Hand', 'Autohaus', 'Motorradhandel']) {
    assert.equal(vorlageFuer('kfz-bestand', b).art ?? 'kfz', artFuerBranche(b), b);
  }
});

test('Merkmale: nur bekannte Schlüssel, Zahlen mit Komma, Auswahl aus der Liste, Fehler gesammelt', () => {
  const r = merkmaleSauber('boot', { laenge_m: '12,5', rumpf: 'GFK', trailer: 'ja', fremd: 'x', kojen: '', motor: '  Volvo  D4 ' });
  assert.deepEqual(r.werte, { laenge_m: 12.5, rumpf: 'GFK', motor: 'Volvo D4', trailer: true });
  assert.deepEqual(r.fehler, []);
  const f = merkmaleSauber('boot', { laenge_m: 'lang', rumpf: 'Beton', tiefgang_m: 99 });
  assert.equal(f.fehler.length, 3);
  assert.deepEqual(f.werte, {});
  assert.deepEqual(merkmaleSauber('kfz', { laenge_m: 5 }).werte, {}, 'Kfz hat keine Merkmale');
  assert.equal(merkmaleSauber('maschine', { gewicht_kg: '12.500' }).werte.gewicht_kg, 12500);
});

test('Anzeige und Positivliste: Provenienz und Liegeplatz nie öffentlich', () => {
  const b = artDef('boot').merkmale.find((m) => m.key === 'laenge_m');
  assert.equal(merkmalText(b, 12.5), '12,5 m');
  assert.equal(merkmalText(b, null), '—');
  const k = oeffentlicheMerkmale('kunst_antik', { gattung: 'Gemälde', provenienz: 'Sammlung X', signiert: true });
  assert.deepEqual(k.map((x) => x.label), ['Gattung', 'Signiert']);
  assert.deepEqual(oeffentlicheMerkmale('boot', { liegeplatz: 'Hafen 3', laenge_m: 8 }).map((x) => x.label), ['Länge']);
});

test('Kennung und Betriebsstunden', () => {
  assert.deepEqual(seriennrPruefen(' WNE 12345 / A '), { ok: true, wert: 'WNE 12345 / A' });
  assert.deepEqual(seriennrPruefen(''), { ok: true, wert: null });
  assert.equal(seriennrPruefen('<script>').ok, false);
  assert.equal(seriennrPruefen('x'.repeat(61)).ok, false);
  assert.deepEqual(betriebsstundenPruefen(1234.6), { ok: true, wert: 1235 });
  assert.equal(betriebsstundenPruefen(-1).ok, false);
});

test('GwG: allgemein bar ab 10.000, Edelmetall bar ab 2.000, Kunst ab 10.000 jede Zahlart', () => {
  assert.equal(gwgPruefung('kfz', null, 20000, 9999).pflicht, false);
  assert.equal(gwgPruefung('kfz', null, 20000, 10000).pflicht, true);
  assert.equal(gwgPruefung('uhr_schmuck', { edelmetall: true }, 2500, 2000).pflicht, true);
  assert.equal(gwgPruefung('uhr_schmuck', { edelmetall: false }, 2500, 2500).pflicht, false);
  assert.equal(gwgPruefung('kunst_antik', null, 10000, 0).pflicht, true, 'Kunst: Überweisung zählt');
  assert.equal(gwgPruefung('kunst_antik', null, 9999, 9999).pflicht, false);
});

test('Suchregel bh und art im Bestand', () => {
  const b = { id: '1', status: 'bestand', betriebsstunden: 6000, art: 'maschine' };
  assert.equal(regelPasst(b, 'bh>5000', '2026-10-12'), true);
  assert.equal(regelPasst({ ...b, betriebsstunden: null }, 'bh>5000', '2026-10-12'), false);
  assert.equal(regelPasst(b, 'art=maschine', '2026-10-12'), true);
  assert.equal(regelPasst({ id: '2', status: 'bestand' }, 'art=kfz', '2026-10-12'), true, 'ohne Art = kfz');
});

test('SQL additiv: keine Regel angefasst, nichts gelöscht, FIN-Prüfung bleibt', () => {
  const sql = lies('supabase-sql/p332-einzelstueck.sql');
  assert.match(sql, /add column if not exists art text not null default 'kfz'/);
  assert.match(sql, /add column if not exists merkmale jsonb/);
  assert.doesNotMatch(sql, /policy|drop table|drop column|truncate|delete from|fin_check|drop constraint/i);
  for (const a of ARTEN) assert.match(sql, new RegExp(`'${a}'`), a);
});
