// Paket 136 (27.09.2026) — Bestand je Filiale: Zaehlstaende als Korrektur, nichts angelegt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';
import {
  baueArtikelSuche, baueStandortSuche, findeArtikel, findeStandort, planeBestand, bestandSumme,
  bestandGrund, rueckDaten, leseRueckDaten, planeRueckgaengig, bestandSchluessel,
} from '../out/importBestand.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const ARTIKEL = [
  { id: 'a1', artikelnummer: 'L-1001', bezeichnung: 'Mantelleitung NYM-J 3x1,5', ean: '2047110000009', aktueller_bestand: 30 },
  { id: 'a2', artikelnummer: 'L-1002', bezeichnung: 'Mantelleitung NYM-J 3x2,5', ean: '', aktueller_bestand: 16 },
  { id: 'a3', artikelnummer: 'X-7', bezeichnung: 'Doppelt', aktueller_bestand: 0 },
  { id: 'a4', artikelnummer: 'x-7', bezeichnung: 'Doppelt', aktueller_bestand: 0 },
];
const FILIALEN = [
  { id: 's1', name: 'Filiale Böblingen', ort: 'Böblingen', ist_hauptsitz: true, aktiv: true },
  { id: 's2', name: 'Filiale Sindelfingen', ort: 'Sindelfingen', ist_hauptsitz: false, aktiv: true },
  { id: 's3', name: 'Alte Filiale', ort: 'Calw', ist_hauptsitz: false, aktiv: false },
];

function lauf(text, standorte = FILIALEN, vorhanden = [{ artikel_id: 'a1', standort_id: 's1', bestand: 24 }]) {
  const t = leseCsv(text);
  const z = katalogFuerZiel('bestand_filiale', null).ziel;
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  const b = pruefeAlles('bestand_filiale', map, t.kopf, t.zeilen, { ziel: z });
  const plan = planeBestand(b.saetze, b.zeilenNummern, baueArtikelSuche(ARTIKEL), baueStandortSuche(standorte), vorhanden);
  return { t, z, map, b, plan, bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 136: Ziel ohne Anlegen, Karte auf dem Motor, Motor-Tabellen unveraendert (62)', () => {
  const z = zielDef('bestand_filiale');
  assert.equal(z.bestandSetzen, true);
  assert.equal(z.tabelle, 'artikel_bestand_standort');
  assert.ok(!z.nurMitKatalog, 'braucht keinen Feldkatalog — die Felder sind feste Verweise');
  assert.ok(!MOTOR_TABELLEN.includes('artikel_bestand_standort'));
  assert.equal(MOTOR_TABELLEN.length, 62);
  const q = importQuellen().find((x) => x.key === 'bestand_filiale');
  assert.equal(q?.motor, 'bestand_filiale');
  assert.equal(q?.musterZiel, 'bestand_filiale');
  // Ohne Datenbank-Katalog alle Felder angeboten
  assert.equal(katalogFuerZiel('bestand_filiale', []).ziel.felder.length, z.felder.length);
});

test('Mustervorlage laeuft rund: 3 Zeilen, 2 Buchungen, 1 stimmt schon', () => {
  const r = lauf(baueMustervorlage('bestand_filiale').replace(/^﻿/, ''));
  assert.equal(r.bil.verschluckt, 0);
  assert.equal(r.b.gut, 3);
  assert.deepEqual(r.plan.unveraendert, [2], 'L-1001 in Böblingen steht schon auf 24');
  assert.equal(r.plan.buchungen.length, 2);
  const sind = r.plan.buchungen.find((x) => x.standortId === 's2');
  assert.deepEqual({ a: sind.artikelId, alt: sind.alt, neu: sind.neu }, { a: 'a1', alt: 0, neu: 6 });
  assert.equal(sind.notiz, 'Inventur 30.09.');
});

