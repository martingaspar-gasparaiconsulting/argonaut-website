// Umzug Schritt 3, Teil 1 (27.09.2026) · Paket 125 — weitere Ziele im Motor
// (Leistungskatalog, Wartungsvertraege, Verkaufschancen, Aktivitaeten, Leads),
// Verknuepfung mit dem Kunden, Werbe-Einwilligungen gesperrt, Kunden-Akte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, baueKundenIndex, findeKunde, kundeAusText,
  verknuepfeKunde, fuerDatenbank, istEinwilligungSpalte, sperrGrund, GRUND, NICHT, EIGEN, MOTOR_TABELLEN,
} from '../out/importMotor.js';
import { pruefeAlles, leseCsv, zielDef, ZIELE, baueMustervorlage, errateMapping } from '../out/importParser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = new Date(Date.UTC(2026, 8, 27));

/** Feldkatalog, wie ihn die Datenbank nach SQL p125 liefert (am Code belegt). */
function db() {
  const raus = [];
  const add = (t, cols) => cols.forEach((c) => raus.push({
    tabelle: t, spalte: c, pflicht: false, generiert: false,
    datentyp: c === 'id' || (c.endsWith('_id') && c !== 'ust_id') ? 'uuid'
      : /_am$/.test(c) ? 'date'
        : /(wert|betrag|preis|satz|monate|tage|wahrscheinlichkeit|standard_wert|summe|minuten|netto)/.test(c) ? 'numeric'
          : c === 'aktiv' ? 'boolean' : 'text',
  }));
  add('rechnungen', ['id', 'owner_user_id', 'rechnungsnummer', 'titel', 'kontakt_id', 'firma_id', 'rechnungsdatum', 'faelligkeitsdatum', 'netto_summe', 'mwst_summe', 'brutto_summe', 'bezahlter_betrag', 'zahlungsstatus', 'notizen']);
  add('leistungskatalog', ['id', 'owner_user_id', 'bezeichnung', 'kuerzel', 'kategorie', 'erfassungsart', 'standard_wert', 'aw_minuten', 'einheit', 'einheitspreis_netto', 'stundensatz_netto', 'festpreis_netto', 'mwst_satz', 'notiz', 'aktiv']);
  add('wartungsvertraege', ['id', 'owner_user_id', 'titel', 'kunde_name', 'kontakt_id', 'vertragsnummer', 'status', 'beginn_am', 'intervall_monate', 'letzte_wartung_am', 'naechste_faelligkeit_am', 'erinnerung_tage_vorher', 'betrag_netto', 'mwst_satz', 'beschreibung', 'notiz', 'archiviert', 'erinnerung_gesendet_am']);
  add('verkaufschancen', ['id', 'owner_user_id', 'titel', 'kontakt_id', 'firma_id', 'phase', 'wert', 'wahrscheinlichkeit', 'erwartetes_abschlussdatum', 'notizen']);
  add('kontakt_aktivitaeten', ['id', 'owner_user_id', 'kontakt_id', 'typ', 'inhalt', 'ki_generiert', 'aktivitaet_am']);
  add('leads', ['id', 'owner_user_id', 'name', 'email', 'telefon', 'dienstleistung', 'nachricht', 'plz', 'ort', 'ist_bestand', 'werbung_einwilligung', 'einwilligung_am', 'status', 'quelle', 'stufe', 'score', 'kontakt_id']);
  return raus;
}
const DB = db();
const ziel = (k) => katalogFuerZiel(k, DB).ziel;

/** Wie Haldenberg 01-Kunden (Auszug). */
const KUNDEN = [
  { id: 'k1', kundennummer: 'K-1001', firma: 'Hausverwaltung Seeblick GmbH', email: 'verwaltung@seeblick-hv.example', firma_id: 'f1' },
  { id: 'k8', kundennummer: 'K-1008', firma: 'Schreinerei Bachmeier GmbH', email: 'info@bachmeier.example' },
  { id: 'k9', kundennummer: 'K-10080', firma: 'Andere GmbH' },
  { id: 'p1', kundennummer: 'K-2004', vorname: 'Ayse', nachname: 'Özkan', email: 'oezkan@web.example' },
  { id: 'd1', firma: 'Doppelt GmbH' }, { id: 'd2', firma: 'Doppelt GmbH' },
];
const IDX = baueKundenIndex(KUNDEN);

