// Paket 328 (12.10.2026): S5 Sicherheitsdatenblatt mit der Bestellbestätigung + Nachversand
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { waehleSdb, versandPlan, nachversandPlan, anhangName, protokollZeilen, MAX_ANHANG_BYTES, normMail } from '../out/sdbVersand.js';
import { START_FREIGABE } from '../out/startSperre.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const DE = { id: 'd-de', artikel_id: 'a1', sprache: 'de', version: '3', datei_bytes: 1000 };
const EN = { id: 'd-en', artikel_id: 'a1', sprache: 'en', version: '3', datei_bytes: 1000 };

test('Fassung: Bestell-Sprache, sonst Deutsch, sonst die erste', () => {
  assert.equal(waehleSdb([DE, EN], 'en').id, 'd-en');
  assert.equal(waehleSdb([EN, DE], 'fr').id, 'd-de');
  assert.equal(waehleSdb([EN], 'fr').id, 'd-en');
  assert.equal(waehleSdb([], 'de'), null);
});

test('Plan: nur was diese Adresse in dieser Fassung noch nicht hat; ohne SDB gemeldet', () => {
  const p = versandPlan(['a1', 'a2', 'a3', 'a1'], { a1: [DE], a2: [{ id: 'd2', artikel_id: 'a2', datei_bytes: 10 }] },
    [{ dokument_id: 'd2', empfaenger_email: 'Kunde@Firma.de', status: 'versendet' }, { dokument_id: 'd-de', empfaenger_email: 'kunde@firma.de', status: 'fehler' }],
    ' kunde@firma.de ', 'de', ['a3']);
  assert.deepEqual(p.anhaengen.map((e) => e.dok.id), ['d-de'], 'Fehlversuch zählt nicht als erhalten, doppelte Artikel einmal');
  assert.deepEqual(p.schonErhalten.map((e) => e.dok.id), ['d2']);
  assert.deepEqual(p.ohneSdb, ['a3']);
  // anderer Empfänger bekommt beides
  assert.equal(versandPlan(['a1', 'a2'], { a1: [DE], a2: [{ id: 'd2', artikel_id: 'a2' }] }, [{ dokument_id: 'd2', empfaenger_email: 'a@b.de', status: 'versendet' }], 'x@y.de', 'de').anhaengen.length, 2);
});

test('Plan: Größen-Deckel, Rest als „zu groß"', () => {
  const gross = { id: 'g', artikel_id: 'a2', datei_bytes: MAX_ANHANG_BYTES - 500 };
  const p = versandPlan(['a1', 'a2'], { a1: [DE], a2: [gross] }, [], 'a@b.de', 'de');
  assert.deepEqual(p.anhaengen.map((e) => e.dok.id), ['d-de']);
  assert.deepEqual(p.zuGross.map((e) => e.dok.id), ['g']);
});

test('Nachweis-Zeilen: versendet / Fehler / zu groß / ohne Mail', () => {
  const plan = { anhaengen: [{ artikel_id: 'a1', dok: DE }], schonErhalten: [], zuGross: [{ artikel_id: 'a2', dok: { id: 'g', sprache: 'de' } }], ohneSdb: [] };
  assert.deepEqual(protokollZeilen(plan, 'K@F.de', 'Max', 'b1', 'de', true).map((z) => [z.dokument_id, z.status, z.empfaenger_email, z.dokument_version]),
    [['d-de', 'versendet', 'k@f.de', '3'], ['g', 'zu_gross', 'k@f.de', null]]);
  assert.deepEqual(protokollZeilen(plan, 'k@f.de', null, null, 'de', false).map((z) => z.status), ['fehler', 'zu_gross']);
  assert.deepEqual(protokollZeilen(plan, null, 'Max', 'b1', 'de', false).map((z) => z.status), ['ohne_mail', 'ohne_mail']);
});

