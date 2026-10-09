// Paket 290 (09.10.2026): F1b Fahrtenbuch und Ladestrom
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  fahrtPruefen, grundPruefen, kmVorschlag, kettePruefen, nachgetragen, auswertung, abschliessbar, ladestromPruefen, monatVon,
} from '../out/fahrtenbuch.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const H = '2026-10-09';
const FZ = '11111111-1111-4111-8111-111111111111';
const basis = { fahrzeugId: FZ, datum: '2026-10-08', kmStart: '1.000', kmEnde: 1050, art: 'dienst', ziel: 'Stuttgart', zweck: 'Kundentermin', heute: H };

test('Fahrt prüfen: Pflichtangaben, km, Zukunft, abgeschlossener Monat, Privat ohne Ziel', () => {
  const ok = fahrtPruefen({ ...basis, partner: 'Firma X', fahrer: ' Max ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.zeile.km_start, 1000);
  assert.equal(ok.zeile.partner, 'Firma X');
  assert.equal(ok.zeile.fahrer_name, 'Max');
  assert.equal(fahrtPruefen({ ...basis, zweck: '' }).ok, false, 'Dienstfahrt ohne Zweck');
  assert.equal(fahrtPruefen({ ...basis, ziel: ' ' }).ok, false, 'Dienstfahrt ohne Ziel');
  assert.equal(fahrtPruefen({ ...basis, kmEnde: 1000 }).ok, false);
  assert.equal(fahrtPruefen({ ...basis, kmEnde: 7000 }).ok, false, 'mehr als 5000 km');
  assert.equal(fahrtPruefen({ ...basis, kmStart: '1000,5' }).ok, false, 'nur ganze km');
  assert.equal(fahrtPruefen({ ...basis, datum: '2026-10-10' }).ok, false, 'Zukunft');
  assert.equal(fahrtPruefen({ ...basis, abgeschlossen: ['2026-10-01'] }).ok, false);
  assert.equal(fahrtPruefen({ ...basis, art: 'quatsch' }).ok, false);
  assert.equal(fahrtPruefen({ ...basis, fahrzeugId: 'x' }).ok, false);
  const privat = fahrtPruefen({ ...basis, art: 'privat', ziel: 'Geheim', zweck: 'Privat', partner: 'P' });
  assert.equal(privat.ok, true);
  assert.equal(privat.zeile.ziel, null, 'bei Privatfahrten werden keine Ziele gespeichert');
  assert.equal(privat.zeile.partner, null);
});

test('Grund für Änderungen', () => {
  assert.equal(grundPruefen('kurz', null).ok, false);
  assert.equal(grundPruefen('Tippfehler km', null).ok, true);
  assert.equal(grundPruefen('Tippfehler km', 'Tippfehler km').ok, false, 'derselbe Grund wie zuletzt');
});

test('Kette, Vorschlag, nachgetragen, Auswertung, Abschluss', () => {
  const f = [
    { id: 'a', datum: '2026-10-01', km_start: 1000, km_ende: 1050, art: 'dienst', erfasst_am: '2026-10-01T18:00:00Z' },
    { id: 'b', datum: '2026-10-02', km_start: 1050, km_ende: 1080, art: 'privat', erfasst_am: '2026-10-12T08:00:00Z' },
    { id: 'c', datum: '2026-10-03', km_start: 1100, km_ende: 1120, art: 'arbeitsweg' },
    { id: 'd', datum: '2026-10-04', km_start: 1110, km_ende: 1130, art: 'privat' },
  ];
  assert.equal(kmVorschlag(f), 1130);
  assert.equal(kmVorschlag([]), null);
  assert.deepEqual(kettePruefen(f).map((k) => [k.art, k.von, k.bis]), [['luecke', 1080, 1100], ['ueberschneidung', 1110, 1120]]);
  assert.equal(nachgetragen(f[0]), false);
  assert.equal(nachgetragen(f[1]), true, '10 Tage später');
  const a = auswertung(f, '2026-10-01', '2026-10-31');
  assert.deepEqual([a.dienst, a.privat, a.arbeitsweg, a.gesamt, a.fahrten], [50, 50, 20, 120, 4]);
  assert.equal(a.anteilPrivat, 42);
  assert.equal(auswertung([], '2026-01-01', '2026-12-31').anteilPrivat, null);
  assert.equal(abschliessbar('2026-09-01', H), true);
  assert.equal(abschliessbar('2026-10-01', H), false, 'laufender Monat');
  assert.equal(abschliessbar('2026-09-15', H), false);
  assert.equal(monatVon('2026-10-09'), '2026-10-01');
});

test('Ladestrom: kWh × Preis auf den Cent, keine festen Pauschalen', () => {
  const ok = ladestromPruefen({ name: 'Eva', monat: '2026-09', anfang: '1.234,50', ende: '1.420,25', preisCent: '32,5', heute: H });
  assert.equal(ok.ok, true);
  assert.equal(ok.zeile.monat, '2026-09-01');
  assert.equal(ok.zeile.kwh, 185.75);
  assert.equal(ok.zeile.betrag_cent, 6037, '185,75 kWh × 32,5 ct = 6.036,875 ct → 6.037 ct');
  assert.equal(ladestromPruefen({ name: 'Eva', monat: '2026-09', anfang: 200, ende: 100, preisCent: 30, heute: H }).ok, false);
  assert.equal(ladestromPruefen({ name: 'Eva', monat: '2026-11', anfang: 1, ende: 2, preisCent: 30, heute: H }).ok, false, 'Zukunft');
  assert.equal(ladestromPruefen({ name: 'Eva', monat: '2026-09', anfang: 1, ende: 2, preisCent: 0, heute: H }).ok, false);
  assert.equal(ladestromPruefen({ name: 'E', monat: '2026-09', anfang: 1, ende: 2, preisCent: 30, heute: H }).ok, false);
  assert.doesNotMatch(lies('lib/fahrtenbuch.ts'), /\b(30|70|15|35)\s*(€|Euro)/, 'keine Pauschalbeträge im Code');
});

test('SQL und Seite: Sperren, Protokoll, Rechte', () => {
  const sql = lies('supabase-sql/p290-fahrtenbuch-ladestrom.sql');
  assert.match(sql, /before insert or update or delete on public\.fahrtenbuch_fahrt/);
  assert.match(sql, /char_length\(trim\(new\.aenderung_grund\)\), 0\) < 5/);
  assert.match(sql, /before update or delete on public\.fahrtenbuch_aenderung/);
  assert.match(sql, /check \(art <> 'dienst' or \(ziel is not null and zweck is not null\)\)/);
  assert.match(sql, /status = 'offen'/, 'Mitarbeiter setzen nicht „erstattet“');
  assert.doesNotMatch(sql, /fbm_[a-z_]*delete|on public\.fahrtenbuch_abschluss for (delete|update)/, 'Abschluss nicht aufhebbar');
  assert.doesNotMatch(sql, /fbf_ma_delete/);
  const seite = lies('app/dashboard/erp/fuhrpark/fahrtenbuch/page.tsx');
  assert.match(seite, /grundPruefen\(form\.grund, form\.grundBisher\)/);
  assert.match(seite, /abschliessbar\(monat, tag\)/);
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/erp\/fuhrpark\/fahrtenbuch'/);
});
