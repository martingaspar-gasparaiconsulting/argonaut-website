// ============================================================================
// tests/weinbauP364.test.mjs — Paket 364 (13.10.2026)
// A4f Fachpaket Weinbau: Lesebuch, Partien, Kellerbuch.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  KELLER_ARTEN, FREIE_ARTEN, kellerArt, weinbauZusatz, WEINBAU_MODULE, lesePruefen, kellerPruefen, verschnittPruefen, abfuellPruefen,
  losVorschlag, jahrgangUebersicht, bestandAm, letzteAnalyse, eintragText, kellerbuchHtml,
} from '../out/weinbau.js';
import { brancheModule, brancheZusatz } from '../out/branchenkatalog.js';
import { NAV_LINKS } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const SQL = lies('supabase-sql/p364-weinbau.sql');

test('Kellerbuch-Arten passen zur Datenbank (Liste und Vorzeichen)', () => {
  const liste = SQL.match(/art in \(('zugang'[^)]*)\)/)[1].replace(/\s+/g, ' ');
  const sqlArten = [...liste.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...KELLER_ARTEN.map((a) => a.key)].sort(), [...sqlArten].sort());
  const plus = SQL.match(/when new\.art in \(([^)]*)\) then 1/)[1];
  const minus = SQL.match(/when new\.art in \(([^)]*)\) then -1/)[1];
  for (const a of KELLER_ARTEN) {
    const soll = plus.includes(`'${a.key}'`) ? 1 : minus.includes(`'${a.key}'`) ? -1 : 0;
    assert.equal(a.vorzeichen, soll, a.key);
  }
  const intern = SQL.match(/if new\.art in \(([^)]*)\) and current_setting\('p364\.intern'/)[1];
  for (const a of KELLER_ARTEN) assert.equal(a.intern, intern.includes(`'${a.key}'`), `intern ${a.key}`);
  const mittel = SQL.match(/if new\.art in \(([^)]*)\) and nullif\(btrim\(coalesce\(new\.mittel/)[1];
  for (const a of KELLER_ARTEN) assert.equal(a.mittelPflicht, mittel.includes(`'${a.key}'`), `Mittel ${a.key}`);
  assert.ok(FREIE_ARTEN.every((a) => !a.intern));
  assert.equal(kellerArt('gibtsnicht').key, 'sonstiges');
});

test('Branchen: Weingüter und Winzer bekommen das Paket — Brauerei und Sektkellerei nicht', () => {
  for (const b of ['Weingüter', 'Weingut Müller', 'Winzer', 'Winzergenossenschaften', 'Weinbau']) assert.equal(weinbauZusatz(b), true, b);
  for (const b of ['Brauerei & Mälzerei', 'Sektkellereien', 'Weinhandel', 'Getränke- & Lebensmittellogistik', null]) assert.equal(weinbauZusatz(b), false, String(b));
  const m = brancheModule('Lebensmittel & Nahversorgung', 'Weingüter');
  for (const x of WEINBAU_MODULE) assert.ok(m.includes(x), x);
  assert.equal(new Set(m).size, m.length, 'keine doppelten Module');
  assert.ok(!brancheModule('Lebensmittel & Nahversorgung', 'Metzgereien').includes('weinbau'));
  assert.ok(brancheZusatz('Lebensmittel & Nahversorgung', 'Weingüter').includes('schlagkartei'));
});

const LF = { jahrgang: '2026', lesedatum: '2026-10-01', weinberg: 'Sonnenberg', flaeche: '0,5', rebsorte: 'Riesling', menge: '4.000', oechsle: '88', saeure: '8,5', most: '3000', partie: '' };

