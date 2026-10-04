// ============================================================================
// tests/rechteP200.test.mjs — Paket 200 (Entscheidungsrunde Block 2, Teil E)
//   E7 Werkstatt-Bühne auch mit Recht „Werkstatt"
//   E8 „Angelegt von" an Kontakt, Angebot, Rechnung, Auftrag
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { erfasserText, erfasserName, tagDe } from '../out/erfasser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('E8: Text „Angelegt von" mit Datum und letzter Änderung', () => {
  assert.equal(erfasserText({ erstellt_von_name: ' Maria  Muster ', erstellt_am: '2026-10-03T22:30:00Z', geaendert_am: '2026-10-05T08:00:00Z' }),
    'Angelegt von Maria Muster am 04.10.2026 · zuletzt geändert am 05.10.2026');
  assert.equal(erfasserText({ erstellt_von_name: 'Geschäftsleitung', created_at: '2026-09-01T10:00:00Z' }), 'Angelegt von Geschäftsleitung am 01.09.2026');
  assert.equal(erfasserText({ erstellt_von_name: 'Franz' }), 'Angelegt von Franz');
  assert.equal(erfasserText({ erstellt_von_name: null, erstellt_am: '2026-09-01' }), null, 'alte Einträge ohne Namen: nichts anzeigen');
  assert.equal(erfasserText(null), null);
  assert.equal(erfasserName({ erstellt_von_name: '' }), null);
  assert.equal(tagDe('kein datum'), '');
});

test('E8: vier Seiten zeigen den Erfasser am einzelnen Datensatz', () => {
  const ang = lies('app/dashboard/angebote/page.tsx');
  assert.ok(ang.includes('erstellt_von_name, erstellt_am, geaendert_am'));
  assert.ok(ang.includes('{erfasserText(a) &&'));
  const crm = lies('app/dashboard/crm/[id]/page.tsx');
  assert.ok(crm.includes('label="Angelegt von"'));
  const auf = lies('app/dashboard/auftraege/[id]/page.tsx');
  assert.ok(auf.includes('{erfasserText(auftrag) &&'));
  const re = lies('app/dashboard/rechnungen/[id]/page.tsx');
  assert.ok(re.includes('const gespeichert = erfasserName(r);'));
});

test('E7: SQL p200 öffnet nur Werkstatt-Buchungen, additiv', () => {
  const s = lies('supabase-sql/p200-werkstatt-buehne.sql');
  const ohne = s.replace(/--.*$/gm, '');
  assert.ok(!/\bdrop\s+(table|column|function)\b|\bdelete\s+from\b|\btruncate\b/i.test(ohne));
  assert.equal((ohne.match(/werkstatt_auftrag_id is not null/g) ?? []).length, 3);
  assert.equal((ohne.match(/darf_ich_modul_aendern\('werkstatt'\)/g) ?? []).length, 4, 'insert, update 2x, select');
  assert.ok(ohne.includes("for select to authenticated"));
  assert.ok(!/on public\.ressourcen for (insert|update|delete|all)/.test(ohne), 'Bühnen anlegen/ändern bleibt bei „Buchungen"');
  assert.ok(s.includes('sperren_davor'));
  const w = lies('app/dashboard/werkstatt/page.tsx');
  assert.ok(w.includes('Paket 200 (E7)'));
  assert.ok(!w.includes('keine Mitarbeiter-Regel. Deshalb bleibt hier bewusst'));
});
