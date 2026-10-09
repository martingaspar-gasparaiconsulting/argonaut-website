// Paket 291/292 (09.10.2026): V1 Fahrzeugvermietung Kern
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mietTage, abrechnungsTage, ueberschneidet, kollision, kalenderZeile, tageAb, euroInCent, mietpreisCent, freiKm, achtel, achtelText,
  abrechnung, fahrzeugPruefen, buchungPruefen, fahrerBewerten, fahrerPruefen, siehtAusWieKarte, kautionPruefen, uebergabePruefen,
  rueckgabePruefen, einbehaltPruefen, schadenPruefen, fotoPfad, kennzahlen, volleJahre, ueberfaellig,
} from '../out/fahrzeugMiete.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const FZ = '11111111-1111-4111-8111-111111111111';
const B1 = '22222222-2222-4222-8222-222222222222';
const BETRIEB = '33333333-3333-4333-8333-333333333333';

test('Miettage: angefangene 24 Stunden, Kulanz, mindestens 1', () => {
  assert.equal(mietTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:00:00+02:00'), 3);
  assert.equal(mietTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:01:00+02:00'), 4, 'eine Minute drüber = neuer Tag');
  assert.equal(mietTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:29:00+02:00', 29), 3, 'innerhalb der Kulanz');
  assert.equal(mietTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:30:00+02:00', 29), 4);
  assert.equal(mietTage('2026-10-10T09:00:00+02:00', '2026-10-10T12:00:00+02:00'), 1);
  assert.equal(mietTage('2026-10-10T09:00:00+02:00', '2026-10-10T08:00:00+02:00'), 1, 'Unsinn -> 1');
  // Zeitumstellung 25.10.2026: 24 echte Stunden, nicht Kalendertag
  assert.equal(mietTage('2026-10-24T10:00:00+02:00', '2026-10-25T10:00:00+01:00'), 2, '25 Stunden über die Umstellung');
  assert.equal(abrechnungsTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:00:00+02:00', '2026-10-12T09:00:00+02:00'), 3, 'früher zurück mindert nicht');
  assert.equal(abrechnungsTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:00:00+02:00', '2026-10-14T08:00:00+02:00'), 4, 'später zurück zählt');
  assert.equal(abrechnungsTage('2026-10-10T09:00:00+02:00', '2026-10-13T09:00:00+02:00', null), 3);
});

test('Überschneidung halb-offen, Kollision, Kalender', () => {
  assert.equal(ueberschneidet(0, 10, 10, 20), false, 'direkt anschließend erlaubt');
  assert.equal(ueberschneidet(0, 11, 10, 20), true);
  const liste = [
    { id: 'a', fahrzeug_id: FZ, abholung: '2026-10-10T09:00:00+02:00', rueckgabe_plan: '2026-10-13T09:00:00+02:00', status: 'reserviert', nummer: 'MV-2026-0001', mieter_name: 'Max' },
    { id: 'b', fahrzeug_id: FZ, abholung: '2026-10-20T09:00:00+02:00', rueckgabe_plan: '2026-10-21T09:00:00+02:00', status: 'storniert' },
  ];
  const v = Date.parse('2026-10-12T09:00:00+02:00'), b = Date.parse('2026-10-14T09:00:00+02:00');
  assert.equal(kollision(liste, FZ, v, b)?.id, 'a');
  assert.equal(kollision(liste, FZ, v, b, 'a'), null, 'eigene Buchung beim Bearbeiten');
  assert.equal(kollision(liste, FZ, Date.parse('2026-10-20T10:00:00+02:00'), Date.parse('2026-10-20T12:00:00+02:00')), null, 'storniert blockiert nicht');
  const tage = tageAb('2026-10-09', 6);
  assert.deepEqual(tage, ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
  const z = kalenderZeile(liste, FZ, tage).map((x) => (x ? x.id : '-'));
  assert.deepEqual(z, ['-', 'a', 'a', 'a', 'a', '-'], 'Rückgabe 13.10. 09:00 belegt den 13.');
  assert.deepEqual(tageAb('2026-12-30', 3), ['2026-12-30', '2026-12-31', '2027-01-01']);
});

test('Geld: Euro in Cent, Wochenpreis, Frei-km, Tank', () => {
  assert.equal(euroInCent('49,90'), 4990);
  assert.equal(euroInCent('1.250'), 125000);
  assert.equal(euroInCent('4,395'), 440);
  assert.equal(euroInCent(''), null);
  assert.ok(Number.isNaN(euroInCent('abc')));
  assert.ok(Number.isNaN(euroInCent('-5')));
  assert.equal(mietpreisCent(3, 4900, null), 14700);
  assert.equal(mietpreisCent(6, 4900, 25000), 25000, '6 Tage nie teurer als die Woche');
  assert.equal(mietpreisCent(9, 4900, 25000), 25000 + 9800);
  assert.equal(mietpreisCent(13, 4900, 25000), 50000, 'Resttage gedeckelt auf eine Woche');
  assert.equal(freiKm(3, 200), 600);
  assert.equal(freiKm(3, null), null);
  assert.equal(achtel('8'), 8); assert.equal(achtel(9), null); assert.equal(achtel('4,5'), null);
  assert.equal(achtelText(8), 'voll'); assert.equal(achtelText(4), '2/4'); assert.equal(achtelText(3), '3/8'); assert.equal(achtelText(0), 'leer');
});

const BU = {
  abholung: '2026-10-10T09:00:00+02:00', rueckgabe_plan: '2026-10-13T09:00:00+02:00', rueckgabe_ist: '2026-10-13T09:20:00+02:00',
  tagessatz_cent: 4900, wochensatz_cent: 25000, frei_km_tag: 200, mehr_km_cent: 25, zusatzfahrer_tag_cent: 800, tank_achtel_cent: 1200,
  km_start: 10000, km_ende: 10850, tank_start: 8, tank_ende: 6,
};

test('Abrechnung: Miete, Zusatzfahrer, Mehr-km, Nachtanken — Summe stimmt mit dem Mietpreis', () => {
  const r = abrechnung(BU, 1, 29, 'VW Golf');
  assert.equal(r.tage, 3);
  assert.deepEqual(r.posten.map((p) => [p.einheit, p.menge, p.einzelpreis_cent, p.summe_cent]), [
    ['Tag', 3, 4900, 14700], ['Tag', 3, 800, 2400], ['km', 250, 25, 6250], ['Achtel', 2, 1200, 2400],
  ]);
  assert.equal(r.netto_cent, 14700 + 2400 + 6250 + 2400);
  assert.equal(r.gefahren, 850); assert.equal(r.frei, 600); assert.equal(r.mehrKm, 250);
  // ohne Kulanz: 20 Minuten drüber = 4. Tag
  assert.equal(abrechnung(BU, 0, 0, 'X').tage, 4);
  // unbegrenzte km, voll zurück, keine Zusatzfahrer
  const r2 = abrechnung({ ...BU, frei_km_tag: null, tank_ende: 8 }, 0, 29, 'X');
  assert.equal(r2.posten.length, 1);
  // Wochen + Resttage, und Resttage auf eine Woche gedeckelt
  for (const tage of [1, 3, 5, 6, 7, 8, 9, 12, 13, 14, 20, 30]) {
    const rueck = new Date(Date.parse(BU.abholung) + tage * 86400000).toISOString();
    const a = abrechnung({ ...BU, rueckgabe_plan: rueck, rueckgabe_ist: rueck, frei_km_tag: null, tank_ende: 8 }, 0, 0, 'X');
    assert.equal(a.tage, tage);
    assert.equal(a.netto_cent, mietpreisCent(tage, 4900, 25000), `tage ${tage}`);
  }
  const w9 = abrechnung({ ...BU, rueckgabe_plan: '2026-10-19T09:00:00+02:00', rueckgabe_ist: null, frei_km_tag: null, tank_ende: 8 }, 0, 0, 'X');
  assert.deepEqual(w9.posten.map((p) => [p.einheit, p.menge]), [['Woche', 1], ['Tag', 2]]);
  // Kaution und Schaden tauchen nie auf
  assert.ok(r.posten.every((p) => !/kaution|schaden/i.test(p.bezeichnung)));
});

test('Fahrzeug prüfen', () => {
  const ok = fahrzeugPruefen({ bezeichnung: ' VW Golf ', kennzeichen: 'bb-ab 1', art: 'pkw', fsKlasse: 'b', tagessatz: '49,00', wochensatz: '250', freiKmTag: '200', mehrKm: '0,25', kaution: '500', mindestalter: '21', fsJahre: '2', zusatzfahrer: '8', tankAchtel: '12', kmStand: '10.000' });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.zeile.tagessatz_cent, ok.zeile.wochensatz_cent, ok.zeile.mehr_km_cent, ok.zeile.kaution_cent, ok.zeile.km_stand, ok.zeile.kennzeichen, ok.zeile.fs_klasse], [4900, 25000, 25, 50000, 10000, 'BB-AB 1', 'B']);
  const leer = fahrzeugPruefen({ bezeichnung: 'E-Bike 1', art: 'ebike', tagessatz: '25' });
  assert.equal(leer.ok, true);
  assert.equal(leer.zeile.frei_km_tag, null); assert.equal(leer.zeile.mindestalter, 18); assert.equal(leer.zeile.fs_klasse, null);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'X', art: 'pkw', tagessatz: '1' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'boot', tagessatz: '1' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '1', fsKlasse: 'B, BE' }).ok, false, 'genau eine Klasse');
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '1', fsKlasse: 'Q' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '1', mindestalter: '12' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '1', wochensatz: '0' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '1', kaution: 'viel' }).ok, false);
  assert.equal(fahrzeugPruefen({ bezeichnung: 'Golf', art: 'pkw', tagessatz: '1', freiKmTag: '2,5' }).ok, false);
});

