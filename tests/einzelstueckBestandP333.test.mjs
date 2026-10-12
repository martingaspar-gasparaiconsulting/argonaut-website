// ============================================================================
// tests/einzelstueckBestandP333.test.mjs — Paket 333 (12.10.2026)
// BV2b Teil 2: Bestandsliste und Formular nach Art des Einzelstücks
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  stueckArt, formFelder, datumAusEingabe, datumText, datumFuerForm, datumZaehler, kennungText,
  merkmaleKurz, spaltenNachArt, stueckZeile, merkmaleFuerForm, suchPlatzhalter, artAuswahl,
} from '../out/einzelstueckBestand.js';
import { vorlageFuer } from '../out/branchenVorlage.js';
import { listenZeilen, passtSuche } from '../out/kfzBestand.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const form = (x = {}) => ({
  art: 'kfz', marke: 'Porsche', modell: '911', variante: '', sparte: '', status: 'bestand', fin: '', seriennr: '', kennzeichen: '',
  ez: '', km: '', bh: '', kw: '', kraftstoff: '', farbe: '', farbcode: '', standort_id: '', eingang_am: '2026-10-12',
  ek: '', vk: '', besteuerung: '25a', notiz: '', merkmale: {}, ...x,
});
const OPT = { mitArt: true, heute: '2026-10-12' };

test('Art je Stück: gespeichert vor Betrieb vor kfz', () => {
  assert.equal(stueckArt({ art: 'boot' }, 'maschine'), 'boot');
  assert.equal(stueckArt({ art: null }, 'maschine'), 'maschine');
  assert.equal(stueckArt({ art: 'quatsch' }, null), 'kfz');
  assert.equal(stueckArt(undefined, undefined), 'kfz');
  assert.equal(artAuswahl().length, 7);
});

test('Formularfelder je Art; ohne SQL p332 alles wie Kfz', () => {
  assert.deepEqual(formFelder('kfz', true), { fin: true, seriennr: false, kennzeichen: true, km: true, bh: false, kfzTechnik: true });
  assert.deepEqual(formFelder('boot', true), { fin: false, seriennr: true, kennzeichen: false, km: false, bh: true, kfzTechnik: false });
  assert.deepEqual(formFelder('maschine', true), { fin: false, seriennr: true, kennzeichen: true, km: false, bh: true, kfzTechnik: false });
  assert.equal(formFelder('uhr_schmuck', true).km || formFelder('uhr_schmuck', true).bh, false, 'Uhren ohne Zähler');
  assert.deepEqual(formFelder('boot', false), formFelder('kfz', true), 'ohne p332 wie bisher');
});

test('Datum: Kfz nur Monat/Jahr, andere Arten auch nur Jahr; Anzeige passend', () => {
  assert.equal(datumAusEingabe('kfz', '03/2022'), '2022-03-01');
  assert.equal(datumAusEingabe('kfz', '2022'), null, 'Erstzulassung braucht den Monat');
  assert.equal(datumAusEingabe('kunst_antik', '1890'), '1890-01-01');
  assert.equal(datumAusEingabe('boot', '05/2019'), '2019-05-01');
  assert.equal(datumAusEingabe('boot', '0999'), null);
  assert.equal(datumAusEingabe('boot', '13/2019'), null);
  assert.equal(datumText('kfz', '2022-03-01'), '03/2022');
  assert.equal(datumText('kunst_antik', '1890-01-01'), '1890');
  assert.equal(datumText('boot', '2019-05-01'), '05/2019');
  assert.equal(datumFuerForm('boot', null), '');
  assert.equal(datumAusEingabe('boot', datumFuerForm('boot', '2019-01-01')), '2019-01-01', 'Rundreise Formular');
});

test('Liste: Datum · Zähler und Kennung in den Wörtern der Art', () => {
  assert.equal(datumZaehler('kfz', { erstzulassung: '2022-03-01', km_stand: 18400 }), '03/2022 · 18.400 km');
  assert.equal(datumZaehler('maschine', { erstzulassung: '2018-01-01', km_stand: 999, betriebsstunden: 4250 }), '2018 · 4.250 Bh');
  assert.equal(datumZaehler('uhr_schmuck', { erstzulassung: '2015-01-01', km_stand: null }), '2015');
  assert.equal(datumZaehler('boot', { erstzulassung: null, km_stand: null, betriebsstunden: null }), '— · —');
  assert.equal(kennungText('kfz', { fin: 'WP0ZZZ99ZTS392124', seriennr: 'X' }), 'WP0ZZZ99ZTS392124');
  assert.equal(kennungText('boot', { fin: null, seriennr: 'DE-ABC12345D404' }), 'DE-ABC12345D404');
  assert.equal(kennungText('boot', { fin: 'ALT', seriennr: null }), 'ALT', 'alte FIN nicht verstecken');
  assert.equal(merkmaleKurz('boot', { laenge_m: 8.5, rumpf: 'GFK', trailer: true, kojen: 4 }), 'Länge 8,5 m · Rumpf GFK · Kojen 4');
  assert.equal(merkmaleKurz('boot', { trailer: true }), 'Mit Trailer');
  assert.equal(merkmaleKurz('boot', { fremd: 'x', trailer: false }), '', 'Unbekanntes und „nein" nicht zeigen');
  assert.equal(merkmaleKurz('kfz', null), '');
});

