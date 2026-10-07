// ============================================================================
// tests/kfzKalkulationP265.test.mjs — Paket 265 (07.10.2026) · K5 Kalkulation und Provision
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { KOSTEN_ARTEN, erloes, provision, kalkulation, kostenSummen, ertragAmpel, provAus, kalkHinweise } from '../out/kfzKalkulation.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohne = { art: null, wert: null };

test('Erlös: Regelsteuer zieht 19 % heraus, § 25a nur auf die positive Differenz', () => {
  assert.deepEqual(erloes(11900, 5000, 'regel'), { netto: 10000, ust: 1900 });
  // § 25a: VK 20.000, EK 15.000 -> Differenz 5.000 -> USt 798,32
  assert.deepEqual(erloes(20000, 15000, '25a'), { netto: 19201.68, ust: 798.32 });
  assert.deepEqual(erloes(10000, 12000, '25a'), { netto: 10000, ust: 0 }, 'Verlust: keine USt');
  assert.deepEqual(erloes(20000, 15000, null), erloes(20000, 15000, '25a'), 'offen = wie § 25a');
});

test('Kalkulation § 25a: Kosten mindern die Differenz nicht, Standkosten, Gemeinkosten, Provisionen', () => {
  const r = kalkulation({ besteuerung: '25a', ek: 15000, vk: 20000, kosten: 800, standtage: 30, standkostenTag: 10, gemeinkostenProzent: 4,
    provV: { art: 'rohertrag', wert: 10 }, provH: { art: 'fest', wert: 150 } });
  assert.equal(r.vollstaendig, true);
  assert.equal(r.ust, 798.32);
  assert.equal(r.erloesNetto, 19201.68);
  assert.equal(r.standkosten, 300);
  assert.equal(r.rohertrag, 3101.68);          // 19201,68 − 15000 − 800 − 300
  assert.equal(r.gemeinkosten, 768.07);        // 4 % von 19201,68
  assert.equal(r.provVerkaeufer, 310.17);      // 10 % vom Rohertrag
  assert.equal(r.provHereinnehmer, 150);
  assert.equal(r.deckungsbeitrag, 1873.44);
  assert.equal(r.margeProzent, 9.8);
  assert.equal(ertragAmpel(r), 'ok');
});

test('Kalkulation Regelsteuer und Provision vom Erlös', () => {
  const r = kalkulation({ besteuerung: 'regel', ek: 8000, vk: 11900, kosten: 0, standtage: null, standkostenTag: 10, gemeinkostenProzent: null,
    provV: { art: 'umsatz', wert: 2 }, provH: ohne });
  assert.equal(r.erloesNetto, 10000);
  assert.equal(r.rohertrag, 2000);
  assert.equal(r.provVerkaeufer, 200);
  assert.equal(r.deckungsbeitrag, 1800);
});

test('Nichts erfunden: ohne VK oder EK kein Ertrag; Verlust ohne Rohertrags-Provision', () => {
  const a = kalkulation({ besteuerung: '25a', ek: null, vk: 20000, kosten: 0, standtage: 0, standkostenTag: 0, gemeinkostenProzent: 0, provV: ohne, provH: ohne });
  assert.equal(a.vollstaendig, false); assert.deepEqual(a.fehlt, ['Einkaufspreis']); assert.equal(a.rohertrag, null); assert.equal(ertragAmpel(a), 'dim');
  assert.deepEqual(kalkulation({ besteuerung: '25a', ek: 1, vk: null, kosten: 0, standtage: 0, standkostenTag: 0, gemeinkostenProzent: 0, provV: ohne, provH: ohne }).fehlt, ['Verkaufspreis']);
  assert.deepEqual(kalkulation({ besteuerung: '25a', ek: 1, vk: 0, kosten: 0, standtage: 0, standkostenTag: 0, gemeinkostenProzent: 0, provV: ohne, provH: ohne }).fehlt, ['Verkaufspreis']);
  const v = kalkulation({ besteuerung: '25a', ek: 12000, vk: 10000, kosten: 500, standtage: 0, standkostenTag: 0, gemeinkostenProzent: 0, provV: { art: 'rohertrag', wert: 20 }, provH: { art: 'umsatz', wert: 1 } });
  assert.equal(v.rohertrag, -2500);
  assert.equal(v.provVerkaeufer, 0, 'keine Provision auf Verlust');
  assert.equal(v.provHereinnehmer, 100, '% vom Erlös bleibt');
  assert.equal(ertragAmpel(v), 'bad');
  const knapp = kalkulation({ besteuerung: 'regel', ek: 9800, vk: 11900, kosten: 0, standtage: 0, standkostenTag: 0, gemeinkostenProzent: 0, provV: ohne, provH: ohne });
  assert.equal(knapp.margeProzent, 2); assert.equal(ertragAmpel(knapp), 'warn');
  const ek0 = kalkulation({ besteuerung: '25a', ek: 0, vk: 1190, kosten: 0, standtage: 0, standkostenTag: 0, gemeinkostenProzent: 0, provV: ohne, provH: ohne });
  assert.equal(ek0.vollstaendig, true, 'EK 0 (geschenkt/Kommission) ist gültig');
  assert.equal(ek0.erloesNetto, 1000);
});