test('Buchung prüfen', () => {
  const basis = { fahrzeugId: FZ, mieterName: 'Max Muster', abholung: '2026-10-10T09:00:00+02:00', rueckgabe: '2026-10-13T09:00:00+02:00', buchungen: [] };
  const ok = buchungPruefen({ ...basis, anschrift: ' Hauptstr. 1 \n\n 71032 Böblingen ', email: 'max@example.de' });
  assert.equal(ok.ok, true);
  assert.equal(ok.zeile.mieter_anschrift, 'Hauptstr. 1\n71032 Böblingen');
  assert.equal(ok.zeile.abholung, '2026-10-10T07:00:00.000Z');
  assert.equal(buchungPruefen({ ...basis, rueckgabe: basis.abholung }).ok, false);
  assert.equal(buchungPruefen({ ...basis, mieterName: 'M' }).ok, false);
  assert.equal(buchungPruefen({ ...basis, email: 'kein' }).ok, false);
  assert.equal(buchungPruefen({ ...basis, fahrzeugId: 'x' }).ok, false);
  assert.equal(buchungPruefen({ ...basis, rueckgabe: '2027-12-01T09:00:00+01:00' }).ok, false, 'über 400 Tage');
  const besetzt = [{ id: 'a', fahrzeug_id: FZ, abholung: '2026-10-12T09:00:00+02:00', rueckgabe_plan: '2026-10-15T09:00:00+02:00', status: 'uebergeben', nummer: 'MV-2026-0007' }];
  const k = buchungPruefen({ ...basis, buchungen: besetzt });
  assert.equal(k.ok, false); assert.match(k.grund, /MV-2026-0007/);
});

