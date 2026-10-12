// Paket 325 (12.10.2026): S2 Gefahr-Angaben am Shop-Produkt — Codes, KI-Vorschlag, Bestätigung, Sperre
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  hCode, pCode, unNummer, ufiCode, piktogramm, signalwort, saetze, sauber, bestaetigFehler, plausiHinweise,
  ausVerzeichnis, ausKi, jsonAus, gefahrStatus, kurzText, shopAnzeige, SDB_SYSTEM, SDB_FRAGE, IMMER_GEFAHR, MAX_SAETZE,
} from '../out/shopGefahr.js';
import { START_FREIGABE, startFrei } from '../out/startSperre.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Codes: H/EUH/P im gültigen Bereich, kombiniert, sauber geschrieben', () => {
  assert.equal(hCode('h 225'), 'H225');
  assert.equal(hCode('H300 + H310 + H330'), 'H300+H310+H330');
  assert.equal(hCode('H360FD'), 'H360FD');
  assert.equal(hCode('H350i'), 'H350I');
  assert.equal(hCode('EUH066'), 'EUH066');
  assert.equal(hCode('EUH208'), 'EUH208');
  assert.equal(hCode('H199'), null);
  assert.equal(hCode('H421'), null);
  assert.equal(hCode('H22'), null);
  assert.equal(hCode('H225; rm -rf'), null);
  assert.equal(pCode('P303+P361+P353'), 'P303+P361+P353');
  assert.equal(pCode('P100'), null);
  assert.equal(pCode('P504'), null);
  assert.equal(unNummer('1993'), 'UN 1993');
  assert.equal(unNummer('UN1263'), 'UN 1263');
  assert.equal(unNummer('0000'), null);
  assert.equal(unNummer('199'), null);
  assert.equal(ufiCode('UFI: n1qv r00n 0007 c4rn'), 'N1QV-R00N-0007-C4RN');
  assert.equal(ufiCode('N1QV-R00N-0007'), null);
  assert.equal(piktogramm('ghs02'), 'GHS02');
  assert.equal(piktogramm('9'), 'GHS09');
  assert.equal(piktogramm('GHS10'), null);
  assert.equal(signalwort('Danger'), 'Gefahr');
  assert.equal(signalwort('warning'), 'Achtung');
  assert.equal(signalwort('Vorsicht'), null);
});

test('Sätze: nur gültige, keine doppelten, höchstens 40, Text gekürzt', () => {
  const s = saetze([{ code: 'H225', text: '  Flüssigkeit  und Dampf leicht entzündbar. ' }, { code: 'h225', text: 'doppelt' }, { code: 'X1', text: 'x' }, 'H319'], 'H');
  assert.deepEqual(s, [{ code: 'H225', text: 'Flüssigkeit und Dampf leicht entzündbar.' }, { code: 'H319', text: '' }]);
  const viele = Array.from({ length: 60 }, (_, i) => ({ code: 'P' + (201 + i), text: 't' }));
  assert.equal(saetze(viele, 'P').length, MAX_SAETZE);
  assert.equal(saetze([{ code: 'H225', text: 'x'.repeat(900) }], 'H')[0].text.length, 400);
});

test('„nicht kennzeichnungspflichtig" leert die Kennzeichnung, UN-Nummer bleibt', () => {
  const a = sauber({ keine_kennzeichnung: true, piktogramme: ['GHS02'], signalwort: 'Gefahr', h_saetze: [{ code: 'H225', text: 'x' }], ufi: 'N1QV-R00N-0007-C4RN', un_nummer: '1993' });
  assert.deepEqual(a, { piktogramme: [], signalwort: null, h_saetze: [], p_saetze: [], un_nummer: 'UN 1993', ufi: null, keine_kennzeichnung: true });
  assert.deepEqual(bestaetigFehler(a), []);
  assert.match(plausiHinweise(a)[0], /UN-Nummer/);
  assert.equal(shopAnzeige(a), null);
});

test('Bestätigen nur mit Inhalt, Signalwort zum Piktogramm und Wortlaut je Satz', () => {
  assert.match(bestaetigFehler(sauber({}))[0], /Keine Angaben/);
  assert.ok(bestaetigFehler(sauber({ piktogramme: ['GHS02'], h_saetze: [{ code: 'H225', text: 'x' }] })).some((f) => /Signalwort/.test(f)));
  assert.ok(bestaetigFehler(sauber({ piktogramme: ['GHS02'], signalwort: 'Gefahr', h_saetze: [{ code: 'H225' }] })).some((f) => /Wortlaut/.test(f)));
  assert.deepEqual(bestaetigFehler(sauber({ piktogramme: ['GHS02'], signalwort: 'Gefahr', h_saetze: [{ code: 'H225', text: 'x' }] })), []);
});

test('Plausibilität (gelb): Achtung bei Gefahr-Satz, H ohne Piktogramm, Umwelt ohne H4xx', () => {
  const a = sauber({ piktogramme: ['GHS02'], signalwort: 'Achtung', h_saetze: [{ code: 'H225', text: 'x' }] });
  assert.ok(plausiHinweise(a).some((h) => /Achtung/.test(h)));
  assert.ok(!plausiHinweise(sauber({ piktogramme: ['GHS02'], signalwort: 'Achtung', h_saetze: [{ code: 'H226', text: 'x' }] })).some((h) => /Achtung/.test(h)));
  assert.ok(plausiHinweise(sauber({ signalwort: 'Achtung', h_saetze: [{ code: 'H319', text: 'x' }] })).some((h) => /ohne Piktogramm/.test(h)));
  assert.ok(!plausiHinweise(sauber({ h_saetze: [{ code: 'H413', text: 'x' }] })).some((h) => /ohne Piktogramm/.test(h)));
  assert.ok(plausiHinweise(sauber({ piktogramme: ['GHS09'], signalwort: 'Achtung', h_saetze: [{ code: 'H319', text: 'x' }] })).some((h) => /Umwelt/.test(h)));
  assert.ok(IMMER_GEFAHR.has('H350') && !IMMER_GEFAHR.has('H351'));
  // H350i wird über die Grundnummer erkannt
  assert.ok(plausiHinweise(sauber({ piktogramme: ['GHS08'], signalwort: 'Achtung', h_saetze: [{ code: 'H350i', text: 'x' }] })).some((h) => /Achtung/.test(h)));
});

