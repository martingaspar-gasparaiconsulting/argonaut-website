import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pruefeBedenken, bedenkenWerte, bedenkenHtml } from '../out/bedenkenanmeldung.js';
import { eintragFuer, dokumentText } from '../out/rechtsTexte.js';

// ===========================================================================
// HW-B (16.10.2026) — Bedenkenanmeldung (VOB/B § 4 Abs. 3)
// ===========================================================================

const H = '2026-10-16';
const e = { bauvorhaben: 'Bad Huber', kunde: 'Familie Huber', bedenken: 'Der Estrich ist laut Messung zu feucht (CM 3,1 %), Fliesen würden sich lösen.', frist: '2026-10-23' };

test('Pruefung: Bauvorhaben, Kunde, konkrete Bedenken, Frist nicht in der Vergangenheit', () => {
  assert.equal(pruefeBedenken(e, H).ok, true);
  assert.equal(pruefeBedenken({ ...e, bauvorhaben: ' ' }, H).ok, false);
  assert.equal(pruefeBedenken({ ...e, kunde: '' }, H).ok, false);
  assert.equal(pruefeBedenken({ ...e, bedenken: 'zu feucht' }, H).ok, false);
  assert.equal(pruefeBedenken({ ...e, frist: '' }, H).ok, false);
  assert.equal(pruefeBedenken({ ...e, frist: '2026-10-15' }, H).ok, false);
});

test('Katalog: bau.bedenken mit Platzhaltern, Schluessel passt zur Datenbank-Regel', () => {
  const k = eintragFuer('bau.bedenken');
  assert.ok(k && k.angebunden);
  assert.match(k.schluessel, /^[a-z]+\.[a-z_]+$/);
  assert.deepEqual(k.platzhalter.map((p) => p.key), ['betrieb', 'kunde', 'datum', 'bauvorhaben', 'bedenken', 'frist']);
});

test('Ohne eigenen Text kein Schreiben — nie ARGONAUT-Wortlaut', () => {
  const k = eintragFuer('bau.bedenken');
  const h = bedenkenHtml(e, 'Muster GmbH', H, dokumentText(k, null));
  assert.equal(h.ok, false);
  const luecke = dokumentText(k, { text: 'Betroffene Leistung: [Ihr Text] ' + 'x'.repeat(60), fassung: 1, geaendert_am: null });
  assert.equal(bedenkenHtml(e, 'Muster GmbH', H, luecke).ok, false);
});

test('Mit eigenem Text: Platzhalter gefuellt, maskiert; Bedenken/Frist als Daten nur, wenn der Text sie nicht enthaelt', () => {
  const k = eintragFuer('bau.bedenken');
  const ohne = dokumentText(k, { text: 'Sehr geehrte Damen und Herren, zu {{bauvorhaben}} melden wir hiermit Bedenken an. Wir bitten um Entscheidung.', fassung: 2, geaendert_am: null }, bedenkenWerte({ ...e, bauvorhaben: '<b>Bad</b>' }, 'Muster GmbH', H));
  const h1 = bedenkenHtml({ ...e, bauvorhaben: '<b>Bad</b>' }, 'Muster GmbH', H, ohne);
  assert.equal(h1.ok, true);
  assert.ok(!h1.html.includes('<b>Bad</b>'));
  assert.match(h1.html, /CM 3,1 %/);
  assert.match(h1.html, /Frist:<\/b> 23\.10\.2026/);
  const mit = dokumentText(k, { text: 'Zu {{bauvorhaben}}: {{bedenken}} Bitte entscheiden Sie bis {{frist}}. Gruß {{betrieb}}', fassung: 1, geaendert_am: null }, bedenkenWerte(e, 'Muster GmbH', H));
  const h2 = bedenkenHtml(e, 'Muster GmbH', H, mit);
  assert.ok(!h2.html.includes('class="box"'));
  assert.ok(!h2.html.includes('Frist:</b>'));
  assert.match(h2.html, /bis 23\.10\.2026/);
});

test('Waechter: Seite nutzt den eigenen Text (ladeDokumentText bau.bedenken)', () => {
  const s = fs.readFileSync(new URL('../app/dashboard/bau-lv/ablaeufe/page.tsx', import.meta.url), 'utf8');
  assert.match(s, /ladeDokumentText\(supabase, uid, 'bau\.bedenken'/);
  assert.match(s, /pruefeBedenken\(/);
});
