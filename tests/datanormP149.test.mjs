// Paket 149 (28.09.2026) — Umzug Schritt 7: DATANORM 4 und 5 (Artikel + Preise vom Grosshandel)
// -> Artikel-Import ueber den normalen Motor. Testdaten selbst gebaut nach dem Satzaufbau
// (kein Kundenmaterial).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { istDatanorm, leseDatanorm, dekodiereDatanorm, lesePreisDatanorm, zahlDeDatanorm, datanormReihenfolge } from '../out/datanormLeser.js';
import { pruefeAlles } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN } from '../out/importMotor.js';
import { erkenneDatei } from '../out/umzugPlan.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// CP850-Bytes erzeugen (nur die Zeichen, die wir brauchen)
const CP = { 'ä': 0x84, 'ö': 0x94, 'ü': 0x81, 'ß': 0xe1, 'Ä': 0x8e, 'Ö': 0x99, 'Ü': 0x9a };
function cp850(text) {
  const b = [];
  for (const ch of text) { if (CP[ch] !== undefined) b.push(CP[ch]); else { const c = ch.charCodeAt(0); assert.ok(c < 128, `Testzeichen ${ch}`); b.push(c); } }
  return new Uint8Array(b);
}
const vorlauf4 = (datum = '280926') => ('V ' + datum + 'Elektro-Grosshandel Muster'.padEnd(40) + 'Preisliste 2026'.padEnd(40) + ''.padEnd(35) + '04' + 'EUR');

const V4 = [
  vorlauf4(),
  'A;N;K-NYM3;00;Mantelleitung NYM-J 3x1,5;Ring 100 m;1;2;m;4590;12;01;;',          // Listenpreis 45,90 je 100 m
  'B;N;K-NYM3;NYMJ3X15; ;S. 12;0;0;0;4012345678901; ;01.100;0;100; ; ;',
  'D;N;K-NYM3;1;F;;Für feste Verlegung in trockenen;2;F;;und feuchten Räumen.;',
  'A;N;S-DOSE;00;Schalterdose tief;;2;0;Stk;89;31;02;T-DOSE;',                          // Nettopreis 0,89
  'B;N;S-DOSE; ; ; ;0;0;0;12345; ;02.050;0;0; ; ;',                                     // EAN ungueltig
  'T;N;T-DOSE;;1;;Hohlwanddose, 60 mm tief;2;;Größe 1;',
  'A;N;ALT-01;00;Auslaufartikel;;1;0;Stk;1000;12;01;;',
  'A;L;ALT-01;;;;;;;;;;;',                                                              // geloescht
  'A;X;NEU-99;;;;;;;;;;;',
  'A;N;LAMPE;00;Leuchte Übersicht;;1;0;Stk;0;40;03;;',                                  // Preis per P-Satz
  'P;A;LAMPE;1;12950;1;5500;;;;;S-DOSE;2;95;;;;;;;;;;;',
  'A;N;OHNE;00;Ohne Preis;;1;0;Stk;0;40;03;;',                                          // 0 = kein Preis
  'B;N;NUR-B;MATCH; ; ;0;0;0;4012345678918; ;01;0;0; ; ;',                               // Zusatzsatz ohne Artikel
  'S;N;01;Kabel und Leitungen;',
  '\x1a',
].join('\r\n');

test('Erkennen: Dateiname oder Vorlaufsatz', () => {
  assert.equal(istDatanorm('DATANORM.001', ''), true);
  assert.equal(istDatanorm('datpreis.002', ''), true);
  assert.equal(istDatanorm('DATANORM.WRG', ''), true);
  assert.equal(istDatanorm('artikel.txt', 'V;050;A;20260928;EUR;Muster;'), true);
  assert.equal(istDatanorm('artikel.txt', vorlauf4()), true);
  assert.equal(istDatanorm('kunden.csv', 'Kundennummer;Firma'), false);
  assert.equal(istDatanorm('bericht.txt', 'Vertrag 2026;Seite 1'), false);
});

