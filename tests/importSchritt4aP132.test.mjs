// Paket 132 (27.09.2026) — Umzug Schritt 4 Teil 1 (Handwerk & Handel):
// Einsaetze, Service-Tickets, Inventar, Mietgegenstaende auf dem Import-Motor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, MOTOR_TABELLEN, EIGEN, erkennungsFelder, baueBestandIndex, findeImBestand,
  baueKundenIndex, verknuepfeKunde, verweisAusMitarbeitern, vergleichsText,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, berlinZeitpunkt, plusMinutenLokal } from '../out/importParser.js';
import { importQuellen } from '../out/importKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));
const NEU = ['einsaetze', 'tickets', 'inventar', 'verleih'];
const TABELLE = { einsaetze: 'einsaetze', tickets: 'tickets', inventar: 'inventar', verleih: 'verleih_artikel' };

function dbFuer(z) {
  const typ = (f) => (f.typ === 'zahl' ? 'numeric' : f.typ === 'datum' ? 'date' : f.typ === 'zeitpunkt' ? 'timestamp with time zone' : 'text');
  const cols = [{ tabelle: z.tabelle, spalte: 'id', datentyp: 'uuid' }];
  for (const f of z.felder) if (!f.virtuell) cols.push({ tabelle: z.tabelle, spalte: f.key, datentyp: typ(f) });
  if (z.kundeVerweis) cols.push({ tabelle: z.tabelle, spalte: z.kundeVerweis.spalte, datentyp: 'uuid' });
  // Spalten, die das Modul fuer sich braucht und der Import NICHT anbieten darf
  for (const s of z.ausblenden ?? []) cols.push({ tabelle: z.tabelle, spalte: s, datentyp: 'text' });
  return cols.map((c) => ({ pflicht: false, ...c }));
}
const ziel = (k) => katalogFuerZiel(k, dbFuer(zielDef(k))).ziel;
function datei(text, k) {
  const t = leseCsv(text);
  const z = ziel(k);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, b: pruefeAlles(k, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('Paket 132: vier Ziele, Karten auf dem Motor, SQL-Whitelist = Motor-Tabellen (48)', () => {
  for (const k of NEU) {
    const q = importQuellen().find((x) => x.key === k);
    assert.equal(q?.motor, k, k);
    assert.equal(q?.musterZiel, k, k);
    assert.equal(zielDef(k).tabelle, TABELLE[k]);
    assert.equal(zielDef(k).nurMitKatalog, true);
    assert.ok(MOTOR_TABELLEN.includes(TABELLE[k]));
  }
  const sql = lies('supabase-sql/p132-import-schritt4a.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 48);
  assert.doesNotMatch(sql, /\b(drop table|delete from|truncate|drop policy|update public)\b/i);
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
});

test('Mustervorlagen laufen unveraendert durch, nichts verschluckt', () => {
  for (const k of NEU) {
    const { t, map, bil, b } = datei(baueMustervorlage(k), k);
    assert.equal(bil.verschluckt, 0, k);
    assert.deepEqual(t.kopf.filter((s) => !map[s] || map[s] === EIGEN), [], k);
    assert.equal(b.gut, 3, k);
  }
});

test('Modul-Spalten (GPS, Unterschrift, Rechnung, Standort) werden nie angeboten', () => {
  const z = ziel('einsaetze');
  for (const s of ['unterwegs_lat', 'unterschrift_pfad', 'rechnung_id', 'standort_id', 'inhaber_einsatz', 'arbeitsbericht']) {
    assert.ok(!z.felder.some((f) => f.key === s), s);
  }
  assert.ok(!ziel('verleih').felder.some((f) => f.key === 'status'));
});

test('berlinZeitpunkt: Sommer UTC+2, Winter UTC+1, Umstellungstage', () => {
  assert.equal(berlinZeitpunkt('2026-10-05T08:00'), '2026-10-05T06:00:00.000Z');
  assert.equal(berlinZeitpunkt('2026-12-01T08:00'), '2026-12-01T07:00:00.000Z');
  assert.equal(berlinZeitpunkt('2026-03-29T01:30'), '2026-03-29T00:30:00.000Z');   // vor der Umstellung (Winter)
  assert.equal(berlinZeitpunkt('2026-03-29T04:00'), '2026-03-29T02:00:00.000Z');   // nach der Umstellung (Sommer)
  assert.equal(berlinZeitpunkt('2026-10-25T04:00'), '2026-10-25T03:00:00.000Z');   // nach der Rueckstellung (Winter)
  assert.equal(berlinZeitpunkt('2026-10-24T23:00'), '2026-10-24T21:00:00.000Z');
  assert.equal(berlinZeitpunkt('2026-10-05'), null);
  // Gegenprobe gegen die Zeitzonen-Datenbank von Node
  const f = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (const lok of ['2026-01-15T09:15', '2026-06-30T18:45', '2027-03-28T05:00', '2027-10-31T12:00', '2028-07-01T00:30']) {
    const p = Object.fromEntries(f.formatToParts(new Date(berlinZeitpunkt(lok))).map((x) => [x.type, x.value]));
    assert.equal(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`, lok, lok);
  }
  assert.equal(plusMinutenLokal('2026-10-05T23:30', 60), '2026-10-06T00:30');
});

test('Einsaetze: Zeiten als Zeitpunkt, ganzer Tag, 1 Stunde, Chef, Status', () => {
  const { b } = datei('Monteur;Einsatz;Ort;Beginn;Ende;Status\r\n'
    + 'Kevin Stadler;Zählerschrank;Böblingen;05.10.2026 08:00;05.10.2026 12:00;disponiert\r\n'
    + 'Leon Kaltenbach;Wallbox;Stuttgart;06.10.2026 13:30;;\r\n'
    + 'Chef;Abnahme;;07.10.2026;;fertig\r\n'
    + 'Kevin Stadler;Nacharbeit;;08.12.2026 07:00;08.12.2026 06:00;Urlaubsvertretung\r\n', 'einsaetze');
  assert.equal(b.gut, 4);
  const [a, w, c, n] = b.saetze;
  assert.deepEqual([a.beginn_am, a.ende_am, a.status, a.__kunde], ['2026-10-05T06:00:00.000Z', '2026-10-05T10:00:00.000Z', 'geplant', 'Kevin Stadler']);
  assert.deepEqual([w.beginn_am, w.ende_am], ['2026-10-06T11:30:00.000Z', '2026-10-06T12:30:00.000Z']);
  assert.ok(b.warnungen.some((x) => x.zeile === 3 && /1 Stunde/.test(x.meldung)));
  assert.deepEqual([c.beginn_am, c.ende_am, c.inhaber_einsatz, c.status, c.__kunde], ['2026-10-07T05:00:00.000Z', '2026-10-07T14:00:00.000Z', true, 'erledigt', undefined]);
  assert.ok(b.warnungen.some((x) => x.zeile === 4 && /ganzer Tag/.test(x.meldung)));
  assert.deepEqual([n.beginn_am, n.ende_am], ['2026-12-08T06:00:00.000Z', '2026-12-08T07:00:00.000Z']);   // Ende vor Beginn -> 1 Stunde, Winterzeit
  assert.match(n.beschreibung, /Status im Altsystem: Urlaubsvertretung/);
  assert.equal(n.status, 'geplant');
});

test('Einsatz ohne Beginn faellt mit Grund heraus', () => {
  const { b } = datei('Monteur;Einsatz\r\nKevin;Nacharbeit\r\n', 'einsaetze');
  assert.equal(b.gut, 0);
  assert.ok(b.fehler.some((f) => /Pflichtfeld/.test(f.meldung)));
});

test('Einsatz: Mitarbeiter ueber Personalnummer/Namen verknuepft; unbekannt -> Name im Text', () => {
  const z = zielDef('einsaetze');
  assert.equal(z.kundeVerweis.textFeld, 'beschreibung');
  const idx = baueKundenIndex(verweisAusMitarbeitern([{ id: 'm1', vorname: 'Kevin', nachname: 'Stadler' }], { m1: 'P-104' }));
  assert.equal(verknuepfeKunde({ __kunde: 'P-104', titel: 'x' }, z.kundeVerweis, idx).satz.mitarbeiter_id, 'm1');
  assert.equal(verknuepfeKunde({ __kunde: 'Kevin Stadler' }, z.kundeVerweis, idx).satz.mitarbeiter_id, 'm1');
  const unb = verknuepfeKunde({ __kunde: 'Aushilfe Tom' }, z.kundeVerweis, idx);
  assert.equal(unb.treffer.art, 'keiner');
  assert.equal(unb.gesucht, 'Aushilfe Tom');
  // Die Seite haengt den Namen an (Paket 132) und ueberspringt den Verweis beim Chef-Einsatz
  const seite = lies('app/dashboard/import/page.tsx');
  assert.match(seite, /const tf = ziel\.kundeVerweis\.textFeld;/);
  assert.match(seite, /satzRoh\.inhaber_einsatz !== true/);
});

test('Zweiter Import: gleicher Zeitpunkt in anderer Schreibweise wird erkannt', () => {
  assert.equal(vergleichsText('2026-10-05T06:00:00+00:00'), vergleichsText('2026-10-05T06:00:00.000Z'));
  assert.equal(vergleichsText('2026-10-03T19:00'), vergleichsText('2026-10-03 19:00:00+00'));
  assert.notEqual(vergleichsText('2026-10-05T06:00:00Z'), vergleichsText('2026-10-05T07:00:00Z'));
  assert.equal(vergleichsText('  Wallbox '), 'wallbox');
  assert.equal(vergleichsText('2026-10-05'), '2026-10-05');
  const felder = erkennungsFelder(ziel('einsaetze'));
  assert.deepEqual(felder, ['mitarbeiter_id+beginn_am+titel']);
  const idx = baueBestandIndex([{ id: 'e1', mitarbeiter_id: 'm1', beginn_am: '2026-10-05T06:00:00+00:00', titel: 'Zählerschrank' }], felder);
  assert.equal(findeImBestand({ mitarbeiter_id: 'm1', beginn_am: '2026-10-05T06:00:00.000Z', titel: 'Zählerschrank' }, felder, idx), 'e1');
  // Zwei Monteure, gleicher Auftrag, gleiche Zeit = zwei Einsaetze
  assert.equal(findeImBestand({ mitarbeiter_id: 'm2', beginn_am: '2026-10-05T06:00:00.000Z', titel: 'Zählerschrank' }, felder, idx), undefined);
});

test('Tickets: Nummer bleibt, Listen uebersetzt, Kunde ueber E-Mail/Name, nur Chef', () => {
  const z = zielDef('tickets');
  assert.equal(z.nurChef, true);
  assert.deepEqual(z.kundeVerweis.ausFeldern, ['kunde_email', 'kunde_name']);
  const { b } = datei('Ticket ID;Subject;Status;Priority;Type;Channel;Requester;Requester Email;Created at\r\n'
    + '4711;Heizung aus;Pending;Urgent;Incident;Phone;Familie Kaya;kaya@web.de;01.09.2026\r\n'
    + '4712;Angebot?;Closed;Low;Question;Portal;Muster GmbH;;\r\n'
    + '4713;Unklar;Eskaliert;Normal;Lob;Fax;;;\r\n', 'tickets');
  assert.equal(b.gut, 3);
  const [a, c, d] = b.saetze;
  assert.deepEqual([a.ticket_nummer, a.status, a.prioritaet, a.kategorie, a.kanal, a.kunde_email], ['4711', 'wartet', 'dringend', 'support', 'telefon', 'kaya@web.de']);
  assert.match(a.beschreibung, /01\.09\.2026/);
  assert.deepEqual([c.status, c.prioritaet, c.kategorie, c.kanal], ['geschlossen', 'niedrig', 'anfrage', 'web']);
  assert.deepEqual([d.status, d.prioritaet, d.kategorie, d.kanal], ['offen', 'mittel', 'anfrage', 'email']);
  for (const alt of ['Eskaliert', 'Lob', 'Fax']) assert.match(d.beschreibung, new RegExp(alt));
  const idx = baueKundenIndex([{ id: 'k1', email: 'kaya@web.de', nachname: 'Kaya' }]);
  assert.equal(verknuepfeKunde(a, z.kundeVerweis, idx).satz.kontakt_id, 'k1');
  assert.deepEqual(erkennungsFelder(ziel('tickets')), ['ticket_nummer', 'betreff+kunde_name']);
});

test('Inventar: Zustand-Liste, Wert, Pruefdatum; alter Zustand in den Notizen', () => {
  const { b } = datei('Inv.-Nr.;Gerät;Seriennummer;Lagerort;Zustand;Kaufpreis;DGUV fällig;Geprüft am\r\n'
    + 'INV-12;Bohrhammer;HX-1;Fahrzeug 2;in Reparatur;1.234,50;12.03.2027;12.03.2026\r\n'
    + 'INV-13;Leiter;;Lager;wackelt;;;\r\n', 'inventar');
  assert.equal(b.gut, 2);
  const [h, l] = b.saetze;
  assert.deepEqual([h.inventarnummer, h.zustand, h.anschaffungswert, h.naechste_pruefung_am], ['INV-12', 'defekt', 1234.5, '2027-03-12']);
  assert.match(h.notizen, /12\.03\.2026/);
  assert.equal(l.zustand, 'gut');
  assert.match(l.notizen, /Zustand im Altsystem: wackelt/);
  assert.deepEqual(erkennungsFelder(ziel('inventar')), ['inventarnummer', 'seriennummer', 'bezeichnung+standort']);
});

test('Verleih: ausgemustert bleibt draussen, Anzahl ganzzahlig, Preise gelesen', () => {
  const { b } = datei('Mietgegenstand;Inventar-Nr.;Tagesmiete;Wochenmiete;Kaution;Anzahl;Status\r\n'
    + 'Minibagger;M-01;129,00;590;500;1;verliehen\r\n'
    + 'Alte Rüttelplatte;M-02;30;;50;1;ausgemustert\r\n'
    + 'Bautrockner;T-03;25;;50;2,6;\r\n', 'verleih');
  assert.equal(b.gut, 2);
  assert.ok(b.fehler.some((f) => f.zeile === 3 && /Ausgemustert/.test(f.meldung)));
  const [m, t] = b.saetze;
  assert.deepEqual([m.tagessatz, m.wochensatz, m.kaution, m.anzahl], [129, 590, 500, 1]);
  assert.equal(t.anzahl, 3);
  assert.equal(m.verleih_status, undefined);   // Filterfeld geht nie in die Datenbank
});
