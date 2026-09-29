// Paket 177 (29.09.2026) — Kuendigungs-Sperre je Betrieb: Chef UND Mitarbeiter,
// Dashboard + Anmeldung + Schnittstellen, Sperren nur durch den Betreiber,
// Stoerung sperrt nie alle aus. Verhalten des SQL in PGlite geprueft (Baulog).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sperrAusRpc, kontenDesBetriebs, sperrenErlaubt } from '../out/churnSperre.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CHEF = '11111111-1111-4111-8111-111111111111';
const MA = '22222222-2222-4222-8222-222222222222';
const FREMD = '33333333-3333-4333-8333-333333333333';
const OP = '99999999-9999-4999-8999-999999999999';

test('sperrAusRpc: nur ein echtes true sperrt, Fehler = unentschieden (dann alte Pruefung)', () => {
  assert.equal(sperrAusRpc(true, null), true);
  assert.equal(sperrAusRpc(false, null), false);
  assert.equal(sperrAusRpc('true', null), false);
  assert.equal(sperrAusRpc(null, null), false);
  assert.equal(sperrAusRpc(true, { message: 'function does not exist' }), null);
});

test('kontenDesBetriebs: Chef + eigene Mitarbeiter, nie Fremde, nie der Betreiber', () => {
  const ma = [
    { owner_user_id: CHEF, auth_user_id: MA },
    { owner_user_id: FREMD, auth_user_id: '44444444-4444-4444-8444-444444444444' },
    { owner_user_id: CHEF, auth_user_id: null },
    { owner_user_id: CHEF, auth_user_id: 'kaputt' },
    { owner_user_id: CHEF, auth_user_id: OP },
  ];
  assert.deepEqual(kontenDesBetriebs(CHEF, ma, OP).sort(), [CHEF, MA].sort());
  assert.deepEqual(kontenDesBetriebs(OP, [], OP), []);
  assert.deepEqual(kontenDesBetriebs('kein-uuid', ma, OP), []);
  assert.deepEqual(kontenDesBetriebs(CHEF.toUpperCase(), ma, OP).sort(), [CHEF, MA].sort());
});

test('sperrenErlaubt: gueltiger Betrieb, nie der Betreiber, Grund Pflicht', () => {
  assert.equal(sperrenErlaubt(CHEF, OP, 'Kündigung zum 31.10.').ok, true);
  assert.equal(sperrenErlaubt(OP, OP, 'Kündigung zum 31.10.').ok, false);
  assert.equal(sperrenErlaubt(CHEF, OP, 'x').ok, false);
  assert.equal(sperrenErlaubt('', OP, 'Kündigung').ok, false);
});

test('Eine Pruefung ueberall: Layout, Anmelde-Callback und nurAngemeldet nutzen betriebSperrePruefen', () => {
  for (const p of ['app/dashboard/layout.tsx', 'app/auth/callback/route.ts', 'lib/nurAngemeldet.ts']) {
    const s = ohneKommentare(lies(p));
    assert.match(s, /await betriebSperrePruefen\(supabase\)/, p);
    assert.doesNotMatch(s, /from\('churned_customers'\)/, `${p}: alte Einzelpruefung muss weg sein`);
  }
  const n = ohneKommentare(lies('lib/nurAngemeldet.ts'));
  assert.match(n, /if \(sperre\.gesperrt\) \{\s*return NextResponse\.json\(\{ ok: false, error: 'Der Zugang dieses Betriebs ist gesperrt\.' \}, \{ status: 403 \}\)/);
});

test('Stoerung sperrt nie: RPC-Fehler -> alte Pruefung, Ausnahme -> nicht gesperrt', () => {
  const s = ohneKommentare(lies('lib/betriebSperreServer.ts'));
  assert.match(s, /sb\.rpc\('betrieb_gesperrt'\)/);
  assert.match(s, /if \(ja !== null\) return \{ gesperrt: ja, protokoll: null \}/);
  assert.match(s, /return churnEntscheidung\(data, error\)/);
  assert.match(s, /return \{ gesperrt: false, protokoll: '\[churn-lock\]/);
});

test('Admin-Schnittstelle: nur Betreiber, sperrt und bannt, entsperren hebt beides auf', () => {
  const s = ohneKommentare(lies('app/api/admin/betrieb-sperre/route.ts'));
  assert.equal((s.match(/await betreiberPruefung\(\)/g) || []).length, 2, 'GET und POST');
  assert.match(s, /sperrenErlaubt\(betrieb, process\.env\.ANALYSE_BETREIBER_ID, grund\)/);
  assert.match(s, /kontenDesBetriebs\(betrieb, [\s\S]{0,120}process\.env\.ANALYSE_BETREIBER_ID\)/);
  assert.match(s, /updateUserById\(id, \{ ban_duration: LANG \}\)/);
  assert.match(s, /updateUserById\(id, \{ ban_duration: 'none' \}\)/);
  // Sperre wird ZUERST gespeichert, dann gebannt.
  assert.ok(s.indexOf("from('betrieb_sperre').upsert") < s.indexOf('ban_duration: LANG'));
  // Entsperren loescht nie (Nachweis bleibt).
  assert.doesNotMatch(s, /\.delete\(\)/);
});

test('Nur hier wird gebannt (sonst hebt Entsperren fremde Sperren auf)', () => {
  const treffer = [];
  const lauf = (d) => { for (const e of fs.readdirSync(path.join(WURZEL, d), { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) lauf(p); }
    else if (/\.tsx?$/.test(e.name) && /ban_duration/.test(lies(p))) treffer.push(p.split(path.sep).join('/'));
  } };
  lauf('app'); lauf('lib');
  assert.deepEqual(treffer, ['app/api/admin/betrieb-sperre/route.ts']);
});

test('Betriebs-Akte hat den Reiter „Zugang / Kündigung" mit Grund und Rueckfrage', () => {
  const s = lies('app/admin/command-center/betrieb/[id]/page.tsx');
  assert.match(s, /tab\('zugang', 'Zugang \/ Kündigung'\)/);
  assert.match(s, /<ZugangSperre betrieb=\{id\} \/>/);
  assert.match(s, /window\.confirm\(frage\)/);
  assert.match(s, /disabled=\{busy \|\| grund\.trim\(\)\.length < 5\}/);
});

test('SQL p177: additiv, Browser-Rollen ohne Zugriff, Chef UND Mitarbeiter, idempotent', () => {
  const s = lies('supabase-sql/p177-betrieb-sperre.sql');
  const o = s.replace(/--.*$/gm, '');
  assert.match(o, /create table if not exists public\.betrieb_sperre/);
  assert.match(o, /enable row level security/);
  assert.match(o, /revoke all on public\.betrieb_sperre from anon, authenticated;/);
  assert.doesNotMatch(o, /create policy/, 'keine Regel fuer Browser-Rollen');
  assert.match(o, /coalesce\(public\.mein_chef_id\(\), v_uid\)/);
  assert.match(o, /s\.aufgehoben_am is null/);
  assert.match(o, /security definer/);
  assert.match(o, /revoke all on function public\.betrieb_gesperrt\(\) from public, anon;/);
  assert.doesNotMatch(o, /\bdrop (table|function)\b|\bdelete from\b|\btruncate\b|\binsert into\b/i);
});
