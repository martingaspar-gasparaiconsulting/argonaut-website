// Paket 162 (S2, 28.09.2026) — Nachweisbarkeit: wer hat es gemacht.
// Punkt 73 / Anwalt-Block AD. Harte Regel (Martin 22.09.): Die Erfasser-Angabe
// gehoert zum einzelnen Datensatz — nie in eine Auswertung, Rangliste, Kennzahl.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEM_SPALTEN } from '../out/importMotor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p162-nachweis-s2.sql');

function dateien(dir) {
  const aus = [];
  for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && !e.name.startsWith('.')) aus.push(...dateien(p)); }
    else if (/\.(ts|tsx)$/.test(e.name)) aus.push(p.split(path.sep).join('/'));
  }
  return aus;
}
const CODE = [...dateien('app'), ...dateien('lib')];

test('SQL: die acht Kern-Tabellen + ablaeufe bekommen den Nachweis', () => {
  for (const t of ['kontakte', 'leads', 'angebote', 'rechnungen', 'termine', 'projekte', 'auftraege', 'verkaufschancen', 'ablaeufe']) {
    assert.ok(SQL.includes(`'${t}'`), t + ' fehlt');
  }
  for (const s of ['erstellt_von uuid default auth.uid()', 'erstellt_von_name text', 'geaendert_von uuid', 'geaendert_am timestamptz']) {
    assert.ok(SQL.includes(s), s + ' fehlt');
  }
});

test('SQL: additiv, idempotent, ohne Fremdschluessel auf auth.users, nie destruktiv', () => {
  const ohneKommentar = SQL.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');
  assert.ok(!/references\s+auth\.users/i.test(ohneKommentar));
  assert.ok(!/\bdrop\s+(table|column|function)\b/i.test(ohneKommentar));
  assert.ok(!/\bdelete\s+from\b|\btruncate\b|\bupdate\s+public\.\w+\s+set\b/i.test(ohneKommentar), 'nicht rueckwirkend, nichts wird umgeschrieben');
  assert.ok(!/add column (?!if not exists)/i.test(ohneKommentar));
  assert.ok(!/create trigger (?!trg_)/i.test(ohneKommentar));
  const drops = ohneKommentar.match(/drop trigger if exists (\S+)/g) || [];
  assert.ok(drops.every((d) => /trg_nachweis_|trg_ablauf_entscheidung/.test(d)), 'nur eigene Trigger werden neu gesetzt');
});

test('SQL: Trigger sind exception-sicher (ein fehlender Nachweis verhindert nie das Speichern)', () => {
  for (const fn of ['setze_erfasser', 'ablauf_entscheidung_merken']) {
    const i = SQL.indexOf(`function public.${fn}()`);
    const ende = SQL.indexOf('$$;', i);
    const koerper = SQL.slice(i, ende);
    assert.ok(/exception when others then/.test(koerper), fn + ' ohne exception-Zweig');
  }
});

test('SQL: Erfasser kommt aus der Anmeldung, nicht vom Browser, und bleibt beim Aendern', () => {
  assert.match(SQL, /jsonb_build_object\('erstellt_von', v_uid, 'erstellt_von_name', public\.nachweis_name\(v_uid\)\)/);
  assert.match(SQL, /'erstellt_von', v_alt -> 'erstellt_von'/);
  assert.match(SQL, /'erstellt_von_name', v_alt -> 'erstellt_von_name'/);
  // nur echte Aenderungen zaehlen (Zeitstempel allein nicht)
  assert.match(SQL, /\(v_neu - v_ohne\) is distinct from \(v_alt - v_ohne\)/);
});

test('SQL: Ablauf-Entscheidung nur fuer Menschen, nie fuer den Motor', () => {
  assert.match(SQL, /if auth\.uid\(\) is not null\s+and new\.status is distinct from old\.status/);
  assert.match(SQL, /new\.entschieden_von := old\.entschieden_von;/, 'danach bleibt die Entscheidung stehen');
});

test('Import: Nachweis-Spalten kommen nie aus einer Datei', () => {
  for (const s of ['erstellt_von', 'erstellt_von_name', 'geaendert_von', 'geaendert_am', 'entschieden_von', 'entschieden_von_name', 'entschieden_am']) {
    assert.ok(SYSTEM_SPALTEN.has(s), s);
  }
});

test('Ablaeufe-Seite zeigt, wer entschieden hat (am einzelnen Lauf)', () => {
  const src = lies('app/dashboard/ablaeufe/page.tsx');
  assert.ok(src.includes('entschieden_von_name,entschieden_am'));
  assert.ok(src.includes('{entschiedenText(l)}'));
  assert.ok(src.includes("erstellt_von_name')"));
});

// ---------- HARTE REGEL: nie in Auswertung, Rangliste, Kennzahl ----------

const AUSWERTUNG = /(auswertung|kennzahl|statistik|analytics|ranking|rangliste|cockpit|chef-?blick|lagebericht|auge|report|controlling|zahlen\.ts|dashboard\/page\.tsx$)/i;
// Bestehende, gepruefte Ausnahmen mit Grund — neue kommen nur mit Begruendung hierher.
const AUSNAHMEN = new Map([
  ['app/api/cockpit-action/route.ts', 'sucht den Team-Kanal, den der Chef selbst angelegt hat (chat_kanaele.erstellt_von) — keine Auswertung'],
]);

test('WAECHTER: keine Auswertung/Kennzahl/Rangliste liest Erfasser-Spalten', () => {
  const treffer = CODE.filter((f) => AUSWERTUNG.test(f) && !AUSNAHMEN.has(f))
    .filter((f) => /\b(erstellt_von|geaendert_von|entschieden_von)\w*/.test(lies(f)));
  assert.deepEqual(treffer, [], 'Erfasser-Angaben gehoeren nie in eine Auswertung: ' + treffer.join(', '));
});

test('WAECHTER: niemand zaehlt oder gruppiert nach Erfasser', () => {
  const muster = /(group\s*by|groupBy|count|zaehle|rang|sort)[^\n]{0,60}\b(erstellt_von|geaendert_von|entschieden_von)|\b(erstellt_von|geaendert_von|entschieden_von)\w*[^\n]{0,40}(\.length|count\(|reduce\()/i;
  const treffer = CODE.filter((f) => !AUSNAHMEN.has(f) && muster.test(lies(f)));
  assert.deepEqual(treffer, [], treffer.join(', '));
});

test('Ablaeufe-Seite laedt auch VOR SQL p162 (Rueckfall ohne Nachweis-Spalten)', () => {
  const src = lies('app/dashboard/ablaeufe/page.tsx');
  assert.match(src, /const l = lMit\.error\s*\?/);
  assert.match(src, /const \{ data, error \} = mit\.error\s*\?/);
});
