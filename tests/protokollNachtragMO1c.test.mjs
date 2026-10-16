import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pruefeNachtrag, nachtraegeFuer, darfLoeschen } from '../out/protokollNachtrag.js';

// MO1 Teil 3 (16.10.2026) — nach Abschluss nur noch anhaengen

test('Nachtrag nur zu Abgeschlossenem, mit Text', () => {
  assert.match(pruefeNachtrag('Korrektur', 'entwurf'), /nur zu abgeschlossenen/);
  assert.match(pruefeNachtrag('  x ', 'abgeschlossen'), /mindestens 3/);
  assert.match(pruefeNachtrag('a'.repeat(4001), 'abgeschlossen'), /zu lang/);
  assert.equal(pruefeNachtrag('Messwert war 0,5 statt 5', 'abgeschlossen'), null);
});

test('Reihenfolge: aelteste zuerst, nur zum Eintrag', () => {
  const l = nachtraegeFuer([
    { id: '2', eintrag_id: 'e', text: 'b', erstellt_von_name: null, erstellt_am: '2026-10-16T10:00:00Z' },
    { id: '1', eintrag_id: 'e', text: 'a', erstellt_von_name: null, erstellt_am: '2026-10-15T10:00:00Z' },
    { id: '3', eintrag_id: 'x', text: 'c', erstellt_von_name: null, erstellt_am: '2026-10-14T10:00:00Z' },
  ], 'e');
  assert.deepEqual(l.map((n) => n.id), ['1', '2']);
});

test('Loeschen: nach der Sperre nie fuer Abgeschlossenes, Mitarbeiter nie', () => {
  assert.equal(darfLoeschen('abgeschlossen', true, true), false);
  assert.equal(darfLoeschen('abgeschlossen', false, true), true);
  assert.equal(darfLoeschen('entwurf', true, true), true);
  assert.equal(darfLoeschen('entwurf', true, false), false);
});

test('Waechter: Seite nutzt Nachtrag, SQL sperrt auch den Chef', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/formulare/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /formular_nachtrag/);
  assert.match(seite, /darfLoeschen\(/);
  const sql = fs.readFileSync(new URL('../supabase-sql/p390-protokoll-sperre-nachtrag.sql', import.meta.url), 'utf8');
  assert.match(sql, /before update or delete on public\.formular_eintrag/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b/i);
});
