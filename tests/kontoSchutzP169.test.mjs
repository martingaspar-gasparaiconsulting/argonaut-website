// Paket 169 (29.09.2026) — Konto-Schutz: K1 Einladung uebernimmt nie ein bestehendes Konto,
// K2 Passwort-/Zwei-Faktor-Zuruecksetzen nur fuer Konten, die zu genau diesem Mitarbeiter gehoeren.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kontoGehoertZumMitarbeiter, ilikeGenau, normMail, istKennung, KONTO_KENNZEICHEN } from '../out/kontoSchutz.js';
import { pruefeMitarbeiterKonto, kennzeichenSetzen } from '../out/kontoSchutzServer.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const CHEF = '11111111-1111-4111-8111-111111111111';
const MA = '22222222-2222-4222-8222-222222222222';
const MARTIN = '33333333-3333-4333-8333-333333333333';
const FREMD = '44444444-4444-4444-8444-444444444444';
const GUT = { zielId: MA, betrieb: CHEF, betreiberId: MARTIN, zielEmail: 'Simone@Firma.de', maEmail: ' simone@firma.de ', kennzeichen: null, istKunde: false, rolle: null, fremdVerknuepft: 0, eigeneVerknuepft: 1 };

test('Altes Konto ohne Kennzeichen: nur bei genau passender Adresse, Kennzeichen wird nachgetragen', () => {
  assert.deepEqual(kontoGehoertZumMitarbeiter(GUT), { ja: true, kennzeichenNachtragen: true });
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, maEmail: 'andere@firma.de' }).ja, false);
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, zielEmail: null }).ja, false);
});

test('Kennzeichen entscheidet: eigener Betrieb ja, fremder Betrieb nie (auch bei gleicher Adresse)', () => {
  assert.deepEqual(kontoGehoertZumMitarbeiter({ ...GUT, kennzeichen: CHEF, maEmail: 'egal@x.de' }), { ja: true, kennzeichenNachtragen: false });
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, kennzeichen: FREMD }).ja, false);
});

test('Harte Verbote: Chef, Betreiber, Admin-Rolle, Kunden-Adresse, fremder Betrieb, nicht eindeutig', () => {
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, zielId: CHEF }).ja, false, 'nie das Chef-Konto');
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, zielId: MARTIN }).ja, false, 'nie der Betreiber');
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, rolle: 'admin', kennzeichen: CHEF }).ja, false);
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, istKunde: true, kennzeichen: CHEF }).ja, false);
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, fremdVerknuepft: 1, kennzeichen: CHEF }).ja, false);
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, eigeneVerknuepft: 2 }).ja, false);
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, eigeneVerknuepft: 0 }).ja, false);
  assert.equal(kontoGehoertZumMitarbeiter({ ...GUT, zielId: 'kein-uuid' }).ja, false);
});

test('Hilfsfunktionen', () => {
  assert.equal(normMail('  A@B.de '), 'a@b.de');
  assert.equal(ilikeGenau('a_b%c@x.de'), 'a\\_b\\%c@x.de');
  assert.equal(istKennung(CHEF), true);
  assert.equal(istKennung('x'), false);
  assert.equal(KONTO_KENNZEICHEN, 'argonaut_mitarbeiter_von');
});

// --- Server-Helfer mit nachgebautem Admin-Client -----------------------------
function fakeAdmin({ user, kunden = [], rolle = null, fremd = 0, eigen = 1, fehler = false, fehlerFremd = false } = {}) {
  const log = [];
  const q = (tabelle) => {
    const f = { t: tabelle, ops: [] };
    const kette = {
      select(_s, o) { f.head = o?.head; return kette; },
      ilike(k, v) { f.ops.push(['ilike', k, v]); return kette; },
      eq(k, v) { f.ops.push(['eq', k, v]); return kette; },
      neq(k, v) { f.ops.push(['neq', k, v]); return kette; },
      limit() { return Promise.resolve({ data: kunden }); },
      maybeSingle() { return Promise.resolve({ data: rolle ? { role: rolle } : null }); },
      then(res) {
        const neq = f.ops.some((o) => o[0] === 'neq');
        return Promise.resolve(fehler || (fehlerFremd && neq) ? { count: null } : { count: neq ? fremd : eigen }).then(res);
      },
    };
    return kette;
  };
  return {
    log,
    from: q,
    auth: { admin: {
      getUserById: async () => (user ? { data: { user }, error: null } : { data: null, error: { message: 'x' } }),
      updateUserById: async (id, daten) => { log.push([id, daten]); return { error: null }; },
    } },
  };
}

