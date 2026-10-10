// ============================================================================
// tests/kfzEmpfehlungP308.test.mjs — Paket 308 (10.10.2026) · FM4
// Bewertungs-Empfehlung: nur belegte Daten (Marktvergleich, DAT/Schwacke),
// Zu-/Abschläge des Autohauses, Rechenweg, keine KI, ehrlich bei zu wenig Daten.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  empfehlung, zuschlaegeBereinigen, besichtigungBereinigen, merkmalWerte, hatZuschlaege, begruendungText, MERKMALE, PROZENT_MAX, SUMME_MAX,
} from '../out/kfzEmpfehlung.js';
import { zuBestand } from '../out/kfzAnkauf.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HEUTE = '2026-10-10';
const v = (preis, km = 60000, tage = 1) => ({ preis, km, erstzulassung: '2020-03-01', erfasst_am: `2026-10-${String(10 - tage).padStart(2, '0')}` });
const KOSTEN = { schaeden: 300, aufbereitung: 400, sonstige: 0, standtagePlan: 30, standkostenTag: 10, marge: 1500, verkaeuferArt: 'privat' };
const FZ = { km: 60000, erstzulassung: '2020-03-01' };
const basis = { fahrzeug: FZ, vergleiche: [v(15000), v(16000), v(17000)], dat: null, merkmale: {}, zuschlaege: {}, kosten: KOSTEN, heuteIso: HEUTE };

test('Zu wenig Daten: keine Empfehlung, ehrlicher Hinweis, nichts erfunden', () => {
  const e = empfehlung({ ...basis, vergleiche: [v(15000), v(16000)] });
  assert.equal(e.basis, 'keine');
  assert.equal(e.vk, null);
  assert.equal(e.maxEk, null);
  assert.match(e.hinweise[0], /mindestens 3 aktuelle Angebote ähnlicher Fahrzeuge \(2 vorhanden\)/);
  assert.match(e.begruendung, /Noch keine Empfehlung/);
  // veraltete Vergleiche (über 30 Tage) zählen nicht
  assert.equal(empfehlung({ ...basis, vergleiche: [v(15000, 60000, 40), v(16000), v(17000)].map((x, i) => i === 0 ? { ...x, erfasst_am: '2026-08-01' } : x) }).basis, 'keine');
});

test('Marktmitte als Basis, Rechenweg, max. EK aus der vorhandenen Bewertungsrechnung (§ 25a)', () => {
  const e = empfehlung(basis);
  assert.equal(e.basis, 'markt');
  assert.equal(e.basisWert, 16000);
  assert.deepEqual([e.spanne.q1, e.spanne.q3, e.spanne.anzahl], [15500, 16500, 3]);
  assert.equal(e.vk, 16000);
  // § 25a: 16.000 − (300 + 400 + 300 Standkosten + 1.500) × 1,19 = 13.025 -> 13.020 (volle 10 € abgerundet)
  assert.equal(e.maxEk, 13020);
  assert.ok(e.rechenweg.some((r) => /Marktmitte aus 3 aktuellen Vergleichen: 16\.000 €/.test(r)));
  assert.ok(e.rechenweg.some((r) => /§ 25a/.test(r)));
  assert.match(e.begruendung, /15\.500 € bis 16\.500 €/);
  assert.match(e.begruendung, /Die Entscheidung trifft das Autohaus/);
  // Regelsteuer (Händler mit USt): 16.000 / 1,19 − 2.500 = 10.945,38 -> 10.940 netto
  const r = empfehlung({ ...basis, kosten: { ...KOSTEN, verkaeuferArt: 'gewerblich' } });
  assert.equal(r.besteuerung, 'regel');
  assert.equal(r.maxEk, 10940);
});

