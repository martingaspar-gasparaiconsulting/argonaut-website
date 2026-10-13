// ============================================================================
// tests/bewachungDienstP354.test.mjs — Paket 354 (13.10.2026)
// A4b Fachpaket Bewachung, Teil 2: Pflichtangaben, Nachweise § 34a GewO,
// Dienstplan je Objekt mit Warnung bei fehlendem Nachweis.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  angabenLesen, angabenPruefen, angabenVollstaendig, OBJEKT_ANFORDERUNGEN, nachweisFehlt, bewacherId, nachweisStand,
  berlinZuIso, dienstZeit, dienstKonflikt, wochenMontag, wochenPlan, stundenJePerson, dienstplanHtml, nachweisHtml, EINSTELLUNG_MODUL,
} from '../out/bewachung.js';
import { QUALIFIKATIONEN, qualiLabel } from '../out/dispoPlus.js';
import { qualiSchluessel } from '../out/importParser.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const HEUTE = '2026-10-13';
const VOLL = { erlaubnis_nr: 'GA-34a-123', erlaubnis_behoerde: 'Stadt Böblingen', erlaubnis_datum: '2020-05-01', register_nr: 'BR-0815' };

test('Pflichtangaben: lesen (Fremdes fällt weg), Pflichtfelder, Datum', () => {
  assert.deepEqual(angabenLesen(null), { erlaubnis_nr: '', erlaubnis_behoerde: '', erlaubnis_datum: '', register_nr: '' });
  assert.deepEqual(angabenLesen({ ...VOLL, boese: 'x', erlaubnis_nr: '  GA-34a-123 ' }), VOLL);
  assert.equal(angabenLesen({ erlaubnis_datum: 'gestern' }).erlaubnis_datum, '');
  assert.equal(angabenLesen({ erlaubnis_nr: 5 }).erlaubnis_nr, '');
  assert.deepEqual(angabenPruefen(VOLL, HEUTE), { ok: true });
  assert.equal(angabenPruefen({ ...VOLL, erlaubnis_nr: ' ' }, HEUTE).ok, false);
  assert.equal(angabenPruefen({ ...VOLL, register_nr: '' }, HEUTE).ok, false);
  assert.equal(angabenPruefen({ ...VOLL, erlaubnis_datum: '2026-10-14' }, HEUTE).ok, false);
  assert.deepEqual(angabenPruefen({ ...VOLL, erlaubnis_behoerde: '', erlaubnis_datum: '' }, HEUTE), { ok: true }, 'Behörde und Datum freiwillig');
  assert.equal(angabenVollstaendig(VOLL), true);
  assert.equal(angabenVollstaendig({ ...VOLL, register_nr: '' }), false);
  assert.equal(EINSTELLUNG_MODUL, 'bewachung');
});

test('Katalog: drei neue Nachweise in der Dispo, Import erkennt sie, alte Zuordnungen unverändert', () => {
  const keys = QUALIFIKATIONEN.map((q) => q.key);
  for (const k of ['unterrichtung_34a', 'sachkunde_34a', 'bewacherregister']) assert.ok(keys.includes(k), k);
  for (const k of OBJEKT_ANFORDERUNGEN) assert.ok(keys.includes(k), k + ' muss in der Dispo bekannt sein');
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(qualiSchluessel('Sachkundeprüfung § 34a GewO'), 'sachkunde_34a');
  assert.equal(qualiSchluessel('§34a Sachkunde (IHK)'), 'sachkunde_34a');
  assert.equal(qualiSchluessel('Unterrichtung nach § 34a'), 'unterrichtung_34a');
  assert.equal(qualiSchluessel('Unterrichtung Bewachungsgewerbe'), 'unterrichtung_34a');
  assert.equal(qualiSchluessel('34a'), 'unterrichtung_34a');
  assert.equal(qualiSchluessel('Bewacher-ID'), 'bewacherregister');
  assert.equal(qualiSchluessel('Unterrichtung Gefahrstoffe'), null, 'nicht jede Unterrichtung ist § 34a');
  assert.equal(qualiSchluessel('Kältemittel-Sachkunde Kat. I'), 'kaeltemittel', 'alte Zuordnung bleibt');
  assert.equal(qualiSchluessel('Asbest-Sachkunde TRGS 519'), 'asbest');
});

