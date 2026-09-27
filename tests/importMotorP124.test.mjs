// Umzug Schritt 2 (27.09.2026) · Paket 124 — EIN Import-Motor.
// Prueft lib/importMotor.ts (Feldkatalog aus der DB, nichts verschluckt,
// Bankdaten gesperrt, Eigene Felder, Bestand-Abgleich, DATEV) und die
// Erweiterungen in lib/importParser.ts (virtuelle Felder, Status, Dubletten).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  EIGEN, NICHT, GRUND, eindeutigeKoepfe, katalogFuerZiel, feldTypAusDb, spaltenLabel, istBankSpalte,
  vorschlagMapping, bereinigeMapping, spaltenBilanz, eigenTyp, eigenerWert, eigeneSpalten, eigeneWerteDerZeile,
  eigeneFelderZuordnen, erkennungsFelder, baueBestandIndex, findeImBestand, erkenneDatev, leseDatev,
  datevKontoArt, datevAblehnung, datevZaehlen, dateiArt, zusatzAliase, MOTOR_TABELLEN,
} from '../out/importMotor.js';
import {
  pruefeAlles, zerlegeName, virtuelleFelderAufloesen, zielDef, baueMustervorlage, leseCsv, schluesselWerte,
} from '../out/importParser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

/** So sieht der Feldkatalog nach SQL p124 aus (Auszug). */
function db(tabelle, spalten) {
  return spalten.map((s) => (typeof s === 'string'
    ? { tabelle, spalte: s, datentyp: 'text', pflicht: false, generiert: false }
    : { tabelle, pflicht: false, generiert: false, datentyp: 'text', ...s }));
}
const KONTAKTE_DB = db('kontakte', [
  { spalte: 'id', datentyp: 'uuid' }, { spalte: 'owner_user_id', datentyp: 'uuid', pflicht: true },
  'vorname', 'nachname', 'firma', 'email', 'telefon', 'position', 'status', 'quelle', 'notizen',
  'strasse', 'plz', 'ort', 'import_schluessel', 'kundennummer', 'anrede', 'mobil', 'land', 'website', 'ust_id',
  { spalte: 'firma_id', datentyp: 'uuid' }, { spalte: 'betreuungs_intervall_tage', datentyp: 'integer' },
  { spalte: 'letzter_kontakt_am', datentyp: 'timestamp with time zone' },
  { spalte: 'anzeigename', generiert: true }, { spalte: 'tags', datentyp: 'ARRAY' },
  { spalte: 'created_at', datentyp: 'timestamp with time zone' },
]);

// --- Kopfzeile ---------------------------------------------------------------

test('doppelte Spaltennamen werden eindeutig — keine Spalte ueberschreibt die andere', () => {
  assert.deepEqual(eindeutigeKoepfe(['Straße', 'Ort', 'Straße', '', 'Straße']), ['Straße', 'Ort', 'Straße (2)', 'Spalte 4', 'Straße (3)']);
});

// --- Feldkatalog -------------------------------------------------------------

test('ohne Katalog (SQL fehlt): nur die alten Felder, neue fehlen — kein Einspielen in fehlende Spalten', () => {
  const k = katalogFuerZiel('kontakte', null);
  assert.equal(k.ausDb, false);
  const keys = k.ziel.felder.map((f) => f.key);
  assert.ok(keys.includes('email') && keys.includes('firma'));
  assert.ok(!keys.includes('kundennummer') && !keys.includes('plz'), 'neue Felder nur mit Datenbank-Bestaetigung');
  assert.ok(k.fehlend.some((f) => f.key === 'kundennummer'));
});

