// ============================================================================
// tests/socialPruefungP208.test.mjs — Paket 208 (Stufe 3 · B1 Social-Baustein)
//   KI-Entwürfe nur geprüft hinaus, Modulrecht an der Beitrags-Schnittstelle
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { darfVeroeffentlichen, pruefStandNachSpeichern, pruefAnzeige, PRUEF_FEHLER } from '../out/socialPruefung.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = '2026-10-05T10:00:00.000Z';

test('Ungeprüfter KI-Entwurf darf nicht hinaus, eigene Texte schon', () => {
  assert.deepEqual(darfVeroeffentlichen({ ki_entwurf: true, geprueft_am: null }), { ok: false, fehler: PRUEF_FEHLER });
  assert.deepEqual(darfVeroeffentlichen({ ki_entwurf: true, geprueft_am: '' }), { ok: false, fehler: PRUEF_FEHLER });
  assert.deepEqual(darfVeroeffentlichen({ ki_entwurf: true, geprueft_am: JETZT }), { ok: true });
  assert.deepEqual(darfVeroeffentlichen({ ki_entwurf: false }), { ok: true });
  assert.deepEqual(darfVeroeffentlichen(null), { ok: true }, 'ohne SQL p208 wie bisher');
});

test('Prüf-Stand: Haken setzt, Textänderung hebt auf, gleicher Text behält', () => {
  assert.deepEqual(pruefStandNachSpeichern(null, 'Neu', true, JETZT, 'u1'), { geprueft_am: JETZT, geprueft_von: 'u1' });
  assert.deepEqual(pruefStandNachSpeichern(null, 'Neu', false, JETZT, 'u1'), { geprueft_am: null, geprueft_von: null });
  const alt = { text: 'Hallo Welt', geprueft_am: '2026-10-01T08:00:00Z', geprueft_von: 'u0' };
  assert.deepEqual(pruefStandNachSpeichern(alt, 'Hallo Welt\r\n', false, JETZT, 'u1'), { geprueft_am: '2026-10-01T08:00:00Z', geprueft_von: 'u0' });
  assert.deepEqual(pruefStandNachSpeichern(alt, 'Hallo Welt!', false, JETZT, 'u1'), { geprueft_am: null, geprueft_von: null });
  assert.deepEqual(pruefStandNachSpeichern(alt, 'Hallo Welt!', true, JETZT, 'u1'), { geprueft_am: JETZT, geprueft_von: 'u1' });
  assert.equal(pruefStandNachSpeichern(alt, 'x', 'true', JETZT, 'u1').geprueft_am, null, 'nur echtes true zählt');
});

test('Anzeige', () => {
  assert.equal(pruefAnzeige({ ki_entwurf: true }), 'ki_offen');
  assert.equal(pruefAnzeige({ ki_entwurf: true, geprueft_am: JETZT }), 'ki_geprueft');
  assert.equal(pruefAnzeige({ ki_entwurf: false }), 'eigen');
});

test('Alle Veröffentlichungs-Wege prüfen', () => {
  for (const d of ['app/api/marketing/social-senden/route.ts', 'app/api/marketing/social-plan/route.ts', 'app/api/marketing/social-protokoll/route.ts']) {
    assert.match(lies(d), /const darf = darfVeroeffentlichen\(await ladePruefStand\(admin, beitragId, uid\)\);\n  if \(!darf\.ok\) return NextResponse\.json/, d);
  }
  const cron = lies('app/api/cron/social-posten/route.ts');
  assert.match(cron, /if \(!darfVeroeffentlichen\(b\)\.ok\)/);
  assert.match(cron, /update\(\{ status: 'entwurf', geplant_am: null \}\)/, 'ungeprüft fällt in den Entwurf zurück statt endlos');
  assert.match(lies('app/api/cron/ki-batch-abholen/route.ts'), /ki_entwurf: true/);
  assert.match(lies('app/dashboard/marketing/content-fliessband/page.tsx'), /ki: true/);
});

test('Beitrags-Schnittstelle: Modulrecht + Prüfpflicht beim Einplanen', () => {
  const r = lies('app/api/marketing/social-beitraege/route.ts');
  assert.match(r, /modulRechtPruefen\(supabase, user\?\.id \?\? null, 'marketing', art\)/);
  assert.match(r, /export async function GET\(\) \{\n  const z = await zugang\('sehen'\)/);
  assert.match(r, /export async function POST\(req: Request\) \{\n  const z = await zugang\('aendern'\)/);
  assert.match(r, /export async function DELETE\(req: Request\) \{\n  const z = await zugang\('aendern'\)/);
  assert.doesNotMatch(r, /mein_chef_id/, 'Betrieb kommt aus dem Modulrecht');
  assert.match(r, /if \(pruefSpalten && status === 'geplant'\)/);
  const seite = lies('app/dashboard/marketing/social/page.tsx');
  assert.match(seite, /geprueft: eKi && eGeprueft/);
  const sql = lies('supabase-sql/p208-social-pruefung.sql');
  assert.match(sql, /add column if not exists ki_entwurf boolean not null default false/);
  assert.match(sql, /and status = 'entwurf'/, 'Nachtrag nur für Entwürfe');
  assert.doesNotMatch(sql, /^\s*(drop|delete|truncate)\b/im);
});
