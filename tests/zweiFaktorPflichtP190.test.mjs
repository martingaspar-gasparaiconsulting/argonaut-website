// ============================================================================
// tests/zweiFaktorPflichtP190.test.mjs — Paket 190: Zwei-Faktor-Pflicht je Betrieb
//
// Martin 29.09.2026: Inhaber schaltet „Für alle Pflicht" selbst ein — nur mit
// eigenem Code, Häkchen „Mitarbeiter informiert", Betriebsrat einbezogen bzw.
// keiner vorhanden; Nachweis; 7 Tage Übergangsfrist; jederzeit abschaltbar.
// Störung sperrt nie (fehlende Funktion / Fehler = keine Betriebs-Pflicht).
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  UEBERGANG_TAGE, pflichtAbFuer, pflichtWirkt, pflichtStand, einschaltenPruefen,
  ausschaltenPruefen, neuerPflichtTag, datumDe,
} from '../out/zweiFaktorPflicht.js';
import { betriebPflichtAb } from '../out/zweiFaktorServer.js';
import { zweiFaktorWeg } from '../out/zweiFaktor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (f) => fs.readFileSync(path.join(WURZEL, f), 'utf8');
const JETZT = new Date('2026-09-30T18:00:00Z');

test('Übergangsfrist: genau 7 Tage nach dem Einschalten', () => {
  assert.equal(UEBERGANG_TAGE, 7);
  assert.equal(pflichtAbFuer(JETZT).toISOString(), '2026-10-07T18:00:00.000Z');
});

test('pflichtWirkt: erst ab dem Pflicht-Tag; leer/unlesbar = nie', () => {
  assert.equal(pflichtWirkt('2026-10-07T18:00:00Z', JETZT), false);
  assert.equal(pflichtWirkt('2026-10-07T18:00:00Z', new Date('2026-10-07T18:00:00Z')), true);
  assert.equal(pflichtWirkt('2026-09-01T00:00:00Z', JETZT), true);
  for (const x of [null, undefined, '', 'kaputt']) assert.equal(pflichtWirkt(x, JETZT), false);
});

test('pflichtStand: aus / Übergang mit Resttagen / Pflicht', () => {
  assert.deepEqual(pflichtStand(null, JETZT), { stufe: 'aus', ab: null, restTage: 0 });
  assert.equal(pflichtStand({ an: false, pflicht_ab: '2026-09-01T00:00:00Z' }, JETZT).stufe, 'aus', 'ausgeschaltet = aus, auch mit altem Tag');
  const u = pflichtStand({ an: true, pflicht_ab: '2026-10-07T18:00:00Z' }, JETZT);
  assert.equal(u.stufe, 'uebergang'); assert.equal(u.restTage, 7);
  assert.equal(pflichtStand({ an: true, pflicht_ab: '2026-09-29T00:00:00Z' }, JETZT).stufe, 'pflicht');
  assert.equal(pflichtStand({ an: true, pflicht_ab: null }, JETZT).stufe, 'aus');
});

test('Einschalten: nur Geschäftsleitung, nur mit Code, beide Bestätigungen', () => {
  const gut = { rolle: 'chef', aal2: true, mitarbeiterInformiert: true, betriebsrat: 'keiner' };
  assert.equal(einschaltenPruefen(gut).ja, true);
  assert.equal(einschaltenPruefen({ ...gut, betriebsrat: 'einbezogen' }).ja, true);
  for (const r of ['mitarbeiter', 'helfer', 'betreiber']) assert.equal(einschaltenPruefen({ ...gut, rolle: r }).ja, false, r);
  assert.equal(einschaltenPruefen({ ...gut, aal2: false }).ja, false);
  for (const x of [false, 'true', 1, undefined]) assert.equal(einschaltenPruefen({ ...gut, mitarbeiterInformiert: x }).ja, false);
  for (const x of ['', 'ja', undefined, null]) assert.equal(einschaltenPruefen({ ...gut, betriebsrat: x }).ja, false);
});

test('Ausschalten: Geschäftsleitung mit Code', () => {
  assert.equal(ausschaltenPruefen({ rolle: 'chef', aal2: true }).ja, true);
  assert.equal(ausschaltenPruefen({ rolle: 'chef', aal2: false }).ja, false);
  assert.equal(ausschaltenPruefen({ rolle: 'helfer', aal2: true }).ja, false);
});

