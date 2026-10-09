// Paket 296 (09.10.2026): T1 Trackday, Rennschule, Kartbahn
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MS_ARTEN, TN_STATUS, BELEGEND, GAST_ARTEN, BEREICHE, TEIL_KATEGORIEN, EINHEITEN, eventWeiter, tnWeiter, berlinZeitpunkt, berlinLokal, berlinTagVon,
  wannText, zeitraumText, eventPruefen, verzichtPruefen, steuerCent, nettoAusBrutto, bruttoCent, gruppePruefen, belegt, frei, naechsteStartnummer,
  vergebeneLeih, teilnehmerPruefen, freigabeFehlt, verzichtEmpfaenger, verzichtDokument, gastPruefen, akkreditierFehlt, teilPruefen, einsatzPruefen,
  laufzeit, laufzeitText, tnRechnungMoeglich, tnPosten, summe, kennzahlen, euroInCent, VERZICHT_MIN,
} from '../out/motorsport.js';
import { steuerGruppen } from '../out/steuerLogik.js';
import { ARTEN, NUR_STRECKE } from '../out/fahrzeugMiete.js';
import { oeffentlich } from '../out/mietOnline.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p296-motorsport.sql');
const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const EV = { id: ID, titel: 'Trackday Test', art: 'trackday', strecke: 'Hockenheimring', beginn: '2026-11-10T07:00:00.000Z', ende: '2026-11-10T17:00:00.000Z', status: 'offen', mindestalter: 18, fuehrerschein_pflicht: true, briefing_pflicht: true, verzicht_text: 'Mein eigener Text '.repeat(5) };
const TN = { id: ID, gruppe_id: 'g1', status: 'bestaetigt', startnummer: 7, miet_fahrzeug_id: null, name: 'Anna Test', minderjaehrig: false, sorgeberechtigt_name: null, email: 'a@test.de', fahrzeug_art: 'eigen', eigenes_fahrzeug: 'Porsche 911', alter_geprueft: true, fuehrerschein_geprueft: true, briefing: true, verzicht_token: 'tok-1234', startgeld_netto_cent: 25000, leih_netto_cent: 0, rechnung_id: null };

test('Berliner Ortszeit: Sommer, Winter, Zeitumstellung, ungültig', () => {
  assert.equal(berlinZeitpunkt('2026-07-01T08:00'), '2026-07-01T06:00:00.000Z');
  assert.equal(berlinZeitpunkt('2026-11-10T08:00'), '2026-11-10T07:00:00.000Z');
  assert.equal(berlinZeitpunkt('2026-10-25T12:00'), '2026-10-25T11:00:00.000Z'); // Tag der Umstellung, nachmittags Winterzeit
  assert.equal(berlinZeitpunkt('2026-03-29T12:00'), '2026-03-29T10:00:00.000Z');
  for (const x of ['', '2026-02-30T08:00', '2026-11-10 08:00', '2026-11-10T24:00', 'abc']) assert.equal(berlinZeitpunkt(x), null, x);
  assert.equal(berlinLokal('2026-07-01T06:00:00.000Z'), '2026-07-01T08:00');
  assert.equal(berlinLokal(berlinZeitpunkt('2026-12-31T23:30')), '2026-12-31T23:30');
  assert.equal(berlinTagVon('2026-11-09T23:30:00.000Z'), '2026-11-10');
  assert.equal(wannText('2026-11-10T07:00:00.000Z'), '10.11.2026, 08:00');
  assert.equal(zeitraumText(EV.beginn, EV.ende), '10.11.2026, 08:00–18:00');
  assert.equal(zeitraumText('2026-11-10T07:00:00.000Z', '2026-11-11T16:00:00.000Z'), '10.11.2026, 08:00 bis 11.11.2026, 17:00');
  assert.equal(berlinLokal('x'), '');
});

