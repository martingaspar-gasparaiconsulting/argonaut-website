// Paket 327 (12.10.2026): S3b Schalter „nur Gewerbekunden" — USt-IdNr., Nachweis, Sperre, Shop
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ustIdPruefen, dePruefziffer, nachweisFehler, nachweisZeile, nurGewerbeAktiv, bestellungErlaubt, nachweisArt } from '../out/shopGewerbe.js';
import { START_FREIGABE } from '../out/startSperre.js';
import { TEXT_ZUSATZ_KEYS, TEXT_PFLICHT_KEYS, TEXT_EN, pruefeOberflaeche, oberflaecheFuer } from '../out/shopSprachen.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('USt-IdNr.: Länder-Muster, deutsche Prüfziffer, Schreibweise', () => {
  assert.deepEqual(ustIdPruefen('de 136 695 976'), { wert: 'DE136695976', fehler: null });
  assert.equal(ustIdPruefen('DE811569869').wert, 'DE811569869');
  assert.match(ustIdPruefen('DE123456789').fehler, /Prüfziffer/);
  assert.match(ustIdPruefen('DE12345678').fehler, /Muster/);
  assert.equal(ustIdPruefen('ATU12345678').wert, 'ATU12345678');
  assert.equal(ustIdPruefen('AT12345678').wert, null);
  assert.equal(ustIdPruefen('NL123456789B01').wert, 'NL123456789B01');
  assert.equal(ustIdPruefen('GR123456789').wert, 'EL123456789');
  assert.match(ustIdPruefen('US123').fehler, /Länderkürzel/);
  assert.match(ustIdPruefen('').fehler, /eintragen/);
  assert.equal(dePruefziffer('136695976'), true);
  assert.equal(dePruefziffer('136695975'), false);
});

test('Nachweis: geprüft nur mit Art, Vermerk und bei USt-IdNr. gültiger Form', () => {
  assert.ok(nachweisFehler({}).some((f) => /Art des Nachweises/.test(f)));
  assert.ok(nachweisFehler({ nachweis_art: 'ustid', ust_id: 'DE123456789', nachweis_notiz: 'BZSt' }).some((f) => /Prüfziffer/.test(f)));
  assert.ok(nachweisFehler({ nachweis_art: 'gewerbe' }).some((f) => /vermerken/.test(f)));
  assert.deepEqual(nachweisFehler({ nachweis_art: 'gewerbe', nachweis_notiz: 'Gewerbeanmeldung gesehen' }), []);
  assert.equal(nachweisArt('quatsch'), null);
  // „geprüft" wird beim Speichern nur gesetzt, wenn alles passt
  assert.equal(nachweisZeile({ nachweis_art: 'ustid', ust_id: 'DE123456789', nachweis_notiz: 'x', nachweis_ok: true }).nachweis_ok, false);
  assert.deepEqual(nachweisZeile({ nachweis_art: 'ustid', ust_id: 'de136695976', nachweis_notiz: '  BZSt   bestätigt ', nachweis_ok: true }),
    { nachweis_art: 'ustid', ust_id: 'DE136695976', nachweis_notiz: 'BZSt bestätigt', nachweis_ok: true });
  assert.equal(nachweisZeile({ nachweis_art: 'gewerbe', ust_id: 'DE136695976', nachweis_notiz: 'x', nachweis_ok: true }).ust_id, null);
});

test('Schalter wirkt nur mit Einstellung UND Freigabe; Bestellung nur mit geprüftem Konto', () => {
  assert.equal(nurGewerbeAktiv({ nur_gewerbe: true }, false), false);
  assert.equal(nurGewerbeAktiv({ nur_gewerbe: true }, true), true);
  assert.equal(nurGewerbeAktiv({ nur_gewerbe: 'ja' }, true), false);
  assert.equal(nurGewerbeAktiv(null, true), false);
  assert.deepEqual(bestellungErlaubt(false, null), { ok: true, grund: null });
  assert.match(bestellungErlaubt(true, null).grund, /nur an geprüfte Geschäftskunden/);
  assert.match(bestellungErlaubt(true, { nachweis_ok: false }).grund, /noch nicht geprüft/);
  assert.equal(bestellungErlaubt(true, { nachweis_ok: true }).ok, true);
  assert.equal(START_FREIGABE.gewerbeNachweis, false);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.gewerbeNachweis = aus/);
});

test('Neuer Shop-Text ist Zusatz: freigegebene Sprachen fallen nicht heraus', () => {
  // Paket 343: weitere Zusatz-Texte (vb_* Vorbestellung) kamen dazu — nur_gewerbe bleibt der erste.
  assert.equal(TEXT_ZUSATZ_KEYS[0], 'nur_gewerbe');
  assert.ok(!TEXT_PFLICHT_KEYS.includes('nur_gewerbe'));
  const altFreigegeben = { ...TEXT_EN }; for (const k of TEXT_ZUSATZ_KEYS) delete altFreigegeben[k];
  assert.deepEqual(pruefeOberflaeche(altFreigegeben), []);
  const pl = oberflaecheFuer('pl', { sprache: 'pl', status: 'freigegeben', texte: altFreigegeben });
  assert.ok(pl, 'Sprache bleibt nutzbar');
  assert.match(pl.nur_gewerbe, /^Bestellungen nur für geprüfte Geschäftskunden/, 'fehlender Zusatz-Text auf Deutsch');
  assert.match(TEXT_EN.nur_gewerbe, /verified business customers/);
});

test('Server entscheidet: Bestellung abgelehnt, Schaufenster meldet den Schalter, Konto meldet den Nachweis', () => {
  const b = lies('app/api/oeffentlich/shop-bestellung/route.ts');
  assert.match(b, /const erlaubt = bestellungErlaubt\(await ladeNurGewerbe\(db, ownerId\), kunde\);/);
  assert.match(b, /if \(!erlaubt\.ok\) return NextResponse\.json\(\{ error: erlaubt\.grund, nur_gewerbe: true \}, \{ status: 403 \}\);/);
  assert.ok(b.indexOf('bestellungErlaubt(') < b.indexOf("db.from('shop_bestellungen').insert("), 'Prüfung vor dem Speichern');
  const p = lies('app/api/oeffentlich/shop-produkte/route.ts');
  assert.match(p, /nachweis: kunde\.nachweis_ok/);
  assert.match(p, /\.\.\.\(nurGewerbe \? \{ nur_gewerbe: true \} : \{\}\)/);
  const s = lies('lib/shopB2bServer.ts');
  assert.match(s, /if \(!frei\) return false;/);
  assert.match(s, /if \(error\) return true;/, 'fail-closed bei Lesefehler');
  assert.match(s, /if \(antwort\.error\) antwort = await lies\(basisFelder\);/, 'B2B-Login ohne SQL p327 weiter möglich');
  const js = lies('public/shop.js');
  assert.match(js, /function gesperrt\(\) \{ return nurGewerbe && !\(konto && konto\.nachweis\); \}/);
  assert.match(js, /if \(!p \|\| gesperrt\(\)\) return;/);
});

test('SQL: geprüft nur mit Inhalt, wer und wann setzt die Datenbank', () => {
  const sql = lies('supabase-sql/p327-shop-gewerbenachweis.sql');
  assert.match(sql, /and \(nachweis_art <> 'ustid' or ust_id is not null\)/);
  assert.match(sql, /new\.nachweis_geprueft_von := auth\.uid\(\);/);
  assert.match(sql, /Erwartung: 6 \| 1 \| 1/);
  assert.ok(!/drop table|delete from|truncate/i.test(sql.replace(/RÜCKWEG[\s\S]*?=====/, '')));
});
