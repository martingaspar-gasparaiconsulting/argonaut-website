// ============================================================================
// tests/ersparnisP309.test.mjs — Paket 309 (11.10.2026) · SP1
// „Was ARGONAUT Ihnen gespart hat": nur belegte Werte, nichts geschätzt,
// Verzugszinsen nicht doppelt und nicht in der Summe, Teilen ohne Namen.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  skonto, skontoAbzugPruefen, verzug, programme, thg, importe, angabePruefen, gesamtCent, hatWerte,
  teilenText, volleMonate, vorZwoelfMonaten, euroText,
} from '../out/ersparnis.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HEUTE = '2026-10-11';
const name = (k) => ({ lexoffice: 'lexoffice', sevdesk: 'sevDesk' })[k];

test('volleMonate: nur volle Monate, nie negativ', () => {
  assert.equal(volleMonate('2026-01-15', '2026-10-11'), 8);
  assert.equal(volleMonate('2026-01-11', '2026-10-11'), 9);
  assert.equal(volleMonate('2026-10-12', '2026-10-11'), 0);
  assert.equal(volleMonate('2025-12-31', '2026-01-30'), 0);
  assert.equal(volleMonate('quatsch', HEUTE), 0);
  assert.equal(vorZwoelfMonaten(HEUTE), '2025-10-11');
});

test('Skonto: nur bezahlte Belege mit Abzug, 12-Monats-Fenster', () => {
  const s = skonto([
    { skonto_abzug: 24.8, bezahlt_am: '2026-09-01' },
    { skonto_abzug: '10.10', bezahlt_am: '2025-10-01' },   // älter als 12 Monate
    { skonto_abzug: 50, bezahlt_am: null },                 // nicht bezahlt: zählt nicht
    { skonto_abzug: null, bezahlt_am: '2026-09-01' },
    { skonto_abzug: 0, bezahlt_am: '2026-09-01' },
  ], HEUTE);
  assert.deepEqual(s, { gesamtCent: 3490, zwoelfMonateCent: 2480, anzahl: 2 });
});

test('Skonto-Eingabe: leer = kein Skonto, deutsch lesbar, Tippfehler-Schutz 10 %', () => {
  assert.deepEqual(skontoAbzugPruefen('', 1000), { ok: true, wert: null });
  assert.deepEqual(skontoAbzugPruefen('24,80', 1240), { ok: true, wert: 24.8 });
  assert.equal(skontoAbzugPruefen('0', 1000).ok, false);
  assert.equal(skontoAbzugPruefen('-5', 1000).ok, false);
  assert.equal(skontoAbzugPruefen('abc', 1000).ok, false);
  assert.equal(skontoAbzugPruefen('100,01', 1000).ok, false);
  assert.equal(skontoAbzugPruefen('100,00', 1000).ok, true);
});

test('Verzug: je Rechnung der höchste Stand, nicht über die Stufen summiert', () => {
  const v = verzug([
    { rechnung_id: 'r1', zins_betrag: 3.1, pauschale_betrag: 0 },
    { rechnung_id: 'r1', zins_betrag: 7.45, pauschale_betrag: 40 },
    { rechnung_id: 'r1', zins_betrag: 12.02, pauschale_betrag: 40 },
    { rechnung_id: 'r2', zins_betrag: 1.5, pauschale_betrag: null },
    { rechnung_id: 'r3', zins_betrag: 0, pauschale_betrag: 0 },
    { rechnung_id: null, zins_betrag: 99, pauschale_betrag: 40 },
  ]);
  assert.deepEqual(v, { zinsenCent: 1352, pauschalenCent: 4000, summeCent: 5352, rechnungen: 2 });
});

test('Programme: Betrag nur mit eigener Angabe, volle Monate × Monatskosten', () => {
  const p = programme(['lexoffice', 'sevdesk'], [
    { art: 'altprogramm', altsystem_key: 'lexoffice', bezeichnung: 'lexoffice', betrag_cent: 2490, je: 'monat', ab: '2026-07-01' },
    { art: 'thg', bezeichnung: 'BB-AG 1E', betrag_cent: 30000, je: 'einmal', ab: '2026-05-01' },
  ], HEUTE, name);
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { key: 'lexoffice', name: 'lexoffice', monatCent: 2490, ab: '2026-07-01', monate: 3, gespartCent: 7470 });
  assert.deepEqual(p[1], { key: 'sevdesk', name: 'sevDesk', monatCent: null, ab: null, monate: 0, gespartCent: null });
});

test('THG: nur ausgezahlte (nicht in der Zukunft) Prämien', () => {
  const t = thg([
    { art: 'thg', betrag_cent: 30000, ab: '2026-05-01' },
    { art: 'thg', betrag_cent: 25000, ab: '2026-12-01' },
    { art: 'altprogramm', betrag_cent: 999, ab: '2026-01-01' },
  ], HEUTE);
  assert.deepEqual(t, { gesamtCent: 30000, anzahl: 1 });
});

test('Importe: Datensätze nur aus fertigen/teilweisen Läufen, keine Stunden', () => {
  assert.deepEqual(importe([
    { status: 'fertig', zeilen_ok: 120 }, { status: 'teilweise', zeilen_ok: '30' },
    { status: 'abgebrochen', zeilen_ok: 500 }, { status: 'laeuft', zeilen_ok: 9 }, { status: 'fertig', zeilen_ok: 0 },
  ]), { datensaetze: 150, dateien: 2 });
});