test('Artikel: Nummer vor EAN vor Bezeichnung, unbekannte Nummer wird NICHT ueber den Namen gerettet', () => {
  const s = baueArtikelSuche(ARTIKEL);
  assert.deepEqual(findeArtikel({ artikelnummer: ' l-1002 ' }, s), { art: 'gefunden', id: 'a2' });
  assert.deepEqual(findeArtikel({ ean: '2047110000009' }, s), { art: 'gefunden', id: 'a1' });
  assert.deepEqual(findeArtikel({ bezeichnung: 'mantelleitung nym-j 3x2,5' }, s), { art: 'gefunden', id: 'a2' });
  const falsch = findeArtikel({ artikelnummer: 'L-9999', bezeichnung: 'Mantelleitung NYM-J 3x2,5' }, s);
  assert.equal(falsch.art, 'fehler');
  assert.match(falsch.grund, /L-9999.*Artikel-Import/);
  assert.match(findeArtikel({ artikelnummer: 'X-7' }, s).grund, /2 Artikeln/);
  assert.match(findeArtikel({}, s).grund, /Weder Artikelnummer/);
});

test('Filiale: Name, Ort, Hauptsitz; stillgelegt und unbekannt mit Grund, nie angelegt', () => {
  const s = baueStandortSuche(FILIALEN);
  assert.deepEqual(findeStandort('filiale sindelfingen', s), { art: 'gefunden', id: 's2' });
  assert.deepEqual(findeStandort('Böblingen', s), { art: 'gefunden', id: 's1' });
  assert.deepEqual(findeStandort('Zentrale', s), { art: 'gefunden', id: 's1' });
  assert.match(findeStandort('Alte Filiale', s).grund, /stillgelegt/);
  assert.match(findeStandort('Stuttgart', s).grund, /Standorte anlegen/);
  assert.match(findeStandort('', s).grund, /2 Filialen/);
  assert.deepEqual(findeStandort('', baueStandortSuche([FILIALEN[0]])), { art: 'gefunden', id: 's1' });
  assert.deepEqual(findeStandort('', baueStandortSuche([])), { art: 'gefunden', id: null });
});

test('Betrieb ohne Filialen: eine Filiale in der Datei = Gesamtbestand, mehrere = alle heraus', () => {
  const eine = lauf('Artikelnummer;Filiale;Bestand\nL-1001;Laden;31\nL-1002;Laden;16\n', [], []);
  assert.equal(eine.plan.buchungen.length, 1);
  assert.deepEqual(eine.plan.buchungen[0], { artikelId: 'a1', standortId: null, alt: 30, neu: 31, zeilen: [2], notiz: null });
  assert.deepEqual(eine.plan.unveraendert, [3]);
  assert.match(eine.plan.hinweise[0], /keine Filialen/);
  const zwei = lauf('Artikelnummer;Filiale;Bestand\nL-1001;Laden A;31\nL-1001;Laden B;2\n', [], []);
  assert.equal(zwei.plan.buchungen.length, 0);
  assert.equal(zwei.plan.abgelehnt.length, 2);
  assert.match(zwei.plan.abgelehnt[0].grund, /2 Filialen/);
});

test('Doppelte Kombination: gleiche Zahl einmal gebucht, verschiedene Zahlen alle heraus', () => {
  const r = lauf('Artikelnummer;Filiale;Bestand\nL-1002;Böblingen;5\nL-1002;Filiale Böblingen;5\nL-1001;Sindelfingen;3\nL-1001;Sindelfingen;4\n');
  assert.equal(r.plan.buchungen.length, 1);
  assert.deepEqual(r.plan.buchungen[0].zeilen, [2, 3]);
  assert.deepEqual(r.plan.doppelt, [3]);
  assert.deepEqual(r.plan.abgelehnt.map((a) => a.zeile), [4, 5]);
  assert.match(r.plan.abgelehnt[0].grund, /Zeile 4: 3, Zeile 5: 4/);
});

test('Negativer Bestand heraus, unlesbare Menge laesst die Zeile nicht durch (kein stilles 0)', () => {
  const r = lauf('Artikelnummer;Filiale;Bestand\nL-1001;Böblingen;-5\nL-1002;Böblingen;viele\nL-1002;Sindelfingen;2,5\n');
  assert.equal(r.b.gut, 2, '„viele" faellt schon beim Pruefen heraus');
  assert.match(r.b.fehler.find((f) => f.zeile === 3).meldung, /keine lesbare Menge/);
  assert.match(r.plan.abgelehnt[0].grund, /Negativer Bestand/);
  assert.equal(r.plan.buchungen[0].neu, 2.5);
});