test('Event prüfen: Titel, Art, Zeit, höchstens 14 Tage, Mindestalter; Liste wie die Datenbank', () => {
  const F = { titel: 'Trackday Frühjahr', art: 'trackday', strecke: ' Bilster Berg ', beginn: '2026-11-10T08:00', ende: '2026-11-10T18:00', status: 'offen', mindestalter: '18', fuehrerscheinPflicht: true, briefingPflicht: false, notiz: '' };
  const p = eventPruefen(F, true);
  assert.ok(p.ok);
  assert.equal(p.zeile.beginn, '2026-11-10T07:00:00.000Z');
  assert.equal(p.zeile.strecke, 'Bilster Berg');
  assert.equal(p.zeile.status, 'offen');
  assert.equal(p.zeile.briefing_pflicht, false);
  assert.equal(eventPruefen({ ...F, status: 'beendet' }, true).zeile.status, 'geplant');
  assert.equal('status' in eventPruefen(F, false).zeile, false, 'Status beim Ändern nur über die Knöpfe');
  assert.equal(eventPruefen({ ...F, mindestalter: '' }, true).zeile.mindestalter, 0);
  for (const [k, v] of [['titel', 'ab'], ['art', 'rallye'], ['beginn', ''], ['ende', '2026-11-10T08:00'], ['ende', '2026-11-25T08:01'], ['mindestalter', '100'], ['mindestalter', '1,5']]) {
    assert.equal(eventPruefen({ ...F, [k]: v }, true).ok, false, `${k}=${v}`);
  }
  assert.ok(eventPruefen({ ...F, ende: '2026-11-24T08:00' }, true).ok, 'genau 14 Tage geht');
  for (const a of MS_ARTEN) assert.ok(SQL.includes(`'${a.key}'`), a.key);
  assert.ok(SQL.includes("check (ende > beginn and ende <= beginn + interval '14 days')"));
  assert.deepEqual([...eventWeiter('offen')], ['geplant', 'abgesagt', 'beendet']);
  assert.deepEqual([...eventWeiter('abgesagt')], []);
});

test('Haftungsverzicht: eigener Text, kein Mustertext im Code, Länge wie die Datenbank', () => {
  assert.equal(verzichtPruefen('zu kurz').ok, false);
  assert.equal(verzichtPruefen('x'.repeat(20001)).ok, false);
  const p = verzichtPruefen('  Zeile 1\r\nZeile 2 ' + 'y'.repeat(60) + '  ');
  assert.ok(p.ok); assert.ok(p.text.startsWith('Zeile 1\nZeile 2')); assert.ok(!p.text.endsWith(' '));
  assert.equal(VERZICHT_MIN, 50);
  assert.ok(SQL.includes('coalesce(char_length(btrim(v_ev.verzicht_text)), 0) < 50'));
  assert.ok(SQL.includes('char_length(verzicht_text) <= 20000'));
  // Kein Mustertext: weder in der Logik noch auf der Seite
  const quelle = lies('lib/motorsport.ts') + lies('app/dashboard/veranstaltungen/motorsport/[id]/page.tsx');
  assert.ok(!/verzichte(t)? (hiermit )?auf (alle|sämtliche) Ansprüche/i.test(quelle));
  assert.match(lies('app/dashboard/veranstaltungen/motorsport/[id]/page.tsx'), /bewusst keinen Mustertext/);
  // Dokument: Kopf + Text unverändert
  const d = verzichtDokument({ betrieb: 'Racing GmbH', event: EV, person: 'Anna Test', rolle: 'teilnehmer', startnummer: 7, fahrzeug: 'Porsche 911' });
  assert.ok(d.startsWith('Veranstalter: Racing GmbH\nVeranstaltung: Trackday Test (Trackday / Freies Fahren)'));
  assert.ok(d.includes('Teilnehmer: Anna Test · Startnummer 7') && d.includes('Fahrzeug: Porsche 911'));
  assert.ok(d.endsWith(EV.verzicht_text.trim()));
  const k = verzichtDokument({ betrieb: '', event: EV, person: 'Kind Klein', rolle: 'teilnehmer', minderjaehrig: true, sorgeberechtigt: 'Mama Klein' });
  assert.ok(k.includes('Minderjährig — es unterschreibt die sorgeberechtigte Person: Mama Klein') && k.includes('Veranstalter: —'));
  const g = verzichtDokument({ betrieb: 'R', event: EV, person: 'Gast X', rolle: 'gast', bereich: 'boxengasse' });
  assert.ok(g.includes('Gast: Gast X · Bereich: Boxengasse'));
  assert.deepEqual(verzichtEmpfaenger({ name: 'Kind', email: 'e@x.de', minderjaehrig: true, sorgeberechtigt_name: 'Mama' }), { name: 'Mama', email: 'e@x.de', hinweis: 'für Kind (minderjährig)' });
  assert.deepEqual(verzichtEmpfaenger({ name: 'Anna', email: null, minderjaehrig: false, sorgeberechtigt_name: null }), { name: 'Anna', email: null, hinweis: null });
});

