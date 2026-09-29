// Paket 174 (29.09.2026) — Mandanten-Luecken in der Datenbank: H1 Team-Chat-Beitritt,
// H2 Module nur ueber den Server, M1 HR-Eintraege nur im eigenen Betrieb, M2 Chat-Absender.
// Das Verhalten ist in PGlite geprueft (siehe Baulog); hier wacht der Test ueber die
// SQL-Datei und darueber, dass die Oberflaeche zu den neuen Regeln passt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p174-mandanten-luecken.sql');
const ohneKommentare = (t) => t.replace(/--.*$/gm, '');

test('Nur zusaetzliche Sperr-Regeln: alles restrictive, nichts geloescht, in einer Transaktion', () => {
  const s = ohneKommentare(SQL);
  const regeln = [...s.matchAll(/create policy (\S+) on public\.(\S+)\s+as (\w+)/g)];
  assert.ok(regeln.length >= 7);
  for (const [, name, , art] of regeln) {
    assert.equal(art, 'restrictive', name);
    assert.match(name, /^(p174_|%I)/, name);
  }
  assert.match(s, /format\(\s*'create policy %I on public\.%I as restrictive for insert/);
  assert.match(s, /format\(\s*'create policy %I on public\.%I as restrictive for update/);
  assert.doesNotMatch(s, /\bdrop table\b|\bdelete from\b|\btruncate\b|\balter table\b/i);
  // Jede drop policy betrifft nur eigene p174-Regeln (Rueckweg), nie bestehende.
  for (const [, name] of s.matchAll(/drop policy if exists (\S+) on/g)) assert.match(name, /^(p174_|%I)/, name);
  assert.match(s, /^\s*begin;/m);
  assert.match(s, /^\s*commit;/m);
});

test('H1 Team-Chat: Beitritt nur durch den Ersteller und nur im selben Betrieb', () => {
  assert.match(SQL, /p174_mitglieder_nur_eingeladen on public\.chat_mitglieder\s+as restrictive for insert/);
  assert.match(SQL, /k\.erstellt_von = auth\.uid\(\)\)\s+and public\.chat_betrieb_von\(chat_mitglieder\.user_id\) = public\.chat_betrieb_von\(auth\.uid\(\)\)/);
});

test('Ausgetretene lesen und schreiben im Team-Chat nicht mehr mit', () => {
  assert.match(SQL, /p174_nachrichten_lesen_aktiv on public\.chat_nachrichten\s+as restrictive for select/);
  assert.match(SQL, /m\.austrittsdatum is null or m\.austrittsdatum >= current_date/);
  assert.match(SQL, /revoke all on function public\.chat_nutzer_aktiv\(uuid\) from public, anon;/);
});

test('M2 Absender nicht faelschbar — und die Oberflaeche schreibt die KI-Antwort genau so', () => {
  assert.match(SQL, /coalesce\(ist_ki, false\) = false and absender_id = auth\.uid\(\)/);
  assert.match(SQL, /ist_ki = true and absender_id is null and absender_name = 'ARGONAUT'/);
  const seite = lies('app/dashboard/team-chat/page.tsx');
  assert.match(seite, /absender_id: null, absender_name: 'ARGONAUT', ist_ki: true/);
  assert.equal((seite.match(/ist_ki: true/g) || []).length, 1, 'nur die eine KI-Antwort darf ist_ki setzen');
});

test('H2 Module: Einfuegen, Aendern und Loeschen nur noch ueber den Server', () => {
  for (const art of ['insert', 'update', 'delete']) {
    assert.match(SQL, new RegExp(`p174_module_nur_server_${art} on public\\.tenant_module\\s+as restrictive for ${art}`));
  }
  // Kein Browser-Code schreibt tenant_module (nur lesen) — sonst bricht die Regel eine Seite.
  const dateien = [];
  const lauf = (d) => { for (const e of fs.readdirSync(path.join(WURZEL, d), { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) lauf(p); } else if (/\.tsx?$/.test(e.name)) dateien.push(p);
  } };
  lauf('app'); lauf('components');
  for (const p of dateien) {
    if (p.split(path.sep).join('/').startsWith('app/api/admin/')) continue; // Betreiber-Routen mit Service-Schluessel
    const t = lies(p);
    assert.doesNotMatch(t, /from\(['"]tenant_module['"]\)\s*\.(insert|upsert|update|delete)/, p);
  }
});

test('M1 HR: alle sechs Tabellen, Besitzer = man selbst oder der eigene Betrieb', () => {
  for (const t of ['hr_abwesenheiten', 'hr_checklisten_abschluss', 'hr_dokumente', 'hr_schicht_bestaetigung', 'hr_schicht_tausch', 'hr_zeiterfassung']) {
    assert.ok(SQL.includes(`'${t}'`), t);
  }
  assert.match(SQL, /with check \(owner_user_id = auth\.uid\(\) or owner_user_id = public\.mein_chef_id\(\)\)/);
  // „Mein Bereich" schreibt mit dem Betrieb der eigenen Mitarbeiter-Zeile — passt zur Regel.
  const mb = lies('app/dashboard/mein-bereich/page.tsx');
  assert.ok((mb.match(/owner_user_id: ma\.owner_user_id/g) || []).length >= 5);
});