test('Fahrer: Alter, Dauer, Klasse, Ausweis, Gültigkeit — wie die Datenbank', () => {
  assert.equal(volleJahre('2005-10-10', '2026-10-10'), 21);
  assert.equal(volleJahre('2005-10-11', '2026-10-10'), 20);
  assert.equal(volleJahre('2004-02-29', '2025-02-28'), 20);
  const bed = { mindestalter: 21, fs_jahre_min: 2, fs_klasse: 'B' };
  const f = { geburtsdatum: '1990-01-01', fs_erteilt_am: '2010-01-01', fs_klassen: 'B, BE', fs_gueltig_bis: '2030-01-01', ausweis_abgeglichen: true };
  assert.equal(fahrerBewerten(f, bed, '2026-10-10', '2026-10-13').ok, true);
  const jung = fahrerBewerten({ ...f, geburtsdatum: '2006-01-01' }, bed, '2026-10-10', '2026-10-13');
  assert.equal(jung.ok, false); assert.equal(jung.alter_ok, false); assert.match(jung.gruende[0], /Mindestalter 21/);
  assert.equal(fahrerBewerten({ ...f, geburtsdatum: '2005-10-10' }, bed, '2026-10-10', '2026-10-13').alter_ok, true, 'am 21. Geburtstag');
  assert.equal(fahrerBewerten({ ...f, geburtsdatum: '2005-10-11' }, bed, '2026-10-10', '2026-10-13').alter_ok, false, 'einen Tag zu jung');
  assert.equal(fahrerBewerten({ ...f, fs_erteilt_am: '2025-06-01' }, bed, '2026-10-10', '2026-10-13').dauer_ok, false);
  assert.equal(fahrerBewerten({ ...f, fs_erteilt_am: '2024-10-10' }, bed, '2026-10-10', '2026-10-13').dauer_ok, true, 'genau 2 Jahre');
  assert.equal(fahrerBewerten({ ...f, fs_klassen: 'A' }, bed, '2026-10-10', '2026-10-13').klasse_ok, false);
  assert.equal(fahrerBewerten({ ...f, fs_klassen: null }, { ...bed, fs_klasse: null }, '2026-10-10', '2026-10-13').klasse_ok, true);
  assert.equal(fahrerBewerten({ ...f, ausweis_abgeglichen: false }, bed, '2026-10-10', '2026-10-13').ok, false);
  assert.equal(fahrerBewerten({ ...f, fs_gueltig_bis: '2026-10-12' }, bed, '2026-10-10', '2026-10-13').dokument_ok, false, 'läuft vor Rückgabe ab');
  assert.equal(fahrerBewerten({ ...f, fs_gueltig_bis: null }, bed, '2026-10-10', '2026-10-13').dokument_ok, true, 'unbefristet');
});

