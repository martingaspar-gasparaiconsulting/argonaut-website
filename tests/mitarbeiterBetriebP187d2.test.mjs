// ============================================================================
// tests/mitarbeiterBetriebP187d2.test.mjs — Paket 187d Teil 2: Tabelle
// „mitarbeiter" — Anlegen durch die Büroleitung gehört dem Betrieb, Rechte-
// Felder kann ein Mitarbeiter nie setzen, Besitzer nie umhängen, kein Löschen.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SQL = fs.readFileSync(path.join(WURZEL, 'supabase-sql/p187d2-mitarbeiter-betrieb.sql'), 'utf8');
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('p187d2: Besitzer-Trigger und Rechte-Schutz auf mitarbeiter', () => {
  assert.match(CODE, /create trigger p181_besitzer before insert or update on public\.mitarbeiter/);
  assert.match(CODE, /create trigger p187d_ma_rechte_schuetzen before insert or update on public\.mitarbeiter/);
  assert.match(CODE, /if v_chef is null then\s+return new;/);
  assert.match(CODE, /jsonb_build_object\('darf_abrechnen', false, 'leitungsrolle', null\)/);
  assert.match(CODE, /unnest\(array\['darf_abrechnen', 'leitungsrolle', 'nutzer_typ'\]\)/);
  assert.match(CODE, /unnest\(array\['status', 'austrittsdatum'\]\)/);
  assert.match(CODE, /old\.auth_user_id = auth\.uid\(\)/);
});

test('p187d2: Regeln nur Anlegen/Ändern mit Personal-Schreibrecht im eigenen Betrieb, kein Löschen', () => {
  assert.match(CODE, /p187d_ma_insert on public\.mitarbeiter for insert to authenticated\s+with check \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\('personal'\)\)/);
  assert.match(CODE, /p187d_ma_update on public\.mitarbeiter for update to authenticated\s+using \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\('personal'\)\)/);
  assert.doesNotMatch(CODE, /for delete/i);
});

test('p187d2: nur additiv, Rückweg dokumentiert', () => {
  assert.doesNotMatch(CODE, /\bdrop\s+(table|column|function|schema)\b|\bdelete\s+from\b|\btruncate\b|\balter\s+table\b|\bupdate\s+public\./i);
  for (const m of CODE.matchAll(/drop (policy|trigger) if exists (\w+)/gi)) assert.match(m[2], /^(p187d_|p181_besitzer$)/, m[0]);
  assert.match(SQL, /-- Rückweg \(NOTFALL/);
  assert.match(CODE, /falsch_angehaengt/);
});
