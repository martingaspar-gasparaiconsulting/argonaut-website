// Paket 321 (11.10.2026): R1 Rezeptur in Prozent — Anteile, Einwaage, Kosten
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TYP_MISCHUNG, istMischung, einheitInfo, inBasis, anteileAufloesen, einwaage, anteileAusMengen,
  preisJeBasis, kosten, augeMischung,
} from '../out/rezepturProzent.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const summe = (a) => a.reduce((s, v) => s + v, 0);

test('Typ und Einheiten: Masse und Volumen, Stück nicht', () => {
  assert.equal(TYP_MISCHUNG, 'mischung');
  assert.ok(istMischung('mischung'));
  assert.ok(!istMischung('teig'));
  assert.deepEqual([einheitInfo('kg').faktor, einheitInfo(' Gramm ').faktor, einheitInfo('t').faktor], [1, 0.001, 1000]);
  assert.equal(einheitInfo('Liter').basis, 'l');
  assert.equal(einheitInfo('m³').faktor, 1000);
  assert.equal(einheitInfo('Stk'), null);
  assert.equal(einheitInfo(''), null);
  assert.equal(inBasis(250, 'g'), 0.25);
  assert.equal(inBasis(1, 'Stk'), null);
});

test('Anteile: ad 100 füllt genau auf, ohne Gleitkomma-Rest', () => {
  const r = anteileAufloesen([
    { bezeichnung: 'Tensid', anteil: 12.5 },
    { bezeichnung: 'Duft', anteil: 0.3 },
    { bezeichnung: 'Konservierer', anteil: 0.1 },
    { bezeichnung: 'Wasser', anteil: null, istRest: true },
  ]);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.anteile, [12.5, 0.3, 0.1, 87.1]);
  assert.equal(r.summe, 100);
  const drittel = anteileAufloesen([{ anteil: 33.3333 }, { anteil: 33.3333 }, { anteil: 33.3334 }]);
  assert.equal(drittel.status, 'ok', '33,3333 + 33,3333 + 33,3334 = genau 100');
});

test('Anteile: zu wenig, zu viel, Fehler', () => {
  const w = anteileAufloesen([{ anteil: 40 }, { anteil: 50 }]);
  assert.equal(w.status, 'zuWenig');
  assert.equal(w.differenz, 10);
  const v = anteileAufloesen([{ anteil: 60 }, { anteil: 50.5 }]);
  assert.equal(v.status, 'zuViel');
  assert.equal(v.differenz, -10.5);
  const zweiRest = anteileAufloesen([{ anteil: 10 }, { anteil: null, istRest: true }, { anteil: null, istRest: true }]);
  assert.equal(zweiRest.status, 'fehler');
  assert.match(zweiRest.fehler[0], /Nur eine Zeile/);
  const ueber = anteileAufloesen([{ bezeichnung: 'A', anteil: 70 }, { bezeichnung: 'B', anteil: 40 }, { anteil: null, istRest: true }]);
  assert.equal(ueber.status, 'fehler');
  assert.match(ueber.fehler.join(' '), /schon 110 %/);
  const neg = anteileAufloesen([{ bezeichnung: 'X', anteil: -5 }, { anteil: null, istRest: true }]);
  assert.match(neg.fehler.join(' '), /X: Anteil darf nicht negativ/);
});

test('Einwaage: Summe ergibt GENAU den Ansatz (Rundungsausgleich)', () => {
  const a = [33.3333, 33.3333, 33.3334];
  const e = einwaage(a, 1, 3);
  assert.deepEqual(e, [0.333, 0.333, 0.334]);
  assert.equal(Math.round(summe(e) * 1000), 1000);
  const r = anteileAufloesen([{ anteil: 12.5 }, { anteil: 0.3 }, { anteil: 0.1 }, { anteil: null, istRest: true }]);
  const e2 = einwaage(r.anteile, 250, 3);
  assert.deepEqual(e2, [31.25, 0.75, 0.25, 217.75]);
  // krumme Ansatzgröße: Summe trotzdem exakt
  const e3 = einwaage([17.1, 22.9, 60], 7.777, 3);
  assert.equal(Math.round(summe(e3) * 1000), 7777);
  // nicht 100 %: keine Verteilung, jede Zeile einzeln
  assert.deepEqual(einwaage([40, 50], 10, 3), [4, 5]);
  assert.deepEqual(einwaage([50, 50], 0, 3), [0, 0]);
});

test('Mengen-Rezept → Anteile: genau 100 %, Einheiten umgerechnet', () => {
  const r = anteileAusMengen([{ menge: 1, einheit: 'kg' }, { menge: 500, einheit: 'g' }, { menge: 1.5, einheit: 'kg' }]);
  assert.deepEqual(r.anteile, [33.3333, 16.6667, 50]);
  assert.equal(Math.round(summe(r.anteile) * 10000), 1000000);
  const drei = anteileAusMengen([{ menge: 1, einheit: 'kg' }, { menge: 1, einheit: 'kg' }, { menge: 1, einheit: 'kg' }]);
  assert.equal(Math.round(summe(drei.anteile) * 10000), 1000000);
  assert.equal(anteileAusMengen([{ menge: 1, einheit: 'kg' }, { menge: 1, einheit: 'l' }]).anteile, null);
  assert.match(anteileAusMengen([{ menge: 1, einheit: 'kg' }, { menge: 1, einheit: 'l' }]).grund, /Dichte/);
  assert.equal(anteileAusMengen([{ menge: 2, einheit: 'Stk' }]).anteile, null);
  assert.equal(anteileAusMengen([{ menge: null }]).anteile, null);
});

