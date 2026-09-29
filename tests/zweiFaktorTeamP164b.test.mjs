// Paket 164 Stufe 2 (29.09.2026) — Zwei-Faktor im Team: Pflicht per Schalter, Zurücksetzen durch
// Chef/Vertretung (höchstens 2 Personen je Betrieb), Betreiber-Tür, Hilfe-Anfragen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { helferPlaetze, darfHelferSetzen, darfZuruecksetzen, hilfeAnBetreiber, emailNorm, STANDARD_MAX_PERSONEN } from '../out/zweiFaktorTeam.js';
import { rolleImBetrieb, faktorZuruecksetzen } from '../out/zweiFaktorTeamServer.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const CHEF = { userId: 'chef', betrieb: 'chef', rolle: 'chef', aal2: true };
const HELFER = { userId: 'h1', betrieb: 'chef', rolle: 'helfer', aal2: true };
const MA = { userId: 'ma2', betrieb: 'chef', istChef: false };

test('Höchstens 2 Personen je Betrieb (Chef + 1), Betreiber kann erhöhen', () => {
  assert.equal(STANDARD_MAX_PERSONEN, 2);
  assert.equal(helferPlaetze(null), 1);
  assert.equal(helferPlaetze(2), 1);
  assert.equal(helferPlaetze(5), 4);
  assert.equal(helferPlaetze(1), 0);
  assert.equal(helferPlaetze(99), 18, 'gedeckelt');
  assert.equal(darfHelferSetzen({ rolle: 'chef', anzahlHelfer: 0, maxPersonen: null, schonHelfer: false }), true);
  assert.equal(darfHelferSetzen({ rolle: 'chef', anzahlHelfer: 1, maxPersonen: null, schonHelfer: false }), false, 'zweite Vertretung nur mit höherer Grenze');
  assert.equal(darfHelferSetzen({ rolle: 'chef', anzahlHelfer: 1, maxPersonen: 3, schonHelfer: false }), true);
  assert.equal(darfHelferSetzen({ rolle: 'chef', anzahlHelfer: 1, maxPersonen: 2, schonHelfer: true }), true, 'bestehende bleibt');
  assert.equal(darfHelferSetzen({ rolle: 'helfer', anzahlHelfer: 0, maxPersonen: 5, schonHelfer: false }), false, 'nur der Chef bestimmt');
});

test('Wer darf zurücksetzen: Chef und Vertretung im eigenen Betrieb, nie ohne Code, nie sich selbst, Chef nur durch Betreiber', () => {
  assert.equal(darfZuruecksetzen(CHEF, MA).ja, true);
  assert.equal(darfZuruecksetzen(HELFER, MA).ja, true);
  assert.equal(darfZuruecksetzen({ ...CHEF, aal2: false }, MA).ja, false, 'nur mit eigenem bestätigtem Code');
  assert.equal(darfZuruecksetzen({ ...HELFER, rolle: 'mitarbeiter' }, MA).ja, false);
  assert.equal(darfZuruecksetzen(CHEF, { ...MA, betrieb: 'fremd' }).ja, false, 'nur eigener Betrieb');
  assert.equal(darfZuruecksetzen(HELFER, { userId: 'chef', betrieb: 'chef', istChef: true }).ja, false, 'Vertretung nie für den Chef');
  assert.equal(darfZuruecksetzen(HELFER, { ...MA, userId: 'h1' }).ja, false, 'nie sich selbst');
  const betreiber = { userId: 'martin', betrieb: '', rolle: 'betreiber', aal2: true };
  assert.equal(darfZuruecksetzen(betreiber, { userId: 'chef', betrieb: 'chef', istChef: true }).ja, true);
  assert.equal(darfZuruecksetzen(betreiber, { ...MA, userId: 'martin' }).ja, false);
  assert.match(darfZuruecksetzen(HELFER, { userId: 'chef', betrieb: 'chef', istChef: true }).grund, /Betreiber/);
});

test('Hilfe-Anfragen: Chef sofort zum Betreiber, sonst nach 24 Stunden', () => {
  const jetzt = new Date('2026-09-29T12:00:00Z');
  assert.equal(hilfeAnBetreiber({ vom_chef: true, erstellt_am: '2026-09-29T11:59:00Z', status: 'offen' }, jetzt), true);
  assert.equal(hilfeAnBetreiber({ vom_chef: false, erstellt_am: '2026-09-29T00:00:00Z', status: 'offen' }, jetzt), false);
  assert.equal(hilfeAnBetreiber({ vom_chef: false, erstellt_am: '2026-09-28T12:00:00Z', status: 'offen' }, jetzt), true);
  assert.equal(hilfeAnBetreiber({ vom_chef: true, erstellt_am: '2026-09-28T12:00:00Z', status: 'erledigt' }, jetzt), false);
  assert.equal(emailNorm('  Chef@Firma.DE '), 'chef@firma.de');
  assert.equal(emailNorm('kein-at'), null);
});