test('mit Katalog: neue Felder da, Zusatzspalten aus der DB, System/uuid/berechnet/Arrays draussen', () => {
  const k = katalogFuerZiel('kontakte', KONTAKTE_DB);
  assert.equal(k.ausDb, true);
  const keys = k.ziel.felder.map((f) => f.key);
  for (const neu of ['kundennummer', 'strasse', 'plz', 'ort', 'land', 'mobil', 'ust_id', 'name_komplett']) assert.ok(keys.includes(neu), neu);
  assert.ok(keys.includes('betreuungs_intervall_tage') && keys.includes('letzter_kontakt_am'), 'Zusatzspalten aus der DB');
  for (const weg of ['id', 'owner_user_id', 'firma_id', 'anzeigename', 'tags', 'created_at']) assert.ok(!keys.includes(weg), weg);
  const zusatz = k.ziel.felder.find((f) => f.key === 'betreuungs_intervall_tage');
  assert.equal(zusatz.typ, 'zahl');
  assert.equal(zusatz.nurExakt, true);
  assert.equal(k.ziel.felder.find((f) => f.key === 'letzter_kontakt_am').typ, 'datum');
  assert.equal(k.fehlend.length, 0);
});

test('Katalog: fehlt eine Spalte in DIESER Datenbank, wird das Feld nicht angeboten', () => {
  const ohneLand = KONTAKTE_DB.filter((c) => c.spalte !== 'land');
  const k = katalogFuerZiel('kontakte', ohneLand);
  assert.ok(!k.ziel.felder.some((f) => f.key === 'land'));
  assert.ok(k.fehlend.some((f) => f.key === 'land'));
});

test('Katalog: NOT NULL ohne Vorgabe wird Pflicht; Lieferanten-Adressteile brauchen „adresse"', () => {
  const lief = db('lieferanten', ['name', 'adresse', { spalte: 'pflicht_x', pflicht: true }]);
  const k = katalogFuerZiel('lieferanten', lief);
  assert.equal(k.ziel.felder.find((f) => f.key === 'pflicht_x').pflicht, true);
  assert.ok(k.ziel.felder.some((f) => f.key === 'adresse_plz'));
  const ohneAdresse = katalogFuerZiel('lieferanten', db('lieferanten', ['name']));
  assert.ok(!ohneAdresse.ziel.felder.some((f) => f.key === 'adresse_plz'));
});

test('Datentypen und Beschriftung', () => {
  assert.equal(feldTypAusDb('character varying'), 'text');
  assert.equal(feldTypAusDb('numeric'), 'zahl');
  assert.equal(feldTypAusDb('date'), 'datum');
  assert.equal(feldTypAusDb('boolean'), 'jaNein');
  assert.equal(feldTypAusDb('uuid'), null);
  assert.equal(feldTypAusDb('jsonb'), null);
  assert.equal(spaltenLabel('letzter_kontakt_am'), 'Letzter kontakt am');
  // Paket 125 (Schritt 3) hat die Liste um fuenf Ziele erweitert.
  assert.deepEqual([...MOTOR_TABELLEN].slice(0, 4), ['kontakte', 'lieferanten', 'artikel', 'rechnungen']);
});

// --- Bankdaten ---------------------------------------------------------------

test('Bankdaten werden erkannt — „Konto" (DATEV-Debitor) aber nicht', () => {
  for (const ja of ['IBAN', 'IBAN-Nr. 1', 'SWIFT-Code 1', 'BIC', 'Bankleitzahl 1', 'Bankbezeichnung 1', 'Kontoinhaber 1',
    'SEPA-Mandatsreferenz 1', 'Mandat', 'Bankverbindung', 'Kontonummer', 'Kreditkarte']) assert.ok(istBankSpalte(ja), ja);
  for (const nein of ['Konto', 'Kontakt', 'Kundennummer', 'Kontaktperson', 'E-Mail', 'Kreditorenkonto', 'Werkbank-Nr']) {
    if (nein === 'Werkbank-Nr') continue; // bewusst keine Wortteil-Pruefung noetig
    assert.ok(!istBankSpalte(nein), nein);
  }
});

// --- Vorschlag: nichts verschluckt -------------------------------------------

const K = katalogFuerZiel('kontakte', KONTAKTE_DB).ziel;