test('Geld: Steuer wie steuerGruppen, Netto aus Brutto, Endpreis, Kleinunternehmer', () => {
  for (const n of [0, 1, 99, 25000, 33613, 4201681, 12345]) {
    const sg = steuerGruppen([{ netto: n / 100, satz: 19 }]);
    assert.equal(steuerCent(n, 19), Math.round(sg.steuer * 100), String(n));
  }
  assert.deepEqual(nettoAusBrutto(29900), { netto_cent: 25126, exakt: true });
  assert.equal(bruttoCent(25126, false), 29900);
  assert.equal(bruttoCent(25126, true), 25126);
  // jeder exakte Treffer ergibt wieder genau den Brutto-Betrag
  for (let b = 0; b < 3000; b += 7) { const r = nettoAusBrutto(b); if (r.exakt) assert.equal(bruttoCent(r.netto_cent, false), b); }
  assert.equal(euroInCent('1.250,50'), 125050);
  assert.equal(euroInCent(''), null);
  assert.ok(Number.isNaN(euroInCent('abc')));
  assert.ok(Number.isNaN(euroInCent('-1')));
});

test('Gruppen: Startplätze, Startgeld brutto/netto, belegt/frei wie die Datenbank', () => {
  const p = gruppePruefen({ name: ' Einsteiger ', startplaetze: '20', startgeld: '299,00', brutto: true }, false);
  assert.ok(p.ok); assert.equal(p.zeile.name, 'Einsteiger'); assert.equal(p.zeile.startgeld_netto_cent, 25126); assert.equal(p.exakt, true);
  assert.equal(gruppePruefen({ name: 'KU', startplaetze: '5', startgeld: '299', brutto: true }, true).zeile.startgeld_netto_cent, 29900, 'Kleinunternehmer: brutto = netto');
  assert.equal(gruppePruefen({ name: 'Frei', startplaetze: '5', startgeld: '', brutto: false }, false).zeile.startgeld_netto_cent, 0);
  for (const [k, v] of [['name', 'E'], ['startplaetze', '0'], ['startplaetze', '501'], ['startplaetze', '2,5'], ['startgeld', 'x'], ['startgeld', '100001'], ['reihenfolge', '100']]) {
    assert.equal(gruppePruefen({ name: 'Gruppe', startplaetze: '10', startgeld: '0', brutto: false, [k]: v }, false).ok, false, `${k}=${v}`);
  }
  const tns = [
    { id: 'a', gruppe_id: 'g', status: 'angemeldet', startnummer: 1, miet_fahrzeug_id: 'f1' },
    { id: 'b', gruppe_id: 'g', status: 'warteliste', startnummer: null, miet_fahrzeug_id: 'f2' },
    { id: 'c', gruppe_id: 'g', status: 'storniert', startnummer: 2, miet_fahrzeug_id: 'f3' },
    { id: 'd', gruppe_id: 'g', status: 'freigegeben', startnummer: 3, miet_fahrzeug_id: null },
    { id: 'e', gruppe_id: 'h', status: 'teilgenommen', startnummer: 5, miet_fahrzeug_id: 'f4' },
  ];
  assert.equal(belegt(tns, 'g'), 2);
  assert.equal(belegt(tns, 'g', 'a'), 1);
  assert.equal(frei({ id: 'g', startplaetze: 2 }, tns), 0);
  assert.equal(frei({ id: 'g', startplaetze: 1 }, tns), 0, 'nie negativ');
  assert.equal(naechsteStartnummer(tns), 2, 'Nummer einer Stornierung wird wieder frei');
  assert.equal(naechsteStartnummer([]), 1);
  assert.deepEqual([...vergebeneLeih(tns)].sort(), ['f1', 'f4']);
  assert.deepEqual([...vergebeneLeih(tns, 'a')], ['f4']);
  assert.deepEqual([...BELEGEND].sort(), ['angemeldet', 'bestaetigt', 'freigegeben', 'teilgenommen']);
  assert.ok(SQL.includes("v_belegend constant text[] := array['angemeldet', 'bestaetigt', 'freigegeben', 'teilgenommen']"));
  assert.ok(SQL.includes("pg_advisory_xact_lock(hashtext('ms_gruppe:' || new.gruppe_id::text))"));
});

