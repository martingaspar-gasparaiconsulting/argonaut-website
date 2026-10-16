// Paket VK3 (16.10.2026): Termin-Verteilung auf Closer
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MODI, istModus, regelnBereinigen, istFrei, belegung, waehleCloser, letzteZuteilung } from '../out/terminVerteilung.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const A = { user_id: 'ua', name: 'Anna', mitarbeiter_id: 'ma' };
const B = { user_id: 'ub', name: 'Bernd', mitarbeiter_id: 'mb' };
const Z = { user_id: 'uz', name: 'Zora', mitarbeiter_id: null };
const d = (s) => new Date(s);

test('Modi stimmen mit der Datenbank-Regel ueberein', () => {
  const sql = lies('supabase-sql/p409-termin-verteilung.sql');
  const m = /modus in \(([^)]+)\)/.exec(sql)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(m, MODI.map((x) => x.key));
  assert.ok(istModus('reihum') && !istModus('zufall'));
});

test('Regeln: nur vollstaendige, nur Closer aus dem Team', () => {
  const r = regelnBereinigen([
    { frage: 'budget', wert: 'über 20.000 €', an: ['ua', 'fremd', 'ua'] },
    { frage: 'budget', wert: '', an: ['ua'] },
    { frage: 'zeitpunkt', wert: 'sofort', an: ['fremd'] },
    'quatsch',
  ], ['ua', 'ub']);
  assert.deepEqual(r, [{ frage: 'budget', wert: 'über 20.000 €', an: ['ua'] }]);
  assert.deepEqual(regelnBereinigen(null, ['ua']), []);
});

test('istFrei: halb-offene Intervalle, Storno zaehlt nicht, Abwesenheit nach Berliner Tag, ohne Mitarbeiter nie', () => {
  const t = [
    { mitarbeiter_id: 'ma', beginn_am: '2026-10-20T08:00:00Z', ende_am: '2026-10-20T09:00:00Z', status: 'geplant' },
    { mitarbeiter_id: 'ma', beginn_am: '2026-10-20T10:00:00Z', ende_am: '2026-10-20T11:00:00Z', status: 'storniert' },
  ];
  assert.equal(istFrei('ma', d('2026-10-20T09:00:00Z'), d('2026-10-20T10:00:00Z'), t), true, 'direkt anschliessend ist frei');
  assert.equal(istFrei('ma', d('2026-10-20T08:30:00Z'), d('2026-10-20T09:30:00Z'), t), false);
  assert.equal(istFrei('ma', d('2026-10-20T10:00:00Z'), d('2026-10-20T11:00:00Z'), t), true, 'stornierter Termin blockt nicht');
  assert.equal(istFrei('mb', d('2026-10-20T08:30:00Z'), d('2026-10-20T09:30:00Z'), t), true);
  const abw = [{ mitarbeiter_id: 'mb', von: '2026-10-21', bis: '2026-10-22', status: 'genehmigt' }];
  assert.equal(istFrei('mb', d('2026-10-20T22:30:00Z'), d('2026-10-20T23:30:00Z'), [], abw), false, '00:30 Berliner Zeit ist schon der 21.');
  assert.equal(istFrei('mb', d('2026-10-20T21:30:00Z'), d('2026-10-20T21:45:00Z'), [], abw), true);
  assert.equal(istFrei('mb', d('2026-10-21T08:00:00Z'), d('2026-10-21T09:00:00Z'), [], [{ ...abw[0], status: 'abgelehnt' }]), true);
  assert.equal(istFrei(null, d('2026-10-20T08:00:00Z'), d('2026-10-20T09:00:00Z'), []), false);
});

test('Belegung: nur Anteil im Zeitraum, Storno nicht', () => {
  const m = belegung([
    { mitarbeiter_id: 'ma', beginn_am: '2026-10-19T23:00:00Z', ende_am: '2026-10-20T01:00:00Z' },
    { mitarbeiter_id: 'ma', beginn_am: '2026-10-21T08:00:00Z', ende_am: '2026-10-21T08:30:00Z' },
    { mitarbeiter_id: 'mb', beginn_am: '2026-10-21T08:00:00Z', ende_am: '2026-10-21T09:00:00Z', status: 'abgesagt' },
  ], d('2026-10-20T00:00:00Z'), d('2026-11-03T00:00:00Z'));
  assert.equal(m.get('ma'), 90);
  assert.equal(m.has('mb'), false);
});

test('Reihum: nie Zugeteilte zuerst, dann am laengsten her; Gleichstand nach Name', () => {
  const zuletzt = letzteZuteilung([{ user_id: 'ua', am: '2026-10-01' }, { user_id: 'ua', am: '2026-10-10' }, { user_id: 'ub', am: '2026-10-05' }, { user_id: null, am: 'x' }]);
  assert.equal(zuletzt.get('ua'), '2026-10-10');
  assert.deepEqual(waehleCloser({ modus: 'reihum', closer: [A, B], zuletzt }), { user_id: 'ub', grund: 'am längsten ohne Termin' });
  assert.deepEqual(waehleCloser({ modus: 'reihum', closer: [B, A] }), { user_id: 'ua', grund: 'noch ohne Termin' });
});

test('Nach freier Zeit: wenigste Minuten gewinnen', () => {
  const minuten = new Map([['ma', 600], ['mb', 120]]);
  const w = waehleCloser({ modus: 'freie_zeit', closer: [A, B], minuten });
  assert.equal(w.user_id, 'ub');
  assert.match(w.grund, /2 Std\./);
});