test('unbekannte Spalte mit Inhalt -> Eigenes Feld; leere -> nicht; Bank -> nicht', () => {
  const kopf = ['Firma', 'E-Mail', 'Kundengruppe', 'Leerspalte', 'IBAN'];
  const zeilen = [['Muster GmbH', 'a@b.de', 'A', '', 'DE00…'], ['X AG', 'x@y.de', 'B', '', '']];
  const m = vorschlagMapping(kopf, zeilen, K);
  assert.equal(m['Firma'], 'firma');
  assert.equal(m['E-Mail'], 'email');
  assert.equal(m['Kundengruppe'], EIGEN);
  assert.equal(m['Leerspalte'], NICHT);
  assert.equal(m['IBAN'], NICHT);
  const b = spaltenBilanz(kopf, zeilen, m, K);
  assert.equal(b.verschluckt, 0);
  assert.deepEqual([b.feld, b.eigen, b.nicht], [2, 1, 2]);
  assert.equal(b.eintraege.find((e) => e.spalte === 'IBAN').grund, GRUND.bank);
  assert.equal(b.eintraege.find((e) => e.spalte === 'Leerspalte').grund, GRUND.leer);
});

test('Haldenberg 01-Kunden: alle 13 Spalten landen in Feldern', () => {
  const kopf = 'Kundennummer;Firma;Vorname;Nachname;Position;Strasse;PLZ;Ort;Telefon;E-Mail;Status;Quelle;Notizen'.split(';');
  const zeile = ['K-1001', 'Hausverwaltung Seeblick GmbH', 'Michael', 'Pfisterer', 'Geschäftsführung', 'Bahnhofstraße 47', '71063', 'Sindelfingen', '07031 45120', 'verwaltung@seeblick-hv.example', 'kunde', 'Bestandskunde', 'Umsatz Vorjahr 48.920,00 €'];
  const m = vorschlagMapping(kopf, [zeile], K);
  const b = spaltenBilanz(kopf, [zeile], m, K);
  assert.deepEqual([b.feld, b.eigen, b.nicht, b.verschluckt], [13, 0, 0, 0]);
  assert.equal(m['Strasse'], 'strasse');
  assert.equal(m['Kundennummer'], 'kundennummer');
  const r = pruefeAlles('kontakte', m, kopf, [zeile], { ziel: K, heute: HEUTE });
  assert.equal(r.saetze[0].plz, '71063', 'PLZ bleibt Text');
  assert.equal(r.saetze[0].status, 'kunde');
});

test('HubSpot englisch: Systemspalten zuerst, Lifecycle wird uebersetzt', () => {
  const kopf = ['Record ID', 'First name', 'Last name', 'Email', 'Company name', 'Mobile phone number', 'Postal code', 'Lifecycle stage', 'Contact owner'];
  const zeile = ['901', 'Anna', 'Berg', 'anna@berg.de', 'Berg GmbH', '0170 1', '01067', 'customer', 'Max'];
  const m = vorschlagMapping(kopf, [zeile], K, { systeme: ['hubspot'] });
  assert.equal(m['Record ID'], 'import_schluessel');
  assert.equal(m['Company name'], 'firma');
  assert.equal(m['Mobile phone number'], 'mobil');
  assert.equal(m['Postal code'], 'plz');
  assert.equal(m['Lifecycle stage'], 'status');
  assert.equal(m['Contact owner'], EIGEN);
  const r = pruefeAlles('kontakte', m, kopf, [zeile], { ziel: K, heute: HEUTE });
  assert.equal(r.saetze[0].status, 'kunde');
  assert.equal(r.saetze[0].plz, '01067');
});

test('Feld nur aus der DB passt nur exakt, nie per Teiltreffer', () => {
  const art = katalogFuerZiel('artikel', db('artikel', ['bezeichnung', 'artikelnummer', 'lieferant_name_alt']));
  const m = vorschlagMapping(['Bezeichnung', 'Lieferant'], [['Kabel', 'Rehbein']], art.ziel);
  assert.equal(m['Lieferant'], EIGEN, 'kein zufaelliger Treffer auf lieferant_name_alt');
  const m2 = vorschlagMapping(['Bezeichnung', 'lieferant_name_alt'], [['Kabel', 'Rehbein']], art.ziel);
  assert.equal(m2['lieferant_name_alt'], 'lieferant_name_alt');
});

test('bereinigeMapping: gemerkte Zuordnung auf das heutige Ziel bringen', () => {
  const kopf = ['A', 'B', 'C', 'IBAN'];
  const m = bereinigeMapping(kopf, { A: 'email', B: 'email', C: 'gibtsnicht', IBAN: EIGEN }, K);
  assert.deepEqual(m, { A: 'email', B: EIGEN, C: EIGEN, IBAN: NICHT });
});

