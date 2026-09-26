// B1c (26.09.2026): Eigene Felder und ihre Werte gehoeren dem Betrieb.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { betriebsKennung } from '../out/eigeneFelder.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('B1c Betriebs-Kennung: Mitarbeiter -> Chef, Chef -> eigene', () => {
  assert.equal(betriebsKennung('chef-1', 'ma-7'), 'chef-1');
  assert.equal(betriebsKennung(null, 'chef-1'), 'chef-1');
  assert.equal(betriebsKennung('', 'chef-1'), 'chef-1');
  assert.equal(betriebsKennung(undefined, null), null);
  assert.equal(betriebsKennung(42, 'x'), 'x');
});

test('B1c Werte und Felder werden mit der Betriebs-Kennung gespeichert', () => {
  const s = lies('app/dashboard/_components/EigeneFelder.tsx');
  assert.ok(s.includes("supabase.rpc('mein_chef_id')"));
  assert.ok(s.includes('const betrieb = await betriebsId(ownerId);'));
  assert.equal((s.match(/owner_user_id: betrieb,/g) || []).length, 2);
  assert.ok(!s.includes('owner_user_id: ownerId'));
  assert.ok(!s.includes('Nur Sie sehen Ihre Felder'));
  const sql = lies('supabase-sql/b1c-eigene-felder-betrieb.sql').replace(/--[^\n]*/g, '');
  assert.ok(/update public\.eigenes_feld_wert w/.test(sql) && /join public\.mitarbeiter m on m\.auth_user_id/.test(sql));
  assert.ok(!/\bdelete\b|\bdrop\b|create policy|alter policy/i.test(sql));
});