test('Preis aus dem Artikel: €/g → €/kg, kg ↔ l nie', () => {
  assert.equal(preisJeBasis(0.012, 'g', 'kg'), 12);
  assert.equal(preisJeBasis(450, 't', 'kg'), 0.45);
  assert.equal(preisJeBasis(2.5, 'kg', 't'), 2.5, 'Preis gilt je Basis (kg), auch wenn der Ansatz in t steht');
  assert.equal(preisJeBasis(3, 'l', 'ml'), 3);
  assert.equal(preisJeBasis(3, 'l', 'kg'), null);
  assert.equal(preisJeBasis(3, 'Stk', 'kg'), null);
  assert.equal(preisJeBasis(null, 'kg', 'kg'), null);
});

test('Kosten: je kg, je Ansatz, nach Verlust, je Gebinde', () => {
  const k = kosten({ anteile: [12.5, 0.3, 0.1, 87.1], preise: [2.4, 38, 12, 0.004], ansatz: 1000, ansatzEinheit: 'kg', verlustProzent: 2, gebindeMenge: 5, gebindeKosten: 0.85 });
  assert.equal(k.basis, 'kg');
  // 0,125·2,4 + 0,003·38 + 0,001·12 + 0,871·0,004 = 0,3 + 0,114 + 0,012 + 0,003484 = 0,429484
  assert.equal(k.jeBasisRoh, 0.4295);
  assert.equal(k.ansatzKosten, 429.48);
  assert.equal(k.ausbringung, 980);
  assert.equal(k.jeBasisFertig, 0.4382);
  assert.equal(k.gebindeAnzahl, 196);
  assert.equal(k.gebindeRest, 0);
  assert.equal(k.kostenJeGebinde, 3.04, '5 × 0,43825 + 0,85');
  assert.equal(k.fehlendePreise, 0);
});

test('Kosten: Gebinde ohne Gleitkomma-Fehler, Ansatz in g, fehlende Preise', () => {
  const k = kosten({ anteile: [100], preise: [10], ansatz: 10, ansatzEinheit: 'kg', gebindeMenge: 0.2 });
  assert.equal(k.gebindeAnzahl, 50, '10 / 0,2 = 50, nicht 49');
  const klein = kosten({ anteile: [100], preise: [10], ansatz: 0.3, ansatzEinheit: 'kg', gebindeMenge: 0.1 });
  assert.equal(klein.gebindeAnzahl, 3, '0,3 / 0,1 = 3, nicht 2 (Gleitkomma)');
  assert.equal(klein.gebindeRest, 0);
  const g = kosten({ anteile: [50, 50], preise: [20, null], ansatz: 500, ansatzEinheit: 'g' });
  assert.equal(g.jeBasisRoh, 10);
  assert.equal(g.ansatzKosten, 5, '0,5 kg × 10 €/kg');
  assert.equal(g.fehlendePreise, 1);
  assert.match(g.hinweise[0], /ohne Preis/);
  const stk = kosten({ anteile: [100], preise: [1], ansatz: 5, ansatzEinheit: 'Stk' });
  assert.equal(stk.jeBasisRoh, null);
  const bad = kosten({ anteile: [100], preise: [1], ansatz: 5, ansatzEinheit: 'kg', verlustProzent: 100 });
  assert.equal(bad.ausbringung, null);
});

test('Regel-Auge: leer, falsch, stimmig', () => {
  assert.equal(augeMischung({ status: 'ok', differenz: 0, fehler: [], zeilen: 0, fehlendePreise: 0, jeBasisRoh: null, basis: 'kg' }).stimmung, 'neutral');
  const w = augeMischung({ status: 'zuWenig', differenz: 2.5, fehler: [], zeilen: 3, fehlendePreise: 0, jeBasisRoh: 1, basis: 'kg' });
  assert.equal(w.stimmung, 'achtung');
  assert.match(w.klartext, /fehlen 2,5 %/);
  const g = augeMischung({ status: 'ok', differenz: 0, fehler: [], zeilen: 3, fehlendePreise: 0, jeBasisRoh: 0.43, basis: 'kg' });
  assert.equal(g.stimmung, 'gut');
  assert.doesNotMatch(g.klartext + g.punkte.join(' '), /\bdu\b|\bdein/i);
});

test('Seite: Mischung nutzt die Logik, keine Charge ins Lebensmittel-Modul, kein eigener Runder', () => {
  const s = lies('app/dashboard/rezeptur/page.tsx');
  assert.match(s, /from '@\/lib\/rezepturProzent'/);
  assert.match(s, /anteil_prozent/);
  assert.match(s, /ist_rest/);
  assert.match(s, /!mischung && \(?\s*<button onClick=\{chargeErzeugen\}/);
  const lib = lies('lib/rezepturProzent.ts');
  assert.doesNotMatch(lib.replace(/\/\/.*$/gm, ''), /Math\.round\([^)]*\*\s*100\)\s*\/\s*100/);
  const sql = lies('supabase-sql/p321-rezeptur-prozent.sql');
  assert.match(sql, /add column if not exists anteil_prozent/);
  assert.match(sql, /p321_rezeptur_zutat_waechter/);
  assert.doesNotMatch(sql, /\bdrop (table|column)\b/i);
});
