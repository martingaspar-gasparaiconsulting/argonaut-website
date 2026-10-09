// Paket 288 (09.10.2026): RF1b Freigaben an die Funktionen anbinden — Rangliste, Sperr-Baustein, Erinnerung
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { funktion, erinnerungen, erinnerungText } from '../out/rechtsFreigaben.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const jetzt = new Date('2026-10-09T10:00:00Z');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const z = (owner, key, bis, extra = {}) => ({ owner_user_id: owner, funktion: key, fassung: funktion(key)?.fassung ?? 'x', bestaetigt_am: '2025-11-01T10:00:00Z', gueltig_bis: bis, ...extra });

test('Erinnerung: nur aktive Freigaben, die in höchstens 30 Tagen ablaufen; eine je Betrieb', () => {
  const liste = erinnerungen([
    z(A, 'leistungsauswertung', '2026-10-20T10:00:00Z'),
    z(A, 'video', '2026-10-15T10:00:00Z'),
    z(A, 'ortung', '2027-06-01T10:00:00Z'),                                   // noch lange gültig
    z(B, 'leistungsauswertung', '2026-10-25T10:00:00Z', { widerrufen_am: '2026-10-01T10:00:00Z' }), // widerrufen
    z(B, 'video', '2026-10-25T10:00:00Z', { fassung: 'alt' }),                 // alte Fassung
    z(B, 'ortung', '2026-10-01T10:00:00Z'),                                   // schon abgelaufen
    z('kein-uuid', 'video', '2026-10-20T10:00:00Z'),                          // kaputte Zeile
    z(B, 'gibtsnicht', '2026-10-20T10:00:00Z'),
  ], jetzt);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].betrieb, A);
  assert.deepEqual(liste[0].titel.sort(), [funktion('leistungsauswertung').titel, funktion('video').titel].sort());
  assert.equal(liste[0].fruehesteBis, '2026-10-15T10:00:00.000Z');
  assert.equal(liste[0].restTage, 6);
  const t = erinnerungText(liste[0]);
  assert.match(t.titel, /2 rechtliche Freigaben/);
  assert.match(t.nachricht, /15\.10\.2026/);
  assert.match(erinnerungText({ betrieb: A, titel: ['X'], fruehesteBis: '2026-10-15T10:00:00Z', restTage: 6 }).titel, /^Rechtliche Freigabe läuft bald ab$/);
  assert.equal(erinnerungen([z(A, 'video', '2026-11-08T10:00:01Z')], jetzt).length, 0, 'mehr als 30 Tage');
});

test('Rangliste: nur mit gültiger Freigabe sichtbar und einschaltbar', () => {
  const seite = lies('app/dashboard/kfz/chef/page.tsx');
  assert.match(seite, /useRechtsFreigabe\('leistungsauswertung'\)/);
  assert.match(seite, /const rangSichtbar = rangAn && freigabe\.aktiv;/);
  assert.match(seite, /freigabe\.aktiv && <button.*ranglisteSchalten\(true\)/);
  assert.match(seite, /<FreigabeHinweis lage=\{freigabe\} \/>/);
  assert.match(seite, /!rangSichtbar \?/);
  assert.doesNotMatch(seite, /frageRangliste/);
});

test('Sperr-Baustein: gesperrt beim Laden, bei Fehler und ohne Eintrag', () => {
  const k = lies('app/dashboard/_components/RechtsFreigabe.tsx');
  assert.match(k, /aktiv: !laedt && lage\.aktiv/);
  assert.match(k, /if \(!f\) return \{ laedt: false, aktiv: false/);
  assert.match(k, /setJ\(r\.ok \? d : null\)/);
  assert.match(k, /aktiv: f\.stand\?\.aktiv === true/);
});

test('Cron: geschützt, nur lesen + Glocke, im Zeitplan', () => {
  const r = lies('app/api/cron/rechts-freigaben/route.ts');
  assert.match(r, /await cronGuard\(req\)/);
  assert.match(r, /\.is\('widerrufen_am', null\)/);
  assert.match(r, /p_dedup_stunden: 168/);
  assert.match(r, /\.range\(von, von \+ 999\)/);
  assert.doesNotMatch(r, /\.(update|insert|upsert|delete)\(/);
  const v = JSON.parse(lies('vercel.json'));
  assert.ok(v.crons.some((c) => c.path === '/api/cron/rechts-freigaben' && /^\d+ \d+ \* \* \*$/.test(c.schedule)));
});
