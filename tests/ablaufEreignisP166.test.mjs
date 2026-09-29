// Paket 166 (28.09.2026) — Abläufe: Auslöser „Ereignis" (Warteschlange aus der
// Datenbank, Motor stündlich), Webhook von außen gestrichen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pruefeAblauf, AUSLOESER_ARTEN, EREIGNISSE, ereignisDef } from '../out/ablauf.js';
import {
  massenanlage, ereignisZuAlt, passendeAblaeufe, ereignisTrifft, laufbereit, ausloeserZiel,
  MASSEN_ANZAHL, MASSEN_FENSTER_MIN, EREIGNIS_MAX_STUNDEN,
} from '../out/ablaufMotor.js';
import { aktionenFuer, neuerAusloeser } from '../out/ablaufEditor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-09-28T12:00:00Z');
const OWNER = 'o1';
const ev = (i, min, extra = {}) => ({ id: 'e' + i, owner_user_id: OWNER, ereignis: 'kontakt_angelegt', tabelle: 'kontakte', ziel_id: 'z' + i, erstellt_am: new Date(JETZT.getTime() - min * 60000).toISOString(), ...extra });
const AUFGABE = [{ id: 'a', typ: 'aktion', aktion: 'aufgabe_anlegen', config: { titel: 'Neuen Kunden anrufen' } }];

test('Ereignis ist einschaltbar, Webhook von außen ist gestrichen', () => {
  assert.equal(AUSLOESER_ARTEN.find((a) => a.art === 'ereignis').imMotor, true);
  assert.equal(AUSLOESER_ARTEN.some((a) => a.art === 'webhook'), false, 'Webhook wird nicht mehr angeboten');
  const a = { name: 'Neukunde', ausloeser: neuerAusloeser('ereignis'), schritte: AUFGABE, aktiv: true };
  assert.equal(laufbereit(a), true);
  const hook = pruefeAblauf({ ...a, ausloeser: { art: 'webhook' } });
  assert.equal(hook.aktivierbar, false);
  assert.match(hook.fehler.join(), /gestrichen/);
});

test('Aktionen passen zum Ereignis (Mahnstufe nur bei Rechnungen)', () => {
  const kontakt = aktionenFuer({ art: 'ereignis', ereignis: 'kontakt_angelegt' }).map((x) => x.key);
  const rechnung = aktionenFuer({ art: 'ereignis', ereignis: 'rechnung_angelegt' }).map((x) => x.key);
  assert.ok(!kontakt.includes('mahnstufe_erhoehen'));
  assert.ok(rechnung.includes('mahnstufe_erhoehen'));
  const p = pruefeAblauf({ name: 'x', ausloeser: { art: 'ereignis', ereignis: 'kontakt_angelegt' }, schritte: [
    { id: 'f', typ: 'aktion', aktion: 'freigabe_chef', config: {} }, { id: 'm', typ: 'aktion', aktion: 'mahnstufe_erhoehen', config: {} }] });
  assert.match(p.fehler.join(), /passt nicht zu diesem Auslöser/);
});

test('Ziel je Ereignis und Katalog vollständig', () => {
  for (const e of EREIGNISSE) {
    assert.deepEqual(ausloeserZiel({ art: 'ereignis', ereignis: e.key }), { tabelle: e.tabelle, zielTyp: e.zielTyp, datumFeld: '' });
    assert.equal(ereignisDef(e.key), e);
  }
});

test('zu alte Ereignisse starten nichts', () => {
  assert.equal(ereignisZuAlt(ev(1, 60), JETZT), false);
  assert.equal(ereignisZuAlt(ev(1, EREIGNIS_MAX_STUNDEN * 60 + 1), JETZT), true);
  assert.equal(ereignisZuAlt({ erstellt_am: 'kaputt' }, JETZT), true);
});

test('Massenanlage (Import): viele gleiche Ereignisse in wenigen Minuten starten keinen Ablauf', () => {
  const viele = Array.from({ length: MASSEN_ANZAHL }, (_, i) => ev(i, i * 0.1));
  assert.equal(massenanlage(viele).size, MASSEN_ANZAHL);
  const knapp = viele.slice(0, MASSEN_ANZAHL - 1);
  assert.equal(massenanlage(knapp).size, 0, 'knapp darunter: normal');
  const verteilt = Array.from({ length: MASSEN_ANZAHL }, (_, i) => ev(i, i * (MASSEN_FENSTER_MIN + 1)));
  assert.equal(massenanlage(verteilt).size, 0, 'über den Tag verteilt: normal');
  const gemischt = [...viele.map((e) => ({ ...e, owner_user_id: 'o2', id: 'x' + e.id })), ev(99, 3)];
  const m = massenanlage(gemischt);
  assert.equal(m.has('e99'), false, 'anderer Betrieb bleibt unberührt');
});

