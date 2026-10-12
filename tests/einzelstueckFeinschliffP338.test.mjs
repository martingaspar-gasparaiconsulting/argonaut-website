// ============================================================================
// tests/einzelstueckFeinschliffP338.test.mjs — Paket 338 (12.10.2026)
// BV2b Feinschliff: Börsen-Wörter je Art, Inserats-Ampel im Preis-Cockpit, Guide
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boerseWoerter, ampelEinzelstueck } from '../out/einzelstueckBestand.js';
import { inseratAmpel } from '../out/kfzAkte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('Kfz: Börsen-Wörter wortgleich wie vor P338', () => {
  const w = boerseWoerter('kfz');
  assert.equal(w.ueberschrift, 'Unsere Fahrzeuge');
  assert.equal(w.anzahl(1), '1 Fahrzeug');
  assert.equal(w.anzahl(7), '7 Fahrzeuge');
  assert.equal(w.keine, 'Zurzeit sind keine Fahrzeuge eingestellt. Rufen Sie uns gern an — vieles ist auch kurzfristig verfügbar.');
  assert.equal(w.keinPasst, 'Kein Fahrzeug passt zu diesem Filter.');
  assert.equal(w.alle, '← Alle Fahrzeuge');
  assert.equal(w.anfrage, 'Anfrage zu diesem Fahrzeug');
  assert.equal(w.angebot, 'Fahrzeugangebot');
  assert.equal(w.metaTitel, 'Fahrzeuge von');
  assert.equal(w.hersteller, 'Marke');
  assert.equal(w.kmSort, true);
  assert.equal(w.kraftstoff, true);
  // unbekannte oder fehlende Art -> Kfz
  assert.deepEqual(Object.keys(boerseWoerter(undefined)), Object.keys(w));
  assert.equal(boerseWoerter(undefined).ueberschrift, 'Unsere Fahrzeuge');
  assert.equal(boerseWoerter('quatsch').alle, '← Alle Fahrzeuge');
});

test('Einzelstücke: Wörter der Art, Genus stimmt', () => {
  const b = boerseWoerter('boot');
  assert.equal(b.ueberschrift, 'Unsere Boote');
  assert.equal(b.anzahl(1), '1 Boot');
  assert.equal(b.anzahl(3), '3 Boote');
  assert.equal(b.keinPasst, 'Kein Boot passt zu diesem Filter.');
  assert.equal(b.alle, '← Alle Boote');
  assert.equal(b.anfrage, 'Anfrage zu diesem Boot');
  assert.equal(b.kmSort, false, 'Boote haben Betriebsstunden');
  assert.equal(b.kraftstoff, false);
  const m = boerseWoerter('maschine');
  assert.equal(m.keinPasst, 'Keine Maschine passt zu diesem Filter.');
  assert.equal(m.anfrage, 'Anfrage zu dieser Maschine');
  assert.equal(m.hersteller, 'Hersteller');
  assert.equal(boerseWoerter('uhr_schmuck').ueberschrift, 'Unsere Stücke');
  assert.equal(boerseWoerter('kunst_antik').hersteller, 'Künstler / Manufaktur');
  assert.equal(boerseWoerter('fahrrad').kmSort, true, 'Räder zählen km');
  assert.equal(boerseWoerter('sonstig').anzahl(1), '1 Artikel');
  for (const a of ['boot', 'maschine', 'uhr_schmuck', 'kunst_antik', 'fahrrad', 'sonstig']) {
    const w = boerseWoerter(a);
    assert.ok(!/Fahrzeug/.test([w.ueberschrift, w.keine, w.keinPasst, w.alle, w.anfrage, w.metaTitel, w.angebot].join(' ')), a);
  }
});

test('Ampel im Preis-Cockpit wie in der Akte', () => {
  // ohne SQL p332: immer Kfz-Wertung
  assert.equal(ampelEinzelstueck({ art: 'boot', merkmale: { laenge_m: 8 } }, 'boot', false), null);
  // Kfz bleibt Kfz
  assert.equal(ampelEinzelstueck({ art: 'kfz' }, 'boot', true), null);
  // Boot: Merkmale zählen
  assert.deepEqual(ampelEinzelstueck({ art: 'boot', merkmale: { laenge_m: 8, rumpf: 'GFK', unbekannt: 1 } }, null, true), { merkmale: 2 });
  // Art fehlt am Stück -> Art des Betriebs
  assert.deepEqual(ampelEinzelstueck({ art: null, merkmale: { material: 'Gold' } }, 'uhr_schmuck', true), { merkmale: 1 });
  assert.deepEqual(ampelEinzelstueck({ merkmale: null }, 'kunst_antik', true), { merkmale: 0 });
  // Wirkung: Boot mit 3 Merkmalen bekommt die 25 Punkte, die Kfz-Wertung (CO₂ fehlt) nicht
  const a = { fotos: 12, inserat_titel: 'Bavaria 32 Cruiser gepflegt', inserat_text: 'x'.repeat(200), vk_brutto: 50000, ausstattung: ['a', 'b', 'c', 'd', 'e'], vorschaden: null };
  const kfz = inseratAmpel(a, null).prozent;
  const boot = inseratAmpel(a, ampelEinzelstueck({ art: 'boot', merkmale: { laenge_m: 9, rumpf: 'GFK', antrieb: 'Segel' } }, null, true)).prozent;
  assert.equal(boot - kfz, 25);
});

test('Quelltext: Börse, Seiten, Preis-Cockpit und Guide hängen an', () => {
  const ans = lies('app/fahrzeuge/BoerseAnsichten.tsx');
  assert.ok(ans.includes('boerseWoerter(ctx.art)'));
  for (const alt of ['>Unsere Fahrzeuge<', '>← Alle Fahrzeuge<', 'Kein Fahrzeug passt zu diesem Filter.', '>Anfrage zu diesem Fahrzeug<']) assert.ok(!ans.includes(alt), alt);
  assert.ok(ans.includes('{w.kmSort && <option value="km">'));
  for (const p of ['app/fahrzeuge/[kennung]/page.tsx', 'app/fahrzeuge/[kennung]/[id]/page.tsx', 'app/fahrzeuge-domain/[host]/page.tsx', 'app/fahrzeuge-domain/[host]/[id]/page.tsx']) {
    const s = lies(p);
    assert.ok(s.includes('betriebArt(db, b.betrieb)') && /firma, basis, art/.test(s), p);
  }
  const laden = lies('lib/kfzBoerseLaden.ts');
  assert.match(laden, /export async function betriebArt[\s\S]*?catch \{\s*return 'kfz';/, 'fail-soft');
  assert.ok(lies('app/fahrzeuge/BoerseTeile.tsx').includes("firma.name || angebot || 'Fahrzeugangebot'"));
  const pr = lies('app/dashboard/kfz/preise/page.tsx');
  assert.ok(pr.includes("select(SPALTEN + ', art, merkmale')"));
  assert.ok(pr.includes('ampelEinzelstueck(f, artInfo.betriebArt, artInfo.mitArt)'));
  assert.ok(/mitArt \? f0 : await supabase\.from\('kfz_bestand'\)\.select\(SPALTEN\)/.test(pr), 'Rückfall ohne p332');
  const g = lies('lib/guideWissen.ts');
  assert.ok(g.includes('Einzelstücke statt Fahrzeuge:'));
  assert.ok(g.includes('Händler von Einzelstücken (Boote'));
  assert.ok(g.includes('Die Spalte „Inserat" zählt wie in der Akte die eingetragenen Merkmale'));
});
