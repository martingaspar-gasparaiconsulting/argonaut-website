// ============================================================================
// tests/ablaufKnopfGlockeP192.test.mjs — Paket 192: Knopf-Abläufe und Glocke gezielter
//
// Martin 29.09.2026: je Ablauf Haken „Auch Mitarbeiter mit Schreibrecht dürfen
// starten" (Standard aus); Glocke zusätzlich an ausgewählte Personen oder eine
// Abteilung.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pruefeAblauf, glockePersonen, glockeAbteilung, knopfModul, KNOPF_MODULE } from '../out/ablauf.js';
import { aktionPlanen, OHNE_VORGANG } from '../out/ablaufMotor.js';
import { darfKnopfStarten } from '../out/ablaufKnopfRecht.js';
import { glockenEmpfaenger } from '../out/ablaufAusfuehren.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const HEUTE = '2026-09-30';
const CHEF = '11111111-1111-1111-1111-111111111111';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const knopfAblauf = (ausloeser) => ({ owner_user_id: CHEF, ausloeser });
const ma = (x = {}) => ({ rolle: 'mitarbeiter', userId: 'u-ma', betrieb: CHEF, austrittsdatum: null, module: ['auftraege'], schreibModule: ['auftraege'], ...x });

// ---------------------------------------------------------------------------
// Knopf für Mitarbeiter
// ---------------------------------------------------------------------------

test('Chef darf immer (eigener Ablauf), fremder Chef nie', () => {
  const a = knopfAblauf({ art: 'knopf', modul: 'auftraege' });
  assert.deepEqual(darfKnopfStarten(a, { rolle: 'chef', userId: CHEF }, HEUTE), { ja: true, alsMitarbeiter: false });
  assert.equal(darfKnopfStarten(a, { rolle: 'chef', userId: 'fremd' }, HEUTE).ja, false);
});

test('Mitarbeiter nur mit Haken, Modulseite, eigenem Betrieb, Sehen + Ändern, nicht ausgetreten', () => {
  const mit = knopfAblauf({ art: 'knopf', modul: 'auftraege', mitarbeiter: true });
  assert.deepEqual(darfKnopfStarten(mit, ma(), HEUTE), { ja: true, alsMitarbeiter: true });
  assert.equal(darfKnopfStarten(knopfAblauf({ art: 'knopf', modul: 'auftraege' }), ma(), HEUTE).ja, false, 'ohne Haken');
  assert.equal(darfKnopfStarten(knopfAblauf({ art: 'knopf', mitarbeiter: true }), ma(), HEUTE).ja, false, 'Seite Abläufe (ohne Vorgang)');
  assert.equal(darfKnopfStarten(mit, ma({ betrieb: 'anderer' }), HEUTE).ja, false, 'fremder Betrieb');
  assert.equal(darfKnopfStarten(mit, ma({ schreibModule: [] }), HEUTE).ja, false, 'nur Leserecht');
  assert.equal(darfKnopfStarten(mit, ma({ module: [] }), HEUTE).ja, false, 'Modul nicht sichtbar');
  assert.equal(darfKnopfStarten(mit, ma({ austrittsdatum: '2026-09-29' }), HEUTE).ja, false, 'ausgetreten');
  assert.equal(darfKnopfStarten(mit, ma({ austrittsdatum: '2026-09-30' }), HEUTE).ja, true, 'letzter Arbeitstag zählt noch');
  assert.equal(darfKnopfStarten(knopfAblauf({ art: 'zeitplan', rhythmus: 'taeglich' }), ma(), HEUTE).ja, false, 'kein Knopf');
});

test('Rechte-Schlüssel je Knopf-Modul: Kunden = crm', () => {
  assert.equal(knopfModul('kontakte').recht, 'crm');
  const mit = knopfAblauf({ art: 'knopf', modul: 'kontakte', mitarbeiter: true });
  assert.equal(darfKnopfStarten(mit, ma({ module: ['crm'], schreibModule: ['crm'] }), HEUTE).ja, true);
  assert.equal(darfKnopfStarten(mit, ma({ module: ['kontakte'], schreibModule: ['kontakte'] }), HEUTE).ja, false);
  for (const k of KNOPF_MODULE) assert.ok(k.recht, k.modul);
});

