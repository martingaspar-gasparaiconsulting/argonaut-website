import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { istSchlechtwetterzeit, pruefeAusfall, ausfallImMonat } from '../out/ausfallstunden.js';
import { monatsZeile, csvExport } from '../out/lohnvorbereitung.js';

// HW-4 (16.10.2026) — Ausfallstunden Schlechtwetter/Arbeitsmangel als Anbau an LK5

test('Schlechtwetterzeit 01.12. bis 31.03.', () => {
  assert.ok(istSchlechtwetterzeit('2026-12-01'));
  assert.ok(istSchlechtwetterzeit('2027-03-31'));
  assert.ok(!istSchlechtwetterzeit('2027-04-01'));
  assert.ok(!istSchlechtwetterzeit('2026-11-30'));
});

test('Eingabe pruefen: Stunden 0–12, Datum nicht Zukunft, Hinweis ausserhalb der Saison', () => {
  const h = '2026-10-16';
  const ok = pruefeAusfall({ mitarbeiter_id: 'm', datum: '2026-10-15', stunden: '7,5', grund: 'arbeitsmangel' }, h);
  assert.equal(ok.stunden, 7.5); assert.equal(ok.fehler, null); assert.equal(ok.hinweis, null);
  assert.match(pruefeAusfall({ mitarbeiter_id: 'm', datum: '2026-10-15', stunden: '13', grund: 'arbeitsmangel' }, h).fehler, /12/);
  assert.match(pruefeAusfall({ mitarbeiter_id: 'm', datum: '2026-10-17', stunden: '2', grund: 'arbeitsmangel' }, h).fehler, /nach dem Tag/);
  assert.match(pruefeAusfall({ mitarbeiter_id: 'm', datum: '2026-10-15', stunden: '2', grund: 'sonst' }, h).fehler, /Grund/);
  assert.match(pruefeAusfall({ mitarbeiter_id: 'm', datum: '2026-10-15', stunden: '2', grund: 'schlechtwetter' }, h).hinweis, /Schlechtwetterzeit/);
  assert.equal(pruefeAusfall({ mitarbeiter_id: 'm', datum: '2026-01-15', stunden: '2', grund: 'schlechtwetter' }, h).hinweis, null);
});

test('Summe je Mitarbeiter im Monat, landet in Zeile und CSV', () => {
  const rows = [
    { mitarbeiter_id: 'm1', datum: '2026-12-02', stunden: '8', grund: 'schlechtwetter' },
    { mitarbeiter_id: 'm1', datum: '2026-12-03', stunden: 4.5, grund: 'schlechtwetter' },
    { mitarbeiter_id: 'm1', datum: '2026-11-30', stunden: '8', grund: 'schlechtwetter' },
    { mitarbeiter_id: 'm2', datum: '2026-12-02', stunden: '8', grund: 'schlechtwetter' },
    { mitarbeiter_id: 'm1', datum: '2026-12-04', stunden: '2', grund: 'arbeitsmangel' },
  ];
  assert.deepEqual(ausfallImMonat(rows, 'm1', '2026-12-01', '2026-12-31'), { schlechtwetter: 750, arbeitsmangel: 120 });
  const z = monatsZeile({ id: 'm1', vorname: 'Eva', wochenstunden: 40 }, [], [], [], '2026-12', new Set(), rows);
  assert.equal(z.ausfall.schlechtwetter, 750);
  const csv = csvExport([z], '2026-12');
  assert.match(csv, /Ausfall Schlechtwetter Std;Ausfall Arbeitsmangel Std;Hinweise/);
  assert.match(csv.split('\r\n')[1], /;12,50;2,00;/);
});

test('Waechter: Seite zeigt Ausfallstunden nur mit Tabelle, SQL additiv', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/personal/lohnvorbereitung/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /from\('hr_ausfall'\)/);
  assert.match(seite, /ausfall !== null/);
  const sql = fs.readFileSync(new URL('../supabase-sql/p394-ausfallstunden.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.hr_ausfall/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdelete\s+from\b/i);
});