test('SQL-Liste der Objekt-Vorgaben = Liste im Code', () => {
  const sql = lies('supabase-sql/p354-bewachung-dienstplan.sql');
  const m = sql.match(/anforderungen <@ array\[([^\]]+)\]/);
  assert.ok(m);
  assert.deepEqual([...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]), [...OBJEKT_ANFORDERUNGEN]);
});

const Q = [
  { mitarbeiter_id: 'm1', art: 'unterrichtung_34a', gueltig_bis: null },
  { mitarbeiter_id: 'm1', art: 'bewacherregister', gueltig_bis: null, nachweis: ' BW-4711 ' },
  { mitarbeiter_id: 'm2', art: 'sachkunde_34a', gueltig_bis: null },
  { mitarbeiter_id: 'm2', art: 'bewacherregister', gueltig_bis: null, nachweis: 'BW-1' },
  { mitarbeiter_id: 'm2', art: 'erste_hilfe', gueltig_bis: '2026-10-12' },
  { mitarbeiter_id: 'm3', art: 'unterrichtung_34a', gueltig_bis: null },
];

test('Nachweis-Prüfung: Grundpflicht, Sachkunde ersetzt Unterrichtung, Objekt-Vorgaben, Ablauf', () => {
  assert.deepEqual(nachweisFehlt(Q, 'm1', [], HEUTE), []);
  assert.deepEqual(nachweisFehlt(Q, 'm2', [], HEUTE), [], 'Sachkunde ersetzt die Unterrichtung');
  assert.deepEqual(nachweisFehlt(Q, 'm3', [], HEUTE), [qualiLabel('bewacherregister')]);
  assert.deepEqual(nachweisFehlt(Q, 'mx', [], HEUTE), [`${qualiLabel('unterrichtung_34a')} oder ${qualiLabel('sachkunde_34a')}`, qualiLabel('bewacherregister')]);
  assert.deepEqual(nachweisFehlt(Q, 'm1', ['sachkunde_34a'], HEUTE), [qualiLabel('sachkunde_34a')], 'Unterrichtung reicht nicht, wenn Sachkunde verlangt');
  assert.deepEqual(nachweisFehlt(Q, 'm2', ['sachkunde_34a'], HEUTE), []);
  assert.deepEqual(nachweisFehlt(Q, 'm2', ['erste_hilfe'], HEUTE), [qualiLabel('erste_hilfe')], 'abgelaufen zählt nicht');
  assert.deepEqual(nachweisFehlt(Q, 'm2', ['erste_hilfe'], '2026-10-12'), [], 'am Ablauftag noch gültig');
  assert.deepEqual(nachweisFehlt([{ mitarbeiter_id: 'm9', art: 'sachkunde_34a', gueltig_bis: '2026-01-01' }, { mitarbeiter_id: 'm9', art: 'bewacherregister' }], 'm9', [], HEUTE).length, 1);
  assert.equal(bewacherId(Q, 'm1'), 'BW-4711');
  assert.equal(bewacherId(Q, 'm3'), null);
  assert.deepEqual(nachweisStand(Q, 'm2', HEUTE), { ok: true, fehlt: [], bewacherId: 'BW-1' });
});

test('Zeit: Berliner Ortszeit → UTC (Sommer, Winter, Umstellung), Dienst über Mitternacht, max. 24 Std.', () => {
  assert.equal(berlinZuIso('2026-07-01', '12:00'), '2026-07-01T10:00:00.000Z');
  assert.equal(berlinZuIso('2026-12-01', '12:00'), '2026-12-01T11:00:00.000Z');
  assert.equal(berlinZuIso('2026-10-25', '04:00'), '2026-10-25T03:00:00.000Z', 'nach Zeitumstellung Winterzeit');
  assert.equal(berlinZuIso('2026-10-25', '01:00'), '2026-10-24T23:00:00.000Z', 'vor Zeitumstellung Sommerzeit');
  assert.equal(berlinZuIso('2026-10-25', '24:00'), null);
  assert.equal(berlinZuIso('25.10.2026', '04:00'), null);
  const nacht = dienstZeit('2026-10-24', '22:00', '06:00');
  assert.deepEqual(nacht, { ok: true, beginn: '2026-10-24T20:00:00.000Z', ende: '2026-10-25T05:00:00.000Z', stunden: 9 }, 'Umstellungsnacht hat eine Stunde mehr');
  assert.equal(dienstZeit('2026-10-14', '08:00', '16:30').stunden, 8.5);
  assert.equal(dienstZeit('2026-10-14', '08:00', '08:00').stunden, 24, 'gleich = 24 Std. über Mitternacht');
  assert.equal(dienstZeit('2026-10-14', '', '08:00').ok, false);
});

