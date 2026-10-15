import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// ===========================================================================
// HW-13 (15.10.2026) — eine Pipeline: Deal-Pipeline (crm_deal) ist fuehrend
// ===========================================================================

test('Dashboard zaehlt Deals der Deal-Pipeline und verlinkt dorthin', () => {
  const s = fs.readFileSync('app/dashboard/page.tsx', 'utf8');
  assert.match(s, /from\('crm_deal'\)\.select\('id, phase:stufe, wert:wert_netto, titel, created_at:erstellt_am'\)/);
  assert.doesNotMatch(s, /from\('verkaufschancen'\)/);
  assert.doesNotMatch(s, /href[=:] ?["']\/dashboard\/crm\/pipeline/);
});

test('CRM-Knopf fuehrt zur Deal-Pipeline, alte Seite zeigt den Hinweis', () => {
  assert.doesNotMatch(fs.readFileSync('app/dashboard/crm/page.tsx', 'utf8'), /router\.push\("\/dashboard\/crm\/pipeline"\)/);
  assert.match(fs.readFileSync('app/dashboard/crm/pipeline/page.tsx', 'utf8'), /Diese Liste ist abgelöst/);
});

test('Auftrag aus Deal: Steuersatz gewaehlt, nicht fest 19 %', () => {
  const s = fs.readFileSync('app/dashboard/auftraege/page.tsx', 'utf8');
  assert.doesNotMatch(s, /const mwstSatz = 19;/);
  assert.match(s, /const mwstSatz = mwstSatzDeal;/);
  assert.match(s, /\[0, 7, 19\]\.includes\(mwstSatzDeal\)/);
});
