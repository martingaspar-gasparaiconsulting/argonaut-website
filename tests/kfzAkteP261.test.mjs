// ============================================================================
// tests/kfzAkteP261.test.mjs — Paket 261 (07.10.2026) · K2 Handelsakte
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  co2KlasseVorschlag, pflichtFehlt, titelPruefen, titelVorschlag, inseratAmpel, merkmaleBereinigen, preisVerlauf,
  istElektro, istPlugIn, AUSSTATTUNG,
} from '../out/kfzAkte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const voll = (x = {}) => ({
  marke: 'Porsche', modell: '911', vk_brutto: 134900, status: 'bestand', kraftstoff: 'Benzin', verbrauch_komb: 10.9,
  verbrauch_einheit: 'l', co2_g_km: 247, co2_klasse: 'G', vorschaden: 'keine_bekannt',
  inserat_titel: 'Porsche 911 Carrera S | 450 PS | Benzin', inserat_text: 'x'.repeat(220), inseriert: true,
  ausstattung: ['A', 'B', 'C', 'D', 'E'], fotos: 14, ...x,
});

test('CO₂-Klasse: Stufen, Grenzen, Elektro, Plug-in ohne Vorschlag', () => {
  assert.equal(co2KlasseVorschlag(0, 'Elektro'), 'A');
  assert.equal(co2KlasseVorschlag(95), 'B');
  assert.equal(co2KlasseVorschlag(96), 'C');
  assert.equal(co2KlasseVorschlag(115), 'C');
  assert.equal(co2KlasseVorschlag(135), 'D');
  assert.equal(co2KlasseVorschlag(155), 'E');
  assert.equal(co2KlasseVorschlag(175), 'F');
  assert.equal(co2KlasseVorschlag(176), 'G');
  assert.equal(co2KlasseVorschlag(40, 'Plug-in-Hybrid'), null);
  assert.equal(co2KlasseVorschlag(null), null);
  assert.equal(co2KlasseVorschlag(-1), null);
  assert.ok(istElektro('Elektro') && !istElektro('Benzin, Mild-Hybrid') && !istElektro('Plug-in-Hybrid (Elektro/Benzin)'));
  assert.ok(istPlugIn('PHEV'));
});

test('Pflichtangaben: was fehlt, wird genannt', () => {
  assert.deepEqual(pflichtFehlt(voll()), []);
  assert.deepEqual(pflichtFehlt(voll({ kraftstoff: ' ', co2_g_km: null })), ['Kraftstoff bzw. Antrieb', 'CO₂-Emissionen (g/km)']);
  assert.equal(pflichtFehlt(voll({ co2_g_km: 0, kraftstoff: 'Elektro' })).length, 0, '0 g/km ist ein Wert, kein Fehlen');
});

test('Titel-Wächter', () => {
  assert.equal(titelPruefen('Porsche 911 Carrera S | 450 PS', null)[0].stufe, 'ok');
  assert.equal(titelPruefen('', null)[0].stufe, 'warn');
  assert.equal(titelPruefen(null, null)[0].stufe, 'warn');
  const u = titelPruefen('Golf GTI unfallfrei', 'unbekannt');
  assert.ok(u.some((h) => h.stufe === 'bad'));
  assert.ok(!titelPruefen('Golf GTI unfallfrei', 'keine_bekannt').some((h) => h.stufe === 'bad'));
  assert.ok(titelPruefen('TOP ZUSTAND!!', null).length >= 3);
  assert.ok(titelPruefen('x'.repeat(61), null).some((h) => /61 Zeichen/.test(h.text)));
  assert.ok(titelPruefen('Golf mit Garantie', null).some((h) => /Garantie/.test(h.text)));
  assert.equal(titelVorschlag({ marke: 'BMW', modell: 'M340i', variante: null, ps: 374, kraftstoff: 'Benzin' }), 'BMW M340i | 374 PS | Benzin');
});

test('Inserats-Ampel', () => {
  const a = inseratAmpel(voll());
  assert.equal(a.prozent, 100);
  assert.equal(a.stufe, 'ok');
  const b = inseratAmpel(voll({ fotos: 0, co2_klasse: null }));
  assert.equal(b.prozent, 45);
  assert.equal(b.stufe, 'bad');
  const c = inseratAmpel(voll({ inserat_titel: 'Golf unfallfrei', vorschaden: null }));
  assert.equal(c.punkte.find((p) => p.name === 'Titel').ok, false);
  assert.equal(c.prozent, 85, 'unzulässiger Titel zählt 0');
  const leer = inseratAmpel({ marke: null, modell: null, vk_brutto: null, status: 'zulauf', kraftstoff: null, verbrauch_komb: null, verbrauch_einheit: null, co2_g_km: null, co2_klasse: null, vorschaden: null, inserat_titel: null, inserat_text: null, inseriert: null, ausstattung: null, fotos: null });
  assert.equal(leer.prozent, 0);
});

test('Ausstattung und Preisverlauf', () => {
  assert.deepEqual(merkmaleBereinigen([' Navi ', 'navi', '', null, 'Sitzheizung vorn']), ['Navi', 'Sitzheizung vorn']);
  assert.ok(AUSSTATTUNG.length >= 5 && AUSSTATTUNG.every((g) => g.merkmale.length >= 5));
  const v = preisVerlauf([
    { vk_alt: 137500, vk_neu: 134900, geaendert_am: '2026-08-01T10:00:00Z' },
    { vk_alt: null, vk_neu: 139900, geaendert_am: '2026-06-02T10:00:00Z' },
    { vk_alt: 139900, vk_neu: 137500, geaendert_am: '2026-07-01T10:00:00Z' },
  ]);
  assert.deepEqual(v.punkte.map((p) => p.preis), [139900, 137500, 134900]);
  assert.equal(v.gesenkt, 5000);
  assert.equal(preisVerlauf([{ vk_alt: null, vk_neu: 1, geaendert_am: '2026-01-01' }]).gesenkt, null);
  assert.deepEqual(preisVerlauf([]).punkte, []);
});

test('SQL 261 additiv, Seite und Verknüpfung', () => {
  const q = lies('supabase-sql/p261-kfz-akte.sql');
  assert.doesNotMatch(q, /drop |truncate|delete from|create policy/i);
  assert.equal((q.match(/add column if not exists/g) || []).length, 12);
  assert.match(q, /co2_klasse in \('A', 'B', 'C', 'D', 'E', 'F', 'G'\)/);
  const a = lies('app/dashboard/kfz/bestand/[id]/page.tsx');
  assert.match(a, /useParams/);
  assert.match(a, /titelPruefen\(ins\.titel/);
  assert.match(a, /co2KlasseVorschlag/);
  assert.doesNotMatch(a, /co2_klasse: vorschlagKlasse/, 'Klasse wird nie still gesetzt, nur per Knopf übernommen');
  assert.doesNotMatch(a, /\bdu\b|\bdein|KI-Agent/i);
  const b = lies('app/dashboard/kfz/bestand/page.tsx');
  assert.match(b, /window\.location\.href = `\/dashboard\/kfz\/bestand\/\$\{b\.id\}`/);
  assert.match(b, /get\('bearbeiten'\)/);
});