test('Spalten nach Art: Wörter, Kennzeichen nur mit Zulassung, Merkmale abwählbar', () => {
  const sp = vorlageFuer('kfz-bestand', 'Autohaus').spalten;
  assert.deepEqual(spaltenNachArt(sp, 'kfz', true), sp, 'Kfz unverändert');
  assert.deepEqual(spaltenNachArt(sp, 'boot', false), sp, 'ohne p332 unverändert');
  const b = spaltenNachArt(sp, 'boot', true);
  assert.equal(b.find((x) => x.key === 'fahrzeug').label, 'Boot');
  assert.equal(b.find((x) => x.key === 'ez_km').label, 'Baujahr · Bh');
  assert.equal(b.find((x) => x.key === 'fin').label, 'Rumpfnummer (HIN/CIN)');
  assert.ok(!b.some((x) => x.key === 'kennzeichen'));
  assert.equal(b[1].key, 'merkmale', 'Merkmale gleich hinter dem Stück');
  assert.equal(b[1].sichtbar, true);
  assert.equal(spaltenNachArt(sp, 'boot', true, { merkmale: false })[1].sichtbar, false);
  assert.ok(spaltenNachArt(sp, 'maschine', true).some((x) => x.key === 'kennzeichen'), 'Maschinen können ein Kennzeichen haben');
  assert.equal(spaltenNachArt(sp, 'uhr_schmuck', true).find((x) => x.key === 'ez_km').label, 'Herstellungsjahr');
  assert.equal(sp.find((x) => x.key === 'fahrzeug').label, 'Fahrzeug', 'Vorlage selbst unverändert');
});

test('Zeile: Kfz wie bisher (FIN geprüft, alle Kfz-Felder)', () => {
  const r = stueckZeile(form({ fin: 'wp0zzz99zts392124', kennzeichen: 'bb-am 911', ez: '03/2022', km: '18.400', kw: '331', vk: '134.900,00' }), OPT);
  assert.equal(r.ok, true);
  assert.equal(r.zeile.fin, 'WP0ZZZ99ZTS392124');
  assert.equal(r.zeile.kennzeichen, 'BB-AM 911');
  assert.equal(r.zeile.erstzulassung, '2022-03-01');
  assert.equal(r.zeile.km_stand, 18400);
  assert.equal(r.zeile.leistung_kw, 331);
  assert.equal(r.zeile.vk_brutto, 134900);
  assert.equal(r.zeile.art, 'kfz');
  assert.deepEqual(r.zeile.merkmale, {});
  assert.ok(!('seriennr' in r.zeile) && !('betriebsstunden' in r.zeile));
  assert.equal(stueckZeile(form({ fin: 'WP0ZZZ99ZTS39212' }), OPT).ok, false, 'FIN mit 16 Zeichen abgelehnt');
  assert.equal(stueckZeile(form({ art: 'quatsch' }), OPT).zeile.art, 'kfz', 'unbekannte Art nie in die Datenbank');
});

test('Zeile: Boot schreibt nur Boot-Felder — FIN, Kennzeichen, km, kW bleiben unberührt', () => {
  const r = stueckZeile(form({ art: 'boot', marke: 'Bavaria', modell: 'C42', seriennr: 'DE-BAV42001A626', ez: '2019', bh: '1.250', fin: 'egal', kennzeichen: 'X', km: '5', kw: '9',
    merkmale: { laenge_m: '12,5', rumpf: 'GFK', trailer: false, fremd: 'weg' } }), OPT);
  assert.equal(r.ok, true);
  for (const k of ['fin', 'kennzeichen', 'km_stand', 'leistung_kw', 'kraftstoff', 'farbcode']) assert.ok(!(k in r.zeile), `${k} darf nicht geschrieben werden`);
  assert.equal(r.zeile.seriennr, 'DE-BAV42001A626');
  assert.equal(r.zeile.betriebsstunden, 1250);
  assert.equal(r.zeile.erstzulassung, '2019-01-01');
  assert.deepEqual(r.zeile.merkmale, { laenge_m: 12.5, rumpf: 'GFK', trailer: false });
  assert.equal(r.zeile.art, 'boot');
});

