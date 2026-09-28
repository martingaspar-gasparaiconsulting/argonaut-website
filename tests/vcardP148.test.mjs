// Paket 148 (28.09.2026) — Umzug Schritt 7: vCard (.vcf) -> Kunden-Import ueber den normalen Motor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { istVcard, leseVcard } from '../out/vcardLeser.js';
import { pruefeAlles } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN } from '../out/importMotor.js';
import { erkenneDatei } from '../out/umzugPlan.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const V3 = [
  'BEGIN:VCARD', 'VERSION:3.0', 'N:Beispiel;Anna;Maria;Frau Dr.;', 'FN:Dr. Anna Maria Beispiel', 'ORG:Muster Bau GmbH;Einkauf',
  'TITLE:Einkaufsleiterin', 'EMAIL;TYPE=HOME:anna@privat.example', 'EMAIL;TYPE=WORK,PREF:a.beispiel@musterbau.example',
  'TEL;TYPE=WORK,VOICE:07031 12345', 'TEL;TYPE=CELL:0171 2345678', 'TEL;TYPE=HOME:07031 99999', 'TEL;TYPE=FAX,WORK:07031 12346',
  'ADR;TYPE=WORK:;Gebäude B;Hauptstraße 5;Böblingen;BW;71032;Deutschland', 'ADR;TYPE=HOME:;;Gartenweg 2;Sindelfingen;;71063;',
  'URL:https://musterbau.example', 'NOTE:Rückruf\\, bitte vormittags\\nWichtig: Rechnung per Mail', 'BDAY:1980-04-12',
  'CATEGORIES:Kunde,Bau', 'item1.X-ABLabel:egal', 'item2.EMAIL;TYPE=INTERNET:dritte@example.de', 'UID:urn:uuid:1234-abcd', 'END:VCARD',
  'BEGIN:VCARD', 'VERSION:3.0', 'FN:Elektro Sonnenfeld KG', 'ORG:Elektro Sonnenfeld KG', 'EMAIL:info@sonnenfeld.example', 'END:VCARD',
].join('\r\n');

test('Erkennen: Endung oder Inhalt', () => {
  assert.equal(istVcard('kontakte.vcf', ''), true);
  assert.equal(istVcard('export.txt', 'BEGIN:VCARD\r\nVERSION:3.0'), true);
  assert.equal(istVcard('kunden.csv', 'Kundennummer;Firma'), false);
});

test('vCard 3.0: Namen, Firma, geschaeftliche Daten zuerst, Rest als eigene Spalten, Maskierung', () => {
  const v = leseVcard(V3);
  assert.equal(v.anzahl, 2);
  const z = Object.fromEntries(v.kopf.map((k, i) => [k, v.zeilen[0][i]]));
  assert.equal(z.Nachname, 'Beispiel'); assert.equal(z.Vorname, 'Anna Maria'); assert.equal(z.Anrede, 'Frau Dr.');
  assert.equal(z.Firma, 'Muster Bau GmbH'); assert.equal(z.Abteilung, 'Einkauf'); assert.equal(z.Position, 'Einkaufsleiterin');
  assert.equal(z['E-Mail'], 'a.beispiel@musterbau.example'); assert.equal(z['E-Mail 2'], 'anna@privat.example'); assert.equal(z['E-Mail 3'], 'dritte@example.de', 'Gruppen-Praefix item2.');
  assert.equal(z.Telefon, '07031 12345'); assert.equal(z.Mobil, '0171 2345678'); assert.equal(z['Telefon privat'], '07031 99999'); assert.equal(z.Fax, '07031 12346');
  assert.equal(z['Straße'], 'Hauptstraße 5, Gebäude B'); assert.equal(z.PLZ, '71032'); assert.equal(z.Ort, 'Böblingen'); assert.equal(z.Land, 'Deutschland');
  assert.equal(z['Adresse privat'], 'Gartenweg 2, 71063 Sindelfingen');
  assert.equal(z.Notizen, 'Rückruf, bitte vormittags\nWichtig: Rechnung per Mail');
  assert.equal(z.Geburtstag, '1980-04-12'); assert.equal(z.Kategorien, 'Kunde,Bau');
  assert.equal(z['Nummer im Altsystem'], 'urn:uuid:1234-abcd');
  const f = Object.fromEntries(v.kopf.map((k, i) => [k, v.zeilen[1][i]]));
  assert.equal(f.Firma, 'Elektro Sonnenfeld KG'); assert.equal(f.Nachname, '', 'Firmenkarte: Anzeigename = Firma, kein Personenname erfunden');
});

test('vCard 2.1: QUOTED-PRINTABLE mit weichem Umbruch, Windows-1252, Faltung', () => {
  const t = 'BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen\r\n'
    + 'NOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:Erste Zeile=0D=0AZweite =\r\nZeile\r\n'
    + 'ADR;WORK;ENCODING=QUOTED-PRINTABLE;CHARSET=windows-1252:;;Stra=DFe 1;K=F6ln;;50667;\r\n'
    + 'TEL;CELL;VOICE:0170 1\r\nEMAIL;INTERNET:j.mueller@example.de\r\nTITLE:Sehr langer\r\n  Titel\r\nEND:VCARD\r\n';
  const v = leseVcard(t);
  const z = Object.fromEntries(v.kopf.map((k, i) => [k, v.zeilen[0][i]]));
  assert.equal(z.Nachname, 'Müller'); assert.equal(z.Vorname, 'Jürgen');
  assert.equal(z.Notizen, 'Erste Zeile\r\nZweite Zeile');
  assert.equal(z['Straße'], 'Straße 1'); assert.equal(z.Ort, 'Köln');
  assert.equal(z.Mobil, '0170 1'); assert.equal(z['E-Mail'], 'j.mueller@example.de');
  assert.equal(z.Position, 'Sehr langer Titel');
});

test('Durch den Motor: alle Spalten erkannt oder Eigenes Feld, nichts verschluckt, 2 Kunden', () => {
  const v = leseVcard(V3);
  const z = katalogFuerZiel('kontakte', null).ziel;
  const map = vorschlagMapping(v.kopf, v.zeilen, z);
  for (const k of ['Firma', 'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Position', 'Notizen']) assert.ok(map[k] && map[k] !== EIGEN, k);
  assert.equal(spaltenBilanz(v.kopf, v.zeilen, map, z).verschluckt, 0);
  const b = pruefeAlles('kontakte', map, v.kopf, v.zeilen, { ziel: z });
  assert.equal(b.gut, 2);
  assert.equal(b.saetze[0].email, 'a.beispiel@musterbau.example');
  assert.equal(erkenneDatei('adressbuch.vcf', v.kopf, v.zeilen).ziel, 'kontakte');
});

test('Leer/kaputt: Hinweis statt Absturz', () => {
  assert.equal(leseVcard('irgendwas').anzahl, 0);
  assert.ok(leseVcard('irgendwas').hinweise.some((h) => /keine vCard/.test(h)));
});

test('Seiten: Import-Center und Umzugsstapel nehmen .vcf an', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('if (istVcard(f.name, text.slice(0, 200))) {'));
  assert.ok(s.includes('accept={`.csv,.txt,.xlsx,.xlsm,.xls,.vcf,.ics,.xml,${DATANORM_ENDUNGEN}`}'), 'seit Paket 149-151 mit DATANORM, BMEcat, iCal');
  assert.ok(lies('app/dashboard/import/UmzugStapel.tsx').includes('istVcard(f.name'));
});