test('Zeichensatz: CP850 erkannt, Windows-1252 und UTF-8 ebenso', () => {
  assert.equal(dekodiereDatanorm(cp850('Größe Übersicht')).text, 'Größe Übersicht');
  assert.equal(dekodiereDatanorm(cp850('Größe')).zeichensatz, 'CP850');
  assert.equal(dekodiereDatanorm(new Uint8Array([0x47, 0x72, 0xf6, 0xdf, 0x65])).text, 'Größe');
  assert.equal(dekodiereDatanorm(new TextEncoder().encode('Größe')).zeichensatz, 'UTF-8');
});

test('Preise: zwei Nachkommastellen ohne Komma, Ausgabe deutsch', () => {
  assert.equal(lesePreisDatanorm('1590'), 15.9);
  assert.equal(lesePreisDatanorm(' 89 '), 0.89);
  assert.equal(lesePreisDatanorm('15,90'), 15.9);
  assert.equal(lesePreisDatanorm('abc'), null);
  assert.equal(zahlDeDatanorm(0.459), '0,459');
  assert.equal(zahlDeDatanorm(12.5), '12,50');
  assert.equal(zahlDeDatanorm(0.12345), '0,1235');
});

test('DATANORM 4: Artikel, Preiseinheit, Brutto/Netto, Langtexte, EAN, Loeschung, P-Satz', () => {
  const r = leseDatanorm(cp850(V4));
  assert.equal(r.version, 4);
  assert.equal(r.zeichensatz, 'CP850');
  assert.equal(r.anzahl, 4, 'ALT-01 geloescht, NEU-99 nur Nummernaenderung, NUR-B ohne Artikelsatz');
  assert.ok(!r.zeilen.some((z) => z[0] === 'NUR-B'));
  assert.ok(r.hinweise.some((h) => /1 Zusatzsätze ohne passenden Artikelsatz/.test(h)));
  const zeile = (nr) => Object.fromEntries(r.kopf.map((k, i) => [k, r.zeilen.find((z) => z[0] === nr)[i]]));
  const k = zeile('K-NYM3');
  assert.equal(k.bezeichnung, 'Mantelleitung NYM-J 3x1,5 Ring 100 m');
  assert.equal(k.einheit, 'm');
  assert.equal(k.verkaufspreis, '0,459', '45,90 je 100 m -> 0,459 je m');
  assert.equal(k.einkaufspreis, '');
  assert.equal(k.ean, '4012345678901');
  assert.equal(k.kategorie, '01.100', 'Warengruppe aus dem B-Satz');
  assert.equal(k.Hauptwarengruppe, '01');
  assert.equal(k.Rabattgruppe, '12');
  assert.equal(k.Matchcode, 'NYMJ3X15');
  assert.equal(k.Verpackungsmenge, '100');
  assert.equal(k['Datanorm-Originalpreis je Preiseinheit'], 'Liste 45,90 € je 100 m');
  assert.equal(k.beschreibung, 'Für feste Verlegung in trockenen\nund feuchten Räumen.');
  const d = zeile('S-DOSE');
  assert.equal(d.einkaufspreis, '0,95', 'Nettopreis aus P-Satz geht vor A-Satz (0,89)');
  assert.equal(d.verkaufspreis, '');
  assert.equal(d.ean, '');
  assert.equal(d['EAN laut Datei (ungültig)'], '12345');
  assert.equal(d.beschreibung, 'Hohlwanddose, 60 mm tief\nGröße 1', 'Langtext ueber den Langtextschluessel');
  const l = zeile('LAMPE');
  assert.equal(l.bezeichnung, 'Leuchte Übersicht');
  assert.equal(l.verkaufspreis, '129,50', 'Preis 0 im A-Satz, Listenpreis aus P-Satz');
  assert.equal(l['Datanorm-Rabattangabe'], 'Rabattsatz: 5500', 'Rabatt roh erhalten, nicht verrechnet');
  assert.equal(zeile('OHNE').verkaufspreis, '', 'Preis 0 heisst „kommt per P-Satz", nicht 0 €');
  assert.ok(r.hinweise.some((h) => /1 Artikel sind in der Datei als gelöscht markiert/.test(h)));
  assert.ok(r.hinweise.some((h) => /1 Artikelnummern-Änderungen/.test(h)));
  assert.ok(r.hinweise.some((h) => /1 × Warengruppen \(S\)/.test(h)));
  assert.ok(r.hinweise.some((h) => /je 10\/100\/1000/.test(h)));
  assert.ok(!r.hinweise.some((h) => /Satzart/.test(h)), 'Strg+Z am Dateiende ist kein Satz');
});