test('DAT/Schwacke: Basis nur ohne Markt; mit Markt nur Abgleich; alter Wert gemeldet', () => {
  const dat = { anbieter: 'DAT', ek: 12000, vk: 15500, am: '2026-10-01' };
  const nurDat = empfehlung({ ...basis, vergleiche: [], dat });
  assert.equal(nurDat.basis, 'dat');
  assert.equal(nurDat.vk, 15500);
  const beide = empfehlung({ ...basis, dat });
  assert.equal(beide.basis, 'markt');
  assert.ok(beide.rechenweg.some((r) => /Zum Abgleich DAT-Händler-Verkaufswert 15\.500 €/.test(r)));
  assert.equal(beide.datEkAbweichung, 8.5);   // 13.020 zu 12.000
  const alt = empfehlung({ ...basis, dat: { ...dat, am: '2026-07-01' } });
  assert.ok(alt.hinweise.some((h) => /101 Tage alt/.test(h)));
  // Nur Einkaufswert ohne Verkaufswert: keine Basis (nie aus dem EK hochgerechnet)
  assert.equal(empfehlung({ ...basis, vergleiche: [], dat: { ...dat, vk: null } }).basis, 'keine');
  // Empfohlener Preis immer auf volle 10 €
  assert.equal(empfehlung({ ...basis, vergleiche: [v(15003), v(16004), v(17005)] }).vk, 16000);
  assert.equal(empfehlung({ ...basis, vergleiche: [v(15006), v(16006), v(17006)] }).vk, 16010);
  const weit = empfehlung({ ...basis, dat: { ...dat, vk: 12000 } });
  assert.ok(weit.hinweise.some((h) => /auseinander/.test(h)));
});

test('Zu- und Abschläge des Autohauses: nur gesetzte Merkmale, Rundung auf 10 €, Deckel ±40 %', () => {
  const z = zuschlaegeBereinigen({ serviceheft: { lueckenlos: '3', keins: -5 }, unfall: { ja: '-8,5' }, zustand: { schlecht: -99 }, fremd: { x: 5 }, nichtraucher: { ja: 0 } });
  assert.deepEqual(z, { serviceheft: { lueckenlos: 3, keins: -5 }, unfall: { ja: -8.5 }, zustand: { schlecht: -PROZENT_MAX } });
  assert.equal(hatZuschlaege(z), true);
  assert.equal(hatZuschlaege({}), false);
  const e = empfehlung({ ...basis, zuschlaege: z, merkmale: { serviceheft: 'lueckenlos', unfall: 'ja', zustand: null } });
  assert.equal(e.prozentSumme, -5.5);
  assert.equal(e.vk, 15120);   // 16.000 × 0,945 = 15.120
  assert.deepEqual(e.posten.map((p) => [p.merkmal, p.prozent, p.betrag]), [['serviceheft', 3, 480], ['unfall', -8.5, -1360]]);
  assert.match(e.begruendung, /Für das Fahrzeug spricht: serviceheft lückenlos/);
  assert.match(e.begruendung, /Dagegen: unfall\/vorschaden laut verkäufer ja/);
  const viel = empfehlung({ ...basis, zuschlaege: { serviceheft: { keins: -30 }, unfall: { ja: -30 } }, merkmale: { serviceheft: 'keins', unfall: 'ja' } });
  assert.equal(viel.prozentSumme, -SUMME_MAX);
  assert.equal(viel.gedeckelt, true);
  assert.equal(viel.vk, 9600);
  assert.ok(viel.hinweise.some((h) => /begrenzt/.test(h)));
});

