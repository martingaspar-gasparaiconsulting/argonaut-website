// ============================================================================
// tests/fernhilfeP209.test.mjs — Paket 209 (Stufe 3 · B10 Fernhilfe: Bildschirm teilen)
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  kanalAus, istKanal, kanalName, istHelferArt, gueltigBis, sitzungAktiv, grundSaeubern,
  darfBeitreten, darfBeenden, VERDECKT_CSS, istSignal, GUELTIG_MINUTEN,
} from '../out/fernhilfe.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-10-05T10:00:00Z');
const BETRIEB = 'b'.repeat(8) + '-0000-0000-0000-000000000001';
const MA = 'a'.repeat(8) + '-0000-0000-0000-000000000002';
const FREMD = 'f'.repeat(8) + '-0000-0000-0000-000000000003';
const MARTIN = 'e'.repeat(8) + '-0000-0000-0000-000000000004';
const sitzung = (x = {}) => ({ id: 's1', owner_user_id: BETRIEB, angefordert_von: MA, helfer_art: 'betrieb', status: 'wartet', gueltig_bis: '2026-10-05T10:30:00Z', helfer_id: null, ...x });

test('Kanal-Geheimnis', () => {
  const k = kanalAus(new Uint8Array(24).fill(171));
  assert.equal(k, 'ab'.repeat(24));
  assert.equal(istKanal(k), true);
  assert.equal(istKanal('ab'), false);
  assert.equal(kanalName(k), 'fernhilfe-' + k);
  assert.throws(() => kanalAus(new Uint8Array(4)));
});

test('Gültigkeit 30 Minuten', () => {
  assert.equal(GUELTIG_MINUTEN, 30);
  assert.equal(gueltigBis(JETZT), '2026-10-05T10:30:00.000Z');
  assert.equal(sitzungAktiv(sitzung(), JETZT), true);
  assert.equal(sitzungAktiv(sitzung({ gueltig_bis: '2026-10-05T09:59:59Z' }), JETZT), false);
  assert.equal(sitzungAktiv(sitzung({ status: 'beendet' }), JETZT), false);
  assert.equal(sitzungAktiv(sitzung({ gueltig_bis: 'kaputt' }), JETZT), false);
});

test('Wer darf zusehen', () => {
  const l = (userId, istBetreiber = false) => ({ userId, istBetreiber, jetzt: JETZT });
  assert.equal(darfBeitreten(sitzung(), l(BETRIEB)).ok, true, 'Geschäftsleitung des Betriebs');
  assert.equal(darfBeitreten(sitzung(), l(FREMD)).status, 403, 'Fremder nie');
  assert.equal(darfBeitreten(sitzung(), l(MARTIN, true)).status, 403, 'Betreiber nicht bei Betriebs-Anfrage');
  assert.equal(darfBeitreten(sitzung({ helfer_art: 'argonaut' }), l(MARTIN, true)).ok, true, 'Betreiber bei Support-Anfrage');
  assert.equal(darfBeitreten(sitzung({ helfer_art: 'argonaut' }), l(BETRIEB)).status, 403, 'Chef nicht bei Support-Anfrage');
  assert.equal(darfBeitreten(sitzung(), l(MA)).status, 403, 'nicht die eigene Anfrage');
  assert.equal(darfBeitreten(sitzung({ helfer_art: 'argonaut', angefordert_von: MARTIN }), l(MARTIN, true)).status, 403, 'auch der Betreiber nicht bei der eigenen');
  assert.equal(darfBeitreten(sitzung(), l(null)).status, 401);
  assert.equal(darfBeitreten(null, l(BETRIEB)).status, 404);
  assert.equal(darfBeitreten(sitzung({ status: 'beendet' }), l(BETRIEB)).status, 410);
  assert.equal(darfBeitreten(sitzung({ helfer_id: FREMD }), l(BETRIEB)).status, 409, 'schon besetzt');
  assert.equal(darfBeitreten(sitzung({ helfer_id: BETRIEB, status: 'verbunden' }), l(BETRIEB)).ok, true, 'Wiedereintritt');
  assert.equal(darfBeitreten(sitzung({ helfer_art: 'x' }), l(BETRIEB, true)).ok, false);
});