test('DATPREIS allein: Hinweis, nichts erfunden; zusammen mit DATANORM.001 in der richtigen Reihenfolge', () => {
  const preis = [vorlauf4(), 'P;A;K-NYM3;2;3100;;;;;;;;;;;;;;;;;;;;;'].join('\r\n');
  const allein = leseDatanorm(preis);
  assert.equal(allein.anzahl, 0);
  assert.ok(allein.hinweise.some((h) => /DATPREIS bitte zusammen mit DATANORM\.001/.test(h)));
  const zusammen = leseDatanorm(V4 + '\r\n' + preis);
  const i = zusammen.kopf.indexOf('einkaufspreis');
  assert.equal(zusammen.zeilen.find((z) => z[0] === 'K-NYM3')[i], '0,31', 'Netto 31,00 je 100 m');
  assert.deepEqual(datanormReihenfolge(['DATPREIS.001', 'kunden.csv', 'DATANORM.RAB', 'DATANORM.002', 'DATANORM.001']), [4, 3, 0, 2]);
  assert.deepEqual(datanormReihenfolge(['kunden.csv']), []);
});

const V5 = [
  'V;050;A;20260928;EUR;Muster Sicherheitstechnik;;;;;;;;;',
  'T;N;T100;1;01;Rauchmelder mit Funkmodul;',
  'T;N;T100;1;02;VdS-geprüft;',
  'A;N;RM-100;Rauchmelder RM 100;weiß;Stck;1;1;2490;001;BRA;BRA.10;;;;;;;;;;;3;T100;;;;;;',
  'A;N;RM-ZUB;Zubehörset;;Stck;2;1;500;001;BRA;BRA.20;;;;;;;;;;;3;;;;;;;',
  'A;N;RM-SET;Set nach Anfrage;;Stck;9;1;4711;001;BRA;;;;;;;;;;;;3;;;;;;;',
  'A;N;RM-10ER;Rauchmelder 10er-Pack;;Stck;1;10;19900;001;BRA;;;;;;;;;;;;3;;;;;;;',
  'A;N;RM-ALT;Altmelder;;Stck;1;1;1000;001;BRA;;;;;;;;;;;;3;;;;;;;',
  'B;N;RM-ALT;;',
  'P;RM-100;1;1;2590;001;',
];
const V5_TEXT = (ende) => [...V5, `E;${ende};Ende der Datei;`].join('\r\n');

test('DATANORM 5: Preiskennzeichen vor Preiseinheit, Preis auf Anfrage, B = Loeschung, Endesatz', () => {
  const r = leseDatanorm(V5_TEXT(V5.length + 1));
  assert.equal(r.version, 5);
  assert.equal(r.anzahl, 4);
  const zeile = (nr) => Object.fromEntries(r.kopf.map((k, i) => [k, r.zeilen.find((z) => z[0] === nr)[i]]));
  const m = zeile('RM-100');
  assert.equal(m.bezeichnung, 'Rauchmelder RM 100 weiß');
  assert.equal(m.verkaufspreis, '24,90', 'P-Satz in DATANORM 5 wird nicht geraten');
  assert.equal(m.kategorie, 'BRA.10');
  assert.equal(m.beschreibung, 'Rauchmelder mit Funkmodul\nVdS-geprüft');
  assert.equal(zeile('RM-ZUB').einkaufspreis, '5,00', 'Kennzeichen 2 = Netto');
  assert.equal(zeile('RM-SET').verkaufspreis, '');
  assert.equal(zeile('RM-SET')['Datanorm-Preisart'], 'Preis auf Anfrage');
  assert.equal(zeile('RM-10ER').verkaufspreis, '19,90', '199,00 je 10 Stck');
  assert.ok(r.hinweise.some((h) => /1 Preissätze im DATANORM-5-Format/.test(h)));
  assert.ok(!r.zeilen.some((z) => z[0] === 'RM-ALT'), 'B-Satz in DATANORM 5 = Loeschung');
  assert.ok(r.hinweise.some((h) => /1 Artikel sind in der Datei als gelöscht markiert/.test(h)));
  assert.ok(!r.hinweise.some((h) => /unvollständig/.test(h)), 'Endesatz stimmt');
  const kurz = leseDatanorm(V5_TEXT(V5.length + 50));
  assert.ok(kurz.hinweise[0].startsWith('⚠️ Die Datei ist vermutlich unvollständig'));
});

