// Umzug Schritt 2 (27.09.2026) · Paket 124 — alte Excel-Dateien (.xls) und
// die Altsysteme-Klickliste.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { leseXls, istXls, rkZahl, istDatumFormat, excelDatum, zahlAlsText } from '../out/xlsLeser.js';
import {
  ALTSYSTEME, ALTSYSTEM_GRUPPEN, HERSTELLER_FRAGEN, altsystem, istBelegt, anleitung, sperrText,
  sucheAltsysteme, gruppiereAltsysteme, sichtbareAltsysteme, bereinigeWahl, systemAliase,
  erkenneAltsystem, zaehleAltsysteme,
} from '../out/altsysteme.js';
import { zielDef } from '../out/importParser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const fixture = (n) => new Uint8Array(fs.readFileSync(path.join(WURZEL, 'tests', 'fixtures', n)));

// --- .xls --------------------------------------------------------------------

test('.xls wie aus DATEV-OPOS: Texte mit Umlauten/€, Zahlen, Datumsformat, negative Betraege', () => {
  const r = leseXls(fixture('import-opos.xls'));
  assert.equal(r.blatt, 'OPOS');
  assert.deepEqual(r.zeilen[0], ['Konto', 'Name', 'Rechnungsnummer', 'Datum', 'Fällig', 'Betrag', 'Offen', 'Bemerkung']);
  assert.deepEqual(r.zeilen[1], ['10001', 'Müller GmbH', 'R-1', '2026-08-15', '2026-09-14', '1190.5', '1190.5', 'Straße ß €']);
  assert.deepEqual(r.zeilen[2].slice(0, 7), ['10002', 'Öztürk & Söhne', 'R-2', '2026-01-01', '2026-01-31', '-250', '0']);
  assert.equal(r.zeilen[3][5], '123456.78');
  assert.deepEqual(r.weitereBlaetter, ['Zweites']);
  assert.ok(r.hinweise.some((h) => h.includes('Zweites')), 'weitere Blaetter werden genannt, nicht verschluckt');
});

test('.xls aus LibreOffice: Formel-Ergebnisse und Datumsformat', () => {
  const r = leseXls(fixture('import-libreoffice.xls'));
  assert.equal(r.blatt, 'Debitoren');
  assert.equal(r.zeilen.length, 50);
  assert.deepEqual(r.zeilen[1], ['10001', 'Kunde 1 Ä', '2026-01-02', '1.25', '2.5']);
  assert.equal(r.zeilen[49][4], String(49 * 1.25 * 2));
});

test('.xls mit vielen Texten: die Texttabelle geht ueber mehrere Saetze (CONTINUE) — alle 400 richtig', () => {
  const r = leseXls(fixture('import-viele-texte.xls'));
  assert.equal(r.zeilen.length, 401);
  for (let i = 1; i <= 400; i++) {
    const erwartet = `Zeile ${i} äöü € ${'x'.repeat(i % 37)}.`;
    assert.equal(r.zeilen[i][1], erwartet, `Zeile ${i}`);
    assert.equal(r.zeilen[i][0], zahlAlsText(i % 2 ? i * 1.5 : i));
  }
});

test('keine .xls-Datei -> klare Meldung statt Absturz', () => {
  const csv = new TextEncoder().encode('Kundennummer;Firma\nK-1;A\n'.repeat(40));
  assert.equal(istXls(csv), false);
  assert.throws(() => leseXls(csv), /keine alte Excel-Datei/);
  assert.equal(istXls(fixture('import-opos.xls')), true);
});

test('RK-Zahlen, Datumsformate, Seriennummern', () => {
  assert.equal(rkZahl(0xaa), 42);
  assert.equal(rkZahl(0xffffffe6), -7);
  assert.equal(rkZahl(0xc0e7), 123.45);
  assert.equal(rkZahl(0x3ff40000), 1.25);
  assert.equal(istDatumFormat('DD.MM.YYYY'), true);
  assert.equal(istDatumFormat('TT.MM.JJJJ'), true);
  assert.equal(istDatumFormat('#,##0.00 "€"'), false);
  assert.equal(istDatumFormat('[Red]#,##0.00'), false);
  assert.equal(istDatumFormat('General'), false);
  assert.equal(excelDatum(46249), '2026-08-15');
  assert.equal(excelDatum(61), '1900-03-01');
  assert.equal(excelDatum(46249.5, false, true), '2026-08-15 12:00');
  assert.equal(excelDatum(44787, true), '2026-08-15');
  assert.equal(excelDatum(-1), null);
  assert.equal(zahlAlsText(0.1 + 0.2), '0.3');
});

// --- Altsysteme --------------------------------------------------------------

test('mindestens die 56 recherchierten Systeme, eindeutig, jede Gruppe belegt', () => {
  const z = zaehleAltsysteme();
  assert.ok(z.gesamt >= 56, `nur ${z.gesamt}`);
  assert.equal(new Set(ALTSYSTEME.map((s) => s.key)).size, ALTSYSTEME.length);
  for (const g of ALTSYSTEM_GRUPPEN) assert.ok(ALTSYSTEME.some((s) => s.gruppe === g.key), g.key);
  assert.ok(z.belegt >= 40 && z.belegt < z.gesamt, 'nicht Belegtes ist ehrlich als solches markiert');
});

