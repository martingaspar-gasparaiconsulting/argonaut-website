// ============================================================================
// tests/personalBetriebP187d.test.mjs — Paket 187d Teil 1: Personal-Cockpit,
// Tickets, Reports, Kalkulator-Normen speichern für den Betrieb (SQL p187d)
// + Personal-Dokumente im Ordner des Betriebs. Tabelle „mitarbeiter" NICHT.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SQL = lies('supabase-sql/p187d-personal-betrieb.sql');
const CODE = SQL.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const ERWARTET = {
  bewerber: ['personal', 'ja'], personal_entsendung: ['personal', 'ja'], hr_abwesenheiten: ['personal', 'ja'],
  hr_schulungen: ['personal', 'ja'], hr_checklisten: ['personal', 'ja'], hr_checklisten_abschluss: ['personal', 'nein'],
  hr_checklisten_vorlagen: ['personal', 'ja'], hr_dokumente: ['personal', 'nein'], hr_zeiterfassung: ['personal', 'nein'],
  hr_zeit_korrekturen: ['personal', 'nein'], tickets: ['service', 'nein'], report_gespeichert: ['reports', 'nein'],
  kalkulator_normen: ['kalkulator', 'nein'],
};

test('SQL p187d: genau diese 13 Tabellen mit Modul und Löschrecht', () => {
  const zeilen = [...CODE.matchAll(/array\['([a-z_]+)', '([a-z-]+)', '(ja|nein)'\]/g)].map((m) => [m[1], m[2], m[3]]);
  assert.equal(zeilen.length, 13);
  for (const [t, m, l] of zeilen) assert.deepEqual([m, l], ERWARTET[t], t);
  // Nachweise nie löschbar durch Mitarbeiter
  for (const t of ['hr_zeiterfassung', 'hr_zeit_korrekturen', 'hr_dokumente', 'tickets', 'report_gespeichert', 'kalkulator_normen']) assert.equal(ERWARTET[t][1], 'nein', t);
});

test('SQL p187d: die Tabelle mitarbeiter wird NICHT angefasst (eigener Schritt)', () => {
  assert.doesNotMatch(CODE, /'mitarbeiter'\s*,\s*'/);
  assert.doesNotMatch(CODE, /on public\.mitarbeiter\b/);
});

test('SQL p187d: nur additiv — keine Tabelle/Spalte/Zeile wird gelöscht, nur eigene Regeln ersetzt', () => {
  assert.doesNotMatch(CODE, /\bdrop\s+(table|column|function|schema)\b/i);
  assert.doesNotMatch(CODE, /\bdelete\s+from\b|\btruncate\b|\balter\s+table\b/i);
  for (const m of CODE.matchAll(/drop (policy|trigger) if exists (\w+)/gi)) assert.match(m[2], /^(p187d_|p181_besitzer$)/, m[0]);
  assert.match(CODE, /create trigger p181_besitzer before insert or update on public\.%I/);
  assert.match(CODE, /for insert to authenticated with check \(owner_user_id = public\.mein_chef_id\(\) and public\.darf_ich_modul_aendern\(%L\)\)/);
  assert.match(CODE, /for select to authenticated using \(owner_user_id = public\.mein_chef_id\(\) and \(public\.darf_ich_modul_sehen\(%L\) or public\.darf_ich_modul_aendern\(%L\)\)\)/);
  assert.match(CODE, /if loeschen then\s+execute format\('create policy p187d_ma_delete/);
});

test('SQL p187d: Speicher nur im Ordner des eigenen Betriebs, Schreiben nur mit Personal-Schreibrecht', () => {
  assert.match(CODE, /p187d_hrdok_ma_insert on storage\.objects for insert to authenticated\s+with check \(bucket_id = 'hr-dokumente'\s+and \(storage\.foldername\(name\)\)\[1\] = \(public\.mein_chef_id\(\)\)::text\s+and public\.darf_ich_modul_aendern\('personal'\)\)/);
  assert.match(CODE, /p187d_hrdok_ma_select on storage\.objects for select to authenticated/);
  assert.doesNotMatch(CODE, /p187d_hrdok_ma_(delete|update)/);
});

test('Personal-Seite: Dokumente in den Ordner des Betriebs, Rückfall auf den eigenen Ordner', () => {
  const s = ohneKommentare(lies('app/dashboard/personal/page.tsx'));
  assert.match(s, /const betrieb = betriebsKennung\(chef, ownerId\) \?\? ownerId;/);
  assert.match(s, /let pfad = `\$\{betrieb\}\/\$\{typ\}\/\$\{id\}\/\$\{stempel\}-\$\{sauber\}`;/);
  assert.match(s, /if \(upErr && betrieb !== ownerId\) \{\s+pfad = `\$\{ownerId\}\//);
  assert.doesNotMatch(s, /Nur für Sie sichtbar/);
});