const D = (id, ma, b, e, extra = {}) => ({ id, objekt_id: 'o1', mitarbeiter_id: ma, mitarbeiter_name: ma === 'm1' ? 'Willi Wache' : 'Petra Posten', beginn: b, ende: e, aufgabe: 'Objektschutz', notiz: null, status: 'geplant', trotz_warnung: false, warnung_text: null, ...extra });

test('Dienste: Konflikt halb-offen wie die Datenbank, abgesagte zählen nicht; Woche, Stunden', () => {
  const liste = [D('d1', 'm1', '2026-10-14T16:00:00Z', '2026-10-15T00:00:00Z'), D('d2', 'm1', '2026-10-15T08:00:00Z', '2026-10-15T10:00:00Z', { status: 'abgesagt' })];
  assert.equal(dienstKonflikt(liste, 'm1', '2026-10-14T23:00:00Z', '2026-10-15T02:00:00Z')?.id, 'd1');
  assert.equal(dienstKonflikt(liste, 'm1', '2026-10-15T00:00:00Z', '2026-10-15T02:00:00Z'), null, 'direkt anschließend erlaubt');
  assert.equal(dienstKonflikt(liste, 'm1', '2026-10-15T08:00:00Z', '2026-10-15T09:00:00Z'), null, 'abgesagt gibt frei');
  assert.equal(dienstKonflikt(liste, 'm2', '2026-10-14T23:00:00Z', '2026-10-15T02:00:00Z'), null, 'andere Person');
  assert.equal(dienstKonflikt(liste, 'm1', '2026-10-14T23:00:00Z', '2026-10-15T02:00:00Z', 'd1'), null, 'sich selbst nicht');
  assert.equal(wochenMontag('2026-10-13'), '2026-10-12');
  assert.equal(wochenMontag('2026-10-18'), '2026-10-12', 'Sonntag gehört zur Woche davor');
  assert.equal(wochenMontag('2026-10-12'), '2026-10-12');
  const plan = wochenPlan([...liste, D('d3', 'm2', '2026-10-12T22:30:00Z', '2026-10-13T05:00:00Z')], '2026-10-12');
  assert.equal(plan.length, 7);
  assert.deepEqual(plan[1].dienste.map((d) => d.id), ['d3'], '00:30 Berlin am Dienstag');
  assert.deepEqual(plan[2].dienste.map((d) => d.id), ['d1']);
  assert.equal(plan[3].dienste.length, 0, 'abgesagt nicht im Plan');
  assert.equal(wochenPlan(liste, '2026-10-12', true)[3].dienste.length, 1);
  assert.deepEqual(stundenJePerson(liste), [{ name: 'Willi Wache', stunden: 8 }]);
});