test('Fahrer-Eingabe: nie eine Führerscheinnummer', () => {
  const basis = { buchungId: B1, rolle: 'haupt', name: 'Max Muster', geburtsdatum: '1990-01-01', fsErteilt: '2010-01-01', klassen: 'b be', ausweis: true, heute: '2026-10-09' };
  const ok = fahrerPruefen(basis);
  assert.equal(ok.ok, true); assert.equal(ok.zeile.fs_klassen, 'B, BE'); assert.equal(ok.zeile.ausweis_abgeglichen, true);
  assert.equal(fahrerPruefen({ ...basis, bemerkung: 'Nr. B072RRE2I55' }).ok, false);
  assert.equal(fahrerPruefen({ ...basis, bemerkung: 'internationaler Führerschein' }).ok, true);
  assert.equal(fahrerPruefen({ ...basis, klassen: 'Z' }).ok, false);
  assert.equal(fahrerPruefen({ ...basis, fsErteilt: '1980-01-01' }).ok, false, 'vor Geburt');
  assert.equal(fahrerPruefen({ ...basis, geburtsdatum: '2027-01-01' }).ok, false);
  assert.equal(fahrerPruefen({ ...basis, gueltigBis: '31.12.2030' }).ok, false);
  assert.equal(fahrerPruefen({ ...basis, rolle: 'chef' }).ok, false);
  assert.equal(fahrerPruefen({ ...basis, ausweis: 'ja' }).zeile.ausweis_abgeglichen, false, 'nur echtes Häkchen');
});

