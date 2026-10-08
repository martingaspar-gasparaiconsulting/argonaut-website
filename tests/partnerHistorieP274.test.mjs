// ============================================================================
// tests/partnerHistorieP274.test.mjs — Paket 274 (08.10.2026) · Partner-Andockstelle,
// carVertical-Fahrzeughistorie: zwei Wege (eigenes Konto / Abschluss beim Partner),
// Bericht-Link am Fahrzeug, Börse zeigt nur mit Freigabe.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PARTNER, partner, berichtUrlGueltig, historieEingabe, historieFuerBoerse, historieText } from '../out/partnerAnbindung.js';
import { KONNEKTOR_KATALOG, bereich, anbieterVon } from '../out/konnektoren.js';
import { oeffentlich, BOERSE_SPALTEN, BOERSE_SPALTEN_OHNE_HISTORIE } from '../out/kfzBoerse.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const zeile = (x = {}) => ({ id: '11111111-2222-4333-8444-555555555555', status: 'bestand', inseriert: true, marke: 'VW', ...x });

test('Partner carVertical: Abschluss beim Partner, ohne Partnerlink ehrlich nicht als solcher gekennzeichnet', () => {
  const cv = partner('carvertical');
  assert.ok(cv && PARTNER.length >= 1);
  assert.match(cv.abschlussUrl, /^https:\/\/www\.carvertical\.com\//);
  assert.equal(cv.partnerlink, false, 'ohne NEXT_PUBLIC_PARTNERLINK_CARVERTICAL kein „Partnerlink"');
  assert.equal(partner('gibtsnicht'), undefined);
});

test('Schnittstellen-Zentrale: Bereich Fahrzeughistorie mit beiden Wegen', () => {
  const b = bereich('fahrzeughistorie');
  assert.ok(b && b.einrichten.modus === 'inline' && b.kategorie === 'betrieb');
  assert.ok(anbieterVon('fahrzeughistorie', 'manuell')?.demo);
  const cv = anbieterVon('fahrzeughistorie', 'carvertical');
  assert.ok(cv && !cv.demo);
  assert.equal(cv.felder.find((f) => f.key === 'api_key')?.typ, 'password', 'Schlüssel wird verschlüsselt gespeichert');
  assert.equal(b.abschluss?.[0]?.anbieter, 'carvertical');
  assert.match(b.abschluss[0].text, /Noch kein carVertical-Konto\? Hier abschließen/);
  assert.match(b.beschreibung, /ARGONAUT vermittelt nur/);
  assert.equal(new Set(KONNEKTOR_KATALOG.map((x) => x.typ)).size, KONNEKTOR_KATALOG.length, 'jeder Bereich genau einmal');
  assert.match(lies('app/dashboard/schnittstellen/page.tsx'), /\(b\.abschluss \|\| \[\]\)\.map/);
});

test('Bericht-Link: nur https, keine Leerzeichen/Anführungszeichen', () => {
  assert.equal(berichtUrlGueltig('https://www.carvertical.com/de/report/abc?x=1'), true);
  for (const u of ['http://x.de', 'https://x', 'https://x.de/a b', 'javascript:alert(1)', 'https://x.de/"><script>', 'https://' + 'a'.repeat(500) + '.de', 42, null]) {
    assert.equal(berichtUrlGueltig(u), false, String(u).slice(0, 30));
  }
});

test('Eingabe in der Akte: leer entfernt, Fehler bei kaputtem Link oder Zukunftsdatum', () => {
  assert.deepEqual(historieEingabe({ url: '  ', oeffentlich: true }, HEUTE), { ok: true, felder: { historie_url: null, historie_anbieter: null, historie_am: null, historie_oeffentlich: false } });
  assert.equal(historieEingabe({ url: 'http://x.de' }, HEUTE).ok, false);
  assert.equal(historieEingabe({ url: 'https://x.de/r', am: '2026-12-01' }, HEUTE).ok, false);
  const r = historieEingabe({ url: ' https://x.de/r ', anbieter: 'carvertical', oeffentlich: true }, HEUTE);
  assert.deepEqual(r, { ok: true, felder: { historie_url: 'https://x.de/r', historie_anbieter: 'carvertical', historie_am: HEUTE, historie_oeffentlich: true } });
  assert.equal(historieEingabe({ url: 'https://x.de/r', anbieter: 'hack' }, HEUTE).felder.historie_anbieter, 'sonstige');
  assert.equal(historieEingabe({ url: 'https://x.de/r', oeffentlich: 'true' }, HEUTE).felder.historie_oeffentlich, false);
});

test('Börse: Historie nur mit Freigabe und gültigem Link', () => {
  assert.equal(oeffentlich(zeile({ historie_url: 'https://x.de/r', historie_anbieter: 'carvertical', historie_oeffentlich: false })).historie, null);
  assert.equal(oeffentlich(zeile({ historie_url: 'javascript:alert(1)', historie_oeffentlich: true })).historie, null);
  const h = oeffentlich(zeile({ historie_url: 'https://x.de/r', historie_anbieter: 'carvertical', historie_am: '2026-10-01', historie_oeffentlich: true })).historie;
  assert.deepEqual(h, { url: 'https://x.de/r', anbieter: 'carVertical', am: '2026-10-01' });
  assert.equal(historieText(h), 'Fahrzeughistorie geprüft · carVertical · 10/2026');
  assert.equal(historieFuerBoerse({ historie_url: 'https://x.de/r', historie_anbieter: 'sonstige', historie_oeffentlich: true }).anbieter, 'unabhängiger Anbieter');
  assert.equal(oeffentlich(zeile()).historie, null, 'ohne SQL 274 (Spalten fehlen) einfach keine Historie');
  assert.match(BOERSE_SPALTEN, /historie_url, historie_anbieter, historie_am, historie_oeffentlich/);
  assert.ok(!/historie/.test(BOERSE_SPALTEN_OHNE_HISTORIE));
  assert.equal(BOERSE_SPALTEN_OHNE_HISTORIE + ', historie_url, historie_anbieter, historie_am, historie_oeffentlich', BOERSE_SPALTEN);
});

test('Quelltext: Rückfall ohne SQL, Link mit nofollow, Akte-Karte eingebunden, SQL additiv', () => {
  const l = lies('lib/kfzBoerseLaden.ts');
  assert.equal((l.match(/select\(BOERSE_SPALTEN_OHNE_HISTORIE\)/g) || []).length, 2);
  assert.match(lies('app/fahrzeuge/BoerseAnsichten.tsx'), /rel="noopener nofollow"/);
  assert.match(lies('app/dashboard/kfz/bestand/[id]/page.tsx'), /<KfzHistorie id=\{akte\.id\}/);
  const sql = lies('supabase-sql/p274-fahrzeughistorie.sql');
  assert.equal((sql.match(/add column if not exists/g) || []).length, 4);
  assert.ok(!/\bdrop\b|\bdelete\b|\btruncate\b/i.test(sql));
});
