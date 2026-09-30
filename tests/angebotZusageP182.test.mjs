// ============================================================================
// tests/angebotZusageP182.test.mjs — Paket 182: Angebot-Link erst ab „gesendet"
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { perLinkSichtbar, entscheidbar, zusageName, abgelaufen, ZUSAGE_ERKLAERUNG } from '../out/angebotZusage.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-09-30T12:00:00');

test('BEFUND: Entwurf und Archiv sind per Link unsichtbar, gesendet/entschieden sichtbar', () => {
  for (const s of ['entwurf', 'archiv', '', null, undefined, 'irgendwas']) assert.equal(perLinkSichtbar(s), false, String(s));
  for (const s of ['gesendet', 'angenommen', 'abgelehnt']) assert.equal(perLinkSichtbar(s), true, s);
});

test('Entscheiden nur aus „gesendet"; entschieden = 409; Entwurf = 404', () => {
  assert.deepEqual(entscheidbar({ status: 'gesendet' }, 'annehmen', JETZT), { ja: true });
  assert.deepEqual(entscheidbar({ status: 'gesendet' }, 'ablehnen', JETZT), { ja: true });
  const e = entscheidbar({ status: 'entwurf' }, 'annehmen', JETZT);
  assert.equal(e.ja, false); assert.equal(e.code, 404);
  assert.equal(entscheidbar({ status: 'angenommen' }, 'ablehnen', JETZT).code, 409);
  assert.equal(entscheidbar({ status: 'abgelehnt' }, 'annehmen', JETZT).code, 409);
  assert.equal(entscheidbar({ status: 'archiv' }, 'annehmen', JETZT).code, 404);
});

test('Ablauf: am letzten Tag noch annehmbar, danach nicht; Ablehnen geht immer', () => {
  assert.equal(abgelaufen('2026-09-30', JETZT), false);
  assert.equal(abgelaufen('2026-09-29', JETZT), true);
  assert.equal(abgelaufen(null, JETZT), false);
  assert.equal(entscheidbar({ status: 'gesendet', gueltig_bis: '2026-09-29' }, 'annehmen', JETZT).code, 409);
  assert.equal(entscheidbar({ status: 'gesendet', gueltig_bis: '2026-09-29' }, 'ablehnen', JETZT).ja, true);
});

test('Name: 3–120 Zeichen, mind. zwei Buchstaben, Leerraum geglättet', () => {
  assert.equal(zusageName('  Max   Muster '), 'Max Muster');
  assert.equal(zusageName('Jörg Ö'), 'Jörg Ö');
  for (const x of ['', 'ab', '123', '   ', null, 'x'.repeat(121), '1 2 3']) assert.equal(zusageName(x), null, String(x));
});

test('WAECHTER: Schnittstelle, Portal, Seite, Dashboard', () => {
  const r = lies('app/api/oeffentlich/angebot/route.ts');
  assert.match(r, /if \(!perLinkSichtbar\(a\.status\)\) return NextResponse\.json\(\{ error: 'Dieses Angebot ist noch nicht freigegeben\.' \}, \{ status: 404 \}\)/);
  assert.match(r, /const d = entscheidbar\(a, entscheidung, new Date\(\)\);/);
  assert.match(r, /\.eq\('id', a\.id\)\.eq\('status', 'gesendet'\)\.select\('id'\)/, 'nur aus gesendet, nie aus Entwurf');
  assert.doesNotMatch(r, /in\('status', \['entwurf', 'gesendet'\]\)/);
  assert.match(r, /if \(entscheidung === 'annehmen' && !name\)/);
  assert.match(r, /entschieden_name: name, entschieden_erklaerung/);
  assert.match(lies('app/api/oeffentlich/portal/route.ts'), /\.eq\('status', 'gesendet'\)/);
  assert.doesNotMatch(lies('app/api/oeffentlich/portal/route.ts'), /'entwurf', 'gesendet'/);
  const s = lies('app/angebot/[token]/page.tsx');
  assert.match(s, /body: JSON\.stringify\(\{ token, entscheidung, name \}\)/);
  assert.match(lies('app/dashboard/angebote/page.tsx'), /if \(a\.status === 'entwurf'\) \{\n      if \(typeof window !== 'undefined' && !window\.confirm/);
  assert.ok(ZUSAGE_ERKLAERUNG.includes('verbindlich'));
  const q = lies('supabase-sql/p182-angebot-zusage.sql');
  assert.match(q, /add column if not exists entschieden_name text/);
  assert.doesNotMatch(q, /\b(drop|delete|truncate|update)\b/i);
});
