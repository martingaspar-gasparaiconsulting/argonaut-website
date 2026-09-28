// Paket 154 (28.09.2026) — Anwalt-Block Teil 2: Hilfsmittel-Versorgungen (mit
// Positionen), Kanzlei-Akten und Fristen. VORGEBAUT, GESPERRT (lib/anwaltFreigabe.ts).
// Katalog nach dem LIVE-Schema vom 28.09.2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { anwaltSperrGrund, KI_NIE_GRUND } from '../out/anwaltFreigabe.js';
import { pruefeAlles, leseCsv, zielDef, ZIELE } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, MOTOR_TABELLEN, kindZeilen, nachschlagIndex, loeseNachschlag, nachschlagPflichtGrund } from '../out/importMotor.js';
import { importErlaubt } from '../out/importRechte.js';
import { aufraeumerErlaubt } from '../out/importAufraeumer.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const LIVE = {
  hilfsmittel_versorgung: 'id uuid NN =g | owner_user_id uuid NN | versicherter text NN | versicherten_nr text | krankenkasse text | arzt text | verordnung_datum date | diagnose text | status text NN =x | genehmigt_am date | kv_nummer text | kontakt_id uuid | notiz text | erstellt_am timestamp with time zone NN =now()',
  hilfsmittel_position: 'id uuid NN =g | owner_user_id uuid NN | versorgung_id uuid NN | position integer NN =0 | hmv_nummer text | bezeichnung text | menge numeric NN =1 | einzelpreis numeric NN =0 | mehrkosten numeric NN =0 | notiz text | erstellt_am timestamp with time zone NN =now()',
  kanzlei_akte: 'id uuid NN =g | owner_user_id uuid NN | aktenzeichen text | mandant text NN | gegner text | rechtsgebiet text | kurzbeschreibung text | gegenstandswert numeric | sachbearbeiter text | status text NN =x | kontakt_id uuid | angelegt_am date NN =d | notiz text | erstellt_am timestamp with time zone NN =now()',
  kanzlei_frist: 'id uuid NN =g | owner_user_id uuid NN | akte_id uuid NN | bezeichnung text NN | art text NN =x | frist_datum date NN | vorfrist_tage integer NN =7 | verantwortlich text | erledigt boolean NN =false | erledigt_am date | notiz text | erstellt_am timestamp with time zone NN =now()',
};
function db(...tabellen) {
  return tabellen.flatMap((tabelle) => LIVE[tabelle].split(' | ').map((t) => {
    const [spalte, ...rest] = t.split(' ');
    const r = rest.join(' ');
    return { tabelle, spalte, datentyp: r.replace(/ NN.*$/, '').replace(/ =.*$/, ''), pflicht: / NN/.test(r) && !/=/.test(r) };
  }));
}
function durch(key, text, tabellen) {
  const z = katalogFuerZiel(key, db(...tabellen)).ziel;
  const t = leseCsv(text);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { z, t, map, b: pruefeAlles(key, map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}
const U1 = '11111111-1111-4111-8111-111111111111';

test('Drei Ziele hinter dem Schalter: gesperrt fuer alle, nur Chef, nie ueberschreiben, nie an die KI; Karten oeffnen den Motor', () => {
  const chef = { chef: true, module: [], schreibModule: null };
  assert.equal(zielDef('hilfsmittel').anwalt, 'hilfsmittel');
  assert.equal(zielDef('akten').anwalt, 'kanzlei');
  assert.equal(zielDef('fristen').anwalt, 'kanzlei');
  for (const k of ['hilfsmittel', 'akten', 'fristen']) {
    const z = zielDef(k);
    assert.equal(z.nurChef, true, k);
    assert.equal(z.nurNeu, true, k);
    const r = importErlaubt(k, chef);
    assert.equal(r.ok, false, k);
    assert.equal(r.grund, anwaltSperrGrund(z.anwalt));
    assert.deepEqual(aufraeumerErlaubt(k), { ok: false, grund: KI_NIE_GRUND });
  }
  assert.match(anwaltSperrGrund('kanzlei'), /§ 203 StGB/);
  assert.equal(importQuellen().find((q) => q.key === 'hilfsmittel')?.motor, 'hilfsmittel');
  assert.equal(importQuellen().find((q) => q.key === 'akten')?.motor, 'akten');
  assert.equal(ZIELE.filter((z) => z.anwalt).length, 7);
});

test('SQL p154: Feldkatalog = MOTOR_TABELLEN (81), nichts sonst geaendert', () => {
  for (const t of ['hilfsmittel_versorgung', 'hilfsmittel_position', 'kanzlei_akte', 'kanzlei_frist']) assert.ok(MOTOR_TABELLEN.includes(t), t);
  const sql = lies('supabase-sql/p154-import-anwaltblock-2.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 81);
  assert.ok(!/\b(drop table|delete from|truncate|alter table|create table|create policy)\b/i.test(sql));
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
});

test('Hilfsmittel: gleiche KV-Nummer = eine Versorgung mit Positionen; Positionen nur mit echten Spalten', () => {
  const r = durch('hilfsmittel',
    'Versicherter;Versicherten-Nr;Krankenkasse;Arzt;Verordnungsdatum;Diagnose;KV-Nummer;Status;HMV-Nummer;Bezeichnung;Menge;Preis;Mehrkosten;Lager\n'
    + 'Anna Berger;A123;AOK;Dr. Schmidt;15.07.2026;Z. n. Knie-OP;KV-1;bewilligt;23.29.01.1001;Knieorthese;1;189,00;25,00;L1\n'
    + 'Anna Berger;A123;AOK;Dr. Schmidt;15.07.2026;Z. n. Knie-OP;KV-1;bewilligt;23.29.01.2002;Polster;2;12,50;;L1\n'
    + 'Peter Krause;K987;TK;Dr. Meier;18.07.2026;DFS;KV-2;neu;31.03.01.0001;Einlagen;1;80;0;L2\n'
    + 'Anna Berger;A123;AOK;Dr. Schmidt;01.09.2026;Folgeversorgung;KV-3;neu;23.29.01.1001;Knieorthese;1;189;0;L1\n'
    + ';;AOK;;;;KV-4;neu;;Ohne Versicherten;1;1;0;L1\n',
    ['hilfsmittel_versorgung', 'hilfsmittel_position']);
  assert.equal(r.map['KV-Nummer'], 'kv_nummer');
  assert.equal(r.map['HMV-Nummer'], 'pos_hmv');
  assert.equal(r.map['Mehrkosten'], 'pos_mehrkosten');
  assert.equal(r.map['Lager'], EIGEN);
  assert.equal(r.bil.verschluckt, 0);
  // gleiche Person, andere KV-Nummer = eigene Versorgung; ohne Versicherten (Pflicht in der Datenbank) -> Grund
  assert.equal(r.b.gut, 3);
  assert.ok(r.b.fehler.some((f) => f.zeile === 6));
  const [a, p] = r.b.saetze;
  assert.equal(a.status, 'genehmigt');
  assert.equal(p.status, 'verordnet');
  assert.equal(a.verordnung_datum, '2026-07-15');
  assert.equal(a.__positionen.length, 2);
  const kz = kindZeilen(a.__positionen, U1, 'versorgung_id', 'b', zielDef('hilfsmittel').jsonPositionen.kindTabelle);
  assert.deepEqual(kz[0], { owner_user_id: 'b', versorgung_id: U1, position: 1, hmv_nummer: '23.29.01.1001', bezeichnung: 'Knieorthese', menge: 1, einzelpreis: 189, mehrkosten: 25 });
  assert.equal(kz[1].menge, 2);
  for (const z of kz) {
    assert.ok(!('gesamt_netto' in z), 'hilfsmittel_position hat keine Gesamt-Spalte');
    for (const k of Object.keys(z)) assert.ok(LIVE.hilfsmittel_position.includes(k + ' '), `Spalte ${k} gibt es live`);
  }
  // Angebote unveraendert: gesamt_netto und die alten Spalten
  assert.equal(kindZeilen([{ bezeichnung: 'A', menge: 2, einzelpreis: 1.5, mehrkosten: 9 }], 'k', 'angebot_id', 'b')[0].gesamt_netto, 3);
  assert.ok(!('mehrkosten' in kindZeilen([{ bezeichnung: 'A', mehrkosten: 9 }], 'k', 'angebot_id', 'b')[0]));
});

test('Akten: Aktenzeichen bleibt, Mandant Pflicht, Status-Liste, Mandant zum Kunden', () => {
  const r = durch('akten',
    'Aktenzeichen;Mandant;Gegner;Rechtsgebiet;Streitwert;Sachbearbeiter;Status;Wegen\n'
    + '042/2026;Mueller GmbH;Schulze AG;Zivilrecht;25.000,00;RA Weber;laufend;Werklohn\n'
    + '043/2026;;;Arbeitsrecht;;;erledigt;\n'
    + '044/2026;Hansen e.K.;;Steuerrecht;;;archiviert;\n',
    ['kanzlei_akte']);
  assert.equal(r.map['Streitwert'], 'gegenstandswert');
  assert.equal(r.map['Wegen'], 'kurzbeschreibung');
  assert.equal(r.b.gut, 2);
  assert.equal(r.b.saetze[1].status, 'abgeschlossen');
  assert.equal(r.b.saetze[0].aktenzeichen, '042/2026');
  assert.equal(r.b.saetze[0].gegenstandswert, 25000);
  assert.equal(r.b.saetze[0].status, 'offen');
  assert.ok(r.b.fehler.some((f) => f.zeile === 3 && /Pflicht/.test(f.meldung)));
  assert.deepEqual(zielDef('akten').kundeVerweis.ausFeldern, ['mandant']);
  // Seite gibt die Spalten der Kind-Tabelle an kindZeilen weiter (sonst gesamt_netto in hilfsmittel_position)
  const seite = lies('app/dashboard/import/page.tsx');
  assert.equal((seite.match(/kindTab\.fremdschluessel, neuOwner, kindTab\)/g) ?? []).length, 2);
});

test('Fristen: nur mit gefundener Akte (Grund statt Datenbankfehler), Art-Liste, Datum Pflicht', () => {
  const r = durch('fristen',
    'Aktenzeichen;Frist;Fristart;Fristablauf;Vorfrist;Erledigt\n'
    + '042/2026;Berufungsbegruendung;Berufungsfrist;30.10.2026;14;nein\n'
    + '999/2026;Stellungnahme;WV;01.11.2026;;\n'
    + '042/2026;Ohne Datum;Notfrist;;;\n',
    ['kanzlei_akte', 'kanzlei_frist']);
  assert.equal(r.map['Fristablauf'], 'frist_datum');
  assert.equal(r.b.gut, 2);
  const [a, b] = r.b.saetze;
  assert.equal(a.art, 'notfrist');
  assert.equal(a.frist_datum, '2026-10-30');
  assert.equal(a.vorfrist_tage, 14);
  assert.equal(a.erledigt, false);
  assert.equal(b.art, 'wiedervorlage');
  assert.ok(r.b.fehler.some((f) => f.zeile === 4));
  const n = zielDef('fristen').nachschlag;
  assert.equal(n.pflicht, true);
  const idx = nachschlagIndex([{ id: U1, aktenzeichen: '042/2026' }], 'aktenzeichen');
  assert.equal(loeseNachschlag(a, n, idx, true).satz.akte_id, U1);
  const weg = loeseNachschlag(b, n, idx, true);
  assert.equal(weg.gefunden, false);
  assert.match(nachschlagPflichtGrund(n, weg.name), /Akten/);
});