function datei(text, zielKey) {
  const t = leseCsv(text);
  const z = ziel(zielKey);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { t, z, map, r: pruefeAlles(zielKey, map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE }), b: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

// --- Katalog -----------------------------------------------------------------

test('die fuenf neuen Ziele gibt es nur mit Feldkatalog (SQL p125)', () => {
  for (const k of ['leistungskatalog', 'wartungsvertraege', 'verkaufschancen', 'kontakt_aktivitaeten', 'leads']) {
    assert.ok(MOTOR_TABELLEN.includes(k), k);
    assert.equal(zielDef(k).nurMitKatalog, true, k);
    assert.equal(katalogFuerZiel(k, null).ziel.felder.length, 0, `${k} ohne Katalog nicht anbieten`);
    assert.ok(katalogFuerZiel(k, DB).ziel.felder.length > 3, `${k} mit Katalog`);
  }
  // Selbst verwaltete Spalten tauchen nie als Feld auf
  const leads = ziel('leads').felder.map((f) => f.key);
  for (const weg of ['werbung_einwilligung', 'einwilligung_am', 'ist_bestand', 'stufe', 'score', 'kontakt_id']) assert.ok(!leads.includes(weg), weg);
});

test('jede Mustervorlage der neuen Ziele wird vom Motor wieder erkannt', () => {
  for (const k of ['leistungskatalog', 'wartungsvertraege', 'verkaufschancen', 'kontakt_aktivitaeten', 'leads', 'rechnungen']) {
    const csv = baueMustervorlage(k).replace(/^﻿/, '');
    const [kopf, ...zeilen] = csv.trim().split('\r\n').map((z) => z.split(';'));
    assert.equal(zeilen.length, 3, k);
    const map = errateMapping(kopf, k);
    for (const f of zielDef(k).felder.filter((x) => !x.nichtInVorlage)) {
      assert.ok(Object.values(map).includes(f.key), `${k}: ${f.key} nicht wiedererkannt`);
    }
  }
});

// --- Leistungskatalog --------------------------------------------------------

test('Leistungskatalog (Haldenberg 05): Einheit bestimmt Erfassungsart, Preis wird Stundensatz oder Einheitspreis', () => {
  const { r, b } = datei('﻿Bezeichnung;Kategorie;Einheit;Standardwert;Preis\r\nMontagestunde Geselle;Arbeitszeit;Std;1;68,00\r\nSteckdose setzen;Installation;Stück;1;24,50\r\nKabelkanal;Installation;lfm;1;18,90\r\nPrüfung je Gerät;Prüfung;Min;6;4,20\r\nInspektion;Werkstatt;AW;10;9,50\r\n', 'leistungskatalog');
  assert.equal(b.verschluckt, 0);
  assert.equal(b.eigen, 0);
  const [std, stk, lfm, min, aw] = r.saetze;
  assert.deepEqual([std.erfassungsart, std.stundensatz_netto, std.einheit], ['stunden', 68, undefined]);
  assert.deepEqual([stk.erfassungsart, stk.einheitspreis_netto, stk.einheit], ['stueck', 24.5, 'Stück']);
  assert.deepEqual([lfm.erfassungsart, lfm.einheit], ['stueck', 'lfm']);
  assert.deepEqual([min.erfassungsart, min.standard_wert, min.stundensatz_netto], ['minuten', 6, 4.2]);
  assert.deepEqual([aw.erfassungsart, aw.aw_minuten], ['aw', 6]);
  assert.ok(!('preis' in std), 'virtuelles Preisfeld geht nie in die Datenbank');
  assert.equal(std.mwst_satz, 19);
  assert.equal(std.aktiv, true);
});

test('Leistungskatalog: unlesbarer Preis -> Zeile faellt mit Grund raus (Geldfeld)', () => {
  const { r } = datei('Bezeichnung;Einheit;Preis\r\nA;Std;ca. 70\r\n', 'leistungskatalog');
  assert.equal(r.gut, 0);
  assert.match(r.fehler[0].meldung, /kein lesbarer Betrag/);
});

// --- Wartungsvertraege -------------------------------------------------------

test('Wartungsvertraege (Haldenberg 12): alle Spalten in Feldern, Status, Kunde am Namen', () => {
  const { r, b, z } = datei('﻿titel;kunde_name;vertragsnummer;status;beginn_am;intervall_monate;letzte_wartung_am;erinnerung_tage_vorher;betrag_netto;mwst_satz;beschreibung;notiz\r\nPrüfung ortsveränderliche Geräte;Hausverwaltung Seeblick GmbH;W-0060;aktiv;2021-09-05;6;2026-08-23;30;3.840,00;19;Wiederkehrende Prüfung laut Vertrag;\r\nWartung Ladeinfrastruktur;Unbekannt KG;W-0061;gekündigt;2023-07-18;24;2026-05-31;30;2.280,00;19;;\r\n', 'wartungsvertraege');
  assert.deepEqual([b.feld, b.eigen, b.nicht], [12, 0, 0]);
  assert.equal(r.saetze[0].betrag_netto, 3840);
  assert.equal(r.saetze[1].status, 'gekuendigt');
  const v0 = verknuepfeKunde(r.saetze[0], z.kundeVerweis, IDX);
  assert.equal(v0.satz.kontakt_id, 'k1');
  assert.equal(v0.satz.kunde_name, 'Hausverwaltung Seeblick GmbH', 'der Name bleibt als Text stehen');
  const v1 = verknuepfeKunde(r.saetze[1], z.kundeVerweis, IDX);
  assert.equal(v1.treffer.art, 'keiner');
  assert.equal(v1.satz.kontakt_id, undefined);
});

// --- Verkaufschancen ---------------------------------------------------------

test('Verkaufschancen (Haldenberg 09): Nummer vor Name, Ansprechpartner in die Notizen, Phase', () => {
  const { r, b, map, z } = datei('﻿Titel;Kunde;Kundennummer;Ansprechpartner;Phase;Wert netto;Wahrscheinlichkeit %;Abschluss erwartet;Notizen\r\nLED Halle;Schreinerei Bachmeier GmbH;K-1008;Dieter Leibfried;erstkontakt;128.000,00;10;22.01.2027;\r\nWallbox;Doppelt GmbH;;;Closed Won;6.400,00;0,5;;alt\r\nPV;Irgendwer;K-9999;;Pitch;1.000,00;;;\r\n', 'verkaufschancen');
  assert.equal(map['Kunde'], 'kunde');
  assert.equal(map['Kundennummer'], 'kunde_nummer');
  assert.equal(b.verschluckt, 0);
  const [a, w, pv] = r.saetze;
  assert.equal(a.notizen, 'Ansprechpartner: Dieter Leibfried');
  assert.equal(a.wert, 128000);
  assert.equal(w.phase, 'gewonnen');
  assert.equal(w.wahrscheinlichkeit, 50, '0,5 wird 50 %');
  assert.equal(pv.phase, 'erstkontakt');
  assert.match(pv.notizen, /Phase im Altsystem: Pitch/);
  const va = verknuepfeKunde(a, z.kundeVerweis, IDX);
  assert.deepEqual([va.satz.kontakt_id, va.treffer.ueber], ['k8', 'nummer']);
  assert.equal(verknuepfeKunde(w, z.kundeVerweis, IDX).treffer.art, 'mehrdeutig', 'zwei gleichnamige Firmen -> nicht verknuepfen');
  const vpv = verknuepfeKunde(pv, z.kundeVerweis, IDX);
  assert.equal(vpv.treffer.art, 'keiner');
  assert.ok(!('__kunde' in vpv.satz) && !('__kunde2' in vpv.satz), 'Hilfsfelder nie in die Datenbank');
  // Nummer unbekannt, Name bekannt -> ueber den Namen verknuepft
  const zweit = verknuepfeKunde({ titel: 'X', __kunde: 'K-9999', __kunde2: 'Schreinerei Bachmeier GmbH' }, z.kundeVerweis, IDX);
  assert.deepEqual([zweit.satz.kontakt_id, zweit.treffer.ueber], ['k8', 'name']);
  const r2 = pruefeAlles('verkaufschancen', { T: 'titel', K: 'kunde', N: 'kunde_nummer' }, ['T', 'K', 'N'], [['X', 'Schreinerei Bachmeier GmbH', 'K-9999']], { ziel: z, heute: HEUTE });
  assert.equal(verknuepfeKunde(r2.saetze[0], z.kundeVerweis, IDX).satz.kontakt_id, 'k8');
});

// --- Aktivitaeten ------------------------------------------------------------

test('Aktivitaeten (Haldenberg 10): Art uebersetzt, Bearbeiter und Wiedervorlage im Text', () => {
  const { r, b } = datei('﻿Datum;Kundennummer;Kunde;Art;Betreff;Bearbeiter;Wiedervorlage\r\n22.09.2026;K-1001;Hausverwaltung Seeblick GmbH;Anruf;Interesse an Wallbox;Sophie Brandl;\r\n28.08.2026;K-1008;Schreinerei Bachmeier GmbH;Angebot nachgefasst;Wartungstermin bestätigt;Andrea Haldenberg;22.10.2026\r\n01.09.2026;;;E-Mail;Rückfrage;;\r\n03.09.2026;K-1001;;Termin vor Ort;Aufmaß;;\r\n', 'kontakt_aktivitaeten');
  assert.equal(b.verschluckt, 0);
  assert.equal(b.eigen, 0);
  const [anruf, nachgefasst, mail, termin] = r.saetze;
  assert.deepEqual([anruf.typ, anruf.aktivitaet_am, anruf.inhalt], ['anruf', '2026-09-22', 'Interesse an Wallbox\nBearbeiter: Sophie Brandl']);
  assert.equal(nachgefasst.typ, 'notiz');
  assert.match(nachgefasst.inhalt, /Wiedervorlage: 22\.10\.2026/);
  assert.match(nachgefasst.inhalt, /Art im Altsystem: Angebot nachgefasst/);
  assert.equal(mail.typ, 'email');
  assert.ok(!/Art im Altsystem/.test(mail.inhalt), 'E-Mail ist nur anders geschrieben, kein fremder Wert');
  assert.equal(termin.typ, 'termin');
  assert.equal(zielDef('kontakt_aktivitaeten').kundeVerweis.pflicht, true, 'ohne Kunden keine Aktivitaet');
  assert.equal(verknuepfeKunde(mail, zielDef('kontakt_aktivitaeten').kundeVerweis, IDX).treffer.art, 'keiner');
});

// --- Leads -------------------------------------------------------------------

test('Leads (Haldenberg 08): Name zusammengesetzt, Ort geteilt, Status mit altem Wert, nichts verschluckt', () => {
  const { r, b, map } = datei('﻿Lead-Nr.;Eingang am;Firma;Vorname;Nachname;E-Mail;Telefon;Ort;Anliegen;Quelle;Budget (geschätzt);Status;Newsletter\r\nLD-2601;21.09.2026;;Georg;Faulhaber;georg@x.example;0151 3118925;71116 Gärtringen;PV-Anlage mit Speicher;Empfehlung;24.000,00;termin vereinbart;ja\r\nLD-2602;17.09.2026;Bäckerei Rapp;Sven;;sven@x.example;;Herrenberg;Wallbox;;;kein Bedarf;\r\n', 'leads');
  assert.equal(map['Newsletter'], NICHT, 'Werbe-Einwilligung gesperrt');
  assert.equal(b.eintraege.find((e) => e.spalte === 'Newsletter').grund, GRUND.einwilligung);
  assert.equal(b.verschluckt, 0);
  assert.equal(b.eigen, 0);
  const [g, s] = r.saetze;
  assert.equal(g.name, 'Georg Faulhaber');
  assert.deepEqual([g.plz, g.ort], ['71116', 'Gärtringen']);
  assert.equal(g.status, 'offen');
  assert.equal(g.nachricht, 'Lead-Nr.: LD-2601\nEingang am: 21.09.2026\nBudget: 24.000,00\nStatus im Altsystem: termin vereinbart');
  assert.equal(g.quelle, 'Empfehlung');
  assert.equal(s.name, 'Sven · Bäckerei Rapp');
  assert.equal(s.status, 'verloren');
  assert.equal(s.quelle, 'Import', 'ohne Quelle: Import');
  assert.ok(!('werbung_einwilligung' in g));
});

test('Werbe-Einwilligungen werden erkannt — in jedem Ziel gesperrt', () => {
  for (const ja of ['Accepts Email Marketing', 'Newsletter', 'Werbe-Einwilligung', 'Einwilligung Werbung', 'Opt-in', 'Double Opt-In', 'Marketing Einwilligung']) {
    assert.ok(istEinwilligungSpalte(ja), ja);
    assert.equal(sperrGrund(ja), GRUND.einwilligung, ja);
  }
  for (const nein of ['Quelle', 'Marketingkanal', 'E-Mail', 'Status']) assert.equal(istEinwilligungSpalte(nein), false, nein);
  const k = katalogFuerZiel('kontakte', null).ziel;
  assert.equal(vorschlagMapping(['E-Mail', 'Accepts Email Marketing'], [['a@b.de', 'yes']], k)['Accepts Email Marketing'], NICHT);
  assert.equal(vorschlagMapping(['E-Mail', 'Kundengruppe'], [['a@b.de', 'A']], k)['Kundengruppe'], EIGEN);
});

// --- Kunde finden ------------------------------------------------------------

test('Kunde finden: Nummer, E-Mail, genauer Name — mehrdeutig verknuepft nichts', () => {
  assert.deepEqual(findeKunde('k-1001', IDX), { art: 'gefunden', id: 'k1', firmaId: 'f1', ueber: 'nummer' });
  assert.equal(findeKunde('OEZKAN@web.example', IDX).id, 'p1');
  assert.equal(findeKunde('Ayse Özkan', IDX).id, 'p1');
  assert.equal(findeKunde('Özkan Ayse', IDX).id, 'p1');
  assert.equal(findeKunde('schreinerei bachmeier gmbh', IDX).id, 'k8');
  assert.equal(findeKunde('Schreinerei Bachmeier', IDX).art, 'keiner', 'kein ungefaehrer Treffer');
  assert.deepEqual(findeKunde('Doppelt GmbH', IDX), { art: 'mehrdeutig', anzahl: 2 });
  assert.equal(findeKunde('', IDX).art, 'keiner');
});

test('Kundennummer im Freitext: nur ganze, bekannte Nummern, nur eine', () => {
  assert.equal(kundeAusText(['Kunde K-1008 Schreinerei Bachmeier GmbH · Mahnstufe 1'], IDX).id, 'k8');
  assert.equal(kundeAusText(['Kunde K-10080'], IDX).id, 'k9', 'K-1008 steckt in K-10080 — trotzdem nur der genaue Treffer');
  assert.equal(kundeAusText(['K-1008 und K-1001'], IDX).art, 'mehrdeutig');
  assert.equal(kundeAusText(['Kunde K-9999'], IDX).art, 'keiner');
  assert.equal(kundeAusText(['Nichts hier'], baueKundenIndex([])).art, 'keiner');
});

test('Offene Posten (Haldenberg 04): Kunde steht nur in den Notizen -> trotzdem verknuepft, Firma dazu', () => {
  const { r, z } = datei('﻿Rechnungsnummer;Titel;Rechnungsdatum;Fällig am;Netto;MwSt;Brutto;Bereits bezahlt;Status;Notizen\r\nR-2026-0412;Schreinerei Bachmeier GmbH — Elektroarbeiten;12.04.2026;12.05.2026;6.890,00;1.309,10;8.199,10;0,00;ueberfaellig;Kunde K-1008 Schreinerei Bachmeier GmbH · Mahnstufe 1\r\nR-2026-0413;Wartung;01.05.2026;31.05.2026;100,00;19,00;119,00;0,00;offen;Kunde K-1001\r\n', 'rechnungen');
  const v = r.saetze.map((s) => verknuepfeKunde(s, z.kundeVerweis, IDX));
  assert.equal(v[0].satz.kontakt_id, 'k8');
  assert.deepEqual([v[1].satz.kontakt_id, v[1].satz.firma_id], ['k1', 'f1']);
  assert.ok(ziel('rechnungen').felder.some((f) => f.key === 'kunde'), 'Kunde-Spalte waehlbar');
  assert.deepEqual(fuerDatenbank({ a: 1, __kunde: 'x' }), { a: 1 });
});

// --- Seiten ------------------------------------------------------------------

test('Import-Seite: Kunden laden und verknuepfen, Pflicht-Kunde, Faelligkeit, gesperrte Karten', () => {
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(s.includes("supabase.from('kontakte').select(spalten)"), 'Kunden seitenweise laden');
  assert.ok(s.includes('verknuepfeKunde(satzRoh, ziel.kundeVerweis, kundenIndex)'));
  assert.ok(s.includes('if (ziel.kundeVerweis.pflicht)'), 'ohne Kunde keine Aktivitaet');
  assert.ok(s.includes('naechsteFaelligkeitString('), 'Wartung: naechste Faelligkeit wie im Modul');
  assert.ok(s.includes('const mitKatalog = !z.nurMitKatalog'), 'neue Ziele erst mit Katalog');
  assert.ok(s.includes('let satz0 = fuerDatenbank(satzRoh);'), 'Hilfsfelder nie in die Datenbank');
  assert.ok(s.includes('sperrGrund(spalte, ziel)'), 'Bank und Einwilligung gesperrt');
});

test('Kunden-Akte zeigt Kundennummer, Mobil, Website, USt-IdNr., Anrede — nur wenn die Spalte da ist', () => {
  const s = lies('app/dashboard/crm/[id]/page.tsx');
  assert.ok(s.includes("{ key: 'kundennummer', label: 'Kundennummer' }"));
  assert.ok(s.includes('IMPORT_FELDER.filter((f) => f.key in kontakt)'), 'Anzeige nur mit Spalte');
  assert.ok(s.includes('IMPORT_FELDER.filter((f) => f.key in form.extra)'), 'Bearbeiten nur mit Spalte');
  assert.ok(s.includes('<AdressBlock art="kontakt"'), 'Adresse steht weiter im Adressblock');
});

test('Wartung: neue Vertraege gehoeren dem Betrieb, Aendern laesst den Besitzer stehen', () => {
  const s = lies('app/dashboard/wartung/page.tsx');
  assert.ok(s.includes("...(form.id ? {} : { owner_user_id: besitzer ?? uid })"));
  assert.ok(s.includes("supabase.rpc('mein_chef_id')"));
});

test('SQL p125: nur die Funktion, neun Tabellen, anon gesperrt, nichts Destruktives', () => {
  const q = lies('supabase-sql/p125-import-schritt3.sql');
  const code = q.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n').toLowerCase();
  for (const t of ['kontakte', 'lieferanten', 'artikel', 'rechnungen', 'leistungskatalog', 'wartungsvertraege', 'verkaufschancen', 'kontakt_aktivitaeten', 'leads']) {
    assert.ok(code.includes(`'${t}'`), t);
  }
  assert.ok(code.includes('security invoker') && code.includes('from anon'));
  assert.ok(!/\b(drop|delete|truncate|alter table|create policy|drop policy)\b/.test(code.replace('create or replace function', '')), 'nur die Funktion');
  assert.ok(ZIELE.length >= 9);
});