test('Beenden: beide Seiten, sonst niemand', () => {
  assert.equal(darfBeenden(sitzung(), MA, false), true);
  assert.equal(darfBeenden(sitzung({ helfer_id: BETRIEB }), BETRIEB, false), true);
  assert.equal(darfBeenden(sitzung(), FREMD, false), false);
  assert.equal(darfBeenden(sitzung({ helfer_art: 'argonaut' }), MARTIN, true), true);
  assert.equal(darfBeenden(null, MA, false), false);
});

test('Anlass, Helfer-Art, Signale, Verdecken', () => {
  assert.equal(grundSaeubern('  Rechnung\n\tgeht nicht  '), 'Rechnung geht nicht');
  assert.equal(grundSaeubern('x'.repeat(400)).length, 300);
  assert.equal(istHelferArt('betrieb'), true);
  assert.equal(istHelferArt('admin'), false);
  assert.equal(istSignal({ art: 'angebot', von: 'teiler' }), true);
  assert.equal(istSignal({ art: 'befehl', von: 'teiler' }), false, 'nur bekannte Arten');
  assert.equal(istSignal({ art: 'hallo', von: 'x' }), false);
  assert.match(VERDECKT_CSS, /^body\.fernhilfe-aktiv :is\(/);
  assert.match(VERDECKT_CSS, /input\[type="password"\]/);
  assert.match(VERDECKT_CSS, /iban/);
  assert.match(VERDECKT_CSS, /blur\(/);
});

test('Verdrahtung: Server gibt den Kanal nur nach der Prüfung heraus', () => {
  const r = lies('app/api/fernhilfe/route.ts');
  assert.match(r, /const darf = darfBeitreten\(s, \{ userId: p\.id, istBetreiber: await istBetreiber\(\), jetzt \}\);\n      if \(!darf\.ok\) return antwort\(false, darf\.fehler, darf\.status\);/);
  assert.match(r, /pfad: `\/dashboard\/fernhilfe\/\$\{id\}`/, 'Link nur mit Sitzungs-Kennung');
  assert.doesNotMatch(r, /pfad: `[^`]*kanal/, 'Kanal nie im Link');
  assert.match(r, /kanalAus\(new Uint8Array\(randomBytes\(24\)\)\)/);
  const oeff = r.slice(r.indexOf('function oeffentlich'), r.indexOf('export async function GET'));
  assert.doesNotMatch(oeff, /kanal/, 'Status-Abfrage liefert keinen Kanal');
  const knopf = lies('app/dashboard/_components/FernhilfeKnopf.tsx');
  assert.match(knopf, /getDisplayMedia\(\{ video: true, audio: false \}\)/, 'kein Ton');
  assert.doesNotMatch(knopf, /MediaRecorder/, 'keine Aufzeichnung');
  assert.match(knopf, /async function zulassen\(\)/, 'Bild erst nach Zulassen');
  assert.match(knopf, /addEventListener\('ended'/, 'Browser-Knopf „Freigabe beenden" beendet');
  assert.doesNotMatch(lies('app/dashboard/fernhilfe/[id]/page.tsx'), /MediaRecorder|requestPointerLock/);
  assert.match(lies('app/dashboard/layout.tsx'), /<FernhilfeKnopf \/>/);
  const sql = lies('supabase-sql/p209-fernhilfe.sql');
  assert.match(sql, /create policy p164s3_aal on public\.fernhilfe_sitzung/);
  assert.doesNotMatch(sql, /create policy (?!p164s3_aal)/, 'keine Nutzer-Regel');
  assert.doesNotMatch(sql, /^\s*(drop table|delete|truncate)\b/im);
});
