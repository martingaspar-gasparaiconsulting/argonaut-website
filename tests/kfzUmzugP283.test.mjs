// tests/kfzUmzugP283.test.mjs — Paket 283 (09.10.2026) · K16 Umzug und Schnittstellen Kfz-Handel:
// Fahrzeugbestand im Import-Center (eigene Liste + mobile.de-Upload-Datei), Kfz-Altsysteme,
// Bewertung DAT/Schwacke am Fahrzeug (im eigenen Konto abgefragt, ARGONAUT vermittelt nur).
// Katalog nach dem Schema aus Paket 259/261/274/283 (Test-Datenbank 09.10.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pruefeAlles, leseCsv, zielDef, baueMustervorlage, GELDFELDER } from '../out/importParser.js';
import { katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, MOTOR_TABELLEN } from '../out/importMotor.js';
import { importErlaubt } from '../out/importRechte.js';
import { importQuellen } from '../out/importKatalog.js';
import { ALTSYSTEME, altsystem, anleitung, ALTSYSTEM_GRUPPEN } from '../out/altsysteme.js';
import { istMobileDe, mobileDeTabelle, monatJahr, besteuerungLesen, vorschadenLesen, ausstattungListe, finBereinigt, kfzBestandNacharbeit, MOBILE_DE_MIN_FELDER } from '../out/kfzImport.js';
import { bewertungEingabe, bewertungLage, finFuerAbfrage, bewertungUrlGueltig, BEWERTUNG_LEER } from '../out/kfzBewertung.js';
import { partner, PARTNER } from '../out/partnerAnbindung.js';
import { bereich, anbieterVon } from '../out/konnektoren.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-10-09';
const HEUTE_DATE = new Date(2026, 9, 9, 12, 0, 0);