test('Kaution: nie eine Kartennummer, Vorgangsnummer beim Zahlungsanbieter', () => {
  assert.equal(siehtAusWieKarte('4111 1111 1111 1111'), true);
  assert.equal(siehtAusWieKarte('4111111111111111'), true);
  assert.equal(siehtAusWieKarte('4111-1111-1111-1111'), true);
  assert.equal(siehtAusWieKarte('pi_3NabcXYZ'), false);
  assert.equal(siehtAusWieKarte('Quittung 17'), false);
  assert.equal(kautionPruefen({ art: 'zahlungsanbieter', status: 'hinterlegt', referenz: '4111 1111 1111 1111', kautionCent: 50000 }).ok, false);
  assert.equal(kautionPruefen({ art: 'zahlungsanbieter', status: 'hinterlegt', referenz: '', kautionCent: 50000 }).ok, false);
  assert.equal(kautionPruefen({ art: 'zahlungsanbieter', status: 'hinterlegt', referenz: 'pi_3Nabc', kautionCent: 50000 }).ok, true);
  assert.equal(kautionPruefen({ art: 'bar', status: 'hinterlegt', kautionCent: 50000 }).ok, true);
  assert.equal(kautionPruefen({ art: 'keine', status: 'hinterlegt', kautionCent: 50000 }).ok, false);
  assert.equal(kautionPruefen({ art: 'bar', status: 'einbehalten', kautionCent: 50000 }).ok, false, 'Einbehalt nur über den Chef-Weg');
  assert.equal(einbehaltPruefen({ betrag: '100', grund: 'Kratzer Tür', kautionCent: 50000 }).cent, 10000);
  assert.equal(einbehaltPruefen({ betrag: '600', grund: 'Kratzer Tür', kautionCent: 50000 }).ok, false);
  assert.equal(einbehaltPruefen({ betrag: '100', grund: 'x', kautionCent: 50000 }).ok, false);
});

test('Übergabe und Rückgabe', () => {
  const u = { km: '10.000', tank: '8', kmFlotte: 10000, unterschrieben: true, anschrift: 'Hauptstr. 1', hauptOk: true, fahrerAbgelehnt: 0, kautionCent: 50000, kautionStatus: 'hinterlegt' };
  const ok = uebergabePruefen(u);
  assert.equal(ok.ok, true); assert.equal(ok.km, 10000); assert.equal(ok.hinweis, null);
  assert.match(uebergabePruefen({ ...u, km: '9.000' }).hinweis, /kleiner/);
  assert.equal(uebergabePruefen({ ...u, hauptOk: false }).ok, false);
  assert.equal(uebergabePruefen({ ...u, fahrerAbgelehnt: 1 }).ok, false);
  assert.equal(uebergabePruefen({ ...u, kautionStatus: 'offen' }).ok, false);
  assert.equal(uebergabePruefen({ ...u, kautionCent: 0, kautionStatus: 'offen' }).ok, true);
  assert.equal(uebergabePruefen({ ...u, unterschrieben: false }).ok, false);
  assert.equal(uebergabePruefen({ ...u, anschrift: '' }).ok, false);
  assert.equal(uebergabePruefen({ ...u, tank: '9' }).ok, false);
  assert.equal(rueckgabePruefen({ km: '10.850', tank: 6, kmStart: 10000 }).km, 10850);
  assert.equal(rueckgabePruefen({ km: '9.999', tank: 6, kmStart: 10000 }).ok, false);
  assert.equal(rueckgabePruefen({ km: '200.000', tank: 6, kmStart: 10000 }).ok, false);
  assert.equal(rueckgabePruefen({ km: '10.850', tank: '', kmStart: 10000 }).ok, false);
});

