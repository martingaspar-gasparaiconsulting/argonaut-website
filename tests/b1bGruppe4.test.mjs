// B1b Gruppe 4 (26.09.2026) — weitere Arbeitstabellen gehoeren dem Betrieb (Befund K5).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('B1b Gruppe 4: Regeln ohne Löschen, Seiten arbeiten für den Betrieb', () => {
  const sql = lies('supabase-sql/b1b-gruppe4-arbeitstabellen.sql');
  for (const t of ['aufgaben', 'auftrag_positionen', 'kontakt_tags', 'projekt_teams', 'verkaufschancen', 'objekte', 'text_werk', 'post_vorgang']) assert.ok(sql.includes(`'${t}'`), t);
  assert.ok(!/for delete/i.test(sql), 'kein Löschrecht');
  assert.ok(!/drop table|drop column|truncate|delete from/i.test(sql));
  const p = lies('app/dashboard/projekte/[id]/page.tsx');
  assert.ok(p.includes("setOwnerId(betrieb)"));
  assert.ok(!/from\('projekte'\)\.select\('\*'\)\.eq\('id', projektId\)\.eq\('owner_user_id', uid\)/.test(p));
  assert.ok(!lies('app/dashboard/_components/SachbearbeiterErgebnis.tsx').includes('owner_user_id: uid'));
  assert.ok(lies('app/dashboard/marketing/texte/page.tsx').includes('owner_user_id: besitzer ?? uid, art'));
  assert.ok(lies('app/dashboard/projekte/ProjekteAuge.tsx').includes('.eq("owner_user_id", betrieb)'));
});