test('Druck: Dienstplan mit Pflichtangaben, fehlende Angaben rot; Nachweis mit Angaben', () => {
  const html = dienstplanHtml({ bezeichnung: 'Lager <Müller>', adresse: null }, '2026-10-12', [D('d1', 'm1', '2026-10-14T16:00:00Z', '2026-10-15T00:00:00Z')], null, VOLL);
  assert.ok(html.includes('Erlaubnis nach § 34a GewO: GA-34a-123') && html.includes('Bewacherregister: BR-0815'));
  assert.ok(html.includes('18:00–02:00 (+1)'));
  assert.ok(html.includes('Lager &lt;Müller&gt;'));
  assert.ok(html.includes('Willi Wache 8 Std.'));
  assert.match(dienstplanHtml({ bezeichnung: 'X', adresse: null }, '2026-10-12', [], null, null), /fehlen — Bewachung/);
  const n = nachweisHtml({ objekt: { bezeichnung: 'X', adresse: null }, von: HEUTE, bis: HEUTE, erstellt: '2026-10-13T12:00:00Z', rundgaenge: [], punkte: [], scans: [], eintraege: [], mitWachbuch: false, angaben: VOLL }, null);
  assert.ok(n.includes('Bewacherregister: BR-0815'));
  const ohne = nachweisHtml({ objekt: { bezeichnung: 'X', adresse: null }, von: HEUTE, bis: HEUTE, erstellt: '2026-10-13T12:00:00Z', rundgaenge: [], punkte: [], scans: [], eintraege: [], mitWachbuch: false }, null);
  assert.ok(!ohne.includes('Bewacherregister'), 'ohne angaben-Feld keine Zeile (alte Aufrufe)');
});

test('SQL p354: additiv, Doppelbuchung gesperrt, max. 24 Std., abgesagt bleibt abgesagt, Rechte, Kontrolle', () => {
  const sql = lies('supabase-sql/p354-bewachung-dienstplan.sql');
  assert.match(sql, /create extension if not exists btree_gist with schema extensions;/);
  assert.match(sql, /exclude using gist \(mitarbeiter_id with =, zeitraum with &&\) where \(status = 'geplant'\)/);
  assert.match(sql, /tstzrange\(beginn, ende, '\[\)'\)/);
  assert.match(sql, /ende - beginn <= interval '24 hours'/);
  assert.match(sql, /if old\.status = 'abgesagt' then raise exception/);
  assert.match(sql, /from public\.mitarbeiter m where m\.id = new\.mitarbeiter_id and m\.owner_user_id = new\.owner_user_id/);
  assert.match(sql, /new\.mitarbeiter_name := coalesce\(v_name, 'ohne Namen'\)/);
  assert.match(sql, /darf_ich_modul_aendern\(''bewachung''\)/);
  assert.ok(!/policy p354_ma_delete/.test(sql), 'Mitarbeiter löschen nicht');
  assert.match(sql, /tabellen = 2 \| regeln = 8 \| ausloeser = 4 \| rls_an = 2 \| sperre = 1/);
  assert.ok(!/\bdrop table\b|\btruncate\b|\bdelete from\b|on delete cascade/i.test(sql));
});

test('Quelltext: Reiter, Warnung mit Bestätigung, Pflichtangaben-Hinweis, Sicherung, Guide', () => {
  const seite = lies('app/dashboard/bewachung/page.tsx');
  assert.match(seite, /setReiter\('plan'\)/);
  assert.match(seite, /setReiter\('betrieb'\)/);
  assert.match(seite, /!angabenVollstaendig\(angaben\)/);
  const plan = ohneKommentar(lies('app/dashboard/bewachung/Dienstplan.tsx'));
  assert.match(plan, /if \(fehlt\.length && !trotz\)/, 'ohne Bestätigung kein Einplanen bei fehlendem Nachweis');
  assert.match(plan, /trotz_warnung: fehlt\.length > 0/);
  assert.ok(!/\.delete\(/.test(plan), 'absagen statt löschen');
  const betr = ohneKommentar(lies('app/dashboard/bewachung/BetriebNachweise.tsx'));
  assert.match(betr, /onConflict: 'owner_user_id,modul'/);
  assert.match(betr, /onConflict: 'mitarbeiter_id,art'/);
  assert.match(betr, /angabenPruefen\(a, heute\)/);
  assert.match(lies('app/dashboard/bewachung/bewachungUi.tsx'), /exclusion constraint\|keine_ueberschneidung/);
  assert.match(lies('lib/sicherungTabellen.ts'), /'wach_dienst', 'wach_objekt_vorgabe'/);
  assert.match(lies('lib/guideWissen.ts'), /Reiter „📅 Dienstplan"/);
  for (const f of ['Dienstplan.tsx', 'BetriebNachweise.tsx']) {
    const q = ohneKommentar(lies('app/dashboard/bewachung/' + f));
    assert.ok(!/\b(du|dein|deine|dich|dir)\b/i.test(q), f + ' duzt nicht');
  }
});