test('Schaden, Fotopfad, Kennzahlen', () => {
  assert.equal(schadenPruefen({ fahrzeugId: FZ, buchungId: B1, phase: 'rueckgabe', bereich: 'links', art: 'kratzer', beschreibung: ' Tür ' }).zeile.beschreibung, 'Tür');
  assert.equal(schadenPruefen({ fahrzeugId: FZ, phase: 'rueckgabe', bereich: 'oben', art: 'kratzer' }).ok, false);
  assert.equal(schadenPruefen({ fahrzeugId: FZ, phase: 'spaeter', bereich: 'links', art: 'kratzer' }).ok, false);
  assert.equal(fotoPfad(BETRIEB, B1, 'uebergabe', 'JPG', 1760000000000, 'ab-c9'), `${BETRIEB}/${B1}/uebergabe-1760000000000-abc9.jpg`);
  assert.equal(fotoPfad(BETRIEB, B1, 'uebergabe', 'svg', 1, 'a'), null, 'nie SVG/HTML');
  assert.equal(fotoPfad('../x', B1, 'uebergabe', 'jpg', 1, 'a'), null);
  const jetzt = Date.parse('2026-10-10T12:00:00+02:00');
  const liste = [
    { id: '1', fahrzeug_id: FZ, abholung: '2026-10-10T15:00:00+02:00', rueckgabe_plan: '2026-10-11T15:00:00+02:00', status: 'reserviert' },
    { id: '2', fahrzeug_id: FZ, abholung: '2026-10-08T09:00:00+02:00', rueckgabe_plan: '2026-10-10T09:00:00+02:00', status: 'uebergeben' },
    { id: '3', fahrzeug_id: FZ, abholung: '2026-10-01T09:00:00+02:00', rueckgabe_plan: '2026-10-02T09:00:00+02:00', status: 'zurueck', kaution_status: 'hinterlegt' },
  ];
  assert.deepEqual(kennzahlen(liste, jetzt, '2026-10-10'), { unterwegs: 1, heuteAbholung: 1, heuteRueckgabe: 1, ueberfaellig: 1, kautionOffen: 1 });
  assert.equal(ueberfaellig(liste[1], jetzt), true);
  assert.equal(ueberfaellig(liste[0], jetzt), false);
});

test('SQL: Doppelbuchungs-Sperre, keine Kartendaten, keine Führerscheinnummer, Wächter, Regeln', () => {
  const s = lies('supabase-sql/p291-fahrzeugvermietung.sql');
  assert.match(s, /exclude using gist \(fahrzeug_id with =, zeitraum with &&\) where \(status in \('reserviert', 'uebergeben'\)\)/);
  assert.match(s, /tstzrange\(abholung, rueckgabe_plan, '\[\)'\)/, 'halb-offen');
  assert.match(s, /kaution_referenz !~ '\[0-9\]\(\[ -\]\?\[0-9\]\)\{12,\}'/, 'Kartennummer gesperrt');
  assert.ok(!/karten_?nummer|kartennr|iban|fuehrerschein_?nummer|fs_nummer/i.test(s.replace(/--.*$/gm, '')), 'keine solchen Spalten');
  assert.equal((s.match(/create policy /g) || []).length, 17, '14 Tabellen-Regeln + 3 Speicher-Regeln');
  assert.equal((s.match(/enable row level security/g) || []).length, 5);
  assert.ok(!/create policy [a-z_]+ on public\.miet_[a-z]+ for delete/.test(s), 'Mitarbeiter löschen nie (nur chef_all)');
  assert.match(s, /new\.tagessatz_cent := f\.tagessatz_cent/, 'Preise aus der Flotte eingefroren');
  assert.match(s, /Ein Prüfvermerk ist ein Nachweis/);
  assert.match(s, /public = false/);
  assert.match(s, /AUSSPERR-RISIKO: keines/);
  // gleiche Rechenregel für Alter/Dauer wie lib (Abholtag in Berlin)
  assert.match(s, /v_tag := \(b\.abholung at time zone 'Europe\/Berlin'\)::date/);
});

test('Seiten: Rechte, Menü, Hilfe, Zahlen-Leser', () => {
  const rechte = lies('lib/rechte.ts');
  assert.match(rechte, /href: '\/dashboard\/verleih\/fahrzeuge'/);
  const guide = lies('lib/guideWissen.ts');
  assert.match(guide, /'\/dashboard\/verleih\/fahrzeuge': \{/);
  const seite = lies('app/dashboard/verleih/fahrzeuge/page.tsx');
  assert.ok(!/parseFloat|Math\.round\([^)]*\* 100\) \/ 100/.test(seite));
  assert.match(seite, /23P01/, 'Doppelbuchung aus der Datenbank verständlich gemeldet');
  assert.match(lies('app/dashboard/verleih/page.tsx'), /\/dashboard\/verleih\/fahrzeuge/, 'Weg aus dem Verleih');
});
