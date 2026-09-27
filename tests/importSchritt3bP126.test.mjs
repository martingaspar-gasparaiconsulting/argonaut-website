// Umzug Schritt 3, Teil 2 (27.09.2026) · Paket 126 — Mitarbeiter (nur Chef,
// ohne Lohn/SV/Zugaenge), Auftraege (Angebote aussortiert), Projekte,
// laufende Kosten, Anlagen, Fuhrpark, Eingangsrechnungen; zusammengesetzte
// Erkennung (Lieferant + Belegnummer).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, sperrGrund, eigeneSpalten, erkennungsFelder, erkennungsSpalten,
  baueBestandIndex, findeImBestand, baueKundenIndex, verknuepfeKunde, fuerDatenbank, EIGEN, NICHT, MOTOR_TABELLEN,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, schluesselWerte, baueMustervorlage, errateMapping } from '../out/importParser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

function spalten(t, cols) {
  return cols.map((c) => ({
    tabelle: t, spalte: c, pflicht: false, generiert: false,
    datentyp: c === 'id' || c.endsWith('_id') && c !== 'ust_id' && c !== 'steuer_id' ? 'uuid'
      : /(datum|_am$|_bis$|^beginn$|^ende$|erstzulassung|leasing_ende)/.test(c) ? 'date'
        : /(summe|stunden|_tage$|jahre|kosten|budget|km_stand|liter|^netto$|^brutto$|betrag|satz|monate)/.test(c) ? 'numeric'
          : /^(aktiv|auto_verlaengerung|darf_abrechnen|darf_verteilen)$/.test(c) ? 'boolean' : 'text',
  }));
}
const DB = [
  ...spalten('mitarbeiter', ['id', 'owner_user_id', 'auth_user_id', 'vorname', 'nachname', 'email', 'telefon', 'position', 'abteilung', 'status', 'eintrittsdatum', 'austrittsdatum', 'geburtsdatum', 'adresse', 'sv_nummer', 'steuer_id', 'iban', 'notfall_kontakt', 'urlaubsanspruch_tage', 'arbeitszeit_modell', 'wochenstunden', 'standort_id', 'leitungsrolle', 'darf_abrechnen', 'darf_verteilen', 'nutzer_typ', 'rolle']),
  ...spalten('auftraege', ['id', 'owner_user_id', 'auftragsnummer', 'titel', 'status', 'auftragsdatum', 'lieferdatum', 'waehrung', 'kontakt_id', 'firma_id', 'notizen', 'netto_summe', 'mwst_summe', 'brutto_summe', 'rechnung_id']),
  ...spalten('projekte', ['id', 'owner_user_id', 'name', 'beschreibung', 'status', 'prioritaet', 'start_datum', 'end_datum', 'budget', 'verantwortlich', 'farbe', 'archiviert']),
  ...spalten('vertraege', ['id', 'owner_user_id', 'bezeichnung', 'kategorie', 'vertragspartner', 'vertragsnummer', 'beginn', 'ende', 'kuendigungsfrist_tage', 'auto_verlaengerung', 'verlaengerung_monate', 'kosten_betrag', 'kosten_intervall', 'status', 'notizen', 'anbieter', 'art', 'betrag', 'intervall', 'absetzbar_prozent', 'start_datum', 'ende_datum', 'notiz', 'aktiv']),
  ...spalten('anlagegueter', ['id', 'owner_user_id', 'bezeichnung', 'kategorie', 'anschaffungsdatum', 'anschaffungskosten', 'nutzungsdauer_jahre', 'notiz', 'status', 'abgang_am']),
  ...spalten('fahrzeuge', ['id', 'owner_user_id', 'bezeichnung', 'kennzeichen', 'fahrzeugtyp', 'fahrgestellnummer', 'erstzulassung', 'tuev_bis', 'wartung_bis', 'versicherung_bis', 'km_stand', 'kraftstoff', 'notizen', 'aktiv', 'uvv_bis', 'leasing_ende', 'fahrer_name', 'tank_liter']),
  ...spalten('eingangsbelege', ['id', 'owner_user_id', 'lieferant', 'belegnummer', 'belegdatum', 'netto', 'ust_betrag', 'ust_satz', 'brutto', 'kategorie', 'notiz', 'datei_pfad', 'status', 'datev_konto', 'bezahlt_am', 'bestellung_id', 'kennzeichen', 'einsatz_id']),
];
const ziel = (k) => katalogFuerZiel(k, DB).ziel;
function datei(text, zielKey) {
  const t = leseCsv(text);
  const z = ziel(zielKey);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, r: pruefeAlles(zielKey, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), b: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

test('sieben neue Ziele, alle nur mit Katalog', () => {
  for (const k of ['mitarbeiter', 'auftraege', 'projekte', 'vertraege', 'anlagegueter', 'fahrzeuge', 'eingangsbelege']) {
    assert.ok(MOTOR_TABELLEN.includes(k), k);
    assert.equal(katalogFuerZiel(k, null).ziel.felder.length, 0, k);
    assert.ok(ziel(k).felder.length >= 5, k);
  }
});

test('Mustervorlagen der neuen Ziele werden wieder erkannt', () => {
  for (const k of ['mitarbeiter', 'auftraege', 'projekte', 'vertraege', 'anlagegueter', 'fahrzeuge', 'eingangsbelege']) {
    const [kopf] = baueMustervorlage(k).replace(/^﻿/, '').trim().split('\r\n').map((z) => z.split(';'));
    const map = errateMapping(kopf, k);
    for (const f of zielDef(k).felder.filter((x) => !x.nichtInVorlage)) assert.ok(Object.values(map).includes(f.key), `${k}: ${f.key}`);
  }
});

// --- Mitarbeiter -------------------------------------------------------------

test('Mitarbeiter (Haldenberg 07): Stammdaten rein, Lohn und Test-Login gesperrt, Personalnummer als Eigenes Feld', () => {
  const { r, b, map, z } = datei('﻿Personalnummer;Vorname;Nachname;Geburtsdatum;Eintritt;Tätigkeit;Wochenstunden;Bruttolohn;Verrechnungssatz;Urlaubsanspruch;Urlaub genommen;E-Mail;Test-Login\r\nM-001;Thomas;Haldenberg;12.03.1974;14.04.2009;Geschäftsführer;45;5.800,00;78,00;30;18;thomas@x.example;\r\nM-002;Andrea;Haldenberg;28.09.1977;14.04.2009;Büro;25;2.350,00;0,00;30;22;andrea@x.example;Test-Login Stufe 3\r\n', 'mitarbeiter');
  assert.equal(map['Bruttolohn'], NICHT);
  assert.equal(map['Test-Login'], NICHT);
  assert.match(b.eintraege.find((e) => e.spalte === 'Bruttolohn').grund, /Lohnprogramm/);
  assert.match(b.eintraege.find((e) => e.spalte === 'Test-Login').grund, /Einladen/);
  assert.equal(map['Personalnummer'], EIGEN);
  assert.equal(map['Tätigkeit'], 'position');
  assert.equal(b.verschluckt, 0);
  assert.equal(r.gut, 2);
  assert.deepEqual([r.saetze[0].eintrittsdatum, r.saetze[0].wochenstunden, r.saetze[0].urlaubsanspruch_tage, r.saetze[0].status], ['2009-04-14', 45, 30, 'aktiv']);
  assert.ok(!('bruttolohn' in r.saetze[0]));
  assert.ok(!eigeneSpalten(['Bruttolohn'], [['5.800,00']], { Bruttolohn: EIGEN }, z).length, 'auch nicht als Eigenes Feld');
  assert.equal(zielDef('mitarbeiter').nurChef, true);
  const prakt = pruefeAlles('mitarbeiter', { V: 'vorname', N: 'nachname', S: 'status' }, ['V', 'N', 'S'], [['Tim', 'Rapp', 'Praktikant']], { ziel: z, heute: HEUTE });
  assert.equal(prakt.saetze[0].status, 'aktiv');
  assert.ok(!('' in prakt.saetze[0]), 'kein leerer Spaltenname im Datensatz');
  assert.ok(prakt.warnungen.some((w) => /Praktikant/.test(w.meldung)));
});

test('Mitarbeiter: Rechte-, Zugangs- und Ausweisspalten der Datenbank werden nie angeboten', () => {
  const keys = ziel('mitarbeiter').felder.map((f) => f.key);
  for (const weg of ['auth_user_id', 'rolle', 'nutzer_typ', 'darf_abrechnen', 'darf_verteilen', 'leitungsrolle', 'sv_nummer', 'steuer_id', 'iban', 'notfall_kontakt']) {
    assert.ok(!keys.includes(weg), weg);
  }
  const z = zielDef('mitarbeiter');
  for (const sp of ['SV-Nummer', 'Sozialversicherungsnummer', 'Steuer-ID', 'Steuerklasse', 'Stundenlohn', 'Gehalt', 'Passwort', 'Benutzername', 'IBAN']) {
    assert.ok(sperrGrund(sp, z), sp);
  }
  for (const frei of ['Vorname', 'Eintritt', 'Abteilung', 'Wochenstunden', 'Personalnummer']) assert.equal(sperrGrund(frei, z), null, frei);
  assert.equal(sperrGrund('Gehalt'), null, 'ohne Ziel keine Mitarbeiter-Sperre (z. B. Artikel)');
});

// --- Auftraege ---------------------------------------------------------------

test('Auftraege (Haldenberg 11): Angebote aussortiert, Kunde verknuepft, Brutto nur wenn es fehlt', () => {
  const { r, b, map, z } = datei('﻿Nummer;Art;Kundennummer;Kunde;Bezeichnung;Von;Bis / gültig bis;Betrag netto;Stand\r\nA-2026-0184;Auftrag;K-1002;Bauträger Neckartal GmbH & Co. KG;Neubau Haus C;15.06.2026;18.12.2026;284.500,00;62 %\r\nAN-2026-0301;Angebot;K-1003;Stadtwerke;LED-Umrüstung;01.09.2026;30.10.2026;12.000,00;\r\n', 'auftraege');
  assert.equal(map['Art'], 'belegart');
  assert.equal(b.verschluckt, 0);
  assert.equal(r.gut, 1);
  assert.match(r.fehler[0].meldung, /Angebot.*gemeinsam/);
  const a = r.saetze[0];
  assert.deepEqual([a.auftragsnummer, a.netto_summe, a.mwst_summe, a.brutto_summe, a.notizen, a.status], ['A-2026-0184', 284500, 54055, 338555, 'Stand: 62 %', 'beauftragt']);
  assert.ok(!('belegart' in a), 'Filterfeld geht nicht in die Datenbank');
  const idx = baueKundenIndex([{ id: 'k2', kundennummer: 'K-1002' }]);
  assert.equal(verknuepfeKunde(a, z.kundeVerweis, idx).satz.kontakt_id, 'k2');
  const mitBrutto = pruefeAlles('auftraege', { T: 'titel', N: 'netto_summe', B: 'brutto_summe' }, ['T', 'N', 'B'], [['X', '100,00', '107,00']], { ziel: z, heute: HEUTE });
  assert.equal(mitBrutto.saetze[0].brutto_summe, 107, 'geliefertes Brutto wird nicht ueberschrieben');
});

// --- Eingangsrechnungen ------------------------------------------------------

test('Eingangsrechnungen: erkannt an Lieferant UND Belegnummer, Betraege ergaenzt', () => {
  const z = ziel('eingangsbelege');
  assert.deepEqual(erkennungsFelder(z), ['lieferant+belegnummer']);
  assert.deepEqual(erkennungsSpalten(erkennungsFelder(z)), ['lieferant', 'belegnummer']);
  const idx = baueBestandIndex([{ id: 'e1', lieferant: 'Sütterlin', belegnummer: 'SE-1' }, { id: 'e2', lieferant: 'Rehbein', belegnummer: null }], erkennungsFelder(z));
  assert.equal(findeImBestand({ lieferant: 'sütterlin', belegnummer: 'se-1' }, erkennungsFelder(z), idx), 'e1');
  assert.equal(findeImBestand({ lieferant: 'Rehbein', belegnummer: 'SE-1' }, erkennungsFelder(z), idx), undefined, 'gleiche Nummer, anderer Lieferant = neu');
  assert.deepEqual(schluesselWerte({ lieferant: 'A', belegnummer: '' }, z), [], 'ohne Nummer keine Erkennung');
  assert.equal(findeImBestand({ lieferant: 'Rehbein', belegnummer: '' }, erkennungsFelder(z), idx), undefined, 'halbe Kombination erkennt nichts');
  const { r, b } = datei('Lieferant;Rechnungsnr;Datum;Netto;USt %;Brutto;Bezahlt am;IBAN\r\nSütterlin;SE-1;01.09.2026;100,00;19;;05.09.2026;DE00\r\nRehbein;R-7;02.09.2026;;;119,00;;\r\nSütterlin;SE-1;01.09.2026;100,00;19;;;\r\n', 'eingangsbelege');
  assert.equal(b.eintraege.find((e) => e.spalte === 'IBAN').art, 'nicht');
  assert.deepEqual([r.saetze[0].ust_betrag, r.saetze[0].brutto, r.saetze[0].status], [19, 119, 'erfasst']);
  assert.deepEqual([r.saetze[1].netto, r.saetze[1].ust_betrag, r.saetze[1].ust_satz], [100, 19, 19]);
  assert.equal(r.dubletten_in_datei, 1);
  assert.ok(!ziel('eingangsbelege').felder.some((f) => ['datei_pfad', 'datev_konto', 'kennzeichen'].includes(f.key)));
});

// --- Vertraege, Anlagen, Fuhrpark, Projekte ----------------------------------

test('Laufende Kosten: Intervall uebersetzt, Command-Center-Spalten nie angeboten', () => {
  const keys = ziel('vertraege').felder.map((f) => f.key);
  for (const weg of ['anbieter', 'art', 'betrag', 'intervall', 'absetzbar_prozent', 'start_datum', 'ende_datum', 'notiz', 'aktiv']) assert.ok(!keys.includes(weg), weg);
  const { r, b } = datei('Bezeichnung;Kategorie;Vertragspartner;Beitrag;Zahlweise;Kündigungsfrist;Verlängert sich;Ende\r\nBetriebshaftpflicht;Versicherung;Allianz;1.200,00;jährlich;90;ja;31.12.2026\r\nHallenmiete;Miete;Immo KG;2.500,00;mtl;90;nein;\r\nLeasing Sprinter;Leasing;Bank;450,00;alle 2 Wochen;;;\r\n', 'vertraege');
  assert.equal(b.verschluckt, 0);
  assert.deepEqual([r.saetze[0].kosten_intervall, r.saetze[0].auto_verlaengerung, r.saetze[0].kuendigungsfrist_tage], ['jaehrlich', true, 90]);
  assert.equal(r.saetze[1].kosten_intervall, 'monatlich');
  assert.equal(r.saetze[2].kosten_intervall, 'monatlich');
  assert.match(r.saetze[2].notizen, /Intervall im Altsystem: alle 2 Wochen/);
});

test('Anlagen: ohne Nutzungsdauer ehrliche Warnung, Abgang ohne Datum gemeldet', () => {
  const { r } = datei('Bezeichnung;Anschaffung;Anschaffungskosten;ND;Status\r\nCNC-Fräse;01.02.2024;48.000,00;;aktiv\r\nAlter Bus;01.01.2018;30.000,00;6;verkauft\r\nDrucker;01.01.2025;300,00;0;aktiv\r\n', 'anlagegueter');
  assert.ok(!('nutzungsdauer_jahre' in r.saetze[2]), 'Nutzungsdauer 0 geht nicht in die Datenbank');
  assert.ok(!('nutzungsdauer_jahre' in r.saetze[0]));
  assert.ok(r.warnungen.some((w) => /Nutzungsdauer/.test(w.meldung)));
  assert.equal(r.saetze[1].status, 'verkauft');
  assert.ok(r.warnungen.some((w) => /Abgangsdatum/.test(w.meldung)));
});

test('Fuhrpark: Kennzeichen und Fristen, Erkennung ueber Kennzeichen', () => {
  const { r, b, z } = datei('Fahrzeug;Kennzeichen;FIN;EZ;TÜV;UVV;km-Stand;Kraftstoff\r\nVW Crafter;BB-EH 101;WV1ZZZ;15.03.2021;03/2027;30.06.2026;84.500;Diesel\r\n', 'fahrzeuge');
  assert.equal(b.verschluckt, 0);
  const f = r.saetze[0];
  assert.deepEqual([f.kennzeichen, f.fahrgestellnummer, f.erstzulassung, f.uvv_bis, f.km_stand, f.aktiv], ['BB-EH 101', 'WV1ZZZ', '2021-03-15', '2026-06-30', 84500, true]);
  assert.deepEqual(erkennungsFelder(z), ['kennzeichen', 'fahrgestellnummer']);
});

test('Projekte: Status und Prioritaet auf die Listen, alter Wert in der Beschreibung', () => {
  const { r } = datei('Projekt;Status;Prio;Start;Ende;Budget;Bauleiter\r\nNeubau Haus C;in Arbeit;sehr hoch;15.06.2026;18.12.2026;284.500,00;T. Haldenberg\r\nAltbau;wartet auf Freigabe;;;;;\r\n', 'projekte');
  assert.deepEqual([r.saetze[0].status, r.saetze[0].prioritaet, r.saetze[0].budget, r.saetze[0].verantwortlich], ['aktiv', 'dringend', 284500, 'T. Haldenberg']);
  assert.equal(r.saetze[1].status, 'aktiv');
  assert.match(r.saetze[1].beschreibung, /Status im Altsystem: wartet auf Freigabe/);
  assert.equal(r.saetze[1].prioritaet, 'normal');
});

// --- Seite & SQL -------------------------------------------------------------

test('Import-Seite: zusammengesetzte Erkennung, Sperren je Ziel, „nur Chef"', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes('erkennungsSpalten(erkennung).join'));
  assert.ok(s.includes('sperrGrund(spalte, ziel)'));
  assert.ok(s.includes('eigeneSpalten(datei.kopf, datei.zeilen, mapping, ziel)'));
  assert.ok(s.includes('const bereitKatalog = mitKatalog && !(z.nurChef && binMitarbeiter);'), 'Paket 137: umbenannt, Freigabe kommt dazu');
  assert.deepEqual(fuerDatenbank({ a: 1, __x: 2 }), { a: 1 });
});

test('SQL p126: nur die Funktion, 16 Tabellen, nichts Destruktives', () => {
  const code = lies('supabase-sql/p126-import-schritt3b.sql').split('\n').filter((z) => !z.trim().startsWith('--')).join('\n').toLowerCase();
  for (const t of ['mitarbeiter', 'auftraege', 'projekte', 'vertraege', 'anlagegueter', 'fahrzeuge', 'eingangsbelege', 'leads', 'kontakte']) assert.ok(code.includes(`'${t}'`), t);
  assert.ok(code.includes('security invoker') && code.includes('from anon'));
  assert.ok(!/\b(drop|delete|truncate|alter table|create policy)\b/.test(code));
});
