// Paket 131 (27.09.2026) — Etiketten, Speisekarte, Housekeeping-Zimmer, Raeume
// und Raum-Belegungen gehoeren beim Anlegen dem Betrieb, mit Rueckfall.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { betriebsKennung, istZugriffsFehler, mitBesitzer, anlegenFuerBetrieb } from '../out/betriebBesitzer.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const CHEF = 'chef-1';
const MA = 'ma-7';

test('betriebsKennung: Chef-Kennung gewinnt, sonst die eigene', () => {
  assert.equal(betriebsKennung(CHEF, MA), CHEF);
  assert.equal(betriebsKennung('  ', MA), MA);
  assert.equal(betriebsKennung(null, MA), MA);
  assert.equal(betriebsKennung(42, MA), MA);
  assert.equal(betriebsKennung(null, null), null);
});

test('istZugriffsFehler erkennt RLS, nicht andere Fehler', () => {
  assert.equal(istZugriffsFehler({ code: '42501', message: 'x' }), true);
  assert.equal(istZugriffsFehler({ message: 'new row violates row-level security policy for table "etikett_produkt"' }), true);
  assert.equal(istZugriffsFehler({ message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(istZugriffsFehler(null), false);
});

test('mitBesitzer setzt Besitzer ohne das Original zu aendern', () => {
  const z = { a: 1 };
  assert.deepEqual(mitBesitzer(z, CHEF), { a: 1, owner_user_id: CHEF });
  assert.deepEqual(z, { a: 1 });
  assert.deepEqual(mitBesitzer([{ a: 1 }, { a: 2 }], CHEF), [{ a: 1, owner_user_id: CHEF }, { a: 2, owner_user_id: CHEF }]);
  assert.deepEqual(mitBesitzer({ a: 1 }, null), { a: 1 });
});

test('Mitarbeiter: erster Versuch fuer den Betrieb, klappt -> kein Rueckfall', async () => {
  const aufrufe = [];
  const r = await anlegenFuerBetrieb({ b: 'Brot' }, CHEF, MA, async (d) => { aufrufe.push(d); return { error: null }; });
  assert.equal(r.rueckfall, false);
  assert.deepEqual(aufrufe, [{ b: 'Brot', owner_user_id: CHEF }]);
});

test('Mitarbeiter: Regel fehlt -> einmal Rueckfall auf eigene Kennung (niemand ausgesperrt)', async () => {
  const aufrufe = [];
  const r = await anlegenFuerBetrieb([{ b: 1 }], CHEF, MA, async (d) => {
    aufrufe.push(d);
    return d[0].owner_user_id === CHEF ? { error: { code: '42501', message: 'rls' } } : { error: null };
  });
  assert.equal(r.rueckfall, true);
  assert.equal(r.ergebnis.error, null);
  assert.deepEqual(aufrufe.map((d) => d[0].owner_user_id), [CHEF, MA]);
});

test('Anderer Fehler -> kein Rueckfall, Fehler kommt durch', async () => {
  let n = 0;
  const r = await anlegenFuerBetrieb({ b: 1 }, CHEF, MA, async () => { n++; return { error: { message: 'duplicate key' } }; });
  assert.equal(n, 1);
  assert.equal(r.rueckfall, false);
  assert.equal(r.ergebnis.error.message, 'duplicate key');
});

test('Chef: Besitzer = eigene Kennung, bei RLS-Fehler kein zweiter Versuch', async () => {
  let n = 0;
  const r = await anlegenFuerBetrieb({ b: 1 }, CHEF, CHEF, async () => { n++; return { error: { code: '42501' } }; });
  assert.equal(n, 1);
  assert.equal(r.rueckfall, false);
});

test('Besitzer noch nicht geladen -> eigene Kennung', async () => {
  const aufrufe = [];
  await anlegenFuerBetrieb({ b: 1 }, null, MA, async (d) => { aufrufe.push(d); return { error: null }; });
  assert.deepEqual(aufrufe, [{ b: 1, owner_user_id: MA }]);
});

test('Die drei Seiten schreiben nicht mehr die angemeldete Person als Besitzer', () => {
  for (const f of ['app/dashboard/etiketten/page.tsx', 'app/dashboard/housekeeping/page.tsx', 'app/dashboard/raeume/page.tsx']) {
    const s = lies(f);
    assert.doesNotMatch(s, /owner_user_id:\s*userId/, f);
    assert.match(s, /rpc\("mein_chef_id"\)/, f);
    assert.match(s, /anlegenFuerBetrieb\(/, f);
  }
  const tabellen = { 'app/dashboard/etiketten/page.tsx': ['etikett_produkt'], 'app/dashboard/housekeeping/page.tsx': ['hk_zimmer', 'menu_gericht'], 'app/dashboard/raeume/page.tsx': ['raum_ressource', 'raum_belegung'] };
  for (const [f, ts] of Object.entries(tabellen)) {
    const s = lies(f);
    for (const t of ts) {
      const inserts = s.match(new RegExp(`from\\("${t}"\\)\\.insert`, 'g')) || [];
      const ueberBetrieb = s.match(new RegExp(`anlegenFuerBetrieb\\([^;]*from\\("${t}"\\)\\.insert`, 'g')) || [];
      assert.ok(inserts.length > 0, `${t} in ${f}`);
      assert.equal(ueberBetrieb.length, inserts.length, `jedes Anlegen in ${t} laeuft ueber den Betrieb`);
    }
  }
});

test('SQL p131: additiv, idempotent, kein Loeschrecht fuer Mitarbeiter', () => {
  const s = lies('supabase-sql/p131-besitzer-betrieb.sql');
  const liste = (s.match(/tabellen text\[\] := array\[([^\]]*)\]/) || [])[1] || '';
  for (const t of ['etikett_produkt', 'hk_zimmer', 'menu_gericht', 'raum_ressource', 'raum_belegung']) assert.match(liste, new RegExp(`'${t}'`), t);
  assert.doesNotMatch(s, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b|\bdrop\s+policy\b/i);
  assert.doesNotMatch(s, /for\s+delete/i);
  assert.match(s, /not exists \(select 1 from pg_policies/);
});