test('Teilnehmer prüfen: eigenes Fahrzeug, Leihfahrzeug, Minderjährige, Startnummer', () => {
  const F = { name: ' Anna Test ', email: 'anna@test.de', telefon: '', kontaktId: '', minderjaehrig: false, sorgeberechtigt: '', startnummer: '7', fahrzeugArt: 'eigen', eigenesFahrzeug: 'Porsche 911 GT3', mietFahrzeugId: '', leihPreis: '', leihBrutto: true, notiz: '' };
  const p = teilnehmerPruefen(F, false);
  assert.ok(p.ok); assert.equal(p.zeile.name, 'Anna Test'); assert.equal(p.zeile.startnummer, 7); assert.equal(p.zeile.miet_fahrzeug_id, null); assert.equal(p.zeile.leih_netto_cent, 0);
  assert.equal(teilnehmerPruefen({ ...F, startnummer: '' }, false).zeile.startnummer, null);
  const l = teilnehmerPruefen({ ...F, fahrzeugArt: 'leih', mietFahrzeugId: ID, leihPreis: '119', eigenesFahrzeug: 'bleibt weg' }, false);
  assert.ok(l.ok); assert.equal(l.zeile.leih_netto_cent, 10000); assert.equal(l.zeile.eigenes_fahrzeug, null); assert.equal(l.zeile.miet_fahrzeug_id, ID);
  assert.equal(teilnehmerPruefen({ ...F, fahrzeugArt: 'leih', mietFahrzeugId: ID, leihPreis: '119' }, true).zeile.leih_netto_cent, 11900);
  const k = teilnehmerPruefen({ ...F, minderjaehrig: true, sorgeberechtigt: 'Mama Test' }, false);
  assert.ok(k.ok); assert.equal(k.zeile.sorgeberechtigt_name, 'Mama Test');
  assert.equal(teilnehmerPruefen({ ...F, sorgeberechtigt: 'Mama' }, false).zeile.sorgeberechtigt_name, null);
  for (const [k2, v] of [['name', 'A'], ['email', 'kein-mail'], ['startnummer', '0'], ['startnummer', '10000'], ['fahrzeugArt', 'flug'], ['kontaktId', 'x']]) {
    assert.equal(teilnehmerPruefen({ ...F, [k2]: v }, false).ok, false, `${k2}=${v}`);
  }
  assert.equal(teilnehmerPruefen({ ...F, minderjaehrig: true }, false).ok, false, 'Minderjährig ohne Sorgeberechtigte');
  assert.equal(teilnehmerPruefen({ ...F, fahrzeugArt: 'leih' }, false).ok, false, 'Leih ohne Fahrzeug');
  assert.equal(teilnehmerPruefen({ ...F, fahrzeugArt: 'leih', mietFahrzeugId: ID, leihPreis: 'x' }, false).ok, false);
  assert.ok(SQL.includes("check ((fahrzeug_art = 'leih') = (miet_fahrzeug_id is not null))"));
  assert.ok(SQL.includes('check (not minderjaehrig or sorgeberechtigt_name is not null)'));
});

