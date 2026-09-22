// ARGONAUT OS · tests/andockNachkalkulationA7.test.mjs — A7 (22.09.2026)
// Die drei Andockpunkte der Nachkalkulation sind angeschlossen: ohne
// Selbstkostensatz sagt die Seite die Wahrheit, mit Satz rechnet sie richtig.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baueKalkulation, summeKalk, margeKlartext, fixpreisHinweise, lohnHinweise,
} from '../out/nachkalkulation.js';

const PROJEKTE = [
  { id: 'p1', name: 'Dachsanierung', budget: 10000 },
  { id: 'p2', name: 'Ohne Budget', budget: 0 },
];
const LEISTUNGEN = [
  { projekt_id: 'p1', stunden: 100, stundensatz: 60, abgerechnet: false },
  { projekt_id: 'p2', stunden: 20, stundensatz: 60, abgerechnet: false },
];
const KOSTEN = [{ projekt_id: 'p1', betrag: 1000 }];

test('OHNE Selbstkostensatz: die Seite nennt die Zahl beim Namen', () => {
  const k = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN);
  const s = summeKalk(k);
  assert.equal(s.lohnkostenAngesetzt, false);
  const t = margeKlartext(s);
  assert.match(t, /NICHT die Marge/);
  assert.match(t, /Selbstkostensatz/);
});

test('MIT Selbstkostensatz: der echte Deckungsbeitrag ist kleiner als Umsatz minus Material', () => {
  const k = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 42.5 });
  const s = summeKalk(k);
  assert.equal(s.lohnkostenAngesetzt, true);
  assert.ok(s.lohnkosten > 0, 'Lohnkosten muessen angesetzt sein');
  assert.ok(
    s.deckungsbeitragEcht < s.deckungsbeitrag,
    `echt ${s.deckungsbeitragEcht} muesste unter ${s.deckungsbeitrag} liegen`,
  );
  // 120 Stunden x 42,50 = 5.100 EUR Lohnkosten
  assert.equal(s.lohnkosten, 120 * 42.5);
  assert.ok(!/NICHT die Marge/.test(margeKlartext(s)));
});

test('ein Projekt ohne Budget wird als ungeprueft gemeldet', () => {
  const h = fixpreisHinweise(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN));
  assert.ok(h.some((x) => /Ohne Budget/.test(x)), 'der Projektname muss im Hinweis stehen');
});

test('ohne Satz meldet der Lohn-Hinweis das fehlende Stueck', () => {
  const h = lohnHinweise(baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN));
  assert.ok(h.length > 0, 'es muss einen Hinweis geben');
});

test('ein unlesbarer Satz wird wie kein Satz behandelt, nicht wie 0 Euro Lohn', () => {
  const k = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 'weiss nicht' });
  assert.equal(summeKalk(k).lohnkostenAngesetzt, false);
  const k0 = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: 0 });
  assert.equal(summeKalk(k0).lohnkostenAngesetzt, false);
});

test('der deutsche Zahltext wird als Satz verstanden', () => {
  const k = baueKalkulation(PROJEKTE, LEISTUNGEN, KOSTEN, { selbstkostenJeStunde: '42,50' });
  assert.equal(summeKalk(k).lohnkosten, 120 * 42.5);
});