test('Server: sammelt Daten mit dem Service-Schluessel und entscheidet fail-closed', async () => {
  const user = { id: MA, email: 'simone@firma.de', app_metadata: {} };
  assert.deepEqual(await pruefeMitarbeiterKonto(fakeAdmin({ user }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' }), { ja: true, kennzeichenNachtragen: true });
  assert.equal((await pruefeMitarbeiterKonto(fakeAdmin({ user, fremd: 1 }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' })).ja, false);
  assert.equal((await pruefeMitarbeiterKonto(fakeAdmin({ user, kunden: [{ email: 'x' }] }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' })).ja, false);
  assert.equal((await pruefeMitarbeiterKonto(fakeAdmin({ user, fehler: true }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' })).ja, false, 'Abfragefehler = nein');
  assert.equal((await pruefeMitarbeiterKonto(fakeAdmin({ user, fehlerFremd: true }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' })).ja, false, 'Fehler bei der Fremd-Abfrage = nein');
  assert.equal((await pruefeMitarbeiterKonto(fakeAdmin({ user: null }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' })).ja, false);
  const mitK = { ...user, app_metadata: { [KONTO_KENNZEICHEN]: FREMD } };
  assert.equal((await pruefeMitarbeiterKonto(fakeAdmin({ user: mitK }), { zielId: MA, betrieb: CHEF, maEmail: 'simone@firma.de' })).ja, false);
  const a = fakeAdmin({ user: { ...user, app_metadata: { provider: 'email' } } });
  await kennzeichenSetzen(a, MA, CHEF);
  assert.deepEqual(a.log[0], [MA, { app_metadata: { provider: 'email', [KONTO_KENNZEICHEN]: CHEF } }]);
});

test('Waechter: Einladung uebernimmt nie ein Konto, Verknuepfung nur per Server auf eigene leere Zeile', () => {
  const ein = lies('app/api/hr/mitarbeiter-einladen/route.ts');
  assert.ok(!/listUsers\s*\(/.test(ein), 'kein Suchen fremder Konten');
  assert.ok(!/updateUserById/.test(ein), 'kein Passwort fremder Konten');
  assert.match(ein, /app_metadata:\s*\{\s*\[KONTO_KENNZEICHEN\]:\s*user\.id\s*\}/);
  for (const p of ['app/api/hr/mitarbeiter-einladen/route.ts', 'app/api/hr/zugang-reset/route.ts']) {
    const s = lies(p);
    assert.ok(!/await supabase\s*\.from\("mitarbeiter"\)\s*\.update\(\{ auth_user_id/.test(s), p + ': auth_user_id nie mit dem Nutzer-Client');
    assert.match(s, /\.update\(\{ auth_user_id: authUserId \}\)\s*\.eq\("id", mitarbeiterId\)\s*\.eq\("owner_user_id", user\.id\)\s*\.is\("auth_user_id", null\)/, p);
  }
});

test('Waechter: jedes Zuruecksetzen prueft das Ziel-Konto vorher', () => {
  const reset = lies('app/api/hr/zugang-reset/route.ts');
  const iPruef = reset.indexOf('pruefeMitarbeiterKonto(admin');
  const iPw = reset.indexOf('updateUserById(authUserId');
  assert.ok(iPruef > 0 && iPruef < iPw, 'Pruefung vor dem Passwort');
  const team = lies('app/api/zwei-faktor/team/route.ts');
  const iT = team.indexOf('pruefeMitarbeiterKonto(admin');
  const iF = team.indexOf('faktorZuruecksetzen(admin');
  assert.ok(iT > 0 && iT < iF, 'Pruefung vor dem Loeschen der Faktoren');
  assert.equal((team.match(/pruefeMitarbeiterKonto\(admin/g) || []).length, 2, 'auch vor dem Setzen einer Vertretung');
});