test('Startfreigabe: was fehlt — gleiche Reihenfolge und Pflichten wie die Datenbank', () => {
  assert.deepEqual(freigabeFehlt(TN, EV, true), []);
  assert.deepEqual(freigabeFehlt({ ...TN, verzicht_token: null }, EV, false), ['Haftungsverzicht versenden']);
  assert.deepEqual(freigabeFehlt(TN, EV, false), ['Haftungsverzicht unterschreiben lassen']);
  assert.deepEqual(freigabeFehlt({ ...TN, startnummer: null, alter_geprueft: false, fuehrerschein_geprueft: false, briefing: false }, EV, true),
    ['Startnummer', 'Alter (ab 18) prüfen', 'Führerschein prüfen', 'Fahrerbesprechung']);
  assert.deepEqual(freigabeFehlt({ ...TN, alter_geprueft: false, fuehrerschein_geprueft: false, briefing: false }, { ...EV, mindestalter: 0, fuehrerschein_pflicht: false, briefing_pflicht: false }, true), []);
  assert.deepEqual(freigabeFehlt({ ...TN, eigenes_fahrzeug: ' ' }, EV, true), ['eigenes Fahrzeug eintragen']);
  assert.deepEqual(freigabeFehlt({ ...TN, status: 'angemeldet' }, EV, true), ['Anmeldung zuerst bestätigen']);
  assert.deepEqual(freigabeFehlt(TN, { ...EV, status: 'abgesagt' }, true), ['Event abgesagt']);
  for (const t of ['Bitte zuerst eine Startnummer vergeben.', 'Der Haftungsverzicht ist noch nicht unterschrieben.', 'Bitte den Führerschein prüfen und abhaken.', 'Bitte die Teilnahme an der Fahrerbesprechung abhaken.', 'Bitte das eigene Fahrzeug eintragen.']) {
    assert.ok(SQL.includes(t), t);
  }
  // Statuswege wie die Datenbank
  assert.deepEqual([...tnWeiter('bestaetigt')], ['angemeldet', 'warteliste', 'freigegeben', 'storniert']);
  assert.deepEqual([...tnWeiter('freigegeben')], ['bestaetigt', 'teilgenommen', 'storniert']);
  assert.deepEqual([...tnWeiter('teilgenommen')], []);
  assert.deepEqual([...tnWeiter('storniert')], []);
  assert.ok(SQL.includes("(old.status = 'freigegeben' and new.status in ('bestaetigt', 'teilgenommen', 'storniert'))"));
  for (const k of Object.keys(TN_STATUS)) assert.ok(SQL.includes(`'${k}'`), k);
  assert.ok(SQL.includes("s.status = 'signiert'"));
});

test('Gäste: Prüfung, Sponsor-Betrag nur bei Sponsoren, Boxengasse nur mit Verzicht', () => {
  const F = { art: 'sponsor', name: 'Reifen GmbH', firma: '', email: '', personen: '3', bereich: 'boxengasse', leistung: 'Logo auf Startnummern', betrag: '2.500', notiz: '' };
  const p = gastPruefen(F);
  assert.ok(p.ok); assert.equal(p.zeile.betrag_netto_cent, 250000); assert.equal(p.zeile.personen, 3);
  assert.equal(gastPruefen({ ...F, art: 'gast' }).zeile.betrag_netto_cent, null);
  for (const [k, v] of [['art', 'vip'], ['name', 'R'], ['personen', '51'], ['bereich', 'kontrollturm'], ['betrag', 'x'], ['email', 'nix']]) {
    assert.equal(gastPruefen({ ...F, [k]: v }).ok, false, `${k}=${v}`);
  }
  assert.equal(akkreditierFehlt({ bereich: 'boxengasse', verzicht_token: null, akkreditiert_am: null }, false), 'Boxengasse: Haftungsverzicht muss unterschrieben sein');
  assert.equal(akkreditierFehlt({ bereich: 'boxengasse', verzicht_token: 't', akkreditiert_am: null }, false), 'Boxengasse: Haftungsverzicht muss unterschrieben sein');
  assert.equal(akkreditierFehlt({ bereich: 'boxengasse', verzicht_token: 't', akkreditiert_am: null }, true), null);
  assert.equal(akkreditierFehlt({ bereich: 'tribuene', verzicht_token: null, akkreditiert_am: null }, false), null);
  assert.equal(akkreditierFehlt({ bereich: 'tribuene', verzicht_token: null, akkreditiert_am: '2026-11-10' }, false), 'bereits akkreditiert');
  for (const a of [...GAST_ARTEN, ...BEREICHE]) assert.ok(SQL.includes(`'${a.key}'`), a.key);
  assert.ok(SQL.includes('Für die Boxengasse muss der Haftungsverzicht unterschrieben sein.'));
});

