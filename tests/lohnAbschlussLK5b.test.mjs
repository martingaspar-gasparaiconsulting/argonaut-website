import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aktiverAbschluss, stornos, freigabePruefen, pruefeStornoGrund, werteStand } from '../out/lohnAbschluss.js';
import { monatsZeile } from '../out/lohnvorbereitung.js';

// LK5 Teil 2 (16.10.2026) — Freigabe + Sperre

const rows = [
  { id: '1', mitarbeiter_id: 'm1', monat: '2026-09', freigegeben_am: '2026-10-02T08:00:00Z', freigegeben_name: 'Chef', storniert_am: '2026-10-03T08:00:00Z', storno_grund: 'Pause falsch erfasst' },
  { id: '2', mitarbeiter_id: 'm1', monat: '2026-09', freigegeben_am: '2026-10-04T08:00:00Z', freigegeben_name: 'Chef', storniert_am: null, storno_grund: null },
];

test('Aktiver Abschluss ist der nicht aufgehobene, Stornos bleiben sichtbar', () => {
  assert.equal(aktiverAbschluss(rows, 'm1', '2026-09').id, '2');
  assert.equal(aktiverAbschluss(rows, 'm1', '2026-10'), null);
  assert.equal(stornos(rows, 'm1', '2026-09').length, 1);
});

test('Freigabe: nicht in der Zukunft, Warnung bei offenen Schichten', () => {
  const z = monatsZeile({ id: 'm1', vorname: 'Eva', wochenstunden: 40 }, [{ mitarbeiter_id: 'm1', datum: '2026-09-10', kommen_um: '2026-09-10T06:00:00Z', gehen_um: null }], [], [], '2026-09', new Set());
  assert.match(freigabePruefen(z, '2026-11', '2026-10-16').fehler, /Zukunft/);
  const f = freigabePruefen(z, '2026-09', '2026-10-16');
  assert.equal(f.erlaubt, true);
  assert.match(f.warnung, /ohne „Gehen"/);
  const sauber = monatsZeile({ id: 'm1', vorname: 'Eva', wochenstunden: 40 }, [], [], [], '2026-09', new Set());
  assert.equal(freigabePruefen(sauber, '2026-09', '2026-10-16').warnung, null);
  assert.equal(werteStand(sauber).soll_min, sauber.sollMin);
});

test('Aufheben nur mit Grund ab 10 Zeichen', () => {
  assert.ok(pruefeStornoGrund('kurz'));
  assert.equal(pruefeStornoGrund('Pause falsch erfasst'), null);
});

test('Waechter: Seite gibt frei und SQL sperrt Zeiten', () => {
  const seite = fs.readFileSync(new URL('../app/dashboard/personal/lohnvorbereitung/page.tsx', import.meta.url), 'utf8');
  assert.match(seite, /lohn_monatsabschluss/);
  const sql = fs.readFileSync(new URL('../supabase-sql/p395-lohn-monatsabschluss.sql', import.meta.url), 'utf8');
  // seit Nachtrag 16.10.: Trigger per Schleife ueber beide Tabellen, nur wenn die Spalten da sind (Aussperr-Schutz)
  assert.match(sql, /array\['hr_zeiterfassung', 'hr_ausfall'\]/);
  assert.match(sql, /before insert or update or delete on public\.%I/);
  assert.match(sql, /column_name in \('owner_user_id', 'mitarbeiter_id', 'datum'\)\) = 3/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b/i);
});