test('Prüfung: Mitarbeiter-Haken nur mit Modulseite; mit Modul ein Hinweis', () => {
  const schritt = [{ id: 's1', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'x' } }];
  const ohne = pruefeAblauf({ name: 'A', ausloeser: { art: 'knopf', mitarbeiter: true }, schritte: schritt });
  assert.ok(ohne.fehler.some((f) => f.includes('nur Knöpfe auf einer Modulseite')));
  const mit = pruefeAblauf({ name: 'A', ausloeser: { art: 'knopf', modul: 'auftraege', mitarbeiter: true }, schritte: schritt });
  assert.equal(mit.fehler.length, 0, mit.fehler.join(' | '));
  assert.ok(mit.hinweise.some((h) => h.includes('Auch Mitarbeiter mit Schreibrecht')));
});

// ---------------------------------------------------------------------------
// Glocke an Personen / Abteilung
// ---------------------------------------------------------------------------

test('glockePersonen: nur gültige Kennungen, ohne Doppelte, Komma oder Liste', () => {
  assert.deepEqual(glockePersonen(`${P1}, ${P2},${P1}, quatsch, `), [P1, P2]);
  assert.deepEqual(glockePersonen([P2.toUpperCase()]), [P2]);
  assert.deepEqual(glockePersonen(''), []);
  assert.equal(glockeAbteilung('  Montage  '), 'Montage');
  assert.equal(glockeAbteilung('   '), null);
});

const glockeSchritt = (config) => ({ id: 'g1', typ: 'aktion', aktion: 'glocke', config: { text: 'Hallo {{name}}', ...config } });
const ZEITPLAN = { art: 'zeitplan', rhythmus: 'taeglich' };

test('Prüfung: Personen ohne Auswahl / Abteilung leer = Fehler; unbekannter Empfänger = Fehler', () => {
  const p = (config) => pruefeAblauf({ name: 'G', ausloeser: ZEITPLAN, schritte: [glockeSchritt(config)] });
  assert.ok(p({ an: 'personen', personen: '' }).fehler.some((f) => f.includes('mindestens eine Person')));
  assert.equal(p({ an: 'personen', personen: P1 }).fehler.length, 0);
  assert.ok(p({ an: 'abteilung', abteilung: '' }).fehler.some((f) => f.includes('Abteilung wählen')));
  const ab = p({ an: 'abteilung', abteilung: 'Montage' });
  assert.equal(ab.fehler.length, 0);
  assert.ok(ab.hinweise.some((h) => h.includes('„Montage"')));
  assert.ok(p({ an: 'alle_welt' }).fehler.some((f) => f.includes('Empfänger')));
  assert.equal(p({ an: 'chef' }).fehler.length, 0);
  assert.equal(p({ an: 'team' }).fehler.length, 0);
});