test('Angabe prüfen: Pflichtfelder, Grenzen, THG nicht in der Zukunft', () => {
  const a = angabePruefen({ art: 'altprogramm', bezeichnung: 'lexoffice', altsystem_key: 'lexoffice', betrag: '24,90', ab: '2026-07-01' }, HEUTE);
  assert.equal(a.ok, true);
  assert.deepEqual(a.zeile, { art: 'altprogramm', bezeichnung: 'lexoffice', altsystem_key: 'lexoffice', betrag_cent: 2490, je: 'monat', ab: '2026-07-01', notiz: null });
  const t = angabePruefen({ art: 'thg', bezeichnung: 'BB-AG 1E', altsystem_key: 'x', betrag: '300', ab: '2026-05-01' }, HEUTE);
  assert.equal(t.zeile.je, 'einmal');
  assert.equal(t.zeile.altsystem_key, null);
  assert.equal(angabePruefen({ art: 'thg', bezeichnung: 'BB-AG 1E', betrag: '300', ab: '2026-12-01' }, HEUTE).ok, false);
  assert.equal(angabePruefen({ art: 'sonst', bezeichnung: 'x y', betrag: '1', ab: HEUTE }, HEUTE).ok, false);
  assert.equal(angabePruefen({ art: 'altprogramm', bezeichnung: 'x', betrag: '1', ab: HEUTE }, HEUTE).ok, false);
  assert.equal(angabePruefen({ art: 'altprogramm', bezeichnung: 'lexoffice', betrag: '0', ab: HEUTE }, HEUTE).ok, false);
  assert.equal(angabePruefen({ art: 'altprogramm', bezeichnung: 'lexoffice', betrag: '100000,01', ab: HEUTE }, HEUTE).ok, false);
  assert.equal(angabePruefen({ art: 'altprogramm', bezeichnung: 'lexoffice', betrag: '5', ab: '' }, HEUTE).ok, false);
});

const G = () => ({
  skonto: { gesamtCent: 3490, zwoelfMonateCent: 2480, anzahl: 2 },
  verzug: { zinsenCent: 1352, pauschalenCent: 4000, summeCent: 5352, rechnungen: 2 },
  programme: [{ key: 'lexoffice', name: 'lexoffice', monatCent: 2490, ab: '2026-07-01', monate: 3, gespartCent: 7470 }],
  thg: { gesamtCent: 30000, anzahl: 1 },
  importe: { datensaetze: 1500, dateien: 3 },
});

test('Gesamtsumme: Skonto + Programme + THG — Verzugszinsen NICHT', () => {
  assert.equal(gesamtCent(G()), 3490 + 7470 + 30000);
  const leer = { skonto: { gesamtCent: 0, zwoelfMonateCent: 0, anzahl: 0 }, verzug: { zinsenCent: 0, pauschalenCent: 0, summeCent: 0, rechnungen: 0 }, programme: [], thg: { gesamtCent: 0, anzahl: 0 }, importe: { datensaetze: 0, dateien: 0 } };
  assert.equal(hatWerte(leer), false);
  assert.equal(hatWerte({ ...leer, importe: { datensaetze: 1, dateien: 1 } }), true);
});

test('Teilen-Text: nur Summen, ohne Programmnamen, leere Zeilen fallen weg', () => {
  const t = teilenText(G(), 'Farbwerk Steinhauser');
  assert.match(t, /^Farbwerk Steinhauser arbeitet mit ARGONAUT OS\./);
  assert.match(t, new RegExp(`Bisher nachweislich im Betrieb geblieben: ${euroText(40960).replace(/\./g, '\\.')}`));
  assert.match(t, /ein altes Programm ersetzt/);
  assert.doesNotMatch(t, /lexoffice/);
  assert.match(t, /1\.500 Datensätze übernommen statt abgetippt/);
  assert.match(t, /geltend gemacht/);
  const nur = teilenText({ ...G(), skonto: { gesamtCent: 0, zwoelfMonateCent: 0, anzahl: 0 }, thg: { gesamtCent: 0, anzahl: 0 }, verzug: { zinsenCent: 0, pauschalenCent: 0, summeCent: 0, rechnungen: 0 } }, '');
  assert.match(nur, /^Wir arbeiten mit ARGONAUT OS\./);
  assert.doesNotMatch(nur, /Skonto|THG|Verzug/);
});

test('Code-Wächter: keine Schätzung, Karte im Chef-Blick, Teilen nur mit Einwilligung, SQL nur Chef', () => {
  const lib = ohneKommentare(lies('lib/ersparnis.ts'));
  assert.doesNotMatch(lib, /Math\.round\(/);
  assert.doesNotMatch(lib, /stunde|minute/i);
  const karte = lies('app/dashboard/chef-blick/ErsparnisKarte.tsx');
  assert.match(lies('app/dashboard/chef-blick/page.tsx'), /<ErsparnisKarte firma=\{firma\} \/>/);
  assert.match(karte, /\{erlaubt && \(/);
  assert.match(karte, /modul_einstellung/);
  assert.doesNotMatch(karte, /window\.(alert|confirm|prompt)/);
  const sql = lies('supabase-sql/p309-ersparnis.sql');
  assert.equal((sql.match(/create policy/g) || []).length, 4);
  assert.equal((sql.match(/mein_chef_id\(\) is null/g) || []).length, 5);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
  const zahl = lies('app/dashboard/zahlungen/page.tsx');
  assert.match(zahl, /skontoAbzugPruefen\(eingabe, b\.brutto\)/);
});
