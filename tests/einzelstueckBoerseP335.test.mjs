// ============================================================================
// tests/einzelstueckBoerseP335.test.mjs — Paket 335 (12.10.2026)
// BV2b Teil 4: Börse und Inserat nach Art des Einzelstücks
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BOERSE_SPALTEN, BOERSE_SPALTEN_P332, NIE_OEFFENTLICH, oeffentlich, fakten, kurzZeile, energieZeilen, strukturDaten, fahrzeugName,
} from '../out/kfzBoerse.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ID = '11111111-2222-4333-8444-555555555555';
const boot = (x = {}) => ({
  id: ID, interne_nr: 'F-0012', status: 'bestand', sparte: 'Segelboot', marke: 'Bavaria', modell: 'C42', variante: null,
  erstzulassung: '2019-01-01', km_stand: 777, leistung_kw: 40, kraftstoff: 'Diesel', farbe: 'Weiß', vk_brutto: 189000, besteuerung: '25a',
  inseriert: true, ausstattung: ['Autopilot'], polster: 'Leder', vorbesitzer: 1, hu_bis: '2027-01-01',
  vorschaden: 'keine_bekannt', vorschaden_text: null, inserat_titel: null, inserat_text: 'Gepflegt.',
  verbrauch_komb: 3, verbrauch_einheit: 'l', co2_g_km: 99, co2_klasse: 'C', aktualisiert_am: '2026-10-12T08:00:00Z',
  art: 'boot', betriebsstunden: 1250, seriennr: 'DE-BAV42001A626', fin: null, kennzeichen: null, ek_netto: 150000, notiz: 'intern',
  merkmale: { laenge_m: 12.5, rumpf: 'GFK', trailer: false, liegeplatz: 'Steg 4 Konstanz', fremd: '<b>x</b>' }, ...x,
});

test('Spalten: Art, Merkmale, Betriebsstunden dazu — Seriennummer nie', () => {
  assert.equal(BOERSE_SPALTEN_P332, BOERSE_SPALTEN + ', art, merkmale, betriebsstunden');
  assert.ok(NIE_OEFFENTLICH.includes('seriennr'));
  for (const feld of NIE_OEFFENTLICH) assert.ok(!BOERSE_SPALTEN_P332.split(',').map((x) => x.trim()).includes(feld), feld);
  const f = oeffentlich(boot());
  for (const feld of NIE_OEFFENTLICH) assert.ok(!(feld in f), `${feld} darf nicht öffentlich sein`);
});

test('Boot: keine Kfz-Angaben, Betriebsstunden und nur öffentliche Merkmale', () => {
  const f = oeffentlich(boot());
  assert.equal(f.art, 'boot');
  for (const k of ['leistung_kw', 'kraftstoff', 'polster', 'verbrauch_komb', 'co2_g_km', 'co2_klasse', 'km_stand', 'hu_bis']) assert.equal(f[k], null, k);
  assert.deepEqual(energieZeilen(f), [], 'keine CO₂-Angaben beim Boot');
  assert.equal(f.betriebsstunden, 1250);
  assert.deepEqual(f.merkmale, [{ label: 'Länge', text: '12,5 m' }, { label: 'Rumpf', text: 'GFK' }, { label: 'Mit Trailer', text: 'nein' }]);
  assert.ok(!JSON.stringify(f).includes('Steg 4'), 'Liegeplatz ist intern');
  assert.ok(!JSON.stringify(f).includes('<b>'), 'unbekannte Schlüssel fallen weg');
});