test('Lese-Prüfung wie die Datenbank', () => {
  assert.deepEqual(lesePruefen(LF, '2026-10-13'), { fehler: [], werte: { jahrgang: 2026, flaeche: 0.5, menge: 4000, oechsle: 88, saeure: 8.5, most: 3000 } });
  assert.equal(lesePruefen({ ...LF, lesedatum: '2027-01-10', jahrgang: '2026' }, '2027-01-12').fehler.length, 0, 'Eiswein im Januar → Vorjahr');
  assert.match(lesePruefen({ ...LF, jahrgang: '2024' }, '2026-10-13').fehler.join(), /Jahrgang passt nicht/);
  assert.match(lesePruefen({ ...LF, lesedatum: '2026-10-14' }, '2026-10-13').fehler.join(), /Zukunft/);
  assert.match(lesePruefen({ ...LF, partie: 'x', most: '' }, '2026-10-13').fehler.join(), /Most-Menge/);
  assert.match(lesePruefen({ ...LF, oechsle: '400' }, '2026-10-13').fehler.join(), /Oe/);
  assert.equal(lesePruefen({ ...LF, weinberg: ' ', rebsorte: '', menge: '0' }, '2026-10-13').fehler.length, 3);
  assert.equal(lesePruefen({ ...LF, oechsle: '', saeure: '', flaeche: '', most: '' }, '2026-10-13').fehler.length, 0, 'optionale Felder leer');
});

const KB = { art: 'analyse', datum: '', menge: '', mittel: '', mittelMenge: '', mittelEinheit: '', alkohol: '', restzucker: '', saeure: '', so2frei: '', so2gesamt: '', bemerkung: '' };

test('Kellerbuch-Prüfung: Menge, Bestand, Mittel, Analyse', () => {
  assert.match(kellerPruefen(KB, 100, '2026-10-13').fehler.join(), /mindestens einen Analysewert/);
  const a = kellerPruefen({ ...KB, alkohol: '12,5', so2frei: '35' }, 100, '2026-10-13');
  assert.deepEqual(a.fehler, []);
  assert.equal(a.zeile.alkohol_vol, 12.5); assert.equal(a.zeile.so2_frei_mgl, 35); assert.equal(a.zeile.restzucker_gl, null);
  assert.equal(a.zeile.datum, '2026-10-13', 'leer = heute');
  assert.match(kellerPruefen({ ...KB, art: 'abgang', menge: '150' }, 100, '2026-10-13').fehler.join(), /Bestand 100 l/);
  assert.deepEqual(kellerPruefen({ ...KB, art: 'zugang', menge: '150' }, 0, '2026-10-13').fehler, [], 'Zugang ohne Bestand');
  assert.match(kellerPruefen({ ...KB, art: 'schwefelung' }, 100, '2026-10-13').fehler.join(), /Mittel/);
  assert.equal(kellerPruefen({ ...KB, art: 'schwefelung', mittel: 'Kaliumdisulfit', menge: '999' }, 100, '2026-10-13').zeile.menge_l, undefined, 'Behandlung ohne Liter');
  assert.match(kellerPruefen({ ...KB, art: 'abfuellung', menge: '1' }, 100, '2026-10-13').fehler.join(), /eigenen Knöpfe/);
  assert.match(kellerPruefen({ ...KB, art: 'sonstiges' }, 100, '2026-10-13').fehler.join(), /was gemacht/);
  assert.match(kellerPruefen({ ...KB, art: 'zugang', menge: '1', datum: '2026-10-14' }, 0, '2026-10-13').fehler.join(), /Zukunft/);
});