test('passende Abläufe: gleicher Betrieb, gleiches Ereignis, Tabelle muss passen', () => {
  const ab = [
    { id: 'a1', owner_user_id: OWNER, name: 'A', ausloeser: { art: 'ereignis', ereignis: 'kontakt_angelegt' }, schritte: AUFGABE },
    { id: 'a2', owner_user_id: 'fremd', name: 'B', ausloeser: { art: 'ereignis', ereignis: 'kontakt_angelegt' }, schritte: AUFGABE },
    { id: 'a3', owner_user_id: OWNER, name: 'C', ausloeser: { art: 'ereignis', ereignis: 'lead_eingegangen' }, schritte: AUFGABE },
    { id: 'a4', owner_user_id: OWNER, name: 'D', ausloeser: { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 1 }, schritte: AUFGABE },
  ];
  assert.deepEqual(passendeAblaeufe(ev(1, 1), ab).map((a) => a.id), ['a1']);
  assert.deepEqual(passendeAblaeufe(ev(1, 1, { tabelle: 'rechnungen' }), ab), [], 'Tabelle passt nicht zum Ereignis');
});

test('Start-Bedingung des Ereignisses', () => {
  const a = { art: 'ereignis', ereignis: 'kontakt_angelegt', filter: { verknuepfung: 'und', regeln: [{ feld: 'ort', operator: 'gleich', wert: 'Böblingen' }] } };
  assert.equal(ereignisTrifft(a, { ort: 'Böblingen' }), true);
  assert.equal(ereignisTrifft(a, { ort: 'Stuttgart' }), false);
  assert.equal(ereignisTrifft({ art: 'ereignis', ereignis: 'kontakt_angelegt' }, {}), true);
});

// ---------- SQL p166 ----------
const SQL = lies('supabase-sql/p166-ablauf-ereignisse.sql');
const ohneKommentar = SQL.split('\n').filter((z) => !z.trim().startsWith('--')).join('\n');

test('SQL: Trigger NACH dem Speichern, exception-sicher, nur mit eingeschaltetem Ablauf', () => {
  const i = SQL.indexOf('function public.ablauf_ereignis_melden()');
  const f = SQL.slice(i, SQL.indexOf('$$;', i));
  assert.match(f, /exception when others then/);
  assert.match(f, /a\.aktiv = true\s+and a\.ausloeser ->> 'art' = 'ereignis' and a\.ausloeser ->> 'ereignis' = v_key/);
  assert.match(f, /coalesce\(v_neu ->> 'status', ''\) <> 'archiv'/, 'Archiv-Angebote (Umzug) lösen nichts aus');
  assert.ok(!/\bnew\.\w+\s*:=/.test(f), 'der Trigger ändert nie den Datensatz');
  assert.ok(!/create trigger p166_ablauf_ereignis before/i.test(ohneKommentar));
  assert.ok(!/drop table|drop column|delete from|truncate/i.test(ohneKommentar));
  for (const e of EREIGNISSE) assert.ok(f.includes(`'${e.key}'`), e.key + ' fehlt im Trigger');
});

test('Cron: Warteschlange mit Anspruch, Massenanlage und Deckel vor dem Start', () => {
  const cron = lies('app/api/cron/ablaeufe/route.ts');
  const iMasse = cron.indexOf('if (masse.has(e.id))');
  const iAnspruch = cron.indexOf(".is('verarbeitet_am', null).select('id')");
  const iDeckel = cron.indexOf('freieStarts(count ?? 0) <= 0');
  const iStart = cron.indexOf("`Gestartet: Ereignis ${e.ereignis}`");
  assert.ok(iMasse > 0 && iAnspruch > iMasse && iDeckel > iAnspruch && iStart > iDeckel);
  assert.match(cron, /ereignisZuAlt\(e, jetzt\)/);
  assert.match(cron, /const ereignisse = evFehler \? \[\] :/, 'ohne SQL läuft der Motor weiter');
});