test('Kosten: Plan zählt erledigte Arten nicht doppelt; negative Beträge zählen nicht', () => {
  const k = [
    { art: 'aufbereitung', betrag_netto: 300, plan: true },
    { art: 'aufbereitung', betrag_netto: 350, plan: false },
    { art: 'reifen', betrag_netto: 400, plan: true },
    { art: 'hu', betrag_netto: 120.105, plan: false },
    { art: 'teile', betrag_netto: -50, plan: false },
  ];
  assert.deepEqual(kostenSummen(k), { plan: 870.11, ist: 470.11 });
  assert.deepEqual(kostenSummen([]), { plan: 0, ist: 0 });
});

test('Provision: Arten, Grenzen, Datenbankwerte', () => {
  assert.equal(provision({ art: 'fest', wert: 99.999 }, -5, 0), 100);
  assert.equal(provision({ art: null, wert: 10 }, 1000, 1000), 0);
  assert.equal(provision({ art: 'rohertrag', wert: null }, 1000, 1000), 0);
  assert.deepEqual(provAus('rohertrag', '7.5'), { art: 'rohertrag', wert: 7.5 });
  assert.deepEqual(provAus('hack', 5), { art: null, wert: 5 });
  assert.deepEqual(provAus('fest', -3), { art: 'fest', wert: null });
  assert.deepEqual(provAus('umsatz', ''), { art: 'umsatz', wert: null });
  const h = kalkHinweise({ provV: { art: 'rohertrag', wert: 60 }, provH: ohne, besteuerung: null, kommission: true });
  assert.equal(h.length, 3);
  assert.match(h[0], /ungewöhnlich hoch/);
  assert.equal(kalkHinweise({ provV: { art: 'fest', wert: 900 }, provH: ohne, besteuerung: 'regel', kommission: false }).length, 0, 'fester Betrag ist kein Satz');
});

test('Verdrahtung: SQL, Arten gleich, Reiter, strenge Rechte für Provisionen', () => {
  const sql = lies('supabase-sql/p265-kfz-kalkulation.sql');
  for (const a of KOSTEN_ARTEN) assert.ok(sql.includes(`'${a.key}'`), `Kostenart ${a.key} fehlt im SQL-Check`);
  assert.match(sql, /create table if not exists public\.kfz_bestand_kosten/);
  assert.match(sql, /create table if not exists public\.kfz_bestand_kalk/);
  const kalkTeil = sql.slice(sql.indexOf('kfz_bestand_kalk enable row level security'));
  assert.equal((kalkTeil.match(/darf_ich_abrechnen\(\)/g) ?? []).length, 4, 'jede Mitarbeiter-Regel der Kalkulation verlangt Darf abrechnen (select, insert, update using + check)');
  assert.doesNotMatch(kalkTeil, /for delete/, 'Mitarbeiter löschen keine Kalkulation');
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i);
  const akte = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(akte, /\['kalk', 'Kalkulation'\]/);
  assert.match(akte, /<KfzKalkulation /);
  const komp = lies('app/dashboard/kfz/bestand/KfzKalkulation.tsx');
  assert.match(komp, /rpc\('darf_ich_abrechnen'\)/);
  assert.match(komp, /modul: 'kfz-kalk'/);
  assert.doesNotMatch(komp, /window\.confirm|alert\(/);
  assert.match(lies('lib/guideWissen.ts'), /Reiter „Kalkulation" in der Akte/);
  assert.doesNotMatch(lies('lib/kfzKalkulation.ts'), /Math\.round\([^)]*\* ?1?00\) ?\/ ?1?00/);
});