// --- Eigene Felder -----------------------------------------------------------

test('Typ eines Eigenen Feldes: vorsichtig', () => {
  assert.equal(eigenTyp(['15.08.2026', '1.9.26']), 'datum');
  assert.equal(eigenTyp(['2026-08-15']), 'datum');
  assert.equal(eigenTyp(['1.234,50', '12', '5 €']), 'zahl');
  assert.equal(eigenTyp(['01067', '71063']), 'text', 'fuehrende Null bleibt Text');
  assert.equal(eigenTyp(['0711 123']), 'text');
  assert.equal(eigenTyp(['A', '12']), 'text');
  assert.equal(eigenTyp(['', '']), 'text');
  assert.equal(eigenerWert('datum', '15.08.2026'), '2026-08-15');
  assert.equal(eigenerWert('zahl', '1.234,50'), '1234.5');
  assert.equal(eigenerWert('text', '  x '), 'x');
});

test('Eigene-Feld-Werte je Zeile, vorhandene Felder werden wiedergefunden', () => {
  const kopf = ['Firma', 'Kundengruppe', 'Seit'];
  const zeilen = [['A', 'Gold', '01.02.2020'], ['B', '', '03.04.2021']];
  const eigene = eigeneSpalten(kopf, zeilen, { Firma: 'firma', Kundengruppe: EIGEN, Seit: EIGEN });
  assert.deepEqual(eigene.map((e) => [e.spalte, e.typ]), [['Kundengruppe', 'text'], ['Seit', 'datum']]);
  assert.deepEqual(eigeneWerteDerZeile(zeilen[1], eigene), [{ spalte: 'Seit', wert: '2021-04-03' }]);
  const z = eigeneFelderZuordnen(eigene, [{ id: 'f1', label: 'KUNDENGRUPPE' }]);
  assert.deepEqual(z.vorhanden, { Kundengruppe: 'f1' });
  assert.deepEqual(z.neu.map((e) => e.spalte), ['Seit']);
});

// --- Bestand -----------------------------------------------------------------

test('Abgleich mit dem Bestand ueber Kundennummer ODER E-Mail', () => {
  const felder = erkennungsFelder(K);
  assert.deepEqual(felder, ['kundennummer', 'import_schluessel', 'email']);
  const index = baueBestandIndex([
    { id: 'k1', kundennummer: 'K-1001', email: null },
    { id: 'k2', kundennummer: null, email: 'Info@Firma.de' },
  ], felder);
  assert.equal(findeImBestand({ kundennummer: 'k-1001' }, felder, index), 'k1');
  assert.equal(findeImBestand({ email: 'info@firma.de' }, felder, index), 'k2');
  assert.equal(findeImBestand({ kundennummer: 'K-9', email: 'neu@x.de' }, felder, index), undefined);
  // Ohne SQL: nur die E-Mail (Kundennummer gibt es dann nicht)
  assert.deepEqual(erkennungsFelder(katalogFuerZiel('kontakte', null).ziel), ['email']);
});

test('doppelte Kundennummer in der Datei wird erkannt, auch ohne E-Mail', () => {
  const kopf = ['Kundennummer', 'Firma'];
  const r = pruefeAlles('kontakte', { Kundennummer: 'kundennummer', Firma: 'firma' }, kopf, [['K-1', 'A'], ['K-1', 'B'], ['K-2', 'C']], { ziel: K, heute: HEUTE });
  assert.equal(r.dubletten_in_datei, 1);
  assert.equal(r.gut, 2);
  assert.deepEqual(schluesselWerte({ kundennummer: ' K-1 ', email: '' }, K), ['kundennummer:k-1']);
});

// --- Virtuelle Felder, Status ------------------------------------------------