test('Teile mit Laufzeit: Prüfung, Stand ab Einbau bis Tausch, Ampel 80 %/100 %', () => {
  const H = '2026-10-09';
  const F = { mietFahrzeugId: ID, bezeichnung: 'Motor X30', kategorie: 'motor', seriennummer: '', einheit: 'stunden', grenze: '30', startwert: '4,5', eingebautAm: '2026-10-01', notiz: '' };
  const p = teilPruefen(F, H);
  assert.ok(p.ok); assert.equal(p.zeile.grenze, 30); assert.equal(p.zeile.startwert, 4.5);
  for (const [k, v] of [['mietFahrzeugId', 'x'], ['bezeichnung', 'M'], ['kategorie', 'auspuff'], ['einheit', 'km'], ['grenze', '0'], ['grenze', ''], ['startwert', '-1'], ['eingebautAm', '2026-10-10'], ['eingebautAm', '2026-02-30']]) {
    assert.equal(teilPruefen({ ...F, [k]: v }, H).ok, false, `${k}=${v}`);
  }
  assert.equal(teilPruefen({ ...F, einheit: 'runden', grenze: '500,5' }, H).ok, false, 'Runden ganzzahlig');
  assert.ok(teilPruefen({ ...F, startwert: '' }, H).ok);
  for (const k of [...TEIL_KATEGORIEN, ...EINHEITEN]) assert.ok(SQL.includes(`'${k.key}'`), k.key);

  const E = { mietFahrzeugId: ID, eventId: '', datum: '2026-10-05', stunden: '2,5', runden: '40', notiz: '' };
  const e = einsatzPruefen(E, H);
  assert.ok(e.ok); assert.equal(e.zeile.stunden, 2.5); assert.equal(e.zeile.runden, 40); assert.equal(e.zeile.event_id, null);
  for (const [k, v] of [['datum', '2026-10-10'], ['stunden', '49'], ['runden', '1,5'], ['eventId', 'x']]) assert.equal(einsatzPruefen({ ...E, [k]: v }, H).ok, false, `${k}=${v}`);
  assert.equal(einsatzPruefen({ ...E, stunden: '', runden: '' }, H).ok, false);

  const teil = { id: 't', miet_fahrzeug_id: ID, einheit: 'stunden', grenze: 30, startwert: 4.5, eingebaut_am: '2026-10-01', ausgebaut_am: null };
  const eins = [
    { miet_fahrzeug_id: ID, datum: '2026-09-30', stunden: 99, runden: 999 },   // vor dem Einbau
    { miet_fahrzeug_id: ID, datum: '2026-10-01', stunden: '10.5', runden: 100 }, // Einbautag zählt (Text wie aus der Datenbank)
    { miet_fahrzeug_id: ID, datum: '2026-10-05', stunden: 9, runden: 80 },
    { miet_fahrzeug_id: ID2, datum: '2026-10-05', stunden: 50, runden: 500 },  // anderes Fahrzeug
  ];
  assert.deepEqual(laufzeit(teil, eins), { verbraucht: 24, rest: 6, anteil: 0.8, ampel: 'bald' });
  assert.equal(laufzeit({ ...teil, grenze: 24 }, eins).ampel, 'ueber');
  assert.equal(laufzeit({ ...teil, grenze: 100 }, eins).ampel, 'ok');
  assert.equal(laufzeit({ ...teil, ausgebaut_am: '2026-10-04' }, eins).verbraucht, 15, 'nach dem Tausch zählt nichts mehr');
  assert.equal(laufzeit({ ...teil, einheit: 'runden', grenze: 200, startwert: 0 }, eins).verbraucht, 180);
  assert.equal(laufzeitText(24, 'stunden'), '24 h');
  assert.equal(laufzeitText(1250, 'runden'), '1.250 Runden');
  assert.equal(laufzeitText(2.25, 'stunden'), '2,25 h');
});

