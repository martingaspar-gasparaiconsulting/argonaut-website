// Paket 164 (29.09.2026) — Zwei-Faktor-Anmeldung, Stufe 1 (Einrichten möglich, Pflicht noch aus).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { zweiFaktorWeg, hatVerifiziertenFaktor, pflichtAn, sichererWeiter, codeFormat, PRUEF_PFAD, EINRICHT_PFAD } from '../out/zweiFaktor.js';
import { erzeugeCodes, normalisiereCode, codeHash, CODE_ZEICHEN, CODE_ANZAHL } from '../out/zweiFaktorCodes.js';
import { bestaetigteStufe, zweiFaktorStand } from '../out/zweiFaktorServer.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const MIT = { factors: [{ status: 'verified' }] };
const HALB = { factors: [{ status: 'unverified' }] };
const OHNE = { factors: [] };

test('Weiche: mit Faktor nur aal2 durch; ohne Faktor in Stufe 1 immer durch; Pflicht schickt zum Einrichten', () => {
  assert.equal(zweiFaktorWeg({ aktuell: 'aal1', hatFaktor: true, pflicht: false }), 'pruefen');
  assert.equal(zweiFaktorWeg({ aktuell: 'aal2', hatFaktor: true, pflicht: false }), 'weiter');
  assert.equal(zweiFaktorWeg({ aktuell: 'aal1', hatFaktor: false, pflicht: false }), 'weiter', 'Stufe 1 sperrt niemanden aus');
  assert.equal(zweiFaktorWeg({ aktuell: 'aal1', hatFaktor: false, pflicht: true }), 'einrichten');
  assert.equal(zweiFaktorWeg({ aktuell: 'aal1', hatFaktor: true, pflicht: true }), 'pruefen');
  assert.equal(hatVerifiziertenFaktor(MIT), true);
  assert.equal(hatVerifiziertenFaktor(HALB), false, 'halbfertige Einrichtung zählt nicht');
  assert.equal(hatVerifiziertenFaktor(null), false);
  assert.equal(pflichtAn({ ZWEI_FAKTOR_PFLICHT: ' AN ' }), true);
  assert.equal(pflichtAn({ ZWEI_FAKTOR_PFLICHT: '1' }), false);
  assert.equal(pflichtAn({}), false);
  assert.ok(!PRUEF_PFAD.startsWith('/dashboard') && !EINRICHT_PFAD.startsWith('/dashboard'), 'keine Umleitungs-Schleife im Pfoertner');
});

test('Rücksprung nur auf eigene Seiten (keine offene Umleitung)', () => {
  assert.equal(sichererWeiter('/dashboard/crm'), '/dashboard/crm');
  assert.equal(sichererWeiter('/admin/command-center'), '/admin/command-center');
  for (const b of ['//boese.de', 'https://boese.de', '/\\boese.de', 'javascript:alert(1)', '/auth/login', '', null, '/dashboard\n/x']) {
    assert.equal(sichererWeiter(b), '/dashboard', String(b));
  }
  assert.equal(codeFormat(' 123 456 '), '123456');
  assert.equal(codeFormat('12345'), null);
  assert.equal(codeFormat('12a456'), null);
});

