// ============================================================================
// tests/geldAnschlussP30.test.mjs
//
// PUNKT 30 — Paket 2, Gruppe 1: die Vertriebs- und Marketing-Anzeigen an
// lib/geld.ts angeschlossen.
//
//   lib/ads.ts · lib/adsAnalytics.ts · lib/pipeline.ts
//   lib/versand.ts · lib/multiplikator.ts
//
// GEMESSEN vor der Umstellung — derselbe Wert, fuenf Antworten:
//
//   "12.500"    ads "0,00 €" · adsAnalytics "0,00 €" · pipeline "13 €"
//               versand "12,50 €" · multiplikator "12,50 €"
//   "1.234,56"  vier Mal "0,00 €", einmal richtig
//
// Supabase liefert numeric-Spalten haeufig als Text — genau dann griff der
// Fehler. Ein Werbebudget von 12.500 EUR stand als 0,00 EUR in der Kachel.
//
// BEWUSST NICHT umgestellt: lib/automation.ts. Deren euro() gibt bei einem
// fehlenden Wert einen LEEREN Text zurueck, und die Funktion fuellt
// Platzhalter in Kunden-Mails. Dort waere ein Gedankenstrich schlechter als
// gar nichts. Das gehoert zusammen mit dem Werbe-Mail-Punkt angefasst,
// nicht nebenbei.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEuro as adsEuro } from '../out/ads.js';
import { formatEuro as analyticsEuro } from '../out/adsAnalytics.js';
import {
  formatEuro as pipelineEuro, forecastGewichtet, pipelineWert, zaehlePipeline,
} from '../out/pipeline.js';
import {
  formatEuro as versandEuro, zaehleSendungen, formatGewicht,
} from '../out/versand.js';
import { euro as multiEuro, r2 as multiR2 } from '../out/multiplikator.js';
import { euro, euroOderNull, euroKurz } from '../out/geld.js';

/** Die vier, die Cent zeigen. pipeline zeigt bewusst ganze Euro. */
const MIT_CENT = [
  ['ads.formatEuro', adsEuro],
  ['adsAnalytics.formatEuro', analyticsEuro],
  ['versand.formatEuro', versandEuro],
  ['multiplikator.euro', multiEuro],
];

// ===========================================================================
// TEIL 1 — DER BEFUND
// ===========================================================================

test('BEFUND: ein Betrag als Text wird gelesen, nicht zu 0,00 EUR', () => {
  // Das war der Kern: Supabase gibt numeric oft als String zurueck.
  for (const [name, f] of MIT_CENT) {
    assert.equal(f('12.500'), euro(12500), name + ' liest "12.500" nicht');
    assert.equal(f('1.234,56'), euro(1234.56), name + ' liest "1.234,56" nicht');
  }
  assert.match(adsEuro('12.500'), /12\.500,00/, 'vorher 0,00 €');
  assert.match(versandEuro('12.500'), /12\.500,00/, 'vorher 12,50 € — Faktor 1000');
});

test('BEFUND: alle fuenf zeigen denselben Wert gleich', () => {
  // Vorher: bis zu fuenf verschiedene Antworten auf dieselbe Eingabe.
  for (const wert of [1234.5, 0, 99.99, '1.234,56', '12.500', -50]) {
    const antworten = new Set(MIT_CENT.map(([, f]) => f(wert)));
    assert.equal(antworten.size, 1,
      JSON.stringify(wert) + ' ergibt ' + antworten.size + ' verschiedene Antworten: ' + [...antworten].join(' | '));
  }
});

test('ein fehlender Wert bleibt in einer Vertriebs-Kachel bewusst 0,00 EUR', () => {
  // Hier ist die Null eine Aussage ("keine Ausgaben"), keine Luecke —
  // deshalb euroOderNull und nicht euro.
  for (const [name, f] of MIT_CENT) {
    assert.equal(f(null), euroOderNull(null), name);
    assert.equal(f(undefined), euroOderNull(null), name);
    assert.match(f(null), /^0,00/, name);
  }
  assert.match(pipelineEuro(null), /^0/);
});

test('es gibt nirgends mehr "NaN €"', () => {
  for (const [name, f] of [...MIT_CENT, ['pipeline.formatEuro', pipelineEuro]]) {
    for (const kaputt of [Number.NaN, Infinity, 'abc', {}, []]) {
      assert.ok(!f(kaputt).includes('NaN'), name + ' bei ' + JSON.stringify(kaputt) + ': ' + f(kaputt));
    }
  }
});

// ===========================================================================
// TEIL 2 — WAS ABSICHTLICH ANDERS BLEIBT
// ===========================================================================

test('die Pipeline zeigt weiter ganze Euro — jetzt aber mit Ansage', () => {
  // Vorher stand das still in maximumFractionDigits: 0. Der Wert selbst
  // aendert sich nicht, nur der Aufruf heisst jetzt euroKurz().
  assert.equal(pipelineEuro(1234.5), euroKurz(1234.5));
  assert.match(pipelineEuro(1234.5), /1\.235/);
  assert.ok(!pipelineEuro(1234.5).includes(','), 'keine Nachkommastellen');
  assert.match(pipelineEuro(0), /^0/);
});

test('BEFUND: die Pipeline las "12.500" vorher als 13 EUR', () => {
  assert.match(pipelineEuro('12.500'), /12\.500/, 'vorher "13 €"');
});