const SCHEMA = 'id uuid NN =d | owner_user_id uuid NN | interne_nr text | status text NN =d | sparte text | marke text | modell text | variante text | fin text | kennzeichen text | erstzulassung date | km_stand integer | leistung_kw integer | kraftstoff text | farbe text | farbcode text | standort_id uuid | eingang_am date =d | verkauft_am date | ek_netto numeric | vk_brutto numeric | besteuerung text | inseriert boolean NN =d | notiz text | erstellt_von uuid =d | erstellt_am timestamp with time zone NN =d | aktualisiert_am timestamp with time zone NN =d | ausstattung ARRAY NN =d | polster text | vorbesitzer integer | hu_bis date | vorschaden text | vorschaden_text text | inserat_titel text | inserat_text text | verbrauch_komb numeric | verbrauch_einheit text | co2_g_km integer | co2_klasse text | historie_url text | historie_anbieter text | historie_am date | historie_oeffentlich boolean NN =d | bewertung_anbieter text | bewertung_ek numeric | bewertung_vk numeric | bewertung_am date | bewertung_url text';
const DB = SCHEMA.split(' | ').map((t) => {
  const [spalte, ...rest] = t.split(' ');
  const r = rest.join(' ');
  return { tabelle: 'kfz_bestand', spalte, datentyp: r.replace(/ NN.*$/, '').replace(/ =.*$/, ''), pflicht: / NN/.test(r) && !/=/.test(r) };
});
function durch(text, kopfZeilen) {
  const z = katalogFuerZiel('kfz_bestand', DB).ziel;
  const t = kopfZeilen ?? leseCsv(text);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { z, t, map, b: pruefeAlles('kfz_bestand', map, t.kopf, t.zeilen, { ziel: z, heute: HEUTE_DATE }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}

// mobile.de-Datensatz nach Handbuch (Index ab 0), alle uebrigen Felder leer
function mobilZeile(w) {
  const z = Array.from({ length: 160 }, () => '');
  for (const [i, v] of Object.entries(w)) z[Number(i)] = String(v);
  return z.map((x) => (/[;"]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x)).join(';');
}
const M1 = mobilZeile({ 1: 'F-2001', 2: 'Limousine', 3: 'Volkswagen', 4: 'Golf', 5: 96, 6: '08.2027', 8: '03.2021', 9: 38500, 10: '23490.00', 11: 1, 14: 'wvwzzzcdzmw123456', 15: 0, 16: 'Mondsteingrau', 17: 1, 20: 0, 21: 0, 23: '21900', 25: 'Scheckheft; Nichtraucher', 32: 1, 33: 1, 37: 1, 109: 1, 110: 1, 158: 1 });
const M2 = mobilZeile({ 1: 'F-2002', 2: 'Kombi', 3: 'BMW', 4: '320d Touring', 5: 140, 8: '07.2019', 9: 112000, 10: '25990', 11: 0, 14: 'WBA8E1105KB12345', 15: 1, 16: 'Schwarz', 21: 0, 29: 19, 61: 6, 109: 2, 110: 3 });
const M3 = mobilZeile({ 1: 'F-2003', 2: 'Kombi', 3: 'Skoda', 4: 'Octavia', 9: 15, 10: '31900', 11: 0, 15: 0, 21: 1, 109: 10 });

test('Ziel Fahrzeugbestand: im Motor, im Katalog, nur mit Katalog, Bereich KFZ; Mustervorlage mit gueltiger FIN', () => {
  assert.ok(MOTOR_TABELLEN.includes('kfz_bestand'));
  const z = zielDef('kfz_bestand');
  assert.equal(z.tabelle, 'kfz_bestand');
  assert.equal(z.nurMitKatalog, true);
  assert.deepEqual(katalogFuerZiel('kfz_bestand', []).ziel.felder, [], 'ohne Katalog nichts anbieten');
  assert.equal(importQuellen().find((q) => q.key === 'kfz_bestand')?.motor, 'kfz_bestand');
  assert.ok(GELDFELDER.includes('ek_netto'), 'unlesbarer Einkaufspreis lehnt die Zeile ab statt 0');
  // Bereich: Mitarbeiter braucht KFZ mit „darf ändern"
  assert.equal(importErlaubt('kfz_bestand', { chef: true, module: [], schreibModule: null }).ok, true);
  assert.equal(importErlaubt('kfz_bestand', { chef: false, module: ['kfz'], schreibModule: ['kfz'] }).ok, true);
  assert.equal(importErlaubt('kfz_bestand', { chef: false, module: ['kfz'], schreibModule: [] }).ok, false);
  assert.equal(importErlaubt('kfz_bestand', { chef: false, module: [], schreibModule: [] }).ok, false);
  // Katalog: ARGONAUT-eigene Werte nicht aus Dateien
  const felder = katalogFuerZiel('kfz_bestand', DB).ziel.felder.map((f) => f.key);
  for (const k of ['historie_url', 'historie_oeffentlich', 'bewertung_ek', 'bewertung_vk', 'inseriert', 'besteuerung', 'standort_id', 'owner_user_id', 'ausstattung']) assert.ok(!felder.includes(k), k);
  for (const k of ['marke', 'fin', 'erstzulassung', 'vk_brutto', 'besteuerung_text', 'ausstattung_text', 'inserat_titel', 'co2_klasse']) assert.ok(felder.includes(k), k);
  // Mustervorlage laeuft ohne Fehler durch
  const muster = baueMustervorlage('kfz_bestand').replace(/^﻿/, '');
  const r = durch(muster);
  assert.equal(r.b.fehler.length, 0, JSON.stringify(r.b.fehler));
  assert.equal(r.b.gut, 3);
  assert.equal(r.bil.verschluckt, 0);
});

test('Eigene Liste: Monat/Jahr, PS -> kW, Standtage, Besteuerung, Status, FIN ungueltig in die Notiz, nichts verschluckt', () => {
  const csv = 'Fahrzeugnummer;Hersteller;Modell;Status;FIN;EZ;Laufleistung;PS;Verkaufspreis;EK;Steuerart;HU;Unfallfrei;Ausstattung;Standtage;Getriebe\n'
    + 'A-1;Audi;A4 Avant;verfügbar;WAUZZZ8K9BA 123456;03/2020;45.000;150;27.890,00;22.100,00;§ 25a;08/27;unfallfrei;Navi, Klima, Navi, AHK;30;Automatik\n'
    + 'A-2;Opel;Corsa;im Zulauf;WOOZZZ12345678901;2023-05;12;75;14.990;;MwSt ausweisbar;;ja;;;Schaltung\n'
    + 'A-3;Ford;Focus;verkauft;;13.2019;-5;;0;;irgendwas;;Hagelschaden;;;\n';
  const r = durch(csv);
  assert.equal(r.map['Fahrzeugnummer'], 'interne_nr');
  assert.equal(r.map['EZ'], 'erstzulassung');
  assert.equal(r.map['PS'], 'leistung_ps');
  assert.equal(r.map['Steuerart'], 'besteuerung_text');
  assert.equal(r.map['Getriebe'], EIGEN, 'unbekannte Spalte -> Eigenes Feld');
  assert.equal(r.bil.verschluckt, 0);
  assert.equal(r.b.fehler.length, 0, JSON.stringify(r.b.fehler));
  const [a, b, c] = r.b.saetze;
  assert.equal(a.fin, 'WAUZZZ8K9BA123456');
  assert.equal(a.erstzulassung, '2020-03-01');
  assert.equal(a.hu_bis, '2027-08-31', 'HU gilt bis Monatsende');
  assert.equal(a.km_stand, 45000);
  assert.equal(a.leistung_kw, 110, '150 PS = 110 kW');
  assert.equal(a.vk_brutto, 27890);
  assert.equal(a.ek_netto, 22100);
  assert.equal(a.besteuerung, '25a');
  assert.equal(a.status, 'bestand');
  assert.equal(a.vorschaden, 'keine_bekannt');
  assert.deepEqual(a.ausstattung, ['Navi', 'Klima', 'AHK']);
  assert.equal(a.eingang_am, '2026-09-09', '30 Standtage vor dem 09.10.');
  for (const k of ['leistung_ps', 'besteuerung_text', 'ausstattung_text', 'standtage', 'zustand']) assert.ok(!(k in a), `Rechenfeld ${k} geht nicht in die Datenbank`);
  // FIN mit O -> nicht gueltig -> Notiz, Zeile bleibt
  assert.equal(b.fin, undefined);
  assert.match(b.notiz, /FIN laut Altsystem: WOOZZZ12345678901/);
  assert.equal(b.status, 'zulauf');
  assert.equal(b.erstzulassung, '2023-05-01');
  assert.equal(b.besteuerung, 'regel');
  assert.equal(b.vorschaden, 'ja');
  // unlesbares Datum, negative km, Preis 0, unklare Besteuerung/Vorschaden
  assert.equal(c.erstzulassung, undefined);
  assert.match(c.notiz, /Erstzulassung laut Altsystem: 13\.2019/);
  assert.match(c.notiz, /Besteuerung laut Altsystem: irgendwas/);
  assert.equal(c.km_stand, undefined);
  assert.equal(c.vk_brutto, undefined, '0 € ist kein Preis');
  assert.equal(c.besteuerung, undefined);
  assert.equal(c.vorschaden, undefined);
  assert.match(c.vorschaden_text, /Laut Altsystem: Hagelschaden/);
  assert.equal(c.status, 'verkauft');
  assert.ok(r.b.warnungen.some((w) => /Verkaufsdatum/.test(w.meldung)));
});

test('Unlesbarer Einkaufspreis: Zeile faellt mit Grund heraus (nie still 0 €)', () => {
  const r = durch('Marke;Modell;EK netto\nVW;Polo;auf Anfrage\nVW;Up;8.000\n');
  assert.equal(r.b.gut, 1);
  assert.equal(r.b.fehler.length, 1);
  assert.match(r.b.fehler[0].meldung, /kein lesbarer Betrag/);
});

test('mobile.de-Datei: erkannt nur bei passendem Aufbau, Felder nach Handbuch, Kopfzeile wird uebersprungen', () => {
  const roh = (text) => { const t = leseCsv(text, ';'); return [t.kopf, ...t.zeilen]; };
  const datei = [M1, M2, M3].join('\r\n') + '\r\n';
  assert.equal(istMobileDe(roh(datei)), true);
  assert.equal(istMobileDe(roh('Marke;Modell;Preis\nVW;Golf;100\n')), false, 'normale Liste');
  assert.equal(istMobileDe(roh([M1, 'kaputt;zeile'].join('\n'))), false, 'zweite Zeile passt nicht -> lieber normale CSV');
  assert.equal(istMobileDe(roh(M1.split(';').slice(0, MOBILE_DE_MIN_FELDER - 1).join(';'))), false, 'zu kurz');
  const kopf = mobilZeile({ 1: 'internal number', 3: 'make', 9: 'kilometre', 11: 'VAT', 15: 'damaged_vehicle' });
  assert.equal(istMobileDe(roh([kopf, M1].join('\n'))), true, 'Kopfzeile davor');

  const m = mobileDeTabelle(roh([kopf, M1, M2, M3].join('\n')));
  assert.equal(m.zeilen.length, 3);
  assert.ok(m.hinweise[0].includes('3 Fahrzeuge'));
  const sp = (z, name) => z[m.kopf.indexOf(name)];
  const [a, b, c] = m.zeilen;
  assert.equal(sp(a, 'Marke'), 'Volkswagen');
  assert.equal(sp(a, 'Verkaufspreis'), '23490,00', 'Punkt als Dezimaltrenner -> Komma, kein Tausender-Raten');
  assert.equal(sp(a, 'Besteuerung'), '§ 25a', 'VAT 1 = nicht ausweisbar');
  assert.equal(sp(b, 'Besteuerung'), 'Regelbesteuerung');
  assert.equal(sp(a, 'Kraftstoff'), 'Benzin');
  assert.equal(sp(b, 'Getriebe'), 'Automatik');
  assert.equal(sp(b, 'Schadstoffklasse'), 'Euro 6');
  assert.equal(sp(b, 'Beschädigtes Fahrzeug'), 'ja');
  assert.equal(sp(a, 'Beschädigtes Fahrzeug'), '', '0 heisst nicht „unfallfrei"');
  assert.equal(sp(a, 'Ausstattung'), 'Klimaanlage, ESP, ABS, Navigationssystem');
  assert.equal(sp(c, 'Zustand'), 'Neufahrzeug');
  assert.equal(sp(c, 'Kraftstoff'), 'Hybrid (Diesel/Elektro)');

  // durch den Motor: alles landet, nichts verschluckt
  const r = durch(null, { kopf: m.kopf, zeilen: m.zeilen });
  assert.equal(r.bil.verschluckt, 0);
  assert.equal(r.map['Verkaufspreis'], 'vk_brutto');
  assert.equal(r.map['Beschädigtes Fahrzeug'], 'vorschaden');
  assert.equal(r.map['Händlerpreis'], EIGEN);
  assert.equal(r.b.fehler.length, 0, JSON.stringify(r.b.fehler));
  const [x, y, w] = r.b.saetze;
  assert.equal(x.fin, 'WVWZZZCDZMW123456', 'klein geschrieben -> bereinigt');
  assert.equal(x.erstzulassung, '2021-03-01');
  assert.equal(x.hu_bis, '2027-08-31');
  assert.equal(x.vk_brutto, 23490);
  assert.equal(x.leistung_kw, 96);
  assert.equal(x.besteuerung, '25a');
  assert.equal(x.vorbesitzer, 1);
  assert.deepEqual(x.ausstattung, ['Klimaanlage', 'ESP', 'ABS', 'Navigationssystem']);
  assert.match(x.notiz, /Scheckheft; Nichtraucher/);
  assert.equal(y.fin, undefined, '16 Zeichen');
  assert.match(y.notiz, /FIN laut Altsystem: WBA8E1105KB12345/);
  assert.equal(y.vorschaden, 'ja');
  assert.equal(y.besteuerung, 'regel');
  assert.match(w.notiz, /Zustand laut Altsystem: Neufahrzeug/);
});

test('Hilfsfunktionen: Monat/Jahr, Besteuerung, Vorschaden, Ausstattung, FIN', () => {
  assert.equal(monatJahr('3/2019', 'anfang', HEUTE), '2019-03-01');
  assert.equal(monatJahr('02.2028', 'ende', HEUTE), '2028-02-29', 'Schaltjahr');
  assert.equal(monatJahr('02/27', 'ende', HEUTE), '2027-02-28');
  assert.equal(monatJahr('15.04.2020', 'anfang', HEUTE), '2020-04-15');
  assert.equal(monatJahr('31.02.2020', 'anfang', HEUTE), null);
  assert.equal(monatJahr('99/50', 'anfang', HEUTE), null);
  assert.equal(monatJahr('05/50', 'anfang', HEUTE), '1950-05-01', 'zweistellig weit in der Zukunft -> 1900er');
  assert.equal(besteuerungLesen('Differenzbesteuert'), '25a');
  assert.equal(besteuerungLesen('MwSt ausweisbar ja'), 'regel');
  assert.equal(besteuerungLesen('MwSt ausweisbar nein'), '25a');
  assert.equal(besteuerungLesen('1'), null, 'nackte 1 wird nicht gedeutet');
  assert.equal(besteuerungLesen(''), null);
  assert.equal(vorschadenLesen('Unfallfrei'), 'keine_bekannt');
  assert.equal(vorschadenLesen('k.A.'), 'unbekannt');
  assert.equal(vorschadenLesen('Delle'), null);
  assert.deepEqual(ausstattungListe('a; b | A\nc'), ['a', 'b', 'c']);
  assert.equal(ausstattungListe(Array.from({ length: 150 }, (_, i) => `M${i}`).join(',')).length, 100);
  assert.equal(finBereinigt('wvw zzz-cdzmw123456'), 'WVWZZZCDZMW123456');
  assert.equal(finBereinigt('WVWZZZCDZMW12345I'), null);
  const w = { vorbesitzer: 120, co2_klasse: 'h', verbrauch_einheit: 'Liter', inserat_titel: 'x'.repeat(130), eingang_am: '2027-01-01', kennzeichen: ' bb  ah 1 ' };
  kfzBestandNacharbeit(w, HEUTE);
  assert.equal(w.vorbesitzer, undefined);
  assert.equal(w.co2_klasse, undefined);
  assert.equal(w.verbrauch_einheit, 'l');
  assert.equal(w.inserat_titel.length, 120);
  assert.equal(w.eingang_am, HEUTE, 'Eingang in der Zukunft -> heute');
  assert.equal(w.kennzeichen, 'BB AH 1');
});

test('Altsysteme: Gruppe Autohaus, mobile.de mit belegter Anleitung, DMS ehrlich „beim Hersteller erfragen"', () => {
  assert.ok(ALTSYSTEM_GRUPPEN.some((g) => g.key === 'kfz'));
  const kfz = ALTSYSTEME.filter((s) => s.gruppe === 'kfz');
  assert.ok(kfz.length >= 5);
  for (const s of kfz) assert.ok(s.ziele.includes('kfz_bestand'), s.key);
  const m = altsystem('mobilede');
  assert.equal(anleitung(m).belegt, true);
  assert.match(m.quelle, /services\.mobile\.de/);
  for (const k of ['locosoft', 'werbas', 'keyloop', 'incadea', 'autoscout24']) assert.equal(anleitung(altsystem(k)).belegt, false, k);
  const seite = lies('app/dashboard/import/page.tsx');
  assert.ok(seite.includes('istMobileDe(') && seite.includes('mobileDeTabelle('), 'Import-Center liest mobile.de-Dateien');
  assert.ok(seite.includes("kfz_bestand: 'Fahrzeugbestand'"));
});

test('Bewertung: Eingabe pruefen, entfernen, Lage zum eigenen Preis, FIN fuer die Abfrage', () => {
  const e = bewertungEingabe({ anbieter: 'dat', ek: '18.450,00', vk: '22.900', am: '2026-10-01', url: '' }, HEUTE);
  assert.ok(e.ok);
  assert.deepEqual(e.felder, { bewertung_anbieter: 'dat', bewertung_ek: 18450, bewertung_vk: 22900, bewertung_am: '2026-10-01', bewertung_url: null });
  assert.deepEqual(bewertungEingabe({ ek: '', vk: ' ' }, HEUTE), { ok: true, felder: BEWERTUNG_LEER });
  assert.equal(bewertungEingabe({ anbieter: 'eurotax', vk: '1000' }, HEUTE).felder.bewertung_anbieter, 'sonstige');
  assert.equal(bewertungEingabe({ vk: '1000' }, HEUTE).felder.bewertung_am, HEUTE, 'ohne Datum: heute');
  assert.equal(bewertungEingabe({ vk: 'viel' }, HEUTE).ok, false);
  assert.equal(bewertungEingabe({ vk: '-5' }, HEUTE).ok, false);
  assert.equal(bewertungEingabe({ ek: '30.000', vk: '20.000' }, HEUTE).ok, false, 'EK über VK');
  assert.equal(bewertungEingabe({ vk: '1000', am: '2026-12-01' }, HEUTE).ok, false, 'Zukunft');
  assert.equal(bewertungEingabe({ vk: '1000', url: 'http://dat.de/x' }, HEUTE).ok, false);
  assert.equal(bewertungUrlGueltig('https://www.dat.de/bericht?id=1'), true);
  assert.equal(bewertungUrlGueltig('https://a b.de'), false);

  const b = { bewertung_anbieter: 'schwacke', bewertung_ek: 18000, bewertung_vk: 20000, bewertung_am: '2026-09-30' };
  assert.equal(bewertungLage(b, 20500, HEUTE).stufe, 'ok');
  assert.equal(bewertungLage(b, 20500, HEUTE).abweichungProzent, 2.5);
  assert.equal(bewertungLage(b, 21200, HEUTE).stufe, 'warn');
  assert.equal(bewertungLage(b, 17500, HEUTE).stufe, 'info');
  assert.equal(bewertungLage(b, null, HEUTE).stufe, 'keine');
  assert.equal(bewertungLage({ ...b, bewertung_am: '2026-07-01' }, 20000, HEUTE).alt, true);
  assert.match(bewertungLage({ ...b, bewertung_am: '2026-07-01' }, 20000, HEUTE).text, /neu abfragen/);
  assert.equal(bewertungLage(BEWERTUNG_LEER, 20000, HEUTE), null);
  assert.equal(finFuerAbfrage('wvwzzzcdzmw123456'), 'WVWZZZCDZMW123456');
  assert.equal(finFuerAbfrage('ABC'), null);
});

test('Schnittstellen-Zentrale: Fahrzeugbewertung mit zwei Wegen (eigenes Konto / Abschluss beim Anbieter)', () => {
  const b = bereich('fahrzeugbewertung');
  assert.ok(b && b.einrichten.modus === 'inline' && b.kategorie === 'betrieb');
  assert.ok(anbieterVon('fahrzeugbewertung', 'manuell')?.demo);
  for (const k of ['dat', 'schwacke']) {
    const a = anbieterVon('fahrzeugbewertung', k);
    assert.ok(a && a.felder.some((f) => f.key === 'api_key' && f.typ === 'password'), k);
    const p = partner(k);
    assert.equal(p.partnerlink, false, 'ohne Env kein „Partnerlink"');
    assert.ok(b.abschluss.some((x) => x.anbieter === k && x.url === p.abschlussUrl));
  }
  assert.match(partner('dat').abschlussUrl, /^https:\/\/www\.dat\.de/);
  assert.match(partner('schwacke').abschlussUrl, /^https:\/\/www\.schwacke\.de/);
  assert.ok(PARTNER.some((p) => p.key === 'carvertical'), 'carVertical bleibt');
  assert.match(b.beschreibung, /ARGONAUT vermittelt nur/);
});

test('Akte, Preis-Cockpit und Guide: Karte eingebunden, Preis-Cockpit laedt Bewertung getrennt (ohne SQL kein Absturz)', () => {
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.ok(akte.includes('<KfzBewertung '));
  const karte = lies('app/dashboard/kfz/bestand/KfzBewertung.tsx');
  assert.ok(karte.includes('bewertungEingabe(') && karte.includes('navigator.clipboard.writeText'));
  assert.ok(!/fetch\(/.test(karte), 'kein Auslesen fremder Seiten');
  const preise = lies('app/dashboard/kfz/preise/page.tsx');
  assert.ok(!/const SPALTEN = .*bewertung/.test(preise), 'Hauptabfrage bleibt ohne neue Spalten');
  assert.ok(preise.includes("bw.error ? []"));
  const guide = lies('lib/guideWissen.ts');
  assert.ok(guide.includes('Bewertung (DAT, Schwacke)') && guide.includes('mobile.de-Aufbau'));
});

test('SQL p283: additiv, Katalog = MOTOR_TABELLEN (82), anon ohne Recht, Pruefregeln wie lib', () => {
  const sql = lies('supabase-sql/p283-kfz-umzug-bewertung.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(whitelist, [...MOTOR_TABELLEN].sort());
  assert.equal(whitelist.length, 82);
  assert.ok(!/\b(drop table|delete from|truncate|create policy|drop policy|drop column)\b/i.test(sql));
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /bewertung_anbieter in \('dat', 'schwacke', 'sonstige'\)/);
  assert.equal((sql.match(/add column if not exists bewertung_/g) || []).length, 5);
});