test('Notfall-Codes: 10 Stück, eindeutig, gut lesbar; Prüfsumme je Nutzer, ohne Geheimnis keine', () => {
  const codes = erzeugeCodes();
  assert.equal(codes.length, CODE_ANZAHL);
  assert.equal(new Set(codes).size, CODE_ANZAHL);
  for (const c of codes) {
    assert.match(c, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    assert.ok(![...c.replace('-', '')].some((z) => '01OIL'.includes(z)), 'keine verwechselbaren Zeichen');
  }
  let n = 0;
  const fest = erzeugeCodes(3, () => (n++ % CODE_ZEICHEN.length));
  assert.equal(fest.length, 3);
  assert.equal(normalisiereCode(' abcde-fgh23 '), 'ABCDEFGH23');
  assert.equal(normalisiereCode('ABCDE-FGH2O'), null, 'O gibt es nicht');
  assert.equal(normalisiereCode('ABCD'), null);
  const h = codeHash('nutzer-a', 'ABCDE-FGH23', 'geheim');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(codeHash('nutzer-a', 'abcdefgh23', 'geheim'), h, 'Schreibweise egal');
  assert.notEqual(codeHash('nutzer-b', 'ABCDE-FGH23', 'geheim'), h, 'gilt nur für den eigenen Nutzer');
  assert.notEqual(codeHash('nutzer-a', 'ABCDE-FGH23', 'anderes'), h);
  assert.equal(codeHash('nutzer-a', 'ABCDE-FGH23', ''), '', 'ohne Server-Geheimnis keine Codes');
  assert.ok(!h.includes('ABCDE'), 'nie der Code selbst');
});

test('Server-Stand: aal nur über getClaims; Fehler = Code verlangen; ohne Faktor keine Nachfrage', async () => {
  let fragen = 0;
  const mit = (antwort) => ({ auth: { getClaims: async () => { fragen++; if (antwort === 'wurf') throw new Error('x'); return antwort; } } });
  assert.equal(await bestaetigteStufe(mit({ data: { claims: { aal: 'aal2' } }, error: null })), 'aal2');
  assert.equal(await bestaetigteStufe(mit({ data: { claims: { aal: 'aal2' } }, error: new Error('ungültig') })), 'aal1');
  assert.equal(await bestaetigteStufe(mit('wurf')), 'aal1');
  assert.equal(await bestaetigteStufe(mit({ data: null, error: null })), 'aal1');
  fragen = 0;
  const s1 = await zweiFaktorStand(mit({ data: { claims: { aal: 'aal1' } }, error: null }), OHNE, false);
  assert.deepEqual(s1, { weg: 'weiter', hatFaktor: false, aal: 'aal1' });
  assert.equal(fragen, 0, 'ohne Faktor kein Zusatz-Aufwand');
  assert.equal((await zweiFaktorStand(mit({ data: { claims: { aal: 'aal1' } }, error: null }), MIT, false)).weg, 'pruefen');
  assert.equal((await zweiFaktorStand(mit({ data: { claims: { aal: 'aal2' } }, error: null }), MIT, false)).weg, 'weiter');
  assert.equal((await zweiFaktorStand(mit('wurf'), MIT, false)).weg, 'pruefen', 'Störung -> nie einfach durch');
  assert.equal((await zweiFaktorStand(mit({ data: null, error: null }), OHNE, true)).weg, 'einrichten');
});

test('Code-Wächter: Pfoertner, Admin, Betreiber-Wege; kein getSession; Stufe 1 ohne Pflicht', () => {
  const proxy = lies('proxy.ts');
  assert.match(proxy, /const \{ weg \} = await zweiFaktorStand\(supabase, user, false\)/, 'Stufe 1: pflicht false');
  assert.ok(proxy.indexOf('zweiFaktorStand(') > proxy.indexOf("return NextResponse.redirect(new URL('/auth/login', req.url))"), 'erst Anmeldung, dann Zwei-Faktor');
  assert.ok(proxy.indexOf('zweiFaktorStand(') < proxy.indexOf('BETREIBER-BUCHUNGS-GATE'), 'vor allen anderen Weichen');
  assert.match(proxy, /if \(weg !== 'weiter'\) \{\n      const ziel = new URL\(weg === 'pruefen' \? PRUEF_PFAD : EINRICHT_PFAD, req\.url\)/);
  assert.match(proxy, /return NextResponse\.redirect\(ziel\)/);
  assert.match(lies('app/admin/layout.tsx'), /zweiFaktorStand\(supabase, user, false\)\)\.weg === 'pruefen'/);
  assert.match(lies('lib/betreiberGuard.ts'), /zweiFaktorStand\(supabase, user, false\)\)\.weg !== 'weiter'/);
  for (const f of ['lib/zweiFaktor.ts', 'lib/zweiFaktorServer.ts', 'app/api/zwei-faktor/notfall/route.ts', 'app/api/zwei-faktor/notfall-codes/route.ts', 'app/api/zwei-faktor/ereignis/route.ts']) {
    assert.ok(!/\.getSession\(/.test(lies(f)), f + ' ohne getSession');
  }
  assert.match(lies('lib/zweiFaktorServer.ts'), /getClaims\(\)/);
});

test('Code-Wächter: Notfall-Codes nur mit aal2, Einlösen verbraucht einmalig, Fehlversuche gedeckelt', () => {
  const neu = lies('app/api/zwei-faktor/notfall-codes/route.ts');
  assert.match(neu, /auth\.getUser\(\)/);
  assert.match(neu, /if \(!stand\.hatFaktor \|\| stand\.aal !== 'aal2'\)/);
  assert.match(neu, /\.delete\(\)\.eq\('user_id', user\.id\)/, 'nur eigene alte Codes');
  assert.match(neu, /code_hash: codeHash\(user\.id, c\)/, 'nur Prüfsummen');
  const ein = lies('app/api/zwei-faktor/notfall/route.ts');
  assert.match(ein, /auth\.getUser\(\)/);
  assert.match(ein, /MAX_FEHLVERSUCHE_STUNDE/);
  assert.match(ein, /\.eq\('user_id', user\.id\)\.eq\('code_hash', hash\)\.is\('benutzt_am', null\)/, 'einmalig, nur eigener Code');
  assert.match(ein, /art: 'fehlversuch'/);
  assert.match(ein, /listFactors\(\{ userId: user\.id \}\)/);
  assert.ok(!/body\.(user|userId|user_id)/.test(ein), 'Kennung nie vom Browser');
  const sql = lies('supabase-sql/p164-zwei-faktor.sql');
  assert.ok(!/create policy [^;]* on public\.zwei_faktor_notfall/i.test(sql), 'Notfall-Codes: keine Regel für Nutzer');
  assert.ok(!/drop table|truncate|delete from/i.test(sql), 'additiv');
});
