// Paket 287 (09.10.2026): RF1 Rechts-Freigaben-Zentrale — Katalog, Prüfung, Stand, Gültigkeit
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FREIGABEN, funktion, freigabeStand, freigabePruefen, widerrufPruefen, gueltigBis, sperrText, GUELTIG_MONATE,
} from '../out/rechtsFreigaben.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const jetzt = new Date('2026-10-09T10:00:00Z');
const alleHaken = (f) => f.haken.map((h) => h.key);

test('Katalog: sechs Funktionen, eindeutige Schlüssel passend zur Datenbank-Prüfung, verfügbare Funktionen', () => {
  assert.equal(FREIGABEN.length, 6);
  const keys = FREIGABEN.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const f of FREIGABEN) {
    assert.match(f.key, /^[a-z_]{2,40}$/, f.key);
    assert.ok(f.fassung.length >= 1 && f.fassung.length <= 40);
    assert.ok(f.haken.length >= 3, f.key);
    assert.equal(new Set(f.haken.map((h) => h.key)).size, f.haken.length, f.key);
    for (const t of [f.titel, f.wofuer, f.warum, ...f.haken.map((h) => h.text)])
      assert.ok(!/\b(du|dein|dir|dich)\b/i.test(t) && !/KI-Agent|inklusive|rechtssicher|garantiert/i.test(t), f.key + ': ' + t);
  }
  // P289: Führerscheinkontrolle ist dazugekommen
  assert.deepEqual(FREIGABEN.filter((f) => f.verfuegbar).map((f) => f.key), ['leistungsauswertung', 'fuehrerschein']);
  assert.equal(funktion('ortung')?.dienstleister, true);
  assert.equal(funktion('quatsch'), null);
});

test('Prüfung: nur Geschäftsleitung, alle Häkchen, Betriebsrat, Zweck, Anbieter; Fremdes wird verworfen', () => {
  const f = funktion('ortung');
  assert.equal(freigabePruefen({ rolle: 'mitarbeiter', funktion: 'ortung', haken: alleHaken(f), betriebsrat: 'keiner', zweck: 'Diebstahl', dienstleister: 'Telematik GmbH' }).ja, false);
  assert.equal(freigabePruefen({ rolle: 'helfer', funktion: 'ortung', haken: alleHaken(f), betriebsrat: 'keiner', zweck: 'Diebstahl', dienstleister: 'Telematik GmbH' }).ja, false);
  const ohneEins = freigabePruefen({ rolle: 'chef', funktion: 'ortung', haken: alleHaken(f).slice(1), betriebsrat: 'keiner', zweck: 'Diebstahl', dienstleister: 'Telematik GmbH' });
  assert.equal(ohneEins.ja, false);
  assert.match(ohneEins.grund, /offen:/);
  assert.equal(freigabePruefen({ rolle: 'chef', funktion: 'ortung', haken: alleHaken(f), betriebsrat: 'vielleicht', zweck: 'Diebstahl', dienstleister: 'X1' }).ja, false);
  assert.equal(freigabePruefen({ rolle: 'chef', funktion: 'ortung', haken: alleHaken(f), betriebsrat: 'keiner', zweck: '  ', dienstleister: 'X1' }).ja, false);
  assert.equal(freigabePruefen({ rolle: 'chef', funktion: 'ortung', haken: alleHaken(f), betriebsrat: 'keiner', zweck: 'Diebstahl', dienstleister: '' }).ja, false);
  const ok = freigabePruefen({ rolle: 'chef', funktion: 'ortung', haken: [...alleHaken(f), 'erfunden', 'zweck'], betriebsrat: 'einbezogen', zweck: ' Diebstahl\nund Rückgabe ', dienstleister: 'Telematik GmbH' });
  assert.equal(ok.ja, true);
  assert.deepEqual(ok.eingabe.haken, alleHaken(f));
  assert.equal(ok.eingabe.zweck, 'Diebstahl und Rückgabe');
  assert.equal(ok.eingabe.betriebsrat, 'einbezogen');
  // Führerschein braucht weder Betriebsrat noch Zweck noch Anbieter
  const fs2 = freigabePruefen({ rolle: 'chef', funktion: 'fuehrerschein', haken: alleHaken(funktion('fuehrerschein')), betriebsrat: 'egal' });
  assert.equal(fs2.ja, true);
  assert.equal(fs2.eingabe.betriebsrat, null);
  assert.equal(fs2.eingabe.zweck, null);
  assert.equal(freigabePruefen({ rolle: 'chef', funktion: 'unbekannt', haken: [] }).ja, false);
  assert.equal(widerrufPruefen({ rolle: 'mitarbeiter', funktion: 'video' }).ja, false);
  assert.equal(widerrufPruefen({ rolle: 'chef', funktion: 'video' }).ja, true);
});

