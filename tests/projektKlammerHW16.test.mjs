import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projektZuName, projektFeld, hatProjektSpalte, einsatzAusAuftrag, vorgaengeZaehlen } from '../out/projektKlammer.js';

// ===========================================================================
// HW-16 (16.10.2026) — Projekt als Klammer
// ===========================================================================

const P = [{ id: 'p1', name: 'Bad Huber' }, { id: 'p2', name: 'Dach Meier' }, { id: 'p3', name: 'dach meier' }];
const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Freitext-Projekt: nur bei genau einem Treffer verknuepft', () => {
  assert.equal(projektZuName(' bad huber ', P), 'p1');
  assert.equal(projektZuName('Dach Meier', P), null, 'zwei Treffer → keine Verknuepfung');
  assert.equal(projektZuName('', P), null);
  assert.equal(projektZuName('Unbekannt', P), null);
});

test('projekt_id nur, wenn die Spalte schon da ist (laeuft vor SQL p383)', () => {
  assert.deepEqual(projektFeld('p1', false), {});
  assert.deepEqual(projektFeld('', false), {});
  assert.deepEqual(projektFeld('p1', true), { projekt_id: 'p1' });
  assert.deepEqual(projektFeld('', true), { projekt_id: null });
  assert.equal(hatProjektSpalte([{ id: 'a' }]), false);
  assert.equal(hatProjektSpalte([{ id: 'a', projekt_id: null }]), true);
  assert.equal(hatProjektSpalte([]), false);
});

test('Dispo: Auftrag belegt Titel und Kunde vor, eigene Eingaben bleiben', () => {
  const a = { id: 'a1', titel: 'Badsanierung', projekt_id: 'p1', kunde_name: 'Huber' };
  assert.deepEqual(einsatzAusAuftrag(a, { titel: '', kunde_name: '' }), { auftrag_id: 'a1', projekt_id: 'p1', titel: 'Badsanierung', kunde_name: 'Huber' });
  assert.equal(einsatzAusAuftrag(a, { titel: 'Fliesen Tag 2', kunde_name: '' }).titel, 'Fliesen Tag 2');
  assert.equal(einsatzAusAuftrag(null, { titel: 'X', kunde_name: 'Y' }).auftrag_id, '');
});

test('Vorgaenge zaehlen: fehlende Listen = 0, behobene/abgenommene Maengel zaehlen nicht', () => {
  const v = vorgaengeZaehlen({ auftraege: [1, 2], einsaetze: null, maengel: [{ status: 'offen' }, { status: 'behoben' }, { status: 'abgenommen' }, { status: 'in_arbeit' }] });
  assert.equal(v.auftraege, 2); assert.equal(v.einsaetze, 0); assert.equal(v.maengelOffen, 2);
});

test('Waechter: Seiten nutzen die Klammer; SQL p383 additiv', () => {
  assert.match(lies('app/dashboard/auftraege/[id]/page.tsx'), /projektFeld\(projektId, projektSpalte\)/);
  assert.match(lies('app/dashboard/aufmass/page.tsx'), /projektFeld\(projektZuName\(form\.projekt, projekte\), hatProjektSpalte\(aufmasse\)\)/);
  assert.match(lies('app/dashboard/dispo/page.tsx'), /auftrag_id: form\.auftragId \|\| null/);
  assert.match(lies('app/dashboard/bau-lv/page.tsx'), /projekt_id: neuLv\.projekt \|\| null/);
  assert.match(lies('app/dashboard/projekte/[id]/page.tsx'), /vorgaengeZaehlen\(/);
  const sql = lies('supabase-sql/p383-projekt-klammer.sql').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b|\bdelete\s+from\b|\btruncate\b/i);
  assert.equal((sql.match(/add column if not exists projekt_id/g) || []).length, 3);
});