test('Merkmale aus Akte und Besichtigung; Schäden nie als Abschlag', () => {
  const m = merkmalWerte({ serviceheft: 'lueckenlos', vorbesitzer: 4, unfall_angabe: 'unbekannt', historie_ampel: 'warn', empfehlung: { zustand: 'gut', nichtraucher: 'vielleicht', boese: 1 } });
  assert.deepEqual(m, { serviceheft: 'lueckenlos', vorbesitzer: '3plus', unfall: null, historie: 'warn', zustand: 'gut', nichtraucher: null });
  assert.deepEqual(merkmalWerte({ serviceheft: null, vorbesitzer: 1, unfall_angabe: 'ja', historie_ampel: 'dim', empfehlung: null }).historie, null);
  assert.deepEqual(besichtigungBereinigen({ zustand: 'sehr_gut', nichtraucher: 'ja', x: 1 }), { zustand: 'sehr_gut', nichtraucher: 'ja' });
  assert.deepEqual(besichtigungBereinigen('kaputt'), {});
  assert.ok(!MERKMALE.some((x) => /schaden/i.test(x.key)), 'Schäden laufen als Kosten');
  assert.equal(begruendungText({ basis: 'keine', basisWert: null, spanne: null, posten: [], vk: null, maxEk: null, besteuerung: '25a', datName: null }), 'Noch keine Empfehlung — es fehlen belegte Marktdaten.');
});

test('Lohnt sich nicht: Hinweis statt Einkaufspreis', () => {
  const e = empfehlung({ ...basis, kosten: { ...KOSTEN, marge: 20000 } });
  assert.equal(e.maxEk, 0);
  assert.ok(e.hinweise.some((h) => /bleibt kein Einkaufspreis/.test(h)));
});

test('Übernahme in den Bestand: DAT/Schwacke-Werte nur, wenn vorhanden', () => {
  const a = { nr: 'A-1', marke: 'VW', modell: 'Golf', variante: null, fin: null, kennzeichen: null, erstzulassung: null, km_stand: 1, leistung_kw: null, kraftstoff: null, farbe: null,
    vorbesitzer: null, hu_bis: null, unfall_angabe: null, unfall_text: null, verkaeufer_art: 'privat', ankaufpreis: 1000, ziel_vk: 2000, schaeden: [], aufbereitung: null };
  assert.equal('bewertung_vk' in zuBestand(a, HEUTE), false);
  const d = zuBestand({ ...a, bewertung_anbieter: 'dat', bewertung_ek: 900, bewertung_vk: 1900, bewertung_am: '2026-10-09', bewertung_url: null }, HEUTE);
  assert.deepEqual([d.bewertung_anbieter, d.bewertung_ek, d.bewertung_vk, d.bewertung_am], ['dat', 900, 1900, '2026-10-09']);
});

test('Keine KI, keine Modellnamen; Seite und SQL passen', () => {
  const lib = ohneKommentare(lies('lib/kfzEmpfehlung.ts'));
  assert.doesNotMatch(lib, /kiFetch|anthropic|claude-|modellFuer/i);
  const karte = ohneKommentare(lies('app/dashboard/kfz/ankauf/[id]/EmpfehlungKarte.tsx'));
  assert.doesNotMatch(karte, /kiFetch|\/api\/.*ki/i);
  assert.match(karte, /einstellung: \{ \.\.\.aktuell, zuschlaege: z \}/, 'Richtwerte und Online-Schalter bleiben erhalten');
  assert.match(karte, /\{istChef && <button/);
  const seite = lies('app/dashboard/kfz/ankauf/[id]/page.tsx');
  assert.match(seite, /<KfzMarkt fz=\{[^]*bezug="ankauf"/);
  assert.match(seite, /tabelle="kfz_ankauf"/);
  assert.match(seite, /from\('kfz_marktvergleich'\)\.update\(\{ bestand_id: neuId \}\)\.eq\('ankauf_id', a\.id\)\.is\('bestand_id', null\)/);
  const sql = lies('supabase-sql/p308-kfz-empfehlung.sql');
  assert.match(sql, /add column if not exists ankauf_id uuid references public\.kfz_ankauf\(id\) on delete set null/);
  assert.match(sql, /check \(bestand_id is not null or ankauf_id is not null\)/);
  assert.match(sql, /where ankauf_id = old\.id and bestand_id is null/);
  assert.doesNotMatch(sql, /drop table|drop column|drop policy|truncate/i);
});
