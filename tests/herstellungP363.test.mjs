// ============================================================================
// tests/herstellungP363.test.mjs — Paket 363 (13.10.2026)
// A4e Fachpaket Lebensmittel-Herstellung: Herstellungsprotokoll.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ARTEN, SCHRITTE, herstellungZusatz, HERSTELLUNG_MODULE, zahlLesen, ausbeute, inHektoliter, sudUebersicht, protokollPruefen,
  messungPruefen, abschlussPruefen, chargenVorschlag, nachSchritt, protokollHtml,
} from '../out/herstellung.js';
import { brancheModule, brancheZusatz } from '../out/branchenkatalog.js';
import { NAV_LINKS } from '../out/rechte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Arten und Vorlagen passen zur Datenbank', () => {
  assert.deepEqual(ARTEN.map((a) => a.key), ['sud', 'milch', 'mahlgang', 'ansatz']);
  assert.match(lies('supabase-sql/p363-herstellung.sql'), /art in \('sud', 'milch', 'mahlgang', 'ansatz'\)/);
  assert.ok(SCHRITTE.sud.some((s) => s.schritt === 'Würzekochen'));
  assert.ok(SCHRITTE.milch.some((s) => s.groessen.some((g) => g.groesse === 'Heißhaltezeit')));
  for (const a of ARTEN) assert.ok(SCHRITTE[a.key].length >= 3, a.key);
});

test('Branchen: Brauerei, Molkerei, Mühle u. a. bekommen das Paket — andere nicht', () => {
  for (const b of ['Brauerei & Mälzerei', 'Molkerei & Milchverarbeitung', 'Mühlen & Getreideverarbeitung', 'Käsereien & Hofkäsereien', 'Sektkellereien', 'Ölmühlen & Speiseölmanufakturen', 'Brennereien & Destillerien', 'Keltereien & Mostereien']) {
    assert.equal(herstellungZusatz(b), true, b);
  }
  for (const b of ['Getränke- & Lebensmittellogistik', 'Bäckerei', 'Metallbau', null]) assert.equal(herstellungZusatz(b), false, String(b));
  const m = brancheModule('Industrie & Produktion', 'Brauerei & Mälzerei');
  for (const x of HERSTELLUNG_MODULE) assert.ok(m.includes(x), x);
  assert.equal(new Set(m).size, m.length, 'keine doppelten Module');
  assert.ok(!brancheModule('Industrie & Produktion', 'Metallbau').includes('herstellung'));
  assert.ok(brancheZusatz('Lebensmittel & Nahversorgung', 'Käsereien & Hofkäsereien').includes('herstellung'));
});

test('Zahlen, Ausbeute, Hektoliter', () => {
  assert.equal(zahlLesen('1.234,5'), 1234.5);
  assert.equal(zahlLesen('abc'), null);
  assert.equal(ausbeute(1000, 950), 95);
  assert.equal(ausbeute(3, 1), 33.3);
  assert.equal(ausbeute(0, 5), null);
  assert.equal(inHektoliter(950, 'l'), 9.5);
  assert.equal(inHektoliter(12, 'hl'), 12);
  assert.equal(inHektoliter(12, 'kg'), null);
});

