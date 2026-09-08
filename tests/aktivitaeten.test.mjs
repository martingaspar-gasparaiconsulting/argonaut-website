import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTEN, ERGEBNISSE, istArt, istErgebnis, artLabel, ergebnisInfo,
  berlinTag, zaehle, vomTag, tagesreihe, quoten, zielStand, tagesSatz,
  aufwandFuerTermine,
} from '../out/aktivitaeten.js';

const A = (ergebnis, erstellt_am, art = 'anruf') => ({ art, ergebnis, erstellt_am });

test('Arten und Ergebnisse sind vollständig und eindeutig', () => {
  assert.equal(ARTEN.length, 4);
  assert.equal(ERGEBNISSE.length, 4);
  const s = new Set(ARTEN.map((a) => a.schluessel));
  assert.equal(s.size, 4);
  assert.equal(istArt('anruf'), true);
  assert.equal(istArt('brieftaube'), false);
  assert.equal(istErgebnis('termin'), true);
  assert.equal(istErgebnis(null), false);
});

test('Beschriftungen fallen nie auf leer zurück', () => {
  assert.equal(artLabel('besuch'), 'Besuch');
  assert.equal(artLabel('quatsch'), 'Aktivität');
  assert.equal(ergebnisInfo('termin').label, 'Termin vereinbart');
  assert.equal(ergebnisInfo(undefined).label, 'Unbekannt');
  assert.match(ergebnisInfo(undefined).farbe, /^#/);
});

test('berlinTag: Sommerzeit — 23:30 UTC ist schon der nächste Tag', () => {
  assert.equal(berlinTag('2026-07-01T23:30:00Z'), '2026-07-02');
  assert.equal(berlinTag('2026-07-01T21:30:00Z'), '2026-07-01');
  assert.equal(berlinTag('Unsinn'), '');
  assert.equal(berlinTag(null), '');
});

test('berlinTag: Winterzeit — 23:30 UTC bleibt derselbe Tag ist falsch, +1h zählt', () => {
  // 31.12. 23:30 UTC = 01.01. 00:30 Berlin
  assert.equal(berlinTag('2025-12-31T23:30:00Z'), '2026-01-01');
});

test('zaehle: Termin und Absage zählen als Gespräch', () => {
  const z = zaehle([
    A('kein_kontakt', '2026-09-07T08:00:00Z'),
    A('gesprochen', '2026-09-07T09:00:00Z'),
    A('termin', '2026-09-07T10:00:00Z'),
    A('absage', '2026-09-07T11:00:00Z'),
  ]);
  assert.deepEqual(z, { gesamt: 4, gespraeche: 3, termine: 1, absagen: 1 });
});

test('zaehle: leer und null geben Nullen statt zu krachen', () => {
  assert.deepEqual(zaehle(null), { gesamt: 0, gespraeche: 0, termine: 0, absagen: 0 });
  assert.deepEqual(zaehle([]), { gesamt: 0, gespraeche: 0, termine: 0, absagen: 0 });
});

test('vomTag filtert nach Berliner Kalendertag', () => {
  const rows = [
    A('gesprochen', '2026-09-06T23:30:00Z'), // = 07.09. Berlin
    A('termin', '2026-09-07T10:00:00Z'),
    A('gesprochen', '2026-09-05T10:00:00Z'),
  ];
  assert.equal(vomTag(rows, '2026-09-07').length, 2);
  assert.equal(vomTag(rows, '2026-09-05').length, 1);
  assert.equal(vomTag(null, '2026-09-07').length, 0);
});

test('tagesreihe: 14 Tage, ältester zuerst, heute zuletzt', () => {
  const reihe = tagesreihe([A('termin', '2026-09-07T10:00:00Z')], '2026-09-07T12:00:00Z');
  assert.equal(reihe.length, 14);
  assert.equal(reihe[13].tag, '2026-09-07');
  assert.equal(reihe[13].gesamt, 1);
  assert.equal(reihe[13].termine, 1);
  assert.equal(reihe[0].gesamt, 0);
  assert.equal(reihe[13].label, '07.09.');
});

test('tagesreihe: Länge bleibt in vernünftigen Grenzen', () => {
  assert.equal(tagesreihe([], '2026-09-07T12:00:00Z', 0).length, 1);
  assert.equal(tagesreihe([], '2026-09-07T12:00:00Z', 999).length, 90);
});

test('quoten: rechnen nur mit Grundlage, sonst null statt geraten', () => {
  const q = quoten({ gesamt: 20, gespraeche: 10, termine: 2, absagen: 3 });
  assert.equal(q.erreichbarkeit, 50);
  assert.equal(q.terminquote, 20);
  assert.equal(q.aktivitaetenJeTermin, 10);

  const leer = quoten({ gesamt: 0, gespraeche: 0, termine: 0, absagen: 0 });
  assert.equal(leer.erreichbarkeit, null);
  assert.equal(leer.terminquote, null);
  assert.equal(leer.aktivitaetenJeTermin, null);

  const ohneTermin = quoten({ gesamt: 30, gespraeche: 12, termine: 0, absagen: 4 });
  assert.equal(ohneTermin.terminquote, 0);
  assert.equal(ohneTermin.aktivitaetenJeTermin, null);
});

test('zielStand: ohne Ziel keine Ampel', () => {
  assert.equal(zielStand(12, 0).ampel, 'kein_ziel');
  assert.equal(zielStand(12, null).ampel, 'kein_ziel');
  assert.equal(zielStand(12, 'zwanzig').ampel, 'kein_ziel');
});

test('zielStand: offen, fast, erreicht', () => {
  assert.equal(zielStand(3, 20).ampel, 'offen');
  assert.equal(zielStand(14, 20).ampel, 'fast');
  assert.equal(zielStand(20, 20).ampel, 'erreicht');
  assert.equal(zielStand(25, 20).ampel, 'erreicht');
  assert.equal(zielStand(25, 20).prozent, 100);
  assert.equal(zielStand(5, 20).offen, 15);
  assert.equal(zielStand(25, 20).offen, 0);
});

test('tagesSatz: echte Umlaute, kein Tadel, kein erfundenes Ziel', () => {
  assert.match(tagesSatz(0, 0), /Noch nichts erfasst/);
  assert.match(tagesSatz(7, 0), /Tagesziel/);
  assert.match(tagesSatz(7, 0), /Aktivitäten/);
  assert.match(tagesSatz(20, 20), /erreicht/);
  assert.match(tagesSatz(5, 20), /noch 15/);
});

test('aufwandFuerTermine: die Brücke zum Termin-Wert-Rechner', () => {
  const q = quoten({ gesamt: 100, gespraeche: 40, termine: 5, absagen: 10 });
  assert.equal(q.aktivitaetenJeTermin, 20);
  assert.equal(aufwandFuerTermine(3, q), 60);
  assert.equal(aufwandFuerTermine(0, q), null);
  assert.equal(aufwandFuerTermine('drei', q), null);
  assert.equal(aufwandFuerTermine(3, quoten({ gesamt: 0, gespraeche: 0, termine: 0, absagen: 0 })), null);
});

test('aufwandFuerTermine rundet auf — halbe Anrufe gibt es nicht', () => {
  const q = quoten({ gesamt: 7, gespraeche: 4, termine: 2, absagen: 1 }); // 3.5 je Termin
  assert.equal(q.aktivitaetenJeTermin, 3.5);
  assert.equal(aufwandFuerTermine(3, q), 11);
});