test('Nachversand: letzte 12 Monate, je Adresse einmal, Fassung in ihrer Sprache, wer sie hat fällt raus', () => {
  const neuDe = { id: 'neu-de', artikel_id: 'a1', sprache: 'de', version: '4' };
  const neuEn = { id: 'neu-en', artikel_id: 'a1', sprache: 'en', version: '4' };
  const v = [
    { artikel_id: 'a1', dokument_id: 'alt', empfaenger_email: 'a@x.de', status: 'versendet', versendet_am: '2026-09-01T10:00:00Z', sprache: 'de', empfaenger_name: 'A' },
    { artikel_id: 'a1', dokument_id: 'alt', empfaenger_email: 'A@X.de', status: 'versendet', versendet_am: '2026-05-01T10:00:00Z', sprache: 'de' },
    { artikel_id: 'a1', dokument_id: 'alt-en', empfaenger_email: 'b@y.com', status: 'versendet', versendet_am: '2026-03-01T10:00:00Z', sprache: 'en' },
    { artikel_id: 'a1', dokument_id: 'alt', empfaenger_email: 'zu-alt@z.de', status: 'versendet', versendet_am: '2025-09-01T10:00:00Z', sprache: 'de' },
    { artikel_id: 'a1', dokument_id: 'neu-de', empfaenger_email: 'hat@schon.de', status: 'versendet', versendet_am: '2026-10-01T10:00:00Z', sprache: 'de' },
    { artikel_id: 'a1', dokument_id: 'alt', empfaenger_email: 'fehl@x.de', status: 'fehler', versendet_am: '2026-10-01T10:00:00Z', sprache: 'de' },
    { artikel_id: 'a2', dokument_id: 'x', empfaenger_email: 'anderer@artikel.de', status: 'versendet', versendet_am: '2026-10-01T10:00:00Z' },
  ];
  const p = nachversandPlan(v, 'a1', [neuDe, neuEn], '2026-10-12');
  assert.deepEqual(p.map((e) => [e.email, e.dok.id]), [['a@x.de', 'neu-de'], ['b@y.com', 'neu-en']]);
  assert.equal(p[0].name, 'A');
  assert.equal(normMail(' X@Y.DE '), 'x@y.de');
});

test('Dateiname ohne Sonderzeichen', () => {
  assert.equal(anhangName('Reiniger „Pro" 5 l/Kanister', { id: 'x', sprache: 'en', version: '2.1' }), 'Sicherheitsdatenblatt - Reiniger Pro 5 l Kanister V2.1 (EN).pdf');
  assert.equal(anhangName('Größe', { id: 'x' }), 'Sicherheitsdatenblatt - Grosse (DE).pdf');
});

test('Bestell-Route: nur nach Freigabe, Pfad und PDF geprüft, Nachweis vom Server, Fehler nie zum Kunden', () => {
  assert.equal(START_FREIGABE.sdbVersand, false);
  assert.match(lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md'), /SCHALTER startSperre\.sdbVersand = aus/);
  const r = lies('app/api/oeffentlich/shop-bestellung/route.ts');
  assert.match(r, /const sdb = startFrei\('sdbVersand'\) \? await sdbVorbereiten\(\) : null;/);
  assert.match(r, /const ok = pfadPasst\(pfad, ownerId, e\.artikel_id\);/);
  assert.match(r, /\.eq\('owner_user_id', ownerId\)\.eq\('art', 'sdb'\)\.eq\('aktuell', true\)/);
  assert.match(r, /'%PDF-'/);
  assert.match(r, /if \(sdb\) await sdbProtokoll\(sdb\.plan, kaeuferOk\);/);
  assert.match(r, /console\.error\('shop-bestellung SDB:'/);
});

test('Nachversand-Route: nur Geschäftsleitung, Senden nur nach Freigabe, jede Sendung im Nachweis', () => {
  const r = lies('app/api/shop/sdb-nachversand/route.ts');
  assert.match(r, /if \(chef\) return \{ fehler: KEIN\(403/);
  assert.match(r, /if \(!startFrei\('sdbVersand'\)\) return KEIN\(403/);
  assert.match(r, /pfadPasst\(pfad, betrieb, art\.id\)/);
  assert.match(r, /anlass: 'nachversand', status: ok \? 'versendet' : 'fehler'/);
  assert.match(r, /kundenPost: true/);
});

test('SQL: Nachweis nur lesbar, Schreiben nur Server, Wächter', () => {
  const sql = lies('supabase-sql/p328-sdb-versand.sql');
  assert.match(sql, /revoke insert, update, delete on public\.sdb_versand from anon, authenticated;/);
  assert.doesNotMatch(sql, /p328_\w+ on public\.sdb_versand for (all|insert|update|delete)/);
  assert.match(sql, /Das Sicherheitsdatenblatt gehoert nicht zu diesem Artikel/);
  assert.match(sql, /Erwartung: 1 \| 2 \| 1 \| false/);
});