test('Zeilen-Bilanz geht auf: jede Zeile genau einmal', () => {
  const r = lauf('Artikelnummer;Filiale;Bestand;Lagerplatz\nL-1001;Böblingen;24;A1\nL-1001;Sindelfingen;7;B2\nL-1001;Sindelfingen;7;B2\nL-9;Böblingen;1;\nL-1002;Calw;4;\nL-1002;Böblingen;x;\n');
  const s = bestandSumme(r.plan);
  assert.equal(r.b.schlecht + s.buchungen + s.unveraendert + s.doppelt + s.abgelehnt, r.b.gesamt);
  assert.equal(r.map.Lagerplatz, EIGEN, 'Lagerplatz wird nicht verschluckt');
  assert.equal(r.bil.verschluckt, 0);
});

test('Lagerort (Regal) wird NICHT als Filiale erkannt, Mindestbestand nicht als Bestand', () => {
  const t = leseCsv('Artikelnummer;Bezeichnung;Bestand;Mindestbestand;Lagerort\nL-1001;Kabel;24;8;A1\n');
  const map = vorschlagMapping(t.kopf, t.zeilen, zielDef('bestand_filiale'));
  assert.equal(map.Lagerort, EIGEN);
  assert.equal(map.Mindestbestand, EIGEN);
  assert.equal(map.Bestand, 'bestand');
});

test('Grund im Verlauf: Herkunft, vorher, Notiz, weitere Spalten; hoechstens 500 Zeichen', () => {
  const g = bestandGrund('filialen.csv', { alt: 12.5, notiz: 'Inventur' }, [{ spalte: 'Lagerplatz', wert: 'R3' }]);
  assert.equal(g, 'Übernommen aus dem Altsystem (Import „filialen.csv") · vorher 12,5 · Inventur · Weitere Angaben: Lagerplatz: R3');
  assert.ok(bestandGrund('x', { alt: 0, notiz: 'y'.repeat(900) }).length <= 500);
});

test('Rueckgaengig nur, wo heute noch die importierte Zahl steht', () => {
  const rueck = rueckDaten([
    { artikelId: 'a1', standortId: 's1', alt: 24, neu: 30 },
    { artikelId: 'a2', standortId: 's1', alt: 0, neu: 5 },
    { artikelId: 'a1', standortId: null, alt: 30, neu: 31 },
  ]);
  const filiale = new Map([[bestandSchluessel('a1', 's1'), 30], [bestandSchluessel('a2', 's1'), 3]]);
  const p = planeRueckgaengig(rueck, filiale, new Map([['a1', 31]]));
  assert.deepEqual(p.zurueck.map((r) => [r.a, r.s, r.alt]), [['a1', 's1', 24], ['a1', null, 30]]);
  assert.deepEqual(p.geaendert.map((r) => r.a), ['a2'], 'dort wurde seitdem verkauft');
  assert.deepEqual(leseRueckDaten([{ a: 'a1', s: 's1', alt: 1, neu: 2 }, { a: '', alt: 1, neu: 2 }, 'x', { a: 'a2', s: null, alt: -1, neu: 2 }, null]),
    [{ a: 'a1', s: 's1', alt: 1, neu: 2 }]);
  assert.deepEqual(leseRueckDaten(null), []);
});

test('Seite: eigener Weg ueber lager_buchen (Korrektur), nie insert in die Bestandstabelle, Rueckgaengig-Knopf', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('if (ziel.bestandSetzen) { await importiereBestand(); return; }'));
  const teil = s.slice(s.indexOf('async function importiereBestand()'), s.indexOf('async function importieren()'));
  assert.ok(teil.includes("art: 'korrektur'"));
  assert.ok(teil.includes('supabase.rpc(RPC_BUCHEN'));
  assert.ok(!/from\('artikel_bestand_standort'\)\.(insert|upsert|update|delete)/.test(teil), 'Bestaende nur ueber lager_buchen');
  assert.ok(teil.includes('rueck_daten: rueckDaten(gebucht)'));
  assert.ok(s.includes('onClick={() => rueckgaengigBestand(j)}'));
});

test('SQL p136: nur eine Spalte, additiv', () => {
  const sql = lies('supabase-sql/p136-import-bestand.sql');
  assert.match(sql, /alter table public\.import_jobs add column if not exists rueck_daten jsonb/);
  assert.ok(!/\b(drop table|drop column|truncate|delete from)\b/i.test(sql));
});