test('Nochmal Einschalten verschiebt die Frist nicht; nach Aus beginnt sie neu', () => {
  assert.equal(neuerPflichtTag({ an: true, pflicht_ab: '2026-10-03T10:00:00Z' }, JETZT), '2026-10-03T10:00:00.000Z');
  assert.equal(neuerPflichtTag({ an: false, pflicht_ab: '2026-10-03T10:00:00Z' }, JETZT), '2026-10-07T18:00:00.000Z');
  assert.equal(neuerPflichtTag(null, JETZT), '2026-10-07T18:00:00.000Z');
});

test('datumDe: Berliner Datum', () => {
  assert.equal(datumDe('2026-10-07T22:30:00Z'), '08.10.2026');
  assert.equal(datumDe(null), '');
});

test('STÖRUNG SPERRT NIE: Fehler, fehlende Funktion, Ausnahme -> keine Betriebs-Pflicht', async () => {
  assert.equal(await betriebPflichtAb({ rpc: async () => ({ data: null, error: { message: 'function does not exist' } }) }), null);
  assert.equal(await betriebPflichtAb({ rpc: async () => { throw new Error('netz'); } }), null);
  assert.equal(await betriebPflichtAb({ rpc: async () => ({ data: '2026-09-01T00:00:00Z', error: { message: 'x' } }) }), null, 'Fehler zaehlt, auch wenn Daten dabei sind');
  assert.equal(await betriebPflichtAb({ rpc: async () => ({ data: null, error: null }) }), null);
  assert.equal(await betriebPflichtAb({ rpc: async () => ({ data: '2026-10-07T18:00:00+00:00', error: null }) }), '2026-10-07T18:00:00+00:00');
});

test('Weiche: Pflicht schickt ohne Faktor zur Einrichtung, mit Faktor ändert sich nichts', () => {
  assert.equal(zweiFaktorWeg({ aktuell: 'aal1', hatFaktor: false, pflicht: true }), 'einrichten');
  assert.equal(zweiFaktorWeg({ aktuell: 'aal1', hatFaktor: false, pflicht: false }), 'weiter');
  assert.equal(zweiFaktorWeg({ aktuell: 'aal2', hatFaktor: true, pflicht: true }), 'weiter');
});

test('WAECHTER: Pfoertner nimmt die Betriebs-Pflicht, nur ohne Faktor, Einrichtung bleibt ausserhalb', () => {
  const p = lies('proxy.ts');
  assert.match(p, /pflichtWirkt\(await betriebPflichtAb\(supabase\), new Date\(\)\)/);
  assert.match(p, /if \(!pflicht && !hatVerifiziertenFaktor\(user\)\)/);
  assert.match(p, /zweiFaktorStand\(supabase, user, pflicht\)/);
  assert.match(lies('lib/zweiFaktor.ts'), /EINRICHT_PFAD = '\/auth\/zwei-faktor\/einrichten'/, 'Einrichtung liegt unter /auth, nicht im geschuetzten /dashboard');
  assert.match(p, /if \(!pfad\.startsWith\('\/dashboard'\)\) return NextResponse\.next\(\)/);
});

test('WAECHTER: Schnittstelle prüft Rolle, Code und Bestätigungen am Server', () => {
  const r = lies('app/api/zwei-faktor/pflicht/route.ts');
  assert.match(r, /rolleImBetrieb\(admin, a\.user\.id\)/);
  assert.match(r, /einschaltenPruefen\(\{ rolle: ich\.rolle, aal2: a\.aal2/);
  assert.match(r, /ausschaltenPruefen\(\{ rolle: ich\.rolle, aal2: a\.aal2 \}\)/);
  assert.match(r, /zwei_faktor_pflicht_protokoll/);
  assert.match(r, /\.eq\('owner_user_id', ich\.betrieb\)/);
  assert.doesNotMatch(r, /body\.(betrieb|owner\w*|userId)\b/, 'Betrieb nie vom Browser');
  const s = lies('app/api/zwei-faktor/stand/route.ts');
  assert.match(s, /pflichtAn\(process\.env\) \|\| pflichtWirkt\(pflichtAb, new Date\(\)\)/);
});

test('WAECHTER: SQL additiv, Funktion nicht fuer anon, Karte in den Einstellungen', () => {
  const q = lies('supabase-sql/p190-zwei-faktor-pflicht.sql');
  assert.match(q, /create table if not exists public\.zwei_faktor_pflicht \(/);
  assert.match(q, /revoke all on function public\.zwei_faktor_pflicht_ab\(\) from public, anon/);
  assert.match(q, /coalesce\(public\.mein_chef_id\(\), v_uid\)/);
  assert.doesNotMatch(q, /\b(drop|delete|truncate|alter table [^;]* drop)\b/i);
  assert.match(lies('app/dashboard/einstellungen/page.tsx'), /<ZweiFaktorPflichtKarte \/>/);
});
