// ============================================================================
// tests/sammelpaketP187.test.mjs — Paket 187a: Sammelpaket Logik-Fehler.
//   Prüf-Fälligkeiten (Tag-Versatz, Monatsüberlauf), Abo-Daten, ELSTER-Monat,
//   MRR aus echten Abos, Rechnungs-Knöpfe nur mit „Darf abrechnen",
//   Import überschreibt keine Filialbestände/Standardwerte, Vereine nicht
//   mehr „Studio", WhatsApp-Kontakte mit Modulrecht, Beispieldaten auf
//   example.com, Test-Mailstrecke ab Freischaltung.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { naechsteFaelligkeit } from '../out/pruefungen.js';
import { monatsGrenzeIso, plusMonate } from '../out/nachweisMotor.js';
import { mrrAusAbos, aktiveAbos, mrrHinweis } from '../out/mrr.js';
import { abrechnenKnopfZeigen } from '../out/nurGeschaeftsleitung.js';
import { gemappteFelder, werteFuerAktualisierung, werteFuerNeuanlage, artikelBestandSperren, bestandVerworfen } from '../out/importAktualisieren.js';
import { betriebIstVerein, vertragsartStandard, studioNurStandard, textNenntVerein } from '../out/vereinErkennen.js';
import { modulRechtEntscheiden, modulRechtPruefen } from '../out/modulRecht.js';
import { TEST_STEPS, naechsterPlan, schrittTermin } from '../out/dossierSequenz.js';
import { BEISPIEL_KONTAKTE, GENERISCHE_KONTAKTE } from '../out/beispielKatalog.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// ---------------------------------------------------------------------------
test('Prüf-Fälligkeit: Monatsende festgehalten, kein Vortag, Schaltjahr', () => {
  assert.equal(naechsteFaelligkeit('2026-01-31', 1), '2026-02-28');
  assert.equal(naechsteFaelligkeit('2028-01-31', 1), '2028-02-29');
  assert.equal(naechsteFaelligkeit('2026-03-15', 12), '2027-03-15');
  assert.equal(naechsteFaelligkeit('2026-10-01', 24), '2028-10-01');
  assert.equal(naechsteFaelligkeit('2026-08-31', 6), '2027-02-28');
  assert.equal(naechsteFaelligkeit('2026-05-01T00:00:00', 3), '2026-08-01');
  assert.equal(naechsteFaelligkeit('', 12), '');
  assert.equal(naechsteFaelligkeit('kaputt', 12), '');
  assert.equal(naechsteFaelligkeit('2026-02-30', 1), '');
});

test('Prüf-Fälligkeit: unabhängig von der Zeitzone des Rechners', () => {
  const alt = process.env.TZ;
  for (const tz of ['Europe/Berlin', 'America/New_York', 'Pacific/Auckland', 'UTC']) {
    process.env.TZ = tz;
    assert.equal(naechsteFaelligkeit('2026-03-01', 1), '2026-04-01', tz);
  }
  process.env.TZ = alt;
});

test('ELSTER-Monat: erster/letzter Tag ohne Überlauf, auch am 31.', () => {
  const am31 = new Date(2026, 0, 31, 0, 30); // 31.01. 00:30 Ortszeit
  assert.equal(monatsGrenzeIso(am31, 0, false), '2026-01-01');
  assert.equal(monatsGrenzeIso(am31, 0, true), '2026-01-31');
  assert.equal(monatsGrenzeIso(am31, -1, false), '2025-12-01');
  assert.equal(monatsGrenzeIso(am31, -1, true), '2025-12-31');
  assert.equal(monatsGrenzeIso(am31, 1, true), '2026-02-28');
  const maerz31 = new Date(2026, 2, 31, 23, 59);
  assert.equal(monatsGrenzeIso(maerz31, -1, true), '2026-02-28');
  assert.equal(monatsGrenzeIso(maerz31, -1, false), '2026-02-01');
});

