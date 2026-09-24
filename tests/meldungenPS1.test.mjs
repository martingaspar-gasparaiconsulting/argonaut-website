// Paket PS1 (24.09.2026) — Meldungen & Register im Nachweis-Motor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAPPEN, KATALOG, katalogArt, katalogFuer, vorschlaege, naechsterStichtag, bewerte, sortiere, radarKommend, VORSCHLAG_MAPPEN,
} from '../out/nachweisMotor.js';

const KSK = { tag: '03-31', ab: '01-01' };

test('neue Mappe Meldungen mit allen Registern, Schluessel eindeutig', () => {
  assert.ok(MAPPEN.some((m) => m.key === 'meldungen'));
  const keys = katalogFuer('meldungen').map((k) => k.key);
  for (const k of ['lucid_registrierung', 'lucid_datenmeldung', 'vollstaendigkeitserklaerung', 'ksk_meldung', 'mastr', 'netzanmeldung',
    'agrarantrag', 'azav_zulassung', 'azav_audit', 'intrastat', 'ear_registrierung', 'ear_monat', 'ear_jahr']) assert.ok(keys.includes(k), k);
  assert.equal(new Set(KATALOG.map((k) => k.key)).size, KATALOG.length);
  assert.ok(VORSCHLAG_MAPPEN.includes('meldungen'));
});

test('Stichtage stimmen mit dem Gesetz (Stand 24.09.2026)', () => {
  assert.deepEqual(katalogArt('ksk_meldung').stichtag, { tag: '03-31', ab: '01-01' });
  assert.equal(katalogArt('vollstaendigkeitserklaerung').stichtag.tag, '05-15');
  assert.equal(katalogArt('agrarantrag').stichtag.tag, '05-15');
  assert.equal(katalogArt('ear_jahr').stichtag.tag, '04-30');
  assert.match(katalogArt('ksk_meldung').hinweis, /1\.000 €/);
  assert.match(katalogArt('ksk_meldung').hinweis, /5,0 %/);
  assert.match(katalogArt('intrastat').hinweis, /3 Mio\..*1 Mio\./);
  assert.match(katalogArt('vollstaendigkeitserklaerung').hinweis, /80\.000 kg.*50\.000 kg.*30\.000 kg/);
  // Jeder Stichtag ist ein echtes Datum
  for (const k of KATALOG.filter((x) => x.stichtag)) assert.ok(naechsterStichtag(k.stichtag, null, '2026-09-24'), k.key);
});

test('Stichtag: Erledigung im Meldefenster deckt DIESE Frist, naechste erst im Folgejahr', () => {
  assert.equal(naechsterStichtag(KSK, '2026-01-05', '2026-02-01'), '2027-03-31');
  assert.equal(naechsterStichtag(KSK, '2026-03-31', '2026-04-01'), '2027-03-31');
  // verspaetet abgegeben: Frist 2026 trotzdem erledigt
  assert.equal(naechsterStichtag(KSK, '2026-04-15', '2026-05-01'), '2027-03-31');
  // VOR dem Fenster (Dezember) abgegeben: kommende Frist bleibt offen
  assert.equal(naechsterStichtag(KSK, '2025-12-20', '2026-01-10'), '2026-03-31');
});

test('Stichtag: Fenster ueber den Jahreswechsel und Schaltjahr', () => {
  const st = { tag: '01-31', ab: '11-01' };
  assert.equal(naechsterStichtag(st, '2026-11-15', '2026-12-01'), '2028-01-31');
  assert.equal(naechsterStichtag(st, '2026-10-20', '2026-10-21'), '2027-01-31');
  assert.equal(naechsterStichtag({ tag: '02-29', ab: '01-01' }, null, '2027-01-10'), '2027-02-28');
  assert.equal(naechsterStichtag({ tag: '13-40', ab: '01-01' }, null, '2026-09-24'), null);
});

test('Bewertung: nie eingetragen = fehlt (rot), aber mit naechster Frist', () => {
  const b = bewerte({ art: 'ksk_meldung' }, '2026-09-24');
  assert.equal(b.status, 'fehlt');
  assert.equal(b.faellig, '2027-03-31');
  assert.match(b.text, /31\.03\.2027/);
});

test('Bewertung: KSK im Februar erledigt ist gruen, im Maerz des Folgejahres gelb, danach rot', () => {
  const z = { art: 'ksk_meldung', letzte_am: '2026-02-10' };
  assert.equal(bewerte(z, '2026-09-24').status, 'ok');
  assert.equal(bewerte(z, '2026-09-24').faellig, '2027-03-31');
  assert.equal(bewerte(z, '2027-03-01').status, 'bald');
  assert.equal(bewerte(z, '2027-04-01').status, 'ueberfaellig');
  // ein festes Datum (gueltig_bis) schlaegt den Stichtag
  assert.equal(bewerte({ ...z, gueltig_bis: '2026-10-01' }, '2026-09-24').faellig, '2026-10-01');
});

test('Monatliche Meldungen rechnen ueber das Intervall', () => {
  const b = bewerte({ art: 'intrastat', letzte_am: '2026-08-10', intervall_monate: 1 }, '2026-09-05');
  assert.equal(b.faellig, '2026-09-10');
  assert.equal(b.status, 'bald');
});

test('Vorschlaege je Branche: Energie bekommt Marktstammdatenregister, Buero nicht', () => {
  const energie = vorschlaege('Energie & Umwelt', []).map((k) => k.key);
  assert.ok(energie.includes('mastr'));
  assert.ok(energie.includes('netzanmeldung'));
  assert.ok(!energie.includes('agrarantrag'));
  const land = vorschlaege('Landwirtschaft, Garten & Forst', []).map((k) => k.key);
  assert.ok(land.includes('agrarantrag'));
  const handel = vorschlaege('Handel & E-Commerce', []).map((k) => k.key);
  for (const k of ['lucid_registrierung', 'intrastat', 'ear_registrierung', 'ksk_meldung']) assert.ok(handel.includes(k), k);
  const bildung = vorschlaege('Bildung & Wissenschaft', []).map((k) => k.key);
  assert.ok(bildung.includes('azav_zulassung'));
  const ohne = vorschlaege(null, []).map((k) => k.key);
  assert.ok(!ohne.some((k) => katalogArt(k).mappe === 'meldungen'));
  // Versicherung/Subunternehmer werden weiterhin NIE vorgeschlagen
  assert.ok(!energie.some((k) => ['versicherung', 'subunternehmer', 'entsorgung'].includes(katalogArt(k).mappe)));
});

test('Sortierung: fehlende Meldung vor gruener', () => {
  const r = sortiere([{ art: 'ear_jahr', letzte_am: '2026-04-01' }, { art: 'ksk_meldung' }], '2026-09-24');
  assert.equal(r[0].art, 'ksk_meldung');
});

test('Radar: KSK 5,0 % fuer alle, eStatistik.core nur Handel/Industrie', () => {
  const alle = radarKommend('2026-09-24', 'Dienstleistungen').map((r) => r.titel);
  assert.ok(alle.some((t) => /Künstlersozialabgabe/.test(t)));
  assert.ok(!alle.some((t) => /eStatistik/.test(t)));
  assert.ok(radarKommend('2026-09-24', 'Handel & E-Commerce').some((r) => /eStatistik/.test(r.titel)));
});
