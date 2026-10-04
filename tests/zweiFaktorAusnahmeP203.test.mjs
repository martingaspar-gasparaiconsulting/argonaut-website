// ============================================================================
// tests/zweiFaktorAusnahmeP203.test.mjs — Paket 203 (Entscheidung B4)
//   Ausnahme von der Zwei-Faktor-Pflicht je Mitarbeiter
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ausnahmePruefen, ausnahmeAktiv, ausnahmeText, heuteBerlin, MAX_TAGE } from '../out/zweiFaktorAusnahme.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-10-04T10:00:00Z');
const basis = { rolle: 'chef', aal2: true, zielRolle: 'mitarbeiter', zielHatZugang: true, grund: 'kein Diensthandy', bis: '' };

test('Wer darf wen ausnehmen', () => {
  assert.deepEqual(ausnahmePruefen(basis, JETZT), { ja: true, grund: 'kein Diensthandy', bis: null });
  assert.equal(ausnahmePruefen({ ...basis, rolle: 'mitarbeiter' }, JETZT).ja, false);
  assert.equal(ausnahmePruefen({ ...basis, rolle: 'helfer' }, JETZT).ja, false, 'Vertretung legt keine Ausnahmen an');
  assert.equal(ausnahmePruefen({ ...basis, aal2: false }, JETZT).ja, false, 'nur mit eigenem Code');
  assert.match(ausnahmePruefen({ ...basis, zielRolle: 'helfer' }, JETZT).fehler, /Vertretung/, 'Vertretung nie ausnehmen, mit eigenem Hinweis');
  assert.equal(ausnahmePruefen({ ...basis, zielRolle: 'chef' }, JETZT).ja, false, 'Geschäftsleitung nie ausnehmen');
  assert.equal(ausnahmePruefen({ ...basis, zielRolle: null }, JETZT).ja, false);
  assert.equal(ausnahmePruefen({ ...basis, zielHatZugang: false }, JETZT).ja, false);
  assert.equal(ausnahmePruefen({ ...basis, grund: 'kein' }, JETZT).ja, false, 'Grund Pflicht');
});

test('Frist: optional, nicht vergangen, höchstens 1 Jahr', () => {
  assert.deepEqual(ausnahmePruefen({ ...basis, bis: '2026-12-31' }, JETZT), { ja: true, grund: 'kein Diensthandy', bis: '2026-12-31' });
  assert.equal(ausnahmePruefen({ ...basis, bis: '2026-10-03' }, JETZT).ja, false);
  assert.equal(ausnahmePruefen({ ...basis, bis: '2026-10-04' }, JETZT).ja, true, 'heute zählt');
  assert.equal(ausnahmePruefen({ ...basis, bis: '2027-10-05' }, JETZT).ja, false);
  assert.equal(ausnahmePruefen({ ...basis, bis: '2026-02-30' }, JETZT).ja, false);
  assert.equal(MAX_TAGE, 365);
});

test('Gültigkeit und Anzeige', () => {
  assert.equal(ausnahmeAktiv({ bis: null, aufgehoben_am: null }, JETZT), true);
  assert.equal(ausnahmeAktiv({ bis: '2026-10-04' }, JETZT), true);
  assert.equal(ausnahmeAktiv({ bis: '2026-10-03' }, JETZT), false);
  assert.equal(ausnahmeAktiv({ bis: null, aufgehoben_am: '2026-10-01T00:00:00Z' }, JETZT), false);
  assert.equal(ausnahmeAktiv(null, JETZT), false);
  assert.equal(heuteBerlin(new Date('2026-10-03T22:30:00Z')), '2026-10-04');
  assert.equal(ausnahmeText({ grund: 'kein Diensthandy', bis: '2026-12-31' }), 'kein Diensthandy · bis 31.12.2026');
  assert.equal(ausnahmeText({ grund: 'kein Diensthandy', bis: null }), 'kein Diensthandy · unbefristet');
});

test('Route: nur Geschäftsleitung mit Code, Ziel aus der Datenbank, Aufheben statt Löschen', () => {
  const r = lies('app/api/zwei-faktor/ausnahme/route.ts');
  assert.ok(r.includes("if (ich.rolle !== 'chef')"));
  assert.ok(r.includes("if (!a.aal2)"));
  assert.ok(r.includes(".eq('id', mitarbeiterId).eq('owner_user_id', ich.betrieb)"));
  assert.ok(!/\.delete\(\)/.test(r), 'nie löschen');
  assert.ok(r.includes('aufgehoben_am: jetzt'));
  const k = lies('app/dashboard/_components/ZweiFaktorPflichtKarte.tsx');
  assert.ok(k.includes('{an && <ZweiFaktorAusnahmen />}'));
});

test('SQL p203: keine Nutzer-Regel, Pflicht-Funktion prüft Ausnahme, additiv', () => {
  const s = lies('supabase-sql/p203-zwei-faktor-ausnahme.sql');
  const ohne = s.replace(/--.*$/gm, '');
  assert.ok(!/drop\s+(table|column)|delete\s+from|truncate/i.test(ohne));
  assert.ok(ohne.includes('revoke all on public.zwei_faktor_ausnahme from anon, authenticated;'));
  assert.ok(!/create policy (?!p164s3_aal)/.test(ohne), 'nur die Zwei-Faktor-Regel');
  assert.ok(ohne.includes('and a.auth_user_id = v_uid'));
  assert.ok(ohne.includes("and a.aufgehoben_am is null"));
  assert.ok(ohne.includes("(a.bis is null or a.bis >= (now() at time zone 'Europe/Berlin')::date)"));
  assert.ok(ohne.includes('revoke all on function public.zwei_faktor_pflicht_ab() from public, anon;'));
  assert.ok(ohne.includes('zwei_faktor_ausnahme_eine_aktive'));
});