test('Rechnung: Positionen, Summe wie steuerGruppen, nicht für Warteliste/Storno/kostenlos', () => {
  assert.ok(tnRechnungMoeglich(TN).ok);
  assert.equal(tnRechnungMoeglich({ ...TN, status: 'warteliste' }).ok, false);
  assert.equal(tnRechnungMoeglich({ ...TN, status: 'storniert' }).ok, false);
  assert.equal(tnRechnungMoeglich({ ...TN, startgeld_netto_cent: 0 }).ok, false);
  const p = tnPosten({ ...TN, leih_netto_cent: 10000 }, EV, 'Einsteiger', 'Cup-Auto 1');
  assert.equal(p.length, 2);
  assert.equal(p[0].bezeichnung, 'Startplatz Trackday Test am 10.11.2026, Hockenheimring — Gruppe Einsteiger, Startnummer 7');
  assert.equal(p[1].bezeichnung, 'Leihfahrzeug Cup-Auto 1 für Trackday Test am 10.11.2026');
  assert.equal(tnPosten({ ...TN, startgeld_netto_cent: 0, leih_netto_cent: 500 }, EV, 'G', null).length, 1);
  const sm = summe(p, 19);
  const sg = steuerGruppen(p.map((x) => ({ netto: x.summe_cent / 100, satz: 19 })));
  assert.equal(sm.netto_cent, 35000); assert.equal(sm.steuer_cent, Math.round(sg.steuer * 100)); assert.equal(sm.brutto_cent, Math.round(sg.brutto * 100));
  assert.deepEqual(summe(p, 0), { netto_cent: 35000, steuer_cent: 0, brutto_cent: 35000 });
  // Route: Betrieb, Recht, Doppel-Schutz, storniert statt gelöscht
  const r = lies('app/api/rechnung-aus-trackday/route.ts');
  assert.ok(r.includes('const abr = await abrechnungPruefen(supabase, user.id);'));
  assert.ok(r.includes('status: 409'));
  assert.ok(r.includes('zahlungsstatus: "storniert"'));
  assert.ok(r.includes('.eq("owner_user_id", betrieb)'));
  assert.ok(r.includes('kleinunternehmer: klein'));
  assert.ok(!/from\(["']rechnungen["']\)\.delete/.test(r));
  assert.ok(SQL.includes('Für Warteliste und Stornierungen entsteht keine Rechnung.'));
});

test('Kennzahlen: kommende Events, belegt, Warteliste, Umsatz', () => {
  const jetzt = Date.parse('2026-11-01T00:00:00Z');
  const events = [
    { id: 'a', status: 'offen', beginn: '2026-11-10T07:00:00Z', ende: '2026-11-10T17:00:00Z' },
    { id: 'b', status: 'beendet', beginn: '2026-10-01T07:00:00Z', ende: '2026-10-01T17:00:00Z' },
    { id: 'c', status: 'abgesagt', beginn: '2026-11-20T07:00:00Z', ende: '2026-11-20T17:00:00Z' },
  ];
  const tns = [
    { event_id: 'a', status: 'angemeldet', startgeld_netto_cent: 100, leih_netto_cent: 50 },
    { event_id: 'a', status: 'warteliste', startgeld_netto_cent: 100, leih_netto_cent: 0 },
    { event_id: 'b', status: 'teilgenommen', startgeld_netto_cent: 200, leih_netto_cent: 0 },
    { event_id: 'b', status: 'storniert', startgeld_netto_cent: 999, leih_netto_cent: 0 },
  ];
  assert.deepEqual(kennzahlen(events, tns, jetzt), { kommend: 1, teilnehmer: 1, warteliste: 1, umsatzNetto: 350 });
});

test('SQL: additiv, Wächter, Kontrolle, Rechte „Veranstaltungen", Löschen nur Chef, Vermietung gesperrt', () => {
  assert.ok(!/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b|\bdrop\s+column\b/i.test(SQL));
  assert.ok(SQL.includes('-- KONTROLLE (nur lesen) — Erwartung: 6 | 24 | 7 | 2 | 6 | t'));
  assert.equal((SQL.match(/for delete/g) || []).length, 0, 'keine Lösch-Regel für Mitarbeiter');
  assert.ok(SQL.includes("public.darf_ich_modul_aendern(''veranstaltungen'')"));
  assert.ok(SQL.includes("foreach t in array array['ms_event', 'ms_gruppe', 'ms_teilnehmer', 'ms_gast', 'ms_teil', 'ms_einsatz'] loop"));
  assert.ok(SQL.includes('AUSSPERR-RISIKO: keines'));
  assert.ok(SQL.includes('create trigger p296_miet_event_sperre_trg before insert or update on public.miet_buchung'));
  assert.ok(SQL.includes("pg_get_constraintdef(oid) like '%anhaenger%'"), 'alte Art-Prüfung wird unabhängig vom Namen ersetzt');
  // Alle Funktionen security definer + für Rollen gesperrt
  const fn = SQL.match(/create or replace function public\.(p296_\w+)/g) || [];
  assert.equal(fn.length, 9);
  for (const f of fn) {
    const name = f.replace('create or replace function public.', '');
    assert.ok(SQL.includes(`revoke all on function public.${name}(`), name);
  }
  assert.equal((SQL.match(/security definer/g) || []).length, 9);
  // Fahrzeug-Arten: SQL-Liste = ARTEN in lib/fahrzeugMiete
  const liste = SQL.match(/check \(art in \(([^)]*)\)\);/)[1];
  assert.deepEqual(liste.split(',').map((x) => x.trim().replace(/'/g, '')), ARTEN.map((a) => a.key));
});

test('Mietflotte: Kart und Rennfahrzeug, nie auf der öffentlichen Mietseite', () => {
  assert.deepEqual([...NUR_STRECKE], ['kart', 'rennfahrzeug']);
  for (const k of NUR_STRECKE) assert.ok(ARTEN.some((a) => a.key === k), k);
  const roh = { id: ID, bezeichnung: 'Kart 1', art: 'kart', aktiv: true, tagessatz_cent: 5000 };
  assert.equal(oeffentlich(roh), null);
  assert.equal(oeffentlich({ ...roh, art: 'rennfahrzeug' }), null);
  assert.equal(oeffentlich({ ...roh, art: 'pkw' }).art, 'pkw');
});

test('Menü, Assistent, Seiten, Link aus Veranstaltungen', () => {
  const rechte = lies('lib/rechte.ts');
  assert.ok(rechte.includes("href: '/dashboard/veranstaltungen/motorsport', ebene: 3"));
  assert.ok(rechte.includes("href: '/dashboard/veranstaltungen/motorsport/teile', ebene: 3"));
  const g = lies('lib/guideWissen.ts');
  assert.ok(g.includes("'/dashboard/veranstaltungen/motorsport': {") && g.includes("'/dashboard/veranstaltungen/motorsport/teile': {"));
  assert.ok(lies('app/dashboard/veranstaltungen/page.tsx').includes('href="/dashboard/veranstaltungen/motorsport"'));
  const seiten = ['app/dashboard/veranstaltungen/motorsport/page.tsx', 'app/dashboard/veranstaltungen/motorsport/[id]/page.tsx', 'app/dashboard/veranstaltungen/motorsport/teile/page.tsx'];
  for (const p of seiten) assert.match(lies(p), /So geht&apos;s/, p);
  const t = lies('app/dashboard/veranstaltungen/motorsport/_teile/Teilnehmer.tsx');
  assert.ok(t.includes('useDarfAbrechnen()') && t.includes('darfAbrechnen !== false') && t.includes("'/api/rechnung-aus-trackday'"));
  assert.ok(t.includes('signaturStarten(supabase, ev.owner_user_id'), 'Signatur gehört dem Betrieb');
  const alles = seiten.map(lies).join('') + t + lies('app/dashboard/veranstaltungen/motorsport/_teile/Gaeste.tsx') + lies('app/dashboard/veranstaltungen/motorsport/_teile/Laufzeit.tsx') + lies('app/dashboard/veranstaltungen/motorsport/[id]/starterliste/page.tsx');
  assert.ok(!/KI-Agent|KI-Crew/.test(alles));
  assert.ok(!/\bdu\b|\bdein\b|\bdeine\b/i.test(alles.replace(/\/\/.*$/gm, '')), 'Kundentexte mit „Sie"');
  // Starterliste hängt aus: keine Kontaktdaten, keine Preise
  const sl = lies('app/dashboard/veranstaltungen/motorsport/[id]/starterliste/page.tsx');
  assert.ok(!/email|telefon|_cent/.test(sl.split('export default')[1]));
});