test('Gültigkeit: 12 Monate, Monatsende und Schalttag', () => {
  assert.equal(GUELTIG_MONATE, 12);
  assert.equal(gueltigBis(new Date('2026-10-09T10:00:00Z')), '2027-10-09T10:00:00.000Z');
  assert.equal(gueltigBis(new Date('2028-02-29T08:00:00Z')), '2029-02-28T08:00:00.000Z');
  assert.equal(gueltigBis(new Date('2026-01-31T08:00:00Z'), 1), '2026-02-28T08:00:00.000Z');
});

test('Stand: offen, frei, bald, abgelaufen, neue Fassung, widerrufen — aktiv nur bei frei', () => {
  const f = funktion('leistungsauswertung');
  const basis = { funktion: f.key, fassung: f.fassung, bestaetigt_am: '2026-10-01T10:00:00Z', gueltig_bis: '2027-10-01T10:00:00Z' };
  assert.equal(freigabeStand(f, null, jetzt).stufe, 'offen');
  assert.equal(freigabeStand(f, { ...basis, bestaetigt_am: null }, jetzt).aktiv, false);
  const frei = freigabeStand(f, basis, jetzt);
  assert.equal(frei.stufe, 'frei'); assert.equal(frei.aktiv, true); assert.equal(frei.bald, false);
  const bald = freigabeStand(f, { ...basis, gueltig_bis: '2026-11-01T10:00:00Z' }, jetzt);
  assert.equal(bald.aktiv, true); assert.equal(bald.bald, true); assert.equal(bald.restTage, 23);
  assert.equal(freigabeStand(f, { ...basis, gueltig_bis: '2026-10-09T10:00:00Z' }, jetzt).stufe, 'abgelaufen');
  assert.equal(freigabeStand(f, { ...basis, fassung: 'rf1-alt' }, jetzt).stufe, 'neue_fassung');
  assert.equal(freigabeStand(f, { ...basis, widerrufen_am: '2026-10-05T10:00:00Z' }, jetzt).stufe, 'widerrufen');
  for (const st of ['offen', 'abgelaufen', 'neue_fassung', 'widerrufen'])
    assert.match(sperrText(f, { stufe: st, aktiv: false }, false), /Geschäftsleitung/);
  assert.match(sperrText(f, { stufe: 'offen', aktiv: false }, true), /Bestätigen Sie/);
});

test('Route, Seite, SQL, Menü: Server entscheidet, nur Geschäftsleitung schreibt, Protokoll unveränderbar', () => {
  const r = lies('app/api/rechts-freigaben/route.ts');
  assert.match(r, /rolleImBetrieb\(admin, user\.id\)/);
  assert.match(r, /\.eq\('owner_user_id', ich\.betrieb\)/);
  assert.match(r, /rechts_freigabe_protokoll/);
  assert.match(r, /istChef && z\?\.bestaetigt_am/); // Nachweis nur für die Geschäftsleitung
  assert.doesNotMatch(r, /body\.(betrieb|owner|rolle)\b/);
  const sql = lies('supabase-sql/p287-rechts-freigaben.sql');
  assert.match(sql, /create table if not exists public\.rechts_freigabe \(/);
  assert.match(sql, /before update or delete on public\.rechts_freigabe_protokoll/);
  assert.match(sql, /revoke all on function public\.rechts_freigabe_aktiv\(text, text\) from public, anon/);
  assert.doesNotMatch(sql, /create policy/i);
  const nav = lies('lib/rechte.ts');
  assert.match(nav, /href: '\/dashboard\/rechtliche-freigaben', nurChef: true/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/rechtliche-freigaben': \{/);
  assert.match(lies('app/dashboard/rechtliche-freigaben/page.tsx'), /ersetzt keine Rechtsberatung/);
});