test('Datums-Wächter: kein setMonth() mehr in den reparierten Stellen', () => {
  for (const f of [
    'lib/pruefungen.ts', 'app/api/rechnung-aus-abo/route.ts', 'app/api/admin/abo-einzug/route.ts',
    'app/dashboard/forst/page.tsx', 'app/dashboard/forst/nachweise/page.tsx', 'app/dashboard/forst/verkehrssicherung/page.tsx',
    'app/dashboard/elster/page.tsx',
  ]) {
    const s = ohneKommentare(lies(f));
    assert.doesNotMatch(s, /\.setMonth\(/, f);
  }
  assert.match(lies('app/api/rechnung-aus-abo/route.ts'), /datumPlusMonate\(tag, add\)/);
  assert.match(lies('app/api/admin/abo-einzug/route.ts'), /return datumPlusMonate\(iso, m\)/);
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
});

// ---------------------------------------------------------------------------
test('MRR: nur aktive Abos, Netto-Monatspreise, Text-Beträge gelesen', () => {
  const abos = [
    { status: 'aktiv', monatspreis_netto: 349 },
    { status: 'aktiv', monatspreis_netto: '1.234,50' },
    { status: 'neu', monatspreis_netto: 999 },
    { status: 'pausiert', monatspreis_netto: 500 },
    { status: 'AKTIV ', monatspreis_netto: 0.1 },
    { status: 'aktiv', monatspreis_netto: null },
  ];
  assert.equal(mrrAusAbos(abos), 1583.6);
  assert.equal(aktiveAbos(abos), 4);
  assert.equal(mrrAusAbos([]), 0);
  assert.equal(mrrAusAbos(null), 0);
  assert.equal(mrrHinweis(2, 5), 'aus 2 aktiven Abos (netto) · 3 aktive Kunden ohne Abo');
  assert.equal(mrrHinweis(1, 1), 'aus 1 aktiven Abo (netto)');
});

test('MRR-Wächter: keine alte Paketpreis-Liste mehr im Command Center', () => {
  for (const f of ['app/admin/page.tsx', 'app/admin/command-center/page.tsx', 'app/admin/command-center/vertraege/page.tsx']) {
    const s = ohneKommentare(lies(f));
    assert.doesNotMatch(s, /MRR_BY_PLAN|SOLO:\s*1799/, f);
    assert.match(s, /mrrAusAbos\(/, f);
    assert.match(s, /from\('kunden_abo'\)/, f);
  }
});

// ---------------------------------------------------------------------------
test('Rechnungs-Knopf: Chef ja, Mitarbeiter nur mit Recht', () => {
  assert.equal(abrechnenKnopfZeigen(null, false), true);
  assert.equal(abrechnenKnopfZeigen('', false), true);
  assert.equal(abrechnenKnopfZeigen('chef-1', true), true);
  assert.equal(abrechnenKnopfZeigen('chef-1', false), false);
  assert.equal(abrechnenKnopfZeigen('chef-1', null), false);
  assert.equal(abrechnenKnopfZeigen('chef-1', 'true'), false);
});

test('Rechnungs-Knopf-Wächter: jede Seite mit rechnung-aus-* nutzt useDarfAbrechnen', () => {
  const dateien = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(path.join(WURZEL, dir), { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) lauf(p);
      else if (p.endsWith('.tsx')) dateien.push(p);
    }
  };
  lauf('app/dashboard');
  let geprueft = 0;
  for (const f of dateien) {
    const s = ohneKommentare(lies(f));
    if (!/['"`]\/api\/rechnung-aus-|['"`]\/api\/rechnung-senden/.test(s)) continue;
    geprueft++;
    assert.match(s, /useDarfAbrechnen\(\)/, f);
    assert.match(s, /darfAbrechnen !== false|!darfAbrechnen|darfAbrechnen === false/, f);
  }
  assert.ok(geprueft >= 22, `nur ${geprueft} Seiten gefunden`);
});

// ---------------------------------------------------------------------------
test('Import aktualisieren: unzugeordnete Standardwerte bleiben weg', () => {
  const ziel = { key: 'artikel', felder: [
    { key: 'bezeichnung' }, { key: 'einkaufspreis', standard: 0 }, { key: 'verkaufspreis', standard: 0 },
    { key: 'einheit', standard: 'Stk' }, { key: 'aktueller_bestand', standard: 0 }, { key: 'mindestbestand', standard: 0 },
  ] };
  const gemappt = gemappteFelder({ Name: 'bezeichnung', Bestand: 'aktueller_bestand', Leer: '' });
  assert.deepEqual([...gemappt].sort(), ['aktueller_bestand', 'bezeichnung']);
  const werte = { bezeichnung: 'Kabel', einkaufspreis: 0, verkaufspreis: 12.5, einheit: 'Stk', aktueller_bestand: 40, mindestbestand: 0 };
  // Ohne Filialen: Bestand bleibt (zugeordnet), VK bleibt (errechnet, ≠ Standard), EK/Einheit/Mindestbestand weg
  assert.deepEqual(werteFuerAktualisierung(werte, ziel, gemappt, 0), { bezeichnung: 'Kabel', verkaufspreis: 12.5, aktueller_bestand: 40 });
  // Mit Filialen: Bestand nie über den Artikel
  assert.deepEqual(werteFuerAktualisierung(werte, ziel, gemappt, 2), { bezeichnung: 'Kabel', verkaufspreis: 12.5 });
  // Zugeordnet und 0 -> bleibt (bewusst 0)
  const g2 = gemappteFelder({ EK: 'einkaufspreis' });
  assert.equal(werteFuerAktualisierung({ einkaufspreis: 0 }, ziel, g2, 0).einkaufspreis, 0);
  // Andere Ziele: Filialregel greift nicht
  assert.equal(artikelBestandSperren('kontakte', 3), false);
  assert.equal(artikelBestandSperren('artikel', 0), false);
  assert.equal(artikelBestandSperren('artikel', 1), true);
});

test('Import neu: Filialbetrieb startet Artikel mit Bestand 0, sonst unverändert', () => {
  const ziel = { key: 'artikel', felder: [] };
  assert.deepEqual(werteFuerNeuanlage({ bezeichnung: 'A', aktueller_bestand: 7 }, ziel, 3), { bezeichnung: 'A', aktueller_bestand: 0 });
  const w = { bezeichnung: 'A', aktueller_bestand: 7 };
  assert.equal(werteFuerNeuanlage(w, ziel, 0), w);
  assert.equal(bestandVerworfen({ aktueller_bestand: 7 }), true);
  assert.equal(bestandVerworfen({ aktueller_bestand: 0 }), false);
  assert.equal(bestandVerworfen({}), false);
});

test('Import-Wächter: Seite nutzt die Aktualisierungsregel', () => {
  const s = ohneKommentare(lies('app/dashboard/import/page.tsx'));
  assert.match(s, /werte: werteFuerAktualisierung\(satz, ziel, gemappt, aktiveFilialen\)/);
  assert.match(s, /werteFuerNeuanlage\(satz, ziel, aktiveFilialen\)/);
  assert.doesNotMatch(s, /zuAendern\.push\(\{ id: treffer, werte: satz,/);
});

// ---------------------------------------------------------------------------
test('Verein erkennen: Rechtsform, Name, gebuchte Module', () => {
  for (const t of ['e. V.', 'e.V.', 'eingetragener Verein', 'TSV Musterstadt e.V.', 'Sportverein Nord', 'Förderverein (e. V.)']) assert.equal(textNenntVerein(t), true, t);
  for (const t of ['GmbH', 'Vereinigte Stahl GmbH', 'Einzelunternehmen', '', null, 'Elektro Bauer']) assert.equal(textNenntVerein(t), false, String(t));
  assert.equal(betriebIstVerein({ rechtsform: 'e. V.' }), true);
  assert.equal(betriebIstVerein({ firmaName: 'Turnverein 1880 e.V.' }), true);
  assert.equal(betriebIstVerein({ gebucht: new Set(['verein', 'mitglieder']) }), true);
  assert.equal(betriebIstVerein({ gebucht: new Set(['verein', 'wellness', 'mitglieder']) }), false);
  assert.equal(betriebIstVerein({ gebucht: null, rechtsform: 'GmbH' }), false);
  assert.equal(vertragsartStandard(true), 'verein');
  assert.equal(vertragsartStandard(false), 'studio');
});

test('Verein: nur unbearbeitete Studio-Einträge werden zum Umstellen angeboten', () => {
  assert.equal(studioNurStandard({ vertragsart: 'studio' }), true);
  assert.equal(studioNurStandard({ vertragsart: null }), true);
  assert.equal(studioNurStandard({ vertragsart: 'verein' }), false);
  assert.equal(studioNurStandard({ vertragsart: 'studio', erstlaufzeit_monate: 12 }), false);
  assert.equal(studioNurStandard({ vertragsart: 'studio', kuendigungsfrist_monate: 1 }), false);
  assert.equal(studioNurStandard({ vertragsart: 'studio', abgeschlossen_am: '2025-01-01' }), false);
  assert.equal(studioNurStandard({ vertragsart: 'studio', kuendigung_zum: '2026-12-31' }), false);
});

test('Verein-Wächter: Seiten nutzen den Betriebs-Standard statt fest „studio"', () => {
  const v = ohneKommentare(lies('app/dashboard/mitglieder/vertraege/page.tsx'));
  assert.doesNotMatch(v, /\?\? 'studio'/);
  assert.match(v, /vertragsartStandard\(istVerein\)/);
  assert.match(v, /studioNurStandard/);
  const m = ohneKommentare(lies('app/dashboard/mitglieder/page.tsx'));
  assert.match(m, /istVerein \? \{ \.\.\.payload, vertragsart: 'verein' \} : payload/);
});

// ---------------------------------------------------------------------------
test('Modulrecht: Chef alles, Mitarbeiter je Recht, fail-closed', async () => {
  assert.deepEqual(modulRechtEntscheiden(null, null, true, true, 'sehen'), { ok: false, status: 401, fehler: 'Nicht eingeloggt.' });
  assert.deepEqual(modulRechtEntscheiden('u1', null, false, false, 'aendern'), { ok: true, betrieb: 'u1', mitarbeiter: false });
  assert.equal(modulRechtEntscheiden('m1', 'c1', true, false, 'aendern').ok, false);
  assert.equal(modulRechtEntscheiden('m1', 'c1', true, false, 'sehen').ok, true);
  assert.equal(modulRechtEntscheiden('m1', 'c1', false, true, 'sehen').ok, true);
  assert.deepEqual(modulRechtEntscheiden('m1', 'c1', false, true, 'aendern'), { ok: true, betrieb: 'c1', mitarbeiter: true });
  assert.equal(modulRechtEntscheiden('m1', 'c1', false, false, 'sehen').status, 403);
  // Mit Supabase-Attrappe: Fehler beim Recht = nein
  const sb = (antworten) => ({ rpc: async (fn) => { const a = antworten[fn]; if (a instanceof Error) throw a; return a ?? { data: null }; } });
  assert.equal((await modulRechtPruefen(sb({ mein_chef_id: { data: 'c1' }, darf_ich_modul_aendern: new Error('weg') }), 'm1', 'marketing', 'aendern')).ok, false);
  assert.equal((await modulRechtPruefen(sb({ mein_chef_id: { data: 'c1' }, darf_ich_modul_aendern: { data: true } }), 'm1', 'marketing', 'aendern')).ok, true);
  assert.equal((await modulRechtPruefen(sb({ mein_chef_id: { data: 'c1' }, darf_ich_modul_aendern: { data: false }, darf_ich_modul_sehen: { data: true } }), 'm1', 'marketing', 'sehen')).ok, true);
  assert.equal((await modulRechtPruefen(sb({ mein_chef_id: { data: 'c1' }, darf_ich_modul_aendern: { data: false, error: { message: 'x' } } }), 'm1', 'marketing', 'aendern')).ok, false);
  assert.equal((await modulRechtPruefen(sb({ mein_chef_id: { data: null } }), 'u1', 'marketing', 'aendern')).ok, true);
});

test('WhatsApp-Kontakte-Wächter: GET sehen, POST/DELETE ändern (Marketing)', () => {
  const s = ohneKommentare(lies('app/api/marketing/whatsapp-kontakte/route.ts'));
  assert.match(s, /modulRechtPruefen\(supabase, user\?\.id \?\? null, 'marketing', art\)/);
  assert.match(s, /GET\(\) \{\s*const pruefung = await besitzerId\('sehen'\)/);
  assert.match(s, /POST\(req: Request\) \{\s*const pruefung = await besitzerId\('aendern'\)/);
  assert.match(s, /DELETE\(req: Request\) \{\s*const pruefung = await besitzerId\('aendern'\)/);
});

// ---------------------------------------------------------------------------
test('Beispieldaten: nur reservierte Domains (example.com), nie echte Firmen', () => {
  const mails = [];
  for (const liste of [...Object.values(BEISPIEL_KONTAKTE), GENERISCHE_KONTAKTE]) for (const k of liste) if (k.email) mails.push(k.email);
  assert.ok(mails.length >= 15);
  for (const m of mails) assert.match(m, /@([a-z0-9-]+\.)*example\.com$/, m);
  for (const f of ['lib/beispielKatalog.ts', 'lib/beispielKern.ts']) {
    const s = lies(f);
    const fremd = (s.match(/[A-Za-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []).filter((x) => !/@([a-z0-9-]+\.)*example\.com$/.test(x));
    assert.deepEqual(fremd, [], f);
  }
  const vorlagen = lies('lib/importParser.ts').split('\n').slice(2850, 3330).join('\n');
  const fremdV = (vorlagen.match(/[A-Za-z0-9._%+-]+@[a-z0-9.-]+\.de\b/g) ?? []);
  assert.deepEqual(fremdV, []);
});

// ---------------------------------------------------------------------------
const B = '2026-10-01T08:00:00.000Z';
const tage = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString();

test('Test-Strecke: nach dem Willkommen wartet sie auf die Freischaltung', () => {
  assert.equal(TEST_STEPS[0].bezug, 'anfrage');
  assert.deepEqual(naechsterPlan(0, B, null, null, new Date(B)), { art: 'warten' });
});

test('Test-Strecke 7 Tage: Termine ab Freischaltung, nicht ab Anfrage', () => {
  const S = tage(B, 4); const E = tage(S, 7);              // 4 Tage nach der Anfrage freigeschaltet
  const p1 = naechsterPlan(0, B, S, E, new Date(S));
  assert.deepEqual(p1, { art: 'termin', schritt: 1, am: tage(S, 3) });
  assert.deepEqual(naechsterPlan(1, B, S, E, new Date(tage(S, 3))), { art: 'termin', schritt: 2, am: tage(E, -2) });
  assert.equal(TEST_STEPS[2].betreff.startsWith('Noch 2 Tage'), true);
  assert.deepEqual(naechsterPlan(2, B, S, E, new Date(tage(E, -2))), { art: 'termin', schritt: 3, am: E });
  assert.deepEqual(naechsterPlan(3, B, S, E, new Date(E)), { art: 'termin', schritt: 4, am: tage(E, 3) });
  assert.deepEqual(naechsterPlan(4, B, S, E, new Date(tage(E, 3))), { art: 'fertig' });
});

test('Test-Strecke 14 Tage und 2 Tage: „Noch 2 Tage" passt immer oder entfällt', () => {
  const S = tage(B, 1);
  const E14 = tage(S, 14);
  assert.equal(naechsterPlan(1, B, S, E14, new Date(tage(S, 3))).am, tage(E14, -2));
  const E2 = tage(S, 2);
  // 2-Tage-Test: Tipp ab Tag 3 und „Noch 2 Tage" entfallen, direkt „endet heute"
  assert.deepEqual(naechsterPlan(0, B, S, E2, new Date(S)), { art: 'termin', schritt: 3, am: E2 });
});

test('Test-Strecke: verspätete Termine sind sofort fällig, nie in der Vergangenheit geplant', () => {
  const S = tage(B, 1); const E = tage(S, 7);
  const spaet = new Date(tage(S, 5));
  assert.deepEqual(naechsterPlan(0, B, S, E, spaet), { art: 'termin', schritt: 1, am: spaet.toISOString() });
  assert.equal(schrittTermin(TEST_STEPS[3], B, S, E), Date.parse(E));
  assert.equal(schrittTermin(TEST_STEPS[1], B, null, E), null);
});

test('Test-Strecke-Wächter: Cron wartet, Freischaltung startet', () => {
  const c = ohneKommentare(lies('app/api/cron/dossier-sequenz/route.ts'));
  assert.match(c, /naechsterPlan\(idx, l\.bestaetigt_am, l\.test_start_am, l\.test_ende_am, jetzt\)/);
  assert.match(c, /seq_status: 'wartet_freischaltung'/);
  assert.doesNotMatch(c, /nextStep\.tag - step\.tag/);
  const d = ohneKommentare(lies('app/api/admin/demo-setzen/route.ts'));
  assert.match(d, /testStreckeStarten\(admin, tenantId, jetzt, ablauf\)/);
  assert.match(d, /test_start_am: start, test_ende_am: ablauf/);
  const sql = lies('supabase-sql/p187a-test-strecke.sql');
  assert.match(sql, /add column if not exists test_start_am timestamptz/);
  assert.match(sql, /add column if not exists test_ende_am\s+timestamptz/);
  assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b/i);
});