test('Name wird zerlegt; Firmennamen landen bei Firma', () => {
  assert.deepEqual(zerlegeName('Müller, Anna'), { vorname: 'Anna', nachname: 'Müller', firma: '' });
  assert.deepEqual(zerlegeName('Anna Maria Müller'), { vorname: 'Anna Maria', nachname: 'Müller', firma: '' });
  assert.deepEqual(zerlegeName('Dr. Anna von der Heide'), { vorname: 'Anna', nachname: 'von der Heide', firma: '' });
  assert.deepEqual(zerlegeName('Bauträger Neckartal GmbH & Co. KG'), { vorname: '', nachname: '', firma: 'Bauträger Neckartal GmbH & Co. KG' });
  assert.deepEqual(zerlegeName('Müller'), { vorname: '', nachname: 'Müller', firma: '' });
  const r = pruefeAlles('kontakte', { Name: 'name_komplett' }, ['Name'], [['Berg, Anna'], ['Elektro Haldenberg GmbH']], { ziel: K, heute: HEUTE });
  assert.equal(r.saetze[0].vorname, 'Anna');
  assert.equal(r.saetze[0].nachname, 'Berg');
  assert.equal(r.saetze[1].firma, 'Elektro Haldenberg GmbH');
  assert.ok(!('name_komplett' in r.saetze[0]), 'virtuelles Feld geht nie in die Datenbank');
});

test('Lieferanten: Strasse, PLZ, Ort werden zur Adresse', () => {
  const z = zielDef('lieferanten');
  const w = { name: 'X', adresse_strasse: 'Am Ring 1', adresse_plz: '70565', adresse_ort: 'Stuttgart' };
  virtuelleFelderAufloesen(z, w);
  assert.deepEqual(w, { name: 'X', adresse: 'Am Ring 1, 70565 Stuttgart' });
});

test('unbekannter Status: alter Wert bleibt in den Notizen (nichts verschluckt)', () => {
  const r = pruefeAlles('kontakte', { N: 'nachname', S: 'status' }, ['N', 'S'], [['Berg', 'VIP']], { ziel: K, heute: HEUTE });
  assert.equal(r.saetze[0].status, 'interessent');
  assert.match(r.saetze[0].notizen, /Status im Altsystem: VIP/);
});

test('Mustervorlage Kunden enthaelt die neuen Felder, aber keine virtuellen', () => {
  const kopf = baueMustervorlage('kontakte').replace(/^﻿/, '').split('\r\n')[0];
  assert.ok(kopf.includes('Kundennummer') && kopf.includes('PLZ') && kopf.includes('Straße'));
  assert.ok(!kopf.includes('wird zerlegt'));
});

// --- DATEV -------------------------------------------------------------------

const DATEV = [
  '"EXTF";700;16;"Debitoren/Kreditoren";5;20260927101500000;;"RE";"";"";1001;2002;20260101;4;;;"";"";;;;"EUR"',
  'Konto;Name (Adressattyp Unternehmen);Unternehmensgegenstand;Name (Adressattyp natürl. Person);Vorname (Adressattyp natürl. Person);Adressattyp;Kurzbezeichnung;EU-Land;EU-UStID;Anrede;Straße;Postfach;Postleitzahl;Ort;Land;Telefon;E-Mail;Internet;IBAN-Nr. 1;Leer',
  '10001;"Müller GmbH";;;;2;MUE;DE;DE123456789;;"Hauptstr. 1";;70173;Stuttgart;DE;0711 1;info@mueller.de;www.mueller.de;DE02120300000000202051;',
  '10002;;;"Berg";"Anna";1;BERG;;;Frau;"Ringweg 4";;71032;Böblingen;DE;;anna@berg.de;;;',
  '70001;"Großhandel Süd AG";;;;2;GHS;;;;"Industriestr. 9";;80939;München;DE;089 1;bestellung@gh-sued.de;;;',
].join('\r\n');

test('DATEV-Kopf wird erkannt, Spaltennamen stehen in Zeile 2', () => {
  const k = erkenneDatev(DATEV);
  assert.deepEqual(k, { kennzeichen: 'EXTF', version: 700, kategorie: 16, formatname: 'Debitoren/Kreditoren', sachkontenlaenge: 4 });
  const d = leseDatev(DATEV);
  assert.equal(d.fehler, null);
  assert.equal(d.tabelle.kopf[0], 'Konto');
  assert.equal(d.tabelle.zeilen.length, 3);
  assert.equal(erkenneDatev('Kundennummer;Firma\nK-1;A'), null);
});

