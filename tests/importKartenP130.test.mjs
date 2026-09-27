// Paket 130 (27.09.2026) — Betriebskosten-Einheiten (je Abrechnung) und
// Reservierungs-Vorgaenge (Status je Art, Tisch mit Zeitfenster).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN, elternZeilen, fehlendeNamen, loeseNachschlag, nachschlagIndex,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, RES_STATUS, RES_START } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));
const NEU = ['betriebskosten', 'reservierung_vorgaenge'];
const VORLAGE = { betriebskosten: 'betriebskosten-einheiten-import-vorlage.csv', reservierung_vorgaenge: 'reservierung-vorgaenge-import-vorlage.csv' };
const ELTERN = { bk_abrechnung: ['id', 'owner_user_id', 'bezeichnung', 'zeitraum_von', 'zeitraum_bis', 'status'], reservierung_platz: ['id', 'bezeichnung'] };

function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'datumZeit' ? 'timestamp without time zone' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: typ(f) });
  cols.push({ tabelle: z.tabelle, spalte: z.nachschlag.spalte, datentyp: 'uuid' }, { tabelle: z.tabelle, spalte: 'kontakt_id', datentyp: 'uuid' });
  for (const c of ELTERN[z.nachschlag.tabelle]) cols.push({ tabelle: z.nachschlag.tabelle, spalte: c, datentyp: 'text' });
  return cols.map((c) => ({ pflicht: false, ...c }));
}
const ziel = (k) => katalogFuerZiel(k, dbFuer(zielDef(k))).ziel;
function datei(text, k) {
  const t = leseCsv(text);
  const z = ziel(k);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles(k, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 130: zwei Ziele, Karten auf den Motor, SQL-Whitelist = Motor-Tabellen (44)', () => {
  for (const k of NEU) {
    assert.equal(importQuellen().find((q) => q.key === k)?.motor, k);
    assert.equal(zielDef(k).nurMitKatalog, true);
  }
  const sql = lies('supabase-sql/p130-import-karten3.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 44);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy|update public)\b/i);
});

test('Vorlagen und Mustervorlagen vollstaendig erkannt', () => {
  for (const k of NEU) for (const text of [lies(`public/vorlagen/${VORLAGE[k]}`), baueMustervorlage(k)]) {
    const { t, map, bil } = datei(text, k);
    assert.equal(bil.verschluckt, 0, k);
    assert.deepEqual(t.kopf.filter((s) => !map[s] || map[s] === EIGEN), [], k);
  }
});

test('Betriebskosten: eine Abrechnung je Name, als Entwurf, Zeitraum aus der Datei', () => {
  const { z } = datei('a\r\n', 'betriebskosten');
  const vorlage = datei(lies(`public/vorlagen/${VORLAGE.betriebskosten}`), 'betriebskosten').b;
  assert.ok(vorlage.gut >= 1);
  assert.ok(vorlage.saetze.every((s) => s.__nach === 'Übernommen aus dem Altsystem'));
  const { b } = datei('Abrechnung;Zeitraum von;Zeitraum bis;Einheit;Mieter;Fläche;Vorauszahlung\r\nHaus Seeblick 2025;01.01.2025;31.12.2025;EG links;Müller;62,5;1.080,00\r\nHaus Seeblick 2025;;;OG rechts;Kaya;71;1.260\r\n', 'betriebskosten');
  assert.equal(b.saetze[0].wohnflaeche, 62.5);
  assert.equal(b.saetze[0].vorauszahlung, 1080);
  const [abr] = elternZeilen(fehlendeNamen(b.saetze, new Map()), b.saetze, z.nachschlag, 'chef');
  assert.deepEqual(abr, { status: 'entwurf', zeitraum_von: '2025-01-01', zeitraum_bis: '2025-12-31', owner_user_id: 'chef', bezeichnung: 'Haus Seeblick 2025' });
});

test('Reservierungen: Status je Art, Startstatus, Tisch ohne Ende = 2 Stunden, Einlagerung ohne Ende', () => {
  assert.deepEqual(RES_START, { tischreservierung: 'reserviert', einlagerung: 'eingelagert', vorbestellung: 'offen' });
  const { b } = datei('Art;Kunde;Platz;Von;Bis;Kennzeichen;Status\r\n'
    + 'Tisch;Familie Kaya;Tisch 4;03.10.2026 19:00;;;bestätigt\r\n'
    + 'Reifen;Herr Brandl;Regal A3;15.04.2026;16.04.2026;BB-XY 123;abgeholt\r\n'
    + 'Vorbestellung;Frau Weiß;;02.10.2026 08:00;;;\r\n'
    + 'Tisch;Herr Ott;Tisch 9;04.10.2026 12:30;04.10.2026 14:00;;eingelagert\r\n', 'reservierung_vorgaenge');
  assert.equal(b.gut, 4);
  const [t, r, v, x] = b.saetze;
  assert.deepEqual([t.art, t.status, t.von, t.bis], ['tischreservierung', 'bestaetigt', '2026-10-03T19:00', '2026-10-03T21:00']);
  assert.ok(b.warnungen.some((w) => w.zeile === 2 && /2 Stunden/.test(w.meldung)));
  assert.deepEqual([r.art, r.status, r.von, r.bis, r.kennzeichen], ['einlagerung', 'ausgelagert', '2026-04-15', undefined, 'BB-XY 123']);
  assert.deepEqual([v.art, v.status], ['vorbestellung', 'offen']);
  assert.equal(x.status, 'reserviert');                 // „eingelagert" passt nicht zum Tisch
  assert.match(x.gegenstand, /Status im Altsystem: eingelagert/);
  assert.equal(x.bis, '2026-10-04T14:00');
  assert.equal(t.__nach, 'Tisch 4');
  // Platz nicht gefunden -> Name im Gegenstand
  const n = zielDef('reservierung_vorgaenge').nachschlag;
  const idx = nachschlagIndex([{ id: 'p4', bezeichnung: 'Tisch 4' }], 'bezeichnung');
  assert.equal(loeseNachschlag(t, n, idx, true).satz.platz_id, 'p4');
  assert.match(loeseNachschlag(r, n, idx, true).satz.gegenstand, /Platz: Regal A3/);
  for (const art of Object.keys(RES_STATUS)) assert.ok(RES_STATUS[art][RES_START[art]], art);
});

test('Reservierung ohne Beginn -> Zeile faellt mit Grund heraus', () => {
  const { b } = datei('Art;Kunde\r\nTisch;Niemand\r\n', 'reservierung_vorgaenge');
  assert.equal(b.gut, 0);
  assert.ok(b.fehler.some((f) => /Pflichtfeld/.test(f.meldung)));
});