test('Fakten und Kurzzeile in den Wörtern der Art', () => {
  const fa = Object.fromEntries(fakten(oeffentlich(boot())));
  assert.equal(fa['Baujahr'], '2019');
  assert.equal(fa['Betriebsstunden'], '1.250 Bh');
  assert.equal(fa['Länge'], '12,5 m');
  assert.equal(fa['Unfall'], 'Keine Unfallschäden bekannt');
  assert.equal(fa['Nr.'], 'F-0012');
  assert.ok(!('Erstzulassung' in fa) && !('Kilometerstand' in fa) && !('Leistung' in fa) && !('HU bis' in fa) && !('Polster' in fa));
  assert.equal(kurzZeile(oeffentlich(boot())), 'Baujahr 2019 · 1.250 Bh · 12,5 m · GFK');
  const uhr = oeffentlich(boot({ art: 'uhr_schmuck', merkmale: { gattung: 'Armbanduhr', edelmetall: true }, erstzulassung: '2015-06-01' }));
  const fu = Object.fromEntries(fakten(uhr));
  assert.equal(fu['Herstellungsjahr'], '06/2015');
  assert.equal(fu['Schäden'], 'Keine Schäden bekannt', 'Uhr hat keinen Unfall');
  assert.ok(!('Betriebsstunden' in fu));
  assert.ok(!('Edelmetall als Anlage (Barren, Münzen, Altgold)' in fu), 'Edelmetall-Haken ist intern');
  assert.equal(kurzZeile(uhr), 'Herstellungsjahr 06/2015 · Armbanduhr');
  assert.equal(fahrzeugName({ marke: null, modell: null, variante: null, art: 'kunst_antik' }), 'Objekt');
  assert.equal(fahrzeugName({ marke: null, modell: null, variante: null }), 'Fahrzeug');
});

test('Fahrrad behält km; Maschine behält HU', () => {
  const r = oeffentlich(boot({ art: 'fahrrad', km_stand: 1200, merkmale: { e_bike: true } }));
  assert.equal(r.km_stand, 1200);
  assert.equal(r.betriebsstunden, null);
  assert.equal(Object.fromEntries(fakten(r))['Kilometerstand'], '1.200 km');
  const m = oeffentlich(boot({ art: 'maschine', merkmale: { maschinenart: 'Radlader' } }));
  assert.equal(m.hu_bis, '2027-01-01');
  assert.equal(m.kraftstoff, null);
});

test('Kfz und Altbestand ohne Art: unverändert', () => {
  const alt = oeffentlich(boot({ art: undefined, merkmale: undefined, betriebsstunden: undefined }));
  assert.equal(alt.art, undefined);
  assert.equal(alt.kraftstoff, 'Diesel');
  assert.equal(alt.co2_g_km, 99);
  assert.equal(alt.km_stand, 777);
  assert.ok(Object.fromEntries(fakten(alt))['Erstzulassung']);
  const kfz = oeffentlich(boot({ art: 'kfz' }));
  assert.equal(kfz.co2_klasse, 'C');
  assert.equal(kfz.merkmale, undefined);
});

test('Google: Einzelstück als Product ohne Zulassungsdatum, Verkäufer Organization', () => {
  const d = strukturDaten(oeffentlich(boot()), { basis: 'https://x.de', url: 'https://x.de/fahrzeuge/1', bilder: [], firma: 'Werft Muster', ort: 'Konstanz' });
  assert.equal(d['@type'], 'Product');
  assert.equal(d.dateVehicleFirstRegistered, undefined);
  assert.equal(d.mileageFromOdometer, undefined);
  assert.equal(d.vehicleEngine, undefined);
  assert.equal(d.offers.seller['@type'], 'Organization');
  const k = strukturDaten(oeffentlich(boot({ art: 'kfz' })), { basis: 'https://x.de', url: 'https://x.de/fahrzeuge/1', bilder: [], firma: 'A', ort: null });
  assert.equal(k['@type'], 'Car');
  assert.equal(k.offers.seller['@type'], 'AutoDealer');
});

test('Laden: zuerst mit Art, sonst wie bisher', () => {
  const l = lies('lib/kfzBoerseLaden.ts');
  assert.equal((l.match(/select\(BOERSE_SPALTEN_P332\)/g) || []).length, 2);
  assert.equal((l.match(/!mitArt\.error \? mitArt :/g) || []).length, 2);
});