test('Nur Freie; niemand frei → null; aus → null', () => {
  assert.equal(waehleCloser({ modus: 'reihum', closer: [A, B], frei: new Set(['ub']) }).user_id, 'ub');
  assert.equal(waehleCloser({ modus: 'reihum', closer: [A, B], frei: new Set() }), null);
  assert.equal(waehleCloser({ modus: 'aus', closer: [A, B] }), null);
  assert.equal(waehleCloser({ modus: 'reihum', closer: [] }), null);
});

test('Regel grenzt ein; ist dort niemand frei, gilt das ganze Team mit Hinweis', () => {
  const regeln = [{ frage: 'budget', wert: 'über 20.000 €', an: ['ub'] }];
  const w1 = waehleCloser({ modus: 'reihum', closer: [A, B], antworten: { budget: 'über 20.000 €' }, regeln });
  assert.equal(w1.user_id, 'ub'); assert.match(w1.grund, /Regel „über 20\.000 €"/);
  const w2 = waehleCloser({ modus: 'reihum', closer: [A, B], antworten: { budget: 'über 20.000 €' }, regeln, frei: new Set(['ua']) });
  assert.equal(w2.user_id, 'ua'); assert.match(w2.grund, /niemand frei, ganzes Team/);
  assert.equal(waehleCloser({ modus: 'reihum', closer: [A, B], antworten: { budget: 'noch offen' }, regeln }).user_id, 'ua');
});

test('Closer ohne Personal-Eintrag zaehlt bei Belegung 0, wird aber bei Online-Buchung nie frei', () => {
  assert.equal(waehleCloser({ modus: 'freie_zeit', closer: [A, Z], minuten: new Map([['ma', 60]]) }).user_id, 'uz');
  assert.equal(istFrei(Z.mitarbeiter_id, d('2026-10-20T08:00:00Z'), d('2026-10-20T09:00:00Z'), []), false);
});

test('Online-Buchung: Zuteilung stoert nie, Rueckfall ohne Closer, Glocke nur bei Erfolg', () => {
  const r = lies('app/api/oeffentlich/buchung/route.ts');
  assert.match(r, /const zuteilung = mitarbeiterId \? null : await closerFuerOnlineTermin\(/, 'Kundenwahl hat Vorrang');
  assert.match(r, /if \(insErr && zuteilung\) \{\s*\(\{ error: insErr \} = await db\.from\('termine'\)\.insert\(\{ \.\.\.terminZeile/);
  assert.ok(r.indexOf('if (insErr) throw insErr;') < r.indexOf('await glockeNeuerTermin('));
  const sv = lies('lib/terminVerteilungServer.ts');
  assert.match(sv, /\} catch \{\s*return null;\s*\}/);
  assert.match(sv, /\.includes\(artId\)/, 'nur markierte Terminarten');
  for (const q of sv.match(/db\.from\('(termine|hr_abwesenheiten|vk_uebergabe|vk_funktion|mitarbeiter|vk_verteilung)'\)[^;]*/g)) {
    assert.match(q, /\.eq\('owner_user_id', ownerId\)/, 'jede Abfrage hart auf den Betrieb: ' + q.slice(0, 60));
  }
});

test('SQL p409 additiv', () => {
  const s = lies('supabase-sql/p409-termin-verteilung.sql');
  assert.match(s, /owner_user_id uuid not null unique/);
  assert.match(s, /add column if not exists verteilt_grund text/);
  assert.doesNotMatch(s, /\bdrop table\b|\btruncate\b|\bdelete from\b/i);
});

test('Teil 2 Uebertragen: Login zuerst, Aendern nur mit Nutzer-Rechten, Ziel muss frei sein, Glocke danach', () => {
  const r = lies('app/api/termin-uebertragen/route.ts');
  const i = r.indexOf('const absage = await nurAngemeldet();');
  assert.ok(i > 0 && i < r.indexOf('await req.json()'));
  assert.match(r, /await sb\.from\('termine'\)\.update\(\{ mitarbeiter_id: anId \}\)/, 'Aendern ueber die Anmeldung (RLS)');
  assert.doesNotMatch(r, /db\.from\('termine'\)\.update/, 'nie mit der Dienst-Rolle aendern');
  for (const q of r.match(/db\.from\('(mitarbeiter|termine|hr_abwesenheiten)'\)[^;]*/g)) assert.match(q, /\.eq\('owner_user_id', termin\.owner_user_id\)/, q.slice(0, 50));
  assert.ok(r.indexOf('if (!istFrei(') < r.indexOf(".update({ mitarbeiter_id: anId })"));
  assert.ok(r.indexOf(".update({ mitarbeiter_id: anId })") < r.indexOf('await glockeNeuerTermin('));
});

test('Teil 2 Termine-Seite: Grund in eigener Abfrage (Liste bleibt ohne SQL voll), Filter je Person', () => {
  const p = lies('app/dashboard/termine/page.tsx');
  assert.match(p, /kontakt_id, mitarbeiter_id"/);
  assert.doesNotMatch(p.slice(p.indexOf('.from("termine")'), p.indexOf('.from("termine")') + 300), /verteilt_grund/, 'Hauptabfrage ohne neue Spalte');
  assert.match(p, /select\("id, verteilt_grund"\)/);
  assert.match(p, /werFilter === "ohne" \? !!t\.mitarbeiter_id : werFilter && t\.mitarbeiter_id !== werFilter/);
});