test('Sud-Übersicht: hl je °P im Monat, nur abgeschlossene Sude', () => {
  const l = [
    { id: '1', art: 'sud', bezeichnung: 'Pils', status: 'abgeschlossen', beendet_am: '2026-10-02T10:00:00Z', ist_menge: 950, einheit: 'l', stammwuerze_p: 11.8 },
    { id: '2', art: 'sud', bezeichnung: 'Pils', status: 'abgeschlossen', beendet_am: '2026-10-09T10:00:00Z', ist_menge: '10,5', einheit: 'hl', stammwuerze_p: '11,8' },
    { id: '3', art: 'sud', bezeichnung: 'Bock', status: 'abgeschlossen', beendet_am: '2026-10-11T10:00:00Z', ist_menge: 500, einheit: 'l', stammwuerze_p: 16.4 },
    { id: '4', art: 'sud', bezeichnung: 'offen', status: 'offen', beendet_am: null, ist_menge: 500, einheit: 'l', stammwuerze_p: 12 },
    { id: '5', art: 'sud', bezeichnung: 'storniert', status: 'storniert', beendet_am: '2026-10-11T10:00:00Z', ist_menge: 500, einheit: 'l', stammwuerze_p: 12 },
    { id: '6', art: 'sud', bezeichnung: 'kg', status: 'abgeschlossen', beendet_am: '2026-10-12T10:00:00Z', ist_menge: 500, einheit: 'kg', stammwuerze_p: 12 },
    { id: '7', art: 'sud', bezeichnung: 'September', status: 'abgeschlossen', beendet_am: '2026-09-30T10:00:00Z', ist_menge: 500, einheit: 'l', stammwuerze_p: 12 },
    { id: '8', art: 'milch', bezeichnung: 'Milch', status: 'abgeschlossen', beendet_am: '2026-10-12T10:00:00Z', ist_menge: 500, einheit: 'l' },
  ];
  assert.deepEqual(sudUebersicht(l, '2026-10'), { zeilen: [{ stammwuerze: 11.8, hl: 20, sude: 2 }, { stammwuerze: 16.4, hl: 5, sude: 1 }], summeHl: 25, ohneHl: 1 });
});

test('Prüfungen wie die Datenbank', () => {
  assert.deepEqual(protokollPruefen({ art: 'sud', bezeichnung: 'Pils', soll: '1.000', einheit: 'l' }), { fehler: [], soll: 1000 });
  assert.equal(protokollPruefen({ art: 'wein', bezeichnung: 'x', soll: '', einheit: 'l' }).fehler.length, 1);
  assert.equal(protokollPruefen({ art: 'sud', bezeichnung: '', soll: '-1', einheit: '' }).fehler.length, 3);
  const jetzt = new Date('2026-10-13T12:00:00Z');
  assert.deepEqual(messungPruefen({ schritt: 'Einmaischen', groesse: 'Temperatur', wert: '62,5', bemerkung: '' }, null, jetzt), { fehler: [], wert: 62.5 });
  assert.equal(messungPruefen({ schritt: 'Einmaischen', groesse: 'Jodprobe', wert: '', bemerkung: 'jodnormal' }, null, jetzt).fehler.length, 0, 'Bemerkung ohne Wert reicht');
  assert.equal(messungPruefen({ schritt: 'Einmaischen', groesse: 'Temperatur', wert: '', bemerkung: '' }, null, jetzt).fehler.length, 1);
  assert.equal(messungPruefen({ schritt: 'X', groesse: 'Y', wert: 'warm', bemerkung: '' }, null, jetzt).fehler.length, 1);
  assert.equal(messungPruefen({ schritt: 'X', groesse: 'Y', wert: '1', bemerkung: '' }, '2026-10-14T12:00:00Z', jetzt).fehler.length, 1, 'Zukunft');
  assert.deepEqual(abschlussPruefen('sud', { ist: '950', charge: 'PILS-1', mhd: '', stammwuerze: '11,8' }, '2026-10-13'), { fehler: [], ist: 950, stammwuerze: 11.8 });
  assert.equal(abschlussPruefen('sud', { ist: '950', charge: 'PILS-1', mhd: '', stammwuerze: '' }, '2026-10-13').fehler.length, 1, 'Sud braucht Stammwürze');
  assert.equal(abschlussPruefen('milch', { ist: '950', charge: 'M-1', mhd: '', stammwuerze: '' }, '2026-10-13').fehler.length, 0, 'Milch ohne Stammwürze');
  assert.equal(abschlussPruefen('milch', { ist: '', charge: '', mhd: '2026-10-01', stammwuerze: '' }, '2026-10-13').fehler.length, 3);
});