function fakeAdmin(tabellen) {
  const log = [];
  const from = (t) => {
    const f = { filter: {}, t };
    const kette = {
      select() { return kette; }, eq(k, v) { f.filter[k] = v; return kette; }, is() { return kette; }, not() { return kette; },
      async maybeSingle() { log.push(['select', t, { ...f.filter }]); const z = (tabellen[t] ?? []).find((r) => Object.entries(f.filter).every(([k, v]) => r[k] === v)); return { data: z ?? null }; },
      delete() { f.art = 'delete'; return kette; }, update(d) { f.art = 'update'; f.d = d; return kette; },
      insert(d) { log.push(['insert', t, d]); return Promise.resolve({ error: null }); },
      then(res) { log.push([f.art ?? 'select', t, { ...f.filter }]); return Promise.resolve({ error: null, data: [] }).then(res); },
    };
    return kette;
  };
  return {
    log, from, rpc: async () => ({ error: null }),
    auth: { admin: { mfa: {
      listFactors: async ({ userId }) => { log.push(['list', userId]); return { data: { factors: [{ id: 'f1' }, { id: 'f2' }] }, error: null }; },
      deleteFactor: async ({ id, userId }) => { log.push(['del', id, userId]); return { error: null }; },
    } } },
  };
}

test('Server: Rolle kommt aus der Datenbank; Zurücksetzen löscht nur Faktoren + Codes und schreibt den Nachweis', async () => {
  const admin = fakeAdmin({
    mitarbeiter: [{ id: 'm1', owner_user_id: 'chef', auth_user_id: 'h1', vorname: 'Simone', nachname: 'G' }, { id: 'm2', owner_user_id: 'chef', auth_user_id: 'ma2', vorname: 'Franz', nachname: null }],
    zwei_faktor_helfer: [{ owner_user_id: 'chef', user_id: 'h1', id: 'x' }],
  });
  assert.deepEqual(await rolleImBetrieb(admin, 'h1'), { betrieb: 'chef', rolle: 'helfer', mitarbeiterId: 'm1', name: 'Simone G' });
  assert.equal((await rolleImBetrieb(admin, 'ma2')).rolle, 'mitarbeiter');
  assert.deepEqual(await rolleImBetrieb(admin, 'chef'), { betrieb: 'chef', rolle: 'chef', mitarbeiterId: null, name: 'Geschäftsleitung' });
  const f = await faktorZuruecksetzen(admin, { betrieb: 'chef', zielUserId: 'ma2', zielName: 'Franz', durchUserId: 'h1', durchRolle: 'helfer' });
  assert.equal(f, null);
  assert.deepEqual(admin.log.filter((l) => l[0] === 'del').map((l) => l[1]), ['f1', 'f2']);
  assert.ok(admin.log.every((l) => l[0] !== 'del' || l[2] === 'ma2'), 'nur der Ziel-Zugang');
  assert.ok(admin.log.some((l) => l[0] === 'delete' && l[1] === 'zwei_faktor_notfall' && l[2].user_id === 'ma2'));
  const nachweis = admin.log.find((l) => l[0] === 'insert' && l[1] === 'zwei_faktor_ruecksetzungen');
  assert.deepEqual(nachweis[2], { owner_user_id: 'chef', ziel_user_id: 'ma2', ziel_name: 'Franz', durch_user_id: 'h1', durch_rolle: 'helfer' });
  const verboten = ['kontakte', 'mitarbeiter_rechte', 'profiles', 'rechnungen'];
  assert.ok(!admin.log.some((l) => (l[0] === 'delete' || l[0] === 'update') && verboten.includes(l[1])), 'Daten und Rechte bleiben');
});

test('Code-Wächter: Pflicht nur per Schalter, Team-Weg mit aal2 und Betriebs-Filter, Betreiber-Tür doppelt geschlossen', () => {
  const team = lies('app/api/zwei-faktor/team/route.ts');
  assert.match(team, /auth\.getUser\(\)/);
  assert.match(team, /aal2: stand\.hatFaktor && stand\.aal === 'aal2'/);
  assert.match(team, /\.eq\('id', body\.mitarbeiterId\)\.eq\('owner_user_id', ich\.betrieb\)/, 'Ziel nur aus dem eigenen Betrieb');
  assert.match(team, /istChef: false/, 'über die Team-Seite nie der Chef');
  assert.match(team, /if \(ich\.rolle !== 'chef'\) return NextResponse\.json\(\{ ok: false, error: 'Nur die Geschäftsleitung bestimmt die Vertretung\.' \}/);
  assert.match(team, /darfHelferSetzen\(/);
  assert.ok(!/body\.(userId|user_id|betrieb|owner)/.test(team), 'Kennung/Betrieb nie vom Browser');
  const betreiber = lies('app/api/admin/zwei-faktor/route.ts');
  assert.match(betreiber, /const \{ absage \} = await betreiberPruefung\(\);\n  if \(absage\) return absage;/);
  assert.match(betreiber, /const \{ absage, userId \} = await betreiberPruefung\(\);\n  if \(absage\) return absage;/);
  const hilfe = lies('app/api/zwei-faktor/hilfe/route.ts');
  assert.match(hilfe, /\.eq\('status', 'offen'\)\.limit\(1\)/, 'eine offene Anfrage, keine Flut');
  assert.match(lies('lib/zweiFaktor.ts'), /ZWEI_FAKTOR_PFLICHT/);
  const einr = lies('app/auth/zwei-faktor/einrichten/page.tsx');
  assert.match(einr, /\{!pflicht && <button type="button" onClick=\{entfernen\}/, 'bei Pflicht kein Entfernen');
  const sql = lies('supabase-sql/p164b-zwei-faktor-team.sql');
  assert.ok(!/create policy/i.test(sql), 'keine Regeln: nur der Server');
  assert.ok(!/drop table|truncate|delete from/i.test(sql), 'additiv');
  assert.match(sql, /max_personen  integer not null default 2/);
});