test('DATANORM 5: vertauschte Felder am Wert erkannt, Zweifel gemeldet', () => {
  const t = ['V;050;A;20260928;EUR;X;', 'A;N;A1;Kabel;;m;100;1;4500;;;;;;;;;;;;;;;;', 'A;N;A2;Dose;;Stk;1;2;300;;;;;;;;;;;;;;;;'].join('\n');
  const r = leseDatanorm(t);
  const i = r.kopf.indexOf('verkaufspreis');
  assert.equal(r.zeilen[0][i], '0,45', 'Feld 7 = 100 kann kein Preiskennzeichen sein');
  assert.ok(r.hinweise.some((h) => /1 Artikel: Preiskennzeichen und Preiseinheit waren nicht eindeutig/.test(h)));
  assert.match(r.zeilen[1][r.kopf.indexOf('Datanorm-Preisart')], /nicht eindeutig/);
});

test('DATANORM 3: klare Absage statt Unsinn', () => {
  const r = leseDatanorm(('V 010190Alt'.padEnd(123) + '03EUR') + '\nA000123Kabel');
  assert.equal(r.anzahl, 0);
  assert.ok(r.hinweise.some((h) => /DATANORM 3 erkannt/.test(h)));
});

test('Durch den Motor: Artikel-Felder erkannt, Zusatzangaben als Eigenes Feld, nichts verschluckt', () => {
  const r = leseDatanorm(cp850(V4));
  const z = katalogFuerZiel('artikel', null).ziel;
  const map = vorschlagMapping(r.kopf, r.zeilen, z);
  for (const k of ['artikelnummer', 'bezeichnung', 'beschreibung', 'kategorie', 'einheit', 'verkaufspreis', 'einkaufspreis', 'ean']) assert.equal(map[k], k, k);
  for (const k of r.kopf.slice(8)) assert.equal(map[k], EIGEN, `${k} -> Eigenes Feld`);
  assert.equal(spaltenBilanz(r.kopf, r.zeilen, map, z).verschluckt, 0);
  const b = pruefeAlles('artikel', map, r.kopf, r.zeilen, { ziel: z });
  assert.equal(b.gut, 4);
  const nym = b.saetze.find((s) => s.artikelnummer === 'K-NYM3');
  assert.equal(nym.verkaufspreis, 0.459);
  assert.equal(erkenneDatei('DATANORM.001', r.kopf, r.zeilen).ziel, 'artikel');
});

test('Seiten: Import-Center und Umzugsstapel lesen DATANORM, DATPREIS wird angehaengt', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('if (istDatanorm(f.name, bytes.subarray(0, 400))) {'));
  assert.ok(s.includes('const d = leseDatanorm(bytes);'));
  assert.ok(s.includes('if (dn.length === liste.length) {'));
  const u = lies('app/dashboard/import/UmzugStapel.tsx');
  assert.ok(u.includes('if (istDatanorm(f.name, anfang.subarray(0, 400))) {'));
  assert.ok(u.includes('if (dn.length > 1) {'));
});