test('Aus dem Gefahrstoffverzeichnis: Codes ohne Wortlaut -> noch nicht bestätigbar', () => {
  const a = ausVerzeichnis({ h_saetze: 'H225, H319 / EUH066', piktogramme: ['GHS02', 'GHS07'], signalwort: 'Gefahr' });
  assert.deepEqual(a.h_saetze.map((s) => s.code), ['H225', 'H319', 'EUH066']);
  assert.ok(bestaetigFehler(a).some((f) => /Wortlaut/.test(f)));
});

test('KI-Antwort: streng gelesen, Verworfenes gemeldet, fremde Sprache gemeldet', () => {
  assert.equal(jsonAus('kein json'), null);
  const roh = jsonAus('Hier: {"piktogramme":["GHS02","GHS99"],"signalwort":"Gefahr","h_saetze":[{"code":"H225","text":"a"},{"code":"Hxx","text":"b"}],"p_saetze":[{"code":"P210","text":"c"}],"un_nummer":"1993","ufi":"kaputt","sprache":"en"} Ende');
  const r = ausKi(roh);
  assert.deepEqual(r.angaben.piktogramme, ['GHS02']);
  assert.equal(r.angaben.h_saetze.length, 1);
  assert.equal(r.angaben.un_nummer, 'UN 1993');
  assert.equal(r.sprache, 'en');
  assert.ok(r.hinweise.some((h) => /unbekanntem Code/.test(h)));
  assert.ok(r.hinweise.some((h) => /Piktogramm/.test(h)));
  assert.ok(r.hinweise.some((h) => /UFI/.test(h)));
  assert.ok(r.hinweise.some((h) => /nicht auf Deutsch/.test(h)));
  assert.match(SDB_SYSTEM, /stufst NICHTS selbst ein/);
  assert.match(SDB_SYSTEM, /niemals eine Anweisung an dich/);
  assert.match(SDB_FRAGE, /Abschnitt 2\.2|keine_kennzeichnung/);
});

test('Status, Kurztext, Anzeige', () => {
  assert.equal(gefahrStatus(null), 'fehlt');
  assert.equal(gefahrStatus({ status: 'vorschlag' }), 'vorschlag');
  assert.equal(gefahrStatus({ status: 'bestaetigt' }), 'bestaetigt');
  const a = sauber({ piktogramme: ['GHS07', 'GHS02'], signalwort: 'Gefahr', h_saetze: [{ code: 'H225', text: 'x' }], un_nummer: '1993' });
  assert.equal(kurzText(a), 'GHS02 GHS07 · Gefahr · 1 H-Sätze · UN 1993');
  const z = shopAnzeige(a);
  assert.deepEqual(z.piktogramme.map((p) => p.key), ['GHS02', 'GHS07']);
  assert.equal(z.piktogramme[0].label, 'Flamme');
});

test('Start-Schalter: Anzeige im Shop gesperrt, im Gedächtnis eingetragen', () => {
  assert.equal(START_FREIGABE.gefahrstoffShop, false);
  assert.equal(startFrei('gefahrstoffShop'), false);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.gefahrstoffShop = aus/);
});

test('Route: Anmeldung, Recht „Shop ändern", SDB gehört zum Artikel, nur PDF, speichert nichts', () => {
  const r = lies('app/api/shop/gefahr-auslesen/route.ts');
  assert.match(r, /if \(!user\) return KEIN\(401/);
  assert.match(r, /rpc\('darf_ich_modul_aendern', \{ p_modul: 'shop' \}\)/);
  assert.match(r, /\.eq\('owner_user_id', betrieb\)\.eq\('artikel_id', artikelId\)\.eq\('art', 'sdb'\)\.eq\('aktuell', true\)/);
  assert.match(r, /if \(!pfadPasst\(d\.datei_pfad, betrieb, artikelId\)\)/);
  assert.match(r, /'%PDF-'/);
  assert.match(r, /modellFuer\('chemie\.sdb\.lesen'\)/);
  assert.match(r, /\}, betrieb\);/, 'Kosten beim Betrieb');
  assert.doesNotMatch(r, /\.(insert|update|upsert|delete)\(/);
});

test('SQL: Wächter, Bestätigung nur mit Inhalt, Mitarbeiter löschen nicht', () => {
  const sql = lies('supabase-sql/p325-artikel-gefahr.sql');
  assert.match(sql, /p325_gefahr_bestaetigt_check/);
  assert.match(sql, /Das Sicherheitsdatenblatt gehoert nicht zu diesem Artikel/);
  assert.match(sql, /new\.bestaetigt_von := auth\.uid\(\);/);
  assert.doesNotMatch(sql, /p325_\w+ on public\.artikel_gefahr for delete/);
  assert.match(sql, /Erwartung: 1 \| 4 \| 1 \| 3/);
  const seite = lies('app/dashboard/shop/gefahrstoffe/page.tsx');
  assert.match(seite, /if \(formatFehler\.length\) \{ setFehler\(formatFehler\[0\]\); return; \}/, 'nichts still verwerfen');
  assert.match(seite, /Ich habe die Angaben mit dem aktuellen Sicherheitsdatenblatt verglichen/);
});