test('Verschnitt und Abfüllung', () => {
  const p1 = { id: '1', jahrgang: 2026, bezeichnung: '2026 Riesling', rebsorte: 'Riesling', bestand_l: '1000' };
  const p2 = { id: '2', jahrgang: 2026, bezeichnung: '2026 Cuvée', bestand_l: 0 };
  assert.deepEqual(verschnittPruefen(p1, p2, '850'), { fehler: [], menge: 850 });
  assert.match(verschnittPruefen(p1, p1, '1').fehler.join(), /verschiedene/);
  assert.match(verschnittPruefen(p2, p1, '1').fehler.join(), /Nicht genug/);
  assert.deepEqual(abfuellPruefen({ flaschen: '1000', nenn: '0,75', charge: 'R-1' }, 1000), { fehler: [], flaschen: 1000, nenn: 0.75, liter: 750 });
  assert.match(abfuellPruefen({ flaschen: '1500', nenn: '0,75', charge: 'R-1' }, 1000).fehler.join(), /1125 l gebraucht/);
  assert.equal(abfuellPruefen({ flaschen: '10,5', nenn: '', charge: '' }, 1000).fehler.length, 3);
  assert.equal(abfuellPruefen({ flaschen: '3', nenn: '0,1875', charge: 'P' }, 1).liter, 0.563);
  assert.equal(losVorschlag(p1, 0), 'RIESLI-2026-1');
  assert.equal(losVorschlag({ bezeichnung: '2026 Spätburgunder Rosé', rebsorte: null, jahrgang: 2026 }, 2), 'SPAETB-2026-3');
});

test('Jahrgangs-Übersicht: nach kg gewichtet, ohne Storno, hl/ha nur mit allen Most-Litern', () => {
  const l = [
    { jahrgang: 2026, lesedatum: '2026-10-01', weinberg: 'Sonnenberg', flaeche_ha: 0.5, rebsorte: 'Riesling', menge_kg: 4000, mostgewicht_oe: 90, saeure_gl: 8, most_l: 3000 },
    { jahrgang: 2026, lesedatum: '2026-10-02', weinberg: 'Sonnenberg', flaeche_ha: '0,5', rebsorte: 'Riesling', menge_kg: '1.000', mostgewicht_oe: 80, saeure_gl: null, most_l: '750' },
    { jahrgang: 2026, lesedatum: '2026-10-03', weinberg: 'Kirchberg', flaeche_ha: 1, rebsorte: 'Spätburgunder', menge_kg: 2000, mostgewicht_oe: null, most_l: null },
    { jahrgang: 2026, lesedatum: '2026-10-04', weinberg: 'Kirchberg', rebsorte: 'Spätburgunder', menge_kg: 9999, storniert: true },
    { jahrgang: 2026, lesedatum: '2026-10-05', weinberg: 'Kirchberg', rebsorte: 'Spätburgunder', menge_kg: 1000, mostgewicht_oe: 85, most_l: 700 },
    { jahrgang: 2025, lesedatum: '2025-10-04', weinberg: 'Alt', rebsorte: 'Riesling', menge_kg: 500 },
  ];
  const u = jahrgangUebersicht(l, 2026);
  assert.deepEqual(u.sorten, [
    { rebsorte: 'Riesling', lesen: 2, kg: 5000, most_l: 3750, oechsle: 88, saeure: 8 },
    { rebsorte: 'Spätburgunder', lesen: 2, kg: 3000, most_l: 700, oechsle: 85, saeure: null },
  ]);
  assert.deepEqual(u.weinberge, [
    { weinberg: 'Kirchberg', kg: 3000, most_l: 700, ha: 1, kgJeHa: 3000, hlJeHa: null },
    { weinberg: 'Sonnenberg', kg: 5000, most_l: 3750, ha: 0.5, kgJeHa: 10000, hlJeHa: 75 },
  ]);
  assert.equal(u.summeKg, 8000);
});