test('Motor plant Personen und Abteilung mit', () => {
  const plan = (config) => aktionPlanen(glockeSchritt(config), { name: 'G', ausloeser: ZEITPLAN }, OHNE_VORGANG, CHEF, {}, new Date('2026-09-30T10:00:00Z'));
  const p = plan({ an: 'personen', personen: `${P1},${P2}` });
  assert.equal(p.art, 'glocke'); assert.deepEqual(p.personen, [P1, P2]); assert.match(p.meldung, /2 ausgewählte Personen/);
  const a = plan({ an: 'abteilung', abteilung: ' Montage ' });
  assert.equal(a.abteilung, 'Montage'); assert.match(a.meldung, /Abteilung „Montage"/);
  assert.equal(plan({ an: 'personen', personen: '' }).art, 'fehler');
  assert.equal(plan({ an: 'quatsch' }).an, 'chef', 'Unbekanntes wird Geschäftsleitung');
});

function fakeDb(zeilen) {
  const filter = [];
  return {
    filter,
    from(t) {
      assert.equal(t, 'mitarbeiter');
      const q = {
        select() { return q; },
        eq(k, v) { filter.push([k, v]); return q; },
        not() { return q; },
        limit() {
          const owner = filter.find(([k]) => k === 'owner_user_id')?.[1];
          return Promise.resolve({ data: zeilen.filter((z) => z.owner_user_id === owner && z.auth_user_id) });
        },
      };
      return q;
    },
  };
}

const ZEILEN = [
  { id: P1, owner_user_id: CHEF, auth_user_id: 'u1', austrittsdatum: null, abteilung: 'Montage' },
  { id: P2, owner_user_id: CHEF, auth_user_id: 'u2', austrittsdatum: null, abteilung: 'büro' },
  { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', owner_user_id: CHEF, auth_user_id: 'u3', austrittsdatum: '2026-01-01', abteilung: 'montage' },
  { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', owner_user_id: 'fremder-betrieb', auth_user_id: 'u4', austrittsdatum: null, abteilung: 'Montage' },
  { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', owner_user_id: CHEF, auth_user_id: null, austrittsdatum: null, abteilung: 'Montage' },
];
const J = new Date('2026-09-30T10:00:00Z');

test('Empfänger: Chef / Team / Personen / Abteilung — streng je Betrieb, ohne Ausgetretene', async () => {
  assert.deepEqual(await glockenEmpfaenger(fakeDb(ZEILEN), CHEF, { an: 'chef' }, J), [CHEF]);
  assert.deepEqual(await glockenEmpfaenger(fakeDb(ZEILEN), CHEF, { an: 'team' }, J), [CHEF, 'u1', 'u2']);
  assert.deepEqual(await glockenEmpfaenger(fakeDb(ZEILEN), CHEF, { an: 'personen', personen: [P2] }, J), ['u2']);
  assert.deepEqual(await glockenEmpfaenger(fakeDb(ZEILEN), CHEF, { an: 'personen', personen: ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'] }, J), [], 'fremde Kennung erreicht niemanden');
  assert.deepEqual(await glockenEmpfaenger(fakeDb(ZEILEN), CHEF, { an: 'abteilung', abteilung: 'MONTAGE ' }, J), ['u1'], 'Groß/Klein egal, Ausgetretene und Fremde nicht');
  assert.deepEqual(await glockenEmpfaenger(fakeDb(ZEILEN), CHEF, { an: 'abteilung', abteilung: '' }, J), []);
  const db = fakeDb(ZEILEN);
  await glockenEmpfaenger(db, CHEF, { an: 'abteilung', abteilung: 'Montage' }, J);
  assert.deepEqual(db.filter, [['owner_user_id', CHEF]]);
});

// ---------------------------------------------------------------------------
// Code-Wächter
// ---------------------------------------------------------------------------

test('WAECHTER: Start und Knopfliste nutzen dieselbe Regel, Betrieb aus der Datenbank', () => {
  const s = lies('app/api/ablaeufe/start/route.ts');
  assert.match(s, /const wer = await knopfAufrufer\(admin, user\.id\)/);
  assert.match(s, /darfKnopfStarten\(ablauf, wer, /);
  assert.match(s, /if \(!recht\.ja\) return NextResponse\.json\(\{ ok: false, error: recht\.grund \}, \{ status: 403 \}\);/);
  assert.match(s, /if \(recht\.alsMitarbeiter\) return NextResponse\.json\(\{ ok: false, error: 'Mitarbeiter starten nur Knöpfe auf einer Modulseite\.' \}/);
  assert.match(s, /kontext\.gestartet_von = user\.id/);
  assert.doesNotMatch(s, /body\.(betrieb|owner\w*)\b/);
  const k = lies('app/api/ablaeufe/knoepfe/route.ts');
  assert.match(k, /darfKnopfStarten\(a, wer, heute\)\.ja/);
  const srv = lies('lib/ablaufKnopfServer.ts');
  assert.match(srv, /\.eq\('auth_user_id', userId\)/);
  assert.match(srv, /select\('module, schreib_module'\)\.eq\('mitarbeiter_id', m\.id\)/);
  const ed = lies('app/dashboard/ablaeufe/_teile/AblaufEditor.tsx');
  assert.match(ed, /Auch Mitarbeiter mit Schreibrecht für/);
  assert.match(ed, /<GlockeEmpfaenger s=\{s\} onChange=\{onChange\} \/>/);
});
