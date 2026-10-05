// ============================================================================
// tests/verzeichnisEintragP206.test.mjs — Paket 206 (Stufe 3 · B5 Branchenverzeichnis-Eintrag)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  telefonEinheitlich, webEinheitlich, kuerzen, beschreibung, baueEintrag,
  leseStand, aendereStand, pruefeLink, fortschritt, VERZEICHNISSE, VERZEICHNIS_KEYS,
} from '../out/verzeichnisEintrag.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Telefon einheitlich +49, Unbekanntes bleibt', () => {
  assert.equal(telefonEinheitlich('07031 123456'), '+49 7031 123456');
  assert.equal(telefonEinheitlich('07031/123456'), '+49 7031 123456');
  assert.equal(telefonEinheitlich('(07031) 12 34 56'), '+49 7031 123456');
  assert.equal(telefonEinheitlich('+49 7031 123456'), '+49 7031 123456');
  assert.equal(telefonEinheitlich('0049 7031 123456'), '+49 7031 123456');
  assert.equal(telefonEinheitlich('+49 (0) 7031 123456'), '+49 7031 123456');
  assert.equal(telefonEinheitlich('07031123456'), '+49 7031123456', 'ohne Trennung keine erfundene Vorwahl');
  assert.equal(telefonEinheitlich('+43 1 234567'), '+43 1 234567', 'Ausland bleibt');
  assert.equal(telefonEinheitlich('0043 1 234567'), '0043 1 234567', 'Ausland mit 00 bleibt');
  assert.equal(telefonEinheitlich('123'), '123');
  assert.equal(telefonEinheitlich(null), '');
});

test('Website und Kürzen', () => {
  assert.equal(webEinheitlich('elektro.example.com/'), 'https://elektro.example.com');
  assert.equal(webEinheitlich('http://a.example.com'), 'http://a.example.com');
  assert.equal(webEinheitlich(''), '');
  assert.equal(kuerzen('Kurz.', 10), 'Kurz.');
  assert.equal(kuerzen('Erster Satz hier. Zweiter Satz ist lang', 30), 'Erster Satz hier.');
  assert.equal(kuerzen('Einwortlangeswort undnochmehr', 20), 'Einwortlangeswort');
  assert.ok(kuerzen('a '.repeat(500), 750).length <= 750);
});

test('Beschreibung aus Firmenwissen', () => {
  assert.equal(beschreibung({ ueber_uns: 'Wir sind ein Elektrobetrieb.' }, 100), 'Wir sind ein Elektrobetrieb.');
  assert.equal(beschreibung({ slogan: 'Strom mit Herz', kernsaetze: 'Seit 1990.' }, 100), 'Strom mit Herz Seit 1990.');
  assert.equal(beschreibung({}, 100), '');
});

test('Eintrag: Felder, Lücken, NAP-Block', () => {
  const e = baueEintrag({ firma: 'Elektro Bauer GmbH', strasse: 'Hauptstr. 1', plz: '71032', ort: 'Böblingen', telefon: '07031 123456', web: 'elektro.example.com', email: 'Info@Elektro.example.com' }, 'Elektriker');
  assert.deepEqual(e.luecken, []);
  assert.equal(e.napBlock, 'Elektro Bauer GmbH\nHauptstr. 1, 71032 Böblingen\n+49 7031 123456');
  assert.equal(e.felder.find((f) => f.key === 'email').wert, 'info@elektro.example.com');
  const leer = baueEintrag(null, '');
  assert.deepEqual(leer.luecken, ['Firmenname', 'Kategorie / Branche', 'Straße und Hausnummer', 'PLZ', 'Ort', 'Telefon']);
  assert.equal(leer.napBlock, '');
});

test('Abhak-Stand: nur bekannte Verzeichnisse, saubere Links, Datum bleibt', () => {
  assert.deepEqual(VERZEICHNIS_KEYS, ['google', 'bing', 'apple', 'gelbeseiten', 'dasoertliche', '11880']);
  assert.ok(VERZEICHNISSE.every((v) => v.url.startsWith('https://')));
  assert.deepEqual(leseStand({ google: { eingetragen_am: '2026-10-01', link: 'javascript:alert(1)' }, fremd: { eingetragen_am: '2026-10-01' } }),
    { google: { eingetragen_am: '2026-10-01', link: '' } });
  assert.deepEqual(leseStand('kaputt'), {});
  assert.equal(pruefeLink('javascript:alert(1)'), null);
  assert.equal(pruefeLink('https://g.page/x'), 'https://g.page/x');
  assert.equal(pruefeLink(''), '');
  let r = aendereStand({}, 'google', true, 'https://g.page/x', '2026-10-05');
  assert.deepEqual(r, { ok: true, stand: { google: { eingetragen_am: '2026-10-05', link: 'https://g.page/x' } } });
  r = aendereStand(r.stand, 'google', true, '', '2026-12-01');
  assert.equal(r.stand.google.eingetragen_am, '2026-10-05', 'erstes Datum bleibt');
  r = aendereStand(r.stand, 'google', false, '', '2026-12-01');
  assert.equal(r.stand.google.eingetragen_am, null);
  assert.equal(aendereStand({}, 'xyz', true, '', '2026-10-05').ok, false);
  assert.equal(aendereStand({}, 'bing', true, 'ftp://x', '2026-10-05').ok, false);
  assert.deepEqual(fortschritt({ google: { eingetragen_am: '2026-10-05', link: '' }, bing: { eingetragen_am: null, link: '' } }), { erledigt: 1, gesamt: 6 });
});

test('Verdrahtung: Route, Seite, Menü, SQL', () => {
  const route = lies('app/api/marketing/verzeichnisse/route.ts');
  assert.match(route, /modulRechtPruefen\(supabase, user\?\.id \?\? null, 'marketing', 'sehen'\)/);
  assert.match(route, /modulRechtPruefen\(supabase, user\?\.id \?\? null, 'marketing', 'aendern'\)/);
  assert.match(route, /update\(\{ verzeichnis_status: neu\.stand \}\)\.eq\('owner_user_id', recht\.betrieb\)/);
  assert.match(lies('app/dashboard/marketing/verzeichnisse/page.tsx'), /\/api\/marketing\/verzeichnisse/);
  assert.match(lies('app/dashboard/marketing/page.tsx'), /\/dashboard\/marketing\/verzeichnisse/);
  const sql = lies('supabase-sql/p206-verzeichnis-eintrag.sql');
  assert.match(sql, /add column if not exists verzeichnis_status jsonb not null default '\{\}'::jsonb/);
  assert.doesNotMatch(sql, /^\s*(drop|delete|truncate)\b/im);
});