test('Bestand zum Stichtag, letzte Analyse, Text, Druck maskiert', () => {
  const b = [
    { partie_id: 'a', datum: '2026-09-20', art: 'zugang_lese', menge_l: 3000, erfasst_am: '1' },
    { partie_id: 'a', datum: '2026-10-01', art: 'schwund', menge_l: '150', erfasst_am: '2' },
    { partie_id: 'a', datum: '2026-10-02', art: 'analyse', alkohol_vol: 12.5, erfasst_am: '3' },
    { partie_id: 'a', datum: '2026-10-05', art: 'verschnitt_ab', menge_l: 850, erfasst_am: '4' },
    { partie_id: 'b', datum: '2026-10-05', art: 'verschnitt_zu', menge_l: 850, erfasst_am: '5' },
    { partie_id: 'a', datum: '2026-10-06', art: 'analyse', restzucker_gl: 6.2, erfasst_am: '6' },
    { partie_id: 'a', datum: '2026-10-07', art: 'schwefelung', mittel: 'Kaliumdisulfit', mittel_menge: 150, mittel_einheit: 'g', erfasst_am: '7' },
  ];
  assert.deepEqual([...bestandAm(b, '2026-10-01')], [['a', 2850]]);
  assert.deepEqual([...bestandAm(b, '2026-10-31')].sort(), [['a', 2000], ['b', 850]]);
  assert.equal(letzteAnalyse(b, 'a').restzucker_gl, 6.2);
  assert.equal(letzteAnalyse(b, 'b'), null);
  assert.equal(eintragText(b[6]), 'Kaliumdisulfit 150 g');
  assert.equal(eintragText({ ...b[2], so2_frei_mgl: 35, bemerkung: 'Labor' }), 'Alkohol 12,5 % vol · SO₂ frei 35 mg/l · Labor');
  const h = kellerbuchHtml({ id: 'a', jahrgang: 2026, bezeichnung: '<b>Riesling</b>', bestand_l: 2000 }, [...b, { partie_id: 'a', datum: '2026-10-08', art: 'sonstiges', bemerkung: '<script>x</script>', erfasst_am: '8' }], 'Weingut');
  assert.ok(!h.includes('<b>Riesling</b>') && !h.includes('<script>x'), 'maskiert');
  assert.match(h, /&lt;b&gt;Riesling&lt;\/b&gt;/);
  assert.match(h, /&lt;script&gt;x/);
  assert.match(h, /− 850 l/);
  assert.match(h, /08\.10\.2026/);
  assert.ok(!h.includes('verschnitt_zu'), 'nur Einträge der Partie, mit Namen statt Schlüssel');
});

test('Quelltext: SQL, Menü, Seite, Sicherung, Verzeichnis, Guide, Startskript', () => {
  assert.match(SQL, /pg_advisory_xact_lock\(hashtext\('p364:'/, 'Lese-Nummer ohne Doppel');
  assert.match(SQL, /lpad\(v_n::text, greatest\(3, length\(v_n::text\)\), '0'\)/);
  assert.match(SQL, /if v_neu < 0 then/, 'Bestand nie unter 0');
  assert.match(SQL, /'quarantaene'/);
  assert.match(SQL, /security invoker/);
  assert.match(SQL, /'FM999999990\.999'/, 'Zahlformat mit 9 (# ist kein Muster)');
  assert.doesNotMatch(SQL, /drop table|truncate|policy [a-z0-9_]+ on public\.(charge_los|charge_verwendung|schlag)/i);
  assert.equal(NAV_LINKS.find((n) => n.href === '/dashboard/weinbau')?.modul, 'weinbau');
  const seite = lies('app/dashboard/weinbau/page.tsx');
  assert.match(seite, /rpc\('p364_abfuellen'/);
  assert.match(seite, /rpc\('p364_verschnitt'/);
  assert.match(seite, /übermittelt nichts an Behörden/);
  assert.doesNotMatch(seite, /\b(Ihre?|Sie geben|gleichen Sie)\b/, 'Mitarbeitertexte anredefrei');
  assert.match(lies('lib/sicherungTabellen.ts'), /'wein_kellerbuch', 'wein_lese', 'wein_partie'/);
  assert.match(lies('lib/verarbeitungsverzeichnis.ts'), /wenn: 'weinbau'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/weinbau'/);
  assert.match(lies('scripts/claude-start.sh'), /p364-\*\.sql/);
});
