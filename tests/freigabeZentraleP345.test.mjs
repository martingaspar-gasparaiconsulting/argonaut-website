// ============================================================================
// tests/freigabeZentraleP345.test.mjs — Paket 345 (12.10.2026)
// A0 Freigabe-Zentrale Teil 1: Katalog vollständig, Stand je Schalter (seit
// Paket 346: Freigabe in der Datenbank = „freigegeben", wirksam), Freigabe nur mit Vermerk, Ausblenden in drei Schritten, Zugang nur
// Betreiber mit bestätigtem zweiten Faktor, SQL ohne Nutzer-Rechte.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  alleSchalter, zeilenMitStand, uebersicht, freigebenPruefen, ausblendenBereit, slug, START_INFO, IMPORT_INFO, MIN_VERMERK,
} from '../out/freigabeZentrale.js';
import { START_FREIGABE } from '../out/startSperre.js';
import { ANWALT_FREIGABE } from '../out/anwaltFreigabe.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const V = 'Anwalt-Antwort zu R53 vom 20.11. liegt im Ordner ANWALT-RECHT';

test('Katalog: jeder Start-Schalter und jede Import-Sperre hat Titel und Anwalt-Frage', () => {
  for (const k of Object.keys(START_FREIGABE)) {
    assert.ok(START_INFO[k]?.titel && START_INFO[k]?.anwalt, `START_INFO.${k} fehlt`);
  }
  for (const k of Object.keys(ANWALT_FREIGABE)) assert.ok(IMPORT_INFO[k]?.titel, `IMPORT_INFO.${k} fehlt`);
  const s = alleSchalter();
  assert.equal(new Set(s.map((x) => x.schluessel)).size, s.length, 'Schlüssel eindeutig');
  assert.equal(s.filter((x) => x.schaltbar).length, Object.keys(START_FREIGABE).length + Object.keys(ANWALT_FREIGABE).length);
  for (const x of s) assert.match(x.schluessel, /^[a-zA-Z]+\.[a-zA-Z_]+$/, 'passt zum CHECK der Tabelle: ' + x.schluessel);
  assert.ok(s.some((x) => x.schluessel === 'kasse.modus' && !x.schaltbar && x.hinweis));
  assert.equal(slug('Recht, Steuern & Finanzen'), 'rechtSteuernFinanzen');
  assert.equal(slug('Gesundheit & Wellness'), 'gesundheitWellness');
});

test('Stand: Freigabe in der Datenbank = freigegeben (wirksam seit P346), Code-Schalter bleibt aus', () => {
  const db = [
    { schluessel: 'startSperre.shop', an: true, vermerk: V, anwalt_frage: 'R53', anwalt_antwort_datum: '2026-11-20', ausgeblendet: false, geaendert_am: null },
    { schluessel: 'startSperre.fernhilfe', an: false, vermerk: null, anwalt_frage: null, anwalt_antwort_datum: null, ausgeblendet: true, geaendert_am: null },
    { schluessel: 'gibtEsNicht.mehr', an: true, vermerk: V, anwalt_frage: null, anwalt_antwort_datum: '2026-11-20', ausgeblendet: false, geaendert_am: null },
  ];
  const z = zeilenMitStand(db);
  assert.equal(z.find((x) => x.schluessel === 'startSperre.shop').stand, 'freigegeben');
  assert.equal(z.find((x) => x.schluessel === 'startSperre.fernhilfe').stand, 'aus');
  assert.equal(z.find((x) => x.schluessel === 'startSperre.fernhilfe').ausgeblendet, true);
  assert.ok(!z.some((x) => x.schluessel === 'gibtEsNicht.mehr'), 'unbekannte Zeilen fallen weg');
  assert.equal(z.find((x) => x.schluessel === 'kasse.modus').stand, 'info');
  const u = uebersicht(z);
  assert.equal(u.freigegeben, 1); assert.equal(u.an, 0); assert.equal(u.ausgeblendet, 1);
  // der Schalter im Code bleibt unberührt — wirksam wird die Freigabe über lib/freigabeStand
  assert.equal(START_FREIGABE.shop, false);
});