test('Nicht belegter Weg -> „Export beim Hersteller erfragen"', () => {
  const sev = altsystem('sevdesk');
  assert.equal(istBelegt(sev), false);
  const a = anleitung(sev);
  assert.equal(a.belegt, false);
  assert.equal(a.schritte[0], HERSTELLER_FRAGEN);
  assert.ok(a.schritte.some((t) => t.includes('DATEV')));
  const h = anleitung(altsystem('hubspot'));
  assert.equal(h.belegt, true);
  assert.ok(h.schritte.length >= 3);
});

test('Patientendaten und Mitglieder mit Bankdaten: gesperrt, kein Import-Knopf', () => {
  for (const k of ['doctolib', 'easyvet', 'vetera', 'easyverein', 'clubdesk']) {
    const s = altsystem(k);
    assert.ok(sperrText(s), k);
    assert.deepEqual(s.ziele, [], `${k} darf kein Import-Ziel haben`);
  }
  assert.equal(sperrText(altsystem('datev')), null);
});

test('jede belegte Spalte zeigt auf ein echtes Feld des Ziels', () => {
  for (const s of ALTSYSTEME) {
    for (const [ziel, felder] of Object.entries(s.spalten ?? {})) {
      const z = zielDef(ziel);
      assert.ok(z, `${s.key}: Ziel ${ziel}`);
      for (const feld of Object.keys(felder)) {
        assert.ok(z.felder.some((f) => f.key === feld), `${s.key}: Feld ${ziel}.${feld} gibt es nicht`);
      }
      assert.ok(s.ziele.includes(ziel), `${s.key}: Spalten fuer ${ziel}, aber nicht als Ziel angegeben`);
    }
  }
});

test('Kundentexte siezen', () => {
  const alle = ALTSYSTEME.flatMap((s) => [s.daten, ...(s.schritte ?? []), ...(s.hinweise ?? [])]).join(' ');
  assert.ok(!/\b(du|dein|deine|dich|dir)\b/i.test(alle), 'kein Duzen');
  assert.ok(!/KI-Agent|KI-Crew/.test(alle));
});

test('Suche, Gruppen, Wahl: angehakt sichtbar, ausgeblendet weg, „nur meine"', () => {
  assert.ok(sucheAltsysteme(ALTSYSTEME, 'lexware').length >= 2);
  assert.ok(sucheAltsysteme(ALTSYSTEME, 'DATEV').some((s) => s.key === 'datev'));
  assert.equal(gruppiereAltsysteme(ALTSYSTEME)[0].key, 'crm');
  const wahl = { systeme: ['datev', 'hubspot'], ausgeblendet: ['shopify', 'datev'] };
  const alle = sichtbareAltsysteme(ALTSYSTEME, wahl, false);
  assert.ok(alle.some((s) => s.key === 'datev'), 'angehakt schlaegt ausgeblendet');
  assert.ok(!alle.some((s) => s.key === 'shopify'));
  assert.deepEqual(sichtbareAltsysteme(ALTSYSTEME, wahl, true).map((s) => s.key).sort(), ['datev', 'hubspot']);
  assert.deepEqual(bereinigeWahl(['datev', 'gibtsnicht', 'datev', 7, null]), ['datev']);
  assert.deepEqual(bereinigeWahl(null), []);
});

test('Spalten-Aliase je System; Datei-Erkennung braucht genug Treffer', () => {
  const a = systemAliase(['brevo', 'hubspot'], 'kontakte');
  assert.deepEqual(a.email, ['EMAIL', 'Email', 'E-Mail']);
  assert.ok(a.import_schluessel.includes('Record ID'));
  assert.deepEqual(systemAliase(['gibtsnicht'], 'kontakte'), {});
  const hub = erkenneAltsystem(['Record ID', 'First name', 'Last name', 'Email', 'Lifecycle stage']);
  assert.equal(hub?.key, 'hubspot');
  const shop = erkenneAltsystem(['First Name', 'Last Name', 'Email', 'Default Address Company', 'Default Address Zip', 'Tags']);
  assert.equal(shop?.key, 'shopify');
  assert.equal(erkenneAltsystem(['Name', 'Email']), null, 'zu wenig, um ein System zu erkennen');
  // Allgemeine deutsche Koepfe (Haldenberg, WISO, Lexware …) sind KEIN Beweis fuer ein Programm.
  assert.equal(erkenneAltsystem('Kundennummer;Firma;Vorname;Nachname;Position;Strasse;PLZ;Ort;Telefon;E-Mail;Status;Quelle;Notizen'.split(';')), null);
  assert.equal(erkenneAltsystem(['Artikelnummer', 'Bezeichnung', 'Warengruppe', 'Einheit']), null);
  const datev = erkenneAltsystem(['Konto', 'Name (Adressattyp Unternehmen)', 'Name (Adressattyp natürl. Person)', 'Vorname (Adressattyp natürl. Person)', 'EU-UStID']);
  assert.equal(datev?.key, 'datev');
});
