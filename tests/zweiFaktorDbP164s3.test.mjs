// ============================================================================
// tests/zweiFaktorDbP164s3.test.mjs — Paket 164·3: Zwei-Faktor auch in der Datenbank.
//   Die SQL-Regel darf nur EINSCHRÄNKEN (restrictive), nur angemeldete Zugänge
//   betreffen, alle RLS-Tabellen + Dateispeicher abdecken und einen Rückweg
//   haben. Alles, was VOR der Code-Eingabe läuft (Code prüfen, Notfall-Codes,
//   Hilfe, Ereignisse, Stand), darf nicht mit der Sitzung an Tabellen gehen —
//   sonst sperrt sich ein Zugang mit Faktor selbst aus.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sqlOhneKommentare = (s) => s.replace(/--.*$/gm, '');

const SQL = lies('supabase-sql/p164s3-zwei-faktor-datenbank.sql');
const CODE = sqlOhneKommentare(SQL);

test('SQL: nur einschränkend, nur Rolle authenticated, lesen UND schreiben', () => {
  const regeln = CODE.match(/create policy p164s3_aal[^;]+;/g) || [];
  assert.ok(regeln.length >= 2, 'Tabellen + Speicher');
  for (const r of regeln) {
    assert.match(r, /as restrictive/);
    assert.match(r, /for all to authenticated/);
    assert.match(r, /using \(\(select public\.p164s3_aal_ok\(\)\)\)/);
    assert.match(r, /with check \(\(select public\.p164s3_aal_ok\(\)\)\)/);
    assert.doesNotMatch(r, /\banon\b|\bpublic\b(?!\.)/);
  }
  assert.doesNotMatch(CODE, /as permissive/);
});

test('SQL: Prüffunktion — aal2 ODER kein bestätigter Faktor', () => {
  const f = CODE.slice(CODE.indexOf('create or replace function public.p164s3_aal_ok'), CODE.indexOf('$$;', CODE.indexOf('p164s3_aal_ok')));
  assert.match(f, /security definer/);
  assert.match(f, /set search_path to 'public'/);
  assert.match(f, /auth\.jwt\(\) ->> 'aal', 'aal1'\) = 'aal2'/);
  assert.match(f, /or not exists/);
  assert.match(f, /f\.status = 'verified'/);
  assert.match(f, /f\.user_id = auth\.uid\(\)/);
  assert.match(CODE, /revoke all on function public\.p164s3_aal_ok\(\) from public/);
});

test('SQL: alle RLS-Tabellen in public + Dateispeicher, mehrfach ausführbar, Kontrolle, Rückweg', () => {
  assert.match(CODE, /from pg_tables\s+where schemaname = 'public' and rowsecurity/);
  assert.match(CODE, /drop policy if exists p164s3_aal on %I\.%I/);
  assert.match(CODE, /on storage\.objects as restrictive/);
  assert.match(SQL, /RÜCKWEG/);
  assert.match(SQL, /drop policy if exists p164s3_aal on %I\.%I', r\.schemaname, r\.tablename/);
  assert.match(SQL, /Erwartung: tabellen_mit_regel 448 · fehlend 0 · speicher 1 · funktion 1/);
  assert.doesNotMatch(CODE, /\bdrop table\b|\btruncate\b|delete from|alter table .* disable row level security/i);
});

test('Vor der Code-Eingabe: Zwei-Faktor-Routen gehen nie mit der Sitzung an Tabellen', () => {
  const ordner = path.join(WURZEL, 'app/api/zwei-faktor');
  const routen = fs.readdirSync(ordner).map((d) => `app/api/zwei-faktor/${d}/route.ts`).filter((p) => fs.existsSync(path.join(WURZEL, p)));
  assert.ok(routen.length >= 5, 'Routen gefunden');
  for (const r of routen) {
    const s = ohneKommentare(lies(r));
    // Tabellen nur über den Server-Schlüssel: „createAdminClient().from" oder eine Variable,
    // die direkt aus createAdminClient() kommt — nie über die Sitzung.
    const aufrufer = [...s.matchAll(/([A-Za-z_][\w]*(?:\(\))?)\s*\.from\(/g)].map((m) => m[1]);
    for (const a of aufrufer) {
      if (a === 'createAdminClient()') continue;
      assert.match(s, new RegExp(`(const|let)\\s+${a}\\s*=\\s*createAdminClient\\(\\)`), `${r}: ${a}.from ohne Server-Schlüssel`);
    }
  }
  for (const p of ['app/auth/zwei-faktor/page.tsx', 'app/auth/zwei-faktor/einrichten/page.tsx', 'app/auth/login/page.tsx', 'app/auth/passwort-neu/page.tsx']) {
    assert.doesNotMatch(ohneKommentare(lies(p)), /\.from\(['"]/, p);
  }
});

test('Pförtner: Zwei-Faktor-Weiche VOR der ersten Tabellen-Abfrage', () => {
  const s = ohneKommentare(lies('proxy.ts'));
  const weiche = s.indexOf('zweiFaktorStand(supabase, user, pflicht)');
  const ersteTabelle = s.indexOf(".from('");
  assert.ok(weiche > 0 && ersteTabelle > weiche, 'erst Code-Pruefung, dann Daten');
});