test('DATEV-Buchungsstapel wird freundlich abgelehnt', () => {
  const d = leseDatev('"EXTF";700;21;"Buchungsstapel";13;\r\nUmsatz;Soll/Haben\r\n1;S');
  assert.match(d.fehler, /Buchungsstapel/);
  assert.match(d.fehler, /Stammdaten/);
});

test('Debitor oder Kreditor — am Kontonummernkreis', () => {
  assert.equal(datevKontoArt('10001', 4), 'debitor');
  assert.equal(datevKontoArt('69999', 4), 'debitor');
  assert.equal(datevKontoArt('70001', 4), 'kreditor');
  assert.equal(datevKontoArt('1200', 4), 'sachkonto');
  assert.equal(datevKontoArt('100001', 5), 'debitor');
  assert.equal(datevKontoArt('10001', 5), 'sachkonto');
  assert.equal(datevKontoArt('700001'), 'kreditor');
  assert.equal(datevKontoArt('abc'), 'unbekannt');
});

test('DATEV als Kunden: Debitoren rein, Kreditor mit Grund raus, IBAN gesperrt', () => {
  const d = leseDatev(DATEV);
  const { kopf, zeilen } = d.tabelle;
  const m = vorschlagMapping(kopf, zeilen, K, { datev: true });
  assert.equal(m['Konto'], 'kundennummer');
  assert.equal(m['Name (Adressattyp Unternehmen)'], 'firma');
  assert.equal(m['Name (Adressattyp natürl. Person)'], 'nachname');
  assert.equal(m['Vorname (Adressattyp natürl. Person)'], 'vorname');
  assert.equal(m['Postleitzahl'], 'plz');
  assert.equal(m['EU-UStID'], 'ust_id');
  assert.equal(m['Internet'], 'website');
  assert.equal(m['IBAN-Nr. 1'], NICHT);
  assert.equal(m['Leer'], NICHT);
  assert.equal(m['Kurzbezeichnung'], EIGEN);
  const kontoIdx = kopf.indexOf('Konto');
  const r = pruefeAlles('kontakte', m, kopf, zeilen, { ziel: K, heute: HEUTE, ablehnen: datevAblehnung('kontakte', kontoIdx, 4) });
  assert.equal(r.gut, 2);
  assert.equal(r.schlecht, 1);
  assert.match(r.fehler[0].meldung, /Kreditor/);
  assert.equal(r.fehler[0].zeile, 4);
  assert.equal(r.saetze[1].vorname, 'Anna');
  assert.deepEqual(datevZaehlen(zeilen, kontoIdx, 4), { debitoren: 2, kreditoren: 1, sonst: 0 });
});

test('DATEV als Lieferanten: Kreditor rein mit zusammengesetzter Adresse, Debitoren raus', () => {
  const d = leseDatev(DATEV);
  const { kopf, zeilen } = d.tabelle;
  const L = katalogFuerZiel('lieferanten', db('lieferanten', ['name', 'ansprechpartner', 'email', 'telefon', 'adresse', 'website', 'kundennummer', 'notizen', 'lieferantennummer', 'ust_id'])).ziel;
  const m = vorschlagMapping(kopf, zeilen, L, { datev: true });
  assert.equal(m['Konto'], 'lieferantennummer');
  assert.equal(m['Name (Adressattyp Unternehmen)'], 'name');
  const r = pruefeAlles('lieferanten', m, kopf, zeilen, { ziel: L, heute: HEUTE, ablehnen: datevAblehnung('lieferanten', kopf.indexOf('Konto'), 4) });
  assert.equal(r.gut, 1);
  assert.equal(r.schlecht, 2);
  assert.equal(r.saetze[0].adresse, 'Industriestr. 9, 80939 München');
  assert.equal(r.saetze[0].lieferantennummer, '70001');
  assert.equal(datevAblehnung('artikel', 0, 4), undefined);
  assert.ok(zusatzAliase('lieferanten', { datev: true }).adresse_plz.includes('Postleitzahl'));
});