test('Zeile: Fehler werden gemeldet, nicht verschluckt', () => {
  assert.match(stueckZeile(form({ art: 'kunst_antik', marke: '', modell: '' }), OPT).fehler, /Künstler \/ Manufaktur oder Titel \/ Objekt/);
  assert.match(stueckZeile(form({ marke: '', modell: '' }), { ...OPT, mitArt: false }).fehler, /Marke oder Modell/);
  assert.match(stueckZeile(form({ art: 'boot', merkmale: { laenge_m: '500' } }), OPT).fehler, /Länge/);
  assert.match(stueckZeile(form({ art: 'maschine', bh: 'viel' }), OPT).fehler, /Betriebsstunden/);
  assert.match(stueckZeile(form({ art: 'maschine', bh: '300000' }), OPT).fehler, /200\.000/);
  assert.match(stueckZeile(form({ art: 'uhr_schmuck', seriennr: 'A#1' }), OPT).fehler, /Kennung/);
  assert.match(stueckZeile(form({ art: 'boot', ez: 'früher' }), OPT).fehler, /Baujahr/);
  assert.match(stueckZeile(form({ ez: '2022' }), OPT).fehler, /Erstzulassung/);
});

test('Zeile ohne SQL p332: keine neuen Spalten, Art im Formular wird ignoriert', () => {
  const r = stueckZeile(form({ art: 'boot', fin: '', km: '12' }), { ...OPT, mitArt: false });
  assert.equal(r.ok, true);
  for (const k of ['art', 'merkmale', 'betriebsstunden', 'seriennr']) assert.ok(!(k in r.zeile), k);
  assert.equal(r.zeile.km_stand, 12);
  assert.ok('fin' in r.zeile);
});

test('Verkauft: altes Verkaufsdatum bleibt, sonst heute', () => {
  assert.equal(stueckZeile(form({ status: 'verkauft' }), { ...OPT, verkauftAmAlt: '2026-09-01' }).zeile.verkauft_am, '2026-09-01');
  assert.equal(stueckZeile(form({ status: 'verkauft' }), OPT).zeile.verkauft_am, '2026-10-12');
  assert.equal(stueckZeile(form({ status: 'bestand' }), { ...OPT, verkauftAmAlt: '2026-09-01' }).zeile.verkauft_am, null);
});

test('Merkmale fürs Formular: Komma, ja/nein, Fremdes fällt weg', () => {
  assert.deepEqual(merkmaleFuerForm('boot', { laenge_m: 12.5, trailer: true, fremd: 1 }), { laenge_m: '12,5', trailer: true });
  const zurueck = stueckZeile(form({ art: 'boot', merkmale: merkmaleFuerForm('boot', { laenge_m: 12.5, trailer: true }) }), OPT);
  assert.deepEqual(zurueck.zeile.merkmale, { laenge_m: 12.5, trailer: true }, 'Rundreise ohne Verlust');
});

test('PDF-Zeilen und Suche kennen die Art', () => {
  const b = { id: 'a', interne_nr: 'F-0002', status: 'bestand', marke: 'Linde', modell: 'H30', variante: null, kennzeichen: null, fin: null, seriennr: 'SN 4711', art: 'maschine',
    erstzulassung: '2017-01-01', km_stand: null, betriebsstunden: 8120, standort_id: null, eingang_am: '2026-10-01', verkauft_am: null, vk_brutto: 18900, ek_netto: null };
  const z = listenZeilen([b], '2026-10-12', () => '—', () => 'Im Bestand', { datumZaehler: (x) => datumZaehler('maschine', x), kennung: (x) => kennungText('maschine', x) });
  assert.equal(z[0].ezKm, '2017 · 8.120 Bh');
  assert.equal(z[0].kennzeichen, 'SN 4711');
  assert.ok(passtSuche(b, '4711'), 'Seriennummer durchsuchbar');
  assert.match(suchPlatzhalter('boot', true), /Rumpfnummer/);
  assert.match(suchPlatzhalter('boot', false), /FIN/);
});

test('Seite: Rückfall ohne SQL p332, Art-Wörter, keine Du-Anrede', () => {
  const s = lies('app/dashboard/kfz/bestand/page.tsx');
  assert.match(s, /select\(`\$\{SPALTEN\}, \$\{SPALTEN_P332\}`\)/);
  assert.match(s, /setMitArt\(false\)/);
  assert.match(s, /stueckZeile\(form, \{ mitArt,/);
  assert.match(s, /spaltenNachArt\(vorlage\.spalten, betriebArt, mitArt, einstellung\?\.spaltenSichtbar\)/);
  assert.match(s, /\{ff\.fin && <Feld l="FIN/);
  assert.match(s, /\{ff\.seriennr && /);
  assert.match(s, /\{ff\.kennzeichen && /);
  assert.doesNotMatch(s, /Neues \$\{vorlage\.einheit\}/, 'keine falsche Beugung („Neues Maschine")');
  assert.doesNotMatch(s, /\bdu\b|\bdein|KI-Agent/i);
});
