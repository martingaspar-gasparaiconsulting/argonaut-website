// Paket 138 (27.09.2026) — Gutscheine mit Restwert (GEMEINSAM, von Martin freigegeben).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN, erkennungsFelder } from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

// Die Spalten von gutschein, wie die Gutschein-Seite sie beschreibt
const SPALTEN = [
  ['id', 'uuid'], ['owner_user_id', 'uuid'], ['code', 'text'], ['art', 'text'], ['mwst_typ', 'text'], ['wert', 'numeric'],
  ['mwst_satz', 'numeric'], ['nutzungen_gesamt', 'integer'], ['leistung_text', 'text'], ['kontakt_id', 'uuid'],
  ['empfaenger_name', 'text'], ['anlass', 'text'], ['ausgestellt_am', 'date'], ['gueltig_bis', 'date'], ['status', 'text'], ['notiz', 'text'],
];
const DB = SPALTEN.map(([spalte, datentyp]) => ({ tabelle: 'gutschein', spalte, datentyp, pflicht: false }));
const ziel = () => katalogFuerZiel('gutscheine', DB).ziel;
function datei(text) {
  const t = leseCsv(text);
  const z = ziel();
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles('gutscheine', map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 138: Karte auf dem Motor, SQL-Katalog kennt alle zehn GEMEINSAM-Tabellen', () => {
  const q = importQuellen().find((x) => x.key === 'gutscheine');
  assert.equal(q?.motor, 'gutscheine');
  assert.equal(q?.musterZiel, 'gutscheine');
  const neu = ['gutschein', 'foerder_vorhaben', 'mitglieder', 'spende', 'angebote', 'angebot_positionen', 'projektleistungen', 'immo_kaution', 'immo_zahlungen', 'shop_bestellungen'];
  for (const t of neu) assert.ok(MOTOR_TABELLEN.includes(t), t);
  assert.ok(!MOTOR_TABELLEN.includes('markt_verkauf'), 'Marktverkaeufe werden nicht importiert (Martin 27.09.)');
  const sql = lies('supabase-sql/p138-import-gemeinsam.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 72);
  assert.ok(!/\b(drop table|delete from|truncate|alter table)\b/i.test(sql));
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
});

test('Ohne Katalog kein halber Import; Rechenfelder werden immer angeboten, nie gespeichert', () => {
  assert.equal(katalogFuerZiel('gutscheine', []).ziel.felder.length, 0);
  const keys = ziel().felder.map((f) => f.key);
  for (const k of ['restwert', 'eingeloest_betrag', 'nutzungen_rest', 'nutzungen_genutzt']) assert.ok(keys.includes(k), k);
  const { b } = datei('Code;Wert;Restwert\nGS-1;50;20\n');
  assert.equal(b.gut, 1);
  for (const k of ['restwert', 'eingeloest_betrag', 'nutzungen_rest', 'nutzungen_genutzt']) assert.ok(!(k in b.saetze[0]), k);
});

test('Restwert wird der Startwert, Ursprung und Eingeloestes in der Notiz', () => {
  const { b } = datei('Gutscheincode;Betrag;Restguthaben;Empfänger;Ausgestellt am\nGS-1;50,00;20,00;Anna Berger;12.12.2025\n');
  const s = b.saetze[0];
  assert.equal(s.wert, 20);
  assert.equal(s.status, 'aktiv');
  assert.match(s.notiz, /Ursprungswert 50,00 €.*Restwert 20,00 €/);
  assert.equal(s.empfaenger_name, 'Anna Berger');
  assert.equal(s.ausgestellt_am, '2025-12-12');
});

test('Restwert aus Wert minus Eingeloest; 0 = eingeloest; negativ = 0 mit Warnung', () => {
  const { b } = datei('Code;Wert;Eingelöst;Status\nA;100;30;aktiv\nB;40;40;offen\nC;10;15;\n');
  assert.equal(b.saetze[0].wert, 70);
  assert.match(b.saetze[0].notiz, /bereits eingelöst 30,00 €/);
  assert.equal(b.saetze[1].wert, 0);
  assert.equal(b.saetze[1].status, 'eingeloest');
  assert.equal(b.saetze[2].wert, 0);
  assert.ok(b.warnungen.some((w) => w.zeile === 4 && /unter null/.test(w.meldung)));
});

test('Ohne Restwert-Angabe bleibt der Wert, keine Notiz', () => {
  const { b } = datei('Code;Wert\nX;25\n');
  assert.equal(b.saetze[0].wert, 25);
  assert.equal(b.saetze[0].notiz, undefined);
});

test('Mehrfachkarte: Restnutzungen werden die Nutzungen, Kartenpreis bleibt', () => {
  const { b } = datei('Code;Art;Kartenpreis;Nutzungen;Genutzt\nK1;10er-Karte;90;10;4\nK2;Mehrfachkarte;50;5;5\n');
  assert.equal(b.saetze[0].art, 'mehrfachkarte');
  assert.equal(b.saetze[0].nutzungen_gesamt, 6);
  assert.equal(b.saetze[0].wert, 90);
  assert.match(b.saetze[0].notiz, /10 Nutzungen, davon 4 genutzt — übernommen mit 6/);
  assert.equal(b.saetze[1].nutzungen_gesamt, 0);
  assert.equal(b.saetze[1].status, 'eingeloest');
});

test('Listen: Art, USt-Typ, Status mit altem Wert in der Notiz; fehlendes Datum = heute + Warnung', () => {
  const { b } = datei('Code;Art;Gutscheintyp;Status;Wert\nL1;Gutschein;EZG;abgelaufen;30\nL2;Glückskarte;;ganz komisch;10\n');
  assert.equal(b.saetze[0].art, 'wert');
  assert.equal(b.saetze[0].mwst_typ, 'einzweck');
  assert.equal(b.saetze[0].status, 'verfallen');
  assert.equal(b.saetze[1].art, 'wert');
  assert.match(b.saetze[1].notiz, /Art im Altsystem: Glückskarte/);
  assert.equal(b.saetze[1].status, 'aktiv');
  assert.ok(b.warnungen.some((w) => /Ausstellungsdatum/.test(w.meldung)));
  assert.match(b.saetze[0].ausgestellt_am, /^\d{4}-\d{2}-\d{2}$/);
});

test('Doppelter Code in der Datei nur einmal; Erkennung am Code; ohne Code keine Zeile', () => {
  const { b } = datei('Code;Wert\nA;10\nA;20\n;5\n');
  assert.equal(b.gut, 1);
  assert.equal(b.dubletten_in_datei, 1);
  assert.ok(b.fehler.some((f) => f.zeile === 4 && /Pflichtfeld/.test(f.meldung)));
  assert.deepEqual(erkennungsFelder(ziel()), ['code']);
});

test('Kunde wird ueber den Empfaenger verknuepft (Verweis auf kontakt_id)', () => {
  const z = zielDef('gutscheine');
  assert.deepEqual(z.kundeVerweis, { spalte: 'kontakt_id', ausFeldern: ['empfaenger_name'] });
  assert.equal(z.eigeneFelderModul, 'gutschein', 'gleich wie die Gutschein-Seite (MODUL)');
  assert.ok(lies('app/dashboard/gutscheine/page.tsx').includes("const MODUL = 'gutschein';"));
});

test('Mustervorlage und alte CSV-Vorlage laufen rund, nichts verschluckt', () => {
  const m = datei(baueMustervorlage('gutscheine').replace(/^﻿/, ''));
  assert.equal(m.bil.verschluckt, 0);
  assert.equal(m.b.gut, 3);
  assert.equal(m.b.saetze[0].wert, 20);
  assert.equal(m.b.saetze[2].nutzungen_gesamt, 6);
  const alt = datei(lies('public/vorlagen/gutscheine-import-vorlage.csv'));
  assert.equal(alt.bil.verschluckt, 0);
  assert.ok(!Object.values(alt.map).includes(EIGEN), 'alle Spalten der alten Vorlage erkannt');
  assert.equal(alt.b.gut, 3);
});

test('Nichts Geldbewegendes: keine Einloesungen, keine Rechnung', () => {
  const s = lies('lib/importParser.ts');
  const teil = s.slice(s.indexOf('function gutscheinNachbereiten('), s.indexOf('/** Paket 132: So heisst der Chef'));
  assert.ok(!/gutschein_einloesung|rechnung/i.test(teil.replace(/keine Rechnungen/g, '')));
  assert.ok(!MOTOR_TABELLEN.includes('gutschein_einloesung'));
});