test('Dateiart nach Endung und Inhalt', () => {
  assert.equal(dateiArt('opos.xls', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), 'xls');
  assert.equal(dateiArt('export.xls', new Uint8Array([0x4b, 0x6f, 0x6e, 0x74])), 'csv', 'CSV mit falscher Endung');
  assert.equal(dateiArt('mappe.xls', new Uint8Array([0x50, 0x4b, 3, 4])), 'xlsx');
  assert.equal(dateiArt('kunden.csv'), 'csv');
  assert.equal(dateiArt('artikel.xlsx'), 'xlsx');
});

test('CSV aus dem echten Leser behaelt eindeutige Koepfe (Haldenberg-Format)', () => {
  const t = leseCsv('﻿Artikelnummer;Bezeichnung;Einkaufspreis\r\nL-1;Kabel;68,40\r\n');
  assert.deepEqual(eindeutigeKoepfe(t.kopf), ['Artikelnummer', 'Bezeichnung', 'Einkaufspreis']);
});

// --- Die Seite benutzt den Motor ---------------------------------------------

test('Import-Seite: Katalog aus der DB, Eigene Felder, DATEV, .xls, Altsysteme, ?ziel=', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes("rpc('import_feldkatalog'"), 'Feldkatalog aus der DB');
  assert.ok(s.includes("from('import_altsystem_wahl')"), 'Altsystem-Wahl je Betrieb');
  assert.ok(s.includes('<option value={EIGEN}>'), 'Eigenes Feld waehlbar');
  assert.ok(s.includes("from('eigenes_feld_wert').upsert("), 'Werte der Eigenen Felder');
  assert.ok(s.includes("from('eigenes_feld_wert').delete().eq('modul'"), 'Rueckgaengig nimmt Eigene-Feld-Werte mit');
  assert.ok(s.includes('leseXls(bytes)') && s.includes('leseDatev(text)'), '.xls und DATEV im Browser');
  assert.ok(s.includes("q.get('ziel')"), 'Modul-Knoepfe mit vorgewaehltem Ziel');
  assert.ok(s.includes('const neuOwner = betrieb;'), 'alle Importe gehoeren dem Betrieb');
  assert.ok(s.includes('datevAblehnung(zielKey'), 'Kreditoren/Debitoren getrennt');
  assert.ok(s.includes('<SpaltenBilanzKasten'), 'Spalten-Bilanz sichtbar');
  assert.ok(s.includes('Weitere Angaben aus dem Altsystem'), 'Rueckfall in die Notizen');
  assert.ok(!s.includes('errateMapping('), 'die alte Erkennung ohne Katalog ist abgeloest');
  for (const [datei, ziel] of [['app/dashboard/erp/lieferanten/page.tsx', 'lieferanten'], ['app/dashboard/erp/preisliste/page.tsx', 'artikel'], ['app/dashboard/crm/import/page.tsx', 'kontakte']]) {
    assert.ok(lies(datei).includes(`/dashboard/import?ziel=${ziel}`), `${datei} fuehrt auf den Motor`);
  }
});

test('SQL p124: additiv, idempotent, nur freigegebene Tabellen, anon gesperrt', () => {
  const q = lies('supabase-sql/p124-import-motor.sql');
  const code = q.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n').toLowerCase();
  assert.ok(!/\bdrop\s+table\b/.test(code) && !/\bdrop\s+column\b/.test(code));
  assert.ok(!/\bdelete\s+from\b/.test(code) && !/\btruncate\b/.test(code));
  assert.ok(!/alter\s+policy|drop\s+policy\s+if\s+exists\s+(kontakte|lieferanten|artikel|rechnungen)_/.test(code), 'keine bestehende Regel geaendert');
  assert.equal((code.match(/add column if not exists/g) ?? []).length, 12);
  assert.ok(code.includes('security invoker'));
  assert.ok(code.includes("array['kontakte', 'lieferanten', 'artikel', 'rechnungen']"));
  assert.ok(code.includes('from anon'));
  assert.ok(code.includes('create table if not exists public.import_altsystem_wahl'));
  assert.ok(!/for delete/.test(code), 'Mitarbeiter loeschen nichts');
});
