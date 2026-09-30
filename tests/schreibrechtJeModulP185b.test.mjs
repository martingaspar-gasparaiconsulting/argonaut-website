// Paket 185b (30.09.2026) — Schreiben nur mit Modul-Schreibrecht (RESTRICTIVE-Schranken).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p185b-schreibrecht-je-modul.sql');
const ohneKommentar = SQL.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');
const LISTE = [...ohneKommentar.matchAll(/array\['([a-z0-9_]+)', '([a-z0-9,-]+)', '([iud]+)'\]/g)].map((m) => ({ t: m[1], module: m[2].split(','), arten: m[3] }));

test('Liste: viele Tabellen, jede mit Modul und Schreibart', () => {
  assert.ok(LISTE.length >= 150, String(LISTE.length));
  assert.equal(new Set(LISTE.map((z) => z.t)).size, LISTE.length, 'keine Tabelle doppelt');
  for (const z of LISTE) assert.ok(z.module.length > 0 && z.arten.length > 0, z.t);
});

test('Jedes Modul gibt es auf der Seite /rechte', () => {
  const rechte = lies('lib/rechte.ts');
  for (const m of new Set(LISTE.flatMap((z) => z.module))) assert.ok(rechte.includes(`modul: '${m}'`), 'unbekanntes Modul: ' + m);
});

test('Selbstbedienung, Rechnungen/Zahlungen und Abo-Rechnungen bleiben ausgenommen', () => {
  const tabellen = new Set(LISTE.map((z) => z.t));
  for (const t of ['hr_zeiterfassung', 'hr_abwesenheiten', 'hr_dokumente', 'hr_schicht_tausch', 'mitarbeiter_rechte', 'rechnungen',
    'rechnung_positionen', 'zahlungen', 'mahnung_historie', 'abo_rechnungen', 'sprach_profil', 'gesundheit_notiz', 'eigenes_feld_wert']) {
    assert.ok(!tabellen.has(t), t);
  }
});

test('Schranke: Chef immer, Mitarbeiter nur mit Schreibrecht eines der Module — nur restriktiv', () => {
  assert.match(ohneKommentar, /bed := 'public\.mein_chef_id\(\) is null';/);
  assert.match(ohneKommentar, /bed := bed \|\| format\(' or public\.darf_ich_modul_aendern\(%L\)', m\);/);
  const creates = ohneKommentar.match(/create policy [^\n]+/g) || [];
  assert.equal(creates.length, 3);
  assert.ok(creates.every((c) => /as restrictive/.test(c)));
  assert.match(ohneKommentar, /as restrictive for insert to authenticated with check \(%s\)/);
  assert.match(ohneKommentar, /as restrictive for update to authenticated using \(%s\) with check \(%s\)/);
  assert.match(ohneKommentar, /as restrictive for delete to authenticated using \(%s\)/);
});

test('SQL additiv: nichts geloescht, nur eigene Schranken neu gesetzt, Notfall-Block auskommentiert', () => {
  assert.ok(!/drop table|drop column|delete from|truncate|disable row level security/i.test(ohneKommentar));
  const drops = ohneKommentar.match(/drop policy if exists (\S+)/g) || [];
  assert.ok(drops.length === 3 && drops.every((d) => /p185b_/.test(d)));
  assert.match(SQL, /-- NOTFALL/);
  assert.ok(!/policyname like 'p185b_%' loop/.test(ohneKommentar), 'Notfall-Block ist auskommentiert');
});
