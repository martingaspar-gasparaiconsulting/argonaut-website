// Paket 185a (30.09.2026) — Buchungen loeschen nur Chef, Abo-Rechnungen nur mit „Darf abrechnen".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p185a-buchungen-abo-recht.sql');
const ohneKommentar = SQL.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');

test('SQL: Loeschen der Buchungs-Tabellen nur Geschaeftsleitung (restriktiv)', () => {
  for (const t of ['lager_bewegung', 'lager_umlagerung', 'lagerbewegungen', 'bde_buchung', 'markt_verkauf', 'charge_verwendung', 'inventur_zaehlung']) {
    assert.ok(ohneKommentar.includes(`'${t}'`), t);
  }
  assert.match(ohneKommentar, /as restrictive for delete to authenticated using \(public\.mein_chef_id\(\) is null\)/);
});

test('SQL: Abo-Rechnungen anlegen/aendern/loeschen nur Chef oder „Darf abrechnen"', () => {
  for (const art of ['insert', 'update', 'delete']) {
    assert.match(ohneKommentar, new RegExp(`p185a_abo_${art} on public\\.abo_rechnungen as restrictive for ${art}`), art);
  }
  assert.equal((ohneKommentar.match(/public\.mein_chef_id\(\) is null or public\.darf_ich_abrechnen\(\)/g) || []).length, 4);
});

test('SQL: nur zusaetzliche Schranken — nichts geloescht, nur eigene Regeln neu gesetzt, keine permissive Regel', () => {
  assert.ok(!/drop table|drop column|delete from|truncate|disable row level security/i.test(ohneKommentar));
  const drops = ohneKommentar.match(/drop (policy|trigger) if exists (\S+)/g) || [];
  assert.ok(drops.length > 0 && drops.every((d) => /p185a_/.test(d)));
  const creates = ohneKommentar.match(/create policy [^\n]+/g) || [];
  assert.ok(creates.length === 4 && creates.every((c) => /as restrictive/.test(c)), 'jede neue Regel ist restriktiv');
});

test('Abo-Seite: verstaendliche Meldung ohne „Darf abrechnen"', () => {
  const s = lies('app/dashboard/abo-rechnungen/page.tsx');
  assert.match(s, /if \(istZugriffsFehler\(e as \{ message\?: string; code\?: string \}\)\) \{ setFehler\(OHNE_ABRECHNEN\); return; \}/);
  assert.match(s, /const OHNE_ABRECHNEN = '[^']*Darf abrechnen[^']*'/);
});