test('Freigeben nur mit Vermerk, Anwalt-Datum, nicht in der Zukunft, nur schaltbare', () => {
  const ok = { schluessel: 'startSperre.shop', vermerk: V, anwalt_frage: 'R53', anwalt_antwort_datum: '2026-11-20', mitgezogen: true };
  assert.deepEqual(freigebenPruefen(ok, '2026-11-21'), []);
  assert.match(freigebenPruefen({ ...ok, mitgezogen: false }, '2026-11-21').join(' '), /Mitziehen/, 'P346: Haken Pflicht');
  assert.match(freigebenPruefen({ ...ok, mitgezogen: undefined }, '2026-11-21').join(' '), /Mitziehen/);
  assert.match(freigebenPruefen({ ...ok, vermerk: 'x'.repeat(MIN_VERMERK - 1) }, '2026-11-21').join(' '), /mindestens 20/);
  assert.match(freigebenPruefen({ ...ok, vermerk: '   ' + 'x'.repeat(10) + '            ' }, '2026-11-21').join(' '), /mindestens/, 'Leerzeichen zählen nicht');
  assert.match(freigebenPruefen({ ...ok, anwalt_antwort_datum: '' }, '2026-11-21').join(' '), /Datum/);
  assert.match(freigebenPruefen(ok, '2026-11-19').join(' '), /Zukunft/);
  assert.match(freigebenPruefen({ ...ok, schluessel: 'kasse.modus' }, '2026-11-21').join(' '), /nicht hier freigegeben/);
  assert.match(freigebenPruefen({ ...ok, schluessel: 'startSperre.gibtsNicht' }, '2026-11-21').join(' '), /gibt es nicht/);
});

test('Ausblenden: erst nach Klick, Rückfrage UND exakt getipptem Namen', () => {
  const t = 'Webshop der Betriebe';
  assert.equal(ausblendenBereit({ geklickt: true, bestaetigt: true, getippt: t }, t), true);
  assert.equal(ausblendenBereit({ geklickt: true, bestaetigt: false, getippt: t }, t), false);
  assert.equal(ausblendenBereit({ geklickt: false, bestaetigt: true, getippt: t }, t), false);
  assert.equal(ausblendenBereit({ geklickt: true, bestaetigt: true, getippt: 'Webshop' }, t), false);
  assert.equal(ausblendenBereit({ geklickt: true, bestaetigt: true, getippt: '' }, ''), false);
});

test('Route: Betreiber-Doppelschloss UND bestätigter zweiter Faktor, Name am Server geprüft', () => {
  const r = lies('app/api/admin/freigaben/route.ts');
  assert.match(r, /betreiberPruefung\(\)/);
  assert.match(r, /!stand\.hatFaktor \|\| stand\.aal !== 'aal2'/);
  assert.equal((r.match(/await pruefen\(\)/g) ?? []).length, 2, 'GET und POST');
  assert.match(r, /String\(body\.getippt \?\? ''\)\.trim\(\) !== s\.titel\.trim\(\)/);
  assert.match(r, /freigebenPruefen\(e, heute\(\)\)/);
  assert.doesNotMatch(r, /\.delete\(/, 'nichts wird gelöscht');
});

test('SQL p345: keine Rechte für Nutzer, Freigabe nur mit Vermerk, Protokoll fest', () => {
  const sql = lies('supabase-sql/p345-freigabe-zentrale.sql');
  assert.match(sql, /revoke all on public\.freigabe_schalter from anon, authenticated/);
  assert.match(sql, /revoke all on public\.freigabe_protokoll from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/, 'keine Regel = kein Zugriff für Nutzer');
  assert.match(sql, /an = false or \(vermerk is not null and char_length\(trim\(vermerk\)\) >= 20 and anwalt_antwort_datum is not null\)/);
  assert.match(sql, /before update or delete on public\.freigabe_protokoll/);
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\btruncate\b/i);
});

test('Command Center verlinkt, Sperr-Gedächtnis erklärt die Freigabe', () => {
  assert.match(lies('app/admin/command-center/page.tsx'), /href: '\/admin\/command-center\/freigaben'/);
  const g = lies('docs/ARGONAUT-SPERR-GEDAECHTNIS.md');
  assert.match(g, /Freigabe-Zentrale im Command Center/);
  assert.match(g, /Seit Paket 346 wirkt eine Freigabe/);
  assert.match(g, /Jeder Fehler = gesperrt/);
});