test('Chargen-Vorschlag, Gruppierung nach Vorlage, Druck maskiert', () => {
  assert.equal(chargenVorschlag({ bezeichnung: 'Pils Sud 14', nummer: '2026-014' }), 'PILS-2026-014');
  assert.equal(chargenVorschlag({ bezeichnung: 'Märzen', nummer: '2026-002' }), 'MAERZEN-2026-002');
  assert.equal(chargenVorschlag({ bezeichnung: '!!', nummer: '2026-001' }), 'CHARGE-2026-001');
  const g = nachSchritt('sud', [
    { schritt: 'Würzekochen', groesse: 'Kochzeit', wert: 60, gemessen_am: '2026-10-13T10:00:00Z' },
    { schritt: 'Eigener Schritt', groesse: 'X', wert: 1, gemessen_am: '2026-10-13T08:00:00Z' },
    { schritt: 'Einmaischen', groesse: 'Temperatur', wert: 62, gemessen_am: '2026-10-13T09:00:00Z' },
  ]);
  assert.deepEqual(g.map((x) => x.schritt), ['Einmaischen', 'Würzekochen', 'Eigener Schritt']);
  const h = protokollHtml({ id: '1', nummer: '2026-001', art: 'sud', bezeichnung: '<b>Pils</b>', status: 'storniert', storno_grund: 'Infektion', soll_menge: 1000, ist_menge: 950, einheit: 'l', stammwuerze_p: 11.8 },
    [{ schritt: 'Einmaischen', groesse: 'Temperatur', wert: 62, einheit: '°C', gemessen_am: '2026-10-13T09:00:00Z', erfasst_name: 'Bernd' }], [{ bezeichnung: 'Malz', charge_nr: 'M-1', menge: 200, einheit: 'kg' }], 'Brauhaus');
  assert.ok(!h.includes('<b>Pils</b>'), 'maskiert');
  assert.match(h, /&lt;b&gt;Pils/);
  assert.match(h, /STORNIERT: Infektion/);
  assert.match(h, /Ausbeute 95 %/);
  assert.match(h, /11,8 °P/);
  assert.match(h, /11:00/, 'Berliner Zeit');
});

test('Quelltext: SQL, Menü, Seite, Sicherung, Verzeichnis, Startskript', () => {
  const sql = lies('supabase-sql/p363-herstellung.sql');
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('p363:'/, 'Nummer ohne Doppel');
  assert.match(sql, /lpad\(v_n::text, greatest\(3, length\(v_n::text\)\), '0'\)/, 'kein Abschneiden ab 1000');
  assert.match(sql, /'quarantaene'/, 'neue Charge in Quarantäne');
  assert.match(sql, /security invoker/, 'Abschluss mit Rechten des Nutzers (p320 greift)');
  assert.match(sql, /Messwerte werden nur angehängt/);
  assert.doesNotMatch(sql, /drop table|truncate|policy [a-z0-9_]+ on public\.(charge_los|charge_verwendung|rezepturen)/i, 'nie destruktiv, keine Regeln an Chargen/Rezepturen');
  const nav = NAV_LINKS.find((n) => n.href === '/dashboard/herstellung');
  assert.equal(nav?.modul, 'herstellung');
  const seite = lies('app/dashboard/herstellung/page.tsx');
  assert.match(seite, /rpc\('p363_abschliessen'/);
  assert.match(seite, /ARGONAUT berechnet keine Biersteuer/);
  assert.doesNotMatch(seite, /Legen Sie|Ihre Protokolle/, 'Mitarbeitertexte anredefrei');
  assert.match(lies('lib/sicherungTabellen.ts'), /'herstell_messung', 'herstell_protokoll', 'herstell_rohstoff'/);
  assert.match(lies('lib/verarbeitungsverzeichnis.ts'), /wenn: 'herstellung'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/herstellung'/);
  assert.match(lies('scripts/claude-start.sh'), /p363-\*\.sql/);
});