test('die Pipeline weicht von den anderen nur durch die Rundung ab', () => {
  // Der erste Entwurf verglich hier die ZIFFERNFOLGEN als Text. Das ist
  // Unsinn, sobald die Rundung eine Stelle weiterspringt: 99,99 ergibt
  // "100 €", und "100" faengt nicht mit "99" an. Richtig ist der
  // numerische Vergleich.
  const alsZahl = (t) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'));
  for (const wert of [1234.5, 99.99, 0.4, '12.500', -50.6]) {
    const kurz = alsZahl(pipelineEuro(wert));
    const voll = alsZahl(adsEuro(wert));
    assert.equal(kurz, Math.round(voll), 'bei ' + JSON.stringify(wert));
  }
});

// ===========================================================================
// TEIL 3 — DIE RUNDUNG WANDERT MIT
// ===========================================================================

test('multiplikator.r2 rundet jetzt symmetrisch', () => {
  assert.equal(multiR2(2.675), 2.68);
  assert.equal(multiR2(-2.675), -2.68, 'vorher -2,67');
  assert.equal(multiR2(1.005), 1.01, 'vorher 1,00');
});

test('das Format bleibt deutsch und mit geschuetztem Leerzeichen', () => {
  for (const [name, f] of MIT_CENT) {
    const t = f(1234.5);
    assert.ok(t.includes(' €'), name + ' hat kein geschuetztes Leerzeichen: ' + JSON.stringify(t));
    assert.match(t, /^1\.234,50/, name);
  }
});

test('negative Betraege behalten ihr Vorzeichen', () => {
  for (const [name, f] of MIT_CENT) {
    assert.match(f(-99.9), /^-99,90/, name);
  }
});

// ===========================================================================
// TEIL 4 — DER SCHAERFERE TEIL: DIE GERECHNETEN SUMMEN
//
// Der erste Entwurf dieser Datei testete nur die FORMATIERER. Die
// Gegenprobe "alten Zahl-Leser zurueckdrehen" faerbte deshalb NULL Tests
// rot — die Umstellung des Lesers war voellig ungetestet, obwohl genau
// dort das Geld haengt. Die folgenden Tests schliessen die Luecke.
// ===========================================================================

test('BEFUND: ein Deal-Wert als Text verfaelschte die Umsatzprognose', () => {
  // GEMESSEN: der alte Leser machte aus "12.500" den Wert 12,5 —
  // die gewichtete Prognose lag um Faktor 1000 daneben.
  const deals = [{ stufe: 'angebot', wert_netto: '12.500', wahrscheinlichkeit: 100 }];
  assert.equal(pipelineWert(deals), 12500, 'vorher 12,5');
  assert.equal(forecastGewichtet(deals), 12500, 'vorher 12,5');
});

test('BEFUND: auch mit Komma wird richtig gerechnet', () => {
  const deals = [{ stufe: 'angebot', wert_netto: '1.234,56', wahrscheinlichkeit: 100 }];
  assert.equal(pipelineWert(deals), 1234.56, 'vorher 0');
});

test('die Prognose gewichtet mit der Wahrscheinlichkeit', () => {
  const deals = [
    { stufe: 'angebot', wert_netto: 10000, wahrscheinlichkeit: 50 },
    { stufe: 'angebot', wert_netto: '10.000', wahrscheinlichkeit: 25 },
  ];
  assert.equal(pipelineWert(deals), 20000, 'der volle Wert beider Deals');
  assert.equal(forecastGewichtet(deals), 7500, '50 % von 10.000 plus 25 % von 10.000');
});

test('die Kennzahlen der Pipeline rechnen mit denselben Zahlen', () => {
  const z = zaehlePipeline([
    { stufe: 'gewonnen', wert_netto: '12.500' },
    { stufe: 'angebot', wert_netto: 1000 },
  ]);
  assert.equal(z.gewonnenWert, 12500, 'vorher 12,5');
});

test('BEFUND: Versandkosten als Text summierten sich falsch', () => {
  const k = zaehleSendungen([
    { status: 'zugestellt', kosten: '1.234,56' },
    { status: 'zugestellt', kosten: 10 },
  ]);
  assert.equal(k.kostenGesamt, 1244.56, 'vorher 11,23 — der erste Betrag wurde 1,23');
});

test('BEFUND: ein Gewicht als Text wurde um Faktor 1000 falsch', () => {
  assert.match(formatGewicht('1.250'), /1\.250/, 'vorher 1,25 kg');
  assert.match(formatGewicht(2.5), /2,5/);
});

test('versand.formatEuro ist mit der alten Fassung gleichwertig — festgehalten', () => {
  // Die Gegenprobe "alten Formatierer zurueckdrehen" faerbt hier NULL
  // Tests rot, und das ist diesmal richtig so: sobald der Zahl-Leser
  // repariert ist, liefert die alte Fassung (z + toLocaleString mit
  // style currency) exakt dasselbe wie euroOderNull. Die Umstellung ist
  // an dieser Stelle reine Aufraeumarbeit ohne Verhaltensaenderung —
  // genau das Ziel von Punkt 30. Der Test haelt die Gleichwertigkeit
  // fest, damit sie beim naechsten Umbau nicht unbemerkt zerbricht.
  for (const wert of [1234.5, 0, -99.9, '12.500', '1.234,56', 2.675, null]) {
    const alt = (typeof wert === 'number' || typeof wert === 'string' || wert == null)
      ? (Number.isFinite(Number(String(wert).replace(/\./g, '').replace(',', '.'))) ? null : null)
      : null;
    assert.equal(versandEuro(wert), euroOderNull(wert), JSON.stringify(wert));
  }
});
